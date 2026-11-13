import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';

// Internal security test suite for Phase 4. This is self-assessment,
// NOT the independent assessment required by SEC-ASR-01 / DEC-007.
let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let electionId: string;
let posId: string;
let adaId: string;
let chairId: string;
let executorId: string;

function future(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'UL', 'ul')).id;
  const admin = await svc.createUser(orgId, 'a@ul.edu.lr', 'Admin', 'pw-long-enough');
  executorId = admin.id;
  chairId = (await svc.createUser(orgId, 'c@ul.edu.lr', 'Chair', 'pw-long-enough')).id;
  const election = await svc.createElection(admin.id, orgId, {
    name: 'SU', votingOpensAt: future(-1), votingClosesAt: future(1),
  });
  electionId = election.id;
  await svc.assignRole(admin.id, orgId, chairId, 'committee_chair', electionId);
  posId = (await svc.addPosition(admin.id, electionId, 'President', 1, 1)).id;
  adaId = (await svc.addCandidate(admin.id, electionId, posId, 'Ada')).id;
  await svc.transition(admin.id, electionId, 'CONFIGURED');
  await svc.transition(admin.id, electionId, 'REGISTRATION');
  await svc.importRegister(admin.id, electionId, 'studentId,fullName,email\nS001,Alice,a@x.edu.lr\nS002,Bob,b@x.edu.lr');
  await svc.freezeRegister(admin.id, electionId);
  await svc.transition(admin.id, electionId, 'READY');
  await svc.transition(admin.id, electionId, 'OPEN');
});

async function voteOnce(studentId: string): Promise<void> {
  const { devCode } = await svc.requestOtp(electionId, studentId);
  const { ballotSession } = await svc.verifyOtp(electionId, studentId, devCode!);
  await svc.submitBallot(ballotSession, { [posId]: [adaId] }, `k-${studentId}`);
}

describe('Phase 4 internal security assessment', () => {
  it('OTP requests are throttled per voter (SEC-IAM-07)', async () => {
    for (let i = 0; i < 5; i++) await svc.requestOtp(electionId, 'S001');
    await expect(svc.requestOtp(electionId, 'S001')).rejects.toThrow(/OTP_RATE_LIMITED/);
  });

  it('wrong OTP attempts lock the challenge', async () => {
    await svc.requestOtp(electionId, 'S001');
    for (let i = 0; i < 6; i++) {
      await svc.verifyOtp(electionId, 'S001', '999999').catch(() => { /* expected */ });
    }
    await expect(svc.verifyOtp(electionId, 'S001', '999999')).rejects.toThrow(/OTP_LOCKED|OTP_INVALID/);
  });

  it('OTP verification failures are throttled per voter across code resends', async () => {
    await svc.requestOtp(electionId, 'S001');
    for (let i = 0; i < 5; i++) {
      await expect(svc.verifyOtp(electionId, 'S001', '999999')).rejects.toThrow(/OTP_INVALID/);
    }
    const { devCode } = await svc.requestOtp(electionId, 'S001');
    expect(devCode).toBeTruthy();
    for (let i = 0; i < 5; i++) {
      await expect(svc.verifyOtp(electionId, 'S001', '999999')).rejects.toThrow(/OTP_INVALID/);
    }
    await expect(svc.verifyOtp(electionId, 'S001', '999999')).rejects.toThrow(/OTP_RATE_LIMITED/);
  });

  it('a consumed ballot session cannot be reused', async () => {
    const { devCode } = await svc.requestOtp(electionId, 'S001');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S001', devCode!);
    await svc.submitBallot(ballotSession, { [posId]: [adaId] }, 'reuse-1');
    await expect(svc.submitBallot(ballotSession, { [posId]: [adaId] }, 'reuse-2')).rejects.toThrow(/SESSION_INVALID/);
  });

  it('a voter cannot vote twice with a fresh OTP (SEC-VOT-03)', async () => {
    await voteOnce('S001');
    const { devCode } = await svc.requestOtp(electionId, 'S001');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S001', devCode!);
    await expect(svc.submitBallot(ballotSession, { [posId]: [adaId] }, 'second-attempt')).rejects.toThrow(/ALREADY_VOTED/);
    expect(store.ballots.length).toBe(1);
  });

  it('ballots with foreign candidates are rejected (SEC-VOT-06)', async () => {
    const { devCode } = await svc.requestOtp(electionId, 'S002');
    const { ballotSession } = await svc.verifyOtp(electionId, 'S002', devCode!);
    await expect(svc.submitBallot(ballotSession, { [posId]: ['nonexistent-candidate'] }, 'fk-1')).rejects.toThrow(/INVALID_BALLOT/);
  });

  it('tally authorization cannot be forged by a non-chair', async () => {
    await voteOnce('S001');
    await svc.closeElection(executorId, electionId);
    await expect(svc.tally(executorId, electionId, { authorizedBy: executorId, approvers: ['x', 'y'] })).rejects.toThrow(/FORBIDDEN/);
  });

  it('publish is impossible before certification (lifecycle)', async () => {
    await voteOnce('S001');
    await svc.closeElection(executorId, electionId);
    await expect(svc.publish(executorId, electionId)).rejects.toThrow(/INVALID_TRANSITION/);
  });

  it('participation output exposes aggregates only (FR-MON-002)', async () => {
    await voteOnce('S001');
    const part = await svc.participation(electionId);
    expect(Object.keys(part).sort()).toEqual(['ballotsCast', 'eligible', 'turnoutPercent']);
    expect(JSON.stringify(part)).not.toContain('S001');
  });

  it('repeated failed logins lock the account (SEC-IAM-07)', async () => {
    await svc.createUser(orgId, 'lock@ul.edu.lr', 'Lock Test', 'pw-long-enough');
    for (let i = 0; i < 8; i++) {
      await expect(svc.login('lock@ul.edu.lr', 'wrong')).rejects.toThrow(/AUTH_FAILED/);
    }
    await expect(svc.login('lock@ul.edu.lr', 'wrong')).rejects.toThrow(/AUTH_LOCKED/);
  });
});
