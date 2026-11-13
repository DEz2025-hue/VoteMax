# Training and Onboarding — Station Officers, Observers, Auditors

**Document ID:** EMP-TRAIN-001\
**Version:** 0.1\
**Status:** Ready to deliver once officers/observers are named\
**Document Type:** Training and Accreditation Pack (SEC-PER-01/02, EMP-ROAD-001 Phase 5)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-STAKE-001 §§4/9, EMP-LIFE-001 §5.5, EMP-SEC-001 §16\
**Owner:** Election Operations Lead

---

## Part A — Polling Station Officer Training

**Audience:** station officers (readiness check #7). **Format:** half-day, in person, with hands-on practice on test stations using the mock election. No trainee passes without the practical assessment in §A.4.

### A.1 Curriculum

| Module | Content | Source |
|---|---|---|
| 1. Your role and its limits | You help voters *reach* the ballot; you never see, influence, or alter a selection (FR-AST-005). The system enforces this; your conduct must match it | EMP-STAKE-001 §4.8 |
| 2. Station operation | Opening checks, officer login (assigned station only), starting a voter session, session timeout/clearing, closing counts | API station flow; EMP-LIFE-001 §5.5 |
| 3. Identity check | Verifying the voter's student ID against the station procedure; starting the session; stepping away for private marking | DEC-004 assisted fallback |
| 4. Accessibility assistance | Helping a voter operate the device without directing choices; offering, never assuming, assistance | NFR-ACC-004 |
| 5. Problems and escalation | Voter not on register, OTP issues, device/connectivity faults: support scripts, when to escalate to Ops, relocation support | Runbook §5 (S3) |
| 6. Privacy and conduct | No phones/cameras at the ballot screen, no discussing any voter's participation beyond operations, incident reporting without fear of penalty (SEC-PER-05) | SEC-PER-02/05 |
| 7. Election-day rehearsal | Full practice: 10 test voters end-to-end (use the dress-rehearsal script), including one problem voter and one device failure | `DRESS_REHEARSAL_PLAN.md` |

### A.2 Conduct Commitment (signed by every officer — SEC-PER-02)

> I will not view, record, influence, or alter any voter's ballot selections. I will not disclose how any person voted or seek to learn it. I will operate only at my assigned station, report problems immediately, and follow the election-day runbook. Name / signature / date: ______

### A.3 Attendance Record (G5 evidence)

| Officer name | Station | Modules 1–7 done | Practical pass | Commitment signed | Trainer |
|---|---|---|---|---|---|
| | | ☐ | ☐ | ☐ | |

### A.4 Practical Assessment (pass/fail, trainer initials each)

Start a session for a test voter ☐ · Recover from a “voter not found” ☐ · Clear an abandoned session ☐ · Escalate a device fault using the runbook ☐ · State the privacy rule unprompted ☐.

## Part B — Observer and Independent Auditor Onboarding

**Audience:** accredited observers and the independent auditor (readiness input to G2/G7). Observers/auditors are read-only by role design (SoD-8).

### B.1 Accreditation Steps

1. Committee accredits by name and scope (Q-STK-003): election, dates, what may be viewed.
2. Platform account created with `observer` or `auditor` role only; SoD-8 check must pass (no modifying role in this election).
3. Briefing (1 hour): lifecycle and what each state means; aggregate-only monitoring; tally evidence package contents; how verification and audit-chain checking work; certification blockers (EMP-LIFE-001 §9).
4. Access test before OPEN: observer sees participation aggregates and published material only; auditor additionally sees audit records and tally evidence. Any wider visibility is a defect — report and stop.
5. Rules: no ballot content exists to observe; no voter-identifiable participation data beyond approved scope; findings go to the committee in writing; public statements follow the claims register (`CLAIMS_REGISTER.md`).

### B.2 Accreditation Record (G5/G7 evidence)

| Name | Role | Scope approved by (Chair) | Access tested | Briefing done | Date |
|---|---|---|---|---|---|
| | observer / auditor | | ☐ | ☐ | |

### B.3 Auditor Evidence Pack (issued at TALLIED)

Published rules and configuration hash · register hash and counts · accepted-ballot count reconciliation · tally evidence root + tally hash (`GET /report` + tally run record) · audit chain export with verification tooling (`GET /audit`, chain verification) · readiness checklist and decision log. Verification is independent recomputation (Phase 3 `verifyTally` demonstrates the method on the mock; production evidence follows the DEC-006 protocol).

## Document Control

| Field | Value |
|---|---|
| Document | Training and Onboarding Pack |
| ID | EMP-TRAIN-001 |
| Version | 0.1 |
| Status | Ready to deliver |
| Owner | Election Operations Lead |
| Change control | Update after each training delivery |

**End of document.**
