# Votery — Election Management Platform (EMP)

Secure, multi-tenant election platform for organizations. Pilot: university student union election in Liberia. Governing documents live in `votery md/` — start with `PROJECT_OVERVIEW.md`; code must follow them (EMP-SEC-001 SEC-SDL-01/02).

## Status

Phases 1–3 implemented (mock-election level) on a **repository abstraction**: `PostgresStore` (durable, transactional — used when `DATABASE_URL` is set; verified against a live Neon database 11 Nov 2026: migrations applied, integration tests + failure drill PASS) or `InMemoryStore` (tests/dev only, not durable). Session-token auth + per-endpoint capability enforcement is live (F-03/F-05); OTP delivery goes through env-configured providers with a dev-only outbox (F-04). **Still blocked for a live election:** DEC-006/007 external reviews, F-02 single-key custody, provider credentials, governance sign-offs — see `votery md/PHASE_5_EXECUTION_PLAN.md` §3. (Audit appends use a transactional outbox + batched chain drainer; measured ~6.3 voters/s against Neon at ~126 ms RTT — re-measure on staging.)

## Stack

Next.js + TypeScript (web/PWA), NestJS + TypeScript (API), PostgreSQL + Drizzle, Redis. Decision record: `votery md/DEC-003_FRAMEWORK_ORM_DECISION.md`.

## Run locally

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d postgres redis   # Postgres is the production store (F-01)
npm run db:migrate -w @votery/api    # apply drizzle migrations
npm run dev:api    # http://localhost:4000/health
npm run dev:web    # http://localhost:3000
```

Without `DATABASE_URL` the API falls back to the in-memory store (development only — accepted ballots do not survive restart). In production `DATABASE_URL` is required and the in-memory store is refused.

**First run:** with zero role assignments, `POST /organizations`, `POST /users`, and `POST /roles` are open (bootstrap window, audited as actor `bootstrap`). Create the org, an `election_admin` user, a `voter_registrar`, and a `committee_chair` (SoD-1 keeps admin and registrar in separate election scopes), then sign in — privileged roles require the TOTP code returned at user creation. All other endpoints require `Authorization: Bearer <session token>` plus the endpoint's capability.

## Verify

```powershell
npm run build
npm test
```

Tests cover separation-of-duties rules, the permission matrix, tenant isolation, and audit-chain tamper detection (`apps/api/src/**/*.spec.ts`).

## Layout

- `apps/api` — NestJS modular monolith (`auth`, `tenancy`, `audit`, `health`, `db`)
- `apps/web` — Next.js web/PWA shell
- `votery md/` — foundation, decision, and phase documents (source of truth)
