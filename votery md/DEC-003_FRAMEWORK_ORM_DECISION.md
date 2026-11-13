# DEC-003 — Backend Framework and ORM (Decision Record)

**Document ID:** EMP-DEC003-001\
**Version:** 1.0\
**Status:** Decided (revisitable by ADR if Phase 1 evidence contradicts)\
**Document Type:** Architecture Decision Record (ADR-002)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §19, EMP-ARCH-001 §4, EMP-SCALE-001\
**Owner:** Technical Lead

---

## 1. Decision

| Layer | Choice |
|---|---|
| Backend | **NestJS** (TypeScript, modular monolith per EMP-ARCH-001 §3) |
| ORM / query layer | **Drizzle ORM** with explicit SQL for security-critical paths |
| Database | PostgreSQL (managed, HA, PgBouncer transaction mode) |
| Frontend | Next.js (TypeScript) + PWA (unchanged from EMP-ARCH-001) |
| Tests | Vitest (unit/integration), Playwright (e2e), k6 (load) (unchanged) |

## 2. Why Drizzle over Prisma

EMP-ARCH-001 §4 requires: explicit transactions, row-level locking / atomic primitives, raw SQL where needed for security-critical paths, version-controlled migrations.

| Criterion | Drizzle | Prisma |
|---|---|---|
| Raw SQL transparency for ballot acceptance (ARCH §8) | First-class; queries read as SQL | Possible via `$queryRaw`, but the security path fights the abstraction |
| PostgreSQL RLS with per-transaction tenant (`set_config('app.tenant_id', …)`) | Natural: set inside the same transaction as the queries | Awkward: connection/session state vs Prisma's pooling model needs workarounds |
| `SELECT … FOR UPDATE` entitlement locking | Explicit in SQL | Raw SQL escape hatch |
| Migrations | drizzle-kit, SQL files reviewed in VCS (SEC-SDL-08) | Migrate, also VCS — equal |
| Type safety | Inferred from schema | Generated client — equal in practice |

Neither choice changes the architecture. This records the tie-break: **the ballot and tenancy paths must be auditable as SQL** (ARCH §4: “The ballot acceptance path may use hand-written SQL for clarity and auditability.”).

## 3. Consequences

- Schema lives in `apps/api/src/db/schema.ts`; migrations are generated SQL committed to the repo and reviewed like code.
- Every tenant-scoped query runs inside a transaction that first sets `app.tenant_id` from the authenticated context (never client input — SEC-TEN-01). RLS policies are defence-in-depth (SEC-TEN-02).
- Ballot acceptance (Phase 3) will be hand-written SQL in one transaction; Drizzle does not abstract it.
- If Drizzle blocks a Phase 1/2 requirement, reversal cost is contained: modules talk to repositories, not to the ORM directly (EMP-ARCH §5).
- Next.js is pinned to **15.1.6 exactly** (no caret): the 15.5.x SWC native binary fails to load on the current Windows dev machine (`DLL initialization routine failed`, verified 11 Nov 2026; 15.1.6 and 14.2.29 SWC load correctly). Revisit the pin when upgrading — test SWC load first.

## Document Control

| Field | Value |
|---|---|
| Document | DEC-003 Framework and ORM Decision |
| ID | EMP-DEC003-001 |
| Version | 1.0 |
| Status | Decided |
| Owner | Technical Lead |
| Change control | Superseded only by a new ADR |

**End of document.**
