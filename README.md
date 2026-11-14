# Votemax — Election Management Platform (EMP)

Secure, multi-tenant election platform for organizations. Pilot: organizational election. Governing documents live in `votemax md/` — start with `PROJECT_OVERVIEW.md`; code must follow them (EMP-SEC-001 SEC-SDL-01/02).

## Status

Phases 1–4 implemented on a **repository abstraction**: `PostgresStore` (durable, transactional — required in production, verified against Neon) or `InMemoryStore` (tests/dev only, refused in production). **Deployed:** web on Vercel, API on Railway, database on Neon Postgres.

**Still blocked for a live election:** DEC-006/007 external reviews, F-02 single-key custody, production OTP provider credentials (SMTP/SMS env vars), governance sign-offs — see `votemax md/PHASE_5_EXECUTION_PLAN.md` §3.

## Stack

- `apps/web` — Next.js 15 + React 19 + TypeScript (public vote, admin console, platform portal)
- `apps/api` — NestJS + TypeScript modular monolith
- PostgreSQL + Drizzle ORM (schema-per-domain: `admin`, `identity`, `ballot`, `results`, `audit`, `fraud`)
- Auth: scrypt password hashing, bearer sessions, TOTP MFA for privileged roles
- Decision record: `votemax md/DEC-003_FRAMEWORK_ORM_DECISION.md`

## Features

### Election lifecycle

`DRAFT → CONFIGURED → REGISTRATION → REGISTER_FROZEN → READY → OPEN → CLOSED → TALLIED → VERIFIED → (RECOUNT) → CERTIFIED → PUBLISHED → ARCHIVED`, with `SUSPENDED`/`CANCELLED` off-ramps. Every transition is enforced server-side with a per-target capability (e.g. register freeze requires `committee_chair`; configure/publish requires `election_admin`).

### Voting flow

1. Voter enters organization slug + member ID on `/vote`.
2. OTP requested (`POST /elections/:id/voting/otp/request`) — rate-limited and fraud-scored.
3. OTP verified → short-lived ballot session → ballot (positions/candidates) fetched.
4. Selections submitted encrypted (`POST /voting/submit`) with an idempotency key; retries return the original receipt, duplicate votes are impossible.

### Roles & capabilities

Four roles mapped to capabilities, scoped organization-wide or per-election: `platform_admin` (platform control plane — creates organizations and initial owner accounts), `organization_owner` (runs the whole tenant election lifecycle: staff, register, ballot, tally, certification), `auditor` (read-only oversight: turnout, audit records, results, tally verification), `voter` (authenticates and casts a ballot). Candidates are election records, not user roles, and there is no in-person voting. Separation of duties is enforced in code — the tally authorizer (owner) differs from the executor, approvers must include an auditor, and the certifier differs from the tally executor and second approver.

### Platform admin portal (`/platform`)

- Tenant directory: per-org user/election counts, elections-by-state, staffed status.
- One-step organization creation with **optional first-admin provisioning** — creates an MFA-enrolled account and returns its one-time TOTP secret.
- Platform health dashboard: store type, DB latency, OTP provider availability, security-signal counts, uptime.

## Security

- **AuthN/Z:** scrypt (memory-hard KDF) password hashing; revocable bearer sessions; mandatory TOTP MFA for all privileged accounts; tenant resolved from the session principal, never client input.
- **Secret ballot by architecture:** no role or capability can link a ballot selection to a voter — ballots are stored against election keys only. Audit records contain no selections.
- **Anti-fraud engine (SEC-VOT-10):** evaluates OTP requests/verifies, logins, ballot fetches, and submissions against rules such as `otp_harvest_device`, `login_stuffing_device`, `ip_otp_sweep`, `submit_replay`. Emits allow/throttle/block decisions with salted hashes only (no raw IPs or device fingerprints persisted). Blocks are reviewable and liftable from the admin console's Fraud signals section.
- **Audit trail:** append-only, hash-chained records via a transactional outbox; tamper-evident and verifiable (`GET /audit` reports `verified`).
- **Brute-force protection:** account lockouts on repeated failed logins, OTP attempt limits, per-voter/IP/device velocity limits.
- **Admin UI capability gating:** the console hides/disables actions a role can't perform (display convenience only — the API enforces everything).

## OTP delivery

Configured via environment variables on the API:

| Provider | Variables |
|---|---|
| SMTP email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` |
| Africa's Talking SMS | `AT_API_KEY`, `AT_USERNAME`, `AT_SENDER_ID` |
| SMS webhook | `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_AUTH` |

Without a provider, OTP delivery fails closed in production; a dev-only outbox captures codes for local testing (flagged on the health dashboard).

## Deployment

| Piece | Host | Notes |
|---|---|---|
| Web | Vercel (`apps/web`) | `NEXT_PUBLIC_API_URL` points at the API |
| API | Railway (`railpack.json` at repo root) | `db:migrate` then `node apps/api/dist/main.js`, `PORT` injected |
| Database | Neon Postgres | pooled `DATABASE_URL` |

Railway env: `DATABASE_URL`, `NODE_ENV=production`, `WEB_ORIGIN`, `FRAUD_HASH_SALT`, `NODE_VERSION=22`, plus OTP provider vars when configured.

## Run locally

```powershell
npm install
Copy-Item .env.example .env.local   # set DATABASE_URL etc.
npm run db:migrate -w @votemax/api   # apply drizzle migrations
npm run dev                         # api :4000 + web :3000
```

Without `DATABASE_URL` the API falls back to the in-memory store (development only — accepted ballots do not survive restart). In production `DATABASE_URL` is required and the in-memory store is refused.

**First run:** with zero role assignments, `POST /organizations`, `POST /users`, and `POST /roles` are open (bootstrap window, audited as actor `bootstrap`). The platform portal also handles first-run provisioning — sign in as `platform_admin` and create the first organization with its admin.

## Verify

```powershell
npm run build
npm test
```

Tests cover separation-of-duties rules, the permission matrix, tenant isolation, audit-chain tamper detection, fraud rules, and end-to-end election workflows (`apps/api/src/**/*.spec.ts` — 77 tests).

## Layout

- `apps/api` — NestJS modular monolith (`auth`, `platform`, `fraud`, `otp`, `audit`, `register`, `elections`, `tenancy`, `db`, `store`, `health`)
- `apps/web` — Next.js app (`/vote`, `/admin`, `/platform`, `/help`)
- `votemax md/` — foundation, decision, and phase documents (source of truth)
