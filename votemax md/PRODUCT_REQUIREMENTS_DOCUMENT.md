# Product Requirements Document

**Document ID:** EMP-PRD-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Product Requirements\
**Last Updated:** 11 November 2026\
**Parent Document:** EMP-FOUND-001 Project Overview\
**Owner:** Product Owner

---

## 1. Purpose

This document defines what the Election Management Platform (EMP) must do. It translates the objectives in EMP-FOUND-001 into numbered, testable requirements. It does not define *how* the system is built; that belongs in `SYSTEM_ARCHITECTURE.md` and `SECURITY_MASTER_POLICY.md`.

Every requirement has an ID, a priority, and a release target. Every major capability must have acceptance criteria before development begins.

## 2. Conventions

**Priority**

| Level | Meaning |
|---|---|
| **M** | Must have. Required for the first live election. |
| **S** | Should have. Expected for the first live election; may be deferred only with Product Owner approval. |
| **C** | Could have. Valuable but post-pilot. |
| **X** | Gated. Built only after separate approval (for example, offline voting). |

**Release targets** (see `PRODUCT_SCOPE_AND_MVP.md`): **MVP** (first live election), **R2**, **R3**, **Future**.

**Requirement ID format:** `FR-<MODULE>-<NNN>` for functional, `NFR-<AREA>-<NNN>` for non-functional.

Requirements use "shall" for mandatory behavior.

## 3. Product Context

- **Initial users:** an organization election committee, registrars, polling station officers, candidates, observers, auditors, and 5,000 to 10,000 member voters.
- **Initial channels:** online (primary) and connected assisted stations (secondary).
- **Offline voting:** disabled for the first live election.
- **Interfaces:** web application and PWA only. No native mobile applications in the first release.

## 4. Functional Requirements

### 4.1 Organization and tenant management (ORG)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-ORG-001 | The platform shall support multiple organizations as isolated tenants. | M | MVP |
| FR-ORG-002 | A platform administrator shall be able to create and configure an organization workspace. | M | MVP |
| FR-ORG-003 | Each organization shall have an owner and at least one election administrator role assignment. | M | MVP |
| FR-ORG-004 | No user, query, report, export, or background job shall expose one organization's protected data to another. | M | MVP |
| FR-ORG-005 | Organization-level settings (name, branding, contact, default policies) shall be configurable by authorized roles. | S | MVP |
| FR-ORG-006 | Platform administrators shall not have unrestricted access to election content, ballots, or tally material (see FR-SEC series). | M | MVP |

### 4.2 Identity, authentication, and access (IAM)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-IAM-001 | All privileged users shall authenticate with multi-factor authentication. | M | MVP |
| FR-IAM-002 | Permissions shall be enforced on the server for every request, not only hidden in the interface. | M | MVP |
| FR-IAM-003 | Role assignments shall be scoped to an organization and, where relevant, to a specific election or station. | M | MVP |
| FR-IAM-004 | Roles shall follow `STAKEHOLDERS_AND_USER_ROLES.md`, including separation of duties. | M | MVP |
| FR-IAM-005 | Sessions shall expire, be revocable, and be bound to defined security controls. | M | MVP |
| FR-IAM-006 | Administrative role grants and revocations shall be recorded in the audit trail. | M | MVP |
| FR-IAM-007 | The platform shall support integration with organizational identity systems. | C | Future |

### 4.3 Election management (ELE)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-ELE-001 | Authorized administrators shall create an election with name, description, voting window, time zone, and rules. | M | MVP |
| FR-ELE-002 | An election shall support one or more positions, each with a defined number of seats and a defined choices-per-voter rule. | M | MVP |
| FR-ELE-003 | The platform shall support at least single-choice and multi-choice (select up to N) ballot formats. | M | MVP |
| FR-ELE-004 | The platform shall support an explicit abstain option where the election rules enable it. | S | MVP |
| FR-ELE-005 | Elections shall follow the lifecycle states in `ELECTION_LIFECYCLE.md`; invalid transitions shall be rejected. | M | MVP |
| FR-ELE-006 | Election configuration shall become immutable once the election is approved for opening, except through a recorded, authorized exception procedure. | M | MVP |
| FR-ELE-007 | The election shall open and close at the configured times under controlled, auditable procedures. | M | MVP |
| FR-ELE-008 | Election rules (eligibility policy, positions, tie-break and result rules) shall be human-readable to voters and observers. | S | MVP |
| FR-ELE-009 | Additional ballot formats (ranked, referendum, weighted) shall be supportable by the data model without redesign. | C | R3 |

### 4.4 Candidate management (CAN)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-CAN-001 | Administrators shall add, edit, and withdraw candidates per position before the configuration freeze. | M | MVP |
| FR-CAN-002 | Candidate records shall support name, position, photo, and short statement. | M | MVP |
| FR-CAN-003 | Candidate eligibility checks shall follow organization-defined rules. | S | MVP |
| FR-CAN-004 | Candidate ballot order shall follow a defined policy (for example, randomized per voter or fixed alphabetical) configured per election. | S | MVP |
| FR-CAN-005 | A candidate shall not hold roles that would conflict with election administration (see role separation). | M | MVP |
| FR-CAN-006 | Candidates shall be able to view their own profile and, where permitted, published results. | C | R2 |

### 4.5 Voter register and eligibility (VOT)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-VOT-001 | Registrars shall import a voter register from a structured file (for example CSV) with validation and an error report. | M | MVP |
| FR-VOT-002 | The platform shall detect duplicate and conflicting voter records and require a recorded resolution. | M | MVP |
| FR-VOT-003 | Each voter shall have a status (for example pending, eligible, ineligible, suspended, voted) with recorded reasons for changes. | M | MVP |
| FR-VOT-004 | The platform shall create voting entitlements per voter per election and consume them atomically on ballot acceptance. | M | MVP |
| FR-VOT-005 | The voter register shall be frozen before voting opens; changes after freeze shall require an authorized exception procedure and an audit record. | M | MVP |
| FR-VOT-006 | Voter verification methods shall be configurable per election (final methods pending DEC-004). | M | MVP |
| FR-VOT-007 | Registrars shall be able to review eligibility disputes and voter support requests. | S | MVP |
| FR-VOT-008 | Personal data in the register shall be limited to what is necessary for eligibility and verification. | M | MVP |
| FR-VOT-009 | Voter register changes shall be reversible only through new, audited changes (no silent edits). | M | MVP |
| FR-VOT-010 | Advanced verification integrations shall be supportable. | C | Future |

### 4.6 Voting (VTG)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-VTG-001 | Eligible voters shall vote online through a supported browser or PWA. | M | MVP |
| FR-VTG-002 | The platform shall verify eligibility and entitlement before presenting a ballot. | M | MVP |
| FR-VTG-003 | The ballot shall be presented clearly, accessibly, and in the order defined by election policy. | M | MVP |
| FR-VTG-004 | The voter shall review and explicitly confirm selections before submission. | M | MVP |
| FR-VTG-005 | Ballot submission shall be transaction-safe: one entitlement, at most one accepted ballot, under concurrent requests. | M | MVP |
| FR-VTG-006 | Voters shall be able to safely retry after interruption and check submission status without revealing their selections to others. | M | MVP |
| FR-VTG-007 | After acceptance, the voter shall receive a confirmation that does not disclose how they voted. | M | MVP |
| FR-VTG-008 | The ballot flow shall work on low-bandwidth connections and common low-end mobile devices. | M | MVP |
| FR-VTG-009 | The platform shall not claim that a voter's device is malware-free or that remote voting is free from coercion. | M | MVP |
| FR-VTG-010 | A voter shall not be able to vote after the voting window closes, even with an in-progress session. | M | MVP |
| FR-VTG-011 | Voter-verifiable receipt or individual verification mechanisms shall be evaluated by specialist review before inclusion. | C | R3 |

### 4.7 Assisted voting (AST)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-AST-001 | Administrators shall define polling stations and station activation windows. | M | MVP |
| FR-AST-002 | Station officers shall authenticate and operate only within their assigned station. | M | MVP |
| FR-AST-003 | A station officer shall be able to confirm voter identity and start a voting session for an eligible voter without seeing selections. | M | MVP |
| FR-AST-004 | Assisted voting shall use the same central eligibility and entitlement checks as online voting. | M | MVP |
| FR-AST-005 | The voter shall mark and submit the ballot privately; the officer shall not see, influence, or alter selections. | M | MVP |
| FR-AST-006 | Station sessions shall time out and clear ballot state after submission or abandonment. | M | MVP |
| FR-AST-007 | Station status and activity counts (not selections) shall be visible to authorized oversight roles. | S | MVP |
| FR-AST-008 | Station procedures, including accessibility assistance, shall be documented and rehearsed. | M | MVP |

### 4.8 Controlled offline voting (OFF)

All requirements in this section are **gated** (`X`). Offline voting remains disabled for the first live election.

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-OFF-001 | Offline stations shall use authenticated polling devices. | X | Future |
| FR-OFF-002 | Devices shall load signed election configuration packages. | X | Future |
| FR-OFF-003 | Each station shall hold a defined voter allocation. | X | Future |
| FR-OFF-004 | Ballots shall be encrypted locally with tamper-evident event sequencing. | X | Future |
| FR-OFF-005 | Synchronization shall be secure, resumable, and idempotent. | X | Future |
| FR-OFF-006 | Duplicate-participation conflicts shall be detected and routed to a formal reconciliation process. | X | Future |
| FR-OFF-007 | Unresolved synchronization or eligibility conflicts shall block certification. | X | Future |
| FR-OFF-008 | Production enablement shall require completed independent security review and operational approval (DEC-008). | X | Future |

### 4.9 Oversight and monitoring (MON)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-MON-001 | Authorized roles shall see live participation counts (aggregate only). | M | MVP |
| FR-MON-002 | Participation views shall never reveal any ballot selection or an identified voter's choice. | M | MVP |
| FR-MON-003 | Station status shall show online state, activity, and alerts. | S | MVP |
| FR-MON-004 | Security and operational alerts shall be visible to authorized roles. | M | MVP |
| FR-MON-005 | Observers shall have a read-only view within their approved scope. | S | MVP |
| FR-MON-006 | Aggregate participation shall be protected against small-group inference (for example, suppressing breakdowns where a cell is too small). | S | R2 |

### 4.10 Tally, results, and verification (RES)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-RES-001 | Tallying shall occur only after the election is closed and under authorized, multi-party approval. | M | MVP |
| FR-RES-002 | The tally shall be computed only from accepted ballots and shall not link ballots to voters. | M | MVP |
| FR-RES-003 | The platform shall produce tally evidence that independent parties can verify. | M | MVP |
| FR-RES-004 | Result computation shall follow the election's published rules, including tie handling. | M | MVP |
| FR-RES-005 | Recount shall be supported with a recorded justification and authorization. | S | MVP |
| FR-RES-006 | Results shall be certified by authorized roles through separated approvals. | M | MVP |
| FR-RES-007 | Results shall be published only after certification, with a structured report. | M | MVP |
| FR-RES-008 | A certification record shall be retained as part of election evidence. | M | MVP |
| FR-RES-009 | Results shall be exportable in structured formats (PDF and machine-readable). | S | MVP |

### 4.11 Audit and evidence (AUD)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-AUD-001 | Important actions shall generate protected, tamper-evident audit records. | M | MVP |
| FR-AUD-002 | Audit records shall identify actor, action, time, scope, and outcome without containing ballot selections. | M | MVP |
| FR-AUD-003 | Audit records shall not be editable or deletable by ordinary administrators. | M | MVP |
| FR-AUD-004 | Independent auditors shall have read access to audit evidence within their approved scope. | M | MVP |
| FR-AUD-005 | Audit records shall be exportable for review. | S | MVP |

### 4.12 Notifications and voter support (SUP)

| ID | Requirement | Pri | Release |
|---|---|---|---|
| FR-SUP-001 | Voters shall receive election notices through configured channels (for example email or SMS, subject to provider decisions). | S | MVP |
| FR-SUP-002 | Notifications shall never contain ballot selections or credentials in plain form that enable impersonation. | M | MVP |
| FR-SUP-003 | A support workflow shall let registrars and station officers handle voter issues without access to ballot content. | S | MVP |
| FR-SUP-004 | Common voter instructions shall be available in plain language. | M | MVP |
| FR-SUP-005 | Multilingual interfaces shall be supportable. | C | Future |

## 5. Non-Functional Requirements

### 5.1 Security and privacy (NFR-SEC)

| ID | Requirement |
|---|---|
| NFR-SEC-001 | The platform shall meet the principles in EMP-FOUND-001 section 10 and the controls in `SECURITY_MASTER_POLICY.md`. |
| NFR-SEC-002 | Ordinary administrative access, application logs, analytics, and database queries shall not reveal how an identified individual voted. |
| NFR-SEC-003 | Data shall be encrypted in transit and at rest. |
| NFR-SEC-004 | Cryptographic design shall use reviewed, standard constructions; custom cryptographic protocols shall not be developed without specialist review. |
| NFR-SEC-005 | No critical or high-severity security findings shall remain unresolved at production approval. |
| NFR-SEC-006 | The platform shall not claim certification or independent approval it has not received. |

### 5.2 Performance and capacity (NFR-PERF)

| ID | Requirement |
|---|---|
| NFR-PERF-001 | The platform shall support an eligibility register of 10,000 voters. |
| NFR-PERF-002 | The platform shall support at least 200 concurrent active voters. |
| NFR-PERF-003 | The platform shall pass a 400-concurrent-session load test. |
| NFR-PERF-004 | Short bursts of concurrent ballot submissions shall be tested and shall not produce duplicate or lost accepted ballots. |
| NFR-PERF-005 | Targets for response time and error rate shall be defined in `SCALABILITY_ARCHITECTURE.md` and verified by test, not assumed. |

### 5.3 Availability and resilience (NFR-AVL)

| ID | Requirement |
|---|---|
| NFR-AVL-001 | The platform shall remain operational throughout approved voting windows. |
| NFR-AVL-002 | A tested backup, failover, and committed-ballot recovery procedure shall exist before live authorization. |
| NFR-AVL-003 | Incident response and election-day operational procedures shall be documented and rehearsed. |
| NFR-AVL-004 | A ballot reported as accepted to a voter shall never be lost after a defined failure scenario. |

### 5.4 Accessibility and usability (NFR-ACC)

| ID | Requirement |
|---|---|
| NFR-ACC-001 | The voter interface shall target WCAG 2.2 AA conformance. |
| NFR-ACC-002 | The voter interface shall work with keyboard navigation and common screen readers. |
| NFR-ACC-003 | The voting flow shall be usable at low bandwidth and on low-end devices. |
| NFR-ACC-004 | Assisted voting shall provide a path for voters who cannot vote independently online. |

### 5.5 Maintainability and quality (NFR-QUAL)

| ID | Requirement |
|---|---|
| NFR-QUAL-001 | Critical workflows (eligibility, ballot acceptance, tally, certification) shall have automated tests. |
| NFR-QUAL-002 | Database schema changes shall be delivered through version-controlled migrations. |
| NFR-QUAL-003 | Production features shall be database-backed; no mock data shall be presented as real election data and no placeholder shall be represented as complete. |
| NFR-QUAL-004 | Releases to production shall be controlled and reproducible. |

### 5.6 Compliance (NFR-LEG)

| ID | Requirement |
|---|---|
| NFR-LEG-001 | Applicable Liberian legal and data-protection requirements shall be identified and reviewed before the pilot (DEC-005). |
| NFR-LEG-002 | The election authority for each election shall be confirmed in writing before the election is created in production (DEC-010). |
| NFR-LEG-003 | Data retention and deletion rules shall be defined per election type. |

## 6. Acceptance Criteria Approach

Each major capability shall have explicit acceptance criteria written before implementation. Criteria shall be:

- **Observable:** a tester can demonstrate pass or fail.
- **Traceable:** linked to one or more requirement IDs.
- **Environment-specific:** security and performance criteria are verified in a production-like environment.

Example (FR-VTG-005):

> **Given** a voter with one unconsumed entitlement, **when** two ballot submissions arrive concurrently, **then** exactly one is accepted, the entitlement is consumed once, the other receives a clear rejection, and the tally input contains exactly one ballot.

A requirements traceability matrix mapping requirement IDs to tests shall be maintained alongside this document.

## 7. Assumptions

1. The pilot election authority will accept an electronic process alongside or in place of paper (to be confirmed, DEC-010).
2. Voters in the pilot can be reached by at least one verification channel (to be defined, DEC-004).
3. Reliable power and internet are available at assisted stations during the voting window.
4. Member voters generally have access to a smartphone or can use an assisted station.
5. Planning figures in EMP-FOUND-001 section 7.1 are targets, not measured capabilities.

## 8. Dependencies

- Legal review (DEC-005).
- Voter verification method definition (DEC-004).
- Cryptographic protocol and key custody decision (DEC-006).
- Hosting provider and region (DEC-002).
- Independent security assessor (DEC-007).
- Confirmed pilot organization and election authority (DEC-010).

## 9. Out of Scope

As stated in EMP-FOUND-001 section 13: national public elections, government-wide infrastructure, elections requiring certification EMP has not obtained, unreviewed offline voting in production, claims of coercion-free remote voting, blockchain as a security substitute, custom cryptography without specialist review, and native mobile applications in the first release.

## 10. Open Questions

| ID | Question | Related |
|---|---|---|
| Q-PRD-001 | Which notification channels (email, SMS) are feasible and affordable in Liberia? | FR-SUP-001 |
| Q-PRD-002 | Does the pilot require voter-visible verification of ballot inclusion? | FR-VTG-011 |
| Q-PRD-003 | What ballot-order policy does the pilot election committee require? | FR-CAN-004 |
| Q-PRD-004 | What minimum tally threshold or approval quorum applies to result certification? | FR-RES-001, FR-RES-006 |
| Q-PRD-005 | What retention period applies to voter register and audit data after the pilot? | NFR-LEG-003 |

## Document Control

| Field | Value |
|---|---|
| Document | Product Requirements Document |
| ID | EMP-PRD-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Product Owner |
| Review frequency | At major project milestones |
| Change control | Version-controlled updates |

**End of document.**
