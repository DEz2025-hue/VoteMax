import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let electionId: string;
let positionId: string;
let adaId: string;
let benId: string;
let chairId: string;
let executorId: string;
let approver1: string;
let approver2: string;
let owner2Id: string;
let owner3Id: string;

function future(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

async function vote(memberId: string, candidateId: string | null, key?: string): Promise<string> {
  const { devCode } = await svc.requestOtp(electionId, memberId);
  const { ballotSession } = await svc.verifyOtp(electionId, memberId, devCode!);
  const ballot = await svc.ballotForSession(ballotSession);
  const posId = ballot.positions[0].id;
  const receipt = await svc.submitBallot(
    ballotSession,
    candidateId ? { [posId]: [candidateId] } : { [posId]: [] },
    key ?? `key-${memberId}`,
  );
  return receipt.receiptId;
}

// Approvers must sign off themselves before the executor may name them.
const signTally = async (...ids: string[]) => { for (const id of ids) await svc.recordApproval(id, electionId, 'tally'); };
const signCertify = (id: string) => svc.recordApproval(id, electionId, 'certify');

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Example Organization', 'example')).id;
  const admin = await svc.createUser(orgId, 'admin@example.org', 'Admin', 'pw-long-enough');
  executorId = admin.id;
  chairId = (await svc.createUser(orgId, 'chair@example.org', 'Chair', 'pw-long-enough')).id;
  approver1 = (await svc.createUser(orgId, 'ap1@example.org', 'Approver One', 'pw-long-enough')).id;
  approver2 = (await svc.createUser(orgId, 'ap2@example.org', 'Approver Two', 'pw-long-enough')).id;
  owner2Id = (await svc.createUser(orgId, 'owner2@example.org', 'Owner Two', 'pw-long-enough')).id;
  owner3Id = (await svc.createUser(orgId, 'owner3@example.org', 'Owner Three', 'pw-long-enough')).id;
  const registrar = await svc.createUser(orgId, 'reg@example.org', 'Registrar', 'pw-long-enough');

  const election = await svc.createElection(admin.id, orgId, {
    name: 'Organization Election 2026', votingOpensAt: future(-1), votingClosesAt: future(1),
  });
  electionId = election.id;
  await svc.assignRole(admin.id, orgId, admin.id, 'organization_owner', electionId);
  await svc.assignRole(admin.id, orgId, chairId, 'organization_owner', electionId);
  await svc.assignRole(admin.id, orgId, owner2Id, 'organization_owner', electionId);
  await svc.assignRole(admin.id, orgId, owner3Id, 'organization_owner', electionId);
  await svc.assignRole(admin.id, orgId, approver1, 'auditor', electionId);
  await svc.assignRole(admin.id, orgId, approver2, 'auditor', electionId);
  const position = await svc.addPosition(admin.id, electionId, 'President', 1, 1);
  positionId = position.id;
  adaId = (await svc.addCandidate(admin.id, electionId, positionId, 'Ada Kamara')).id;
  benId = (await svc.addCandidate(admin.id, electionId, positionId, 'Ben Kollie')).id;
  await svc.transition(admin.id, electionId, 'CONFIGURED');
  await svc.transition(admin.id, electionId, 'REGISTRATION');
  const lines = ['memberId,fullName,email'];
  for (let i = 1; i <= 6; i++) lines.push(`S00${i},Member ${i},m${i}@example.org`);
  await svc.importRegister(registrar.id, electionId, lines.join('\n'));
  await svc.freezeRegister(registrar.id, electionId);
  await svc.transition(admin.id, electionId, 'READY');
  await svc.transition(admin.id, electionId, 'OPEN');
});

describe('Phase 3 voting and results (mock election)', () => {
  it('runs end-to-end: vote, close, tally, verify, certify, publish', async () => {
    await vote('S001', adaId);
    await vote('S002', adaId);
    await vote('S003', benId);
    await vote('S004', null); // abstain
    await expect(svc.participation(electionId)).resolves.toMatchObject({ eligible: 6, ballotsCast: 4 });
    await expect(svc.submissionStatus(electionId, 'S001')).resolves.toEqual({ hasVoted: true });
    await expect(svc.submissionStatus(electionId, 'S005')).resolves.toEqual({ hasVoted: false });

    const close = await svc.closeElection(executorId, electionId);
    expect(close).toMatchObject({ reconciled: true, ballotsCast: 4, consumedEntitlements: 4 });

    await signTally(approver1, approver2);
    const run = await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    expect(run.ballotCount).toBe(4);
    expect(run.counts[adaId]).toBe(2);
    expect(run.counts[benId]).toBe(1);
    expect(run.counts[`abstain:${positionId}`]).toBe(1);

    expect((await svc.verifyTally(electionId)).verified).toBe(true);
    await signCertify(approver1);
    await svc.certify(chairId, electionId, { certifiedBy: chairId, secondApprover: approver1 });
    const report = await svc.publish(executorId, electionId);
    expect(report.election.state).toBe('PUBLISHED');
    expect(report.positions[0].results[0]).toMatchObject({ candidate: 'Ada Kamara', votes: 2 });
    expect(report.certification?.tallyHash).toBe(run.tallyHash);
  });

  async function certifyAll() {
    await vote('S001', adaId);
    await vote('S002', adaId);
    await vote('S003', benId);
    await svc.closeElection(executorId, electionId);
    await signTally(approver1, approver2);
    await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    await svc.verifyTally(electionId);
    await signCertify(approver1);
    await svc.certify(chairId, electionId, { certifiedBy: chairId, secondApprover: approver1 });
  }
  const outbox = () => (svc as unknown as { voterNotifier: { outbox: { to: string; channel: string; subject: string; text: string }[] } }).voterNotifier.outbox;
  async function waitForResultsBatch() {
    for (let i = 0; i < 100; i++) {
      const b = (await store.listNotificationBatches(electionId)).find((x) => x.kind === 'results');
      if (b && (b.status === 'completed' || b.status === 'failed')) return b;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('results batch did not finish');
  }

  it('announce only: publishes with an announcement and emails nobody', async () => {
    await certifyAll();
    const report = await svc.publish(executorId, electionId, { announcement: 'Certified by the committee.' });
    expect(report.election.state).toBe('PUBLISHED');
    expect(report.election.announcement).toBe('Certified by the committee.');
    expect((await store.listNotificationBatches(electionId)).filter((b) => b.kind === 'results')).toHaveLength(0);
    expect(outbox().filter((m) => m.subject.startsWith('Official results'))).toHaveLength(0);
  });

  it('email results: sends the results to every voter on the register, once', async () => {
    await certifyAll();
    await svc.publish(executorId, electionId, { emailResults: true, announcement: 'Congratulations to all.' });
    const batch = await waitForResultsBatch();
    expect(batch.status).toBe('completed');
    expect(batch.total).toBe(6); // all eligible voters, whether or not they voted
    expect(batch.sent).toBe(6);
    const mails = outbox().filter((m) => m.subject === 'Official results: Organization Election 2026');
    expect(mails).toHaveLength(6);
    const body = mails[0].text;
    expect(body).toContain('Congratulations to all.');
    expect(body).toContain('Dear Voters,');
    expect(body).toContain('we are delighted to announce that Ada Kamara has been elected as President.');
    expect(body).toContain('* Total Votes Cast: 3');
    expect(body).toContain('Best regards,\nElection Administration Team\nExample Organization');
    expect(body).not.toContain('/vote?'); // no personal voting link in a results email
    // Publishing is one-way, so a second publish cannot trigger a second email.
    await expect(svc.publish(executorId, electionId, { emailResults: true })).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it('results can be emailed after publishing announce-only, but only once and never before publishing', async () => {
    await certifyAll();
    // Not published yet: refused.
    await expect(svc.notifyVoters(executorId, electionId, 'results')).rejects.toThrow(/INVALID_STATE/);
    await svc.publish(executorId, electionId, { announcement: 'Certified.' });
    expect(outbox().filter((m) => m.subject.startsWith('Official results'))).toHaveLength(0);
    // Later, the owner decides to email them.
    await svc.notifyVoters(executorId, electionId, 'results');
    const batch = await waitForResultsBatch();
    expect(batch.status).toBe('completed');
    expect(batch.sent).toBe(6);
    // A completed send is never repeated.
    await expect(svc.notifyVoters(executorId, electionId, 'results')).rejects.toThrow(/NOTIFICATION_EXISTS/);
  });

  it('a results send that failed outright can be tried again', async () => {
    await certifyAll();
    await svc.publish(executorId, electionId);
    await store.insertNotificationBatch({
      id: 'failed-1', electionId, organizationId: orgId, kind: 'results', status: 'failed',
      total: 6, sent: 0, failed: 6, skipped: 0, createdAt: new Date(Date.now() - 60_000).toISOString(), completedAt: new Date().toISOString(),
    });
    await expect(svc.notifyVoters(executorId, electionId, 'results')).resolves.toMatchObject({ kind: 'results' });
    const latest = await store.findNotificationBatch(electionId, 'results');
    expect(latest?.id).not.toBe('failed-1');
  });

  it('prevents duplicate ballots under concurrent submissions (FR-VTG-005)', async () => {
    const sessions: string[] = [];
    // One voter, several ballot sessions (e.g. multiple tabs/retries).
    // Session count respects the per-voter OTP request throttle.
    for (let i = 0; i < 4; i++) {
      const { devCode } = await svc.requestOtp(electionId, 'S001');
      const s = await svc.verifyOtp(electionId, 'S001', devCode!);
      sessions.push(s.ballotSession);
    }
    const results = await Promise.allSettled(
      sessions.map((s, i) => svc.submitBallot(s, { [positionId]: [adaId] }, `burst-${i}`)),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    expect(accepted.length).toBe(1);
    expect(store.ballots.filter((b) => b.electionId === electionId).length).toBe(1);
  });

  it('idempotent retry returns the original receipt without a second ballot', async () => {
    const { devCode } = await svc.requestOtp(electionId, 'S002');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S002', devCode!);
    // A second session opened before the vote (e.g. a second tab); once voted,
    // new codes are refused, so a retry has to come from an already-open session.
    const { devCode: devCode2 } = await svc.requestOtp(electionId, 'S002');
    const { ballotSession: s2 } = await svc.verifyOtp(electionId, 'S002', devCode2!);
    const first = await svc.submitBallot(ballotSession, { [positionId]: [benId] }, 'retry-key');
    const second = await svc.submitBallot(s2, { [positionId]: [benId] }, 'retry-key');
    expect(second).toEqual({ receiptId: first.receiptId, alreadyRecorded: true });
    expect(store.ballots.length).toBe(1);
  });

  it('the ballot a voter receives carries each candidate\'s photo URL (or null)', async () => {
    await store.setCandidatePhoto(adaId, { mime: 'image/jpeg', data: 'AAAA', url: `/candidates/${adaId}/photo?v=abc123abc123` });
    const { devCode } = await svc.requestOtp(electionId, 'S001');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S001', devCode!);
    const ballot = await svc.ballotForSession(ballotSession);
    const byId = Object.fromEntries(ballot.positions[0].candidates.map((c) => [c.id, c.photoUrl]));
    expect(byId[adaId]).toBe(`/candidates/${adaId}/photo?v=abc123abc123`);
    expect(byId[benId]).toBeNull();
  });

  it('ballot records contain no voter linkage and audit contains no selections (SEC-BAL)', async () => {
    await vote('S001', adaId);
    const ballot = store.ballots[0];
    const keys = Object.keys(ballot);
    for (const forbidden of ['voterId', 'memberId', 'sessionId', 'entitlementId', 'otp', 'selections']) {
      expect(keys).not.toContain(forbidden);
    }
    expect(store.audit.some((a) => JSON.stringify(a).includes(adaId))).toBe(false);
    await expect(svc.verifyAuditChain()).resolves.toBe(true);
  });

  it('rejects ineligible voters, wrong OTP, and votes after close', async () => {
    // Unknown IDs get the same success shape as real voters (no enumeration)
    // but no code is issued, and verify fails like a wrong code.
    await expect(svc.requestOtp(electionId, 'S999')).resolves.toEqual({ sent: true });
    await expect(svc.verifyOtp(electionId, 'S999', '123456')).rejects.toThrow(/OTP_INVALID/);
    await svc.requestOtp(electionId, 'S001');
    await expect(svc.verifyOtp(electionId, 'S001', '000000')).rejects.toThrow(/OTP_INVALID|OTP_LOCKED/);
    await vote('S001', adaId);
    await svc.closeElection(executorId, electionId);
    await expect(svc.requestOtp(electionId, 'S002')).rejects.toThrow(/ELECTION_NOT_OPEN/);
  });

  it('tally rules: an owner runs it, with two auditors who approved, none of them the runner', async () => {
    await vote('S001', adaId);
    await svc.closeElection(executorId, electionId);
    // Only an owner can run the count.
    await expect(svc.tally(approver1, electionId, { approvers: [approver1, approver2] })).rejects.toThrow(/FORBIDDEN/);
    await expect(svc.tally(executorId, electionId, { approvers: [approver1] })).rejects.toThrow(/PRECONDITION/);
    // Approvers must be auditors; owners do not qualify.
    await expect(svc.tally(executorId, electionId, { approvers: [owner2Id, owner3Id] })).rejects.toThrow(/oversight role/);
    // The person running the count cannot also be an approver.
    await expect(svc.tally(executorId, electionId, { approvers: [executorId, approver1] })).rejects.toThrow(/SOD_VIOLATION/);
    // Properly composed, but nobody has signed off yet.
    await expect(svc.tally(executorId, electionId, { approvers: [approver1, approver2] }))
      .rejects.toThrow(/waiting for .* to approve/);
    await signTally(approver1, approver2);
    const run = await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    expect(run.ballotCount).toBe(1);
    expect(run.authorizedBy).toBe(executorId); // the owner who ran it is the authorizer
  });

  it('recount reproduces the same tally hash', async () => {
    await vote('S001', adaId);
    await vote('S002', benId);
    await svc.closeElection(executorId, electionId);
    await signTally(approver1, approver2);
    const first = await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    expect((await svc.verifyTally(electionId)).verified).toBe(true);
    await signTally(approver1, approver2); // the first round's sign-offs were spent
    const recount = await svc.recount(executorId, electionId, { approvers: [approver1, approver2] });
    expect(recount.tallyHash).toBe(first.tallyHash);
  });

  it('a rejected recount leaves the election in TALLIED, not RECOUNT', async () => {
    await vote('S001', adaId);
    await svc.closeElection(executorId, electionId);
    await signTally(approver1, approver2);
    await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    await expect(svc.recount(executorId, electionId, { approvers: [approver1] }))
      .rejects.toThrow(/PRECONDITION/);
    expect((await store.getElection(electionId))!.state).toBe('TALLIED');
  });

  it('fraud blocks are tenant-scoped: owners see only their own elections\' blocks', async () => {
    const future1 = new Date(Date.now() + 3600_000).toISOString();
    const mine = await store.insertFraudBlock({ kind: 'device', signalHash: 'a', electionId, rule: 'r', reason: 'x', score: 100, expiresAt: future1 });
    const global = await store.insertFraudBlock({ kind: 'ip', signalHash: 'b', electionId: null, rule: 'r', reason: 'x', score: 100, expiresAt: future1 });
    const otherOrg = (await svc.createOrganization(null, 'Other', 'other')).id;
    const otherElection = (await svc.createElection(executorId, otherOrg, { name: 'Other' })).id;
    const foreign = await store.insertFraudBlock({ kind: 'device', signalHash: 'c', electionId: otherElection, rule: 'r', reason: 'x', score: 100, expiresAt: future1 });

    const tenant = { platform: false, organizationId: orgId };
    expect((await svc.listFraudBlocks(tenant)).map((b) => b.id)).toEqual([mine.id]);
    expect(await svc.listFraudBlocks({ platform: true, organizationId: null })).toHaveLength(3);
    await expect(svc.liftFraudBlock(executorId, global.id, tenant)).rejects.toThrow(/NOT_FOUND/);
    await expect(svc.liftFraudBlock(executorId, foreign.id, tenant)).rejects.toThrow(/NOT_FOUND/);
    await expect(svc.liftFraudBlock(executorId, mine.id, tenant)).resolves.toEqual({ lifted: true });
  });

  it('reaps notification batches left running by a restart', async () => {
    const old = new Date(Date.now() - 2 * 3600_000).toISOString();
    await store.insertNotificationBatch({
      id: 'stale-1', electionId, organizationId: orgId, kind: 'invite', status: 'running',
      total: 5, sent: 1, failed: 0, skipped: 0, createdAt: old, completedAt: null,
    });
    expect(await svc.reapStaleNotificationBatches(electionId)).toBe(1);
    expect((await svc.listNotificationBatches(electionId))[0].status).toBe('failed');
  });

  it('requires oversight roles for tally approvers and the certification second approver', async () => {
    await vote('S001', adaId);
    await svc.closeElection(executorId, electionId);
    const nobody = await svc.createUser(orgId, 'nop@example.org', 'No Role', 'pw-long-enough');

    await expect(svc.tally(executorId, electionId, { approvers: [approver1, nobody.id] }))
      .rejects.toThrow(/oversight role/);
    await signTally(approver1, approver2);
    const run = await svc.tally(executorId, electionId, { approvers: [approver1, approver2] });
    expect(run.ballotCount).toBe(1);
    expect((await svc.verifyTally(electionId)).verified).toBe(true);

    await expect(svc.certify(chairId, electionId, { certifiedBy: chairId, secondApprover: nobody.id }))
      .rejects.toThrow(/oversight role/);
    // Properly composed, but the auditor has not approved certification yet.
    await expect(svc.certify(chairId, electionId, { certifiedBy: chairId, secondApprover: approver1 }))
      .rejects.toThrow(/waiting for .* to approve the certification/);
    await signCertify(approver1);
    await expect(svc.certify(chairId, electionId, { certifiedBy: chairId, secondApprover: approver1 }))
      .resolves.toMatchObject({ electionId });
  });

  it('reveals hasVoted only to a live ballot session', async () => {
    const { devCode } = await svc.requestOtp(electionId, 'S001');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S001', devCode!);
    await expect(svc.submissionStatusForSession(electionId, ballotSession)).resolves.toEqual({ hasVoted: false });
    // A second live session, opened before the vote.
    const { devCode: devCode2 } = await svc.requestOtp(electionId, 'S001');
    const { ballotSession: second } = await svc.verifyOtp(electionId, 'S001', devCode2!);

    await svc.submitBallot(ballotSession, { [positionId]: [adaId] }, 'status-key');
    await expect(svc.submissionStatusForSession(electionId, ballotSession)).rejects.toThrow(/SESSION_INVALID/);
    await expect(svc.submissionStatusForSession(electionId, second)).resolves.toEqual({ hasVoted: true });
    await expect(svc.submissionStatusForSession(electionId, 'not-a-session')).rejects.toThrow(/SESSION_INVALID/);
  });
});
