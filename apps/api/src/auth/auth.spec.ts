import { describe, it, expect } from 'vitest';
import { hasCapability, ROLE_CAPABILITIES, type RoleAssignment } from './roles';
import { checkSeparationOfDuties } from './sod';

const ORG = 'org-1';
const OTHER_ORG = 'org-2';
const E1 = 'election-1';

const assign = (role: RoleAssignment['role'], extra: Partial<RoleAssignment> = {}): RoleAssignment => ({
  role,
  organizationId: ORG,
  electionId: E1,
  ...extra,
});

describe('permission matrix (EMP-STAKE-001 s.5, FR-IAM-002)', () => {
  it('organization owner can manage the register and configure elections', () => {
    const a = [assign('organization_owner')];
    expect(hasCapability(a, 'register.manage', ORG)).toBe(true);
    expect(hasCapability(a, 'register.freeze', ORG)).toBe(true);
    expect(hasCapability(a, 'election.configure', ORG)).toBe(true);
    expect(hasCapability(a, 'candidates.manage', ORG)).toBe(true);
    expect(hasCapability(a, 'tally.execute', ORG)).toBe(true);
  });

  it('auditor is read-only: oversight capabilities but no modifying ones', () => {
    const a = [assign('auditor')];
    expect(hasCapability(a, 'tally.verify', ORG)).toBe(true);
    expect(hasCapability(a, 'participation.viewAggregate', ORG)).toBe(true);
    expect(hasCapability(a, 'audit.read', ORG)).toBe(true);
    expect(hasCapability(a, 'register.manage', ORG)).toBe(false);
    expect(hasCapability(a, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(a, 'tally.execute', ORG)).toBe(false);
    expect(hasCapability(a, 'results.certify', ORG)).toBe(false);
  });

  it('voter can only cast a ballot', () => {
    const a = [assign('voter')];
    expect(hasCapability(a, 'ballot.cast', ORG)).toBe(true);
    expect(hasCapability(a, 'audit.read', ORG)).toBe(false);
    expect(hasCapability(a, 'election.configure', ORG)).toBe(false);
  });

  it('platform admin holds only platform control-plane capabilities', () => {
    const a = [assign('platform_admin', { organizationId: OTHER_ORG })];
    expect(hasCapability(a, 'platform.tenants.provision', OTHER_ORG)).toBe(true);
    expect(hasCapability(a, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(a, 'register.manage', ORG)).toBe(false);
  });

  it('no role grants viewing a ballot linked to a voter', () => {
    // Capability does not exist in the type; assert no role maps to it at runtime.
    const all = Object.values(ROLE_CAPABILITIES).flat() as string[];
    expect(all).not.toContain('ballot.viewLinked');
  });

  it('capabilities do not leak across tenants', () => {
    const a = [assign('organization_owner')];
    expect(hasCapability(a, 'election.configure', OTHER_ORG)).toBe(false);
  });

  it('election-scoped assignments do not satisfy another election', () => {
    const scoped = [assign('organization_owner')]; // electionId: E1
    expect(hasCapability(scoped, 'election.configure', ORG, { electionId: E1 })).toBe(true);
    expect(hasCapability(scoped, 'election.configure', ORG, { electionId: 'election-2' })).toBe(false);
    const orgWide = [assign('organization_owner', { electionId: null })];
    expect(hasCapability(orgWide, 'election.configure', ORG, { electionId: 'election-2' })).toBe(true);
  });

  it('honors assignment validity windows', () => {
    const expired = [assign('organization_owner', { validTo: new Date(Date.now() - 1000).toISOString() })];
    const future = [assign('organization_owner', { validFrom: new Date(Date.now() + 60_000).toISOString() })];
    const active = [assign('organization_owner', {
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 60_000).toISOString(),
    })];
    expect(hasCapability(expired, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(future, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(active, 'election.configure', ORG)).toBe(true);
  });
});

describe('separation of duties (EMP-STAKE-001 s.6)', () => {
  it('SoD-8 blocks auditor combined with organization owner in the same election', () => {
    const v = checkSeparationOfDuties([assign('organization_owner')], assign('auditor'));
    expect(v.map((x) => x.rule)).toContain('SoD-8');
  });

  it('SoD-8 treats an org-wide owner as conflicting with every election scope', () => {
    const v = checkSeparationOfDuties(
      [assign('organization_owner', { electionId: null })],
      assign('auditor'),
    );
    expect(v.map((x) => x.rule)).toContain('SoD-8');
    const v2 = checkSeparationOfDuties(
      [assign('organization_owner')],
      assign('auditor', { electionId: null }),
    );
    expect(v2.map((x) => x.rule)).toContain('SoD-8');
  });

  it('SoD-8 allows auditor in a different election than the owner', () => {
    const v = checkSeparationOfDuties(
      [assign('organization_owner')],
      assign('auditor', { electionId: 'election-2' }),
    );
    expect(v).toEqual([]);
  });

  it('SoD-3 blocks platform admin taking an election role', () => {
    const v = checkSeparationOfDuties([], { ...assign('organization_owner'), isPlatformAdmin: true });
    expect(v.map((x) => x.rule)).toContain('SoD-3');
  });

  it('SoD-3 blocks an election-role holder becoming platform admin', () => {
    const v = checkSeparationOfDuties([assign('auditor')], { ...assign('platform_admin'), organizationId: OTHER_ORG });
    expect(v.map((x) => x.rule)).toContain('SoD-3');
  });

  it('allows a clean assignment', () => {
    expect(checkSeparationOfDuties([], assign('auditor'))).toEqual([]);
  });
});
