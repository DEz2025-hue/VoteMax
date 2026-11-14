import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from '../platform/platform.service';
import { InMemoryStore } from '../store/memory.store';
import type { NotificationBatch } from '../store/types';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let electionId: string;
let adminId: string;

function future(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function waitForBatch(id: string, timeoutMs = 5000): Promise<NotificationBatch> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const batches = await store.listNotificationBatches(electionId);
    const batch = batches.find((b) => b.id === id);
    if (batch && (batch.status === 'completed' || batch.status === 'failed')) return batch;
    if (Date.now() > deadline) throw new Error('batch did not finish in time');
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Notify Org', 'notify-org')).id;
  const admin = await svc.createUser(orgId, 'admin@notify.org', 'Admin', 'pw-long-enough');
  adminId = admin.id;
  const election = await svc.createElection(adminId, orgId, {
    name: 'Notify Election', votingOpensAt: future(60), votingClosesAt: future(120),
  });
  electionId = election.id;
  await svc.assignRole(adminId, orgId, adminId, 'organization_owner', electionId);
  const position = await svc.addPosition(adminId, electionId, 'Director', 1, 1);
  await svc.addCandidate(adminId, electionId, position.id, 'Candidate A');
  await svc.transition(adminId, electionId, 'CONFIGURED');
  await svc.transition(adminId, electionId, 'REGISTRATION');
  const csv = [
    'memberId,fullName,email,phone',
    'N001,Ada,email1@example.org,',
    'N002,Ben,,+231 88 000 0002',
    'N003,Cy,email3@example.org,',
  ].join('\n');
  await svc.importRegister(adminId, electionId, csv);
});

describe('voter notifications', () => {
  it('emails eligible voters their member ID and voting link (dev outbox without SMTP)', async () => {
    const batch = await svc.notifyVoters(adminId, electionId, 'invite');
    expect(['queued', 'running']).toContain(batch.status); // runner may start immediately
    expect(batch.total).toBe(3);
    const done = await waitForBatch(batch.id);
    expect(done.status).toBe('completed');
    expect(done.sent).toBe(2); // N002 has no email -> skipped
    expect(done.skipped).toBe(1);
    expect(done.failed).toBe(0);
    const outbox = (svc as unknown as { voterNotifier?: { outbox: { to: string; text: string }[] } }).voterNotifier;
    expect(outbox?.outbox.length).toBe(2);
    expect(outbox?.outbox[0].text).toContain('/vote?org=notify-org&election=');
    expect(outbox?.outbox[0].text).toContain('N00');
  });

  it('queues open/close reminders once inside the window and dedupes', async () => {
    // Move the window so "now" sits inside the open-reminder catch-up window.
    const el = await store.getElection(electionId);
    await store.updateElection(electionId, {
      votingOpensAt: new Date(Date.now() + 2 * 60_000).toISOString(),
      votingClosesAt: new Date(Date.now() + 62 * 60_000).toISOString(),
    });
    void el;
    // Still being registered: voters can't act yet, so no reminder goes out.
    await svc.maybeQueueReminder(electionId);
    expect((await store.listNotificationBatches(electionId)).filter((b) => b.kind === 'reminder_open')).toHaveLength(0);
    await store.updateElection(electionId, { state: 'READY' });
    await svc.maybeQueueReminder(electionId);
    await svc.maybeQueueReminder(electionId); // second tick must not duplicate
    const batches = await store.listNotificationBatches(electionId);
    const opens = batches.filter((b) => b.kind === 'reminder_open');
    expect(opens).toHaveLength(1);
    expect(opens[0].total).toBe(3);
    await waitForBatch(opens[0].id);
  });

  it('does not send a reminder when the window is far away', async () => {
    await svc.maybeQueueReminder(electionId); // opens in 60min, closes in 120min
    const batches = await store.listNotificationBatches(electionId);
    expect(batches.filter((b) => b.kind.startsWith('reminder'))).toHaveLength(0);
  });
});

describe('ballot config deletion', () => {
  it('removes a candidate and cascades a position delete', async () => {
    const election = await store.getElection(electionId);
    const positions = await store.listPositions(electionId);
    const position = positions[0];
    const candidates = (await store.listCandidates()).filter((c) => c.positionId === position.id);
    expect(candidates.length).toBe(1);

    await svc.removeCandidate(adminId, electionId, candidates[0].id);
    expect((await store.listCandidates()).filter((c) => c.positionId === position.id)).toHaveLength(0);

    await svc.addPosition(adminId, electionId, 'Secretary', 1, 1);
    const positionsAfter = await store.listPositions(electionId);
    const extra = positionsAfter.find((p) => p.title === 'Secretary')!;
    await svc.removePosition(adminId, electionId, extra.id);
    expect((await store.listPositions(electionId)).map((p) => p.id)).not.toContain(extra.id);
    void election;
  });
});
