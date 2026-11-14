# Phase 1 Execution Plan — Architecture and Secure Foundations

**Document ID:** EMP-PHASE1-001\
**Version:** 0.1\
**Status:** In progress\
**Document Type:** Phase Execution Plan\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 1), EMP-ARCH-001, EMP-SEC-001\
**Owner:** Technical Lead

---

## 1. Roadmap Work Items → Artifacts

| Work item (EMP-ROAD-001 Phase 1) | Artifact | State |
|---|---|---|
| Ballot secrecy + tally protocol design | `BALLOT_SECRECY_AND_TALLY_PROTOCOL.md` (EMP-PROTO-001) | Draft ready for reviewer |
| Key lifecycle + custody model | `KEY_LIFECYCLE_AND_CUSTODY.md` (EMP-KEY-001) | Draft ready for reviewer |
| Threat model | `THREAT_MODEL.md` (EMP-THREAT-001) | Draft for Security Lead review |
| Data model + tenancy isolation | `DATA_MODEL_AND_TENANCY.md` (EMP-DATA-001) + `apps/api/src/db/schema.ts` | Foundation implemented |
| Final framework + ORM (DEC-003) | `DEC-003_FRAMEWORK_ORM_DECISION.md` | **Decided: NestJS + Drizzle** |
| Environments, CI/CD, migrations, secrets | `docker-compose.yml`, `.github/workflows/ci.yml`, `drizzle/` migrations, `.env.example` | Implemented |
| Authentication, roles, audit foundation | `apps/api/src/auth`, `src/audit`, `src/tenancy` + specs | Implemented + tested |
| Observability baseline | Structured JSON logger with redaction (`apps/api/src/common/logger.ts`), `/health` | Baseline implemented; metrics/error-tracking provider in Phase 4 hardening |

## 2. Phase 1 Scope Boundary

Phase 1 builds **foundations only**: tenancy, authorization/SoD policy, audit chain, health, typed tenant context, migrations pipeline, web shell. It does **not** build elections, registers, or voting (Phase 2/3). No ballot code exists; EMP-PROTO-001 is behind the DEC-006 hold point.

Authentication note: privileged-user MFA login (FR-IAM-001) needs an identity approach. Phase 1 implements the **authorization layer** (roles, scopes, SoD, tenant guard) against authenticated-principal objects, with a development-only principal header for local work clearly marked non-production. Choosing/building the MFA login itself (provider vs built-in TOTP) is the first Phase 2 task and must not be improvised here — recorded as open item P1-OI-1.

## 3. Exit Criteria — Status

| Criterion | Status |
|---|---|
| Specialist review of secrecy/tally design complete, findings addressed/tracked | **Blocked externally:** DEC-006 reviewer not yet engaged (Phase 0 pack ready). Spec is review-ready. |
| Authorization + tenant-isolation automated tests passing | **Required this phase:** `apps/api` specs must be green in CI |
| Environments reproducible from version control | `docker compose up` + migrations from a clean checkout; CI proves build/test |

Phase 1 cannot formally exit until the DEC-006 review happens. Everything buildable without it is the deliverable of this phase.

## 4. Open Items

| ID | Item | Needed by |
|---|---|---|
| P1-OI-1 | MFA login approach for privileged users (FR-IAM-001) | Phase 2 start |
| P1-OI-2 | External audit anchor party (SEC-AUD-03, SEC-OI-5) | Phase 4 |
| P1-OI-3 | Error-tracking provider with ballot-path body capture disabled (SEC-BAL-04) | Phase 4 |

## Document Control

| Field | Value |
|---|---|
| Document | Phase 1 Execution Plan |
| ID | EMP-PHASE1-001 |
| Version | 0.1 |
| Status | In progress |
| Owner | Technical Lead |
| Change control | Version-controlled updates |

**End of document.**
