# Election-Day Runbook and Incident Response Plan

**Document ID:** EMP-RUN-001\
**Version:** 0.1\
**Status:** Draft ready for rehearsal — not yet rehearsed with named staff\
**Document Type:** Operational Runbook (SEC-INC-01…08, EMP-LIFE-001 §7)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-LIFE-001 §§5–9, EMP-SCALE-001 §§6/8, EMP-SEC-001 §14\
**Owner:** Election Operations Lead

---

## 1. Purpose

One document the command team works from on election day: who decides, what happens hour by hour, and exactly what to do when something breaks. Rehearse it in the dress rehearsal (`DRESS_REHEARSAL_PLAN.md`) before any live use. Blanks are filled per election at the READY gate.

## 2. Command Structure and Contacts (fill at READY — readiness check #10)

| Role | Name | Phone | Decides |
|---|---|---|---|
| Committee chair | | | Election decisions: open confirmation, suspension (T6), extension, close confirmation, tally authorization |
| Election Operations Lead | | | Field/station operations, station fallback or relocation, voter support escalation |
| Technical Lead | | | Platform health, scaling, emergency change (with Security Lead), recovery |
| Security Lead | | | Security incidents, suspension recommendation on integrity grounds, claims discipline |

Command channel (primary / backup): ______ / ______. On-call roster: ______.

## 3. Timeline (EMP-LIFE-001 §7)

| When | Action | Owner |
|---|---|---|
| T-60 min | Health check: `GET /health` OK; participation endpoint responding; stations powered, connected, officer logins tested | Technical + Ops |
| T-30 min | Confirm readiness checklist signed; confirm change freeze; confirm OTP provider status (post F-04) | Ops |
| At open | Confirm automatic/manual OPEN; watch participation counts rise; first station session completed | Chair + Ops |
| During | §4 monitoring loop every 15 min; support queue worked continuously | All |
| Decision points | Suspension/extension/escalation per §5–§6 — chair decides, record in §8 log | Chair |
| At close | Confirm CLOSE; no in-flight sessions accepted after close (system rejects); run reconciliation (consumed entitlements = accepted ballots) | Technical |
| After close | Preserve evidence; committee briefing; tally scheduling per EMP-LIFE-001 §5.8; no provisional numbers leave the room before certification | Chair |

## 4. Monitoring Loop (aggregates only — never selections, FR-MON-002)

Every 15 minutes record: ballots cast / turnout %, error rate, submit latency feel, station status, support tickets opened/closed. Alert thresholds (tune after staging k6): error rate > 1% for 10 min, participation stalls unexpectedly, OTP complaints spike, any audit verification failure. Telemetry must never contain ballot content (SEC-BAL-04).

## 5. Incident Response (SEC-INC-01…08)

| Severity | Examples | Response |
|---|---|---|
| S1 Integrity | Suspected double voting, audit chain break, tally mismatch, key concern | Stop and escalate immediately to Security Lead + Technical Lead + Chair; Chair decides suspension (T6); preserve evidence, expose no ballot content |
| S2 Availability | Platform down or severely degraded during window | Technical Lead restores (RTO target set with committee, EMP-SCALE §6); Chair decides extension per election rules the moment downtime is understood |
| S3 Voter support | OTP not arriving, voter confusion, station device fault | Support scripts (`VOTER_COMMUNICATIONS_PACK.md` §4); station fallback/relocation by Ops + Chair; **never** handle by viewing a ballot |
| S4 Security suspicion | Credential stuffing spike, officer misconduct report | Security Lead leads; rate limits already per-account; officer removed from duty pending review if ballot privacy is implicated |

Rules that never bend: nobody views or asks a voter their selections; every decision (suspend, extend, relocate, emergency change) is written in §8 with time, decider, and reason; public messages use only approved templates (`VOTER_COMMUNICATIONS_PACK.md` §5) and are approved by the Chair (SEC-INC-08).

## 6. Suspension and Extension (EMP-LIFE-001 §5.6)

Suspension is a Chair decision (with Ops; Security Lead for security incidents), except the platform pauses itself only on a defined critical integrity condition with immediate alert. On suspension: announce via approved template, record votes-so-far participation count, start the incident clock. On resumption (T7): cause-resolved note required. Extension: only if election rules allow; new end time, reason, and voter notification recorded before the original close.

## 7. Change Freeze and Recovery

Freeze runs from READY to PUBLISHED: no deploys, config changes, or register edits except emergency changes approved by Technical + Security Leads and audited (EMP-LIFE-001 §8). Recovery today is limited by **F-01**: on the mock store, an API restart loses accepted ballots — until the Postgres implementation and restore drill pass (readiness #12), an S2 restart during a live window is an election-ending event. This runbook does not pretend otherwise; that is why F-01 blocks any live election.

## 8. Election-Day Decision Log (append during the day)

| Time | Event / decision | Decided by | Reason | Voters informed? |
|---|---|---|---|---|
| | | | | |

## Document Control

| Field | Value |
|---|---|
| Document | Election-Day Runbook |
| ID | EMP-RUN-001 |
| Version | 0.1 |
| Status | Draft for rehearsal |
| Owner | Election Operations Lead |
| Change control | Update after every rehearsal and election |

**End of document.**
