import { beforeEach, describe, expect, it } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';
import { ReminderScheduler } from '../notify/reminder-scheduler';

let svc: PlatformService;
let store: InMemoryStore;
let orgId: string;
let ownerId: string;

const T0 = Date.now();
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Build an election all the way to READY with the given window (absolute ms). */
async function readyElection(opens: number, closes: number, flags: { autoOpen?: boolean; autoClose?: boolean } = {}) {
  const e = await svc.createElection(ownerId, orgId, { name: `E${Math.random()}`, votingOpensAt: iso(opens), votingClosesAt: iso(closes), ...flags });
  const pos = await svc.addPosition(ownerId, e.id, 'President', 1, 1);
  await svc.addCandidate(ownerId, e.id, pos.id, 'Ada Kamara');
  await svc.transition(ownerId, e.id, 'CONFIGURED');
  await svc.transition(ownerId, e.id, 'REGISTRATION');
  await svc.importRegister(ownerId, e.id, 'memberId,fullName,email\nM1,One,one@example.org\nM2,Two,two@example.org');
  await svc.freezeRegister(ownerId, e.id);
  await svc.transition(ownerId, e.id, 'READY');
  return e;
}
const stateOf = async (id: string) => (await store.getElection(id))!.state;

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgId = (await svc.createOrganization(null, 'Sched Org', 'sched-org')).id;
  ownerId = (await svc.createUser(orgId, 'owner@sched.org', 'Owner', 'pw-long-enough')).id;
});

describe('ready without a separate step', () => {
  it('freezing the register makes the election Ready, with no extra "mark ready"', async () => {
    const e = await svc.createElection(ownerId, orgId, { name: 'Auto', votingOpensAt: iso(T0 + H), votingClosesAt: iso(T0 + 2 * H) });
    const pos = await svc.addPosition(ownerId, e.id, 'President', 1, 1);
    await svc.addCandidate(ownerId, e.id, pos.id, 'Ada Kamara');
    await svc.transition(ownerId, e.id, 'CONFIGURED');
    await svc.transition(ownerId, e.id, 'REGISTRATION');
    await svc.importRegister(ownerId, e.id, 'memberId,fullName,email\nM1,One,one@example.org');
    await svc.freezeRegister(ownerId, e.id);
    expect(await stateOf(e.id)).toBe('READY');
    expect(await svc.runElectionSchedule(e.id, T0 + H)).toBe('opened');
  });

  it('picks up an election frozen before this change and opens it on time', async () => {
    const e = await readyElection(T0 - H, T0 + H);
    await store.updateElection(e.id, { state: 'REGISTER_FROZEN' });
    expect(await svc.runElectionSchedule(e.id, T0)).toBe('opened');
    expect(await stateOf(e.id)).toBe('OPEN');
  });
});

describe('automatic start', () => {
  it('opens a READY election only once its opening time has come', async () => {
    const e = await readyElection(T0 + H, T0 + 2 * H);
    expect(await svc.runElectionSchedule(e.id, T0)).toBeNull();
    expect(await stateOf(e.id)).toBe('READY');
    expect(await svc.runElectionSchedule(e.id, T0 + H)).toBe('opened');
    expect(await stateOf(e.id)).toBe('OPEN');
    expect(await store.hasElectionKey(e.id)).toBe(true); // keys are prepared exactly as for a manual open
    const rec = (await store.listAudit(orgId)).find((a) => a.action === 'election.autoOpen')!;
    expect(rec.actorId).toBe('system:scheduler');
  });

  it('happens exactly once, even when two schedulers run at the same moment', async () => {
    const e = await readyElection(T0 - H, T0 + H);
    const results = await Promise.all([svc.runElectionSchedule(e.id, T0), svc.runElectionSchedule(e.id, T0), svc.runElectionSchedule(e.id, T0)]);
    expect(results.filter((r) => r === 'opened')).toHaveLength(1);
    expect((await store.listAudit(orgId)).filter((a) => a.action === 'election.autoOpen')).toHaveLength(1);
  });

  it('respects the switch, and never opens a window that has already ended', async () => {
    const off = await readyElection(T0 - H, T0 + H, { autoOpen: false });
    expect(await svc.runElectionSchedule(off.id, T0)).toBeNull();
    expect(await stateOf(off.id)).toBe('READY');
    const missed = await readyElection(T0 - 3 * H, T0 - H);
    expect(await svc.runElectionSchedule(missed.id, T0)).toBeNull();
    expect(await stateOf(missed.id)).toBe('READY'); // owner extends the schedule instead
  });

  it('leaves elections that are not READY alone', async () => {
    const draft = await svc.createElection(ownerId, orgId, { name: 'Draft', votingOpensAt: iso(T0 - H), votingClosesAt: iso(T0 + H) });
    expect(await svc.runElectionSchedule(draft.id, T0)).toBeNull();
    expect(await stateOf(draft.id)).toBe('DRAFT');
  });
});

describe('automatic close', () => {
  async function openElection(flags: { autoClose?: boolean } = {}) {
    const e = await readyElection(T0 - 2 * H, T0 + H, flags);
    await svc.transition(ownerId, e.id, 'OPEN');
    return e;
  }

  it('closes an OPEN election when its closing time is reached, and records the reconciliation', async () => {
    const e = await openElection();
    expect(await svc.runElectionSchedule(e.id, T0)).toBeNull(); // still inside the window
    expect(await stateOf(e.id)).toBe('OPEN');
    expect(await svc.runElectionSchedule(e.id, T0 + H)).toBe('closed');
    expect(await stateOf(e.id)).toBe('CLOSED');
    const rec = (await store.listAudit(orgId)).find((a) => a.action === 'election.autoClose')!;
    expect(rec.actorId).toBe('system:scheduler');
    expect(rec.outcome).toBe('success:consumed=0,ballots=0');
    expect(await svc.runElectionSchedule(e.id, T0 + 2 * H)).toBeNull(); // nothing left to do
  });

  it('respects the switch and never closes a paused (SUSPENDED) election by itself', async () => {
    const manual = await openElection({ autoClose: false });
    expect(await svc.runElectionSchedule(manual.id, T0 + 5 * H)).toBeNull();
    expect(await stateOf(manual.id)).toBe('OPEN');

    const paused = await openElection();
    await svc.transition(ownerId, paused.id, 'SUSPENDED');
    expect(await svc.runElectionSchedule(paused.id, T0 + 5 * H)).toBeNull();
    expect(await stateOf(paused.id)).toBe('SUSPENDED');
  });

  it('after an automatic close the normal next steps are available', async () => {
    const e = await openElection();
    await svc.runElectionSchedule(e.id, T0 + H);
    await expect(svc.closeElection(ownerId, e.id)).rejects.toThrow(/INVALID_TRANSITION/); // already closed
  });
});

describe('schedule changes', () => {
  it('new elections default to automatic start and close; both can be switched off', async () => {
    const a = await svc.createElection(ownerId, orgId, { name: 'A' });
    expect([a.autoOpen, a.autoClose]).toEqual([true, true]);
    const b = await svc.createElection(ownerId, orgId, { name: 'B', autoOpen: false, autoClose: false });
    expect([b.autoOpen, b.autoClose]).toEqual([false, false]);
    const edited = await svc.updateElectionDetails(ownerId, b.id, { autoClose: true });
    expect(edited.autoClose).toBe(true);
  });

  it('lets the owner extend (but not shorten) the closing time once READY', async () => {
    const e = await readyElection(T0 - H, T0 + 2 * H);
    const extended = await svc.updateSchedule(ownerId, e.id, { votingClosesAt: iso(T0 + 4 * H) });
    expect(extended.votingClosesAt).toBe(iso(T0 + 4 * H));
    await expect(svc.updateSchedule(ownerId, e.id, { votingClosesAt: iso(T0 + 3 * H) })).rejects.toThrow(/only be extended/);
    await expect(svc.updateSchedule(ownerId, e.id, { votingClosesAt: iso(T0 - 5 * H) })).rejects.toThrow(/in the future/);
    await expect(svc.updateSchedule(ownerId, e.id, { votingClosesAt: 'not a date' })).rejects.toThrow(/not valid/);
    expect((await svc.runElectionSchedule(e.id, T0 + 3 * H))).toBe('opened'); // extension kept the election live
  });

  it('extending rescues a READY election whose window was missed', async () => {
    const e = await readyElection(T0 - 3 * H, T0 - H);
    expect(await svc.runElectionSchedule(e.id, T0)).toBeNull();
    await svc.updateSchedule(ownerId, e.id, { votingClosesAt: iso(Date.now() + 2 * H) });
    expect(await svc.runElectionSchedule(e.id, Date.now())).toBe('opened');
  });

  it('keeps each switch within the stage where it makes sense', async () => {
    const e = await readyElection(T0 - H, T0 + 5 * H);
    await svc.transition(ownerId, e.id, 'OPEN');
    await expect(svc.updateSchedule(ownerId, e.id, { autoOpen: false })).rejects.toThrow(/before voting opens/);
    const off = await svc.updateSchedule(ownerId, e.id, { autoClose: false }); // still allowed while open
    expect(off.autoClose).toBe(false);
    await svc.closeElection(ownerId, e.id);
    await expect(svc.updateSchedule(ownerId, e.id, { autoClose: true })).rejects.toThrow(/INVALID_STATE/);
  });

  it('audits schedule changes with the fields touched', async () => {
    const e = await readyElection(T0 - H, T0 + 2 * H);
    await svc.updateSchedule(ownerId, e.id, { autoClose: false, votingClosesAt: iso(T0 + 3 * H) });
    const rec = (await store.listAudit(orgId)).find((a) => a.action === 'election.schedule')!;
    expect(rec.outcome).toBe('success:autoClose+votingClosesAt');
  });
});

describe('the scheduler tick', () => {
  it('opens due elections and closes finished ones in one pass', async () => {
    const due = await readyElection(Date.now() - H, Date.now() + H);
    const finished = await readyElection(Date.now() - 3 * H, Date.now() + H);
    await svc.transition(ownerId, finished.id, 'OPEN');
    await store.updateElection(finished.id, { votingClosesAt: iso(Date.now() - 60_000) });
    const sleeper = await readyElection(Date.now() + 5 * H, Date.now() + 6 * H);

    await (new ReminderScheduler(svc) as unknown as { tick: () => Promise<void> }).tick();

    expect(await stateOf(due.id)).toBe('OPEN');
    expect(await stateOf(finished.id)).toBe('CLOSED');
    expect(await stateOf(sleeper.id)).toBe('READY');
  });
});
