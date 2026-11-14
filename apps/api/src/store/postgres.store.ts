import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db, type Db, type Tx } from '../db/client';
import * as schema from '../db/schema';
import { computeHash, verifyChain, type AuditEntry, type AuditEntryInput } from '../audit/audit-chain';
import type { RoleAssignment } from '../auth/roles';
import type { VoterRecord, VoterStatus } from '../register/csv-import';
import {
  StoreError,
  StoreErrorCode,
  type AcceptBallotInput,
  type AcceptBallotResult,
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
  type OtpChallenge,
  type OtpVerifyResult,
  type Organization,
  type PlatformStore,
  type Position,
  type Session,
  type TallyRun,
  type User,
} from './types';

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const date = (s: string | null | undefined): Date | null => (s ? new Date(s) : null);
const CHUNK = 400;

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Postgres-backed store (F-01). All multi-write operations run inside
 * transactions; ballot acceptance additionally takes a row lock on the
 * entitlement so exactly-once holds under concurrency (EMP-ARCH §8).
 * Audit appends go through a transactional outbox: mutations write the
 * audit intent inside their own transaction (atomic, no lock), and a
 * background drainer chains queued entries into audit_records in batches
 * under a single advisory lock — preserving SEC-AUD atomicity without
 * serializing every mutation on ~3 round-trips.
 */
export class PostgresStore implements PlatformStore {
  private auditTimer?: NodeJS.Timeout;
  private drainPromise: Promise<void> | null = null;

  constructor(private readonly database: Db = db) {
    // 2s cadence: audit entries appear promptly during activity, and the
    // interval is long enough that an idle database can still scale down.
    this.auditTimer = setInterval(() => {
      void this.flushAudit().catch(() => { /* retried on next tick */ });
    }, 2000);
    this.auditTimer.unref?.();
  }

  // ---- identity / admin ----

  readonly storeKind = 'postgres' as const;

  private mapOrganization(row: typeof schema.organizations.$inferSelect): Organization {
    return { id: row.id, name: row.name, slug: row.slug, createdAt: row.createdAt.toISOString() };
  }

  async createOrganization(name: string, slug: string): Promise<Organization> {
    const [row] = await this.database.insert(schema.organizations).values({ name, slug }).returning();
    return this.mapOrganization(row);
  }

  async getOrganization(id: string): Promise<Organization | null> {
    const [row] = await this.database.select().from(schema.organizations).where(eq(schema.organizations.id, id));
    return row ? this.mapOrganization(row) : null;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    const [row] = await this.database.select().from(schema.organizations).where(eq(schema.organizations.slug, slug));
    return row ? this.mapOrganization(row) : null;
  }

  async listOrganizations(): Promise<Organization[]> {
    const rows = await this.database.select().from(schema.organizations).orderBy(schema.organizations.createdAt);
    return rows.map((r) => this.mapOrganization(r));
  }

  async createUser(input: {
    organizationId: string | null; email: string; displayName: string;
    passwordHash: string | null; totpSecret: string | null; mfaEnrolled: boolean;
  }): Promise<User> {
    const [row] = await this.database.insert(schema.users).values(input).returning();
    return this.mapUser(row);
  }

  private mapUser(row: typeof schema.users.$inferSelect): User {
    return {
      id: row.id, organizationId: row.organizationId, email: row.email,
      displayName: row.displayName, passwordHash: row.passwordHash,
      totpSecret: row.totpSecret, mfaEnrolled: row.mfaEnrolled,
    };
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.database.select().from(schema.users)
      .where(sql`lower(${schema.users.email}) = lower(${email})`);
    return row ? this.mapUser(row) : null;
  }

  async findUser(id: string): Promise<User | null> {
    const [row] = await this.database.select().from(schema.users).where(eq(schema.users.id, id));
    return row ? this.mapUser(row) : null;
  }

  async listUsers(organizationId: string): Promise<User[]> {
    const rows = await this.database.select().from(schema.users)
      .where(eq(schema.users.organizationId, organizationId));
    return rows.map((r) => this.mapUser(r));
  }

  async countUsers(): Promise<number> {
    const [row] = await this.database.select({ n: sql<number>`count(*)::int` }).from(schema.users);
    return row.n;
  }

  async createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    await this.database.insert(schema.sessions).values({
      userId, tokenHash, expiresAt: new Date(expiresAt),
    });
  }

  async findSession(tokenHash: string): Promise<Session | null> {
    const [row] = await this.database.select().from(schema.sessions).where(and(
      eq(schema.sessions.tokenHash, tokenHash),
      gt(schema.sessions.expiresAt, new Date()),
      isNull(schema.sessions.revokedAt),
    ));
    return row ? { userId: row.userId, tokenHash: row.tokenHash, expiresAt: row.expiresAt.getTime() } : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.database.update(schema.sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.sessions.tokenHash, tokenHash), isNull(schema.sessions.revokedAt)));
  }

  async listAssignments(): Promise<(RoleAssignment & { userId: string })[]> {
    const rows = await this.database.select().from(schema.roleAssignments);
    return rows.map((r) => ({
      userId: r.userId, role: r.role, organizationId: r.organizationId,
      electionId: r.electionId,
      validFrom: iso(r.validFrom), validTo: iso(r.validTo),
    }));
  }

  async addAssignment(assignment: RoleAssignment & { userId: string }): Promise<void> {
    await this.database.insert(schema.roleAssignments).values({
      organizationId: assignment.organizationId,
      userId: assignment.userId,
      role: assignment.role,
      electionId: assignment.electionId ?? null,
    });
  }

  // ---- elections / configuration ----

  private mapElection(row: typeof schema.elections.$inferSelect): Election {
    return {
      id: row.id, organizationId: row.organizationId, name: row.name,
      description: row.description, state: row.state, timezone: row.timezone,
      votingOpensAt: iso(row.votingOpensAt), votingClosesAt: iso(row.votingClosesAt),
      ballotOrderPolicy: row.ballotOrderPolicy, registerHash: row.registerHash,
      voteType: row.voteType, resultsMode: row.resultsMode, announcement: row.announcement,
    };
  }

  async createElection(election: Election): Promise<void> {
    await this.database.insert(schema.elections).values({
      id: election.id,
      organizationId: election.organizationId,
      name: election.name,
      description: election.description,
      state: election.state,
      timezone: election.timezone,
      votingOpensAt: date(election.votingOpensAt),
      votingClosesAt: date(election.votingClosesAt),
      ballotOrderPolicy: election.ballotOrderPolicy,
      voteType: election.voteType,
      resultsMode: election.resultsMode,
      announcement: election.announcement,
      registerHash: election.registerHash,
    });
  }

  async getElection(id: string): Promise<Election | null> {
    const [row] = await this.database.select().from(schema.elections).where(eq(schema.elections.id, id));
    return row ? this.mapElection(row) : null;
  }

  async listElections(organizationId: string): Promise<Election[]> {
    const rows = await this.database.select().from(schema.elections)
      .where(eq(schema.elections.organizationId, organizationId));
    return rows.map((r) => this.mapElection(r));
  }

  async updateElection(id: string, patch: Partial<Election>): Promise<void> {
    await this.database.update(schema.elections).set({
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.registerHash !== undefined ? { registerHash: patch.registerHash } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.votingOpensAt !== undefined ? { votingOpensAt: date(patch.votingOpensAt) } : {}),
      ...(patch.votingClosesAt !== undefined ? { votingClosesAt: date(patch.votingClosesAt) } : {}),
      ...(patch.ballotOrderPolicy !== undefined ? { ballotOrderPolicy: patch.ballotOrderPolicy } : {}),
      ...(patch.voteType !== undefined ? { voteType: patch.voteType } : {}),
      ...(patch.resultsMode !== undefined ? { resultsMode: patch.resultsMode } : {}),
      ...(patch.announcement !== undefined ? { announcement: patch.announcement } : {}),
    }).where(eq(schema.elections.id, id));
  }

  async addPosition(position: Position): Promise<void> {
    await this.database.insert(schema.positions).values({
      id: position.id, electionId: position.electionId, title: position.title,
      seats: position.seats, maxChoices: position.maxChoices, allowAbstain: position.allowAbstain,
    });
  }

  async getPosition(id: string): Promise<Position | null> {
    const [row] = await this.database.select().from(schema.positions).where(eq(schema.positions.id, id));
    return row ? this.mapPosition(row) : null;
  }

  private mapPosition(row: typeof schema.positions.$inferSelect): Position {
    return {
      id: row.id, electionId: row.electionId, title: row.title,
      seats: row.seats, maxChoices: row.maxChoices, allowAbstain: row.allowAbstain,
    };
  }

  async listPositions(electionId: string): Promise<Position[]> {
    const rows = await this.database.select().from(schema.positions)
      .where(eq(schema.positions.electionId, electionId));
    return rows.map((r) => this.mapPosition(r));
  }

  async addCandidate(candidate: Candidate): Promise<void> {
    await this.database.insert(schema.candidates).values({
      id: candidate.id, positionId: candidate.positionId, fullName: candidate.fullName,
      statement: candidate.statement, withdrawnAt: date(candidate.withdrawnAt),
    });
  }

  async getCandidate(id: string): Promise<Candidate | null> {
    const [row] = await this.database.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    return row ? this.mapCandidate(row) : null;
  }

  private mapCandidate(row: typeof schema.candidates.$inferSelect): Candidate {
    return {
      id: row.id, positionId: row.positionId, fullName: row.fullName,
      statement: row.statement, withdrawnAt: iso(row.withdrawnAt),
    };
  }

  async listCandidates(): Promise<Candidate[]> {
    const rows = await this.database.select().from(schema.candidates);
    return rows.map((r) => this.mapCandidate(r));
  }

  // ---- voter register / entitlements ----

  private mapVoter(row: typeof schema.voterRecords.$inferSelect): VoterRecord {
    return {
      id: row.id, electionId: row.electionId, memberId: row.memberId,
      fullName: row.fullName, email: row.email ?? '', phone: row.phone ?? '',
      status: row.status as VoterStatus, statusReason: row.statusReason,
    };
  }

  async listVoters(electionId: string): Promise<VoterRecord[]> {
    const rows = await this.database.select().from(schema.voterRecords)
      .where(eq(schema.voterRecords.electionId, electionId));
    return rows.map((r) => this.mapVoter(r));
  }

  async findVoterByMemberId(electionId: string, memberId: string): Promise<VoterRecord | null> {
    const [row] = await this.database.select().from(schema.voterRecords).where(and(
      eq(schema.voterRecords.electionId, electionId),
      sql`lower(${schema.voterRecords.memberId}) = lower(${memberId})`,
    ));
    return row ? this.mapVoter(row) : null;
  }

  async getVoter(id: string): Promise<VoterRecord | null> {
    const [row] = await this.database.select().from(schema.voterRecords).where(eq(schema.voterRecords.id, id));
    return row ? this.mapVoter(row) : null;
  }

  async updateVoterStatus(voterId: string, status: VoterStatus, reason: string): Promise<void> {
    await this.database.update(schema.voterRecords)
      .set({ status, statusReason: reason })
      .where(eq(schema.voterRecords.id, voterId));
  }

  async resolveDuplicateVoter(voterId: string, status: 'eligible' | 'ineligible', reason: string, entitlement: Entitlement | null): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.update(schema.voterRecords)
        .set({ status, statusReason: reason })
        .where(eq(schema.voterRecords.id, voterId));
      if (entitlement) {
        await tx.insert(schema.entitlements).values({
          id: entitlement.id, electionId: entitlement.electionId,
          voterRecordId: entitlement.voterRecordId,
          consumedAt: date(entitlement.consumedAt), receiptId: entitlement.receiptId,
        });
      }
    });
  }

  private mapEntitlement(row: typeof schema.entitlements.$inferSelect): Entitlement {
    return {
      id: row.id, electionId: row.electionId, voterRecordId: row.voterRecordId,
      consumedAt: iso(row.consumedAt), receiptId: row.receiptId,
    };
  }

  async addEntitlement(entitlement: Entitlement): Promise<void> {
    await this.database.insert(schema.entitlements).values({
      id: entitlement.id, electionId: entitlement.electionId,
      voterRecordId: entitlement.voterRecordId,
      consumedAt: date(entitlement.consumedAt), receiptId: entitlement.receiptId,
    });
  }

  async listEntitlements(electionId: string): Promise<Entitlement[]> {
    const rows = await this.database.select().from(schema.entitlements)
      .where(eq(schema.entitlements.electionId, electionId));
    return rows.map((r) => this.mapEntitlement(r));
  }

  async getEntitlement(id: string): Promise<Entitlement | null> {
    const [row] = await this.database.select().from(schema.entitlements).where(eq(schema.entitlements.id, id));
    return row ? this.mapEntitlement(row) : null;
  }

  async findEntitlement(electionId: string, voterRecordId: string): Promise<Entitlement | null> {
    const [row] = await this.database.select().from(schema.entitlements).where(and(
      eq(schema.entitlements.electionId, electionId),
      eq(schema.entitlements.voterRecordId, voterRecordId),
    ));
    return row ? this.mapEntitlement(row) : null;
  }

  async insertRegisterBatch(voters: VoterRecord[], entitlements: Entitlement[]): Promise<void> {
    await this.database.transaction(async (tx) => {
      for (const batch of chunks(voters, CHUNK)) {
        await tx.insert(schema.voterRecords).values(batch.map((v) => ({
          id: v.id, electionId: v.electionId, memberId: v.memberId,
          fullName: v.fullName, email: v.email || null, phone: v.phone || null,
          status: v.status, statusReason: v.statusReason,
        })));
      }
      for (const batch of chunks(entitlements, CHUNK)) {
        await tx.insert(schema.entitlements).values(batch.map((e) => ({
          id: e.id, electionId: e.electionId, voterRecordId: e.voterRecordId,
          consumedAt: date(e.consumedAt), receiptId: e.receiptId,
        })));
      }
    });
  }

  // ---- OTP challenges / ballot sessions ----

  async upsertOtpChallenge(challenge: OtpChallenge & { key: string }): Promise<void> {
    await this.database.insert(schema.otpChallenges).values({
      key: challenge.key, electionId: challenge.electionId,
      voterRecordId: challenge.voterId, codeHash: challenge.codeHash,
      expiresAt: new Date(challenge.expiresAt), attempts: challenge.attempts,
    }).onConflictDoUpdate({
      target: schema.otpChallenges.key,
      set: { codeHash: challenge.codeHash, expiresAt: new Date(challenge.expiresAt), attempts: challenge.attempts },
    });
  }

  private mapOtp(row: typeof schema.otpChallenges.$inferSelect): OtpChallenge & { key: string } {
    return {
      key: row.key, voterId: row.voterRecordId, electionId: row.electionId,
      codeHash: row.codeHash, expiresAt: row.expiresAt.getTime(), attempts: row.attempts,
    };
  }

  async getOtpChallenge(key: string): Promise<(OtpChallenge & { key: string }) | null> {
    const [row] = await this.database.select().from(schema.otpChallenges).where(eq(schema.otpChallenges.key, key));
    return row ? this.mapOtp(row) : null;
  }

  async consumeOtpChallenge(key: string, codeHash: string, maxAttempts: number): Promise<OtpVerifyResult> {
    return this.database.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.otpChallenges)
        .where(eq(schema.otpChallenges.key, key))
        .for('update');
      if (!row) return 'missing';
      if (row.expiresAt.getTime() < Date.now()) {
        await tx.delete(schema.otpChallenges).where(eq(schema.otpChallenges.key, key));
        return 'expired';
      }
      const attempts = row.attempts + 1;
      await tx.update(schema.otpChallenges)
        .set({ attempts })
        .where(eq(schema.otpChallenges.key, key));
      if (attempts > maxAttempts) return 'locked';
      if (row.codeHash !== codeHash) return 'invalid';
      await tx.delete(schema.otpChallenges).where(eq(schema.otpChallenges.key, key));
      return 'ok';
    });
  }

  async deleteOtpChallenge(key: string): Promise<void> {
    await this.database.delete(schema.otpChallenges).where(eq(schema.otpChallenges.key, key));
  }

  async createBallotSession(tokenHash: string, session: BallotSession): Promise<void> {
    await this.database.insert(schema.ballotSessions).values({
      tokenHash, voterRecordId: session.voterId, electionId: session.electionId,
      entitlementId: session.entitlementId, expiresAt: new Date(session.expiresAt),
      channel: session.channel,
    });
  }

  private mapBallotSession(row: typeof schema.ballotSessions.$inferSelect): BallotSession {
    return {
      voterId: row.voterRecordId, electionId: row.electionId, entitlementId: row.entitlementId,
      expiresAt: row.expiresAt.getTime(), channel: row.channel,
    };
  }

  async getBallotSession(tokenHash: string): Promise<BallotSession | null> {
    const [row] = await this.database.select().from(schema.ballotSessions).where(and(
      eq(schema.ballotSessions.tokenHash, tokenHash),
      gt(schema.ballotSessions.expiresAt, new Date()),
    ));
    return row ? this.mapBallotSession(row) : null;
  }

  async deleteBallotSession(tokenHash: string): Promise<void> {
    await this.database.delete(schema.ballotSessions).where(eq(schema.ballotSessions.tokenHash, tokenHash));
  }

  // ---- election keys (mock custody; DEC-006 hold point) ----

  async hasElectionKey(electionId: string): Promise<boolean> {
    const [row] = await this.database.select({ electionId: schema.electionKeys.electionId })
      .from(schema.electionKeys).where(eq(schema.electionKeys.electionId, electionId));
    return Boolean(row);
  }

  async getOrCreateElectionKey(electionId: string): Promise<Buffer> {
    const [existing] = await this.database.select().from(schema.electionKeys)
      .where(eq(schema.electionKeys.electionId, electionId));
    if (existing) return Buffer.from(existing.keyBase64, 'base64');
    const key = randomBytes(32);
    await this.database.insert(schema.electionKeys)
      .values({ electionId, keyBase64: key.toString('base64') })
      .onConflictDoNothing();
    const [row] = await this.database.select().from(schema.electionKeys)
      .where(eq(schema.electionKeys.electionId, electionId));
    return Buffer.from(row.keyBase64, 'base64');
  }

  // ---- ballots (append-only; SEC-BAL) ----

  async acceptBallot(input: AcceptBallotInput): Promise<AcceptBallotResult> {
    return this.database.transaction(async (tx) => {
      // Lock the entitlement row first: serializes concurrent submissions for
      // the same voter so exactly-once holds (EMP-ARCH §8).
      const [entitlement] = await tx.select().from(schema.entitlements)
        .where(eq(schema.entitlements.id, input.entitlementId))
        .for('update');
      if (!entitlement) {
        throw new StoreError(StoreErrorCode.ENTITLEMENT_MISSING, 'no entitlement for this voter');
      }

      // Idempotent replay: same key returns the original receipt (SEC-VOT-04).
      const [prior] = await tx.select().from(schema.ballotIdempotencyKeys).where(and(
        eq(schema.ballotIdempotencyKeys.entitlementId, input.entitlementId),
        eq(schema.ballotIdempotencyKeys.key, input.idempotencyKey),
      ));
      if (prior) return { receiptId: prior.receiptId, alreadyRecorded: true };

      if (entitlement.consumedAt) {
        throw new StoreError(StoreErrorCode.ALREADY_VOTED, 'ALREADY_VOTED: entitlement already consumed');
      }

      await tx.insert(schema.ballots).values({
        id: input.ballot.id,
        electionId: input.ballot.electionId,
        ciphertext: input.ballot.ciphertext,
        iv: input.ballot.iv,
        authTag: input.ballot.authTag,
        ciphertextHash: input.ballot.ciphertextHash,
        coarseTimestamp: new Date(`${input.ballot.coarseTimestamp}:00.000Z`),
      });

      await tx.update(schema.entitlements).set({
        consumedAt: new Date(), receiptId: input.receiptId,
      }).where(eq(schema.entitlements.id, input.entitlementId));

      await tx.insert(schema.ballotIdempotencyKeys).values({
        entitlementId: input.entitlementId,
        key: input.idempotencyKey,
        receiptId: input.receiptId,
      });

      // Audit append shares this transaction (SEC-AUD); the advisory lock
      // serializes chain-head reads across all writers.
      await this.appendAuditTx(tx, input.audit);

      return { receiptId: input.receiptId, alreadyRecorded: false };
    });
  }

  async listBallots(electionId: string): Promise<BallotRecord[]> {
    const rows = await this.database.select().from(schema.ballots)
      .where(eq(schema.ballots.electionId, electionId));
    return rows.map((r) => ({
      id: r.id, electionId: r.electionId, ciphertext: r.ciphertext, iv: r.iv,
      authTag: r.authTag, ciphertextHash: r.ciphertextHash,
      coarseTimestamp: r.coarseTimestamp.toISOString().slice(0, 16),
    }));
  }

  async countBallots(electionId: string): Promise<number> {
    const [row] = await this.database.select({ n: sql<number>`count(*)::int` })
      .from(schema.ballots).where(eq(schema.ballots.electionId, electionId));
    return row.n;
  }

  async countEligibleVoters(electionId: string): Promise<number> {
    const [row] = await this.database.select({ n: sql<number>`count(*)::int` })
      .from(schema.voterRecords).where(and(
        eq(schema.voterRecords.electionId, electionId),
        eq(schema.voterRecords.status, 'eligible'),
      ));
    return row.n;
  }

  // ---- tally / certification ----

  private mapTallyRun(row: typeof schema.tallyRuns.$inferSelect): TallyRun {
    return {
      id: row.id, electionId: row.electionId, ballotCount: row.ballotCount,
      counts: row.counts, evidenceRoot: row.evidenceRoot, tallyHash: row.tallyHash,
      authorizedBy: row.authorizedBy, executedBy: row.executedBy,
      approvers: row.approvers, createdAt: row.createdAt.toISOString(),
    };
  }

  async recordTally(run: TallyRun, electionState: Election['state']): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.insert(schema.tallyRuns).values({
        id: run.id, electionId: run.electionId, ballotCount: run.ballotCount,
        counts: run.counts, evidenceRoot: run.evidenceRoot, tallyHash: run.tallyHash,
        authorizedBy: run.authorizedBy, executedBy: run.executedBy,
        approvers: run.approvers, createdAt: new Date(run.createdAt),
      });
      await tx.update(schema.elections).set({ state: electionState })
        .where(eq(schema.elections.id, run.electionId));
    });
  }

  async latestTallyRun(electionId: string): Promise<TallyRun | null> {
    const [row] = await this.database.select().from(schema.tallyRuns)
      .where(eq(schema.tallyRuns.electionId, electionId))
      .orderBy(desc(schema.tallyRuns.createdAt))
      .limit(1);
    return row ? this.mapTallyRun(row) : null;
  }

  async recordCertification(certification: Certification): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.insert(schema.certifications).values({
        electionId: certification.electionId, certifiedBy: certification.certifiedBy,
        secondApprover: certification.secondApprover, tallyHash: certification.tallyHash,
        createdAt: new Date(certification.createdAt),
      }).onConflictDoUpdate({
        target: schema.certifications.electionId,
        set: {
          certifiedBy: certification.certifiedBy, secondApprover: certification.secondApprover,
          tallyHash: certification.tallyHash, createdAt: new Date(certification.createdAt),
        },
      });
      await tx.update(schema.elections).set({ state: 'CERTIFIED' })
        .where(eq(schema.elections.id, certification.electionId));
    });
  }

  async getCertification(electionId: string): Promise<Certification | null> {
    const [row] = await this.database.select().from(schema.certifications)
      .where(eq(schema.certifications.electionId, electionId));
    return row ? {
      electionId: row.electionId, certifiedBy: row.certifiedBy,
      secondApprover: row.secondApprover, tallyHash: row.tallyHash,
      createdAt: row.createdAt.toISOString(),
    } : null;
  }

  // ---- audit (hash-chained, append-only) ----

  /** Queue audit intent inside the caller's transaction (outbox pattern). */
  private async appendAuditTx(tx: Tx, entry: AuditEntryInput): Promise<void> {
    await tx.insert(schema.auditOutbox).values({ payload: entry });
  }

  async appendAudit(entry: AuditEntryInput): Promise<void> {
    await this.database.insert(schema.auditOutbox).values({ payload: entry });
  }

  /**
   * Chain queued outbox rows into audit_records. Runs automatically on an
   * interval; also invoked directly by verifyAuditChain so callers always
   * observe a complete chain. Concurrent callers coalesce onto a single
   * in-flight drain — without this, interval ticks pile up into a convoy
   * of lock-waiting transactions that starves the connection pool.
   */
  flushAudit(): Promise<void> {
    this.drainPromise ??= (async () => {
      // Drain until a short batch: callers (verifyAuditChain) then observe
      // every outbox row committed before the flush began.
      for (let i = 0; i < 20; i++) {
        if ((await this.drainAuditBatch()) < 200) break;
      }
    })().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  /** Returns the number of outbox rows chained by this batch. */
  private async drainAuditBatch(): Promise<number> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('votemax.audit.drain'))`);
      const pending = await tx.select().from(schema.auditOutbox)
        .orderBy(asc(schema.auditOutbox.id)).limit(200);
      if (pending.length === 0) return 0;

      const [last] = await tx.select({ hash: schema.auditRecords.hash })
        .from(schema.auditRecords).orderBy(desc(schema.auditRecords.id)).limit(1);
      let prevHash = last?.hash ?? '0'.repeat(64);
      const rows = pending.map((row) => {
        const entry = row.payload as AuditEntryInput;
        const hash = computeHash({ ...entry, prevHash });
        const out = {
          organizationId: entry.organizationId,
          actorId: entry.actorId,
          action: entry.action,
          scope: entry.scope,
          outcome: entry.outcome,
          createdAt: new Date(entry.createdAt),
          prevHash,
          hash,
        };
        prevHash = hash;
        return out;
      });
      await tx.insert(schema.auditRecords).values(rows);
      // Outbox rows are transient once chained into the append-only log.
      await tx.delete(schema.auditOutbox)
        .where(inArray(schema.auditOutbox.id, pending.map((r) => r.id)));
      return pending.length;
    });
  }

  async pendingAuditCount(): Promise<number> {
    const [row] = await this.database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.auditOutbox);
    return row?.n ?? 0;
  }

  async listAudit(organizationId?: string): Promise<AuditEntry[]> {
    const rows = organizationId
      ? await this.database.select().from(schema.auditRecords)
          .where(eq(schema.auditRecords.organizationId, organizationId)).orderBy(schema.auditRecords.id)
      : await this.database.select().from(schema.auditRecords).orderBy(schema.auditRecords.id);
    return rows.map((r) => ({
      organizationId: r.organizationId, actorId: r.actorId, action: r.action,
      scope: r.scope, outcome: r.outcome, createdAt: r.createdAt.toISOString(),
      prevHash: r.prevHash, hash: r.hash,
    }));
  }

  async verifyAuditChain(): Promise<boolean> {
    await this.flushAudit();
    return verifyChain(await this.listAudit()) === -1;
  }

  // ---- anti-fraud ----

  async insertFraudSignal(signal: FraudSignal): Promise<void> {
    await this.database.insert(schema.fraudSignals).values({
      electionId: signal.electionId,
      kind: signal.kind,
      signalHash: signal.signalHash,
      refHash: signal.refHash,
      surface: signal.surface,
      uaClass: signal.uaClass,
      score: signal.score,
      action: signal.action,
      meta: signal.meta ?? null,
      createdAt: new Date(signal.createdAt),
      expiresAt: new Date(signal.expiresAt),
    });
  }

  async insertFraudEvent(event: FraudEvent): Promise<void> {
    await this.database.insert(schema.fraudEvents).values({
      electionId: event.electionId,
      rule: event.rule,
      score: event.score,
      action: event.action,
      reasons: event.reasons,
      signalKind: event.signalKind,
      signalHash: event.signalHash,
      refHash: event.refHash,
      createdAt: new Date(event.createdAt),
    });
  }

  async insertFraudBlock(block: NewFraudBlock): Promise<FraudBlock> {
    const [row] = await this.database.insert(schema.fraudBlocks).values({
      kind: block.kind,
      signalHash: block.signalHash,
      electionId: block.electionId,
      rule: block.rule,
      reason: block.reason,
      score: block.score,
      expiresAt: new Date(block.expiresAt),
      createdAt: new Date(),
    }).returning();
    return this.mapFraudBlock(row);
  }

  private mapFraudBlock(r: typeof schema.fraudBlocks.$inferSelect): FraudBlock {
    return {
      id: r.id, kind: r.kind as FraudBlock['kind'], signalHash: r.signalHash,
      electionId: r.electionId, rule: r.rule, reason: r.reason, score: r.score,
      expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString(),
      liftedAt: iso(r.liftedAt), liftedBy: r.liftedBy,
    };
  }

  async findActiveFraudBlock(kind: FraudSignal['kind'], signalHash: string, electionId: string | null): Promise<FraudBlock | null> {
    const now = new Date();
    const [row] = await this.database.select().from(schema.fraudBlocks)
      .where(and(
        eq(schema.fraudBlocks.kind, kind),
        eq(schema.fraudBlocks.signalHash, signalHash),
        isNull(schema.fraudBlocks.liftedAt),
        gt(schema.fraudBlocks.expiresAt, now),
        electionId === null
          ? isNull(schema.fraudBlocks.electionId)
          : or(isNull(schema.fraudBlocks.electionId), eq(schema.fraudBlocks.electionId, electionId)),
      ))
      .limit(1);
    return row ? this.mapFraudBlock(row) : null;
  }

  private fraudSignalWhere(f: FraudSignalFilter) {
    const conds = [
      eq(schema.fraudSignals.kind, f.kind),
      gte(schema.fraudSignals.createdAt, new Date(f.since)),
    ];
    if (f.signalHash !== undefined) conds.push(eq(schema.fraudSignals.signalHash, f.signalHash));
    if (f.surface !== undefined) conds.push(eq(schema.fraudSignals.surface, f.surface));
    if (f.electionId !== undefined) {
      conds.push(f.electionId === null
        ? isNull(schema.fraudSignals.electionId)
        : eq(schema.fraudSignals.electionId, f.electionId));
    }
    return and(...conds);
  }

  async countFraudSignals(filter: FraudSignalFilter): Promise<number> {
    const [row] = await this.database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.fraudSignals)
      .where(this.fraudSignalWhere(filter));
    return row?.n ?? 0;
  }

  async countDistinctFraudRefs(filter: FraudSignalFilter): Promise<number> {
    const [row] = await this.database
      .select({ n: sql<number>`count(distinct ${schema.fraudSignals.refHash})::int` })
      .from(schema.fraudSignals)
      .where(and(this.fraudSignalWhere(filter), isNotNull(schema.fraudSignals.refHash), ne(schema.fraudSignals.refHash, '')));
    return row?.n ?? 0;
  }

  async listFraudEvents(filter: { electionId?: string; since?: string; limit?: number }): Promise<FraudEvent[]> {
    const conds = [];
    if (filter.electionId !== undefined) conds.push(eq(schema.fraudEvents.electionId, filter.electionId));
    if (filter.since) conds.push(gte(schema.fraudEvents.createdAt, new Date(filter.since)));
    const rows = await this.database.select().from(schema.fraudEvents)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.fraudEvents.createdAt))
      .limit(filter.limit ?? 100);
    return rows.map((r) => ({
      electionId: r.electionId, rule: r.rule, score: r.score,
      action: r.action as FraudEvent['action'], reasons: r.reasons,
      signalKind: r.signalKind as FraudEvent['signalKind'], signalHash: r.signalHash,
      refHash: r.refHash, createdAt: r.createdAt.toISOString(),
    }));
  }

  async listActiveFraudBlocks(): Promise<FraudBlock[]> {
    const rows = await this.database.select().from(schema.fraudBlocks)
      .where(and(isNull(schema.fraudBlocks.liftedAt), gt(schema.fraudBlocks.expiresAt, new Date())))
      .orderBy(desc(schema.fraudBlocks.createdAt))
      .limit(200);
    return rows.map((r) => this.mapFraudBlock(r));
  }

  async countFraudEventsSince(since: string): Promise<number> {
    const [row] = await this.database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.fraudEvents)
      .where(gte(schema.fraudEvents.createdAt, new Date(since)));
    return row?.n ?? 0;
  }

  async countActiveFraudBlocks(): Promise<number> {
    const [row] = await this.database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.fraudBlocks)
      .where(and(isNull(schema.fraudBlocks.liftedAt), gt(schema.fraudBlocks.expiresAt, new Date())));
    return row?.n ?? 0;
  }

  async liftFraudBlock(id: string, liftedBy: string): Promise<boolean> {
    const rows = await this.database.update(schema.fraudBlocks)
      .set({ liftedAt: new Date(), liftedBy })
      .where(and(eq(schema.fraudBlocks.id, id), isNull(schema.fraudBlocks.liftedAt), gt(schema.fraudBlocks.expiresAt, new Date())))
      .returning({ id: schema.fraudBlocks.id });
    return rows.length > 0;
  }

  async wasFraudBlockLifted(kind: FraudSignal['kind'], signalHash: string, rule: string, sinceIso: string): Promise<boolean> {
    const [row] = await this.database
      .select({ id: schema.fraudBlocks.id })
      .from(schema.fraudBlocks)
      .where(and(
        eq(schema.fraudBlocks.kind, kind),
        eq(schema.fraudBlocks.signalHash, signalHash),
        eq(schema.fraudBlocks.rule, rule),
        isNotNull(schema.fraudBlocks.liftedAt),
        gte(schema.fraudBlocks.liftedAt, new Date(sinceIso)),
      ))
      .limit(1);
    return Boolean(row);
  }
}
