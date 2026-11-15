import type { RoleAssignment } from '../auth/roles';
import type { ElectionState } from '../elections/lifecycle';
import type { AuditEntry, AuditEntryInput } from '../audit/audit-chain';
import type { VoterRecord } from '../register/csv-import';

// Domain types shared by the service layer and both store implementations
// (in-memory for tests/dev, Postgres for production — F-01).

export interface Organization { id: string; name: string; slug: string; createdAt: string }
export interface User {
  id: string; organizationId: string | null; email: string; displayName: string;
  passwordHash: string | null; totpSecret: string | null; mfaEnrolled: boolean;
}
export interface Election {
  id: string; organizationId: string; name: string; description: string | null;
  state: ElectionState; timezone: string;
  votingOpensAt: string | null; votingClosesAt: string | null;
  ballotOrderPolicy: string; registerHash: string | null;
  voteType: string; resultsMode: string; announcement: string | null;
}
export interface Position {
  id: string; electionId: string; title: string; seats: number; maxChoices: number; allowAbstain: boolean;
}
export interface Candidate {
  id: string; positionId: string; fullName: string; statement: string | null; withdrawnAt: string | null;
}
export interface Entitlement { id: string; electionId: string; voterRecordId: string; consumedAt: string | null; receiptId: string | null }
export interface Session { userId: string; tokenHash: string; expiresAt: number; revokedAt?: number | null }

// ---- Phase 3: voting & results (mock-election implementation) ----
// Ballot records deliberately have NO voter, session, OTP, or entitlement
// identifier (SEC-BAL-01/02). Participation is tracked separately (D2).
export interface BallotRecord {
  id: string;
  electionId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  ciphertextHash: string;
  // Coarse timestamp (minute bucket) to resist timing correlation (SEC-BAL-05).
  coarseTimestamp: string;
}
export interface TallyRun {
  id: string;
  electionId: string;
  ballotCount: number;
  counts: Record<string, number>; // candidateId -> votes (plus 'abstain:<positionId>')
  evidenceRoot: string;
  tallyHash: string;
  authorizedBy: string;
  executedBy: string;
  approvers: string[];
  createdAt: string;
}
export interface Certification {
  electionId: string; certifiedBy: string; secondApprover: string; tallyHash: string; createdAt: string;
}
export interface OtpChallenge { voterId: string; electionId: string; codeHash: string; expiresAt: number; attempts: number }
export type OtpVerifyResult = 'ok' | 'invalid' | 'locked' | 'expired' | 'missing';
export interface BallotSession { voterId: string; electionId: string; entitlementId: string; expiresAt: number; channel: 'online' }

export type NotificationKind = 'invite' | 'reminder_open' | 'reminder_close';
export type NotificationStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface NotificationBatch {
  id: string; electionId: string; organizationId: string; kind: NotificationKind;
  status: NotificationStatus; total: number; sent: number; failed: number; skipped: number;
  createdAt: string; completedAt: string | null;
}

/** Parameters for the atomic ballot-acceptance critical section (SEC-VOT-02/04/05). */
export interface AcceptBallotInput {
  electionId: string;
  entitlementId: string;
  voterId: string;
  channel: 'online';
  idempotencyKey: string;
  receiptId: string;
  ballot: BallotRecord;
  audit: AuditEntryInput;
}
export type AcceptBallotResult = { receiptId: string; alreadyRecorded: boolean };

// ---- Anti-fraud (SEC-VOT-10) ----
// All identifiers arriving here are already salted hashes — stores must
// never receive raw IPs, device fingerprints, or voter identifiers, and
// fraud rows must never be joined to ballot records (SEC-BAL-02).
export type FraudSignalKind = 'ip' | 'device' | 'actor';
export type FraudSurface =
  | 'login' | 'logout' | 'otp_request' | 'otp_verify' | 'ballot_fetch' | 'ballot_submit'
  | 'station_session' | 'register_import' | 'provision' | 'org_create' | 'user_create'
  | 'role_assign' | 'mutation' | 'read';
export interface FraudSignal {
  electionId: string | null;
  kind: FraudSignalKind;
  signalHash: string;
  refHash: string | null;
  surface: FraudSurface;
  uaClass: string | null;
  score: number;
  action: 'allow' | 'throttle' | 'block';
  meta?: Record<string, unknown> | null;
  createdAt: string;
  expiresAt: string;
}
export interface FraudEvent {
  electionId: string | null;
  rule: string;
  score: number;
  action: 'allow' | 'throttle' | 'block';
  reasons: string[];
  signalKind: FraudSignalKind | null;
  signalHash: string | null;
  refHash: string | null;
  createdAt: string;
}
export interface FraudBlock {
  id: string;
  kind: FraudSignalKind;
  signalHash: string;
  electionId: string | null; // null = global
  rule: string;
  reason: string;
  score: number;
  expiresAt: string;
  createdAt: string;
  liftedAt: string | null;
  liftedBy: string | null;
}
export interface FraudSignalFilter {
  kind: FraudSignalKind;
  signalHash?: string;
  electionId?: string | null; // undefined = any election, null = global-only rows
  surface?: FraudSurface;
  since: string; // ISO timestamp lower bound
}
export type NewFraudBlock = Omit<FraudBlock, 'id' | 'createdAt' | 'liftedAt' | 'liftedBy'>;

/** Errors thrown by stores for domain-level conflicts inside transactions. */
export const StoreErrorCode = {
  ALREADY_VOTED: 'ALREADY_VOTED',
  ENTITLEMENT_MISSING: 'NOT_ELIGIBLE',
} as const;

export const PLATFORM_STORE = 'PLATFORM_STORE';

export class StoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Persistence contract for the platform. The Postgres implementation must
 * honor the atomicity guarantees documented on each method; the in-memory
 * implementation exists for unit tests and local development without a DB.
 */
export interface PlatformStore {
  // ---- identity / admin ----
  readonly storeKind: 'memory' | 'postgres';
  createOrganization(name: string, slug: string): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | null>;
  getOrganizationBySlug(slug: string): Promise<Organization | null>;
  listOrganizations(): Promise<Organization[]>;
  createUser(input: {
    organizationId: string | null; email: string; displayName: string;
    passwordHash: string | null; totpSecret: string | null; mfaEnrolled: boolean;
  }): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUser(id: string): Promise<User | null>;
  listUsers(organizationId: string): Promise<User[]>;
  countUsers(): Promise<number>;
  createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void>;
  findSession(tokenHash: string): Promise<Session | null>;
  /** Revoke a session by token hash; subsequent findSession returns null. */
  revokeSession(tokenHash: string): Promise<void>;
  listAssignments(): Promise<(RoleAssignment & { userId: string })[]>;
  addAssignment(assignment: RoleAssignment & { userId: string }): Promise<void>;

  // ---- elections / configuration ----
  createElection(election: Election): Promise<void>;
  getElection(id: string): Promise<Election | null>;
  listElections(organizationId: string): Promise<Election[]>;
  updateElection(id: string, patch: Partial<Election>): Promise<void>;
  addPosition(position: Position): Promise<void>;
  getPosition(id: string): Promise<Position | null>;
  listPositions(electionId: string): Promise<Position[]>;
  addCandidate(candidate: Candidate): Promise<void>;
  getCandidate(id: string): Promise<Candidate | null>;
  listCandidates(): Promise<Candidate[]>;
  /** Candidates of one election's positions (avoids whole-table reads). */
  listCandidatesByElection(electionId: string): Promise<Candidate[]>;
  /** Delete a candidate record (config editable states only — enforced by service). */
  deleteCandidate(id: string): Promise<void>;
  /** Delete a position and all of its candidates atomically. */
  deletePositionCascade(positionId: string): Promise<void>;

  // ---- voter register / entitlements ----
  listVoters(electionId: string): Promise<VoterRecord[]>;
  findVoterByMemberId(electionId: string, memberId: string): Promise<VoterRecord | null>;
  getVoter(id: string): Promise<VoterRecord | null>;
  updateVoterStatus(voterId: string, status: VoterRecord['status'], reason: string): Promise<void>;
  /** Update a voter's name/contact details only — never member ID or status. */
  updateVoterContact(voterId: string, patch: { fullName: string; email: string; phone: string }): Promise<void>;
  /** Resolve a duplicate and (for 'eligible') create its entitlement atomically. */
  resolveDuplicateVoter(voterId: string, status: 'eligible' | 'ineligible', reason: string, entitlement: Entitlement | null): Promise<void>;
  addEntitlement(entitlement: Entitlement): Promise<void>;
  listEntitlements(electionId: string): Promise<Entitlement[]>;
  getEntitlement(id: string): Promise<Entitlement | null>;
  findEntitlement(electionId: string, voterRecordId: string): Promise<Entitlement | null>;
  /** Atomically persist imported voter records and their entitlements. */
  insertRegisterBatch(voters: VoterRecord[], entitlements: Entitlement[]): Promise<void>;

  // ---- OTP challenges / ballot sessions (identity domain; never joined to ballots) ----
  upsertOtpChallenge(challenge: OtpChallenge & { key: string }): Promise<void>;
  getOtpChallenge(key: string): Promise<(OtpChallenge & { key: string }) | null>;
  /**
   * Atomically verify and consume an OTP challenge: increments attempts under
   * a row lock, enforces expiry/lockout, and deletes on success. Postgres must
   * not implement this as a read-modify-write outside a transaction.
   */
  consumeOtpChallenge(key: string, codeHash: string, maxAttempts: number): Promise<OtpVerifyResult>;
  deleteOtpChallenge(key: string): Promise<void>;
  createBallotSession(tokenHash: string, session: BallotSession): Promise<void>;
  getBallotSession(tokenHash: string): Promise<BallotSession | null>;
  deleteBallotSession(tokenHash: string): Promise<void>;

  // ---- election keys (mock custody; DEC-006 hold point) ----
  hasElectionKey(electionId: string): Promise<boolean>;
  getOrCreateElectionKey(electionId: string): Promise<Buffer>;

  // ---- ballots (append-only; SEC-BAL) ----
  /**
   * Atomic acceptance: lock entitlement, replay-check idempotency key,
   * consume entitlement, insert ciphertext ballot, write receipt + audit —
   * one transaction (EMP-ARCH §8, SEC-VOT-02/04/05).
   */
  acceptBallot(input: AcceptBallotInput): Promise<AcceptBallotResult>;
  listBallots(electionId: string): Promise<BallotRecord[]>;
  countBallots(electionId: string): Promise<number>;
  countEligibleVoters(electionId: string): Promise<number>;

  // ---- tally / certification ----
  /** Persist a tally run and the resulting election state in one transaction. */
  recordTally(run: TallyRun, electionState: ElectionState): Promise<void>;
  latestTallyRun(electionId: string): Promise<TallyRun | null>;
  /** Persist a certification and the CERTIFIED state in one transaction. */
  recordCertification(certification: Certification): Promise<void>;
  getCertification(electionId: string): Promise<Certification | null>;

  // ---- voter notifications ----
  insertNotificationBatch(batch: NotificationBatch): Promise<void>;
  updateNotificationBatch(id: string, patch: Partial<NotificationBatch>): Promise<void>;
  listNotificationBatches(electionId: string): Promise<NotificationBatch[]>;
  /** Latest batch of a kind for an election (reminder dedupe). */
  findNotificationBatch(electionId: string, kind: NotificationKind): Promise<NotificationBatch | null>;

  // ---- audit (hash-chained, append-only) ----
  appendAudit(entry: AuditEntryInput): Promise<void>;
  /**
   * Ensure all queued audit intents are chained into the audit log.
   * Postgres drains its outbox asynchronously; callers that must observe a
   * complete chain (verifyAuditChain) flush first. Memory store: no-op.
   */
  flushAudit(): Promise<void>;
  /** Number of audit intents queued but not yet chained (Postgres outbox). */
  pendingAuditCount(): Promise<number>;
  listAudit(organizationId?: string): Promise<AuditEntry[]>;
  verifyAuditChain(): Promise<boolean>;

  // ---- anti-fraud signals / events / blocks (SEC-VOT-10) ----
  insertFraudSignal(signal: FraudSignal): Promise<void>;
  insertFraudEvent(event: FraudEvent): Promise<void>;
  insertFraudBlock(block: NewFraudBlock): Promise<FraudBlock>;
  /** Active (unexpired, unlifted) block matching kind+hash in scope or global. */
  findActiveFraudBlock(kind: FraudSignalKind, signalHash: string, electionId: string | null): Promise<FraudBlock | null>;
  countFraudSignals(filter: FraudSignalFilter): Promise<number>;
  /** Distinct non-null refHash values matching the filter. */
  countDistinctFraudRefs(filter: FraudSignalFilter): Promise<number>;
  listFraudEvents(filter: { electionId?: string; since?: string; limit?: number }): Promise<FraudEvent[]>;
  listActiveFraudBlocks(): Promise<FraudBlock[]>;
  getFraudBlock(id: string): Promise<FraudBlock | null>;
  countFraudEventsSince(since: string): Promise<number>;
  countActiveFraudBlocks(): Promise<number>;
  /** Mark a block lifted; returns false if already lifted/expired/missing. */
  liftFraudBlock(id: string, liftedBy: string): Promise<boolean>;
  /** True if a block for this kind+signal+rule was lifted at/after `sinceIso`. */
  wasFraudBlockLifted(kind: FraudSignalKind, signalHash: string, rule: string, sinceIso: string): Promise<boolean>;
}
