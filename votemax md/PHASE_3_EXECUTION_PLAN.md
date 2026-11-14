# Phase 3 Execution Plan — Voting and Results

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-PHASE3-001\
**Version:** 0.1\
**Status:** Implemented for mock election — NOT production-approved (see §3)\
**Document Type:** Phase Execution Plan\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 3), EMP-PROTO-001, EMP-LIFE-001\
**Owner:** Technical Lead

---

## 1. Roadmap Work Items → Implementation

| Work item | Implementation | State |
|---|---|---|
| Voter authentication + eligibility | DEC-004 flow: `POST /voting/otp/request` → `verify` (6-digit, 10-min, single-use, attempt-limited); eligibility + entitlement checked server-side | Implemented |
| Ballot presentation + secure submission | `POST /voting/ballot`, `POST /voting/submit`; web flow at `apps/web/app/vote` with review-and-confirm step (FR-VTG-004) | Implemented |
| Atomic entitlement consumption + retry/status | Synchronous consume-store-receipt critical section; idempotency keys return the original receipt; `GET /voting/status` | Implemented + concurrency-tested |
| Assisted voting | Stations (`POST /stations`), officer-bound sessions (`POST /stations/:id/session`); officer never receives ballot content | Implemented |
| Participation monitoring | `GET /participation` — aggregates only (FR-MON-001/002) | Implemented |
| Close, tally authorization, tally, verification | `POST /close` (reconciliation), `/tally` (chair authorizes, executor separate, 2 approvers — SoD-4/5), `/tally/verify` (independent recomputation) | Implemented |
| Recount, certification, publication, reports | `/tally/recount`, `/certify` (blockers §9.1 + SoD), `/publish`, `GET /report` (structured, FR-RES-009) | Implemented |

Ballot secrecy in the implementation: ballot records carry no voter/session/entitlement identifier; selections are AES-256-GCM encrypted under a per-election key; timestamps are minute-bucketed; audit records contain no candidate IDs or selections (asserted in tests).

## 2. Exit Criteria

| Criterion | Evidence |
|---|---|
| End-to-end mock election: configuration → certified result | `phase3.spec.ts`: full run to PUBLISHED with published report; HTTP smoke replays setup through voting |
| No duplicate/lost ballots under concurrency | Burst test: 5 simultaneous submissions, one entitlement → exactly 1 ballot; idempotent-retry test |
| Independent verification of mock tally | `verifyTally` recomputes from ciphertexts on a separate path and compares tally hash; recount reproduces hash |

## 3. Production Hold Points (unchanged, honestly stated)

1. **DEC-006 is still open.** This implements EMP-PROTO-001 **Option C** with a **single service-held key** and procedural multi-party approvals. That is *not* threshold custody and *not* the reviewed protocol. **No live election may run on this.** Production requires the specialist-reviewed protocol, real custodian threshold decryption, and gates G1–G8.
2. ~~Persistence is still the in-memory service store~~ **Addressed 11 Nov 2026:** `PostgresStore` implements acceptance as a single transaction with entitlement `FOR UPDATE` row lock, idempotency-key replay, and in-transaction audit append (EMP-ARCH §8). Verification against a live database is pending (no DB available at implementation time).
3. ~~OTP delivery returns a dev code~~ **Addressed 11 Nov 2026:** `OtpDelivery` routes through env-configured providers (SMTP, Africa's Talking, generic webhook); the dev outbox and `devCode` exist only outside production, which fails closed without a provider (F-04 — awaiting credentials).
4. ~~Per-endpoint capability enforcement and session-token auth~~ **Addressed 11 Nov 2026:** `SessionGuard` + `CapabilityGuard` on every non-public route (F-03/F-05).

## Document Control

| Field | Value |
|---|---|
| Document | Phase 3 Execution Plan |
| ID | EMP-PHASE3-001 |
| Version | 0.1 |
| Status | Mock implementation complete; production gated |
| Owner | Technical Lead |
| Change control | Version-controlled updates |

**End of document.**
