import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformService } from './platform.service';
import { InMemoryStore } from '../store/memory.store';
import { ROLE_CAPABILITIES, type Role } from '../auth/roles';
import { totpCode } from '../auth/credentials';

let svc: PlatformService;
let store: InMemoryStore;
let orgA: string;
let orgB: string;
let platformAdminId: string;
let platformAdminTotp: string;

beforeEach(async () => {
  svc = new PlatformService();
  store = svc.store as InMemoryStore;
  orgA = (await svc.createOrganization(null, 'Org A', 'orga')).id;
  orgB = (await svc.createOrganization(null, 'Org B', 'orgb')).id;
  // First-run bootstrap: seed the platform_admin anonymously before the
  // window closes (mirrors real deployment ordering).
  const pa = await svc.createUser(null, 'root@platform', 'Root Admin', 'correct horse battery');
  platformAdminId = pa.id;
  platformAdminTotp = pa.totpSecret;
  await svc.assignRole('bootstrap', orgA, pa.id, 'platform_admin');
});

describe('platform capabilities', () => {
  it('grants platform.* capabilities only to platform_admin', () => {
    for (const role of Object.keys(ROLE_CAPABILITIES) as Role[]) {
      const caps = ROLE_CAPABILITIES[role];
      const platformCaps = caps.filter((c) => c.startsWith('platform.'));
      if (role === 'platform_admin') {
        expect(platformCaps).toEqual(
          expect.arrayContaining(['platform.tenants.read', 'platform.tenants.provision', 'platform.health.read']),
        );
      } else {
        expect(platformCaps).toEqual([]);
      }
    }
  });
});

describe('tenant directory', () => {
  it('lists organizations with counts and staffing status', async () => {
    await svc.createElection(platformAdminId, orgB, { name: 'Org B Election' });
    const dir = await svc.listTenantDirectory();
    expect(dir).toHaveLength(2);

    const a = dir.find((d) => d.id === orgA)!;
    expect(a.userCount).toBe(0); // platform admin user is org-less (organizationId null)
    expect(a.staffed).toBe(false); // platform_admin is not tenant staffing

    const b = dir.find((d) => d.id === orgB)!;
    expect(b.electionCount).toBe(1);
    expect(b.electionsByState).toEqual({ DRAFT: 1 });
    expect(b.staffed).toBe(false); // the onboarding dead-end this fixes
  });

  it('returns sanitized tenant detail without secrets', async () => {
    const detail = await svc.tenantDetail(orgB);
    expect(detail.users).toEqual([]);
    expect(detail.roleAssignments).toEqual([]);

    await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'owner@orgb', displayName: 'Org B Owner', password: 'correct horse battery',
    });
    const after = await svc.tenantDetail(orgB);
    expect(after.users).toHaveLength(1);
    expect(after.users[0]).not.toHaveProperty('passwordHash');
    expect(after.users[0]).not.toHaveProperty('totpSecret');
    expect(after.roleAssignments.some((a) => a.role === 'organization_owner')).toBe(true);
  });
});

describe('tenant provisioning', () => {
  it('creates an org owner who can log in with MFA', async () => {
    const res = await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'owner@orgb', displayName: 'Org B Owner', password: 'correct horse battery',
    });
    expect(res.totpSecret).toBeTruthy();

    const login = await svc.login('owner@orgb', 'correct horse battery', totpCode(res.totpSecret));
    expect(login.token).toBeTruthy();
    expect(login.userId).toBe(res.userId);
  });

  it('audits provisioning under the platform actor', async () => {
    await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'owner@orgb', displayName: 'Org B Owner', password: 'correct horse battery',
    });
    const audit = await svc.auditEntries(orgB);
    expect(audit.some((a) => a.action === 'platform.provisionAdmin' && a.actorId === platformAdminId)).toBe(true);
    expect(audit.some((a) => a.action === 'role.assign' && a.outcome === 'success:organization_owner')).toBe(true);
  });

  it('rejects duplicate emails and weak passwords', async () => {
    await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'owner@orgb', displayName: 'Org B Owner', password: 'correct horse battery',
    });
    await expect(svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'OWNER@orgb', displayName: 'Dup', password: 'correct horse battery',
    })).rejects.toThrow(/EMAIL_EXISTS/);
    await expect(svc.createUser(orgB, 'weak@orgb', 'Weak', 'short')).rejects.toThrow(/WEAK_PASSWORD/);
    await expect(svc.createUser('missing-org', 'x@orgb', 'X', 'correct horse battery'))
      .rejects.toThrow(/NOT_FOUND: organization/);
  });

  it('provisions an election_admin scoped to a specific election', async () => {
    const election = await svc.createElection(platformAdminId, orgB, { name: 'Org B Election' });
    const res = await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'eadmin@orgb', displayName: 'Election Admin', password: 'correct horse battery',
      role: 'election_admin', electionId: election.id,
    });
    expect(res.role).toBe('election_admin');
    const detail = await svc.tenantDetail(orgB);
    const assignment = detail.roleAssignments.find((a) => a.userId === res.userId);
    expect(assignment).toMatchObject({ role: 'election_admin', electionId: election.id });
  });

  it('rejects non-provisionable roles and foreign elections', async () => {
    const foreign = await svc.createElection(platformAdminId, orgA, { name: 'Org A Election' });
    for (const role of ['platform_admin', 'voter', 'candidate', 'station_officer'] as const) {
      await expect(svc.provisionTenantAdmin(platformAdminId, orgB, {
        email: `${role}@orgb`, displayName: role, password: 'correct horse battery', role,
      })).rejects.toThrow(/FORBIDDEN: role/);
    }
    await expect(svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'bad@orgb', displayName: 'Bad', password: 'correct horse battery',
      role: 'election_admin', electionId: foreign.id,
    })).rejects.toThrow(/FORBIDDEN: election does not belong/);
  });

  it('marks the tenant staffed after provisioning', async () => {
    await svc.provisionTenantAdmin(platformAdminId, orgB, {
      email: 'owner@orgb', displayName: 'Org B Owner', password: 'correct horse battery',
    });
    const b = (await svc.listTenantDirectory()).find((d) => d.id === orgB)!;
    expect(b.staffed).toBe(true);
  });
});

describe('platform health', () => {
  it('reports store, providers, and security signals without secrets', async () => {
    const health = await svc.platformHealth();
    expect(health.store).toBe('memory');
    expect(health.pendingAuditEntries).toBe(0);
    expect(health.dbLatencyMs).toBeGreaterThanOrEqual(0);
    expect(health.otpProviders.devAllowed).toBe(true);
    expect(health.otpProviders.email).toBe(false); // no SMTP_* in test env
    expect(health.securitySignals.scope).toMatch(/per-process/);
    expect(JSON.stringify(health)).not.toMatch(/passwordHash|totpSecret|apiKey/i);
  });
});
