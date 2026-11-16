import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';

let svc: PlatformService;
let orgId: string;
let electionId: string;
let executor: string;   // owner who runs the count
let authorizer: string; // a different owner
let aud1: string;
let aud2: string;
let outsider: string;   // no role

const PW = 'pw-long-enough';

async function newUser(email: string, name: string, role?: 'organization_owner' | 'auditor') {
  const u = await svc.createUser(orgId, email, name, PW);
  if (role) await svc.assignRole(executor ?? u.id, orgId, u.id, role);
  return u.id;
}

beforeEach(async () => {
  svc = new PlatformService();
  orgId = (await svc.createOrganization(null, 'Org', 'org')).id;
  executor = (await svc.createUser(orgId, 'exec@o.test', 'Exec', PW)).id;
  await svc.assignRole(executor, orgId, executor, 'organization_owner');
  authorizer = await newUser('auth@o.test', 'Authorizer', 'organization_owner');
  aud1 = await newUser('a1@o.test', 'Alice Auditor', 'auditor');
  aud2 = await newUser('a2@o.test', 'Aaron Auditor', 'auditor');
  outsider = await newUser('out@o.test', 'No Role');

  const el = await svc.createElection(executor, orgId, {
    name: 'E', votingOpensAt: new Date(Date.now() - 3600_000).toISOString(), votingClosesAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  electionId = el.id;
  const pos = await svc.addPosition(executor, electionId, 'President', 1, 1);
  await svc.addCandidate(executor, electionId, pos.id, 'Ada');
  await svc.transition(executor, electionId, 'CONFIGURED');
  await svc.transition(executor, electionId, 'REGISTRATION');
  await svc.importRegister(executor, electionId, 'memberId,fullName,email\nM1,One,m1@v.test');
  await svc.freezeRegister(executor, electionId);
  await svc.transition(executor, electionId, 'READY');
  await svc.transition(executor, electionId, 'OPEN');
});

describe('approvals before a count', () => {
  it('cannot be recorded while voting is still open', async () => {
    await expect(svc.recordApproval(aud1, electionId, 'tally')).rejects.toThrow(/INVALID_STATE/);
  });

  it('records owners as authorizers and auditors as approvers, with names', async () => {
    await svc.closeElection(executor, electionId);
    await svc.recordApproval(authorizer, electionId, 'tally');
    await svc.recordApproval(aud1, electionId, 'tally');
    await svc.recordApproval(aud1, electionId, 'tally'); // pressing twice changes nothing
    const list = await svc.listApprovals(electionId);
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.userId === authorizer)).toMatchObject({ role: 'organization_owner', displayName: 'Authorizer', kind: 'tally' });
    expect(list.find((a) => a.userId === aud1)).toMatchObject({ role: 'auditor', displayName: 'Alice Auditor' });
  });

  it('refuses people with no oversight role', async () => {
    await svc.closeElection(executor, electionId);
    await expect(svc.recordApproval(outsider, electionId, 'tally')).rejects.toThrow(/FORBIDDEN/);
  });

  it('lets the count run only once everyone named has approved, then spends the approvals', async () => {
    await svc.closeElection(executor, electionId);
    const input = { authorizedBy: authorizer, approvers: [aud1, aud2] };
    await svc.recordApproval(authorizer, electionId, 'tally');
    await svc.recordApproval(aud1, electionId, 'tally');
    await expect(svc.tally(executor, electionId, input)).rejects.toThrow(/waiting for Aaron Auditor to approve the tally/);
    await svc.recordApproval(aud2, electionId, 'tally');
    await expect(svc.tally(executor, electionId, input)).resolves.toMatchObject({ electionId });
    expect(await svc.listApprovals(electionId)).toHaveLength(0); // spent
  });

  it('a withdrawn approval blocks the count again', async () => {
    await svc.closeElection(executor, electionId);
    for (const id of [authorizer, aud1, aud2]) await svc.recordApproval(id, electionId, 'tally');
    await svc.withdrawApproval(aud2, electionId, 'tally');
    await expect(svc.tally(executor, electionId, { authorizedBy: authorizer, approvers: [aud1, aud2] }))
      .rejects.toThrow(/waiting for Aaron Auditor/);
  });

  it('approvals of a removed user disappear with them', async () => {
    await svc.closeElection(executor, electionId);
    await svc.recordApproval(aud2, electionId, 'tally');
    await svc.deleteUser(executor, orgId, aud2);
    expect(await svc.listApprovals(electionId)).toHaveLength(0);
  });
});

describe('approvals before certification', () => {
  async function toVerified() {
    await svc.closeElection(executor, electionId);
    for (const id of [authorizer, aud1, aud2]) await svc.recordApproval(id, electionId, 'tally');
    await svc.tally(executor, electionId, { authorizedBy: authorizer, approvers: [aud1, aud2] });
    await svc.verifyTally(electionId);
  }

  it('only an auditor can approve certification, and only once verified', async () => {
    await svc.closeElection(executor, electionId);
    await expect(svc.recordApproval(aud1, electionId, 'certify')).rejects.toThrow(/INVALID_STATE/); // not verified yet
    for (const id of [authorizer, aud1, aud2]) await svc.recordApproval(id, electionId, 'tally');
    await svc.tally(executor, electionId, { authorizedBy: authorizer, approvers: [aud1, aud2] });
    await expect(svc.recordApproval(aud1, electionId, 'certify')).rejects.toThrow(/INVALID_STATE/); // counted, still not verified
    await svc.verifyTally(electionId);
    await expect(svc.recordApproval(aud1, electionId, 'certify')).resolves.toMatchObject({ kind: 'certify', role: 'auditor' });
  });

  it('certification waits for the second approver, then spends the approval', async () => {
    await toVerified();
    await expect(svc.recordApproval(authorizer, electionId, 'certify')).rejects.toThrow(/FORBIDDEN/); // owners cannot be the second approver
    await expect(svc.certify(authorizer, electionId, { certifiedBy: authorizer, secondApprover: aud1 }))
      .rejects.toThrow(/waiting for Alice Auditor to approve the certification/);
    await svc.recordApproval(aud1, electionId, 'certify');
    await expect(svc.certify(authorizer, electionId, { certifiedBy: authorizer, secondApprover: aud1 })).resolves.toMatchObject({ electionId });
    expect(await svc.listApprovals(electionId)).toHaveLength(0);
  });
});
