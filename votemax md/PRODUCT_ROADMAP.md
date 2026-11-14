# Product Roadmap

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-ROAD-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Product Roadmap\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-SCOPE-001\
**Owner:** Product Owner

---

## 1. Purpose

This roadmap sequences the work needed to reach a safely authorized pilot election and beyond. It is organized by **phases with exit criteria**, not calendar dates. No dates are committed because the pilot organization, election date, team size, and hosting provider are not yet confirmed (DEC-002, DEC-010).

Once the pilot election date is known, phases are scheduled **backward** from it, with the dress rehearsal and independent security review fixed first.

## 2. Roadmap Principles

1. **Documentation before implementation; architecture before infrastructure.**
2. **Gates, not deadlines, decide readiness.** A phase ends when its exit criteria are met.
3. **Hard problems first.** Ballot secrecy, key management, and duplicate prevention are de-risked before polished features.
4. **Independent review is scheduled, not hoped for.** Reviewer engagement begins at design time.
5. **Operational readiness is a product feature.** Runbooks, training, and recovery drills are roadmap items.
6. **Security is not deferred.** No phase postpones security work to a later phase.

## 3. Phase Overview

| Phase | Name | Outcome |
|---|---|---|
| 0 | Foundation and decisions | Approved documentation set; critical decisions closed |
| 1 | Architecture and secure foundations | Reviewed design; platform skeleton with security basics |
| 2 | Core election workflows | Election setup, register, roles, audit working end to end |
| 3 | Voting and results | Online voting, assisted voting, tally, certification |
| 4 | Hardening and assurance | Load, resilience, security testing; independent review |
| 5 | Pilot readiness | Rehearsal, training, authorization |
| 6 | Pilot election and review | Live election, post-election review |
| 7 | Post-pilot expansion | Second release, additional organizations |
| 8 | Long-term direction | Approved offline, multi-country, integrations |

## 4. Phase Detail

### Phase 0: Foundation and decisions

**Goal:** Establish the project baseline.

| Work item | Output |
|---|---|
| Complete the eight foundation documents | Approved EMP document set |
| Confirm pilot organization and election authority | DEC-010 closed |
| Begin legal and data-protection review | DEC-005 in progress |
| Define voter verification method options | DEC-004 options paper |
| Shortlist specialist cryptographic reviewer and independent assessor | DEC-006 and DEC-007 engagement started |
| Assign governance roles | Named owners (EMP-FOUND-001 section 17) |
| Select hosting provider and region | DEC-002 closed |

**Exit criteria**
- Document set approved by Product Owner, Technical Lead, and Security Lead.
- DEC-002, DEC-004 (method chosen), and DEC-010 closed or have a dated decision plan.
- Reviewers identified.

### Phase 1: Architecture and secure foundations

**Goal:** Lock the design that everything else depends on.

| Work item | Output |
|---|---|
| Detailed ballot secrecy and tally protocol design | Protocol specification for specialist review |
| Key lifecycle and custody model | Reviewed model (DEC-006 path) |
| Threat model | Documented and reviewed |
| Data model and tenancy isolation design | Schema design |
| Final backend framework and ORM | DEC-003 closed |
| Environments, CI/CD, migrations, secrets handling | Working pipeline |
| Authentication, roles, audit foundation | Implemented and tested |
| Observability baseline | Logging, metrics, error tracking with privacy rules |

**Exit criteria**
- Specialist review of the secrecy and tally design completed with findings addressed or tracked.
- Authorization and tenant-isolation automated tests passing.
- Environments reproducible from version control.

### Phase 2: Core election workflows

**Goal:** Everything an administrator does before voting begins.

| Work item | Output |
|---|---|
| Organization and role management | Working admin workflows |
| Election, position, and candidate configuration | Working configuration with lifecycle states |
| Voter register import, validation, duplicates, statuses | Working registrar workflows |
| Entitlement creation | Entitlements generated per election |
| Register freeze and configuration freeze | Enforced immutability |
| Audit trail and audit viewing | Tamper-evident records |
| Separation-of-duties enforcement | Rules enforced and tested |

**Exit criteria**
- A mock election can be fully configured with a 10,000-record register.
- SoD rules rejected and audited in tests.
- No production placeholder functionality.

### Phase 3: Voting and results

**Goal:** Complete the election from opening to certification.

| Work item | Output |
|---|---|
| Voter authentication and eligibility checks | Working voter flow |
| Ballot presentation and secure submission | Accessible online voting |
| Atomic entitlement consumption and retry/status check | Duplicate-safe ballot acceptance |
| Assisted voting (connected stations) | Station officer and voter flows |
| Participation monitoring and station status | Aggregate dashboards |
| Close, tally authorization, tally, verification evidence | Reviewed tally process |
| Recount, certification, publication, reports | Complete result workflow |

**Exit criteria**
- End-to-end mock election completes from configuration to certified result.
- Concurrency tests show no duplicate or lost accepted ballots.
- Independent verification of a mock tally succeeds.

### Phase 4: Hardening and assurance

**Goal:** Prove the system is safe and reliable.

| Work item | Output |
|---|---|
| Load testing: 200 concurrent target, 400-session test, ballot bursts | Load test reports |
| Failure testing: database failover, restore, committed-ballot recovery | Drill records |
| Penetration testing and vulnerability remediation | Findings closed |
| Accessibility review against the voter flow | Accessibility report |
| Independent security and election-integrity assessment | Assessment report |
| Documentation of known limitations | Honest claims register |

**Exit criteria**
- No unresolved critical or high findings.
- Performance and resilience targets met by measurement.
- Independent assessment findings addressed or accepted by the right authority.

### Phase 5: Pilot readiness

**Goal:** Prepare people and procedures.

| Work item | Output |
|---|---|
| Election-day runbook and incident response plan | Rehearsed procedures |
| Station officer training | Trained officers, attendance record |
| Voter communication and help materials | Published guides |
| Observer and auditor onboarding | Accredited access |
| Full dress rehearsal on production-like infrastructure | Rehearsal report |
| Legal confirmation and election authority letter | G6 evidence |
| Final authorization | G8 sign-off |

**Exit criteria:** Gates G1 to G8 in `PRODUCT_SCOPE_AND_MVP.md` passed.

### Phase 6: Pilot election and review

| Work item | Output |
|---|---|
| Live election with heightened monitoring | Operated election |
| Immediate post-election verification | Verified results |
| Post-election review with committee, candidates, auditors | Lessons-learned report |
| Evidence retention and archival | Archived election record |
| Update of requirements and risks | Updated documentation |

**Exit criteria:** Post-election review complete; defects prioritized; documentation updated.

### Phase 7: Post-pilot expansion (R2)

Candidate items, prioritized after the pilot review:

- Candidate self-service portal.
- Small-group inference protection for monitoring.
- Improved reporting and administrator experience.
- Second and third organizations onboarded under controlled operations.
- Notification channel improvements.
- Pricing and subscription model (DEC-009).

### Phase 8: Long-term direction (R3 and Future)

| Direction | Gate |
|---|---|
| Additional ballot formats | Data model and tally verification extension |
| Voter-visible verification | Specialist cryptographic review |
| Localization and multilingual UI | Content plan |
| Approved offline voting infrastructure | DEC-008, independent security review, operational approval |
| Organizational identity integrations | Customer demand, security review |
| Independent observation tools | Observer feedback |
| Multi-country deployments | Legal review per country |
| Dedicated enterprise deployments | Commercial model |

Future expansion must not weaken the security and privacy guarantees of the initial platform.

## 5. Dependency Map

| Dependency | Needed by | Risk if late |
|---|---|---|
| DEC-004 voter verification | Phase 2 | Register and eligibility flow redesign |
| DEC-006 cryptographic protocol and custody | Phase 1 exit | Tally and secrecy cannot be built |
| DEC-007 independent assessor | Phase 4 start | Assurance gate unachievable |
| DEC-005 legal review | Phase 5 | Legal non-approval |
| DEC-002 hosting | Phase 1 | Delay in environments and capacity validation |
| DEC-010 pilot organization | Phase 0 | No concrete election to design to |

## 6. Roadmap Risks

| Risk | Response |
|---|---|
| Specialist review delays the protocol | Book reviewers early; build non-cryptographic features meanwhile |
| Findings from independent assessment need rework | Reserve capacity after assessment; do not schedule the pilot immediately after |
| Pilot date fixed before readiness | Gates decide; communicate that the election date moves before safety does |
| Small team underestimates operations work | Treat training and rehearsals as first-class items |
| Pressure to add features | Scope change control per `PRODUCT_SCOPE_AND_MVP.md` |

## 7. Scheduling Guidance

When the pilot election date (E) is known:

| Milestone | Suggested position |
|---|---|
| Independent assessment complete and findings closed | At least several weeks before E |
| Dress rehearsal | Shortly before E, after code freeze |
| Code freeze | Before the dress rehearsal |
| Station officer training | Before the dress rehearsal |
| Final authorization (G8) | After the dress rehearsal |

Exact durations will be set once team capacity and assessor availability are known.

## Document Control

| Field | Value |
|---|---|
| Document | Product Roadmap |
| ID | EMP-ROAD-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Product Owner |
| Review frequency | At each phase exit |
| Change control | Version-controlled updates |

**End of document.**
