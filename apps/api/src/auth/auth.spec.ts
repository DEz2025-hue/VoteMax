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
  it('registrar can manage register but cannot configure elections', () => {
    const a = [assign('voter_registrar')];
    expect(hasCapability(a, 'register.manage', ORG)).toBe(true);
    expect(hasCapability(a, 'election.configure', ORG)).toBe(false);
  });

  it('no role grants viewing a ballot linked to a voter', () => {
    // Capability does not exist in the type; assert no role maps to it at runtime.
    const all = Object.values(ROLE_CAPABILITIES).flat() as string[];
    expect(all).not.toContain('ballot.viewLinked');
  });

  it('capabilities do not leak across tenants', () => {
    const a = [assign('election_admin')];
    expect(hasCapability(a, 'election.configure', OTHER_ORG)).toBe(false);
  });

  it('station officer can run a session but cannot manage the register', () => {
    const a = [assign('station_officer', { stationId: 'st-1' })];
    expect(hasCapability(a, 'station.runSession', ORG)).toBe(true);
    expect(hasCapability(a, 'register.manage', ORG)).toBe(false);
  });

  it('election-scoped assignments do not satisfy another election', () => {
    const scoped = [assign('election_admin')]; // electionId: E1
    expect(hasCapability(scoped, 'election.configure', ORG, { electionId: E1 })).toBe(true);
    expect(hasCapability(scoped, 'election.configure', ORG, { electionId: 'election-2' })).toBe(false);
    const orgWide = [assign('election_admin', { electionId: null })];
    expect(hasCapability(orgWide, 'election.configure', ORG, { electionId: 'election-2' })).toBe(true);
  });

  it('station-scoped assignments do not satisfy another station', () => {
    const a = [assign('station_officer', { stationId: 'st-1' })];
    expect(hasCapability(a, 'station.runSession', ORG, { stationId: 'st-1' })).toBe(true);
    expect(hasCapability(a, 'station.runSession', ORG, { stationId: 'st-2' })).toBe(false);
  });

  it('honors assignment validity windows', () => {
    const expired = [assign('election_admin', { validTo: new Date(Date.now() - 1000).toISOString() })];
    const future = [assign('election_admin', { validFrom: new Date(Date.now() + 60_000).toISOString() })];
    const active = [assign('election_admin', {
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validTo: new Date(Date.now() + 60_000).toISOString(),
    })];
    expect(hasCapability(expired, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(future, 'election.configure', ORG)).toBe(false);
    expect(hasCapability(active, 'election.configure', ORG)).toBe(true);
  });
});

describe('separation of duties (EMP-STAKE-001 s.6)', () => {
  it('SoD-1 blocks registrar + election admin in the same election', () => {
    const v = checkSeparationOfDuties([assign('election_admin')], assign('voter_registrar'));
    expect(v.map((x) => x.rule)).toContain('SoD-1');
  });

  it('SoD-1 allows registrar in a different election', () => {
    const v = checkSeparationOfDuties(
      [assign('election_admin')],
      assign('voter_registrar', { electionId: 'election-2' }),
    );
    expect(v).toEqual([]);
  });

  it('SoD-1 treats an org-wide role as conflicting with every election scope', () => {
    // Org-wide election_admin (electionId null) + per-election registrar
    // must not bypass SoD-1.
    const v = checkSeparationOfDuties(
      [assign('election_admin', { electionId: null })],
      assign('voter_registrar'),
    );
    expect(v.map((x) => x.rule)).toContain('SoD-1');
    const v2 = checkSeparationOfDuties(
      [assign('election_admin')],
      assign('voter_registrar', { electionId: null }),
    );
    expect(v2.map((x) => x.rule)).toContain('SoD-1');
  });

  it('SoD-2 blocks candidate holding an admin role', () => {
    const v = checkSeparationOfDuties([assign('candidate')], assign('election_admin'));
    expect(v.map((x) => x.rule)).toContain('SoD-2');
  });

  it('SoD-3 blocks platform admin taking an election role', () => {
    const v = checkSeparationOfDuties([], { ...assign('election_admin'), isPlatformAdmin: true });
    expect(v.map((x) => x.rule)).toContain('SoD-3');
  });

  it('SoD-8 blocks auditor holding a modifying role', () => {
    const v = checkSeparationOfDuties([assign('auditor')], assign('voter_registrar'));
    expect(v.map((x) => x.rule)).toContain('SoD-8');
  });

  it('allows a clean assignment', () => {
    expect(checkSeparationOfDuties([], assign('voter_registrar'))).toEqual([]);
  });
});
