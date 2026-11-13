import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';
import { totpCode } from '../auth/credentials';

let svc: PlatformService;
let orgId: string;
let otherOrgId: string;
let adminId: string;
let adminTotp: string;
let electionId: string;

beforeEach(async () => {
  svc = new PlatformService();
  orgId = (await svc.createOrganization(null, 'Org', 'org')).id;
  otherOrgId = (await svc.createOrganization(null, 'Other', 'other')).id;
  const admin = await svc.createUser(orgId, 'admin@org', 'Admin', 'correct horse battery');
  adminId = admin.id;
  adminTotp = admin.totpSecret;
  await svc.assignRole('bootstrap', orgId, adminId, 'organization_owner');
  await svc.assignRole(adminId, orgId, adminId, 'election_admin');
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

  it('lists stations for an election', async () => {
    expect(await svc.listStationsForElection(electionId)).toEqual([]);
    const s = await svc.createStation(adminId, electionId, 'Main Campus');
    const list = await svc.listStationsForElection(electionId);
    expect(list).toEqual([s]);
    await expect(svc.listStationsForElection('missing')).rejects.toThrow();
  });

  it('logout revokes the session token', async () => {
    const { token } = await svc.login('admin@org', 'correct horse battery', totpCode(adminTotp));
    expect(await svc.principalForToken(token)).not.toBeNull();
    await svc.logout(token);
    expect(await svc.principalForToken(token)).toBeNull();
    // Logout is idempotent and tolerates unknown tokens.
    await svc.logout(token);
    await svc.logout('not-a-real-token');
  });

  it('rejects role assignments scoped to another tenant', async () => {
    const target = await svc.createUser(otherOrgId, 't@other', 'Target', 'correct horse battery');
    const foreignElection = (await svc.createElection(adminId, otherOrgId, { name: 'Foreign' })).id;
    await expect(svc.assignRole(adminId, orgId, target.id, 'election_admin', foreignElection))
      .rejects.toThrow(/FORBIDDEN: election does not belong/);
    const foreignStation = await svc.createStation(adminId, foreignElection, 'Foreign Station');
    await expect(svc.assignRole(adminId, orgId, target.id, 'station_officer', null, foreignStation.id))
      .rejects.toThrow(/FORBIDDEN: station does not belong/);
    // Same-tenant station scope still works.
    const station = await svc.createStation(adminId, electionId, 'Station A');
    const officer = await svc.createUser(orgId, 'officer@org', 'Officer', 'correct horse battery');
    await svc.assignRole(adminId, orgId, officer.id, 'station_officer', electionId, station.id);
    const assignments = await svc.store.listAssignments();
    expect(assignments.some((a) => a.userId === officer.id && a.stationId === station.id)).toBe(true);
  });
});
