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
    expect(done.sent).toBe(3); // N002 has only a phone -> reached by SMS, not skipped
    expect(done.skipped).toBe(0);
    expect(done.failed).toBe(0);
    const outbox = (svc as unknown as { voterNotifier?: { outbox: { to: string; channel: string; text: string }[] } }).voterNotifier;
    expect(outbox?.outbox.length).toBe(3);
    expect(outbox?.outbox[0].text).toContain('/vote?org=notify-org&election=');
    expect(outbox?.outbox[0].text).toContain('N00');
    // Every message carries that voter's own ID, and the link pre-fills it.
    const sms = outbox!.outbox.find((m) => m.to === '+231 88 000 0002')!;
    expect(sms.channel).toBe('sms');
    expect(sms.text).toContain('N002');
    expect(sms.text).toContain('&id=N002');
    const mail = outbox!.outbox.find((m) => m.to === 'email1@example.org')!;
    expect(mail.channel).toBe('email');
    expect(mail.text).toContain('Your member ID: N001');
    expect(mail.text).toContain('&id=N001');
  });

  it('gives voters imported without IDs a unique ID and sends it to them', async () => {
    const csv = ['fullName,email,phone', 'Dee No-Id,dee@example.org,', 'Eli No-Id,,+231 88 000 0005'].join('\n');
    await svc.importRegister(adminId, electionId, csv);
    const generated = (await store.listVoters(electionId)).filter((v) => v.fullName.endsWith('No-Id'));
    expect(generated).toHaveLength(2);
    expect(new Set(generated.map((v) => v.memberId)).size).toBe(2);
    for (const v of generated) expect(v.memberId).toMatch(/^PGA-[A-HJKMNP-Z2-9]{8}$/);

    const batch = await svc.notifyVoters(adminId, electionId, 'invite');
    await waitForBatch(batch.id);
    const outbox = (svc as unknown as { voterNotifier: { outbox: { to: string; text: string }[] } }).voterNotifier.outbox;
    for (const v of generated) {
      const msg = outbox.find((m) => m.to === (v.email || v.phone))!;
      expect(msg.text).toContain(v.memberId);
    }
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

  it('sends the opening reminder 10 minutes ahead, not earlier, and only for a READY election', async () => {
    const set = (opensInMin: number) => store.updateElection(electionId, {
      state: 'READY',
      votingOpensAt: new Date(Date.now() + opensInMin * 60_000).toISOString(),
      votingClosesAt: new Date(Date.now() + (opensInMin + 60) * 60_000).toISOString(),
    });
    const count = async () => (await store.listNotificationBatches(electionId)).filter((b) => b.kind === 'reminder_open').length;

    await set(11); // 11 minutes out: too early
    await svc.maybeQueueReminder(electionId);
    expect(await count()).toBe(0);

    await set(9); // inside the 10-minute lead
    await store.updateElection(electionId, { state: 'REGISTER_FROZEN' }); // not READY: voters can't act yet
    await svc.maybeQueueReminder(electionId);
    expect(await count()).toBe(0);

    await store.updateElection(electionId, { state: 'READY' });
    await svc.maybeQueueReminder(electionId);
    expect(await count()).toBe(1);
    await svc.maybeQueueReminder(electionId); // dedupes
    expect(await count()).toBe(1);
  });

  it('sends the closing reminder 10 minutes ahead and never after voting ended', async () => {
    const count = async () => (await store.listNotificationBatches(electionId)).filter((b) => b.kind === 'reminder_close').length;
    await store.updateElection(electionId, {
      state: 'OPEN',
      votingOpensAt: new Date(Date.now() - 60 * 60_000).toISOString(),
      votingClosesAt: new Date(Date.now() - 60_000).toISOString(), // closed a minute ago
    });
    await svc.maybeQueueReminder(electionId);
    expect(await count()).toBe(0);
    await store.updateElection(electionId, { votingClosesAt: new Date(Date.now() + 8 * 60_000).toISOString() });
    await svc.maybeQueueReminder(electionId);
    expect(await count()).toBe(1);
  });

  it('does not send a reminder when the window is far away', async () => {
    await svc.maybeQueueReminder(electionId); // opens in 60min, closes in 120min
    const batches = await store.listNotificationBatches(electionId);
    expect(batches.filter((b) => b.kind.startsWith('reminder'))).toHaveLength(0);
  });
});

describe('reminders skip voters who already voted', () => {
  it('sends the closing reminder only to voters yet to vote; invites still reach everyone', async () => {
    // N001 (Ada) has voted: her entitlement is consumed.
    const ada = (await store.listVoters(electionId)).find((v) => v.memberId === 'N001')!;
    const ent = (await store.listEntitlements(electionId)).find((e) => e.voterRecordId === ada.id)!;
    ent.consumedAt = new Date().toISOString();

    const reminder = await svc.notifyVoters(adminId, electionId, 'reminder_close');
    expect(reminder.total).toBe(2); // Ben and Cy only
    const done = await waitForBatch(reminder.id);
    expect(done.sent + done.skipped).toBe(2);
    const outbox = (svc as unknown as { voterNotifier: { outbox: { to: string }[] } }).voterNotifier.outbox;
    expect(outbox.some((m) => m.to === 'email1@example.org')).toBe(false); // Ada not emailed
    expect(outbox.some((m) => m.to === 'email3@example.org')).toBe(true);

    const invite = await svc.notifyVoters(adminId, electionId, 'invite');
    expect(invite.total).toBe(3);
    await waitForBatch(invite.id);
  });
});

describe('voter edits', () => {
  async function voterId(memberId: string): Promise<string> {
    return (await store.listVoters(electionId)).find((v) => v.memberId === memberId)!.id;
  }

  it('corrects contact details, keeps member ID and status, and audits fields without values', async () => {
    const id = await voterId('N002');
    const updated = await svc.updateVoter(adminId, electionId, id, { email: 'ben.new@example.org' });
    expect(updated).toMatchObject({ memberId: 'N002', email: 'ben.new@example.org', status: 'eligible' });
    expect(updated.phone).toBe('+231 88 000 0002'); // untouched fields stay
    expect((await svc.listVoters(electionId)).find((v) => v.id === id)?.email).toBe('ben.new@example.org');
    const audit = (await store.listAudit(orgId)).find((a) => a.action === 'register.updateVoter')!;
    expect(audit.outcome).toContain('fields=email');
    expect(JSON.stringify(audit)).not.toContain('ben.new@example.org');
  });

  it('rejects invalid input, duplicate emails and removing every contact', async () => {
    const ben = await voterId('N002');
    const ada = await voterId('N001');
    await expect(svc.updateVoter(adminId, electionId, ben, { email: 'not-an-email' })).rejects.toThrow(/INVALID_INPUT/);
    await expect(svc.updateVoter(adminId, electionId, ben, { fullName: '  ' })).rejects.toThrow(/full name/);
    await expect(svc.updateVoter(adminId, electionId, ben, { email: 'EMAIL1@example.org' })).rejects.toThrow(/EMAIL_EXISTS/);
    await expect(svc.updateVoter(adminId, electionId, ben, { phone: '' })).rejects.toThrow(/email or phone/);
    // Clearing email is fine while a phone remains.
    await expect(svc.updateVoter(adminId, electionId, ada, { email: '', phone: '+231 88 111 1111' })).resolves.toMatchObject({ email: '' });
  });

  it('invalidates a pending one-time code when contact details change, and locks after close', async () => {
    const ben = await voterId('N002');
    await store.upsertOtpChallenge({ key: `${electionId}:${ben}`, voterId: ben, electionId, codeHash: 'x', expiresAt: Date.now() + 60_000, attempts: 0 });
    await svc.updateVoter(adminId, electionId, ben, { phone: '+231 88 999 9999' });
    expect(await store.getOtpChallenge(`${electionId}:${ben}`)).toBeNull();

    await store.updateElection(electionId, { state: 'CLOSED' });
    await expect(svc.updateVoter(adminId, electionId, ben, { phone: '+231 88 000 0000' })).rejects.toThrow(/INVALID_STATE/);
  });

  it('refuses a voter from another election', async () => {
    const other = await svc.createElection(adminId, orgId, { name: 'Other' });
    await store.updateElection(other.id, { state: 'REGISTRATION' });
    await expect(svc.updateVoter(adminId, other.id, await voterId('N001'), { fullName: 'X' })).rejects.toThrow(/NOT_FOUND/);
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
