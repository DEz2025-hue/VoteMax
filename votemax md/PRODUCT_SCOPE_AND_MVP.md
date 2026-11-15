# Product Scope and MVP

> **Model update (v0.2):** the role model is now four roles - `platform_admin`, `organization_owner`, `auditor`, `voter` - per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-SCOPE-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Product Scope\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001\
**Owner:** Product Owner

---

## 1. Purpose

This document defines the boundary of the first release: what the Minimum Viable Product (MVP) includes, what it excludes, and what must be true before a live election is authorized.

In EMP, "minimum" does not mean "demo." The MVP is the smallest product that can **safely run a real organizational election**. A software demonstration alone is not approval for a live election (EMP-FOUND-001 section 7.3).

## 2. MVP Definition

The MVP is a web-first platform that allows one organization (the pilot organization) to:

1. Be set up as an isolated tenant.
2. Configure an election with positions and candidates.
3. Import and verify a voter register of up to 10,000 voters.
4. Run **online voting** and **connected assisted voting** during a defined window.
5. Prevent duplicate accepted ballots and preserve ballot secrecy.
6. Monitor participation without exposing selections.
7. Tally under separated, multi-party approval and produce independently verifiable evidence.
8. Certify and publish results with a structured report.
9. Retain a protected audit trail.
10. Operate with tested backup, recovery, and election-day procedures.

## 3. Scope Summary

| Capability | MVP | Notes |
|---|---|---|
| Multi-tenant organization workspaces | In | Tenant isolation is mandatory even with one pilot tenant |
| Role-based access with separation of duties | In | Server-enforced |
| Multi-factor authentication for privileged roles | In | |
| Election creation and configuration | In | Single-choice and multi-choice formats |
| Candidate management | In | |
| Voter register import and validation | In | CSV-style import with error reporting |
| Duplicate detection and eligibility management | In | |
| Voter verification | In | Method pending DEC-004 |
| Online voting (web and PWA) | In | Primary channel |
| Connected assisted voting | In | Secondary channel |
| Participation monitoring (aggregate) | In | |
| Polling station status | In | |
| Audit trail | In | Protected and tamper-evident |
| Tally with independent verification evidence | In | Protocol subject to DEC-006 |
| Recount support | In | |
| Result certification and publication | In | |
| Structured election reports | In | PDF and machine-readable |
| Observer and independent auditor read views | In | Scoped, read-only |
| Notifications to voters | In (limited) | Channel subject to Q-PRD-001 |
| Controlled offline voting | **Out** | Disabled; requires DEC-008 |
| Native Android and iOS apps | **Out** | PWA only |
| Ranked, weighted, and other ballot formats | **Out** | Data model must not block them later |
| Multiple simultaneous pilot organizations | **Out** | Architecture supports it; operations not validated |
| Identity-system integrations | **Out** | |
| Multilingual interface | **Out** | Design for localization from the start |
| Advanced analytics | **Out** | Privacy-reviewed reporting only |
| Subscription billing and pricing engine | **Out** | DEC-009 open |
| Public or national elections | **Out** | Not authorized |

## 4. Guiding Rules for Scope Decisions

1. **Security and integrity features are never cut to save time.** Eligibility, uniqueness, secrecy, audit, and recovery are part of the MVP definition.
2. **Convenience features may be cut.** Branding, rich reporting, and notification variety can be reduced before safety work.
3. **No placeholder functionality is represented as complete.** A feature is either fully working and database-backed or excluded from the release.
4. **Gated features stay off.** Offline voting cannot be enabled by configuration alone.
5. **Scope changes need approval.** Any addition, removal, or re-prioritization is recorded and approved by the Product Owner, with Technical Lead and Security Lead consultation.

## 5. MVP Release Gates

A live election is authorized only after **all** gates pass. Each gate has a named approver (assigned before the pilot, see EMP-FOUND-001 section 17).

| Gate | Criteria | Evidence | Approver |
|---|---|---|---|
| **G1 Product** | All MVP-priority requirements implemented; acceptance criteria pass | Requirements traceability matrix, test reports | Product Owner |
| **G2 Security** | No unresolved critical or high findings; ballot secrecy and eligibility controls pass independent review | Independent assessment report, remediation log | Security Lead + Independent reviewer |
| **G3 Performance** | 10,000-voter register supported; 200 concurrent users met; 400-session load test passed; burst ballot tests pass | k6 reports, capacity measurements | Technical Lead |
| **G4 Integrity** | Concurrency tests show no duplicate accepted ballots and no lost accepted ballots under defined failures | Test reports, recovery drill records | Technical Lead + Security Lead |
| **G5 Operations** | Election-day runbook, incident response, and recovery plans tested; station personnel trained | Rehearsal records, training attendance | Election Operations Lead |
| **G6 Legal and institutional** | Applicable legal requirements reviewed; election authority confirmed in writing | Legal review memo, authority letter | Organization election committee |
| **G7 Dress rehearsal** | Full mock election run on production-like infrastructure with real procedures | Rehearsal report, issue log | Product Owner + Election Operations Lead |
| **G8 Final authorization** | G1 to G7 passed; sign-off recorded | Signed authorization record | Organization election committee |

If any gate fails, the live election does not proceed until the failure is resolved and the gate is re-verified.

## 6. Pilot Operating Constraints

| Constraint | Value |
|---|---|
| Voter population | 5,000 to 10,000 |
| Capacity planning population | 10,000 |
| Voting window | A few hours |
| Primary channel | Online |
| Secondary channel | Connected assisted stations |
| Offline | Disabled |
| Concurrency targets | 200 active, 400 load-tested |
| Interface | Web and PWA |

These are planning values and engineering targets, not measured capabilities.

## 7. Deferred Items (Post-MVP)

| Item | Target | Dependency |
|---|---|---|
| Voter-visible ballot verification | R3 | Specialist review (Q-PRD-002) |
| Small-group inference protection in monitoring | R2 | Privacy review |
| Candidate self-service portal | R2 | MVP stability |
| Additional ballot formats | R3 | Data model validation |
| Controlled offline voting | Future, gated | DEC-008, independent review |
| Localization | R3 | Content and translation plan |
| Organizational identity integrations | Future | Customer demand |
| Native mobile apps | Future | Product decision |
| Enterprise dedicated deployments | Future | Commercial model |

## 8. Risks to MVP Scope

| Risk | Impact | Mitigation |
|---|---|---|
| Voter verification method not defined | Blocks eligibility flow design | Resolve DEC-004 early; design verification as a configurable step |
| Cryptographic design needs specialist review | Delays tally and secrecy architecture | Engage specialist reviewer at architecture stage, not after build |
| Legal review finds additional requirements | Scope increase | Start DEC-005 in the first phase |
| Pressure to enable offline for pilot | Safety risk | Offline remains disabled absent DEC-008 approval |
| Pilot organization delays confirmation | Schedule risk | Build to configurable assumptions; confirm DEC-010 early |
| Scope creep from stakeholders | Quality risk | Change control through the Product Owner |

## 9. Change Control

Scope changes follow this path:

1. Request recorded with rationale and affected requirement IDs.
2. Impact assessment (security, schedule, testing).
3. Decision by Product Owner, with Security Lead approval required for any change touching secrecy, eligibility, integrity, or availability.
4. Update to this document and the PRD with a new version number.

## Document Control

| Field | Value |
|---|---|
| Document | Product Scope and MVP |
| ID | EMP-SCOPE-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Product Owner |
| Review frequency | At major project milestones |
| Change control | Version-controlled updates |

**End of document.**
