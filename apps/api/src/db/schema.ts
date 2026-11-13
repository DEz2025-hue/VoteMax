import {
  pgSchema,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  bigint,
  integer,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

// Schemas mirror the logical security domains in EMP-ARCH-001 section 6.
export const adminSchema = pgSchema('admin');
export const auditSchema = pgSchema('audit');
export const identitySchema = pgSchema('identity');
// ballot (D3) holds ciphertext only — never a voter/session identifier
// (EMP-SEC-001 SEC-BAL-02). Append-only at the DB level (SEC-BAL-03).
export const ballotSchema = pgSchema('ballot');
export const resultsSchema = pgSchema('results');
// fraud holds anti-abuse signals (SEC-VOT-10). All identifiers are salted
// hashes — never raw IPs, device fingerprints, or voter IDs — and signals
// are never joined to ballot records (SEC-BAL-02).
export const fraudSchema = pgSchema('fraud');

export const roleEnum = pgEnum('role', [
  'platform_admin',
  'organization_owner',
  'committee_chair',
  'election_admin',
  'voter_registrar',
  'candidate',
  'voter',
  'station_officer',
  'observer',
  'auditor',
]);

export const organizations = adminSchema.table('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = adminSchema.table('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  // NULL organization = platform-level user (e.g. platform administrator).
  organizationId: uuid('organization_id').references(() => organizations.id),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  // scrypt hash (node:crypto) + RFC 6238 TOTP secret; never store plaintext.
  passwordHash: text('password_hash'),
  totpSecret: text('totp_secret'),
  mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = adminSchema.table('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const electionStateEnum = pgEnum('election_state', [
  'DRAFT',
  'CONFIGURED',
  'REGISTRATION',
  'REGISTER_FROZEN',
  'READY',
  'OPEN',
  'SUSPENDED',
  'CLOSED',
  'TALLIED',
  'VERIFIED',
  'RECOUNT',
  'CERTIFIED',
  'PUBLISHED',
  'ARCHIVED',
  'CANCELLED',
]);

export const elections = adminSchema.table('elections', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  state: electionStateEnum('state').notNull().default('DRAFT'),
  timezone: text('timezone').notNull().default('Africa/Monrovia'),
  votingOpensAt: timestamp('voting_opens_at', { withTimezone: true }),
  votingClosesAt: timestamp('voting_closes_at', { withTimezone: true }),
  ballotOrderPolicy: text('ballot_order_policy').notNull().default('fixed'),
  registerHash: text('register_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const positions = adminSchema.table('positions', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  title: text('title').notNull(),
  seats: integer('seats').notNull().default(1),
  maxChoices: integer('max_choices').notNull().default(1),
  allowAbstain: boolean('allow_abstain').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const candidates = adminSchema.table('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  positionId: uuid('position_id')
    .notNull()
    .references(() => positions.id),
  fullName: text('full_name').notNull(),
  statement: text('statement'),
  photoUrl: text('photo_url'),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stations = adminSchema.table('stations', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const voterStatusEnum = pgEnum('voter_status', [
  'pending',
  'eligible',
  'ineligible',
  'duplicate_unresolved',
  'suspended',
]);

export const voterRecords = identitySchema.table('voter_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  studentId: text('student_id').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  status: voterStatusEnum('status').notNull().default('pending'),
  statusReason: text('status_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One entitlement per voter per election (FR-VOT-004).
// Consumption happens atomically in Phase 3 (SEC-VOT-02).
export const entitlements = identitySchema.table('entitlements', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  voterRecordId: uuid('voter_record_id')
    .notNull()
    .unique()
    .references(() => voterRecords.id),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  // Receipt returned to the voter; set atomically with consumption (SEC-VOT-04).
  receiptId: text('receipt_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One-time-code challenges (DEC-004). Identity domain: linked to the voter
// record, never to a ballot. Single use, attempt-limited, short-lived.
export const otpChallenges = identitySchema.table('otp_challenges', {
  key: text('key').primaryKey(), // `${electionId}:${voterRecordId}`
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  voterRecordId: uuid('voter_record_id')
    .notNull()
    .references(() => voterRecords.id),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
});

// Short-lived ballot sessions (SEC-VOT-09). Token stored hashed; the session
// binds voter+entitlement server-side and is never written to ballot records.
export const ballotSessions = identitySchema.table('ballot_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  voterRecordId: uuid('voter_record_id')
    .notNull()
    .references(() => voterRecords.id),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  entitlementId: uuid('entitlement_id')
    .notNull()
    .references(() => entitlements.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  channel: text('channel', { enum: ['online', 'assisted'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roleAssignments = adminSchema.table('role_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  role: roleEnum('role').notNull(),
  electionId: uuid('election_id'),
  stationId: uuid('station_id'),
  grantedBy: uuid('granted_by').references(() => users.id),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
  validTo: timestamp('valid_to', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only, hash-chained audit records (SEC-AUD-02). Never contains
// ballot selections or voter-ballot linkage (SEC-AUD-04).
export const auditRecords = auditSchema.table('audit_records', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  organizationId: uuid('organization_id'),
  // text, not uuid: audit actors include system literals ('bootstrap').
  actorId: text('actor_id'),
  action: text('action').notNull(),
  scope: text('scope').notNull(),
  outcome: text('outcome').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  prevHash: text('prev_hash').notNull(),
  hash: text('hash').notNull(),
});

// Transactional outbox for audit appends. Mutations write the audit intent
// here inside their own transaction (atomic, no lock, fully parallel); a
// single drainer then computes the hash chain and copies rows into
// audit.audit_records in batches. This keeps SEC-AUD atomicity while
// removing the per-mutation serialized round-trips that capped throughput.
export const auditOutbox = auditSchema.table('audit_outbox', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sealed ballot store (EMP-PROTO-001 Option C). Ciphertext only; the schema
// has no column that could link a ballot to a voter (SEC-BAL-01/02).
// Append-only is enforced by trigger in migration 0002.
export const ballots = ballotSchema.table('ballots', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  ciphertext: text('ciphertext').notNull(),
  iv: text('iv').notNull(),
  authTag: text('auth_tag').notNull(),
  ciphertextHash: text('ciphertext_hash').notNull(),
  // Minute-bucketed timestamp resists timing correlation (SEC-BAL-05).
  coarseTimestamp: timestamp('coarse_timestamp', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Idempotency keys for ballot submission (SEC-VOT-04): replay returns the
// original receipt, never a second ballot.
export const ballotIdempotencyKeys = ballotSchema.table('idempotency_keys', {
  entitlementId: uuid('entitlement_id')
    .notNull()
    .references(() => entitlements.id),
  key: text('key').notNull(),
  receiptId: text('receipt_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.entitlementId, t.key] })]);

// Per-election ballot encryption keys. MOCK single-key custody — DEC-006
// threshold custody is an open hold point (F-02); this table exists so keys
// survive restarts, not as a custody approval.
export const electionKeys = ballotSchema.table('election_keys', {
  electionId: uuid('election_id')
    .primaryKey()
    .references(() => elections.id),
  keyBase64: text('key_base64').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Tally runs: multi-party authorized executions with evidence root (T9/T10).
export const tallyRuns = resultsSchema.table('tally_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  electionId: uuid('election_id')
    .notNull()
    .references(() => elections.id),
  ballotCount: integer('ballot_count').notNull(),
  counts: jsonb('counts').$type<Record<string, number>>().notNull(),
  evidenceRoot: text('evidence_root').notNull(),
  tallyHash: text('tally_hash').notNull(),
  authorizedBy: text('authorized_by').notNull(),
  executedBy: text('executed_by').notNull(),
  approvers: jsonb('approvers').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const certifications = resultsSchema.table('certifications', {
  electionId: uuid('election_id')
    .primaryKey()
    .references(() => elections.id),
  certifiedBy: text('certified_by').notNull(),
  secondApprover: text('second_approver').notNull(),
  tallyHash: text('tally_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Anti-fraud (SEC-VOT-10, SCALE s.5.5) ----
// One row per observed signal per request. signalHash is a salted SHA-256 of
// the raw signal (IP, device fingerprint, or actor ref); refHash correlates a
// signal to an actor without storing the identifier. electionId is a plain
// uuid (no FK): forensic rows must never break request handling, and garbage
// ids in URLs must not violate constraints.
export const fraudSignals = fraudSchema.table('signals', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  electionId: uuid('election_id'),
  kind: text('kind', { enum: ['ip', 'device', 'actor'] }).notNull(),
  signalHash: text('signal_hash').notNull(),
  refHash: text('ref_hash'),
  surface: text('surface').notNull(),
  uaClass: text('ua_class'),
  score: integer('score').notNull().default(0),
  action: text('action').notNull().default('allow'),
  meta: jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  index('fraud_signals_lookup').on(t.kind, t.signalHash, t.createdAt),
  index('fraud_signals_election').on(t.electionId, t.kind, t.createdAt),
]);

// Rule firings — the reviewable record behind every non-allow decision.
export const fraudEvents = fraudSchema.table('events', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
  electionId: uuid('election_id'),
  rule: text('rule').notNull(),
  score: integer('score').notNull(),
  action: text('action').notNull(),
  reasons: jsonb('reasons').$type<string[]>().notNull(),
  signalKind: text('signal_kind'),
  signalHash: text('signal_hash'),
  refHash: text('ref_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('fraud_events_election').on(t.electionId, t.createdAt),
]);

// Active blocks: a matched (kind, signalHash, electionId-or-global) row
// rejects requests before rules run. Blocks expire; lifting is audited.
export const fraudBlocks = fraudSchema.table('blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: text('kind', { enum: ['ip', 'device', 'actor'] }).notNull(),
  signalHash: text('signal_hash').notNull(),
  // NULL = global block across all elections; set = election-scoped.
  electionId: uuid('election_id'),
  rule: text('rule').notNull(),
  reason: text('reason').notNull(),
  score: integer('score').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  liftedAt: timestamp('lifted_at', { withTimezone: true }),
  liftedBy: text('lifted_by'),
}, (t) => [
  index('fraud_blocks_lookup').on(t.kind, t.signalHash),
]);

export type Role = (typeof roleEnum.enumValues)[number];
