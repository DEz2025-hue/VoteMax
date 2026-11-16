import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { signIn } from './test-signin';

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
  it('removes a user with their sessions and roles, and frees the email', async () => {
    const { token } = await signIn(svc, 'staff@a.test', PW);
    await svc.deleteUser(ownerId, orgId, staffId);
    expect(await svc.store.findUser(staffId)).toBeNull();
    expect(await svc.principalForToken(token)).toBeNull();
    expect((await svc.store.listAssignments()).some((a) => a.userId === staffId)).toBe(false);
    expect((await svc.listUsers(orgId)).map((u) => u.email)).not.toContain('staff@a.test');
    await expect(svc.createUser(orgId, 'staff@a.test', 'Staff Again', PW)).resolves.toHaveProperty('id');
  });

  it('never lets an admin remove their own account', async () => {
    await expect(svc.deleteUser(ownerId, orgId, ownerId)).rejects.toThrow(/FORBIDDEN/);
  });

  it('cannot touch another organization\'s users', async () => {
    await expect(svc.deleteUser(ownerId, orgId, otherOrgUserId)).rejects.toThrow(/NOT_FOUND/);
    expect(await svc.store.findUser(otherOrgUserId)).not.toBeNull();
  });

  it('refuses to remove the only owner, but allows it once another owner exists', async () => {
    // owner2 is the actor here; ownerId is the sole owner.
    await expect(svc.deleteUser(owner2Id, orgId, ownerId)).rejects.toThrow(/only owner/);
    await svc.assignRole(ownerId, orgId, owner2Id, 'organization_owner');
    await expect(svc.deleteUser(owner2Id, orgId, ownerId)).resolves.toBeUndefined();
  });

  it('records the removal in the audit log', async () => {
    await svc.deleteUser(ownerId, orgId, staffId);
    const actions = (await svc.auditEntries(orgId)).map((e) => e.action);
    expect(actions).toContain('user.delete');
  });
});
