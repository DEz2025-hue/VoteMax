import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../db/schema';
import { PostgresStore } from './postgres.store';
import { PlatformService } from '../platform/platform.service';

// Postgres integration tests (F-01 evidence). OPT-IN ONLY: afterAll TRUNCATEs
// every application table, so this suite must never run against a shared or
// production database by accident. Point TEST_DATABASE_URL at a disposable
// database and run explicitly, e.g. (Git Bash):
//   TEST_DATABASE_URL=postgres://votemax:votemax_dev_only@localhost:5432/votemax npm test
// DATABASE_URL is deliberately ignored here — it is the app's live database.
// The suite applies the drizzle migrations itself, so the database must be
// empty or already migrated. Deliberately not loaded from .env files: the
// opt-in must come from the command line, not ambient config.
const TEST_URL = process.env.TEST_DATABASE_URL;
const RUN = Boolean(TEST_URL);
const d = RUN ? describe : describe.skip;

let pool: Pool;
let db: ReturnType<typeof drizzle>;
let store: PostgresStore;
let svc: PlatformService;

beforeAll(async () => {
  if (!RUN) return;
  pool = new Pool({ connectionString: TEST_URL });
  db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  store = new PostgresStore(db);
  svc = new PlatformService(store);
}, 180000);

// Leave the database clean: test rows would otherwise keep first-run
// bootstrap closed and pollute shared dev/staging databases.
afterAll(async () => {
  if (!RUN || !pool) return;
  const { rows } = await pool.query(
    `SELECT table_schema || '.' || table_name AS t
     FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.t.split('.')[0]}"."${r.t.split('.')[1]}"`).join(', ');
  await pool.query(`TRUNCATE ${list} CASCADE`);
  await pool.end();
}, 180000);

d('PostgresStore (F-01 durability)', () => {
  it('runs the full election lifecycle with durable state', async () => {
    const stamp = Date.now().toString(36);
    const org = await svc.createOrganization(null, `PG U ${stamp}`, `pg-${stamp}`);
    const admin = await svc.createUser(org.id, `a-${stamp}@x.edu`, 'Admin', 'pw-long-enough');
    const reg = await svc.createUser(org.id, `r-${stamp}@x.edu`, 'Registrar', 'pw-long-enough');
    const chair = await svc.createUser(org.id, `c-${stamp}@x.edu`, 'Chair', 'pw-long-enough');
    const ap1 = await svc.createUser(org.id, `p1-${stamp}@x.edu`, 'Approver 1', 'pw-long-enough');
    const ap2 = await svc.createUser(org.id, `p2-${stamp}@x.edu`, 'Approver 2', 'pw-long-enough');
    await svc.assignRole(admin.id, org.id, admin.id, 'organization_owner');
    await svc.assignRole(admin.id, org.id, reg.id, 'organization_owner');
    await svc.assignRole(admin.id, org.id, chair.id, 'organization_owner');
    await svc.assignRole(admin.id, org.id, ap1.id, 'auditor');
    await svc.assignRole(admin.id, org.id, ap2.id, 'auditor');

    const el = await svc.createElection(admin.id, org.id, {
      name: 'PG Election', votingOpensAt: new Date(Date.now() - 3600_000).toISOString(),
      votingClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const pos = await svc.addPosition(admin.id, el.id, 'President', 1, 1);
    const cand = await svc.addCandidate(admin.id, el.id, pos.id, 'Ada');
    await svc.transition(admin.id, el.id, 'CONFIGURED');
    await svc.transition(admin.id, el.id, 'REGISTRATION');
    await svc.importRegister(reg.id, el.id, 'memberId,fullName,email\nP001,Pat,pat@x.edu\nP002,Sam,sam@x.edu');
    await svc.freezeRegister(chair.id, el.id);
    await svc.transition(chair.id, el.id, 'READY');
    await svc.transition(chair.id, el.id, 'OPEN');

    for (const [member, key] of [['P001', 'k1'], ['P002', 'k2']] as const) {
      const { devCode } = await svc.requestOtp(el.id, member);
      const { ballotSession } = await svc.verifyOtp(el.id, member, devCode!);
      await svc.submitBallot(ballotSession, { [pos.id]: [cand.id] }, key);
    }

    // "Restart": a brand-new store + service over the same database must see
    // the accepted ballots — the F-01 acceptance criterion.
    const store2 = new PostgresStore(db);
    const svc2 = new PlatformService(store2);
    await expect(svc2.participation(el.id)).resolves.toMatchObject({ ballotsCast: 2 });
    await expect(svc2.store.verifyAuditChain()).resolves.toBe(true);

    await svc2.closeElection(chair.id, el.id);
    const run = await svc2.tally(admin.id, el.id, { authorizedBy: chair.id, approvers: [ap1.id, ap2.id] });
    expect(run.ballotCount).toBe(2);
    expect(run.counts[cand.id]).toBe(2);
    expect((await svc2.verifyTally(el.id)).verified).toBe(true);
    await svc2.certify(chair.id, el.id, { certifiedBy: chair.id, secondApprover: ap1.id });
    const report = await svc2.publish(admin.id, el.id);
    expect(report.election.state).toBe('PUBLISHED');
    expect(report.certification?.tallyHash).toBe(run.tallyHash);
  }, 180000);

  it('acceptBallot is atomic: idempotent replay and single consumption', async () => {
    const stamp = `x${Date.now().toString(36)}`;
    const org = await svc.createOrganization(null, `PG X ${stamp}`, `pgx-${stamp}`);
    const admin = await svc.createUser(org.id, `xa-${stamp}@x.edu`, 'Admin', 'pw-long-enough');
    const el = await svc.createElection(admin.id, org.id, {
      name: 'X', votingOpensAt: new Date(Date.now() - 3600_000).toISOString(),
      votingClosesAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    const pos = await svc.addPosition(admin.id, el.id, 'P', 1, 1);
    const cand = await svc.addCandidate(admin.id, el.id, pos.id, 'C');
    await svc.transition(admin.id, el.id, 'CONFIGURED');
    await svc.transition(admin.id, el.id, 'REGISTRATION');
    await svc.importRegister(admin.id, el.id, 'memberId,fullName,email\nX1,X One,x1@x.edu');
    await svc.freezeRegister(admin.id, el.id);
    await svc.transition(admin.id, el.id, 'READY');
    await svc.transition(admin.id, el.id, 'OPEN');

    // Three ballot sessions opened before the first vote; once voted, new codes are refused.
    const open = async () => {
      const { devCode } = await svc.requestOtp(el.id, 'X1');
      return (await svc.verifyOtp(el.id, 'X1', devCode!)).ballotSession;
    };
    const s1 = await open();
    const s2 = await open();
    const s3 = await open();
    const r1 = await svc.submitBallot(s1, { [pos.id]: [cand.id] }, 'idem-1');
    expect(r1.alreadyRecorded).toBe(false);

    const r2 = await svc.submitBallot(s2, { [pos.id]: [cand.id] }, 'idem-1');
    expect(r2).toEqual({ receiptId: r1.receiptId, alreadyRecorded: true });

    await expect(svc.submitBallot(s3, { [pos.id]: [cand.id] }, 'idem-2')).rejects.toThrow(/ALREADY_VOTED/);
    await expect(svc.requestOtp(el.id, 'X1')).rejects.toThrow(/ALREADY_VOTED/);
  }, 180000);

  it('ballot and audit tables reject UPDATE/DELETE (append-only triggers)', async () => {
    // Seed one ballot row directly so the per-row trigger actually fires.
    const { rows: [el] } = await pool.query(`SELECT id FROM "admin"."elections" LIMIT 1`);
    await pool.query(
      `INSERT INTO "ballot"."ballots" (election_id, ciphertext, iv, auth_tag, ciphertext_hash, coarse_timestamp)
       VALUES ($1, 'e30=', 'aXY=', 'dGFn', 'hash', now())`,
      [el.id],
    );
    await expect(pool.query(`UPDATE "ballot"."ballots" SET "ciphertext" = 'e30='`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM "ballot"."ballots"`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`UPDATE "audit"."audit_records" SET "outcome" = 'x'`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`DELETE FROM "audit"."audit_records"`)).rejects.toThrow(/append-only/);
  });
});
