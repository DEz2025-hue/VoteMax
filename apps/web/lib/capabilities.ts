/**
 * Client-side mirror of the API's role → capability matrix (apps/api/src/auth/roles.ts).
 * Used only to hide/disable UI the server would reject anyway — the API remains
 * the enforcement point. Keep in sync with ROLE_CAPABILITIES.
 */

export interface AssignmentInfo {
  role: string;
  organizationId: string | null;
  electionId?: string | null;
  stationId?: string | null;
}

export const ROLE_CAPABILITIES: Record<string, string[]> = {
  platform_admin: [
    'organization.create',
    'platform.tenants.read',
    'platform.tenants.provision',
    'platform.health.read',
    'audit.read',
  ],
  organization_owner: ['roles.assign', 'participation.viewAggregate', 'fraud.read', 'audit.read'],
  committee_chair: [
    'register.freeze',
    'election.readiness.approve',
    'election.openClose',
    'participation.viewAggregate',
    'tally.authorize',
    'results.certify',
    'fraud.read',
    'fraud.manage',
    'audit.read',
  ],
  election_admin: [
    'election.configure',
    'candidates.manage',
    'participation.viewAggregate',
    'tally.execute',
    'results.publish',
    'fraud.read',
    'fraud.manage',
  ],
  voter_registrar: ['register.manage', 'participation.viewAggregate'],
  candidate: [],
  voter: ['ballot.cast'],
  station_officer: ['station.runSession'],
  observer: ['participation.viewAggregate', 'fraud.read'],
  auditor: ['tally.verify', 'participation.viewAggregate', 'fraud.read', 'audit.read'],
};

export interface CapabilityScope {
  electionId?: string | null;
  stationId?: string | null;
}

/** Mirrors hasCapability() in apps/api/src/auth/roles.ts. */
export function hasCapability(
  assignments: AssignmentInfo[],
  organizationId: string,
  capability: string,
  scope: CapabilityScope = {},
): boolean {
  return assignments.some((a) => {
    if (a.organizationId !== organizationId) return false;
    if (!ROLE_CAPABILITIES[a.role]?.includes(capability)) return false;
    if (scope.electionId && a.electionId && a.electionId !== scope.electionId) return false;
    if (scope.stationId && a.stationId !== scope.stationId) return false;
    return true;
  });
}
