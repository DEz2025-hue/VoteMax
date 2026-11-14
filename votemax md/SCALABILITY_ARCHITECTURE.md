# Scalability Architecture

**Document ID:** EMP-SCALE-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Capacity and Scalability Architecture\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001, EMP-ARCH-001\
**Owner:** Technical Lead

---

## 1. Purpose

This document defines the capacity targets, load model, scaling strategy, resilience targets, and test plan for EMP. It exists to make sure the platform is **proven**, not assumed, to support the pilot and to grow beyond it.

**Important.** All figures here are planning assumptions and engineering targets, as stated in EMP-FOUND-001 section 7.1. Infrastructure sizing in section 9 is a **starting point to be tested**, not a capacity claim. No capacity may be represented as achieved until a load test has measured it on production-like infrastructure.

## 2. Capacity Targets

| Parameter | Target | Source |
|---|---|---|
| Eligible voter register | 10,000 | EMP-FOUND-001 |
| Expected turnout | 60 to 80% | EMP-FOUND-001 |
| Accepted ballots | 6,000 to 8,000 | EMP-FOUND-001 |
| Voting window | A few hours | EMP-FOUND-001 |
| Minimum concurrent active voters | 200 | EMP-FOUND-001 |
| Load-test headroom | 400 concurrent sessions | EMP-FOUND-001 |
| Ballot burst behavior | Tested, no duplicate or lost accepted ballots | EMP-FOUND-001 |
| Tenant resource isolation | Required | EMP-FOUND-001 |

## 3. Workload Model

### 3.1 Assumptions (to be validated with the pilot committee)

| Assumption | Value | Reason |
|---|---|---|
| Voting window length | 4 hours (planning value) | "A few hours" is not a number; 4 hours is used to compute rates |
| Ballots to handle | 8,000 (upper turnout) | Worst case within the range |
| Average voter session length | About 3 minutes | Login, ballot review, confirmation |
| Opening surge | 15% of voters attempt login within the first 5 minutes | Notifications and queues at stations often trigger synchronized starts |
| Peak period | 30% of ballots within one 30-minute period | Typical clustering around breaks and deadlines |
| Station share | 10 to 20% of ballots via assisted stations | Planning value pending station design |
| Shared networks | Many voters may share an organizational network and appear from the same IP | Shared-network NAT is common |

### 3.2 Derived rates

| Metric | Calculation | Result |
|---|---|---|
| Average ballot rate | 8,000 / 14,400 s | About 0.6 per second |
| Peak ballot rate | 2,400 ballots / 1,800 s | About 1.3 per second |
| Opening login surge | 1,500 logins / 300 s (15% of 10,000) | About 5 per second |
| Sessions started per second to sustain 200 concurrent | 200 / 180 s (Little's law) | About 1.1 per second |
| Sessions started per second to sustain 400 concurrent | 400 / 180 s | About 2.2 per second |

### 3.3 What the numbers tell us

The steady load is modest. The risks are **not** raw throughput but:

1. **Synchronized surges** at opening and during deadlines.
2. **Connection and lock contention** in the database on the ballot path.
3. **Authentication cost** at surge time (password or token verification is CPU-heavy by design).
4. **Retry storms** from impatient voters on slow connections.
5. **Per-IP controls** blocking legitimate voters behind a shared organizational network.
6. **Dependencies** such as notification or verification providers throttling during bursts.
7. **Operational failure** (misconfiguration, human error) rather than saturation.

The test program therefore concentrates on bursts, failure injection, and correctness under concurrency, not only sustained throughput.

## 4. Performance Objectives (Proposed)

Objectives are proposed and become acceptance criteria once approved by the Technical Lead and Product Owner.

| Objective | Target | Verified by |
|---|---|---|
| Ballot submission latency (server side) | p95 under 1 s, p99 under 3 s at 200 concurrent voters | k6 load test |
| Voter ballot page ready on constrained connection | Usable on a throttled mobile profile (for example slow 3G-class) with a defined payload budget | Browser test with network throttling |
| Voter flow transfer size | Defined budget per page, set after first build measurements | Build-time budget checks |
| Error rate during load | Below 0.1% of voter requests excluding intentional rejections | k6 load test |
| Duplicate accepted ballots | Zero | Concurrency tests |
| Lost accepted ballots | Zero under defined failure scenarios | Failure drills |
| Admin dashboard refresh | Aggregates updated within a defined interval, without heavy queries on the ballot path | Load test with dashboards open |
| Register import | 10,000 records validated and staged within a defined time and without affecting other tenants | Import test |

## 5. Scaling Strategy

### 5.1 Application tier

- Stateless API instances behind a load balancer; no local session or ballot state.
- Horizontal scaling by adding instances; minimum of two across availability zones in production.
- Session and idempotency state stored in the database or Redis according to the correctness need (section 5.3).
- Pre-scaling before the voting window rather than relying on reactive autoscaling alone. Autoscaling may be enabled as a safety net, with limits validated in tests.

### 5.2 Database

- Managed PostgreSQL with high availability and point-in-time recovery.
- **Connection pooling** (PgBouncer or managed equivalent) in transaction mode. Application instances use small pools; the pooler protects the database connection limit.
- **Ballot path design for low contention:**
  - Entitlements are per voter, so concurrent ballots touch different rows.
  - **Avoid hot rows**: no single "ballot counter" row updated on every ballot. Aggregate counts are derived asynchronously or from sharded counters.
  - Short transactions; no external calls inside the transaction.
- **Indexes** designed for the eligibility lookup and entitlement update paths; query plans reviewed under load.
- **Read replicas** may serve dashboards and reports, never the eligibility or acceptance decisions.
- **Partitioning** is considered for audit and ballot tables as elections accumulate; not required for the pilot.

### 5.3 Redis and queues

- Use for rate limiting, caching of non-sensitive configuration, job queues, and short-lived non-authoritative state.
- **Correctness must not depend on Redis.** If Redis is unavailable, ballot acceptance must remain correct (it may degrade non-critical features).
- Queues handle imports, notifications, report generation, and aggregate recalculation. Ballot acceptance is synchronous and transactional.

### 5.4 Edge and static delivery

- CDN for static assets and PWA shell; reduces origin load and helps low-bandwidth users.
- Ballot responses and tokens are not cacheable by shared caches.
- WAF and DDoS protection configured and tested with rate-limit rules that account for shared organizational IPs.

### 5.5 Rate limiting design

| Control | Design note |
|---|---|
| Per-IP limits | Must tolerate many legitimate voters behind one address; use high thresholds with behavioral signals rather than strict per-IP caps |
| Per-voter / per-session limits | Primary protection against abuse and retry storms |
| Authentication throttling | Progressive delay per account, not per IP alone |
| Surge handling | Graceful queueing or "try again shortly" responses rather than failure; clear voter messaging |
| Station traffic | Station identities have separate limits, since officers act for many voters |

### 5.6 Voter-side resilience to slow connections

- Idempotent submission and a status check so voters can safely retry.
- Small payloads, minimal JavaScript, no blocking third-party scripts.
- Clear progress and error messaging.
- Server-side timeout settings tuned for slow clients.

### 5.7 Multi-tenant scaling

| Concern | Approach |
|---|---|
| Noisy neighbor | Per-tenant rate limits, job quotas, and queue priorities; active-election tenants protected from other tenants' imports and reports |
| Tenant data growth | Tenant-aware indexing and partitioning when needed |
| Concurrent elections | Capacity planned from the sum of expected concurrent voters across active elections; scheduled elections registered with operations in advance |
| Tenant isolation | Verified by automated tests (SEC-TEN-03), not only by resource separation |
| Enterprise isolation | Dedicated database or deployment option for large customers (future) |

### 5.8 Growth path beyond the pilot

| Scale | Likely changes |
|---|---|
| Up to about 10,000 voters, one election | Pilot configuration (section 9) |
| Tens of thousands of voters, a few concurrent elections | More API instances, larger database, read replica for dashboards, partitioning of audit tables |
| Hundreds of thousands of voters or many simultaneous elections | Dedicated deployments per large tenant, queue separation, database vertical and horizontal strategies, regional deployment, possible extraction of high-load modules |
| Multi-country | Regional deployments for data residency and latency; legal review per country |

The modular monolith (EMP-ARCH-001) is retained until measurements show a specific module needs independent scaling. Premature microservices are avoided.

## 6. Availability and Resilience Targets (Proposed)

| Target | Proposed value | Notes |
|---|---|---|
| Committed ballot durability (RPO) | Zero for acknowledged ballots | Synchronous commit or equivalent; acceptance acknowledged only after durable commit |
| Recovery time during voting window (RTO) | Defined target such as 15 minutes for service restoration | To be set with the committee and validated in drills |
| Availability during window | Defined target set with the committee | A 4-hour window leaves very little tolerance for downtime; requirements drive HA design |
| Backup frequency | Continuous point-in-time recovery plus verified snapshots | Restores tested |
| Failover | Automated database failover tested under load | |
| Instance failure | No voter-visible failure beyond brief retries | |

### 6.1 Failure scenarios to design and test

| Scenario | Expected behavior |
|---|---|
| API instance crash mid-request | Voter retries; idempotency prevents duplicates |
| Database primary failover during ballot burst | Brief errors; retries succeed; no lost or duplicate accepted ballots |
| Redis outage | Ballot acceptance continues correctly; non-critical features degrade |
| Notification provider outage | Voting unaffected; fallback channels and station support |
| Verification provider outage | Documented fallback (assisted station procedure) |
| Connection pool exhaustion | Alerts fire early; controlled rejection rather than cascading failure |
| Traffic spike beyond plan | Rate limiting and queueing protect the ballot path; prioritization of voting over reports |
| Region or zone failure | Recovery procedure per DEC-002 hosting decision |
| Network failure at a station | Procedure for relocation or fallback; no data loss; no offline voting in the first live election |
| Full restore from backup | Documented, timed, rehearsed |

## 7. Load and Resilience Test Plan

### 7.1 Environments

Tests run on a **production-like** environment with representative database size, topology, pooling, network path, and configuration. Results from developer machines are not accepted as gate evidence.

### 7.2 Test types

| Test | Purpose | Pass criteria (proposed) |
|---|---|---|
| **Baseline** | Establish single-user performance | Reference measurements recorded |
| **Load: 200 concurrent** | Meet minimum target | Latency and error objectives (section 4) met for a sustained period |
| **Load: 400 concurrent** | Meet headroom target | No failure; degradation within agreed limits |
| **Surge: opening login burst** | Simulate synchronized start (15% of register in 5 minutes) | Logins succeed within objectives; no cascading failures |
| **Ballot burst** | Short bursts of concurrent ballot submissions (target rate well above the peak in section 3.2) | Zero duplicates, zero lost accepted ballots, consistent counts |
| **Duplicate race** | Many parallel submissions for the same entitlement | Exactly one acceptance per entitlement |
| **Retry storm** | Simulated slow clients retrying aggressively | Idempotency holds; system recovers |
| **Soak** | Sustained load for the full window length or longer | No memory leaks, connection leaks, or queue growth |
| **Failover under load** | Kill primary database and API instances during voting load | Recovery within RTO; ballot integrity checks pass |
| **Restore drill** | Restore from backup into a clean environment | Integrity checks pass; timed |
| **Noisy-neighbor** | Second tenant runs imports and reports during a live-election simulation | Active election unaffected |
| **Station traffic** | Simulated assisted sessions alongside online voters | Station flows meet objectives |
| **Low-bandwidth** | Throttled network profiles | Voter flow completes within objectives |
| **Register import** | Import 10,000 records; large duplicate sets | Completes without harming other workloads |
| **Dashboard load** | Monitoring views open during peak | Ballot path unaffected |

### 7.3 Integrity checks after every ballot test

1. Number of accepted ballots equals the number of consumed entitlements.
2. No entitlement is consumed twice.
3. No accepted ballot lacks a consumed entitlement.
4. Audit chain verifies.
5. Tally of a known synthetic test set equals the expected result.
6. No logs, traces, or telemetry contain selections or linkable data.

### 7.4 Tooling

k6 for load and burst scenarios, Playwright for end-to-end and throttled-network browser checks, Vitest for unit and integration tests, and database-level validation scripts for the integrity checks. Tool choices remain subject to architecture confirmation.

### 7.5 Reporting

Each test run produces a report recording: environment, configuration, version, scenario, results versus objectives, bottlenecks found, and actions taken. Reports are stored as gate evidence for G3 and G4 (`PRODUCT_SCOPE_AND_MVP.md`).

## 8. Monitoring for Capacity

| Signal | Why it matters |
|---|---|
| Request rate, latency (p50, p95, p99), error rate | Voter experience |
| Active sessions and ballot sessions | Concurrency against targets |
| Database connections, pool wait time, lock waits, transaction latency | Early warning of saturation |
| CPU and memory per instance | Scaling headroom |
| Queue depth and job age | Background work health |
| Redis health and eviction | Degradation indicator |
| Station connectivity and error rates | Assisted voting health |
| Entitlement-versus-ballot consistency check | Integrity canary during the election |
| Provider throttling and delivery status | External dependency health |

Capacity telemetry must follow the privacy rules in `SECURITY_MASTER_POLICY.md` section 6: aggregates only, no selections, no linkable ballot-path data.

### 8.1 Election-day thresholds

Alert thresholds and decision rules (for example, when to scale, throttle, or suspend) are defined in the election-day runbook and rehearsed. The committee chair is informed of decisions that affect voting availability.

## 9. Preliminary Deployment Configuration (Starting Point to Test)

This configuration is a **hypothesis**. It will be adjusted from measurements and the selected provider's services (DEC-002).

| Component | Starting point | Notes |
|---|---|---|
| API instances | 3 instances across at least 2 availability zones, modest CPU and memory each | Enough that losing one still handles peak |
| Database | Managed PostgreSQL, primary plus synchronous standby, moderate CPU and memory, SSD storage with headroom | Pooler in front |
| Connection pooler | PgBouncer or managed equivalent, transaction mode | Pool sizes tuned in testing |
| Redis | Small managed instance, persistence per use | Not on the correctness path |
| Object storage | Standard S3-compatible with versioning | Evidence and exports |
| CDN and WAF | Enabled with election-window rules | Shared-IP aware |
| Environments | Dev, test, staging (production-like), production | Staging used for gate tests |
| Pre-election scaling | Scale up before opening; hold during window | Autoscaling optional safety net |
| Change freeze | Before and during window | Emergency exceptions audited |

### 9.1 Sizing process

1. Build the first end-to-end vertical slice of the voting flow early in Phase 3.
2. Run baseline and 200-concurrent tests on staging and record resource use.
3. Extrapolate to 400 concurrent and surge conditions; run the tests.
4. Adjust instance counts, pool sizes, and database size; retest.
5. Add headroom for assisted stations, dashboards, and unknowns; confirm with the dress rehearsal.
6. Record the final production configuration and freeze it for the election.

## 10. Cost Considerations

| Factor | Approach |
|---|---|
| Election peaks are short | Scale up for the window and scale down after to control cost |
| Fixed baseline for HA database | Treated as a necessary cost of integrity and availability |
| Messaging costs | Estimate per voter per election; compare channels (Q-PRD-001) |
| Load testing | Budget for production-like environments for testing periods |
| Pricing model | Capacity per election feeds pricing inputs (DEC-009) |

## 11. Risks and Open Questions

| ID | Item | Mitigation |
|---|---|---|
| SCALE-R1 | Hosting region may add latency for Liberian users | Measure from Liberian networks; consider edge delivery and region options (DEC-002) |
| SCALE-R2 | Shared organizational IPs break per-IP limits | Rate-limit design in section 5.5; test with shared-IP simulation |
| SCALE-R3 | Provider throttling during surges (messages, verification) | Pre-agree limits; fallback procedures |
| SCALE-R4 | Hot-row contention appears in aggregates | Avoid single counters; test counters under burst |
| SCALE-R5 | Voting window shorter than assumed | Re-run workload model; peaks sharpen |
| SCALE-R6 | Cost of a production-like test environment | Time-boxed environment, infrastructure as code |
| SCALE-Q1 | What is the actual voting window and expected clustering? | Confirm with the pilot committee |
| SCALE-Q2 | What share of voters will use assisted stations, and how many stations? | Station plan from Election Operations Lead |
| SCALE-Q3 | What availability target does the committee require? | Set with committee; drives HA design |
| SCALE-Q4 | What connectivity profile do pilot voters actually have? | Field measurement before final payload budgets |

## Document Control

| Field | Value |
|---|---|
| Document | Scalability Architecture |
| ID | EMP-SCALE-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Technical Lead |
| Review frequency | At major milestones and after each load-test cycle |
| Change control | Version-controlled updates |

**End of document.**
