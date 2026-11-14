# Readiness Checklist — Gate to READY (EMP-LIFE-001 §6)

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-READY-001\
**Version:** 0.1\
**Status:** Open — no item signed; live election blocked (Phase 5 plan §3)\
**Document Type:** Readiness Checklist and Evidence Index\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-LIFE-001 §6, EMP-SCOPE-001 §5 (G1–G8), EMP-PHASE5-001\
**Owner:** Election Operations Lead

> Instructions: the responsible owner checks each item only on evidence, records the evidence reference, and signs. This checklist is completed per election, on production-like infrastructure. Mock-stack passes are preparation, not evidence.

## 1. The 14 Readiness Checks (EMP-LIFE-001 §6)

| # | Check | Owner | Evidence required | Status |
|---|---|---|---|---|
| 1 | Election rules published and approved by the committee | Committee chair | Published rules + committee minute | ☐ Open — committee unconfirmed (DEC-010) |
| 2 | Positions, candidates, ballot-order policy final | Election administrator | Frozen configuration hash (API: election detail at freeze) | ☐ Workflow implemented; pilot config not loaded |
| 3 | Voter register frozen; counts reconciled; hash recorded | Registrar | Register hash + counts from `register.freeze` audit record | ☐ Workflow implemented/tested (10k mock); real register prohibited until F-01 closes |
| 4 | Entitlements match eligible voters | Registrar + Technical Lead | Reconciliation counts (freeze enforces equality; freeze rejects mismatch) | ☐ Enforced in code + tests; pilot run pending |
| 5 | Roles assigned; SoD rules satisfied; MFA verified | Security Lead | Role list + SoD audit trail + MFA enrollment record | ☐ SoD/MFA implemented; named people pending (`GOVERNANCE_ROLES_ASSIGNMENT.md`) |
| 6 | Key custody ceremony completed; custodians confirmed | Security Lead | Ceremony record per `KEY_LIFECYCLE_AND_CUSTODY.md` | ☐ **Blocked — DEC-006** (mock uses single service-held key, F-02) |
| 7 | Stations assigned; officers trained; devices checked | Election Operations Lead | Training attendance (`TRAINING_AND_ONBOARDING.md`) + station list | ☐ Training pack ready; officers unnamed |
| 8 | Load + failover rehearsal passed on production-like environment | Technical Lead | k6 gate reports + failover drill record (`EMP-SCALE-001` §7) | ☐ **Blocked — staging rehearsal outstanding**; Postgres store verified on Neon dev DB 11 Nov 2026 (failure drill PASS, 600-ballot load integrity PASS at ~6.3 voters/s after audit-outbox fix); staging k6 rehearsal + region/latency review still outstanding; local numbers are not evidence |
| 9 | Monitoring and alerts active; on-call roster confirmed | Technical Lead | Dashboard + alert test + roster in runbook | ☐ Runbook defines roster slots; names pending |
| 10 | Incident response contacts + decision authority confirmed | Election Operations Lead | `ELECTION_DAY_RUNBOOK.md` §2 signed contact table | ☐ Template ready; names pending |
| 11 | Voter communications sent | Election administrator | Sent notices per `VOTER_COMMUNICATIONS_PACK.md` (§2 schedule) | ☐ Pack ready; channels blocked by F-04 (no provider) |
| 12 | Backups verified; recovery procedure available | Technical Lead | Timed restore drill record | ◐ **Procedure rehearsed 11 Nov 2026:** `scripts/restore-drill.mjs` PASS on Neon dev DB — 3,636-row logical snapshot → wipe → restore in 11.4 s, all counts matched, audit chain valid before and after. **Still required:** production backup mechanism (Neon PITR/snapshot) configured and re-drilled on staging |
| 13 | Release freeze in effect; production version recorded | Technical Lead | Version/hash recorded here at freeze: ______ | ☐ Process defined in runbook §7 |
| 14 | Final authorization (G8) recorded for the pilot | Committee | Signed `AUTHORIZATION_PACK_G6_G8.md` | ☐ **Blocked** — G8 cannot sign while blockers stand |

## 2. How This Checklist Maps to Gates G1–G8

| Gate (EMP-SCOPE-001 §5) | Fed by checklist items | Current position |
|---|---|---|
| G1 Product | 1–4, 11 | Workflows implemented + tested on mock; pilot instances not run |
| G2 Security | 5, 6 | **Blocked: DEC-006, DEC-007, F-02, F-03** |
| G3 Performance | 8 | Local harness only; staging k6 outstanding |
| G4 Integrity | 3, 4, 8, 12 | Concurrency/idempotency tested; durability failed drill (F-01) |
| G5 Operations | 7, 9, 10 | Artifacts ready; people unnamed/untrained |
| G6 Legal/institutional | 1, 14 | DEC-010 letter + DEC-005 memo pending |
| G7 Dress rehearsal | All | Pre-rehearsal on mock only (`DRESS_REHEARSAL_PLAN.md` §5) |
| G8 Final authorization | 14 | Cannot sign |

## 3. Sign-Off (per election)

| Role | Name | Signature | Date |
|---|---|---|---|
| Committee chair (checks 1, 14) | | | |
| Election administrator (2, 11) | | | |
| Registrar (3, 4) | | | |
| Security Lead (5, 6) | | | |
| Technical Lead (4, 8, 9, 12, 13) | | | |
| Election Operations Lead (7, 10) | | | |

Any ☐ left open, or any blocker in the Phase 5 plan §3 still standing, means the election does not move to READY.

## Document Control

| Field | Value |
|---|---|
| Document | Readiness Checklist |
| ID | EMP-READY-001 |
| Version | 0.1 |
| Status | Open |
| Owner | Election Operations Lead |
| Change control | New version per election attempt |

**End of document.**
