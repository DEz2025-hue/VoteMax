import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../db/schema';
import { PostgresStore } from './postgres.store';
import { PlatformService } from '../platform/platform.service';
import { signIn } from '../platform/test-signin';

/** The emailed staff sign-in code on the real migrated schema (not just the in-memory store). */
let svc: PlatformService;
let store: PostgresStore;

const PW = 'pw-long-enough';

beforeAll(async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  store = new PostgresStore(db as never);
  svc = new PlatformService(store);
}, 120000);

describe('staff sign-in code (Postgres)', () => {
  it('signs in with the code, once, and rejects wrong and reused codes', async () => {
    const orgId = (await svc.createOrganization(null, 'Org', 'pg-login')).id;
    const owner = (await svc.createUser(orgId, 'owner@pg-login.test', 'Owner', PW)).id;
    await svc.assignRole(owner, orgId, owner, 'organization_owner');

    const step = await svc.login('owner@pg-login.test', PW);
    expect(step.devCode).toMatch(/^\d{6}$/);
    const wrong = step.devCode === '000000' ? '111111' : '000000';
    await expect(svc.verifyLogin('owner@pg-login.test', wrong)).rejects.toThrow(/OTP_INVALID/);
    const session = await svc.verifyLogin('owner@pg-login.test', step.devCode!);
    expect(await svc.principalForToken(session.token)).not.toBeNull();
    await expect(svc.verifyLogin('owner@pg-login.test', step.devCode!)).rejects.toThrow(/OTP_EXPIRED/);
  });

  it('removes a user who still has a pending code', async () => {
    const orgId = (await svc.createOrganization(null, 'Org2', 'pg-login-2')).id;
    const owner = (await svc.createUser(orgId, 'owner@pg-login-2.test', 'Owner', PW)).id;
    const staff = (await svc.createUser(orgId, 'staff@pg-login-2.test', 'Staff', PW)).id;
    await svc.assignRole(owner, orgId, owner, 'organization_owner');
    await svc.assignRole(owner, orgId, staff, 'auditor');
    await svc.login('staff@pg-login-2.test', PW); // leaves a pending code
    expect(await store.getLoginChallenge(staff)).not.toBeNull();
    await svc.deleteUser(owner, orgId, staff);
    expect(await store.getLoginChallenge(staff)).toBeNull();
    expect(await store.findUser(staff)).toBeNull();
    // helper still works for the remaining account
    await expect(signIn(svc, 'owner@pg-login-2.test', PW)).resolves.toHaveProperty('token');
  });
});
