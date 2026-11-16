import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let ownerId: string;
let aud1: string;
let aud2: string;

const PW = 'pw-long-enough';
const soon = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

async function buildElection(name: string, upTo: 'draft' | 'open' | 'published') {
  const el = await svc.createElection(ownerId, orgId, { name, votingOpensAt: soon(-1), votingClosesAt: soon(1) });
  const pos = await svc.addPosition(ownerId, el.id, 'President', 1, 1);
  const cand = await svc.addCandidate(ownerId, el.id, pos.id, 'Ada Kamara');
  await store.setCandidatePhoto(cand.id, 'image/png', Buffer.from('x').toString('base64'));
  if (upTo === 'draft') return { el, pos, cand };
  await svc.transition(ownerId, el.id, 'CONFIGURED');
  await svc.transition(ownerId, el.id, 'REGISTRATION');
  await svc.importRegister(ownerId, el.id, 'memberId,fullName,email\nM1,One,m1@v.test\nM2,Two,m2@v.test');
  await svc.freezeRegister(ownerId, el.id);
  await svc.transition(ownerId, el.id, 'READY');
  await svc.transition(ownerId, el.id, 'OPEN');
  if (upTo === 'open') return { el, pos, cand };
  const { devCode } = await svc.requestOtp(el.id, 'M1');
  const { ballotSession } = await svc.verifyOtp(el.id, 'M1', devCode!);
  await svc.submitBallot(ballotSession, { [pos.id]: [cand.id] }, 'k1');
  await svc.closeElection(ownerId, el.id);
  for (const id of [aud1, aud2]) await svc.recordApproval(id, el.id, 'tally');
  await svc.tally(ownerId, el.id, { approvers: [aud1, aud2] });
  await svc.verifyTally(el.id);
  await svc.recordApproval(aud1, el.id, 'certify');
  await svc.certify(ownerId, el.id, { certifiedBy: ownerId, secondApprover: aud1 });
  await svc.publish(ownerId, el.id);
  return { el, pos, cand };
}

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Org', 'org')).id;
  ownerId = (await svc.createUser(orgId, 'o@o.test', 'Owner', PW)).id;
  await svc.assignRole(ownerId, orgId, ownerId, 'organization_owner');
  aud1 = (await svc.createUser(orgId, 'a1@o.test', 'A1', PW)).id;
  aud2 = (await svc.createUser(orgId, 'a2@o.test', 'A2', PW)).id;
  await svc.assignRole(ownerId, orgId, aud1, 'auditor');
  await svc.assignRole(ownerId, orgId, aud2, 'auditor');
});

describe('deleting an election', () => {
  it('removes an unfinished election and everything on its ballot', async () => {
    const { el, pos, cand } = await buildElection('Draft one', 'draft');
    await svc.deleteElection(ownerId, orgId, el.id);
    expect(await store.getElection(el.id)).toBeNull();
    expect(await store.listPositions(el.id)).toHaveLength(0);
    expect(store.candidates.has(cand.id)).toBe(false);
    expect(store.candidatePhotos.has(cand.id)).toBe(false);
    expect(store.positions.has(pos.id)).toBe(false);
    expect((await store.listElections(orgId)).map((e) => e.id)).not.toContain(el.id);
  });

  it('removes a finished election with its voters, ballots, results and sign-offs, and leaves others alone', async () => {
    const old = await buildElection('Old one', 'published');
    const keep = await buildElection('Keep me', 'draft');
    expect(await store.countBallots(old.el.id)).toBe(1);

    await svc.deleteElection(ownerId, orgId, old.el.id);

    expect(await store.getElection(old.el.id)).toBeNull();
    expect(await store.listVoters(old.el.id)).toHaveLength(0);
    expect(await store.listEntitlements(old.el.id)).toHaveLength(0);
    expect(await store.countBallots(old.el.id)).toBe(0);
    expect(await store.latestTallyRun(old.el.id)).toBeNull();
    expect(await store.getCertification(old.el.id)).toBeNull();
    expect(await store.listApprovals(old.el.id)).toHaveLength(0);
    expect(await store.listNotificationBatches(old.el.id)).toHaveLength(0);
    // The other election is untouched.
    expect(await store.getElection(keep.el.id)).not.toBeNull();
    expect(await store.listPositions(keep.el.id)).toHaveLength(1);
    expect(store.candidatePhotos.has(keep.cand.id)).toBe(true);
  });

  it('refuses while voting is running, and works once it is closed', async () => {
    const { el } = await buildElection('Live', 'open');
    await expect(svc.deleteElection(ownerId, orgId, el.id)).rejects.toThrow(/INVALID_STATE/);
    expect(await store.getElection(el.id)).not.toBeNull();
    await svc.closeElection(ownerId, el.id);
    await expect(svc.deleteElection(ownerId, orgId, el.id)).resolves.toBeUndefined();
  });

  it('cannot reach another organization\'s election', async () => {
    const otherOrg = (await svc.createOrganization(null, 'Other', 'other')).id;
    const otherOwner = (await svc.createUser(otherOrg, 'x@x.test', 'X', PW)).id;
    await svc.assignRole(otherOwner, otherOrg, otherOwner, 'organization_owner');
    const theirs = await svc.createElection(otherOwner, otherOrg, { name: 'Theirs' });
    await expect(svc.deleteElection(ownerId, orgId, theirs.id)).rejects.toThrow(/NOT_FOUND/);
    await expect(svc.deleteElection(ownerId, orgId, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(/NOT_FOUND/);
    expect(await store.getElection(theirs.id)).not.toBeNull();
  });

  it('keeps a record in the activity log', async () => {
    const { el } = await buildElection('Logged', 'draft');
    await svc.deleteElection(ownerId, orgId, el.id);
    const entry = (await svc.auditEntries(orgId)).find((e) => e.action === 'election.delete');
    expect(entry?.outcome).toMatch(/^success:state=DRAFT,ballots=0/);
  });
});
