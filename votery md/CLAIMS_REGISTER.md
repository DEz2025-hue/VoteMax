# Claims Register (SEC-ASR-06)

**Document ID:** EMP-CLAIMS-001\
**Version:** 0.1\
**Status:** Living document — every public claim must appear here with evidence\
**Document Type:** Claims and Limitations Register\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-SEC-001 §13 (SEC-ASR-06), EMP-FOUND-001 §10\
**Owner:** Security Lead

> Rule: the platform must not claim certification, independent approval, or any property not backed by evidence. Reviewers' limiting findings enter this register verbatim when received.

## 1. Claims We May Make Today (with evidence)

| # | Claim | Evidence |
|---|---|---|
| C-1 | Ballot records contain no voter, session, or entitlement identifier | `phase3.spec.ts` secrecy test; `platform.service.ts` BallotRecord shape |
| C-2 | One entitlement yields at most one accepted ballot, including concurrent retries | Burst + idempotency tests (`phase3.spec.ts`); local load run 600/600, 0 duplicates |
| C-3 | Audit records are tamper-evident (hash chain) and contain no selections | `audit-chain.spec.ts`; chain verified in tests and HTTP smoke |
| C-4 | Role separation rules SoD-1/2/3/7/8 are enforced and denials audited | `auth.spec.ts`, `platform.spec.ts`, `security.spec.ts` |
| C-5 | Privileged accounts require TOTP MFA at login | `platform.spec.ts` MFA test; RFC 6238 vector test |
| C-6 | Results are published only after multi-party tally, independent recomputation, and certification | End-to-end tests + HTTP smoke to PUBLISHED |

## 2. Claims We Must NOT Make (until evidence exists)

| # | Forbidden claim | What is missing |
|---|---|---|
| N-1 | “Independently certified / security approved” | DEC-007 assessment has not happened; no reviewer engaged |
| N-2 | “Ballots survive server failure” | Failure drill F-01: accepted ballot lost on API restart (in-memory store) |
| N-3 | “Threshold / split-key ballot secrecy” | DEC-006 open; implementation uses a single service-held key (Option C, mock) |
| N-4 | “Supports 200 concurrent / 400-session load” as a production capacity | Local dev-machine run only (600 voters, p95 99 ms in-memory); gate evidence needs k6 on production-like infrastructure (EMP-SCALE §7) |
| N-5 | “Coercion-free / vote-selling-proof remote voting” | Impossible for remote voting; stated limitation, never claimed (SEC §6) |
| N-6 | “Your device is safe” | Voter-device compromise is outside platform control (SEC §6) |
| N-7 | “WCAG 2.2 AA conformant” | Internal checklist review only; no external accessibility audit yet |

## 3. Stated Limitations (must appear in voter/committee materials)

1. A voter can share their own OTP code; the platform cannot prevent voluntary credential sharing.
2. Remote voting cannot prevent coercion or observation of the voter (“shoulder surfing”).
3. Secrecy does not hold against an adversary controlling both the platform and all tally approvers/custodians.
4. Small-turnout races carry timing-correlation risk that requires DEC-006 analysis (ARCH-R1).

## Document Control

| Field | Value |
|---|---|
| Document | Claims Register |
| ID | EMP-CLAIMS-001 |
| Version | 0.1 |
| Status | Living |
| Owner | Security Lead |
| Change control | Update whenever a claim, limitation, or evidence changes |

**End of document.**
