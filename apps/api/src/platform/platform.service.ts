import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
} from 'node:crypto';
import { verifyChain, type AuditEntry, type AuditEntryInput } from '../audit/audit-chain';
import { checkSeparationOfDuties } from '../auth/sod';
import {
  generateTotpSecret,
  hashPassword,
  hashToken,
  newSessionToken,
  verifyPassword,
  verifyTotp,
} from '../auth/credentials';
import { isAssignmentActive, type Role, type RoleAssignment } from '../auth/roles';
import {
  assertConfigEditable,
  assertRegisterEditable,
  assertTransition,
  type ElectionState,
} from '../elections/lifecycle';
import {
  importRows,
  parseRegisterCsv,
  registerHash,
  type VoterRecord,
} from '../register/csv-import';
import { OtpDelivery } from '../otp/otp-delivery';
import { InMemoryStore } from '../store/memory.store';
import { StoreError, StoreErrorCode } from '../store/types';
import type {
  AcceptBallotResult,
  BallotRecord,
  BallotSession,
  Candidate,
  Certification,
  Election,
  Entitlement,
  Organization,
  PlatformStore,
  Position,
  TallyRun,
  User,
} from '../store/types';

export type {
  BallotRecord, BallotSession, Candidate, Certification, Election, Entitlement,
  Organization, Position, TallyRun, User,
};

const PRIVILEGED: Role[] = [
  'platform_admin', 'organization_owner', 'auditor',
];

// States that must be reached through their dedicated multi-party workflows,
// never through the generic lifecycle transition endpoint.
const DEDICATED_TRANSITIONS = new Set<ElectionState>([
  'CLOSED', 'TALLIED', 'VERIFIED', 'RECOUNT', 'CERTIFIED', 'PUBLISHED',
]);

// Oversight roles allowed to witness/approve tally and certification. The
// owner executes; auditors provide the independent check.
const TALLY_APPROVER_ROLES = new Set<Role>([
  'organization_owner', 'auditor',
]);
const CERTIFICATION_APPROVER_ROLES = new Set<Role>([
  'auditor',
]);

const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_COOLDOWN_MS = 60_000;

/**
 * Platform workflows. All persistence goes through PlatformStore —
 * PostgresStore in production (durable, transactional), InMemoryStore for
 * tests/dev. Every mutating operation writes a hash-chained audit record;
 * ballot acceptance is atomic inside the store (SEC-VOT-02/04/05).
 */
@Injectable()
export class PlatformService {
  constructor(
    readonly store: PlatformStore = new InMemoryStore(),
    private readonly otpDelivery: OtpDelivery = new OtpDelivery(),
  ) {}

  private async log(organizationId: string | null, actorId: string | null, action: string, scope: string, outcome: string): Promise<void> {
    await this.store.appendAudit({
      organizationId, actorId, action, scope, outcome,
      createdAt: new Date().toISOString(),
    });
  }

  async verifyAuditChain(): Promise<boolean> {
    return this.store.verifyAuditChain();
  }

  // ---- Organizations & users -------------------------------------------------

  async createOrganization(
    actorId: string | null,
    name: string,
    slug: string,
    admin?: { email: string; displayName: string; password: string; role?: Role },
  ): Promise<Organization & { adminEnrollment?: { userId: string; email: string; role: Role; totpSecret: string } }> {
    const org = await this.store.createOrganization(name, slug);
    await this.log(org.id, actorId, 'organization.create', `organization:${org.id}`, 'success');
    if (!admin) return org;
    // Optionally staff the tenant in the same call: same rules as
    // provisionTenantAdmin (provisionable roles only, MFA-enrolled, secret
    // returned once). A failure here leaves the org created but unstaffed —
    // identical to the two-step flow, recoverable via /platform provision.
    const role = admin.role ?? 'organization_owner';
    if (!PlatformService.PROVISIONABLE_ROLES.has(role)) {
      throw new Error(`FORBIDDEN: role ${role} cannot be provisioned at platform level`);
    }
    const user = await this.createUser(org.id, admin.email, admin.displayName, admin.password);
    await this.assignRole(actorId ?? 'bootstrap', org.id, user.id, role);
    await this.log(org.id, actorId, 'platform.provisionAdmin', `user:${user.id}`, `success:${role}`);
    return { ...org, adminEnrollment: { userId: user.id, email: user.email, role, totpSecret: user.totpSecret } };
  }

  async createUser(organizationId: string | null, email: string, displayName: string, password: string): Promise<Omit<User, 'passwordHash' | 'totpSecret'> & { totpSecret: string }> {
    if (password.length < 12) throw new Error('WEAK_PASSWORD: password must be at least 12 characters');
    if (organizationId && !(await this.store.getOrganization(organizationId))) throw new Error('NOT_FOUND: organization');
    // Email is the login identifier — duplicates make findUserByEmail ambiguous.
    if (await this.store.findUserByEmail(email)) throw new Error('EMAIL_EXISTS: a user with this email already exists');
    const totpSecret = generateTotpSecret();
    const user = await this.store.createUser({
      organizationId, email, displayName,
      passwordHash: hashPassword(password), totpSecret, mfaEnrolled: true,
    });
    await this.log(organizationId, user.id, 'user.create', `user:${user.id}`, 'success');
    // totpSecret is returned once, at enrollment, for the user's authenticator.
    return { id: user.id, organizationId, email, displayName, mfaEnrolled: true, totpSecret };
  }

  async login(email: string, password: string, totp?: string): Promise<{
    token: string; userId: string; organizationId: string | null;
    assignments: { role: Role; organizationId: string; electionId: string | null }[];
  }> {
    const lockKey = email.toLowerCase();
    const lock = loginFailures.get(lockKey);
    if (lock && lock.lockedUntil > Date.now()) {
      throw new Error('AUTH_LOCKED: too many failed attempts; try again later (SEC-IAM-07)');
    }
    const user = await this.store.findUserByEmail(email);
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      const entry = loginFailures.get(lockKey) ?? { count: 0, lockedUntil: 0 };
      entry.count += 1;
      if (entry.count >= 8) entry.lockedUntil = Date.now() + 5 * 60_000;
      loginFailures.set(lockKey, entry);
      throw new Error('AUTH_FAILED: invalid email or password');
    }
    loginFailures.delete(lockKey);
    const assignments = (await this.store.listAssignments()).filter((a) => a.userId === user.id);
    const isPrivileged = assignments.some((a) => PRIVILEGED.includes(a.role));
    // Privileged users must present MFA (FR-IAM-001).
    if (isPrivileged) {
      if (!totp) throw new Error('MFA_REQUIRED: privileged accounts require a TOTP code');
      if (!user.totpSecret || !verifyTotp(user.totpSecret, totp)) {
        await this.log(user.organizationId, user.id, 'auth.login', `user:${user.id}`, 'mfa_failed');
        throw new Error('AUTH_FAILED: invalid MFA code');
      }
    }
    const { token, tokenHash } = newSessionToken();
    await this.store.createSession(user.id, tokenHash, Date.now() + 8 * 3600_000);
    await this.log(user.organizationId, user.id, 'auth.login', `user:${user.id}`, 'success');
    return {
      token, userId: user.id, organizationId: user.organizationId,
      assignments: assignments.map((a) => ({
        role: a.role, organizationId: a.organizationId,
        electionId: a.electionId ?? null,
      })),
    };
  }

  /** Revoke the caller's session token server-side (sessions.revokedAt). */
  async logout(token: string): Promise<void> {
    await this.store.revokeSession(hashToken(token));
  }

  /** Resolve a bearer session token to a principal (user + tenant + roles). */
  async principalForToken(token: string): Promise<{
    userId: string; email: string; displayName: string;
    organizationId: string | null; assignments: (RoleAssignment & { userId: string })[];
  } | null> {
    const session = await this.store.findSession(hashToken(token));
    if (!session) return null;
    const user = await this.store.findUser(session.userId);
    if (!user) return null;
    const assignments = (await this.store.listAssignments()).filter((a) => a.userId === user.id);
    return {
      userId: user.id, email: user.email, displayName: user.displayName,
      organizationId: user.organizationId, assignments,
    };
  }

  /**
   * True while no role has been assigned yet — the first-run bootstrap
   * window. Organization/user creation and the first role assignments are
   * allowed anonymously during this window only; it closes as soon as the
   * first role exists (F-03).
   */
  async isBootstrap(): Promise<boolean> {
    return (await this.store.listAssignments()).length === 0;
  }

  /** Org-scoped user list for administration — never returns secrets. */
  async listUsers(organizationId: string): Promise<
    { id: string; email: string; displayName: string; mfaEnrolled: boolean }[]
  > {
    const users = await this.store.listUsers(organizationId);
    return users.map((u) => ({
      id: u.id, email: u.email, displayName: u.displayName, mfaEnrolled: u.mfaEnrolled,
    }));
  }

  /** Voter register rows for an election (admin review; PII — register.manage only). */
  async listVoters(electionId: string): Promise<
    { id: string; memberId: string; fullName: string; status: string; statusReason: string | null }[]
  > {
    const voters = await this.store.listVoters(electionId);
    return voters.map((v) => ({
      id: v.id, memberId: v.memberId, fullName: v.fullName,
      status: v.status, statusReason: v.statusReason,
    }));
  }

  /** Assign a role with SoD enforcement; attempts are audited (SoD-9). */
  async assignRole(
    actorId: string,
    organizationId: string,
    userId: string,
    role: Role,
    electionId: string | null = null,
  ): Promise<RoleAssignment> {
    const user = await this.store.findUser(userId);
    if (!user) throw new Error('NOT_FOUND: user');
    // Scope references must point inside the target organization — a scoped
    // assignment to another tenant's election would leak capabilities.
    if (electionId) {
      const election = await this.store.getElection(electionId);
      if (!election || election.organizationId !== organizationId) {
        await this.log(organizationId, actorId, 'role.assign', `user:${userId}`, 'denied:election_scope');
        throw new Error('FORBIDDEN: election does not belong to this organization');
      }
    }
    // platform_admin holds platform-scoped capabilities (organization.create,
    // audit.read) — granting it is itself a privileged act. Only an existing
    // platform_admin may delegate it; during first-run bootstrap (zero
    // assignments) it may be seeded anonymously.
    if (role === 'platform_admin' && !(await this.isBootstrap())) {
      const actorIsPlatformAdmin = (await this.store.listAssignments())
        .some((a) => a.userId === actorId && a.role === 'platform_admin');
      if (!actorIsPlatformAdmin) {
        await this.log(organizationId, actorId, 'role.assign', `user:${userId}`, 'denied:platform_admin_requires_platform_admin');
        throw new Error('FORBIDDEN: only platform_admin may assign the platform_admin role');
      }
    }
    const existingForUser = (await this.store.listAssignments()).filter((a) => a.userId === userId);
    const candidate: RoleAssignment & { userId: string } = { role, organizationId, electionId, userId };
    const violations = checkSeparationOfDuties(existingForUser, {
      ...candidate,
      isPlatformAdmin: existingForUser.some((a) => a.role === 'platform_admin') || role === 'platform_admin',
    });
    if (violations.length > 0) {
      await this.log(organizationId, actorId, 'role.assign', `user:${userId}`, `denied:${violations.map((v) => v.rule).join(',')}`);
      throw new Error(`SOD_VIOLATION: ${violations.map((v) => `${v.rule} ${v.message}`).join(' ')}`);
    }
    await this.store.addAssignment(candidate);
    await this.log(organizationId, actorId, 'role.assign', `user:${userId}`, `success:${role}`);
    return candidate;
  }

  // ---- Elections ---------------------------------------------------------------

  /**
   * Public election discovery for voters: given an organization slug, return
   * the minimal public fields of elections that have reached a voter-visible
   * state. Draft/configuration/registration states are never exposed.
   */
  async publicElections(slug: string): Promise<{
    id: string; name: string; state: ElectionState;
    votingOpensAt: string | null; votingClosesAt: string | null;
  }[]> {
    const org = await this.store.getOrganizationBySlug(slug);
    if (!org) throw new Error('NOT_FOUND: organization');
    const VOTER_VISIBLE = new Set<ElectionState>([
      'READY', 'OPEN', 'SUSPENDED', 'CLOSED', 'TALLIED', 'VERIFIED',
      'RECOUNT', 'CERTIFIED', 'PUBLISHED', 'ARCHIVED',
    ]);
    const elections = await this.store.listElections(org.id);
    return elections
      .filter((e) => VOTER_VISIBLE.has(e.state))
      .map((e) => ({
        id: e.id, name: e.name, state: e.state,
        votingOpensAt: e.votingOpensAt, votingClosesAt: e.votingClosesAt,
      }));
  }

  async createElection(actorId: string, organizationId: string, input: {
    name: string; description?: string; votingOpensAt?: string; votingClosesAt?: string; ballotOrderPolicy?: string;
  }): Promise<Election> {
    if (!(await this.store.getOrganization(organizationId))) throw new Error('NOT_FOUND: organization');
    const election: Election = {
      id: randomUUID(), organizationId, name: input.name,
      description: input.description ?? null, state: 'DRAFT', timezone: 'Africa/Monrovia',
      votingOpensAt: input.votingOpensAt ?? null, votingClosesAt: input.votingClosesAt ?? null,
      ballotOrderPolicy: input.ballotOrderPolicy ?? 'fixed', registerHash: null,
    };
    await this.store.createElection(election);
    await this.log(organizationId, actorId, 'election.create', `election:${election.id}`, 'success');
    return election;
  }

  private async electionOrThrow(electionId: string): Promise<Election> {
    const e = await this.store.getElection(electionId);
    if (!e) throw new Error('NOT_FOUND: election');
    return e;
  }

  async addPosition(actorId: string, electionId: string, title: string, seats = 1, maxChoices = 1): Promise<Position> {
    const election = await this.electionOrThrow(electionId);
    assertConfigEditable(election.state);
    const position: Position = { id: randomUUID(), electionId, title, seats, maxChoices, allowAbstain: true };
    await this.store.addPosition(position);
    await this.log(election.organizationId, actorId, 'position.create', `election:${electionId}`, 'success');
    return position;
  }

  async addCandidate(actorId: string, electionId: string, positionId: string, fullName: string, statement?: string): Promise<Candidate> {
    const election = await this.electionOrThrow(electionId);
    assertConfigEditable(election.state);
    const position = await this.store.getPosition(positionId);
    if (!position || position.electionId !== electionId) throw new Error('NOT_FOUND: position');
    const candidate: Candidate = { id: randomUUID(), positionId, fullName, statement: statement ?? null, withdrawnAt: null };
    await this.store.addCandidate(candidate);
    await this.log(election.organizationId, actorId, 'candidate.create', `election:${electionId}`, 'success');
    return candidate;
  }

  async transition(actorId: string, electionId: string, to: ElectionState): Promise<Election> {
    const election = await this.electionOrThrow(electionId);
    assertTransition(election.state, to);
    if (DEDICATED_TRANSITIONS.has(to)) {
      throw new Error(`INVALID_TRANSITION: ${to} must be reached through its dedicated workflow`);
    }
    if (to === 'CONFIGURED') {
      const positions = await this.store.listPositions(electionId);
      if (positions.length === 0) throw new Error('PRECONDITION: at least one position is required (T1)');
      const candidates = await this.store.listCandidates();
      const hasCandidate = candidates.some((c) => positions.some((p) => p.id === c.positionId));
      if (!hasCandidate) throw new Error('PRECONDITION: at least one candidate is required (T1)');
      if (!election.votingOpensAt || !election.votingClosesAt) {
        throw new Error('PRECONDITION: voting window must be set (T1)');
      }
    }
    if (to === 'READY') {
      if (election.state !== 'REGISTER_FROZEN') throw new Error('PRECONDITION: register must be frozen (T4)');
    }
    if (to === 'OPEN') await this.prepareKeys(election);
    await this.store.updateElection(electionId, { state: to });
    election.state = to;
    await this.log(election.organizationId, actorId, 'election.transition', `election:${electionId}`, `success:${to}`);
    return election;
  }

  // ---- Register ------------------------------------------------------------------

  async importRegister(actorId: string, electionId: string, csvText: string) {
    const election = await this.electionOrThrow(electionId);
    assertRegisterEditable(election.state);
    const { rows, errors } = parseRegisterCsv(csvText);
    const existing = await this.store.listVoters(electionId);
    const result = importRows(electionId, rows, errors, existing);
    const entitlements: Entitlement[] = result.imported.map((voter) => ({
      id: randomUUID(), electionId, voterRecordId: voter.id, consumedAt: null, receiptId: null,
    }));
    await this.store.insertRegisterBatch([...result.imported, ...result.duplicates], entitlements);
    await this.log(election.organizationId, actorId, 'register.import', `election:${electionId}`,
      `success:eligible=${result.imported.length},duplicates=${result.duplicates.length},errors=${result.errors.length}`);
    return {
      eligible: result.imported.length,
      duplicates: result.duplicates.length,
      errors: result.errors,
    };
  }

  async resolveDuplicate(actorId: string, electionId: string, voterId: string, decision: 'eligible' | 'ineligible'): Promise<VoterRecord> {
    const election = await this.electionOrThrow(electionId);
    assertRegisterEditable(election.state);
    const voter = await this.store.getVoter(voterId);
    if (!voter || voter.electionId !== electionId) throw new Error('NOT_FOUND: voter record');
    if (voter.status !== 'duplicate_unresolved') throw new Error(`INVALID_STATE: record is ${voter.status}`);
    await this.store.resolveDuplicateVoter(
      voterId, decision, `Duplicate resolved by registrar: ${decision}`,
      decision === 'eligible'
        ? { id: randomUUID(), electionId, voterRecordId: voter.id, consumedAt: null, receiptId: null }
        : null,
    );
    await this.log(election.organizationId, actorId, 'register.resolveDuplicate', `election:${electionId}`, `success:${decision}`);
    voter.status = decision;
    voter.statusReason = `Duplicate resolved by registrar: ${decision}`;
    return voter;
  }

  async freezeRegister(actorId: string, electionId: string): Promise<Election> {
    const election = await this.electionOrThrow(electionId);
    if (election.state !== 'REGISTRATION') {
      throw new Error(`INVALID_STATE: freeze requires REGISTRATION, current ${election.state}`);
    }
    const records = await this.store.listVoters(electionId);
    const unresolved = records.filter((v) => v.status === 'duplicate_unresolved');
    if (unresolved.length > 0) {
      throw new Error(`PRECONDITION: ${unresolved.length} duplicate records unresolved (T3)`);
    }
    const eligible = records.filter((v) => v.status === 'eligible');
    const entitlements = await this.store.listEntitlements(electionId);
    if (entitlements.length !== eligible.length) {
      throw new Error(`RECONCILIATION: entitlements (${entitlements.length}) != eligible voters (${eligible.length})`);
    }
    const hash = registerHash(records);
    await this.store.updateElection(electionId, { registerHash: hash, state: 'REGISTER_FROZEN' });
    election.registerHash = hash;
    election.state = 'REGISTER_FROZEN';
    await this.log(election.organizationId, actorId, 'register.freeze', `election:${electionId}`,
      `success:eligible=${eligible.length},hash=${hash}`);
    return election;
  }

  async registerStats(electionId: string) {
    const records = await this.store.listVoters(electionId);
    const entitlements = await this.store.listEntitlements(electionId);
    return {
      total: records.length,
      eligible: records.filter((v) => v.status === 'eligible').length,
      duplicatesUnresolved: records.filter((v) => v.status === 'duplicate_unresolved').length,
      entitlements: entitlements.length,
    };
  }

  // ---- Phase 3: stations, voting, tally, certification -------------------------
  // Implemented per EMP-PROTO-001 Option C (sealed encrypted store) for the
  // mock election. NOT production-approved: threshold custody and the
  // reviewed protocol remain DEC-006 hold points (see PHASE_3 plan §3).

  /** Org-scoped election list for admin consoles — all lifecycle states. */
  async listOrgElections(organizationId: string): Promise<{
    id: string; name: string; state: ElectionState;
    votingOpensAt: string | null; votingClosesAt: string | null;
  }[]> {
    if (!(await this.store.getOrganization(organizationId))) throw new Error('NOT_FOUND: organization');
    const elections = await this.store.listElections(organizationId);
    return elections.map((e) => ({
      id: e.id, name: e.name, state: e.state,
      votingOpensAt: e.votingOpensAt, votingClosesAt: e.votingClosesAt,
    }));
  }

  private async eligibleVoter(electionId: string, memberId: string): Promise<VoterRecord> {
    const voter = await this.store.findVoterByMemberId(electionId, memberId);
    if (!voter) throw new Error('NOT_ELIGIBLE: voter is not on the register for this election');
    if (voter.status !== 'eligible') throw new Error(`NOT_ELIGIBLE: voter status is ${voter.status}`);
    return voter;
  }

  private async entitlementFor(electionId: string, voterId: string): Promise<Entitlement> {
    const ent = await this.store.findEntitlement(electionId, voterId);
    if (!ent) throw new Error('NOT_ELIGIBLE: no entitlement for this voter');
    return ent;
  }

  /** Voting is allowed only while OPEN and inside the configured window. */
  private assertVotingWindow(election: Election): void {
    if (election.state !== 'OPEN') throw new Error(`ELECTION_NOT_OPEN: state is ${election.state}`);
    const now = Date.now();
    if (election.votingOpensAt && new Date(election.votingOpensAt).getTime() > now) {
      throw new Error('ELECTION_NOT_OPEN: voting has not opened yet');
    }
    if (election.votingClosesAt && new Date(election.votingClosesAt).getTime() < now) {
      throw new Error('ELECTION_NOT_OPEN: voting window has closed (FR-VTG-010)');
    }
  }

  /** DEC-004: request a one-time code for Member ID + OTP voting. */
  async requestOtp(electionId: string, memberId: string): Promise<{ sent: true; devCode?: string; channel?: string }> {
    const election = await this.electionOrThrow(electionId);
    this.assertVotingWindow(election);
    // Per-voter OTP throttling, not per-IP (shared-network NAT, SCALE s.5.5).
    const throttleKey = `${electionId}:${memberId.toLowerCase()}`;
    const now = Date.now();
    const recent = (otpRequestLog.get(throttleKey) ?? []).filter((t) => now - t < 10 * 60_000);
    if (recent.length >= 5) throw new Error('OTP_RATE_LIMITED: too many code requests; wait before trying again');
    recent.push(now);
    otpRequestLog.set(throttleKey, recent);
    const voter = await this.eligibleVoter(electionId, memberId);
    const challengeKey = `${electionId}:${voter.id}`;
    const existing = await this.store.getOtpChallenge(challengeKey);
    const existingActive = existing && existing.expiresAt > Date.now();
    // Resend cooldown: do not overwrite a still-valid challenge. The voter can
    // keep using the code already delivered; abuse is limited to one new code
    // per cooldown window while the per-voter throttle still counts requests.
    if (existingActive && existing.attempts === 0) {
      const issuedAt = existing.expiresAt - OTP_TTL_MS;
      if (Date.now() - issuedAt < OTP_RESEND_COOLDOWN_MS) {
        await this.log(election.organizationId, null, 'voting.otpRequest', `election:${electionId}`, 'success:cooldown');
        return { sent: true, channel: 'cooldown' };
      }
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.store.upsertOtpChallenge({
      key: challengeKey,
      voterId: voter.id, electionId,
      codeHash: createHash('sha256').update(code).digest('hex'),
      expiresAt: Date.now() + OTP_TTL_MS, attempts: 0,
    });
    // Delivered via env-configured providers (DEC-004 §3); the dev outbox —
    // and the returned devCode — exist only outside production (F-04).
    const channel = await this.otpDelivery.deliver({
      electionId, memberId, code, email: voter.email || undefined, phone: voter.phone || undefined,
    });
    await this.log(election.organizationId, null, 'voting.otpRequest', `election:${electionId}`, `success:${channel}`);
    return channel === 'dev' ? { sent: true, devCode: code, channel } : { sent: true, channel };
  }

  private async openBallotSession(voter: VoterRecord, electionId: string, channel: 'online'): Promise<string> {
    const entitlement = await this.entitlementFor(electionId, voter.id);
    const token = randomBytes(32).toString('base64url');
    await this.store.createBallotSession(hashToken(token), {
      voterId: voter.id, electionId, entitlementId: entitlement.id,
      expiresAt: Date.now() + 30 * 60_000, channel,
    });
    return token;
  }

  async verifyOtp(electionId: string, memberId: string, code: string): Promise<{ ballotSession: string }> {
    const election = await this.electionOrThrow(electionId);
    this.assertVotingWindow(election);
    const voter = await this.eligibleVoter(electionId, memberId);
    const key = `${electionId}:${voter.id}`;
    const verifyKey = `${electionId}:${memberId.toLowerCase()}`;
    const now = Date.now();
    const failures = (otpVerifyFailures.get(verifyKey) ?? []).filter((t) => now - t < 10 * 60_000);
    if (failures.length >= 10) {
      throw new Error('OTP_RATE_LIMITED: too many failed verification attempts; wait before trying again');
    }
    const codeHash = createHash('sha256').update(code.trim()).digest('hex');
    const result = await this.store.consumeOtpChallenge(key, codeHash, 5);
    if (result === 'missing' || result === 'expired') throw new Error('OTP_EXPIRED: request a new code');
    if (result === 'locked') {
      failures.push(Date.now());
      otpVerifyFailures.set(verifyKey, failures);
      throw new Error('OTP_LOCKED: too many attempts; request a new code');
    }
    if (result === 'invalid') {
      failures.push(Date.now());
      otpVerifyFailures.set(verifyKey, failures);
      throw new Error('OTP_INVALID: code does not match');
    }
    otpVerifyFailures.delete(verifyKey);
    return { ballotSession: await this.openBallotSession(voter, electionId, 'online') };
  }

  async ballotForSession(ballotSession: string) {
    const session = await this.sessionOrThrow(ballotSession);
    const election = await this.electionOrThrow(session.electionId);
    this.assertVotingWindow(election);
    const allCandidates = await this.store.listCandidates();
    const positions = (await this.store.listPositions(election.id)).map((p) => ({
      id: p.id, title: p.title, seats: p.seats, maxChoices: p.maxChoices, allowAbstain: p.allowAbstain,
      candidates: allCandidates
        .filter((c) => c.positionId === p.id && !c.withdrawnAt)
        .map((c) => ({ id: c.id, fullName: c.fullName, statement: c.statement })),
    }));
    return { election: { id: election.id, name: election.name }, positions };
  }

  private async sessionOrThrow(ballotSession: string): Promise<BallotSession> {
    const session = await this.store.getBallotSession(hashToken(ballotSession));
    if (!session) throw new Error('SESSION_INVALID: ballot session expired; sign in again');
    return session;
  }

  /**
   * Atomic ballot acceptance (SEC-VOT-02/04/05). The store performs the
   * check-consume-store inside one transaction with an entitlement row
   * lock; in Postgres this is the only path that writes a ballot (EMP-ARCH §8).
   */
  async submitBallot(ballotSession: string, selections: Record<string, string[]>, idempotencyKey: string): Promise<AcceptBallotResult> {
    const session = await this.sessionOrThrow(ballotSession);
    const election = await this.electionOrThrow(session.electionId);
    this.assertVotingWindow(election);

    // Structural validation against election rules (SEC-VOT-06).
    const normalized: Record<string, string[]> = {};
    const positions = await this.store.listPositions(election.id);
    const allCandidates = await this.store.listCandidates();
    for (const position of positions) {
      const chosen = selections[position.id] ?? [];
      if (chosen.length > position.maxChoices) {
        throw new Error(`INVALID_BALLOT: position ${position.title} allows at most ${position.maxChoices} choice(s)`);
      }
      for (const candidateId of chosen) {
        const cand = allCandidates.find((c) => c.id === candidateId);
        if (!cand || cand.positionId !== position.id || cand.withdrawnAt) {
          throw new Error('INVALID_BALLOT: candidate does not belong to this position');
        }
      }
      normalized[position.id] = [...chosen];
    }

    // Encrypt under the election key (AES-256-GCM, standard construction).
    const key = await this.store.getOrCreateElectionKey(election.id);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(normalized), 'utf8'), cipher.final()]);
    const ballot: BallotRecord = {
      id: randomUUID(), electionId: election.id,
      ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertextHash: createHash('sha256').update(ciphertext).digest('hex'),
      coarseTimestamp: new Date().toISOString().slice(0, 16), // minute bucket
    };

    const receiptId = randomUUID();
    try {
      const result = await this.store.acceptBallot({
        electionId: election.id,
        entitlementId: session.entitlementId,
        voterId: session.voterId,
        channel: session.channel,
        idempotencyKey,
        receiptId,
        ballot,
        audit: {
          organizationId: election.organizationId, actorId: null,
          action: 'ballot.accept', scope: `election:${election.id}`,
          outcome: 'success',
          createdAt: new Date().toISOString(),
        },
      });
      await this.store.deleteBallotSession(hashToken(ballotSession));
      return result;
    } catch (err) {
      if (err instanceof StoreError) {
        if (err.code === StoreErrorCode.ALREADY_VOTED) throw new Error('ALREADY_VOTED: entitlement already consumed');
        throw new Error('NOT_ELIGIBLE: no entitlement for this voter');
      }
      throw err;
    }
  }

  async submissionStatus(electionId: string, memberId: string): Promise<{ hasVoted: boolean }> {
    const voter = await this.eligibleVoter(electionId, memberId);
    const entitlement = await this.store.findEntitlement(electionId, voter.id);
    return { hasVoted: Boolean(entitlement?.consumedAt) };
  }

  /** Status is only revealed to a caller holding a live ballot session. */
  async submissionStatusForSession(electionId: string, ballotSession: string): Promise<{ hasVoted: boolean }> {
    const session = await this.sessionOrThrow(ballotSession);
    if (session.electionId !== electionId) throw new Error('SESSION_INVALID: ballot session does not match this election');
    const entitlement = await this.store.getEntitlement(session.entitlementId);
    return { hasVoted: Boolean(entitlement?.consumedAt) };
  }

  async participation(electionId: string) {
    const eligible = await this.store.countEligibleVoters(electionId);
    const ballotsCast = await this.store.countBallots(electionId);
    // Aggregate only (FR-MON-001/002): no selections, no voter identities.
    return { eligible, ballotsCast, turnoutPercent: eligible ? Math.round((ballotsCast / eligible) * 1000) / 10 : 0 };
  }

  private async prepareKeys(election: Election): Promise<void> {
    if (!(await this.store.hasElectionKey(election.id))) {
      // Mock custody: single service-held key, tally gated by multi-party
      // approvals below. Production threshold custody is DEC-006 (hold point).
      await this.store.getOrCreateElectionKey(election.id);
      await this.log(election.organizationId, null, 'keys.prepare', `election:${election.id}`, 'success:mock-single-key');
    }
  }

  async closeElection(actorId: string, electionId: string) {
    const election = await this.electionOrThrow(electionId);
    assertTransition(election.state, 'CLOSED');
    await this.store.updateElection(electionId, { state: 'CLOSED' });
    election.state = 'CLOSED';
    const entitlements = await this.store.listEntitlements(electionId);
    const consumed = entitlements.filter((e) => e.consumedAt).length;
    const ballotsCast = await this.store.countBallots(electionId);
    await this.log(election.organizationId, actorId, 'election.close', `election:${electionId}`,
      `success:consumed=${consumed},ballots=${ballotsCast}`);
    return { state: election.state, consumedEntitlements: consumed, ballotsCast, reconciled: consumed === ballotsCast };
  }

  private async decryptBallot(ballot: BallotRecord, key: Buffer): Promise<Record<string, string[]>> {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ballot.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(ballot.authTag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(ballot.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as Record<string, string[]>;
  }

  /** Pure tally computation — decrypts and counts without persisting a run. */
  private async computeTally(election: Election): Promise<Omit<TallyRun, 'id' | 'authorizedBy' | 'executedBy' | 'approvers' | 'createdAt'>> {
    const key = await this.store.getOrCreateElectionKey(election.id);
    const ballots = await this.store.listBallots(election.id);
    const counts: Record<string, number> = {};
    for (const ballot of ballots) {
      const selections = await this.decryptBallot(ballot, key);
      for (const [positionId, chosen] of Object.entries(selections)) {
        if (chosen.length === 0) counts[`abstain:${positionId}`] = (counts[`abstain:${positionId}`] ?? 0) + 1;
        for (const candidateId of chosen) counts[candidateId] = (counts[candidateId] ?? 0) + 1;
      }
    }
    const evidenceRoot = createHash('sha256').update(ballots.map((b) => b.ciphertextHash).sort().join('\n')).digest('hex');
    const tallyHash = createHash('sha256')
      .update(JSON.stringify({ counts, ballotCount: ballots.length, evidenceRoot }))
      .digest('hex');
    return { electionId: election.id, ballotCount: ballots.length, counts, evidenceRoot, tallyHash };
  }

  private async assertElectionParticipant(
    userId: string,
    election: Election,
    allowedRoles: Set<Role>,
    label: string,
    assignments: (RoleAssignment & { userId: string })[],
  ): Promise<void> {
    const user = await this.store.findUser(userId);
    if (!user || user.organizationId !== election.organizationId) {
      throw new Error(`FORBIDDEN: ${label} is not a member of this organization`);
    }
    const ok = assignments.some(
      (a) => a.userId === userId &&
        a.organizationId === election.organizationId &&
        isAssignmentActive(a) &&
        allowedRoles.has(a.role) &&
        (!a.electionId || a.electionId === election.id),
    );
    if (!ok) {
      throw new Error(`FORBIDDEN: ${label} must hold an election oversight role for this election`);
    }
  }

  /** Multi-party tally (SoD-4/5): owner authorizes, executor differs, 2+ approvers incl. an auditor. */
  async tally(actorId: string, electionId: string, input: { authorizedBy: string; approvers: string[] }): Promise<TallyRun> {
    const election = await this.electionOrThrow(electionId);
    if (election.state !== 'CLOSED' && election.state !== 'RECOUNT') {
      throw new Error(`INVALID_STATE: tally requires CLOSED or RECOUNT, current ${election.state}`);
    }
    const assignments = await this.store.listAssignments();
    const ownerOk = assignments.some(
      (a) => a.userId === input.authorizedBy &&
        a.role === 'organization_owner' &&
        a.organizationId === election.organizationId &&
        isAssignmentActive(a) &&
        (!a.electionId || a.electionId === election.id),
    );
    if (!ownerOk) throw new Error('FORBIDDEN: tally must be authorized by the organization owner (T9)');
    if (input.authorizedBy === actorId) throw new Error('SOD_VIOLATION: tally authorizer cannot execute the tally (SoD-5)');
    const approvers = [...new Set(input.approvers)];
    if (approvers.length < 2) throw new Error('PRECONDITION: tally requires at least two approvers (SoD-4)');
    if (approvers.includes(actorId) || approvers.includes(input.authorizedBy)) {
      throw new Error('SOD_VIOLATION: approvers must be separate from authorizer and executor (SoD-5)');
    }
    for (const approver of approvers) {
      await this.assertElectionParticipant(approver, election, TALLY_APPROVER_ROLES, 'tally approver', assignments);
    }
    // Independent check: at least one approver must be an auditor so the
    // owner-run tally is always co-signed by read-only oversight.
    const auditorApproved = approvers.some((id) => assignments.some(
      (a) => a.userId === id && a.role === 'auditor' &&
        a.organizationId === election.organizationId && isAssignmentActive(a) &&
        (!a.electionId || a.electionId === election.id),
    ));
    if (!auditorApproved) throw new Error('PRECONDITION: at least one tally approver must be an auditor');
    const computed = await this.computeTally(election);
    const run: TallyRun = {
      ...computed, id: randomUUID(), authorizedBy: input.authorizedBy,
      executedBy: actorId, approvers, createdAt: new Date().toISOString(),
    };
    // Tally run + state transition commit atomically (Postgres transaction).
    await this.store.recordTally(run, 'TALLIED');
    election.state = 'TALLIED';
    await this.log(election.organizationId, actorId, 'tally.execute', `election:${electionId}`, `success:ballots=${run.ballotCount},hash=${run.tallyHash}`);
    return run;
  }

  /** Independent verification: recompute from ciphertexts and compare. */
  async verifyTally(electionId: string) {
    const election = await this.electionOrThrow(electionId);
    const run = await this.store.latestTallyRun(electionId);
    if (!run) throw new Error('NOT_FOUND: tally run');
    // Separate recomputation path (fresh decryption + counting); does not
    // persist a new tally run.
    const recomputed = await this.computeTally(election);
    const matches = recomputed.tallyHash === run.tallyHash && recomputed.ballotCount === run.ballotCount;
    if (matches && election.state === 'TALLIED') {
      await this.store.updateElection(electionId, { state: 'VERIFIED' });
      election.state = 'VERIFIED';
      await this.log(election.organizationId, null, 'tally.verify', `election:${electionId}`, 'success:match');
    }
    return { verified: matches, tallyHash: run.tallyHash, ballotCount: run.ballotCount, evidenceRoot: run.evidenceRoot };
  }

  async recount(actorId: string, electionId: string, input: { authorizedBy: string; approvers: string[] }): Promise<TallyRun> {
    const election = await this.electionOrThrow(electionId);
    if (election.state !== 'TALLIED' && election.state !== 'VERIFIED') {
      throw new Error(`INVALID_STATE: recount requires TALLIED or VERIFIED, current ${election.state}`);
    }
    await this.store.updateElection(electionId, { state: 'RECOUNT' });
    election.state = 'RECOUNT';
    await this.log(election.organizationId, actorId, 'tally.recount', `election:${electionId}`, 'started');
    return this.tally(actorId, electionId, input);
  }

  /** Certification blocked by any unresolved item (EMP-LIFE-001 §9.1). */
  async certify(actorId: string, electionId: string, input: { certifiedBy: string; secondApprover: string }): Promise<Certification> {
    const election = await this.electionOrThrow(electionId);
    if (election.state !== 'VERIFIED') throw new Error(`INVALID_STATE: certification requires VERIFIED, current ${election.state}`);
    const entitlements = await this.store.listEntitlements(electionId);
    const consumed = entitlements.filter((e) => e.consumedAt).length;
    const ballotsCast = await this.store.countBallots(electionId);
    if (consumed !== ballotsCast) throw new Error('BLOCKER: accepted ballots do not reconcile with consumed entitlements (§9.1.1)');
    if (!(await this.verifyAuditChain())) throw new Error('BLOCKER: audit chain verification failed (§9.1.6)');
    const run = await this.store.latestTallyRun(electionId);
    if (!run) throw new Error('BLOCKER: no tally run (§9.1.2)');
    if (input.certifiedBy !== actorId) throw new Error('FORBIDDEN: certifiedBy must be the authenticated certifier');
    const assignments = await this.store.listAssignments();
    await this.assertElectionParticipant(input.certifiedBy, election, new Set<Role>(['organization_owner']), 'certifier', assignments);
    await this.assertElectionParticipant(input.secondApprover, election, CERTIFICATION_APPROVER_ROLES, 'second approver', assignments);
    if (run.executedBy === input.certifiedBy) throw new Error('SOD_VIOLATION: tally executor cannot certify (SoD-5)');
    if (input.certifiedBy === input.secondApprover) throw new Error('SOD_VIOLATION: certification needs a second, separate approver');
    const record: Certification = {
      electionId, certifiedBy: input.certifiedBy, secondApprover: input.secondApprover,
      tallyHash: run.tallyHash, createdAt: new Date().toISOString(),
    };
    // Certification record + CERTIFIED state commit atomically.
    await this.store.recordCertification(record);
    election.state = 'CERTIFIED';
    await this.log(election.organizationId, actorId, 'results.certify', `election:${electionId}`, `success:hash=${run.tallyHash}`);
    return record;
  }

  async publish(actorId: string, electionId: string) {
    const election = await this.electionOrThrow(electionId);
    assertTransition(election.state, 'PUBLISHED');
    await this.store.updateElection(electionId, { state: 'PUBLISHED' });
    election.state = 'PUBLISHED';
    await this.log(election.organizationId, actorId, 'results.publish', `election:${electionId}`, 'success');
    return this.report(electionId);
  }

  /** Structured election report (FR-RES-007/009). */
  async report(electionId: string) {
    const election = await this.electionOrThrow(electionId);
    const run = await this.store.latestTallyRun(electionId);
    const part = await this.participation(electionId);
    const allCandidates = await this.store.listCandidates();
    const positions = (await this.store.listPositions(electionId)).map((p) => ({
      position: p.title,
      seats: p.seats,
      abstentions: run?.counts[`abstain:${p.id}`] ?? 0,
      results: allCandidates
        .filter((c) => c.positionId === p.id)
        .map((c) => ({ candidate: c.fullName, votes: run?.counts[c.id] ?? 0 }))
        .sort((a, b) => b.votes - a.votes),
    }));
    const certification = await this.store.getCertification(electionId);
    return {
      election: { id: election.id, name: election.name, state: election.state },
      eligibleVoters: part.eligible,
      ballotsCast: part.ballotsCast,
      turnoutPercent: part.turnoutPercent,
      positions,
      tallyHash: run?.tallyHash ?? null,
      evidenceRoot: run?.evidenceRoot ?? null,
      certification: certification ?? null,
    };
  }

  async electionDetail(electionId: string) {
    const election = await this.electionOrThrow(electionId);
    const allCandidates = await this.store.listCandidates();
    const positions = (await this.store.listPositions(electionId)).map((p) => ({
      ...p,
      candidates: allCandidates.filter((c) => c.positionId === p.id),
    }));
    return { ...election, positions, register: await this.registerStats(electionId) };
  }

  async auditEntries(organizationId?: string): Promise<AuditEntry[]> {
    return this.store.listAudit(organizationId);
  }

  // ---- Platform administration (control plane) ---------------------------------
  // These methods back the platform_admin portal. They are cross-tenant by
  // design and must only be reachable through platform-scoped capabilities.

  /** Roles whose presence means a tenant can actually operate elections. */
  private static readonly STAFFING_ROLES: ReadonlySet<Role> = new Set([
    'organization_owner',
  ]);

  /** Cross-tenant tenant directory: counts and states only, no user PII. */
  async listTenantDirectory(): Promise<{
    id: string; name: string; slug: string; createdAt: string;
    userCount: number; electionCount: number;
    electionsByState: Record<string, number>;
    staffed: boolean;
  }[]> {
    const [orgs, assignments] = await Promise.all([
      this.store.listOrganizations(), this.store.listAssignments(),
    ]);
    return Promise.all(orgs.map(async (org) => {
      const [users, elections] = await Promise.all([
        this.store.listUsers(org.id), this.store.listElections(org.id),
      ]);
      const byState: Record<string, number> = {};
      for (const e of elections) byState[e.state] = (byState[e.state] ?? 0) + 1;
      const staffed = assignments.some(
        (a) => a.organizationId === org.id && PlatformService.STAFFING_ROLES.has(a.role),
      );
      return {
        id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt,
        userCount: users.length, electionCount: elections.length,
        electionsByState: byState, staffed,
      };
    }));
  }

  /** Tenant detail for platform governance: users (sanitized), elections, role map. */
  async tenantDetail(organizationId: string) {
    const org = await this.store.getOrganization(organizationId);
    if (!org) throw new Error('NOT_FOUND: organization');
    const [users, elections, assignments] = await Promise.all([
      this.store.listUsers(organizationId),
      this.store.listElections(organizationId),
      this.store.listAssignments(),
    ]);
    return {
      ...org,
      users: users.map((u) => ({
        id: u.id, email: u.email, displayName: u.displayName, mfaEnrolled: u.mfaEnrolled,
      })),
      elections: elections.map((e) => ({
        id: e.id, name: e.name, state: e.state,
        votingOpensAt: e.votingOpensAt, votingClosesAt: e.votingClosesAt,
      })),
      roleAssignments: assignments
        .filter((a) => a.organizationId === organizationId)
        .map((a) => ({
          userId: a.userId, role: a.role, electionId: a.electionId ?? null,
        })),
    };
  }

  /**
   * Provision a staff account for an organization. Platform admins staff
   * tenants directly: the account is MFA-enrolled (secret returned once) and
   * the selected role is assigned — organization_owner by default, or any
   * tenant staff role optionally scoped to one election. platform_admin and
   * voter are deliberately not provisionable here (delegation and
   * non-staff respectively).
   */
  private static readonly PROVISIONABLE_ROLES: ReadonlySet<Role> = new Set([
    'organization_owner', 'auditor',
  ]);

  async provisionTenantAdmin(
    actorId: string,
    organizationId: string,
    input: { email: string; displayName: string; password: string; role?: Role; electionId?: string | null },
  ): Promise<{ userId: string; email: string; role: Role; totpSecret: string }> {
    const org = await this.store.getOrganization(organizationId);
    if (!org) throw new Error('NOT_FOUND: organization');
    const role = input.role ?? 'organization_owner';
    if (!PlatformService.PROVISIONABLE_ROLES.has(role)) {
      await this.log(organizationId, actorId, 'platform.provisionAdmin', `org:${organizationId}`, `denied:role:${role}`);
      throw new Error(`FORBIDDEN: role ${role} cannot be provisioned at platform level`);
    }
    const electionId = input.electionId ?? null;
    // Validate scope before creating the user so a bad electionId cannot
    // leave an orphan account behind (assignRole re-checks regardless).
    if (electionId) {
      const election = await this.store.getElection(electionId);
      if (!election || election.organizationId !== organizationId) {
        throw new Error('FORBIDDEN: election does not belong to this organization');
      }
    }
    const user = await this.createUser(organizationId, input.email, input.displayName, input.password);
    // assignRole validates that electionId belongs to this organization.
    await this.assignRole(actorId, organizationId, user.id, role, electionId);
    await this.log(organizationId, actorId, 'platform.provisionAdmin', `user:${user.id}`, `success:${role}${electionId ? `:${electionId}` : ''}`);
    return { userId: user.id, email: user.email, role, totpSecret: user.totpSecret };
  }

  /** Platform health snapshot for the ops dashboard. */
  async platformHealth() {
    const started = Date.now();
    await this.store.countUsers(); // exercises the DB connection
    const dbLatencyMs = Date.now() - started;
    const pendingAudit = await this.store.pendingAuditCount();
    return {
      store: this.store.storeKind,
      dbLatencyMs,
      pendingAuditEntries: pendingAudit,
      uptimeSeconds: Math.round(process.uptime()),
      otpProviders: this.otpDelivery.describe(),
      securitySignals: {
        loginFailureBuckets: loginFailures.size,
        lockedAccounts: [...loginFailures.values()].filter((l) => l.lockedUntil > Date.now()).length,
        otpRequestBuckets: otpRequestLog.size,
        otpVerifyFailureBuckets: otpVerifyFailures.size,
        scope: 'per-process; resets on restart',
      },
      fraud: {
        activeBlocks: await this.store.countActiveFraudBlocks(),
        events24h: await this.store.countFraudEventsSince(new Date(Date.now() - 24 * 3600_000).toISOString()),
      },
      checkedAt: new Date().toISOString(),
    };
  }

  // ---- anti-fraud review (SEC-VOT-10) ----
  // All fraud rows contain salted hashes only — safe to expose to auditors.

  async listFraudEvents(electionId: string) {
    await this.electionOrThrow(electionId);
    return this.store.listFraudEvents({ electionId, limit: 200 });
  }

  async listFraudBlocks() {
    return this.store.listActiveFraudBlocks();
  }

  async liftFraudBlock(actorId: string, blockId: string): Promise<{ lifted: true }> {
    const ok = await this.store.liftFraudBlock(blockId, actorId);
    if (!ok) throw new Error('NOT_FOUND: no active fraud block with that id');
    await this.log(null, actorId, 'fraud.blockLift', `fraudblock:${blockId}`, 'success');
    return { lifted: true };
  }
}

// Ephemeral, per-process rate-limit state. These are deliberately NOT
// persisted: login lockout and OTP request throttling are short-window
// abuse controls, and losing them on restart only widens the window
// slightly — never correctness (unlike ballots, F-01).
const loginFailures = new Map<string, { count: number; lockedUntil: number }>();
const otpRequestLog = new Map<string, number[]>();
const otpVerifyFailures = new Map<string, number[]>();
