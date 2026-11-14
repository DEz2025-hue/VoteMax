# System Architecture

**Document ID:** EMP-ARCH-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Architecture\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001, EMP-SCOPE-001\
**Owner:** Technical Lead

---

## 1. Purpose

This document describes the proposed architecture of the Election Management Platform (EMP): its structure, logical security domains, data design principles, key workflows, and deployment shape. It answers *how* the requirements in EMP-PRD-001 are met.

**Status of decisions.** Items marked **Proposed** are the current direction and may change after evaluation. Items marked **Decision required** depend on an open decision in EMP-FOUND-001 section 19. Nothing here authorizes a custom cryptographic protocol: the secrecy and tally design requires specialist review (DEC-006) before implementation.

## 2. Architectural Drivers

| Driver | Architectural consequence |
|---|---|
| Ballot secrecy | Identity and ballot content are stored in separate security domains and never joined by ordinary queries |
| Uniqueness | Ballot acceptance and entitlement consumption occur in one database transaction |
| Integrity and verifiability | Append-only ballot and audit records with tamper evidence; independently verifiable tally |
| Tenant isolation | Tenant identifier on every record, enforced below the application layer |
| Election-day availability | Stateless application tier, managed database with failover, tested recovery |
| Small team, first pilot | Modular monolith; avoid premature microservices |
| Low bandwidth and low-end devices | Lightweight voter interface, resumable submission |
| Separation of duties | Fine-grained authorization enforced on the server |

## 3. Architecture Overview

EMP is a **modular monolith**: one deployable backend composed of modules with strict boundaries, plus a web front end.

```
                +------------------------------+
   Voters  ---> |  Web app / PWA (Next.js)     |
   Admins  ---> |  Voter UI | Admin UI | Station UI
   Officers --> +--------------+---------------+
                               | HTTPS
                       +-------v--------+
                       |  Edge / WAF /  |
                       |  Load balancer |
                       +-------+--------+
                               |
                +--------------v----------------+
                |   API (NestJS, stateless,     |
                |   horizontally scalable)      |
                |                               |
                |  Modules:                     |
                |  - Identity & Access          |
                |  - Organization / Tenancy     |
                |  - Election Configuration     |
                |  - Voter Register & Eligibility
                |  - Voting (Ballot Acceptance) |
                |  - Stations                   |
                |  - Monitoring & Alerts        |
                |  - Tally & Results            |
                |  - Audit & Evidence           |
                |  - Notifications              |
                +---+-----------+----------+----+
                    |           |          |
          +---------v--+  +-----v----+  +--v-----------+
          | PostgreSQL |  |  Redis   |  | Object store |
          | (pooled)   |  | cache &  |  | (S3-compat.) |
          |            |  | queues   |  |              |
          +------------+  +----------+  +--------------+
                    |
          +---------v-----------------+
          | Key management / HSM or   |
          | managed KMS (DEC-006)     |
          +---------------------------+
```

## 4. Technology Direction (Proposed)

| Layer | Direction | Status |
|---|---|---|
| Web application and PWA | Next.js, TypeScript | Proposed |
| Backend | NestJS, TypeScript | Proposed (DEC-003) |
| Database | PostgreSQL | Proposed |
| ORM / query layer | Prisma or Drizzle | Decision required (DEC-003) |
| Cache and queues | Redis | Proposed |
| Connection pooling | PgBouncer or managed equivalent | Proposed |
| File storage | S3-compatible object storage | Proposed |
| Hosting | Managed cloud infrastructure | Decision required (DEC-002) |
| Monitoring and errors | Centralized monitoring; Sentry or equivalent | Proposed |
| Testing | Vitest, Playwright, k6 | Proposed |

**ORM consideration.** Whichever is chosen must support explicit transactions, row-level locking or equivalent atomic primitives, raw SQL where needed for security-critical paths, and version-controlled migrations. The ballot acceptance path may use hand-written SQL for clarity and auditability.

## 5. Module Boundaries

Modules communicate through defined interfaces. Cross-module database access is prohibited except through the owning module.

| Module | Responsibility | Key rule |
|---|---|---|
| Identity & Access | Authentication, sessions, MFA, roles, permissions | Server-side authorization on every request |
| Organization / Tenancy | Tenants, workspaces, settings | Tenant context established once per request |
| Election Configuration | Elections, positions, candidates, rules, lifecycle state machine | Lifecycle transitions validated centrally |
| Voter Register & Eligibility | Register import, duplicates, statuses, entitlements | Register freeze enforced |
| Voting | Ballot session, submission, acceptance, status checks | Only module allowed to consume entitlements |
| Stations | Station definitions, officer sessions, assisted flows | Officers cannot access ballot content |
| Monitoring & Alerts | Aggregate participation, health, alerts | Aggregates only; no selections |
| Tally & Results | Tally authorization, computation, verification evidence, certification | Multi-party approval; access to sealed ballots only here |
| Audit & Evidence | Append-only audit trail, evidence export | Written by all modules, edited by none |
| Notifications | Outbound messages | Never carries selections or reusable credentials |

Modules are implemented as separate packages with enforced import rules so that a later extraction to services remains possible, without requiring it.

## 6. Logical Security Domains

The modular monolith contains domains with different trust levels. Each domain has separate database roles, schemas, and access paths.

| Domain | Contents | Who/what can access |
|---|---|---|
| **D1 Administration** | Organizations, elections, configuration, roles | Admin roles via API |
| **D2 Voter identity** | Voter register, eligibility, entitlements, participation flags | Registrar functions; Voting module for entitlement checks |
| **D3 Ballot** | Accepted, encrypted ballots | Voting module (write-only); Tally module (authorized read) |
| **D4 Audit** | Audit and evidence records | All modules append; auditors read |
| **D5 Keys** | Key material and custody records | KMS/HSM; custodian processes only |
| **D6 Operations** | Logs, metrics, traces | Operators; designed to contain no selections or linkable voter data |

**Rule:** no ordinary query, report, log, or analytics path may join D2 (who participated) with D3 (what was cast).

## 7. Ballot Secrecy Architecture

> **Specialist review required (DEC-006).** This section states *requirements and constraints* for the design, not a finished protocol. Detailed cryptography must be specified and reviewed before implementation. EMP will not invent a custom cryptographic protocol.

### 7.1 Design constraints

1. **Separation of participation and content.** The system records that a voter *has voted* (D2) separately from the *ballot content* (D3). No stored value links the two.
2. **No identity in the ballot record.** Ballot records contain no voter identifier, session identifier, or other direct linkage.
3. **Metadata minimization.** Timestamps and ordering of ballot records are coarsened or decoupled from participation records to resist timing correlation. Network-level metadata (IP, user agent) is not stored with ballots and is excluded from ballot-path logs.
4. **Encryption of ballots at acceptance.** Ballots are encrypted before storage under election-specific keys; decryption is possible only through the authorized tally process.
5. **Sealed until close.** No tally material is accessible before the election closes and the tally is authorized.
6. **Threshold key control.** Decryption requires multiple key custodians acting together (SoD-4); no single administrator can unseal ballots.
7. **Append-only ballot store.** Accepted ballots cannot be updated or deleted by application roles.
8. **Verifiable tally.** The tally process must produce evidence that independent parties can check against the set of accepted ballots.
9. **Honest limitations.** Compromised voter devices and coercion in remote voting are out of the platform's control and must not be claimed as solved.

### 7.2 Options to evaluate with the specialist reviewer

| Option | Notes |
|---|---|
| Encrypted ballots with threshold decryption and mixing/shuffle with proofs | Provides verifiable tally and unlinkability; higher complexity |
| Homomorphic tallying with threshold decryption | Verifiable aggregate; limited ballot formats and result rules |
| Simple sealed encrypted ballot store with split-key decryption and published evidence hashes | Lower assurance on unlinkability and verifiability; may suit an initial, clearly stated assurance level |

The choice, its assurance claims, and its limitations must be documented in a protocol specification and reviewed independently. Blockchain is not a substitute for any of these.

## 8. Ballot Acceptance Flow

The flow below defines required properties; implementation details follow the reviewed protocol.

1. **Authenticate** the voter (or station session) and establish tenant and election context.
2. **Check eligibility and window:** election is open, voter is eligible, entitlement is unconsumed.
3. **Issue a ballot session** with a short lifetime, bound to the voter's entitlement but not stored with the ballot record.
4. **Voter selects and confirms** choices in the client.
5. **Client submits** the ballot with an idempotency token.
6. **Server validates** structure against election rules (positions, selection counts).
7. **Within one database transaction:**
   - Lock and verify the entitlement (for example `SELECT ... FOR UPDATE` or an atomic conditional update).
   - Mark the entitlement consumed.
   - Write the encrypted ballot to D3 using the reviewed unlinking approach.
   - Append an audit record containing no selections.
8. **Commit.** Only after commit does the voter receive acceptance.
9. **Retry and status:** a repeated submission with the same idempotency token returns the original outcome. A status endpoint tells the voter whether their ballot was accepted without revealing selections.

**Guarantees tested at G4:** at most one accepted ballot per entitlement; no acceptance acknowledgment without durable commit; no lost accepted ballot under defined failures.

## 9. Multi-Tenancy

| Aspect | Approach (Proposed) |
|---|---|
| Data isolation | Tenant identifier on all tenant-scoped tables; PostgreSQL row-level security as a defense-in-depth layer beneath application checks |
| Request context | Tenant resolved from the authenticated identity, never from client-supplied parameters alone |
| Keys | Election-specific keys; no cross-tenant key reuse |
| Resources | Per-tenant rate limits and job quotas; election-window protection for the active tenant |
| Testing | Automated cross-tenant access tests in CI |
| Future | Dedicated database or deployment per tenant for enterprise customers |

## 10. Authentication and Authorization

- Admin and privileged roles use MFA.
- Voter authentication follows the election's verification method (DEC-004).
- Authorization is policy-based: role, scope (organization, election, station), and separation-of-duties rules are evaluated server-side.
- Sessions are short-lived and revocable; station sessions are bound to station, officer, and window.
- Authorization decisions for critical actions are logged to D4.

## 11. Data Architecture

### 11.1 Principal entities (illustrative)

| Entity | Domain | Notes |
|---|---|---|
| Organization, Tenant settings | D1 | |
| User, RoleAssignment | D1 | Scoped assignments |
| Election, Position, Candidate, BallotRule | D1 | Immutable after approval |
| Station, StationAssignment | D1 | |
| VoterRecord, VoterStatusHistory | D2 | Minimal personal data |
| Entitlement | D2 | One per voter per election; consumed atomically |
| Ballot | D3 | Encrypted; no voter linkage |
| TallyRun, TallyApproval, VerificationEvidence, Certification | D3/D4 | Multi-party |
| AuditRecord | D4 | Append-only, chained for tamper evidence |
| KeyCustodyRecord | D5 | Custody events; no key material in application DB |
| Notification | D1 | No selections |

### 11.2 Data rules

- Migrations are version-controlled and reviewed.
- Personal data minimization applies to D2.
- Backups preserve domain separation; restored data does not recreate linkage.
- Retention and deletion follow policy (Q-PRD-005).
- No production use of mock or seed data presented as real.

## 12. Audit and Evidence Architecture

- Audit records are append-only and carry a hash chain (each record includes the hash of the previous one), enabling tamper detection.
- Periodic chain anchors (digests) are exported to a location outside administrator control, such as an external write-once store or independent party.
- Audit records exclude ballot selections and include actor, action, scope, time, outcome.
- Auditors receive read-only exports and verification tooling.

## 13. Voting Channels in the Architecture

| Channel | Architecture note |
|---|---|
| Online | Same API and ballot flow; browser/PWA client |
| Connected assisted | Station UI authenticates officer and station, starts a voter session via the same eligibility and entitlement checks; the ballot screen is rendered for the voter only; session state cleared after submission |
| Controlled offline (gated, not for first live election) | Separate subsystem, see section 14 |

## 14. Controlled Offline Voting (Gated)

Offline voting is **not built for the first live election** and must not be enabled by configuration. The architecture reserves space for it:

| Element | Direction |
|---|---|
| Polling devices | Authenticated, enrolled, attestable |
| Election package | Signed configuration and station voter allocation |
| Local storage | Encrypted ballots; tamper-evident, sequenced event log |
| Synchronization | Idempotent, resumable, authenticated |
| Conflicts | Entitlement double-use across channels detected centrally; routed to formal reconciliation |
| Certification | Blocked while any conflict is unresolved |

Production enablement requires DEC-008: independent security review and operational approval.

## 15. Application and Interface Design

- **Front end:** Next.js with server rendering where helpful for low-bandwidth delivery; PWA service worker limited to static assets and safe caching; **ballot content and tokens are never cached in a way that survives the session**.
- **API:** HTTPS only; versioned; input validation at the boundary; consistent error model; rate limiting; idempotency keys on state-changing voter operations.
- **Asynchronous work:** Redis-backed queues for notifications, imports, and report generation; critical ballot acceptance is **synchronous and transactional**, not queued.
- **Imports:** large register imports run as background jobs with staged validation before commit.

## 16. Deployment Architecture (Preliminary)

| Component | Direction |
|---|---|
| Edge | CDN/WAF/DDoS protection and TLS termination |
| Application tier | At least two stateless API instances across availability zones |
| Database | Managed PostgreSQL with high availability, point-in-time recovery, connection pooling |
| Cache/queue | Managed Redis with persistence appropriate to job type |
| Storage | Object storage with versioning for evidence exports |
| Keys | Managed KMS or HSM; custody model per DEC-006 |
| Environments | Development, test, staging (production-like), production |
| Releases | Reproducible builds, controlled promotion, no direct production changes |
| Election-day posture | Change freeze, scaled-up capacity, heightened monitoring |

Sizing is defined in `SCALABILITY_ARCHITECTURE.md` and must be validated by load testing and provider measurements.

## 17. Observability

| Capability | Rule |
|---|---|
| Metrics | Health, latency, error rates, queue depth, database saturation |
| Logs | Structured; redaction enforced by tests; **no ballot content, no voter-linkable ballot-path data** |
| Tracing | Disabled or strictly sampled on ballot-path internals; never captures request bodies containing selections |
| Alerts | Defined per `SECURITY_MASTER_POLICY.md` and runbooks |
| Dashboards | Aggregate participation only |

Observability data is reviewed during the privacy assessment because telemetry is a common source of accidental linkage.

## 18. Resilience and Recovery

| Scenario | Direction |
|---|---|
| API instance failure | Load balancer removes instance; stateless recovery |
| Database primary failure | Automated failover; tested recovery of committed ballots; clients recover through idempotent retry |
| Redis failure | Core ballot acceptance does not depend on Redis for correctness |
| Region/provider failure | Recovery procedure defined and rehearsed; scope determined by DEC-002 |
| Data corruption or compromise | Point-in-time recovery, audit chain verification, incident response |
| Key custodian unavailability | Threshold design tolerates absence; custody continuity plan |

## 19. Architecture Decision Records

Decisions are recorded as ADRs in the repository. Initial ADRs to write:

| ADR | Topic | Depends on |
|---|---|---|
| ADR-001 | Modular monolith and module boundaries | – |
| ADR-002 | Backend framework and ORM | DEC-003 |
| ADR-003 | Tenancy isolation (RLS) | – |
| ADR-004 | Ballot secrecy and tally protocol | DEC-006 |
| ADR-005 | Key management and custody | DEC-006 |
| ADR-006 | Audit hash chain and external anchoring | – |
| ADR-007 | Voter authentication method | DEC-004 |
| ADR-008 | Hosting and region | DEC-002 |
| ADR-009 | Observability privacy rules | – |
| ADR-010 | Offline voting reservation | DEC-008 |

## 20. Risks and Open Questions

| ID | Item |
|---|---|
| ARCH-R1 | Unlinkability under small-turnout and timing conditions needs specialist analysis |
| ARCH-R2 | Hosting region selection may constrain managed service availability and latency to Liberia |
| ARCH-R3 | Voter authentication choice may introduce linkage risk if tokens persist into the ballot path |
| ARCH-R4 | Audit anchoring requires an independent party that must be identified |
| ARCH-Q1 | What is the acceptable assurance level of the first tally protocol versus the cost and complexity of verifiable mixing? |

## Document Control

| Field | Value |
|---|---|
| Document | System Architecture |
| ID | EMP-ARCH-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Technical Lead |
| Review frequency | At major project milestones and on any material design change |
| Change control | Version-controlled updates; ADRs for decisions |

**End of document.**
