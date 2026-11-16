import { beforeEach, describe, expect, it } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';

let svc: PlatformService;
let store: InMemoryStore;
let ownerId: string;
let electionId: string;

const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
type Outbox = { to: string; text: string }[];

/** Pull the member ID and secret key out of the personal link in a voter's invitation. */
async function linkFor(email: string): Promise<{ id: string; key: string; text: string }> {
  const outbox = (svc as unknown as { voterNotifier: { outbox: Outbox } }).voterNotifier.outbox;
  const msg = outbox.find((m) => m.to === email)!;
  const url = new URL(msg.text.match(/https?:\/\/\S+/)![0]);
  return { id: url.searchParams.get('id')!, key: url.searchParams.get('key')!, text: msg.text };
}

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  const orgId = (await svc.createOrganization(null, 'Link Org', 'link-org')).id;
  ownerId = (await svc.createUser(orgId, 'owner@link.org', 'Owner', 'pw-long-enough')).id;
  const e = await svc.createElection(ownerId, orgId, { name: 'Link Election', votingOpensAt: iso(Date.now() - H), votingClosesAt: iso(Date.now() + H) });
  electionId = e.id;
  const pos = await svc.addPosition(ownerId, electionId, 'President', 1, 1);
  await svc.addCandidate(ownerId, electionId, pos.id, 'Ada Kamara');
  await svc.transition(ownerId, electionId, 'CONFIGURED');
  await svc.transition(ownerId, electionId, 'REGISTRATION');
  await svc.importRegister(ownerId, electionId, 'memberId,fullName,email\nM1,One,one@example.org\nM2,Two,two@example.org');
  await svc.freezeRegister(ownerId, electionId);
  await svc.transition(ownerId, electionId, 'READY');
  await svc.runElectionSchedule(electionId, Date.now());
  expect((await store.getElection(electionId))!.state).toBe('OPEN');
  const batch = await svc.notifyVoters(ownerId, electionId, 'invite');
  for (let i = 0; i < 100; i += 1) {
    const b = (await store.listNotificationBatches(electionId)).find((x) => x.id === batch.id)!;
    if (b.status === 'completed') break;
    await new Promise((r) => setTimeout(r, 50));
  }
});

describe('personal voting link sign-in (no emailed code)', () => {
  it('the invitation link signs the voter in and they can vote', async () => {
    const { id, key, text } = await linkFor('one@example.org');
    expect(id).toBe('M1');
    expect(key.length).toBeGreaterThanOrEqual(24);
    expect(text).toMatch(/keep it secret/i);
    expect(text).not.toMatch(/one-time/i);
    const { ballotSession } = await svc.enterWithLink(electionId, id, key);
    const ballot = await svc.ballotForSession(ballotSession);
    const pos = ballot.positions[0];
    const receipt = await svc.submitBallot(ballotSession, { [pos.id]: [pos.candidates[0].id] }, 'k1');
    expect(receipt.receiptId).toBeTruthy();
  });

  it('keys are personal and stable: a re-sent invitation carries the same key', async () => {
    const a = await linkFor('one@example.org');
    const b = await linkFor('two@example.org');
    expect(a.key).not.toBe(b.key);
    const again = await svc.notifyVoters(ownerId, electionId, 'invite');
    expect(again.total).toBe(2);
  });

  it('refuses a member ID alone, a wrong key, and another voter\'s key, all with the same error', async () => {
    const one = await linkFor('one@example.org');
    const two = await linkFor('two@example.org');
    await expect(svc.enterWithLink(electionId, 'M1', '')).rejects.toThrow(/LINK_INVALID/);
    await expect(svc.enterWithLink(electionId, 'M1', 'x'.repeat(one.key.length))).rejects.toThrow(/LINK_INVALID/);
    await expect(svc.enterWithLink(electionId, 'M1', two.key)).rejects.toThrow(/LINK_INVALID/);
    await expect(svc.enterWithLink(electionId, 'NOPE', one.key)).rejects.toThrow(/LINK_INVALID/);
  });

  it('throttles repeated bad keys, then blocks even the right key for a while', async () => {
    const one = await linkFor('one@example.org');
    for (let i = 0; i < 10; i += 1) await expect(svc.enterWithLink(electionId, 'M1', `bad-${i}`)).rejects.toThrow(/LINK_INVALID/);
    await expect(svc.enterWithLink(electionId, 'M1', one.key)).rejects.toThrow(/OTP_RATE_LIMITED/);
  });

  it('a voter who has voted cannot sign in again', async () => {
    const { id, key } = await linkFor('one@example.org');
    const { ballotSession } = await svc.enterWithLink(electionId, id, key);
    const pos = (await svc.ballotForSession(ballotSession)).positions[0];
    await svc.submitBallot(ballotSession, { [pos.id]: [pos.candidates[0].id] }, 'k1');
    await expect(svc.enterWithLink(electionId, id, key)).rejects.toThrow(/ALREADY_VOTED/);
  });
});
