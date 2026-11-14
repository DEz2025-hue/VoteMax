# Stakeholders and User Roles

**Document ID:** EMP-STAKE-001\
**Version:** 0.2\
**Status:** Draft for review\
**Document Type:** Stakeholder and Access Definition\
**Last Updated:** 14 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001\
**Owner:** Product Owner

> **v0.2 change:** the role model was simplified to four roles
> (`platform_admin`, `organization_owner`, `auditor`, `voter`). The former
> committee chair, election administrator, voter registrar, observer,
> candidate, and station officer roles were removed; their responsibilities
> were absorbed by the owner and auditor, candidates became election records
> rather than user roles, and in-person/assisted voting was removed — all
> voting is online.

---

## 1. Purpose

This document identifies who has a stake in VoteMax and defines the user roles, their responsibilities, their permissions, and the separation-of-duties rules that protect election integrity.

Permissions defined here must be **enforced on the server**, not merely hidden in the interface (EMP-FOUND-001 section 8.2).

## 2. Stakeholders

### 2.1 Project governance stakeholders

| Stakeholder | Interest | Responsibility |
|---|---|---|
| Product Owner | Product direction and acceptance | Scope, priorities, acceptance |
| Technical Lead | System quality | Architecture, engineering standards, implementation |
| Security Lead | Security and privacy assurance | Security requirements, threat management, assurance |
| Election Operations Lead | Election-day success | Procedures, reconciliation |
| Independent Reviewer | Objective assessment | External security and election-integrity review |

### 2.2 Election stakeholders (per organization)

| Stakeholder | Interest | Involvement |
|---|---|---|
| Organization election committee | Legitimate, defensible result | Authority over the specific election and its rules |
| Organization leadership (for example, organization administration) | Reputation, compliance | Approves use of the platform |
| Voters | Easy, private, trustworthy voting | Cast ballots |
| Candidates and their supporters | Fairness, transparency | Stand for a position; observe published results |
| Auditors | Verification | Review audit, turnout, and tally evidence |

### 2.3 External stakeholders

| Stakeholder | Interest |
|---|---|
| Legal and data-protection advisers | Compliance with Liberian requirements (DEC-005) |
| Hosting and infrastructure providers | Service delivery (DEC-002) |
| Connectivity and messaging providers | Delivery of notifications and access |
| Independent security assessor | Assurance reports (DEC-007) |
| Regulators and institutional authorities | Legitimacy of the election process |

## 3. Role Catalog

Roles are scoped. A role assignment belongs to an organization and may be further limited to a specific election.

| # | Role | Scope | Purpose |
|---|---|---|---|
| 1 | Platform administrator | Platform | Operate the platform, create organizations and initial owner accounts; **no access to ballot or tally material** |
| 2 | Organization owner | Organization / election | Runs the tenant: staff, voter register, elections, candidates, and election operations |
| 3 | Auditor | Organization / election | Read-only oversight: election progress, turnout, audit records, results, tally verification |
| 4 | Voter | Election | Authenticates, views eligible elections, casts a ballot |

Two additional **function-level responsibilities** are required by EMP-FOUND-001 and assigned as responsibilities, not as everyday roles:

- **Key custodian:** holds a share of cryptographic key control (model subject to DEC-006). Multiple custodians are required.
- **Tally approver:** takes part in the multi-party approval of the tally (filled by owners and auditors under the owner + auditor split, section 6).

**Removed roles (v0.1 → v0.2):**

- `committee_chair` — responsibilities absorbed by `organization_owner`.
- `election_admin` — responsibilities absorbed by `organization_owner`.
- `voter_registrar` — responsibilities absorbed by `organization_owner`.
- `observer` — responsibilities absorbed by `auditor`.
- `candidate` — now an election record, not a user role.
- `station_officer` — removed; there is no in-person voting.

## 4. Role Descriptions

### 4.1 Platform administrator
- Creates and suspends organization workspaces; provisions initial owner accounts; manages platform health and configuration.
- **Cannot** read ballots, tally material, or key material; **cannot** act as an election administrator, registrar, or custodian in any organization.
- Privileged actions are logged and subject to review.

### 4.2 Organization owner
- Manages staff accounts and role assignments (`roles.assign`).
- Manages the voter register: import, eligibility, duplicates, freeze.
- Configures elections: positions, candidates, ballot rules, voting windows.
- Runs election operations: readiness approval, opening, closing, tally execution, certification, publication.
- Cannot be combined with the auditor role for the same election (SoD-8).

### 4.3 Auditor
- Read-only access to election progress, turnout statistics, audit records, results, and tally evidence.
- Can act as a tally approver and certification second approver — the independent check on owner-run tallies.
- Cannot modify any election data; cannot hold the owner role for the same election (SoD-8).

### 4.4 Voter
- Authenticates with member ID + one-time code, views eligible elections, submits a ballot, checks submission status.
- Ballots are cast online only; there is no assisted or in-person voting channel.

### 4.5 Candidate (election record)
- A candidate is data attached to a position in an election — not a user account and not a role.
- Candidate records carry name and statement only; they confer no system access.

## 5. Permission Matrix

Legend: **C** create, **R** read, **U** update, **A** approve, **X** execute, **–** none. "Own" means the user's own record only. "Agg" means aggregate-only, never identified selections.

| Capability | Platform admin | Org owner | Auditor | Voter |
|---|---|---|---|---|
| Create organization | CRU | – | – | – |
| Provision initial owner account | X | – | – | – |
| Assign org roles | – | CRU | – | – |
| Create/configure election | – | CRU | R | – |
| Manage candidates | – | CRU | R | – |
| Import/manage voter register | – | CRU | R | R(own eligibility) |
| Resolve duplicate/eligibility cases | – | CRU | R | – |
| Freeze register | – | A | R | – |
| Approve election readiness | – | A | R | – |
| Open / close election | – | A | R | – |
| Cast ballot (online) | – | – | – | X |
| View participation (aggregate) | – | R(Agg) | R(Agg) | – |
| View ballot selections linked to a voter | – | – | – | – |
| Hold key custody | – | – | – | – (custodian responsibility) |
| Authorize tally | – | A | R | – |
| Execute tally | – | X (with approvers) | – | – |
| Verify tally evidence | – | R | X | – |
| Certify results | – | A | A (second approver) | – |
| Publish results | – | X | R | R |
| Read audit records | R(platform) | R(org) | R | – |
| Read fraud signals | – | R | R | – |
| Manage fraud blocks | – | X | – | – |

**Notes**
1. No role can see a ballot selection linked to an identified voter. This is an architectural property, not only a permission rule.
2. Platform administrator read access is limited to platform operations data. It excludes election content, ballots, tally material, and keys.
3. "Execute tally" requires prior authorization by an owner and approvals from at least two separate individuals, at least one of whom is an auditor (section 6).
4. The final matrix is verified in the security review and enforced by automated authorization tests.

## 6. Separation of Duties

The following rules apply per election and are enforced by the system:

| Rule | Description |
|---|---|
| SoD-3 | The platform administrator cannot hold any election role in any organization. |
| SoD-4 | Key custody requires multiple custodians; no single person can unseal tally material. |
| SoD-5 | Tally authorization, tally execution, and certification require separate individuals: the tally authorizer (an owner) cannot execute the tally, and the tally executor cannot certify. |
| SoD-8 | The auditor cannot hold the organization owner role for the same election — oversight must be independent of operation. |
| SoD-9 | Role grants that would violate a rule above are rejected, and attempts are audited. |

**Owner + auditor tally split.** Because the owner runs the whole tenant, tally and certification keep their independence through person-level separation rather than role separation:

- **Tally:** an owner authorizes, a *different* user executes, and at least two approvers sign off — at least one of whom must be an auditor.
- **Certification:** an owner certifies with an auditor as the required second approver; the certifier cannot be the tally executor.

## 7. Role Assignment Rules

1. Role assignments are time-bound for elections: they start and end with defined windows where practical.
2. Assignments are granted by an authorized higher role and recorded in the audit trail (FR-IAM-006).
3. Privileged roles (owner, auditor, platform admin) require multi-factor authentication (FR-IAM-001).
4. Emergency access ("break-glass") is limited, requires multiple approvers, is time-boxed, and is reviewed after use.
5. Role changes after the register freeze or election opening require the exception procedure in `ELECTION_LIFECYCLE.md`.
6. Roles are reviewed before every election. Unused assignments are revoked.

## 8. Voter Authentication Context

Voter authentication is election-specific (DEC-004). Whatever method is chosen must:

- Bind the voter to one eligible record.
- Resist impersonation and credential sharing within reasonable limits.
- Work for voters with limited connectivity and devices.

## 9. Stakeholder Communication

| Audience | Needs | Channel (proposed) |
|---|---|---|
| Voters | Clear steps, deadlines, support contacts | Notification channel, help page |
| Candidates | Rules, timelines, published results | Candidate briefing, official notices |
| Auditors | Approved evidence access | Scoped read-only views |
| Committee | Readiness status, approvals, incident updates | Admin dashboard, meetings |
| Observers | Approved evidence access | Scoped read-only views (auditor role) |

## 10. Open Questions

| ID | Question |
|---|---|
| Q-STK-001 | Who are the named individuals for each governance role in the pilot? (EMP-FOUND-001 section 17) |
| Q-STK-002 | How many key custodians and what threshold will be used? (DEC-006) |
| Q-STK-003 | Which external observers will the pilot committee accredit, and with what scope? |
| Q-STK-004 | Who is the institutional authority that can resolve disputes about eligibility and results? |

## Document Control

| Field | Value |
|---|---|
| Document | Stakeholders and User Roles |
| ID | EMP-STAKE-001 |
| Version | 0.2 |
| Status | Draft for review |
| Owner | Product Owner |
| Review frequency | At major project milestones |
| Change control | Version-controlled updates |

**End of document.**
