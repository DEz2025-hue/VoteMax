import type { Role } from '../db/schema';
import type { RoleAssignment } from './roles';

export interface SodViolation {
  rule: string;
  message: string;
}

/**
 * Separation-of-duties checks for the four-role model.
 * Evaluated before a new assignment is persisted; violations are
 * rejected and the attempt is audited (SoD-9, caller logs it).
 * Person-level independence inside tally/certification workflows is
 * enforced separately (SoD-4/SoD-5) in platform.service.
 */
export function checkSeparationOfDuties(
  existing: RoleAssignment[],
  candidate: RoleAssignment & { isPlatformAdmin?: boolean },
): SodViolation[] {
  const violations: SodViolation[] = [];
  // An org-wide assignment (electionId null) applies to every election, so
  // it conflicts with any same-organization election-scoped role.
  const sameElection = existing.filter(
    (a) =>
      a.organizationId === candidate.organizationId &&
      (a.electionId == null || candidate.electionId == null || a.electionId === candidate.electionId),
  );
  const held = new Set(sameElection.map((a) => a.role));
  const add = (rule: string, message: string) => violations.push({ rule, message });

  // SoD-3: platform administrator holds no election role in any organization.
  if (candidate.isPlatformAdmin && candidate.role !== 'platform_admin')
    add('SoD-3', 'A platform administrator cannot hold an election role in any organization.');
  if (candidate.role === 'platform_admin' && existing.length > 0)
    add('SoD-3', 'A user holding election roles cannot become platform administrator.');

  // SoD-8: the auditor is read-only oversight - it cannot be combined with
  // the data-modifying organization_owner role in the same election scope.
  if (candidate.role === 'auditor' && held.has('organization_owner'))
    add('SoD-8', 'An auditor cannot also be organization owner for the same election.');
  if (candidate.role === 'organization_owner' && held.has('auditor'))
    add('SoD-8', 'An organization owner cannot also be auditor for the same election.');

  return violations;
}
