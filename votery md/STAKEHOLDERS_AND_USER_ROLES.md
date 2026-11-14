# Stakeholders and User Roles

**Document ID:** EMP-STAKE-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Stakeholder and Access Definition\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001\
**Owner:** Product Owner

---

## 1. Purpose

This document identifies who has a stake in EMP and defines the user roles, their responsibilities, their permissions, and the separation-of-duties rules that protect election integrity.

Permissions defined here must be **enforced on the server**, not merely hidden in the interface (EMP-FOUND-001 section 8.2).

## 2. Stakeholders

### 2.1 Project governance stakeholders

| Stakeholder | Interest | Responsibility |
|---|---|---|
| Product Owner | Product direction and acceptance | Scope, priorities, acceptance |
| Technical Lead | System quality | Architecture, engineering standards, implementation |
| Security Lead | Security and privacy assurance | Security requirements, threat management, assurance |
| Election Operations Lead | Election-day success | Procedures, station operations, reconciliation |
| Independent Reviewer | Objective assessment | External security and election-integrity review |

### 2.2 Election stakeholders (per organization)

| Stakeholder | Interest | Involvement |
|---|---|---|
| Organization election committee | Legitimate, defensible result | Authority over the specific election and its rules |
| Organization leadership (for example, organization administration) | Reputation, compliance | Approves use of the platform |
| Voters | Easy, private, trustworthy voting | Cast ballots |
| Candidates and their supporters | Fairness, transparency | Contest the election; observe |
| Polling station officers | Smooth operation | Assist voters at stations |
| Observers | Process transparency | Observe within approved scope |
| Independent auditors | Verification | Review audit and tally evidence |

### 2.3 External stakeholders

| Stakeholder | Interest |
|---|---|
| Legal and data-protection advisers | Compliance with Liberian requirements (DEC-005) |
| Hosting and infrastructure providers | Service delivery (DEC-002) |
| Connectivity and messaging providers | Delivery of notifications and access |
| Independent security assessor | Assurance reports (DEC-007) |
| Regulators and institutional authorities | Legitimacy of the election process |

## 3. Role Catalog

Roles are scoped. A role assignment belongs to an organization and may be further limited to a specific election or station.

| # | Role | Scope | Purpose |
|---|---|---|---|
| 1 | Platform administrator | Platform | Operate the platform, create organizations; **no access to ballot or tally material** |
| 2 | Organization owner | Organization | Accountable owner of the organization workspace |
| 3 | Election committee chair | Election | Leads election governance; approves critical transitions and certification |
| 4 | Election administrator | Election | Configures and runs the election |
| 5 | Voter registrar | Election | Manages the voter register and eligibility |
| 6 | Candidate | Election | Stands for a position |
| 7 | Voter | Election | Casts a ballot |
| 8 | Polling station officer | Station | Assists voters at an assigned station |
| 9 | Observer | Election | Read-only observation within approved scope |
| 10 | Independent auditor | Election | Read-only verification of audit and tally evidence |

Two additional **function-level responsibilities** are required by EMP-FOUND-001 and assigned as responsibilities, not as everyday roles:

- **Key custodian:** holds a share of cryptographic key control (model subject to DEC-006). Multiple custodians are required.
- **Tally approver:** takes part in the multi-party approval of the tally.

## 4. Role Descriptions

### 4.1 Platform administrator
- Creates and suspends organization workspaces; manages platform health and configuration.
- **Cannot** read ballots, tally material, or key material; **cannot** act as an election administrator, registrar, or custodian in any organization.
- Privileged actions are logged and subject to review.

### 4.2 Organization owner
- Assigns the election committee chair and administrators.
- Cannot alone open an election, modify the register after freeze, approve a tally, or certify results.

### 4.3 Election committee chair
- Represents the committee's authority.
- Approves election readiness, opening, closure, tally authorization, and certification, as required by the lifecycle.

### 4.4 Election administrator
- Creates and configures elections, positions, ballot rules, stations, and voting windows.
- Cannot manage voter register content (registrar function) and cannot approve a tally or certify results.

### 4.5 Voter registrar
- Imports and maintains the voter register; resolves duplicates; manages eligibility and voter support cases.
- Cannot configure ballots or see ballot content; cannot approve tallies.

### 4.6 Candidate
- Views their own profile and published information.
- Cannot hold election administration, registrar, officer, custodian, or tally-approver responsibilities in the same election.

### 4.7 Voter
- Authenticates, receives a ballot if eligible, submits it, checks submission status.

### 4.8 Polling station officer
- Operates only at the assigned station and window; starts sessions for verified voters.
- **Cannot** see, influence, or alter selections; cannot view the register beyond what station operation requires.

### 4.9 Observer
- Read-only access to approved views (aggregate participation, station status, public rules, published results, approved evidence).
- Cannot see ballot content or personal voter data beyond approved scope.

### 4.10 Independent auditor
- Read-only access to audit records, tally evidence, and certification records for verification.
- Cannot modify any election data.

## 5. Permission Matrix

Legend: **C** create, **R** read, **U** update, **A** approve, **X** execute, **–** none. "Own" means the user's own record only. "Agg" means aggregate-only, never identified selections.

| Capability | Platform admin | Org owner | Committee chair | Election admin | Registrar | Candidate | Voter | Station officer | Observer | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|
| Create organization | CRU | – | – | – | – | – | – | – | – | – |
| Assign org roles | – | CRU | A | – | – | – | – | – | – | – |
| Create/configure election | – | R | A | CRU | – | – | – | – | – | – |
| Manage candidates | – | R | A | CRU | – | R(own) | – | – | R | R |
| Import/manage voter register | – | – | R(Agg) | – | CRU | – | R(own) | – | – | R |
| Resolve duplicate/eligibility cases | – | – | – | – | CRU | – | – | – | – | R |
| Freeze register | – | – | A | – | X | – | – | – | – | – |
| Approve election readiness | – | – | A | X | – | – | – | – | – | R |
| Open / close election | – | – | A | X | – | – | – | – | – | R |
| Define polling stations | – | – | A | CRU | – | – | – | R(own) | R | R |
| Cast ballot (online) | – | – | – | – | – | – | X | – | – | – |
| Run assisted session | – | – | – | – | – | – | X | X | – | – |
| View participation (aggregate) | – | R(Agg) | R(Agg) | R(Agg) | R(Agg) | – | – | R(Agg, own station) | R(Agg) | R(Agg) |
| View ballot selections linked to a voter | – | – | – | – | – | – | – | – | – | – |
| Hold key custody | – | – | – | – | – | – | – | – | – | – (custodian responsibility) |
| Authorize tally | – | – | A | – | – | – | – | – | – | R |
| Execute tally | – | – | – | X (with approvers) | – | – | – | – | – | R |
| Verify tally evidence | – | – | R | R | – | – | – | – | R (approved) | X |
| Certify results | – | – | A | – | – | – | – | – | – | R |
| Publish results | – | – | A | X | – | R | R | – | R | R |
| Read audit records | R(platform) | R(org) | R | R(limited) | R(limited) | – | – | – | R(approved) | R |

**Notes**
1. No role can see a ballot selection linked to an identified voter. This is an architectural property, not only a permission rule.
2. Platform administrator read access is limited to platform operations data. It excludes election content, ballots, tally material, and keys.
3. "Execute tally" requires prior authorization and approvals from separate individuals (section 6).
4. The final matrix is verified in the security review and enforced by automated authorization tests.

## 6. Separation of Duties

The following rules apply per election and are enforced by the system:

| Rule | Description |
|---|---|
| SoD-1 | The same person cannot be both voter registrar and election administrator. |
| SoD-2 | A candidate cannot hold any administrative, registrar, officer, custodian, or tally-approver responsibility in the same election. |
| SoD-3 | The platform administrator cannot hold any election role in any organization they administer. |
| SoD-4 | Key custody requires multiple custodians; no single person can unseal tally material. |
| SoD-5 | Tally authorization, tally execution, and certification require separate individuals. |
| SoD-6 | The person who imports a register change cannot be the only approver of that change after freeze. |
| SoD-7 | A polling station officer cannot administer the register or approve tallies. |
| SoD-8 | An observer or auditor cannot hold any role that can modify election data. |
| SoD-9 | Role grants that would violate a rule above are rejected, and attempts are audited. |

## 7. Role Assignment Rules

1. Role assignments are time-bound for elections: they start and end with defined windows where practical.
2. Assignments are granted by an authorized higher role and recorded in the audit trail (FR-IAM-006).
3. Privileged roles require multi-factor authentication (FR-IAM-001).
4. Emergency access ("break-glass") is limited, requires multiple approvers, is time-boxed, and is reviewed after use.
5. Role changes after the register freeze or election opening require the exception procedure in `ELECTION_LIFECYCLE.md`.
6. Roles are reviewed before every election. Unused assignments are revoked.

## 8. Voter Authentication Context

Voter authentication methods are election-specific (DEC-004). Whatever method is chosen must:

- Bind the voter to one eligible record.
- Resist impersonation and credential sharing within reasonable limits.
- Work for voters with limited connectivity and devices.
- Allow assisted fallback.

## 9. Stakeholder Communication

| Audience | Needs | Channel (proposed) |
|---|---|---|
| Voters | Clear steps, deadlines, support contacts | Notification channel, help page |
| Candidates | Rules, timelines, published results | Candidate briefing, official notices |
| Station officers | Procedures, training | Training sessions, printed runbook |
| Committee | Readiness status, approvals, incident updates | Admin dashboard, meetings |
| Observers and auditors | Approved evidence access | Scoped read-only views |

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
| Version | 0.1 |
| Status | Draft for review |
| Owner | Product Owner |
| Review frequency | At major project milestones |
| Change control | Version-controlled updates |

**End of document.**
