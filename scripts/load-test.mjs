/**
 * Local load harness (dev machine) — NOT gate evidence.
 * Gate evidence requires k6 on production-like infrastructure
 * (load/k6-voting.js, EMP-SCALE-001 s.7). This harness checks functional
 * behaviour under concurrency: no duplicates, no lost accepted ballots.
 *
 * Usage: node scripts/load-test.mjs [voters=600] [concurrency=200]
 * Expects the API at API_URL (default http://localhost:4000). Admin calls
 * use session tokens with per-endpoint capabilities (F-03/F-05).
 */
import { apiPost, apiGet, setupPilotElection } from './election-setup.mjs';

const API = process.env.API_URL ?? 'http://localhost:4000';
const VOTERS = Number(process.argv[2] ?? 600);
const CONCURRENCY = Number(process.argv[3] ?? 200);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const stamp = Date.now().toString(36);
const lines = ['studentId,fullName,email'];
for (let i = 1; i <= VOTERS; i++) lines.push(`L${i},Voter ${i},v${i}@x.edu`);

const setup = await setupPilotElection(API, {
  orgName: `Load U ${stamp}`, slug: `load-${stamp}`,
  electionName: 'Load Election', csv: lines.join('\n'),
});
const { electionId: elId, positionId: posId, candidateId: candId } = setup;
const token = setup.tokens.admin;

console.log(`Load: ${VOTERS} voters, concurrency ${CONCURRENCY}, election ${elId}`);
const durations = [];
let errors = 0;
let next = 1;

async function worker() {
  while (next <= VOTERS) {
    const n = next++;
    const studentId = `L${n}`;
    try {
      const otp = await apiPost(API, `/elections/${elId}/voting/otp/request`, { studentId });
      const ver = await apiPost(API, `/elections/${elId}/voting/otp/verify`, { studentId, code: otp.data.devCode });
      const started = performance.now();
      const sub = await apiPost(API, '/voting/submit', {
        ballotSession: ver.data.ballotSession,
        selections: { [posId]: [candId] },
        idempotencyKey: `load-${studentId}`,
      });
      durations.push(performance.now() - started);
      if (sub.status !== 201 && sub.status !== 200) errors++;
    } catch {
      errors++;
    }
  }
}

const startedAll = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
const elapsedS = (performance.now() - startedAll) / 1000;

const partRes = await apiGet(API, `/elections/${elId}/participation`, token);
const part = partRes.data;
const ok = part.ballotsCast === VOTERS && errors === 0;
console.log(JSON.stringify({
  voters: VOTERS, concurrency: CONCURRENCY, elapsedSeconds: Math.round(elapsedS * 10) / 10,
  ballotsCast: part.ballotsCast, errors,
  submitP95ms: Math.round(percentile(durations, 95)),
  submitP99ms: Math.round(percentile(durations, 99)),
  integrity: ok ? 'PASS (ballots == voters, zero errors)' : 'FAIL',
}, null, 2));
process.exit(ok ? 0 : 1);
