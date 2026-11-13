/**
 * Failure drill: kill the API mid-election, restart, and check whether
 * accepted ballots survive. Builds the API first if dist is stale.
 *
 * With DATABASE_URL set (Postgres store), committed ballots MUST survive —
 * that is the F-01 acceptance check. Without DATABASE_URL the in-memory
 * store loses them by design; the drill reports that honestly.
 */
import { spawn } from 'node:child_process';
import { apiPost, apiGet, setupPilotElection } from './election-setup.mjs';

const PORT = 4100;
const API = `http://localhost:${PORT}`;

function startApi() {
  const child = spawn('node', ['apps/api/dist/main.js'], {
    env: { ...process.env, API_PORT: String(PORT) },
    stdio: 'ignore',
  });
  return child;
}

async function waitUp() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${API}/health`); if (r.ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API did not come up');
}

const durable = Boolean(process.env.DATABASE_URL);

let api = startApi();
await waitUp();
const setup = await setupPilotElection(API, {
  orgName: 'Drill U', slug: `drill-${Date.now().toString(36)}`,
  electionName: 'Drill Election',
  csv: 'studentId,fullName,email\nD001,Drill Voter,d@x.edu',
});
const { electionId, positionId, candidateId } = setup;
const token = setup.tokens.admin;

const otp = await apiPost(API, `/elections/${electionId}/voting/otp/request`, { studentId: 'D001' });
const ver = await apiPost(API, `/elections/${electionId}/voting/otp/verify`, { studentId: 'D001', code: otp.data.devCode });
const sub = await apiPost(API, '/voting/submit', {
  ballotSession: ver.data.ballotSession,
  selections: { [positionId]: [candidateId] },
  idempotencyKey: 'drill-1',
});
console.log(`Ballot accepted before kill: ${sub.status === 201 || sub.status === 200}`);

api.kill('SIGKILL');
await new Promise((r) => setTimeout(r, 1000));
api = startApi();
await waitUp();
const partRes = await apiGet(API, `/elections/${electionId}/participation`, token);
const part = partRes.data;
api.kill('SIGKILL');

const survived = part.ballotsCast === 1;
console.log(JSON.stringify({
  drill: 'api-kill-restart-during-open-election',
  store: durable ? 'postgres' : 'memory',
  ballotsBeforeKill: 1,
  ballotsAfterRestart: part.ballotsCast ?? 0,
  result: survived
    ? 'PASS: committed ballot survived restart (NFR-AVL-004)'
    : durable
      ? 'FAIL: accepted ballot lost on restart despite Postgres store — F-01 NOT fixed'
      : 'EXPECTED-LOSS on in-memory store: accepted ballot lost on restart — set DATABASE_URL and re-run for the F-01 check',
}, null, 2));
process.exit(durable ? (survived ? 0 : 2) : (survived ? 0 : 3));
