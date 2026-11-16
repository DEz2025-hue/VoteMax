import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { signIn } from './test-signin';

let svc: PlatformService;
let orgId: string;
let otherOrgId: string;
let adminId: string;
let electionId: string;

beforeEach(async () => {
  svc = new PlatformService();
  orgId = (await svc.createOrganization(null, 'Org', 'org')).id;
  otherOrgId = (await svc.createOrganization(null, 'Other', 'other')).id;
  const admin = await svc.createUser(orgId, 'admin@org.test', 'Admin', 'correct horse battery');
  adminId = admin.id;
  await svc.assignRole('bootstrap', orgId, adminId, 'organization_owner');
  electionId = (await svc.createElection(adminId, orgId, { name: 'Election' })).id;
});

describe('admin console wiring', () => {
  it('lists org elections across all lifecycle states', async () => {
    const list = await svc.listOrgElections(orgId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: electionId, name: 'Election', state: 'DRAFT' });
    expect(list[0]).not.toHaveProperty('organizationId');
    await expect(svc.listOrgElections('missing')).rejects.toThrow(/NOT_FOUND/);
  });

  it('logout revokes the session token', async () => {
    const { token } = await signIn(svc, 'admin@org.test', 'correct horse battery');
    expect(await svc.principalForToken(token)).not.toBeNull();
    await svc.logout(token);
    expect(await svc.principalForToken(token)).toBeNull();
    // Logout is idempotent and tolerates unknown tokens.
    await svc.logout(token);
    await svc.logout('not-a-real-token');
  });

  it('rejects role assignments scoped to another tenant', async () => {
    const target = await svc.createUser(otherOrgId, 't@other.test', 'Target', 'correct horse battery');
    const foreignElection = (await svc.createElection(adminId, otherOrgId, { name: 'Foreign' })).id;
    await expect(svc.assignRole(adminId, orgId, target.id, 'auditor', foreignElection))
      .rejects.toThrow(/FORBIDDEN: election does not belong/);
    // Same-tenant election scope still works.
    const auditor = await svc.createUser(orgId, 'auditor@org.test', 'Auditor', 'correct horse battery');
    await svc.assignRole(adminId, orgId, auditor.id, 'auditor', electionId);
    const assignments = await svc.store.listAssignments();
    expect(assignments.some((a) => a.userId === auditor.id && a.electionId === electionId)).toBe(true);
  });
});
