# Dress Rehearsal Plan and Report

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-REH-001\
**Version:** 0.1\
**Status:** Plan ready — production-like rehearsal NOT run; local mock pre-rehearsal recorded in §5\
**Document Type:** Rehearsal Plan (Gate G7 evidence when run as specified)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-SCOPE-001 (G7), EMP-LIFE-001 §§6–7, EMP-RUN-001, EMP-SCALE-001 §7\
**Owner:** Election Operations Lead (with Technical Lead)

---

## 1. Purpose

Prove — with the real procedures, real roles, and production-like infrastructure — that the pilot election can be run, recovered, tallied, and certified before anyone asks voters to trust it (G7). A rehearsal on the developer mock is a *pre-rehearsal* and is never G7 evidence.

## 2. Entry Criteria (all required before scheduling)

Named command team (runbook §2 filled) · officers trained (`TRAINING_AND_ONBOARDING.md` records complete) · staging in the DEC-002 region with production-like data volumes (10,000-row synthetic register) · F-01 and F-03 closed (durable ballots, enforced session auth) · F-04 closed or a station-only rehearsal scope declared · monitoring and decision log in place.

While DEC-006/F-02 stands, the rehearsal tallies with mock custody and the report must say so; G7 can be *practiced* but the Security gate G2 still blocks G8.

## 3. Rehearsal Script (one day, timed)

| Time | Scenario | Pass condition |
|---|---|---|
| 09:00 | Setup: create rehearsal election, import 10,000 synthetic voters, configure 2 positions, freeze | Counts reconcile; register hash recorded; freeze blocks late edits |
| 09:45 | Officer station drill: 2 stations, 20 test voters incl. 2 problem cases | Officers pass unaided; sessions clear; no privacy breach observed |
| 10:30 | Open voting (compressed 2-hour window); simulated surge at open | Participation dashboard (aggregates only) tracks; no selections visible anywhere |
| 11:00 | Incident inject 1: kill one API instance mid-voting | Voting continues or recovers inside RTO; **zero accepted ballots lost** (F-01 retest) |
| 11:30 | Incident inject 2: OTP provider outage simulation | Station fallback used; voter messaging per template within 15 min |
| 12:00 | Incident inject 3: Chair orders 30-min suspension and extension | Lifecycle follows T6/T7; decision log complete; voters notified |
| 12:30 | Close; reconciliation | Consumed entitlements = accepted ballots; differences explained in writing |
| 13:00 | Tally under multi-party approval; independent recomputation | Hashes match; SoD violations in the script (executor tries to self-authorize) are rejected |
| 14:00 | Recount request injected; recount executed | Recount reproduces the tally hash or differences are investigated |
| 14:30 | Certification review with one planted blocker (unresolved dispute) | Certification correctly refused until blocker cleared |
| 15:00 | Publish structured report; observer/auditor walkthrough | Report matches tally; auditor verifies chain and evidence unaided |
| 15:30 | Debrief; defect log triage; go/no-go recommendation to committee | Every defect has severity + owner; criticals block G8 |

## 4. Report Template (file as G7 evidence)

Rehearsal date/environment/version: ______ · Participants (name/role): ______ · Scenario results (pass/fail per §3 row): ______ · Defects (ID, severity, owner, due): ______ · Timings (recovery, tally, verification): ______ · Recommendation (ready / not ready, signed Ops + Technical Leads): ______

## 5. Pre-Rehearsal Record (local mock — preparation only, 11 Nov 2026)

What has actually been exercised so far, all on the development mock with synthetic voters: full lifecycle to PUBLISHED over HTTP; 600 voters at 200 concurrent sessions (600/600 accepted, no duplicates); duplicate-burst, idempotency, assisted-station, tally/verification/recount, and certification-blocker behaviours in the automated suite (45 tests). Known rehearsal failures already on record: API kill loses accepted ballots (F-01) and single-key custody (F-02) — both are scheduled injects above precisely because they must pass before G8.

## Document Control

| Field | Value |
|---|---|
| Document | Dress Rehearsal Plan and Report |
| ID | EMP-REH-001 |
| Version | 0.1 |
| Status | Plan ready; rehearsal not run |
| Owner | Election Operations Lead |
| Change control | New version after each rehearsal |

**End of document.**
