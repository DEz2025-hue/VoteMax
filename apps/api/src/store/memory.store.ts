import { randomBytes, randomUUID } from 'node:crypto';
import { appendEntry, verifyChain, type AuditEntry } from '../audit/audit-chain';
import type { RoleAssignment } from '../auth/roles';
import type { VoterRecord } from '../register/csv-import';
import {
  StoreError,
  StoreErrorCode,
  type AcceptBallotInput,
  type AcceptBallotResult,
  type ApprovalKind,
  type ElectionApproval,
  type BallotRecord,
  type BallotSession,
  type Candidate,
  type Certification,
  type Election,
  type Entitlement,
  type FraudBlock,
  type FraudEvent,
  type FraudSignal,
  type FraudSignalFilter,
  type NewFraudBlock,
  type NotificationBatch,
  type LoginChallenge,
  type OtpChallenge,
  type OtpVerifyResult,
  type Organization,
  type PlatformStore,
  type Position,
  type Session,
  type TallyRun,
  type User,
} from './types';

/**
 * In-memory store for unit tests and local development without Postgres.
 * NOT durable - F-01. Production must run PostgresStore.
 */
export class InMemoryStore implements PlatformStore {
  readonly storeKind = 'memory' as const;
  readonly organizations = new Map<string, Organization>();
  readonly users = new Map<string, User>();
  readonly assignments: (RoleAssignment & { userId: string })[] = [];
  readonly elections = new Map<string, Election>();
  readonly positions = new Map<string, Position>();
  readonly candidates = new Map<string, Candidate>();
  readonly candidatePhotos = new Map<string, { mime: string; data: string }>();
  readonly voters: VoterRecord[] = [];
  readonly entitlements: Entitlement[] = [];
  readonly audit: AuditEntry[] = [];
  readonly sessions = new Map<string, Session>();
  private approvals: ElectionApproval[] = [];
  readonly ballots: BallotRecord[] = [];
  readonly tallyRuns: TallyRun[] = [];
  readonly certifications = new Map<string, Certification>();
  readonly otpChallenges = new Map<string, OtpChallenge & { key: string }>();
  readonly loginChallenges = new Map<string, LoginChallenge>();
  readonly ballotSessions = new Map<string, BallotSession>();
  readonly electionKeys = new Map<string, Buffer>();
  readonly fraudSignals: FraudSignal[] = [];
  readonly fraudEvents: FraudEvent[] = [];
  readonly fraudBlocks: FraudBlock[] = [];
  readonly notificationBatches: NotificationBatch[] = [];
  private idempotency = new Map<string, string>(); // `${entitlementId}:${key}` -> receiptId

  async createOrganization(name: string, slug: string): Promise<Organization> {
    const org: Organization = { id: randomUUID(), name, slug, createdAt: new Date().toISOString() };
    this.organizations.set(org.id, org);
    return org;
  }

  async getOrganization(id: string): Promise<Organization | null> {
    return this.organizations.get(id) ?? null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    return [...this.organizations.values()].find((o) => o.slug === slug) ?? null;
  }

  async listOrganizations(): Promise<Organization[]> {
    return [...this.organizations.values()];
  }

  async createUser(input: {
    organizationId: string | null; email: string; displayName: string;
    passwordHash: string | null; totpSecret: string | null; mfaEnrolled: boolean;
  }): Promise<User> {
    const user: User = { id: randomUUID(), ...input };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const needle = email.toLowerCase();
    return [...this.users.values()].find((u) => u.email.toLowerCase() === needle) ?? null;
  }

  async findUser(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async listUsers(organizationId: string): Promise<User[]> {
    return [...this.users.values()].filter((u) => u.organizationId === organizationId);
  }

  async countUsers(): Promise<number> {
    return this.users.size;
  }

  async revokeUserSessions(userId: string): Promise<void> {
    for (const s of this.sessions.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = Date.now();
  }

  async deleteUser(id: string): Promise<void> {
    this.approvals = this.approvals.filter((a) => a.userId !== id);
    for (const [hash, s] of this.sessions) if (s.userId === id) this.sessions.delete(hash);
    for (let i = this.assignments.length - 1; i >= 0; i--) if (this.assignments[i].userId === id) this.assignments.splice(i, 1);
    this.users.delete(id);
  }

  async deleteElection(id: string): Promise<void> {
    const positionIds = new Set([...this.positions.values()].filter((p) => p.electionId === id).map((p) => p.id));
    const candidateIds = [...this.candidates.values()].filter((c) => positionIds.has(c.positionId)).map((c) => c.id);
    const entitlementIds = new Set(this.entitlements.filter((e) => e.electionId === id).map((e) => e.id));
    for (const cid of candidateIds) { this.candidatePhotos.delete(cid); this.candidates.delete(cid); }
    for (const pid of positionIds) this.positions.delete(pid);
    for (const key of [...this.idempotency.keys()]) if (entitlementIds.has(key.split(':')[0])) this.idempotency.delete(key);
    for (const [k, b] of this.ballotSessions) if (b.electionId === id) this.ballotSessions.delete(k);
    for (const [k, o] of this.otpChallenges) if (o.electionId === id) this.otpChallenges.delete(k);
    this.removeWhere(this.ballots, (b) => b.electionId === id);
    this.removeWhere(this.entitlements, (e) => e.electionId === id);
    this.removeWhere(this.voters, (v) => v.electionId === id);
    this.removeWhere(this.tallyRuns, (t) => t.electionId === id);
    this.certifications.delete(id);
    this.electionKeys.delete(id);
    this.removeWhere(this.notificationBatches, (b) => b.electionId === id);
    this.removeWhere(this.fraudSignals, (f) => f.electionId === id);
    this.removeWhere(this.fraudEvents, (f) => f.electionId === id);
    this.removeWhere(this.fraudBlocks, (f) => f.electionId === id);
    this.removeWhere(this.assignments, (a) => a.electionId === id);
    this.approvals = this.approvals.filter((a) => a.electionId !== id);
    this.elections.delete(id);
  }

  private removeWhere<T>(list: T[], pred: (item: T) => boolean): void {
    for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) list.splice(i, 1);
  }

  async listApprovals(electionId: string): Promise<ElectionApproval[]> {
    return this.approvals.filter((a) => a.electionId === electionId).map((a) => ({ ...a }));
  }

  async upsertApproval(approval: ElectionApproval): Promise<void> {
    const i = this.approvals.findIndex((a) => a.electionId === approval.electionId && a.userId === approval.userId && a.kind === approval.kind);
    if (i >= 0) this.approvals[i] = { ...approval }; else this.approvals.push({ ...approval });
  }

  async deleteApproval(electionId: string, userId: string, kind: ApprovalKind): Promise<void> {
    this.approvals = this.approvals.filter((a) => !(a.electionId === electionId && a.userId === userId && a.kind === kind));
  }

  async clearApprovals(electionId: string, kind: ApprovalKind): Promise<void> {
    this.approvals = this.approvals.filter((a) => !(a.electionId === electionId && a.kind === kind));
  }

  async createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    this.sessions.set(tokenHash, { userId, tokenHash, expiresAt });
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const s = this.sessions.get(tokenHash);
    if (!s || s.expiresAt < Date.now() || s.revokedAt) return null;
    return s;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const s = this.sessions.get(tokenHash);
    if (s) s.revokedAt = Date.now();
  }

  async listAssignments(): Promise<(RoleAssignment & { userId: string })[]> {
    return this.assignments;
  }

  async addAssignment(assignment: RoleAssignment & { userId: string }): Promise<void> {
    this.assignments.push(assignment);
  }

  async createElection(election: Election): Promise<void> {
    this.elections.set(election.id, election);
  }

  async getElection(id: string): Promise<Election | null> {
    return this.elections.get(id) ?? null;
  }

  async listElections(organizationId: string): Promise<Election[]> {
    return [...this.elections.values()].filter((e) => e.organizationId === organizationId);
  }

  async updateElectionStateIf(id: string, from: Election['state'], to: Election['state']): Promise<boolean> {
    const e = this.elections.get(id);
    if (!e || e.state !== from) return false;
    e.state = to;
    return true;
  }

  async updateElection(id: string, patch: Partial<Election>): Promise<void> {
    const e = this.elections.get(id);
    if (e) Object.assign(e, patch);
  }

  async addPosition(position: Position): Promise<void> {
    this.positions.set(position.id, position);
  }

  async getPosition(id: string): Promise<Position | null> {
    return this.positions.get(id) ?? null;
  }

  async listPositions(electionId: string): Promise<Position[]> {
    return [...this.positions.values()].filter((p) => p.electionId === electionId);
  }

  async addCandidate(candidate: Candidate): Promise<void> {
    this.candidates.set(candidate.id, candidate);
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    return this.candidates.get(id) ?? null;
  }

  async listCandidates(): Promise<Candidate[]> {
    return [...this.candidates.values()];
  }

  async listCandidatesByElection(electionId: string): Promise<Candidate[]> {
    const positionIds = new Set(
      [...this.positions.values()].filter((p) => p.electionId === electionId).map((p) => p.id),
    );
    return [...this.candidates.values()].filter((c) => positionIds.has(c.positionId));
  }

  async setCandidatePhoto(candidateId: string, photo: { mime: string; data: string; url: string }): Promise<void> {
    this.candidatePhotos.set(candidateId, { mime: photo.mime, data: photo.data });
    const c = this.candidates.get(candidateId);
    if (c) c.photoUrl = photo.url;
  }

  async getCandidatePhoto(candidateId: string): Promise<{ mime: string; data: string } | null> {
    return this.candidatePhotos.get(candidateId) ?? null;
  }

  async clearCandidatePhoto(candidateId: string): Promise<void> {
    this.candidatePhotos.delete(candidateId);
    const c = this.candidates.get(candidateId);
    if (c) c.photoUrl = null;
  }

  async deleteCandidate(id: string): Promise<void> {
    this.candidatePhotos.delete(id);
    this.candidates.delete(id);
  }

  async deletePositionCascade(positionId: string): Promise<void> {
    for (const [id, c] of this.candidates) {
      if (c.positionId === positionId) { this.candidates.delete(id); this.candidatePhotos.delete(id); }
    }
    this.positions.delete(positionId);
  }

  async listVoters(electionId: string): Promise<VoterRecord[]> {
    return this.voters.filter((v) => v.electionId === electionId);
  }

  async findVoterByMemberId(electionId: string, memberId: string): Promise<VoterRecord | null> {
    const needle = memberId.toLowerCase();
    return this.voters.find(
      (v) => v.electionId === electionId && v.memberId.toLowerCase() === needle,
    ) ?? null;
  }

  async getVoter(id: string): Promise<VoterRecord | null> {
    return this.voters.find((v) => v.id === id) ?? null;
  }

  async updateVoterContact(voterId: string, patch: { fullName: string; email: string; phone: string }): Promise<void> {
    const voter = this.voters.find((v) => v.id === voterId);
    if (voter) Object.assign(voter, patch);
  }

  async updateVoterStatus(voterId: string, status: VoterRecord['status'], reason: string): Promise<void> {
    const voter = this.voters.find((v) => v.id === voterId);
    if (voter) { voter.status = status; voter.statusReason = reason; }
  }

  async resolveDuplicateVoter(voterId: string, status: 'eligible' | 'ineligible', reason: string, entitlement: Entitlement | null): Promise<void> {
    await this.updateVoterStatus(voterId, status, reason);
    if (entitlement) this.entitlements.push(entitlement);
  }

  async addEntitlement(entitlement: Entitlement): Promise<void> {
    this.entitlements.push(entitlement);
  }

  async listEntitlements(electionId: string): Promise<Entitlement[]> {
    return this.entitlements.filter((e) => e.electionId === electionId);
  }

  async getEntitlement(id: string): Promise<Entitlement | null> {
    return this.entitlements.find((e) => e.id === id) ?? null;
  }

  async findEntitlement(electionId: string, voterRecordId: string): Promise<Entitlement | null> {
    return this.entitlements.find((e) => e.electionId === electionId && e.voterRecordId === voterRecordId) ?? null;
  }

  async insertRegisterBatch(voters: VoterRecord[], entitlements: Entitlement[]): Promise<void> {
    this.voters.push(...voters);
    this.entitlements.push(...entitlements);
  }

  async insertNotificationBatch(batch: NotificationBatch): Promise<void> {
    this.notificationBatches.push(batch);
  }

  async updateNotificationBatch(id: string, patch: Partial<NotificationBatch>): Promise<void> {
    const batch = this.notificationBatches.find((b) => b.id === id);
    if (batch) Object.assign(batch, patch);
  }

  async listNotificationBatches(electionId: string): Promise<NotificationBatch[]> {
    return this.notificationBatches.filter((b) => b.electionId === electionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findNotificationBatch(electionId: string, kind: NotificationBatch['kind']): Promise<NotificationBatch | null> {
    return this.notificationBatches.filter((b) => b.electionId === electionId && b.kind === kind)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async upsertOtpChallenge(challenge: OtpChallenge & { key: string }): Promise<void> {
    this.otpChallenges.set(challenge.key, challenge);
  }

  async getOtpChallenge(key: string): Promise<(OtpChallenge & { key: string }) | null> {
    return this.otpChallenges.get(key) ?? null;
  }

  async consumeOtpChallenge(key: string, codeHash: string, maxAttempts: number): Promise<OtpVerifyResult> {
    const challenge = this.otpChallenges.get(key);
    if (!challenge) return 'missing';
    if (challenge.expiresAt < Date.now()) {
      this.otpChallenges.delete(key);
      return 'expired';
    }
    challenge.attempts += 1;
    if (challenge.attempts > maxAttempts) return 'locked';
    if (challenge.codeHash !== codeHash) return 'invalid';
    this.otpChallenges.delete(key);
    return 'ok';
  }

  async deleteOtpChallenge(key: string): Promise<void> {
    this.otpChallenges.delete(key);
  }

  async upsertLoginChallenge(challenge: LoginChallenge): Promise<void> {
    this.loginChallenges.set(challenge.userId, { ...challenge });
  }

  async getLoginChallenge(userId: string): Promise<LoginChallenge | null> {
    return this.loginChallenges.get(userId) ?? null;
  }

  async consumeLoginChallenge(userId: string, codeHash: string, maxAttempts: number): Promise<OtpVerifyResult> {
    const challenge = this.loginChallenges.get(userId);
    if (!challenge) return 'missing';
    if (challenge.expiresAt < Date.now()) {
      this.loginChallenges.delete(userId);
      return 'expired';
    }
    challenge.attempts += 1;
    if (challenge.attempts > maxAttempts) return 'locked';
    if (challenge.codeHash !== codeHash) return 'invalid';
    this.loginChallenges.delete(userId);
    return 'ok';
  }

  async createBallotSession(tokenHash: string, session: BallotSession): Promise<void> {
    this.ballotSessions.set(tokenHash, session);
  }

  async getBallotSession(tokenHash: string): Promise<BallotSession | null> {
    const s = this.ballotSessions.get(tokenHash);
    if (!s || s.expiresAt < Date.now()) return null;
    return s;
  }

  async deleteBallotSession(tokenHash: string): Promise<void> {
    this.ballotSessions.delete(tokenHash);
  }

  async hasElectionKey(electionId: string): Promise<boolean> {
    return this.electionKeys.has(electionId);
  }

  async getOrCreateElectionKey(electionId: string): Promise<Buffer> {
    let key = this.electionKeys.get(electionId);
    if (!key) {
      key = randomBytes(32);
      this.electionKeys.set(electionId, key);
    }
    return key;
  }

  async acceptBallot(input: AcceptBallotInput): Promise<AcceptBallotResult> {
    // Single-threaded critical section; the Postgres store performs the same
    // check-consume-store inside one transaction with a row lock (EMP-ARCH §8).
    const idemKey = `${input.entitlementId}:${input.idempotencyKey}`;
    const prior = this.idempotency.get(idemKey);
    if (prior) return { receiptId: prior, alreadyRecorded: true };

    const entitlement = this.entitlements.find((e) => e.id === input.entitlementId);
    if (!entitlement) throw new StoreError(StoreErrorCode.ENTITLEMENT_MISSING, 'no entitlement for this voter');
    if (entitlement.consumedAt) {
      throw new StoreError(StoreErrorCode.ALREADY_VOTED, 'ALREADY_VOTED: entitlement already consumed');
    }

    entitlement.consumedAt = new Date().toISOString();
    entitlement.receiptId = input.receiptId;
    this.ballots.push(input.ballot);
    this.idempotency.set(idemKey, input.receiptId);
    this.appendAuditSync(input.audit);
    return { receiptId: input.receiptId, alreadyRecorded: false };
  }

  private appendAuditSync(entry: Parameters<PlatformStore['appendAudit']>[0]): void {
    this.audit.push(appendEntry(this.audit, { ...entry, createdAt: entry.createdAt ?? new Date().toISOString() }));
  }

  async listBallots(electionId: string): Promise<BallotRecord[]> {
    return this.ballots.filter((b) => b.electionId === electionId);
  }

  async countBallots(electionId: string): Promise<number> {
    return this.ballots.filter((b) => b.electionId === electionId).length;
  }

  async countEligibleVoters(electionId: string): Promise<number> {
    return this.voters.filter((v) => v.electionId === electionId && v.status === 'eligible').length;
  }

  async recordTally(run: TallyRun, electionState: Election['state']): Promise<void> {
    this.tallyRuns.push(run);
    const election = this.elections.get(run.electionId);
    if (election) election.state = electionState;
  }

  async latestTallyRun(electionId: string): Promise<TallyRun | null> {
    return [...this.tallyRuns].reverse().find((t) => t.electionId === electionId) ?? null;
  }

  async recordCertification(certification: Certification): Promise<void> {
    this.certifications.set(certification.electionId, certification);
    const election = this.elections.get(certification.electionId);
    if (election) election.state = 'CERTIFIED';
  }

  async getCertification(electionId: string): Promise<Certification | null> {
    return this.certifications.get(electionId) ?? null;
  }

  async appendAudit(entry: Parameters<PlatformStore['appendAudit']>[0]): Promise<void> {
    this.appendAuditSync(entry);
  }

  async flushAudit(): Promise<void> {
    // Memory store chains synchronously; nothing queued.
  }

  async pendingAuditCount(): Promise<number> {
    return 0;
  }

  async listAudit(organizationId?: string): Promise<AuditEntry[]> {
    return organizationId ? this.audit.filter((a) => a.organizationId === organizationId) : [...this.audit];
  }

  async verifyAuditChain(): Promise<boolean> {
    return verifyChain(this.audit) === -1;
  }

  // ---- anti-fraud ----

  async insertFraudSignal(signal: FraudSignal): Promise<void> {
    this.fraudSignals.push(signal);
  }

  async insertFraudEvent(event: FraudEvent): Promise<void> {
    this.fraudEvents.push(event);
  }

  async insertFraudBlock(block: NewFraudBlock): Promise<FraudBlock> {
    const full: FraudBlock = {
      ...block, id: randomUUID(), createdAt: new Date().toISOString(), liftedAt: null, liftedBy: null,
    };
    this.fraudBlocks.push(full);
    return full;
  }

  private fraudSignalMatch(s: FraudSignal, f: FraudSignalFilter): boolean {
    if (s.kind !== f.kind) return false;
    if (f.signalHash !== undefined && s.signalHash !== f.signalHash) return false;
    if (f.electionId !== undefined && s.electionId !== f.electionId) return false;
    if (f.surface !== undefined && s.surface !== f.surface) return false;
    return s.createdAt >= f.since;
  }

  async findActiveFraudBlock(kind: FraudSignal['kind'], signalHash: string, electionId: string | null): Promise<FraudBlock | null> {
    const now = Date.now();
    return this.fraudBlocks.find((b) =>
      b.kind === kind && b.signalHash === signalHash && !b.liftedAt &&
      new Date(b.expiresAt).getTime() > now &&
      (b.electionId === null || b.electionId === electionId),
    ) ?? null;
  }

  async countFraudSignals(filter: FraudSignalFilter): Promise<number> {
    return this.fraudSignals.filter((s) => this.fraudSignalMatch(s, filter)).length;
  }

  async countDistinctFraudRefs(filter: FraudSignalFilter): Promise<number> {
    return new Set(
      this.fraudSignals.filter((s) => s.refHash && this.fraudSignalMatch(s, filter)).map((s) => s.refHash),
    ).size;
  }

  async listFraudEvents(filter: { electionId?: string; since?: string; limit?: number }): Promise<FraudEvent[]> {
    let out = this.fraudEvents.filter((e) =>
      (filter.electionId === undefined || e.electionId === filter.electionId) &&
      (!filter.since || e.createdAt >= filter.since),
    );
    out = [...out].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out.slice(0, filter.limit ?? 100);
  }

  async listActiveFraudBlocks(): Promise<FraudBlock[]> {
    const now = Date.now();
    return this.fraudBlocks.filter((b) => !b.liftedAt && new Date(b.expiresAt).getTime() > now);
  }

  async getFraudBlock(id: string): Promise<FraudBlock | null> {
    return this.fraudBlocks.find((b) => b.id === id) ?? null;
  }

  async countFraudEventsSince(since: string): Promise<number> {
    return this.fraudEvents.filter((e) => e.createdAt >= since).length;
  }

  async countActiveFraudBlocks(): Promise<number> {
    const now = Date.now();
    return this.fraudBlocks.filter((b) => !b.liftedAt && new Date(b.expiresAt).getTime() > now).length;
  }

  async liftFraudBlock(id: string, liftedBy: string): Promise<boolean> {
    const block = this.fraudBlocks.find((b) => b.id === id && !b.liftedAt);
    if (!block) return false;
    block.liftedAt = new Date().toISOString();
    block.liftedBy = liftedBy;
    return true;
  }

  async wasFraudBlockLifted(kind: FraudSignal['kind'], signalHash: string, rule: string, sinceIso: string): Promise<boolean> {
    return this.fraudBlocks.some((b) =>
      b.kind === kind && b.signalHash === signalHash && b.rule === rule &&
      b.liftedAt !== null && b.liftedAt >= sinceIso,
    );
  }
}
