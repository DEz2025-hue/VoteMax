import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../db/schema';
import { PostgresStore } from './postgres.store';
import { PlatformService } from '../platform/platform.service';

/**
 * Runs the REAL migrations (including the append-only triggers on ballots, idempotency keys and
 * the audit log) on an in-process Postgres engine. The in-memory store has no such triggers, which
 * is how deleting an election with votes once passed its tests but failed in production.
 */
let pg: PGlite;
let svc: PlatformService;
let store: PostgresStore;

const PW = 'pw-long-enough';
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();

beforeAll(async () => {
  pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  store = new PostgresStore(db as never);
  svc = new PlatformService(store);
}, 120000);

async function org(slug: string) {
  const orgId = (await svc.createOrganization(null, `Org ${slug}`, slug)).id;
  const owner = (await svc.createUser(orgId, `owner-${slug}@o.test`, 'Owner', PW)).id;
  const a1 = (await svc.createUser(orgId, `a1-${slug}@o.test`, 'A1', PW)).id;
  const a2 = (await svc.createUser(orgId, `a2-${slug}@o.test`, 'A2', PW)).id;
  await svc.assignRole(owner, orgId, owner, 'organization_owner');
  await svc.assignRole(owner, orgId, a1, 'auditor');
  await svc.assignRole(owner, orgId, a2, 'auditor');
  return { orgId, owner, a1, a2 };
}

/** An election taken as far as asked: 'votes' = closed with a ballot cast, 'published' = fully through results. */
async function election(o: Awaited<ReturnType<typeof org>>, name: string, upTo: 'draft' | 'votes' | 'published') {
  const el = await svc.createElection(o.owner, o.orgId, { name, votingOpensAt: day(-1), votingClosesAt: day(1) });
  const pos = await svc.addPosition(o.owner, el.id, 'President', 1, 1);
  const cand = await svc.addCandidate(o.owner, el.id, pos.id, 'Ada Kamara');
  await store.setCandidatePhoto(cand.id, { mime: 'image/png', data: Buffer.from('png').toString('base64'), url: `/candidates/${cand.id}/photo` });
  if (upTo === 'draft') return el;
  await svc.transition(o.owner, el.id, 'CONFIGURED');
  await svc.transition(o.owner, el.id, 'REGISTRATION');
  await svc.importRegister(o.owner, el.id, 'memberId,fullName,email\nM1,One,m1@v.test\nM2,Two,m2@v.test');
  await svc.freezeRegister(o.owner, el.id);
  await svc.transition(o.owner, el.id, 'READY');
  await svc.transition(o.owner, el.id, 'OPEN');
  const { devCode } = await svc.requestOtp(el.id, 'M1');
  const { ballotSession } = await svc.verifyOtp(el.id, 'M1', devCode!);
  await svc.submitBallot(ballotSession, { [pos.id]: [cand.id] }, 'k1');
  await svc.closeElection(o.owner, el.id);
  if (upTo === 'votes') return el;
  for (const id of [o.a1, o.a2]) await svc.recordApproval(id, el.id, 'tally');
  await svc.tally(o.owner, el.id, { approvers: [o.a1, o.a2] });
  await svc.verifyTally(el.id);
  await svc.recordApproval(o.a1, el.id, 'certify');
  await svc.certify(o.owner, el.id, { certifiedBy: o.owner, secondApprover: o.a1 });
  await svc.publish(o.owner, el.id, { announcement: 'Done.' });
  return el;
}

const count = async (sqlText: string) => Number(((await pg.query(sqlText)).rows[0] as { n: number | string }).n);

describe('deleting an election on a real Postgres engine', () => {
  it('removes a published election with votes, results and sign-offs, and leaves other elections alone', async () => {
    const o = await org('a');
    const old = await election(o, 'Old', 'published');
    const keep = await election(o, 'Keep', 'votes');
    expect(await store.countBallots(old.id)).toBe(1);

    await svc.deleteElection(o.owner, o.orgId, old.id);

    expect(await store.getElection(old.id)).toBeNull();
    expect(await store.countBallots(old.id)).toBe(0);
    expect(await store.listVoters(old.id)).toHaveLength(0);
    expect(await store.latestTallyRun(old.id)).toBeNull();
    expect(await store.getCertification(old.id)).toBeNull();
    expect(await count(`select count(*) n from ballot.idempotency_keys where entitlement_id in (select id from identity.entitlements where election_id = '${old.id}')`)).toBe(0);
    // The other election, its ballot and its voters are untouched.
    expect(await store.getElection(keep.id)).not.toBeNull();
    expect(await store.countBallots(keep.id)).toBe(1);
    expect(await store.listVoters(keep.id)).toHaveLength(2);
  }, 60000);

  it('removes an election that was never finished, with its photos and ballot', async () => {
    const o = await org('b');
    const draft = await election(o, 'Draft', 'draft');
    expect(await count('select count(*) n from admin.candidate_photos')).toBeGreaterThan(0);
    await svc.deleteElection(o.owner, o.orgId, draft.id);
    expect(await store.getElection(draft.id)).toBeNull();
    expect(await store.listPositions(draft.id)).toHaveLength(0);
  }, 60000);

  it('keeps the append-only protection for everything else', async () => {
    const o = await org('c');
    const live = await election(o, 'Has votes', 'votes');
    expect(await store.countBallots(live.id)).toBe(1);

    // Plain deletes and updates are still refused...
    await expect(pg.query('delete from ballot.ballots')).rejects.toThrow(/append-only/);
    await expect(pg.query('delete from ballot.idempotency_keys')).rejects.toThrow(/append-only/);
    await expect(pg.query(`update ballot.ballots set iv = 'x'`)).rejects.toThrow(/append-only/);
    await expect(pg.query('delete from audit.audit_records')).rejects.toThrow(/append-only/);

    // ...even inside a transaction that has the delete flag on: only DELETE on ballots/keys is let through.
    await pg.exec('BEGIN');
    await pg.query(`select set_config('votemax.allow_election_delete', 'on', true)`);
    await expect(pg.query(`update ballot.ballots set iv = 'x'`)).rejects.toThrow(/append-only/);
    await pg.exec('ROLLBACK');
    await pg.exec('BEGIN');
    await pg.query(`select set_config('votemax.allow_election_delete', 'on', true)`);
    await expect(pg.query('delete from audit.audit_records')).rejects.toThrow(/append-only/);
    await pg.exec('ROLLBACK');

    expect(await store.countBallots(live.id)).toBe(1);
  }, 60000);

  it('the delete flag lapses when the transaction ends', async () => {
    const o = await org('d');
    const gone = await election(o, 'Will go', 'votes');
    const stays = await election(o, 'Stays', 'votes');
    await svc.deleteElection(o.owner, o.orgId, gone.id);
    // A later, plain delete is refused again: the flag did not leak into the connection.
    await expect(pg.query(`delete from ballot.ballots where election_id = '${stays.id}'`)).rejects.toThrow(/append-only/);
    expect(await store.countBallots(stays.id)).toBe(1);
  }, 60000);
});
