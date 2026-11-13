# Data Model and Tenancy Isolation Design

**Document ID:** EMP-DATA-001\
**Version:** 0.1\
**Status:** Implemented as Phase 1 foundation schema (see `apps/api/src/db/schema.ts`)\
**Document Type:** Data Design\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ARCH-001 §§6/9/11, EMP-SEC-001 §§5–6, EMP-DEC003-001\
**Owner:** Technical Lead

---

## 1. Security Domains → Schemas

One PostgreSQL database, four schemas mirroring EMP-ARCH §6. Cross-domain joins D2↔D3 are prevented by **separate database roles** (Phase 3 completes the tally-role split; Phase 1 creates the schemas and tenant tables).

| Schema | Domain | Tables (Phase 1 foundation in **bold**) |
|---|---|---|
| `admin` | D1 Administration | **organizations, users, role_assignments**, elections, positions, candidates, stations (Phase 2) |
| `identity` | D2 Voter identity | voter_records, entitlements (Phase 2/3) |
| `ballot` | D3 Ballot | ballots (Phase 3, after DEC-006 review) |
| `audit` | D4 Audit | **audit_records** (append-only, hash-chained) |

## 2. Tenancy Rules (SEC-TEN-01…04)

1. Every tenant-scoped table carries `organization_id NOT NULL` referencing `admin.organizations`.
2. The tenant is resolved **from the authenticated identity**, never from client parameters alone. API middleware sets the tenant context; handlers receive it typed, not from the request body.
3. Defence-in-depth: each request transaction runs `SELECT set_config('app.tenant_id', <uuid>, true)` and RLS policies enforce `organization_id = current_setting('app.tenant_id')::uuid`. RLS is enabled in the initial migration for `role_assignments` and `audit_records` as the reference implementation; Phase 2 extends it to every tenant table before any holds real data.
4. Exports, jobs, caches, and search are tenant-scoped by construction (tenant in every key/query); cross-tenant tests run in CI and block release (SEC-TEN-03) — see `apps/api/src/tenancy/tenancy.spec.ts`.
5. Election keys are per-election; no cross-tenant key reuse (EMP-ARCH §9).

## 3. Phase 1 Foundation Tables

**organizations** — `id uuid PK`, `name`, `slug unique`, `created_at`. The tenant root.

**users** — `id uuid PK`, `organization_id FK` (platform administrators have `NULL` organization and a platform flag), `email`, `display_name`, `mfa_enrolled bool`, `created_at`. Password/credential material is added with the auth implementation via the identity provider decision in Phase 1 plan §4 — never bespoke password storage without review.

**role_assignments** — `id`, `organization_id`, `user_id`, `role` (enum from EMP-STAKE-001 §3), `election_id nullable`, `station_id nullable`, `valid_from`, `valid_to`, `granted_by`. SoD rules SoD-1…9 are enforced in `apps/api/src/auth/sod.ts` **before insert** and audited on grant/revoke (FR-IAM-006).

**audit_records** — `id bigserial`, `organization_id nullable`, `actor_id`, `action`, `scope`, `outcome`, `created_at`, `prev_hash`, `hash`. Append-only: application DB role has INSERT/SELECT only; hash = SHA-256 over previous hash + canonical record (SEC-AUD-02). Periodic external anchoring (SEC-AUD-03) is Phase 4; the chain format must not change after Phase 1 without a migration plan.

## 4. Invariants Carried Into Phase 2/3

- No table in `ballot` may contain a voter, user, session, OTP, or entitlement identifier — schema review checklist item for every migration (SEC-BAL-02).
- Entitlement consumption is a single-transaction conditional update (Phase 3, SEC-VOT-02).
- Register/election immutability after freeze is enforced by state checks + audit, not by convention (FR-ELE-006, FR-VOT-005).

## Document Control

| Field | Value |
|---|---|
| Document | Data Model and Tenancy Isolation Design |
| ID | EMP-DATA-001 |
| Version | 0.1 |
| Status | Foundation implemented |
| Owner | Technical Lead |
| Change control | Version-controlled; schema changes via migrations only |

**End of document.**
