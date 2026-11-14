# Phase 4 Hardening Report

**Document ID:** EMP-PHASE4-001\
**Version:** 0.1\
**Status:** Internal hardening complete — Phase 4 CANNOT exit (see §4)\
**Document Type:** Phase Report\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ROAD-001 (Phase 4), EMP-SCALE-001, EMP-SEC-001 §13\
**Owner:** Security Lead (with Technical Lead)

---

## 1. Work Performed

| Roadmap item | What was done | Evidence |
|---|---|---|
| Load testing | Local Node harness (`scripts/load-test.mjs`): 600 voters, 200 concurrent sessions, OTP→vote; k6 script for gate runs (`load/k6-voting.js`) | §2 |
| Failure testing | Kill/restart drill (`scripts/failure-drill.mjs`) | §2, finding F-01 |
| Penetration testing (internal) | Automated security suite (`security.spec.ts`, 9 tests): OTP throttle/lockout, session reuse, double-vote, foreign-candidate ballots, tally forgery, publish-before-certify, aggregate-only monitoring, login lockout | 45/45 tests green |
| Remediation | Per-voter OTP throttle (5/10 min), login lockout (8 failures → 5 min), API security headers (nosniff, DENY frame, CSP `default-src 'none'`, no-store) | Code + tests |
| Accessibility review | Internal WCAG 2.2 AA checklist on voter flow; contrast defect fixed | `ACCESSIBILITY_REVIEW.md` |
| Known limitations documentation | Claims register (claims allowed/forbidden + stated limitations) | `CLAIMS_REGISTER.md` |

## 2. Measured Results (dev machine — NOT gate evidence)

| Measurement | Result | Objective (EMP-SCALE §4) |
|---|---|---|
| 600 voters @ 200 concurrent, submit p95 | 99 ms (in-memory, localhost) | p95 < 1 s — met locally only |
| Submit p99 | 220 ms | p99 < 3 s — met locally only |
| Errors / duplicates / lost | 0 / 0 / 0 of 600 | Zero — met locally only |
| Kill API mid-election, restart | **Accepted ballot LOST** | NFR-AVL-004 requires survival — **failed (F-01)** |

Per EMP-SCALE §1, developer-machine numbers are not gate evidence. G3/G4 require the k6 scenarios (200 sustained, 400 headroom, burst, failover under load) on production-like staging in the DEC-002 region.

## 3. Findings Register

| ID | Severity | Finding | Remediation | Owner |
|---|---|---|---|---|
| F-01 | **Critical** | Accepted ballots live only in API memory; any restart loses them (drill-proven) | Postgres repository (single-transaction acceptance, EMP-ARCH §8) + failover drill re-run — **implemented 11 Nov 2026** (`PostgresStore` + migration 0002 + append-only triggers); verification pending a live DB | Technical Lead |
| F-02 | **Critical** | Ballot encryption uses one service-held key; no threshold custody | DEC-006 reviewed protocol + custodian threshold implementation | Security Lead |
| F-03 | **High** | Admin endpoints trust `x-actor-id` header; session tokens issued but not enforced per request | Enforce session auth + capability checks (FR-IAM-002) on every endpoint — **implemented 11 Nov 2026** (`SessionGuard` + `CapabilityGuard`, per-endpoint `@RequireCapability`); `x-actor-id` no longer read | Technical Lead |
| F-04 | **High** | OTP delivered as dev code in responses outside production; no real email/SMS provider | Integrate providers (DEC-004 §3); remove dev code path entirely — **provider layer implemented 11 Nov 2026** (SMTP/Africa's Talking/webhook via env; dev outbox only outside production, fails closed in production); open until credentials configured + delivery verified | Product/Technical |
| F-05 | **Medium** | Per-endpoint capability enforcement incomplete (service-layer only for roles) | Nest guards per capability matrix — **implemented 11 Nov 2026** (`CapabilityGuard` + `@RequireCapability` on every non-public route) | Technical Lead |
| F-06 | **Medium** | No external audit-chain anchoring (SEC-AUD-03) | Anchor digests with independent party (SEC-OI-5) | Security Lead |
| F-07 | **Low** | SWC/Next pin (15.1.6) needed on this Windows machine; monitor upstream | Re-test on upgrade (DEC-003 note) | Technical Lead |

No finding is hidden: F-01/F-02 each independently block any live election, consistent with gates G2/G4.

## 4. Phase 4 Exit Criteria — Status

| Criterion | Status |
|---|---|
| No unresolved critical/high findings | **Not met:** F-01…F-04 open (F-01/F-02 critical) |
| Performance/resilience targets met by measurement | **Not met as gate evidence:** local numbers only; staging k6 + failover drills outstanding (needs DEC-002 environment) |
| Independent assessment findings addressed/accepted | **Not started:** DEC-007 assessor not engaged; DEC-006 reviewer not engaged |

**Conclusion:** Phase 4 internal work is done; the phase cannot exit until persistence lands (F-01), the reviewed protocol replaces mock custody (F-02), endpoint auth is enforced (F-03), and external reviewers (DEC-006/007) report. Phase 5 (pilot readiness) must not begin live preparations until F-01…F-04 close.

## Document Control

| Field | Value |
|---|---|
| Document | Phase 4 Hardening Report |
| ID | EMP-PHASE4-001 |
| Version | 0.1 |
| Status | Internal complete; exit blocked |
| Owner | Security Lead |
| Change control | Version-controlled updates |

**End of document.**
