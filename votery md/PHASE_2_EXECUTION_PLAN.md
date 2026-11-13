# Phase 2 Execution Plan — Core Election Workflows

**Document ID:** EMP-PHASE2-001\
**Version:** 0.1\
**Status:** In progress\
**Document Type:** Phase Execution Plan\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 2), EMP-LIFE-001, EMP-PRD-001\
**Owner:** Technical Lead

---

## 1. Roadmap Work Items → Implementation

| Work item (EMP-ROAD-001 Phase 2) | Implementation | State |
|---|---|---|
| Organization and role management | `POST /organizations`, `POST /users`, `POST /roles` in `platform.controller.ts`; SoD checked in `platform.service.ts:assignRole` | Implemented |
| Election, position, candidate configuration | `POST /elections`, `/positions`, `/candidates`, `/transition`; lifecycle in `elections/lifecycle.ts` (T1–T16 table) | Implemented |
| Voter register import, validation, duplicates, statuses | `register/csv-import.ts` (parser, validation, duplicate detection); `POST /register/import`, `/register/resolve` | Implemented |
| Entitlement creation | Created per eligible voter at import/resolution; reconciled at freeze | Implemented |
| Register + configuration freeze | `freezeRegister` (hash, counts, unresolved-duplicate block); `assertConfigEditable` / `assertRegisterEditable` | Implemented |
| Audit trail and audit viewing | Hash-chained audit on every mutation; `GET /audit?organizationId=` with chain verification | Implemented |
| Separation-of-duties enforcement | Phase 1 `auth/sod.ts` wired into role assignment; denied attempts audited (SoD-9) | Implemented + tested |
| Privileged MFA login (P1-OI-1) | scrypt password + RFC 6238 TOTP; privileged roles require TOTP (FR-IAM-001); session tokens stored hashed | Implemented |

Admin web workflows: `apps/web/app/admin` (organization → election → position/candidate → lifecycle/register).

## 2. Exit Criteria

| Criterion | Evidence |
|---|---|
| Mock election fully configured with a 10,000-record register | `platform.spec.ts`: configures election, imports 10,000 rows, freezes, reconciles 10,000 entitlements |
| SoD rules rejected and audited in tests | `platform.spec.ts` SoD-1 test asserts denial + audit record; Phase 1 `auth.spec.ts` covers SoD-1/2/3/7/8 |
| No production placeholder functionality | Features above are functional; known gaps in §3 are stated, not hidden |

## 3. Known Gaps (honest status)

1. **Persistence:** ~~services hold state in memory~~ **Resolved 11 Nov 2026:** `PlatformStore` abstraction with `PostgresStore` (durable; used when `DATABASE_URL` is set) and `InMemoryStore` (tests/dev only). Ballot acceptance is a single transaction with entitlement row lock; verification via `postgres.store.spec.ts` + `scripts/failure-drill.mjs`.
2. **Actor identity:** ~~controllers read `x-actor-id`~~ **Resolved 11 Nov 2026:** `SessionGuard` + `CapabilityGuard` enforce bearer session tokens and per-endpoint capabilities (F-03/F-05); `x-actor-id` is no longer read.
3. **Authorization on endpoints:** ~~deferred~~ **Resolved 11 Nov 2026:** every non-public route carries `@RequireCapability`/`@RequireTransitionCapability` checked against the capability matrix in the target organization.
4. Readiness checklist (EMP-LIFE-001 §6, 14 items) is only partially enforced at READY (register frozen). Full checklist lands with Phase 5 readiness work.

## Document Control

| Field | Value |
|---|---|
| Document | Phase 2 Execution Plan |
| ID | EMP-PHASE2-001 |
| Version | 0.1 |
| Status | In progress |
| Owner | Technical Lead |
| Change control | Version-controlled updates |

**End of document.**
