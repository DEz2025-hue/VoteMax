# Voter Communications and Help Pack

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-COMMS-001\
**Version:** 0.1\
**Status:** Draft ready for committee approval — sending blocked by F-04 (no provider)\
**Document Type:** Voter Communications Pack (FR-SUP-001…004, SEC-INC-08)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-PRD-001 §4.12, DEC-004_VOTER_VERIFICATION_OPTIONS.md, ELECTION_DAY_RUNBOOK.md\
**Owner:** Election administrator

> Plain language, one idea per message, no security overclaiming. Every template below respects the claims register: we never promise coercion-proof voting, device safety, or certification we do not have.

## 1. Core Voter Guide (help page text — FR-SUP-004)

**How to vote.** 1) Open the voting page. 2) Enter your member ID. 3) We send a 6-digit code to your registered email or phone — it lasts 10 minutes and works once. 4) Choose your candidates, check the review screen, submit. You will see a confirmation reference. **That reference does not show your choices, and nobody can use it to see how you voted.**

**Check you are registered.** If your code does not arrive or your ID is not accepted, contact the election help desk (§4) *before* the voting window — not during the last hour.

**Your privacy.** The system records *that* you voted separately from *what* you voted. No candidate, officer, or administrator can see your selections.

**An honest limit.** Voting on your own phone or computer means someone could look over your shoulder or pressure you. We cannot prevent that. If it is a concern, vote at an assisted voting station instead, where you mark your ballot in private.

**Already voted?** You can check that your ballot was accepted on the status page with your member ID. It confirms acceptance only — never your selections.

## 2. Message Schedule (per election)

| When | Message | Channel | Template |
|---|---|---|---|
| Registration open | “You are on the voter list for [election]. Check your details by [date].” | Email/SMS | §3.1 |
| 2 days before | “Voting for [election] opens [date, time] and closes [time]. Here's how (link).” | Email/SMS | §3.2 |
| At open | “Voting is open until [time]. Vote now (link).” | Email/SMS | §3.3 |
| Mid-window | “Voting closes at [time]. [n]% of voters have voted.” (aggregate only) | Email/SMS | §3.3 |
| Incident: pause | §5.1 template (Chair approval required) | All channels + stations | §5 |
| Results published | “Results for [election] are published: (link).” (only after certification) | Email/SMS | §3.4 |

No message ever contains selections, full credentials, or anything reusable for impersonation (FR-SUP-002, SEC-VOT-09). OTP codes travel only in the single-purpose OTP message.

## 3. Templates

**3.1 Registration.** “Hello [first name], you are registered to vote in [election] at [organization]. If your details look wrong, contact [help desk] before [date].”

**3.2 Before voting.** “Voting in [election] opens [date] at [time] and closes at [time]. You will need your member ID and access to your email/phone for a one-time code. How to vote: [link].”

**3.3 Open/closing.** “Voting is now open for [election] until [time]: [link].” / “Last call: [election] voting closes at [time]: [link].”

**3.4 Results.** “The certified results of [election] are published here: [link]. Thank you for voting.” (Sent only in PUBLISHED state.)

## 4. Help Desk Scripts (FR-SUP-003 — help without ever seeing a ballot)

| Voter says | Do | Never |
|---|---|---|
| “My code didn't arrive” | Confirm member ID spelling; check register contact on file; resend; if channels fail, direct to an assisted station | Ask them to read a code to you and type it in for them |
| “It says I've already voted” | Check submission status; if they dispute it, open a registrar case and escalate to the committee with the audit record | Tell anyone what the recorded ballot contains (you cannot see it — say so) |
| “The page won't load” | Try the station network/another device; check the incident board; log the report with time and station | Promise an extension — that is the committee's decision |
| “Someone is pressuring me” | Offer the assisted station; give the committee contact; do not record selections or intervene in the choice | Repeat or report their intended choices to anyone |

## 5. Incident Templates (SEC-INC-08 — accurate, Chair-approved, no speculation)

**5.1 Pause.** “Voting in [election] is temporarily paused while we resolve a technical issue. Ballots already accepted are recorded. We will announce the new closing time. — Election Committee.”

**5.2 Extension.** “Voting in [election] will now close at [new time] (extended from [old time]) because of [brief factual reason]. If you have not voted: [link].”

**5.3 Resumption/results delay.** Only factual statements about process and timing; never publish numbers before certification.

## Document Control

| Field | Value |
|---|---|
| Document | Voter Communications Pack |
| ID | EMP-COMMS-001 |
| Version | 0.1 |
| Status | Draft for committee approval |
| Owner | Election administrator |
| Change control | Committee approval required for template changes |

**End of document.**
