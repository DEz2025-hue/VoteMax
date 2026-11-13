import type { Role } from '../db/schema';
import type { RoleAssignment } from './roles';

export interface SodViolation {
  rule: string;
  message: string;
}

const ADMIN_ROLES: Role[] = ['election_admin', 'voter_registrar', 'station_officer'];

/**
 * Separation-of-duties checks from EMP-STAKE-001 section 6.
 * Evaluated before a new assignment is persisted; violations are
 * rejected and the attempt is audited (SoD-9, caller logs it).
 * Key custody / tally-approver are function-level responsibilities,
 * checked in their own workflows (SoD-4/SoD-5) at Phase 3.
 */
export function checkSeparationOfDuties(
  existing: RoleAssignment[],
  candidate: RoleAssignment & { isPlatformAdmin?: boolean },
): SodViolation[] {
  const violations: SodViolation[] = [];
  // An org-wide assignment (electionId null) applies to every election, so
  // it conflicts with any same-organization election-scoped role — otherwise
  // a user could hold e.g. org-wide election_admin plus per-election
  // voter_registrar and defeat SoD-1.
  const sameElection = existing.filter(
    (a) =>
      a.organizationId === candidate.organizationId &&
      (a.electionId == null || candidate.electionId == null || a.electionId === candidate.electionId),
  );
  const held = new Set(sameElection.map((a) => a.role));
  const add = (rule: string, message: string) => violations.push({ rule, message });

  // SoD-1: registrar and election administrator are mutually exclusive.
  if (candidate.role === 'voter_registrar' && held.has('election_admin'))
    add('SoD-1', 'A voter registrar cannot also be election administrator for the same election.');
  if (candidate.role === 'election_admin' && held.has('voter_registrar'))
    add('SoD-1', 'An election administrator cannot also be voter registrar for the same election.');

  // SoD-2: a candidate holds no administrative/registrar/officer role.
  if (candidate.role === 'candidate' && ADMIN_ROLES.some((r) => held.has(r)))
    add('SoD-2', 'A candidate cannot hold an administrative, registrar, or officer role in the same election.');
  if (ADMIN_ROLES.includes(candidate.role) && held.has('candidate'))
    add('SoD-2', 'An administrator, registrar, or officer cannot be a candidate in the same election.');

  // SoD-3: platform administrator holds no election role in any organization.
  if (candidate.isPlatformAdmin && candidate.role !== 'platform_admin')
    add('SoD-3', 'A platform administrator cannot hold an election role in any organization.');
  if (candidate.role === 'platform_admin' && existing.length > 0)
    add('SoD-3', 'A user holding election roles cannot become platform administrator.');

  // SoD-7: station officer cannot administer the register.
  if (candidate.role === 'station_officer' && held.has('voter_registrar'))
    add('SoD-7', 'A polling station officer cannot administer the voter register.');
  if (candidate.role === 'voter_registrar' && held.has('station_officer'))
    add('SoD-7', 'A voter registrar cannot be a polling station officer in the same election.');

  // SoD-8: observer/auditor cannot hold any role that modifies election data.
  const modifying: Role[] = [...ADMIN_ROLES, 'committee_chair', 'organization_owner'];
  if ((candidate.role === 'observer' || candidate.role === 'auditor') && modifying.some((r) => held.has(r)))
    add('SoD-8', 'An observer or auditor cannot hold a role that modifies election data.');
  if (modifying.includes(candidate.role) && (held.has('observer') || held.has('auditor')))
    add('SoD-8', 'A modifying role cannot be added for an observer or auditor in the same election.');

  return violations;
}
