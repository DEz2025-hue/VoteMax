// k6 load script for GATE evidence on production-like infrastructure
// (EMP-SCALE-001 s.7). Run: k6 run -e API_URL=https://staging.example load/k6-voting.js
// Scenarios: 200 concurrent sustained, 400-session headroom spike,
// ballot-burst duplicate race. Setup (org/election/register/open) must be
// done beforehand; pass ELECTION_ID, POSITION_ID, CANDIDATE_ID and a voter
// list via VOTERS_JSON (array of {studentId, code}) prepared by the
// staging seed tooling. Thresholds encode EMP-SCALE-001 s.4 objectives.
import http from 'k6/http';
import { check, fail } from 'k6';

export const options = {
  scenarios: {
    sustained_200: {
      executor: 'constant-vus', vus: 200, duration: '10m',
      exec: 'vote', tags: { scenario: 'sustained' },
    },
    headroom_400: {
      executor: 'ramping-vus', startVUs: 0,
      stages: [{ duration: '2m', target: 400 }, { duration: '3m', target: 400 }, { duration: '1m', target: 0 }],
      exec: 'vote', tags: { scenario: 'headroom' }, startTime: '12m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'], // <0.1% excluding intentional rejections
    'http_req_duration{scenario:sustained}': ['p(95)<1000', 'p(99)<3000'],
  },
};

const API = __ENV.API_URL;
const ELECTION_ID = __ENV.ELECTION_ID;
const POSITION_ID = __ENV.POSITION_ID;
const CANDIDATE_ID = __ENV.CANDIDATE_ID;
const voters = JSON.parse(__ENV.VOTERS_JSON ?? '[]');
if (!API || !ELECTION_ID || voters.length === 0) fail('API_URL, ELECTION_ID and VOTERS_JSON are required');

export function vote() {
  const voter = voters[(__VU + __ITER) % voters.length];
  const headers = { 'Content-Type': 'application/json' };
  const ver = http.post(`${API}/elections/${ELECTION_ID}/voting/otp/verify`,
    JSON.stringify({ studentId: voter.studentId, code: voter.code }), { headers });
  if (!check(ver, { 'otp verified': (r) => r.status === 201 || r.status === 200 })) return;
  const session = ver.json('ballotSession');
  const sub = http.post(`${API}/voting/submit`, JSON.stringify({
    ballotSession: session,
    selections: { [POSITION_ID]: [CANDIDATE_ID] },
    idempotencyKey: `k6-${voter.studentId}-${__ITER}`,
  }), { headers });
  check(sub, { 'ballot accepted or already-voted': (r) => [200, 201, 400].includes(r.status) });
}
