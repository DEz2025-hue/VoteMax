/**
 * Mock pre-rehearsal (DRESS_REHEARSAL_PLAN.md s.3, automated subset) -
 * PREPARATION ONLY, never G7 evidence. Exercises the rehearsal script's
 * automatable scenarios over HTTP against a running API: setup/freeze,
 * online + assisted voting, duplicate burst, suspension/resumption,
 * close/reconciliation, tally SoD, certification blocker, verification,
 * recount, certification, publication, and audit verification.
 *
 * Usage: node scripts/pre-rehearsal.mjs
 * Expects the API at API_URL (default http://localhost:4101). Run it
 * against a throwaway store (in-memory or dev DB) with synthetic voters.
 */
import { apiPost, apiGet, login } from './election-setup.mjs';

const API = process.env.API_URL ?? 'http://localhost:4101';
const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} - ${detail}`);
}
const mustOk = (label, r) => {
  if (r.status >= 400) throw new Error(`${label} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
};

const stamp = Date.now().toString(36);
const org = mustOk('org', await apiPost(API, '/organizations', { name: 'Rehearsal U', slug: `reh-${stamp}` }));
const mkUser = async (tag, name) =>
  mustOk(`user ${tag}`, await apiPost(API, '/users', {
    organizationId: org.id, email: `${tag}-${stamp}@x.edu`, displayName: name, password: 'pw-long-enough',
  }));
const admin = await mkUser('admin', 'Election Admin');
const registrar = await mkUser('reg', 'Registrar');
const chair = await mkUser('chair', 'Committee Chair');
const ap1 = await mkUser('ap1', 'Approver One');
const ap2 = await mkUser('ap2', 'Approver Two');
const auditor = await mkUser('aud', 'Auditor');
const officer = await mkUser('off', 'Station Officer');

mustOk('owner role', await apiPost(API, '/roles', { organizationId: org.id, userId: admin.id, role: 'organization_owner' }));
const adminToken = await login(API, `admin-${stamp}@x.edu`, 'pw-long-enough', admin.totpSecret);
mustOk('admin role', await apiPost(API, '/roles', { organizationId: org.id, userId: admin.id, role: 'election_admin' }, adminToken));

const el = mustOk('election', await apiPost(API, '/elections', {
  organizationId: org.id, name: 'Rehearsal Election',
  votingOpensAt: new Date(Date.now() - 3600_000).toISOString(),
  votingClosesAt: new Date(Date.now() + 3600_000).toISOString(),
}, adminToken));
const assign = (userId, role, extra = {}) =>
  apiPost(API, '/roles', { organizationId: org.id, userId, role, electionId: el.id, ...extra }, adminToken).then((r) => mustOk(`role ${role}`, r));
await assign(registrar.id, 'voter_registrar');
await assign(chair.id, 'committee_chair');
await assign(auditor.id, 'auditor');
await assign(ap1.id, 'auditor');
await assign(ap2.id, 'observer');
const registrarToken = await login(API, `reg-${stamp}@x.edu`, 'pw-long-enough', registrar.totpSecret);
const chairToken = await login(API, `chair-${stamp}@x.edu`, 'pw-long-enough', chair.totpSecret);
const auditorToken = await login(API, `aud-${stamp}@x.edu`, 'pw-long-enough', auditor.totpSecret);

const pos1 = mustOk('pos1', await apiPost(API, `/elections/${el.id}/positions`, { title: 'President', seats: 1, maxChoices: 1 }, adminToken));
const pos2 = mustOk('pos2', await apiPost(API, `/elections/${el.id}/positions`, { title: 'Vice President', seats: 1, maxChoices: 1 }, adminToken));
const ada = mustOk('cand', await apiPost(API, `/elections/${el.id}/candidates`, { positionId: pos1.id, fullName: 'Ada' }, adminToken));
const ben = mustOk('cand', await apiPost(API, `/elections/${el.id}/candidates`, { positionId: pos1.id, fullName: 'Ben' }, adminToken));
const cid = mustOk('cand', await apiPost(API, `/elections/${el.id}/candidates`, { positionId: pos2.id, fullName: 'Cid' }, adminToken));
const dee = mustOk('cand', await apiPost(API, `/elections/${el.id}/candidates`, { positionId: pos2.id, fullName: 'Dee' }, adminToken));
const station = mustOk('station', await apiPost(API, `/elections/${el.id}/stations`, { name: 'Main Hall' }, adminToken));
await assign(officer.id, 'station_officer', { stationId: station.id });
const officerToken = await login(API, `off-${stamp}@x.edu`, 'pw-long-enough', officer.totpSecret);

mustOk('CONFIGURED', await apiPost(API, `/elections/${el.id}/transition`, { to: 'CONFIGURED' }, adminToken));
mustOk('REGISTRATION', await apiPost(API, `/elections/${el.id}/transition`, { to: 'REGISTRATION' }, adminToken));
const lines = ['studentId,fullName,email'];
for (let i = 1; i <= 30; i++) lines.push(`R${String(i).padStart(3, '0')},Voter ${i},r${i}@x.edu`);
mustOk('import', await apiPost(API, `/elections/${el.id}/register/import`, { csv: lines.join('\n') }, registrarToken));
const frozen = mustOk('freeze', await apiPost(API, `/elections/${el.id}/register/freeze`, {}, chairToken));
mustOk('READY', await apiPost(API, `/elections/${el.id}/transition`, { to: 'READY' }, chairToken));
mustOk('OPEN', await apiPost(API, `/elections/${el.id}/transition`, { to: 'OPEN' }, chairToken));
record('S1', 'Setup: 2 positions, 30-voter register, freeze, READY, OPEN',
  Boolean(frozen.registerHash), `registerHash=${frozen.registerHash?.slice(0, 12)}…`);

async function voteOnline(studentId, selections, key) {
  const otp = mustOk('otp', await apiPost(API, `/elections/${el.id}/voting/otp/request`, { studentId }));
  const ver = mustOk('verify', await apiPost(API, `/elections/${el.id}/voting/otp/verify`, { studentId, code: otp.devCode }));
  return apiPost(API, '/voting/submit', { ballotSession: ver.ballotSession, selections, idempotencyKey: key ?? `reh-${studentId}` });
}
for (let i = 1; i <= 10; i++) {
  const sid = `R${String(i).padStart(3, '0')}`;
  const r = await voteOnline(sid, { [pos1.id]: [i <= 6 ? ada.id : ben.id], [pos2.id]: [i <= 5 ? cid.id : dee.id] });
  if (r.status >= 400) throw new Error(`vote ${sid} failed: ${JSON.stringify(r.data)}`);
}
let part = mustOk('participation', await apiGet(API, `/elections/${el.id}/participation`, adminToken));
record('S2', 'Online voting + aggregate participation',
  part.ballotsCast === 10 && Object.keys(part).sort().join(',') === 'ballotsCast,eligible,turnoutPercent',
  JSON.stringify(part));

// Duplicate burst: one voter, four sessions, concurrent submits -> exactly one ballot.
const sessions = [];
for (let i = 0; i < 4; i++) {
  const otp = mustOk('otp burst', await apiPost(API, `/elections/${el.id}/voting/otp/request`, { studentId: 'R011' }));
  const ver = mustOk('verify burst', await apiPost(API, `/elections/${el.id}/voting/otp/verify`, { studentId: 'R011', code: otp.devCode }));
  sessions.push(ver.ballotSession);
}
const burst = await Promise.all(sessions.map((s, i) =>
  apiPost(API, '/voting/submit', { ballotSession: s, selections: { [pos1.id]: [ada.id] }, idempotencyKey: `burst-${i}` })));
const accepted = burst.filter((r) => r.status < 300).length;
part = mustOk('participation', await apiGet(API, `/elections/${el.id}/participation`, adminToken));
record('S3', 'Duplicate burst under concurrency (FR-VTG-005)',
  accepted === 1 && part.ballotsCast === 11, `accepted=${accepted}, ballotsCast=${part.ballotsCast}`);

// Suspension blocks voting; resumption restores it (rehearsal incident inject 3, lifecycle T6/T7).
mustOk('SUSPEND', await apiPost(API, `/elections/${el.id}/transition`, { to: 'SUSPENDED' }, chairToken));
const blocked = await apiPost(API, `/elections/${el.id}/voting/otp/request`, { studentId: 'R013' });
mustOk('RESUME', await apiPost(API, `/elections/${el.id}/transition`, { to: 'OPEN' }, chairToken));
const after = await voteOnline('R013', { [pos1.id]: [ben.id] });
record('S4', 'Suspension blocks voting; resumption restores it',
  blocked.status >= 400 && after.status < 300, `during=${blocked.status}, after=${after.status}`);

// Assisted station flow; an unassigned user cannot open a session.
const denied = await apiPost(API, `/elections/${el.id}/stations/${station.id}/session`, { officerUserId: ap1.id, studentId: 'R012' }, adminToken);
const assisted = mustOk('assisted', await apiPost(API, `/elections/${el.id}/stations/${station.id}/session`, { officerUserId: officer.id, studentId: 'R012' }, officerToken));
const assistedSubmit = await apiPost(API, '/voting/submit', { ballotSession: assisted.ballotSession, selections: { [pos1.id]: [ben.id] }, idempotencyKey: 'reh-assisted' });
record('S5', 'Assisted station flow requires the assigned officer',
  denied.status >= 400 && assistedSubmit.status < 300, `denied=${denied.status}, assisted=${assistedSubmit.status}`);

const close = mustOk('close', await apiPost(API, `/elections/${el.id}/close`, {}, chairToken));
record('S6', 'Close + reconciliation', close.reconciled === true && close.ballotsCast === 13, JSON.stringify(close));

const forged = await apiPost(API, `/elections/${el.id}/tally`, { authorizedBy: admin.id, approvers: [ap1.id, ap2.id] }, adminToken);
record('S7', 'Tally authorization cannot be forged by a non-chair', forged.status >= 400, `status=${forged.status}`);
const run = mustOk('tally', await apiPost(API, `/elections/${el.id}/tally`, { authorizedBy: chair.id, approvers: [ap1.id, ap2.id] }, adminToken));

const earlyCertify = await apiPost(API, `/elections/${el.id}/certify`, { certifiedBy: chair.id, secondApprover: ap1.id }, chairToken);
record('S8', 'Certification refused before verification (blocker)', earlyCertify.status >= 400, `status=${earlyCertify.status}`);

const verify = mustOk('verify', await apiPost(API, `/elections/${el.id}/tally/verify`, {}, auditorToken));
const recount = mustOk('recount', await apiPost(API, `/elections/${el.id}/tally/recount`, { authorizedBy: chair.id, approvers: [ap1.id, ap2.id] }, adminToken));
record('S9', 'Independent verification + recount reproduces tally hash',
  verify.verified === true && recount.tallyHash === run.tallyHash, `verified=${verify.verified}, hashMatch=${recount.tallyHash === run.tallyHash}`);

mustOk('verify2', await apiPost(API, `/elections/${el.id}/tally/verify`, {}, auditorToken));
mustOk('certify', await apiPost(API, `/elections/${el.id}/certify`, { certifiedBy: chair.id, secondApprover: ap1.id }, chairToken));
const report = mustOk('publish', await apiPost(API, `/elections/${el.id}/publish`, {}, adminToken));
const audit = mustOk('audit', await apiGet(API, `/audit?organizationId=${org.id}`, auditorToken));
const auditLeak = JSON.stringify(audit.records).includes(ada.id);
record('S10', 'Certify, publish, structured report + verified audit chain',
  report.election.state === 'PUBLISHED' && audit.verified === true && !auditLeak,
  `state=${report.election.state}, auditVerified=${audit.verified}, records=${audit.records.length}, candidateLeak=${auditLeak}`);

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({
  rehearsal: 'mock pre-rehearsal (NOT G7 evidence)', api: API,
  scenarios: results.length, passed: results.length - failed.length, failed: failed.length,
  tallyBallots: run.ballotCount, tallyHash: run.tallyHash,
}, null, 2));
process.exit(failed.length ? 1 : 0);
