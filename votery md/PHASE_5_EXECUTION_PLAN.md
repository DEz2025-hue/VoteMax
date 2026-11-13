# Phase 5 Execution Plan — Pilot Readiness

**Document ID:** EMP-PHASE5-001\
**Version:** 0.1\
**Status:** In progress — pilot readiness preparation only; live election BLOCKED (see §3)\
**Document Type:** Phase Execution Plan\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 5), EMP-SCOPE-001 §5 (Gates G1–G8), EMP-LIFE-001\
**Owner:** Election Operations Lead (role to be named in `GOVERNANCE_ROLES_ASSIGNMENT.md`)

---

## 1. Purpose and Boundary

Phase 5 prepares people and procedures for the pilot (EMP-ROAD-001 Phase 5). This plan produces those readiness artifacts using the **existing mock-election implementation** and synthetic data only. **No real voter data may be loaded** (F-01…F-04, Phase 4 report). Producing these documents does not authorize a live election; authorization requires Gates G1–G8 in `AUTHORIZATION_PACK_G6_G8.md`, all signed on evidence.

## 2. Roadmap Work Items → Artifacts

| Work item (EMP-ROAD-001 Phase 5) | Artifact | State |
|---|---|---|
| Election-day runbook + incident response plan | `ELECTION_DAY_RUNBOOK.md` | Draft ready for rehearsal |
| Station officer training | `TRAINING_AND_ONBOARDING.md` Part A (curriculum, attendance record, conduct commitment) | Draft ready to deliver |
| Voter communication + help materials | `VOTER_COMMUNICATIONS_PACK.md` (notices, plain-language guide, support scripts) | Draft ready for committee approval |
| Observer + auditor onboarding | `TRAINING_AND_ONBOARDING.md` Part B (accreditation, scoped access, evidence handling) | Draft ready |
| Full dress rehearsal on production-like infrastructure | `DRESS_REHEARSAL_PLAN.md` (script, timed agenda, pass/fail criteria, report template) + local mock pre-rehearsal record | Plan ready; production-like rehearsal **not yet run** |
| Legal confirmation + election authority letter (G6) | `DEC-010_PILOT_CONFIRMATION_PACK.md` (checklist + letter) + `DEC-005_LEGAL_REVIEW_BRIEF.md` | Packs ready; external replies pending |
| Final authorization (G8) | `AUTHORIZATION_PACK_G6_G8.md` (gate evidence index + sign-off record) | Template ready; no gate signed |
| Readiness gate to READY (EMP-LIFE-001 §6) | `READINESS_CHECKLIST.md` (14 checks with owner, evidence, status) | Checklist ready; most items open |

Supporting inputs preserved unchanged: Phase 0–4 documents, the claims register (`CLAIMS_REGISTER.md`), and the mock implementation (Phases 1–3 code, 45 tests).

## 3. Explicit Blockers to Any Live Election

These blockers remain in force regardless of Phase 5 document completion:

| Blocker | Source | What unblocks it |
|---|---|---|
| **DEC-006 open** — no specialist-reviewed ballot protocol; mock uses single service-held key | Phase 3 plan §3; finding F-02 (Critical) | Reviewer engagement from `DEC-006_007_REVIEWER_SHORTLIST.md`; threshold custody implementation |
| **DEC-007 open** — no independent security assessment | SEC-ASR-01; finding set §4 | Assessor engagement; assessment report with no critical/high open (G2) |
| **F-01 Critical** — accepted ballots lost on API restart (in-memory store, drill-proven) | Phase 4 report | Postgres repository + failover/restore drills passing — **code landed and verified on a live database 11 Nov 2026** (`PostgresStore`, migrations 0002–0003, append-only triggers, atomic `acceptBallot` with entitlement row lock). Verified against a Neon dev database: all 3 `postgres.store.spec.ts` integration tests pass (full lifecycle, atomic acceptance, append-only triggers) and `scripts/failure-drill.mjs` reports **PASS** (committed ballot survived API kill + restart). **Still required before F-01 fully closes:** production-like staging re-run, timed restore drill, and a fix-or-accept decision on the audit-chain throughput ceiling noted below |
| **F-02 Critical** — single-key custody (same as DEC-006 technical half) | Phase 4 report | As DEC-006 |
| **F-03 High** — dev-header actor identity; session auth not enforced per endpoint | Phase 4 report | Session + capability enforcement on every endpoint (FR-IAM-002) — **code landed 11 Nov 2026** (`SessionGuard`/`CapabilityGuard`, `@RequireCapability`, `x-actor-id` removed); unit-tested, staging verification outstanding |
| **F-04 High** — OTP dev-code delivery; no real email/SMS provider | Phase 4 report | Provider integration per DEC-004; dev path removed — **provider abstraction landed 11 Nov 2026** (SMTP via nodemailer, Africa's Talking, generic webhook; dev outbox only outside production, fails closed in production); **still open until real provider credentials are configured and a delivery is verified** |

**Performance note (11 Nov 2026, Neon dev DB, ~126 ms RTT):** the original per-mutation audit append serialized every write on ~3 round-trips (~1 voter/s measured). **Resolved same day** via a transactional audit outbox (`audit.audit_outbox` + batched chain drainer, migration 0004/0005): mutations write audit intent inside their own transaction; a single drainer chains ≤200 entries per batch under one advisory lock. Re-measured: 600 ballots / 200 concurrency in **94.8 s** (was 556 s), 0 errors, integrity PASS, submit p95 ≈ 18 s (~6.3 voters/s). Remaining headroom: DB region co-location and query batching; must be re-measured on staging before G7/G8.

Consequence for Phase 5 sequencing (EMP-ROAD-001 §6: “Gates decide; the election date moves before safety does”): training and communications may be *prepared*, but the dress rehearsal as gate evidence (G7) and final authorization (G8) **cannot pass** while any blocker above stands. A rehearsal run on the mock stack is recorded as a *pre-rehearsal*, never as G7 evidence.

## 4. Phase 5 Exit Criteria — Status

| Criterion (EMP-ROAD-001 Phase 5) | Status |
|---|---|
| Gates G1–G8 passed | **Not met:** no gate signed; G2/G4 blocked by DEC-006/007, F-01–F-04 (see `AUTHORIZATION_PACK_G6_G8.md` §2) |
| Runbook rehearsed; officers trained; voters informed | Artifacts ready; delivery requires named people (governance sheet still unfilled) |
| Legal + authority evidence (G6) | Packs sent-ready; written replies pending (DEC-010, DEC-005) |

## 5. Sequencing From Here

1. Name governance + election roles (`GOVERNANCE_ROLES_ASSIGNMENT.md`) — unblocks signatures, training delivery, rehearsal staffing.
2. Close F-01/F-03/F-04 in code; engage DEC-006/007 reviewers (external).
3. Stand up production-like staging in the DEC-002 region; run k6 gate scenarios (`load/k6-voting.js`) and failover drills.
4. Run the full dress rehearsal from `DRESS_REHEARSAL_PLAN.md` on staging with trained officers; file the report as G7 evidence.
5. Committee reviews G1–G7 evidence and signs (or refuses) G8 in `AUTHORIZATION_PACK_G6_G8.md`.

## Document Control

| Field | Value |
|---|---|
| Document | Phase 5 Execution Plan |
| ID | EMP-PHASE5-001 |
| Version | 0.1 |
| Status | In progress; live election blocked |
| Owner | Election Operations Lead |
| Change control | Version-controlled updates |

**End of document.**
