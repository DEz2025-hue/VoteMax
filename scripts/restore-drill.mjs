/**
 * Restore drill (READINESS_CHECKLIST item 12 evidence): take a logical
 * snapshot of every table, wipe the database, restore from the snapshot,
 * and verify row counts + the audit hash chain. Run against a dev/staging
 * database only — this is a procedure rehearsal, not a production backup
 * mechanism (Neon PITR/snapshots remain the production answer).
 *
 *   node --env-file=.env scripts/restore-drill.mjs
 *
 * Requires DATABASE_URL. Snapshot is written to the OS temp dir and
 * contains voter data — never commit it.
 */
import { Client } from 'pg';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyChain } from '../apps/api/dist/audit/audit-chain.js';

// FK-safe insert order (parents before children). identity=true marks
// GENERATED ALWAYS AS IDENTITY tables that need OVERRIDING SYSTEM VALUE.
const TABLES = [
  ['admin', 'organizations'],
  ['admin', 'users'],
  ['admin', 'sessions'],
  ['admin', 'elections'],
  ['admin', 'positions'],
  ['admin', 'candidates'],
  ['admin', 'stations'],
  ['admin', 'role_assignments'],
  ['identity', 'voter_records'],
  ['identity', 'entitlements'],
  ['identity', 'otp_challenges'],
  ['identity', 'ballot_sessions'],
  ['ballot', 'election_keys'],
  ['ballot', 'ballots'],
  ['ballot', 'idempotency_keys'],
  ['results', 'tally_runs'],
  ['results', 'certifications'],
  ['audit', 'audit_records', true],
  ['audit', 'audit_outbox', true],
];

const q = (s, t) => `"${s}"."${t}"`;
const client = new Client({ connectionString: process.env.DATABASE_URL });
const started = Date.now();

function chainEntries(rows) {
  return rows.map((r) => ({
    organizationId: r.organization_id, actorId: r.actor_id, action: r.action,
    scope: r.scope, outcome: r.outcome,
    createdAt: new Date(r.created_at).toISOString(),
    prevHash: r.prev_hash, hash: r.hash,
  }));
}

await client.connect();

// 1. Snapshot
const snapshot = {};
const before = {};
for (const [s, t, identity] of TABLES) {
  const { rows } = await client.query(`SELECT * FROM ${q(s, t)}`);
  snapshot[`${s}.${t}`] = { identity: Boolean(identity), rows };
  before[`${s}.${t}`] = rows.length;
}
const dir = join(tmpdir(), 'votery-restore-drill');
mkdirSync(dir, { recursive: true });
const file = join(dir, `snapshot-${Date.now()}.json`);
writeFileSync(file, JSON.stringify(snapshot));
console.log(`snapshot: ${file} (${Object.values(before).reduce((a, b) => a + b, 0)} rows)`);

// 2. Verify audit chain BEFORE the wipe
const { rows: auditBefore } = await client.query(
  `SELECT * FROM "audit"."audit_records" ORDER BY id`);
const chainBefore = verifyChain(chainEntries(auditBefore));

// 3. Wipe
await client.query(
  `TRUNCATE ${TABLES.map(([s, t]) => q(s, t)).join(', ')} CASCADE`);
const { rows: countsAfterWipe } = await client.query(
  `SELECT (SELECT count(*) FROM "audit"."audit_records") +
          (SELECT count(*) FROM "ballot"."ballots") AS n`);
if (Number(countsAfterWipe[0].n) !== 0) throw new Error('wipe failed: rows remain');

// 4. Restore in FK order, batched
const CHUNK = 500;
for (const [s, t, identity] of TABLES) {
  const { rows, identity: isIdentity } = snapshot[`${s}.${t}`];
  if (rows.length === 0) continue;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const override = isIdentity ? ' OVERRIDING SYSTEM VALUE' : '';
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    for (const row of batch) {
      const ph = cols.map((c) => {
        params.push(row[c]);
        return `$${params.length}`;
      });
      values.push(`(${ph.join(', ')})`);
    }
    await client.query(
      `INSERT INTO ${q(s, t)} (${colList})${override} VALUES ${values.join(', ')}`,
      params,
    );
  }
}

// 5. Verify counts + audit chain AFTER restore
let mismatches = [];
for (const [s, t] of TABLES) {
  const key = `${s}.${t}`;
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${q(s, t)}`);
  if (rows[0].n !== before[key]) mismatches.push(`${key}: ${rows[0].n} != ${before[key]}`);
}
const { rows: auditAfter } = await client.query(
  `SELECT * FROM "audit"."audit_records" ORDER BY id`);
const chainAfter = verifyChain(chainEntries(auditAfter));

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const pass = mismatches.length === 0 && chainBefore === -1 && chainAfter === -1;
console.log(JSON.stringify({
  drill: 'logical-snapshot-restore',
  elapsedSeconds: Number(elapsed),
  rowsSnapshotted: Object.values(before).reduce((a, b) => a + b, 0),
  chainBeforeWipe: chainBefore === -1 ? 'valid' : `broken@${chainBefore}`,
  chainAfterRestore: chainAfter === -1 ? 'valid' : `broken@${chainAfter}`,
  countMismatches: mismatches,
  result: pass ? 'PASS' : 'FAIL',
}, null, 2));
await client.end();
process.exit(pass ? 0 : 1);
