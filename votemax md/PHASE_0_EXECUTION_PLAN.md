# Phase 0 Execution Plan — Foundation and Decisions

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-PHASE0-001\
**Version:** 0.1\
**Status:** In progress\
**Document Type:** Phase Execution Plan\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 0), EMP-FOUND-001\
**Owner:** Product Owner

---

## 1. Purpose

This plan turns Phase 0 of `PRODUCT_ROADMAP.md` into trackable work. Phase 0 ends only when its exit criteria are met — gates, not deadlines, decide readiness (EMP-ROAD-001 section 2).

## 2. Inputs Confirmed (11 November 2026)

| Decision | Confirmed direction | Consequence |
|---|---|---|
| Pilot (DEC-010) | Organization **in discussion, not confirmed** | Build to configurable assumptions; produce confirmation pack (DEC-010 pack); dated decision plan below |
| Hosting (DEC-002) | **AWS**, compare `af-south-1` vs `eu-west` | See `DEC-002_HOSTING_DECISION.md`; recommendation subject to Liberia latency measurement (SCALE-R1) |
| Voter verification (DEC-004) | **Member ID + one-time code** | See `DEC-004_VOTER_VERIFICATION_OPTIONS.md`; email-first OTP, SMS + assisted fallback |

## 3. Foundation Document Audit

All documents were read in full on 11 November 2026.

| Document | ID / Version | State | Approval readiness |
|---|---|---|---|
| Project Overview | EMP-FOUND-001 v1.0 | Initial baseline | Baseline; DEC-001…DEC-010 all open as recorded |
| Product Requirements Document | EMP-PRD-001 v0.1 | Draft for review | Ready for review; 5 open questions (Q-PRD-001…005) |
| Product Scope and MVP | EMP-SCOPE-001 v0.1 | Draft for review | Ready; gates G1–G8 approvers unnamed |
| Stakeholders and User Roles | EMP-STAKE-001 v0.1 | Draft for review | Ready; named individuals missing (Q-STK-001) |
| Product Roadmap | EMP-ROAD-001 v0.1 | Draft for review | Ready; fix “eight documents” (9 files exist) |
| System Architecture | EMP-ARCH-001 v0.1 | Draft for review | Ready; DEC-002/003/004/006 block exit |
| Security Master Policy | EMP-SEC-001 v0.1 | Draft for review | Ready; 7 open items SEC-OI-1…7 |
| Election Lifecycle | EMP-LIFE-001 v0.1 | Draft for review | Ready; 5 open questions (Q-LIFE-001…005) |
| Scalability Architecture | EMP-SCALE-001 v0.1 | Draft for review | Ready; 4 open questions (SCALE-Q1…Q4) |

**Audit findings (no contradictions found in scope, roles, or gates):**

1. Version control: only EMP-FOUND-001 is above draft. Phase 0 exit needs the set signed by Product Owner, Technical Lead, Security Lead (`GOVERNANCE_ROLES_ASSIGNMENT.md` sign-off sheet). Those people are not yet named — this blocks formal approval.
2. Count discrepancy: EMP-ROAD-001 says “eight foundation documents”; nine files exist. Correct at next version bump.
3. Unconfirmed planning values that must not harden into claims: 4-hour window (EMP-SCALE-001 §3.1), 10–20% assisted share, 15% opening surge. All pending pilot committee confirmation.
4. Cross-cutting opens to consolidate at Phase 0 exit: ballot-order policy (Q-PRD-003), certification quorum (Q-PRD-004), retention period (Q-PRD-005), recount triggers (Q-LIFE-001), window-extension rules (Q-LIFE-004), custodian threshold (Q-STK-002, needs DEC-006).

## 4. Work Tracker

| # | Work item (EMP-ROAD-001 Phase 0) | Artifact | Owner | State |
|---|---|---|---|---|
| 1 | Complete foundation documents | This audit + sign-off sheet | Product Owner | Ready for signature |
| 2 | Confirm pilot organization + authority (DEC-010) | `DEC-010_PILOT_CONFIRMATION_PACK.md` | Product Owner | Pack ready; external confirmation pending |
| 3 | Legal / data-protection review (DEC-005) | `DEC-005_LEGAL_REVIEW_BRIEF.md` | Security Lead + counsel | Brief ready; counsel not yet engaged |
| 4 | Voter verification options (DEC-004) | `DEC-004_VOTER_VERIFICATION_OPTIONS.md` | Product Owner + Security Lead | **Recommendation made; needs committee approval** |
| 5 | Crypto reviewer (DEC-006) + assessor (DEC-007) | `DEC-006_007_REVIEWER_SHORTLIST.md` | Security Lead | Criteria ready; outreach pending |
| 6 | Assign governance roles | `GOVERNANCE_ROLES_ASSIGNMENT.md` | Product Owner | Template ready; names pending |
| 7 | Hosting provider + region (DEC-002) | `DEC-002_HOSTING_DECISION.md` | Technical Lead | **Recommendation made; needs latency measurement** |

## 5. Dated Decision Plan (relative schedule)

No pilot election date (E) is confirmed, so Phase 0 uses relative weeks from Phase 0 start (W0 = week of 11 November 2026). When E is known, re-plan backward per EMP-ROAD-001 section 7.

| By | Milestone | DEC |
|---|---|---|
| W0 + 1 | Foundation doc set signed (or exceptions recorded) | — |
| W0 + 2 | Governance roles named; sign-off authority live | Q-STK-001 |
| W0 + 2 | Hosting recommendation ratified; latency test from Liberian networks scheduled | DEC-002 |
| W0 + 3 | Voter verification method approved by pilot committee (or interim approval by Product + Security Lead pending committee) | DEC-004 |
| W0 + 4 | Counsel engaged; DEC-005 review underway | DEC-005 |
| W0 + 4 | Reviewer/assessor shortlist contacted (RFP sent) | DEC-006, DEC-007 |
| W0 + 6 | Pilot organization confirmed in writing, or escalation: second candidate organization approached | DEC-010 |

DEC-010 has no hard close date possible while “in discussion”; the W0 + 6 escalation is the dated decision plan required by the Phase 0 exit criteria.

## 6. Phase 0 Exit Criteria — Status

| Criterion (EMP-ROAD-001 Phase 0) | Status |
|---|---|
| Document set approved by Product, Technical, Security leads | **Blocked:** leads unnamed; sign-off sheet ready |
| DEC-002 closed or dated plan | Dated plan ✓; close pending ratification + latency measurement |
| DEC-004 method chosen or dated plan | Method recommended (Member ID + OTP); close pending committee approval |
| DEC-010 closed or dated plan | Dated plan ✓ (above); written confirmation pending |
| Reviewers identified | **Blocked:** shortlist criteria ready, no firms named yet (see DEC-006/007 pack — names require outreach, not assumption) |

**Honest status:** Phase 0 cannot exit until named people sign, the pilot confirms in writing, and at least one reviewer/assessor is identified. The packs in this folder make each of those a single meeting or email away; they do not substitute for them.

## Document Control

| Field | Value |
|---|---|
| Document | Phase 0 Execution Plan |
| ID | EMP-PHASE0-001 |
| Version | 0.1 |
| Status | In progress |
| Owner | Product Owner |
| Change control | Version-controlled updates |

**End of document.**
