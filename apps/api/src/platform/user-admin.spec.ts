import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { totpCode } from '../auth/credentials';

let svc: PlatformService;
let orgId: string;
let ownerId: string;
let owner2Id: string;
let staffId: string;
let otherOrgUserId: string;

const PW = 'pw-long-enough';

beforeEach(async () => {
  svc = new PlatformService();
  orgId = (await svc.createOrganization(null, 'Org A', 'org-a')).id;
  const otherOrg = (await svc.createOrganization(null, 'Org B', 'org-b')).id;
  ownerId = (await svc.createUser(orgId, 'owner@a.test', 'Owner', PW)).id;
  owner2Id = (await svc.createUser(orgId, 'owner2@a.test', 'Owner Two', PW)).id;
  staffId = (await svc.createUser(orgId, 'staff@a.test', 'Staff', PW)).id;
  otherOrgUserId = (await svc.createUser(otherOrg, 'x@b.test', 'Other', PW)).id;
  await svc.assignRole(ownerId, orgId, ownerId, 'organization_owner');
  await svc.assignRole(ownerId, orgId, staffId, 'auditor');
});

describe('staff user administration', () => {
  it('resets the authenticator: old secret stops working, new one works, sessions end', async () => {
    const before = await svc.store.findUser(staffId);
    const oldSecret = before!.totpSecret!;
    // Staff signs in with the old secret and holds a live session.
    const { token } = await svc.login('staff@a.test', PW, totpNow(oldSecret));
    expect(await svc.principalForToken(token)).not.toBeNull();

    const reset = await svc.resetUserTotp(ownerId, orgId, staffId);
    expect(reset.totpSecret).not.toBe(oldSecret);
    expect(reset.email).toBe('staff@a.test');

    expect(await svc.principalForToken(token)).toBeNull(); // signed out everywhere
    await expect(svc.login('staff@a.test', PW, totpNow(oldSecret))).rejects.toThrow(/invalid MFA code/);
    await expect(svc.login('staff@a.test', PW, totpNow(reset.totpSecret))).resolves.toHaveProperty('token');
  });

  it('removes a user with their sessions and roles, and frees the email', async () => {
    const { token } = await svc.login('staff@a.test', PW, totpNow((await svc.store.findUser(staffId))!.totpSecret!));
    await svc.deleteUser(ownerId, orgId, staffId);
    expect(await svc.store.findUser(staffId)).toBeNull();
    expect(await svc.principalForToken(token)).toBeNull();
    expect((await svc.store.listAssignments()).some((a) => a.userId === staffId)).toBe(false);
    expect((await svc.listUsers(orgId)).map((u) => u.email)).not.toContain('staff@a.test');
    await expect(svc.createUser(orgId, 'staff@a.test', 'Staff Again', PW)).resolves.toHaveProperty('id');
  });

  it('never lets an admin reset or remove their own account', async () => {
    await expect(svc.resetUserTotp(ownerId, orgId, ownerId)).rejects.toThrow(/FORBIDDEN/);
    await expect(svc.deleteUser(ownerId, orgId, ownerId)).rejects.toThrow(/FORBIDDEN/);
  });

  it('cannot touch another organization\'s users', async () => {
    await expect(svc.resetUserTotp(ownerId, orgId, otherOrgUserId)).rejects.toThrow(/NOT_FOUND/);
    await expect(svc.deleteUser(ownerId, orgId, otherOrgUserId)).rejects.toThrow(/NOT_FOUND/);
    expect(await svc.store.findUser(otherOrgUserId)).not.toBeNull();
  });

  it('refuses to remove the only owner, but allows it once another owner exists', async () => {
    // owner2 is the actor here; ownerId is the sole owner.
    await expect(svc.deleteUser(owner2Id, orgId, ownerId)).rejects.toThrow(/only owner/);
    await svc.assignRole(ownerId, orgId, owner2Id, 'organization_owner');
    await expect(svc.deleteUser(owner2Id, orgId, ownerId)).resolves.toBeUndefined();
  });

  it('records both actions in the audit log', async () => {
    await svc.resetUserTotp(ownerId, orgId, staffId);
    await svc.deleteUser(ownerId, orgId, staffId);
    const actions = (await svc.auditEntries(orgId)).map((e) => e.action);
    expect(actions).toContain('user.totpReset');
    expect(actions).toContain('user.delete');
  });
});

const totpNow = (secret: string) => totpCode(secret);
