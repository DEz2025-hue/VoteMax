# Election Lifecycle

**Document ID:** EMP-LIFE-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Process and State Definition\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001, EMP-STAKE-001\
**Owner:** Election Operations Lead

---

## 1. Purpose

This document defines the stages an election passes through in EMP, the state machine that governs transitions, who may authorize each transition, what must be true before it, and how exceptions are handled. It is the operational and behavioral reference for election management.

The system enforces the lifecycle. Invalid transitions are rejected, and every transition is audited.

## 2. Lifecycle Overview

```
 DRAFT -> CONFIGURED -> REGISTRATION -> REGISTER_FROZEN -> READY
                                                             |
                                                             v
 ARCHIVED <- PUBLISHED <- CERTIFIED <- VERIFIED <- TALLIED <- CLOSED <- OPEN
                                         |
                                         v
                                     RECOUNT (loop back to TALLIED)

 Side states:  SUSPENDED (from OPEN)   CANCELLED (before OPEN only)
```

## 3. States

| State | Meaning | Key properties |
|---|---|---|
| **DRAFT** | Election created; basic details only | Fully editable by election administrator |
| **CONFIGURED** | Positions, candidates, rules, voting window, and stations defined | Awaiting register activity; still editable under change control |
| **REGISTRATION** | Voter register is being imported, verified, and corrected | Registrars active; entitlements generated as voters become eligible |
| **REGISTER_FROZEN** | Register locked for this election | Changes only through exception procedure |
| **READY** | Configuration and register approved; election awaits opening | Configuration immutable; readiness checks passed |
| **OPEN** | Voting window active | Ballots accepted via online and assisted channels |
| **SUSPENDED** | Voting temporarily paused by authorized decision | No ballots accepted; resume or close by decision |
| **CLOSED** | Voting ended; no further ballots accepted | Ballot store sealed |
| **TALLIED** | Authorized tally computed | Provisional results and evidence generated |
| **VERIFIED** | Independent verification completed | Evidence checked by independent parties |
| **RECOUNT** | Recount in progress under authorization | Returns to TALLIED when complete |
| **CERTIFIED** | Results formally certified | Certification record created |
| **PUBLISHED** | Results released with report | Public or stakeholder-visible per rules |
| **ARCHIVED** | Election record retained under retention policy | Read-only |
| **CANCELLED** | Election cancelled before opening | Retained for record; no ballots exist |

## 4. Transition Table

| # | From | To | Authorized by | Preconditions | Audited data |
|---|---|---|---|---|---|
| T1 | DRAFT | CONFIGURED | Election administrator, approved by Committee chair | At least one position; candidates defined; voting window valid; rules complete | Config snapshot hash |
| T2 | CONFIGURED | REGISTRATION | Election administrator | Registrar roles assigned; verification method configured | Roles, method |
| T3 | REGISTRATION | REGISTER_FROZEN | Registrar executes; Committee chair approves | No unresolved duplicate records; import errors cleared or accepted; eligible count recorded | Register hash, counts |
| T4 | REGISTER_FROZEN | READY | Election administrator executes; Committee chair approves | Readiness checklist passed (section 6); stations assigned; roles verified; SoD rules satisfied | Checklist result, config hash |
| T5 | READY | OPEN | Automatic at scheduled time, or manual start by Election administrator with Committee chair approval | Within the window; keys prepared; monitoring healthy; change freeze in effect | Open timestamp, system state |
| T6 | OPEN | SUSPENDED | Committee chair with Election operations lead (and Security Lead for security incidents) | Documented reason | Reason, approvers, time |
| T7 | SUSPENDED | OPEN | Committee chair, with confirmation that the cause is resolved | Incident or issue resolution recorded; any window extension decided per rules | Resolution, extension |
| T8 | OPEN or SUSPENDED | CLOSED | Automatic at scheduled end (including approved extensions), or manual close by Election administrator with Committee chair approval | Closing time reached or authorized | Close timestamp, accepted ballot count |
| T9 | CLOSED | TALLIED | Tally authorized by Committee chair; executed by Election administrator with key custodians | Ballot store sealed; accepted ballot count reconciled with consumed entitlements; custodian quorum present | Tally run ID, inputs hash, approvers |
| T10 | TALLIED | VERIFIED | Independent auditor completes verification; Committee chair acknowledges | Evidence package produced; verification success recorded | Verification report |
| T11 | TALLIED or VERIFIED | RECOUNT | Committee chair on documented grounds; observer or candidate request may trigger review | Recount rules satisfied | Grounds, approvers |
| T12 | RECOUNT | TALLIED | Same tally authorization as T9 | Recount completed | Comparison to previous tally |
| T13 | VERIFIED | CERTIFIED | Committee chair certifies; second independent approver per organization rules | No unresolved integrity, reconciliation, or dispute items (section 9) | Certification record |
| T14 | CERTIFIED | PUBLISHED | Election administrator executes; Committee chair approves | Report generated and reviewed | Published report hash |
| T15 | PUBLISHED | ARCHIVED | Organization owner or Election administrator per retention rules | Retention archive created | Archive manifest |
| T16 | Any state before OPEN | CANCELLED | Committee chair with Organization owner | Documented reason | Reason, approvers |

Transitions not listed are prohibited. An election that has reached OPEN **cannot be cancelled**; it must be closed, and any results handling is governed by organization rules and incident procedures.

## 5. Stage Details

### 5.1 Draft and Configuration (DRAFT, CONFIGURED)

**Activities**
- Create the election, define positions and seat counts, set choices-per-voter rules and ballot format.
- Add candidates, define ballot ordering policy, set the voting window and time zone.
- Define result rules, including tie handling, abstention, and minimum participation (if any).
- Define polling stations and activation windows.
- Publish election rules in human-readable form.

**Controls**
- Changes are versioned; each change is audited.
- Candidate eligibility is checked per organization rules.
- Conflict-of-interest declarations collected for all privileged roles.

### 5.2 Registration (REGISTRATION)

**Activities**
- Import the voter register; review validation errors.
- Detect and resolve duplicates and conflicts; record the reason for each decision.
- Verify eligibility per the configured method (DEC-004).
- Handle eligibility disputes and voter queries.
- Generate entitlements for eligible voters.

**Controls**
- Every status change has a recorded reason and actor.
- Entitlement counts reconcile to eligible voter counts at all times.
- Publish or make available the register for review per election rules, without exposing unnecessary personal data.

### 5.3 Register Freeze (REGISTER_FROZEN)

**Activities**
- Registrar and Committee chair confirm final counts.
- Register hash and counts are recorded as evidence.
- A claims-and-disputes window may be run before readiness.

**Exception procedure for post-freeze changes**
1. Request recorded with reason and evidence.
2. Approval by Committee chair and a second authorized approver.
3. Change applied as a new, audited record (no overwriting).
4. Updated register hash and counts recorded.
5. Reported in the post-election evidence.

### 5.4 Readiness (READY)

The readiness checklist (section 6) must pass. Configuration is **immutable** from this point; only the exception procedure applies.

### 5.5 Voting (OPEN)

**Online voting**
1. Voter authenticates per the election's verification method.
2. System checks election state, window, eligibility, and entitlement.
3. Voter receives a ballot session and the ballot.
4. Voter reviews and confirms selections.
5. System accepts the ballot atomically (see `SYSTEM_ARCHITECTURE.md` section 8).
6. Voter receives acceptance confirmation without selections.
7. Voter may check submission status; retries are safe.

**Assisted voting (connected stations)**
1. Station officer authenticates and the station session is active in its window.
2. Voter presents identification per the election procedure.
3. Officer verifies identity and eligibility via the station interface and starts a voter session.
4. The ballot is shown **to the voter only**. The officer may help the voter access the system and operate the device but does not see, influence, or alter selections.
5. Voter submits; the session clears.
6. Officer records the outcome (completed, abandoned, issue) without ballot content.
7. Support requests and accessibility assistance follow the station procedure.

**Monitoring during OPEN**
- Aggregate participation, station status, and operational and security alerts are visible to authorized roles.
- No view shows selections or per-voter choices.
- Change freeze is in force; emergency changes need Security Lead and Technical Lead approval and are audited.

**Offline channel.** Controlled offline voting is disabled for the first live election and is not part of this lifecycle until approved (DEC-008). When approved, an additional reconciliation stage will sit between CLOSED and TALLIED (section 9.3).

### 5.6 Suspension (SUSPENDED)

**Triggers** include suspected compromise, major outage, or safety or legal concerns.

**Rules**
- Suspension is a decision, not an automatic outcome, except where the platform pauses itself on a defined critical integrity condition and immediately alerts the committee chair and Security Lead.
- Time lost to suspension may justify an extension of the voting window if the election rules allow; the decision is recorded.
- Voters are informed through approved channels.

### 5.7 Close (CLOSED)

**Activities**
- Voting stops for all channels; in-progress sessions after the close time are rejected.
- Ballot store is sealed.
- Accepted ballot count is reconciled with consumed entitlements and participation records.
- Station activity reports are collected.

**Controls**
- Reconciliation differences block progress until explained and approved.

### 5.8 Tally (TALLIED)

**Activities**
- Committee chair authorizes tally.
- Key custodians convene to enable decryption per the reviewed protocol.
- Tally executes under multi-party control.
- Evidence package produced: counts, proofs or hashes per the protocol, audit digest.

**Controls**
- No individual can run a tally alone (SoD-4, SoD-5).
- Provisional results are visible only to authorized roles until certification.

### 5.9 Verification (VERIFIED)

**Activities**
- Independent auditor verifies tally evidence and audit chain.
- Observers may witness within approved scope.
- Discrepancies recorded and resolved or escalated.

### 5.10 Recount (RECOUNT)

**Grounds** are defined by organization rules (for example narrow margin, credible irregularity). A recount re-runs the tally under the same authorization and compares the results with the previous run. Differences require investigation before certification.

### 5.11 Certification (CERTIFIED)

**Activities**
- Committee chair and the second approver review the verified results, reconciliation status, and open disputes.
- Certification record is created with the evidence references.

**Controls**
- Certification is blocked if any item in section 9 remains unresolved.

### 5.12 Publication (PUBLISHED)

- Structured report generated (PDF and machine-readable).
- Report contents: election details, eligible and participating counts (aggregate), results by position, rules applied, verification and certification references, known incidents and exceptions.
- Release occurs through approved channels; the certification is the authority for the numbers.

### 5.13 Archive (ARCHIVED)

- Retain election record: configuration, rules, register hash (and register per retention rules), ballot store (encrypted) per retention policy, audit chain, evidence, reports.
- Access remains read-only and role-scoped.
- Disposal follows the retention schedule (Q-PRD-005).

## 6. Readiness Checklist (Gate to READY)

| # | Check | Owner |
|---|---|---|
| 1 | Election rules published and approved by the committee | Committee chair |
| 2 | Positions, candidates, ballot order policy final | Election administrator |
| 3 | Voter register frozen; counts reconciled; hash recorded | Registrar |
| 4 | Entitlements match eligible voters | Registrar and Technical Lead |
| 5 | Roles assigned; SoD rules satisfied; MFA verified | Security Lead |
| 6 | Key custody ceremony completed; custodians confirmed | Security Lead |
| 7 | Stations assigned; officers trained; devices checked | Election operations lead |
| 8 | Load and failover rehearsal passed on production-like environment | Technical Lead |
| 9 | Monitoring and alerts active; on-call roster confirmed | Technical Lead |
| 10 | Incident response contacts and decision authority confirmed | Election operations lead |
| 11 | Voter communications sent | Election administrator |
| 12 | Backups verified; recovery procedure available | Technical Lead |
| 13 | Release freeze in effect; production version recorded | Technical Lead |
| 14 | Final authorization (G8) recorded for the pilot | Committee |

## 7. Election-Day Operations

| Time | Activity |
|---|---|
| Before open | Final checks; health verification; stations powered and connected; command channel open |
| At open | Confirm automatic or manual start; verify first accepted ballots in monitoring (counts only) |
| During | Monitor participation, errors, latency, station status; manage support; respond to alerts per runbook |
| Decision points | Suspension, extension, escalation as per section 5.6 |
| At close | Confirm closure; stop sessions; seal; reconcile |
| After close | Preserve evidence; brief committee; proceed to tally per schedule |

A command structure with named decision-makers is defined before the election: Committee chair (election decisions), Election operations lead (field operations), Technical Lead (systems), Security Lead (security incidents).

## 8. Exceptions

Exceptions are rare, documented, and reviewed. Types:

| Exception | Authority | Required record |
|---|---|---|
| Post-freeze register change | Committee chair plus second approver | Reason, evidence, new hash |
| Window extension | Committee chair per election rules | Reason, new end time, communication |
| Station fallback or relocation | Election operations lead and Committee chair | Station, reason, time |
| Emergency platform change during freeze | Technical Lead and Security Lead | Change, justification, rollback |
| Manual intervention in recorded data | Not permitted outside defined procedures | Any attempt is an incident |

## 9. Certification Blockers and Reconciliation

### 9.1 Blockers

Certification cannot occur while any of the following is unresolved:

1. Mismatch between accepted ballots and consumed entitlements.
2. Failed or incomplete independent verification.
3. Open integrity, security, or eligibility incident affecting results.
4. Unresolved disputes the organization rules treat as blocking.
5. Unresolved synchronization or eligibility conflicts from offline voting, when offline voting is later approved.
6. Failure of the audit chain verification.

### 9.2 Reconciliation steps

1. Compare counts: eligible, entitlements issued, entitlements consumed, accepted ballots, station reports.
2. Investigate differences; document findings.
3. Resolve through approved procedures or escalate.
4. Record the final reconciliation statement for the certification record.

### 9.3 Offline reconciliation (future, gated)

When offline voting is later approved, a RECONCILING state is introduced between CLOSED and TALLIED. Station packages are synchronized, duplicate-participation conflicts are identified, each conflict is resolved under a formal procedure, and unresolved conflicts prevent certification.

## 10. Disputes and Appeals

| Stage | Dispute type | Handling |
|---|---|---|
| Registration | Voter eligibility | Registrar review, escalate to Committee |
| Pre-open | Candidate eligibility or rules | Committee decision |
| During OPEN | Voter reports problem | Support workflow; station escalation |
| After close | Process complaints | Committee review; evidence from audit |
| After tally | Result challenge | Recount procedure and certification review |

The organization election committee holds authority over disputes. The platform provides evidence, never the verdict.

## 11. Role Responsibilities Summary by Stage

| Stage | Primary actors | Supporting |
|---|---|---|
| Configuration | Election administrator | Committee chair |
| Registration | Voter registrar | Election administrator |
| Freeze and readiness | Committee chair | Registrar, Technical Lead, Security Lead |
| Voting | Voters, station officers | Election operations lead, Technical Lead |
| Close and tally | Committee chair, key custodians, Election administrator | Security Lead |
| Verification | Independent auditor | Observers |
| Certification and publication | Committee chair | Election administrator |
| Archive | Organization owner | Election administrator |

## 12. Open Questions

| ID | Question |
|---|---|
| Q-LIFE-001 | What recount triggers and thresholds will the pilot committee adopt? |
| Q-LIFE-002 | Is a second certification approver required by the pilot organization's constitution? |
| Q-LIFE-003 | Will the register be inspectable by voters before the freeze, and in what form? |
| Q-LIFE-004 | What are the rules for extending the voting window after an outage? |
| Q-LIFE-005 | What minimum participation, if any, is required for a valid result? |

## Document Control

| Field | Value |
|---|---|
| Document | Election Lifecycle |
| ID | EMP-LIFE-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Election Operations Lead |
| Review frequency | At major project milestones and after each election |
| Change control | Version-controlled updates |

**End of document.**
