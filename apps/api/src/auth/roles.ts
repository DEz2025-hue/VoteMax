import type { Role } from '../db/schema';

export type { Role };

export interface Principal {
  userId: string;
  // Tenant resolved from the authenticated identity, never client input (SEC-TEN-01).
  organizationId: string | null;
  roles: RoleAssignment[];
}

export interface RoleAssignment {
  userId?: string;
  role: Role;
  organizationId: string;
  electionId?: string | null;
  validFrom?: string | Date | null;
  validTo?: string | Date | null;
}

export interface CapabilityScope {
  electionId?: string | null;
}

export type Capability =
  | 'organization.create'
  | 'roles.assign'
  | 'election.configure'
  | 'candidates.manage'
  | 'register.manage'
  | 'register.freeze'
  | 'election.readiness.approve'
  | 'election.openClose'
  | 'ballot.cast'
  | 'participation.viewAggregate'
  | 'tally.authorize'
  | 'tally.execute'
  | 'tally.verify'
  | 'results.certify'
  | 'results.publish'
  | 'platform.tenants.read'
  | 'platform.tenants.provision'
  | 'platform.health.read'
  | 'fraud.read'
  | 'fraud.manage'
  | 'audit.read';

// Permission matrix for the four-role model: platform_admin runs the
// control plane, organization_owner runs the whole tenant election
// lifecycle, auditor is read-only oversight, voter casts ballots.
// There is deliberately no capability for viewing a ballot selection
// linked to a voter: that is an architectural impossibility, not a permission.
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  platform_admin: [
    'organization.create',
    'platform.tenants.read',
    'platform.tenants.provision',
    'platform.health.read',
    'audit.read',
  ],
  organization_owner: [
    'roles.assign',
    'election.configure',
    'candidates.manage',
    'register.manage',
    'register.freeze',
    'election.readiness.approve',
    'election.openClose',
    'participation.viewAggregate',
    'tally.authorize',
    'tally.execute',
    'results.certify',
    'results.publish',
    'fraud.read',
    'fraud.manage',
    'audit.read',
  ],
  auditor: ['tally.verify', 'participation.viewAggregate', 'fraud.read', 'audit.read'],
  voter: ['ballot.cast'],
};

export function isAssignmentActive(assignment: RoleAssignment, now = Date.now()): boolean {
  if (assignment.validFrom && new Date(assignment.validFrom).getTime() > now) return false;
  if (assignment.validTo && new Date(assignment.validTo).getTime() <= now) return false;
  return true;
}

export function hasCapability(
  assignments: RoleAssignment[],
  capability: Capability,
  organizationId: string,
  scope: CapabilityScope = {},
): boolean {
  return assignments.some((a) => {
    if (a.organizationId !== organizationId) return false;
    if (!isAssignmentActive(a)) return false;
    if (!ROLE_CAPABILITIES[a.role].includes(capability)) return false;
    // Org-wide assignments (null scope) apply to every election; scoped
    // assignments apply only to their election.
    if (scope.electionId && a.electionId && a.electionId !== scope.electionId) return false;
    return true;
  });
}
