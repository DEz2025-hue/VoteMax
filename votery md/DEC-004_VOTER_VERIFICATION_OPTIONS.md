# DEC-004 — Voter Verification Method (Options Paper + Recommendation)

**Document ID:** EMP-DEC004-001\
**Version:** 0.1\
**Status:** Recommendation — pending election committee approval\
**Document Type:** Options Paper and Decision Record\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §19, EMP-PRD-001 FR-VOT-006, EMP-STAKE-001 §8, EMP-SEC-001 SEC-VOT-09\
**Owner:** Product Owner (with Security Lead)

---

## 1. Decision Required

Choose how a pilot voter (5,000–10,000 members) proves they are the person on the register before receiving a ballot. Confirmed direction (11 Nov 2026): **Member ID + one-time code**. This paper records why, the rejected alternatives, and the controls that must accompany the choice.

Requirements the method must meet (EMP-STAKE-001 §8): bind voter to one eligible record; resist impersonation/credential sharing within reasonable limits; work on limited connectivity and low-end devices; allow assisted fallback. Plus SEC-VOT-09: notification-delivered credentials single-purpose, short-lived, unusable for impersonation after use.

## 2. Options Assessed

| Option | How it works | Strengths | Weaknesses |
|---|---|---|---|
| **A. Member ID + OTP (recommended)** | Voter enters member ID (+ register-matched detail); system sends a short-lived one-time code to the voter's registered email/phone; code + ID opens one ballot session | Familiar; no card printing; code is single-purpose/short-lived (SEC-VOT-09); assisted fallback natural | Needs reachable email/phone per voter; SMS cost; OTP phishing/sharing possible (stated limit, not solved) |
| B. Member ID + pre-issued secret code | Each voter gets a sealed/printed PIN before election day | No telco dependency; works fully offline at stations | Distribution is a security operation (printing, custody, loss/reissue); a lost/stolen PIN is impersonation until revoked |
| C. Institutional SSO (organization IdP) | Redirect to organization login | Strongest binding if IdP is sound; no new credential | Most organizations in the pilot class lack a mature IdP for all members; couples election availability to organization IT (EMP-ROAD dependency risk) |
| D. In-person only at stations | Officer checks physical member ID, starts session | Strong identity check; no remote credential | Does not scale as primary channel for 10k voters in a few hours; station throughput becomes the bottleneck |

## 3. Recommendation: Option A, Email-First

**Flow:** member ID (+ one register-matched detail, e.g. date of birth or phone tail) → OTP challenge → ballot session. Channel order:

1. **Email OTP (primary).** Near-zero marginal cost; members have institutional/personal email on the register.
2. **SMS OTP (fallback).** For voters without working email. Budget at planning prices: Africa-focused aggregators ≈ $0.001–0.05/SMS vs Twilio Verify ≈ $0.05 + channel fee per verification. At 10,000 voters with retries, the wrong provider is a 5–10× cost difference (Q-PRD-001). Get Liberia-specific quotes from at least two providers (e.g. Africa's Talking, Twilio) before Phase 2; figures here are planning ranges, not quotes.
3. **Assisted station (final fallback, FR-AST).** Officer verifies physical member ID and starts a session (Option D as fallback only). This also covers OTP provider outage (EMP-SCALE §6.1).

## 4. Mandatory Controls (not optional extras)

| Control | Requirement |
|---|---|
| OTP properties | 6+ digits, ≤10 min expiry, single use, attempt-limited (e.g. 5), bound to one ballot session; invalidated on use (SEC-VOT-09) |
| No linkage | OTP/session identifiers must never be stored with the ballot record (SEC-BAL-01/02, EMP-ARCH §7.1) |
| Rate limiting | Per-account progressive throttling, not per-IP only — shared-network NAT (EMP-SCALE §5.5, SCALE-R2) |
| Register hygiene | OTP channel (email/phone) verified at registration, before freeze (FR-VOT-003); bad contacts resolved in REGISTRATION state, not on election day |
| Privacy | OTP messages contain no election content beyond the code and expiry (FR-SUP-002); minimal register data (FR-VOT-008) |
| Honest limits | Voter materials state plainly: OTP does not prevent a voter sharing their code, and remote voting is not coercion-free (FR-VTG-009, SEC §6). No stronger claim is made anywhere. |
| Disputes | Failed-verification cases route to registrar support workflow (FR-VOT-007, FR-SUP-003) without ballot access |

## 5. Open Items for Committee Approval

1. Which register-matched detail pairs with member ID (minimize personal data — FR-VOT-008)?
2. SMS budget approval and provider choice (Q-PRD-001).
3. Whether OTP is also required at assisted stations when the voter has a working channel, or physical ID suffices there (recommend: physical ID + officer check, session still entitlement-checked centrally per FR-AST-004).

## 6. Consequences if Rejected

Fallback is Option B (pre-issued secret code) — Phase 2 register work changes (secure print/distribution process) and election-day support load rises. Option C can be added later as an additional method (FR-VOT-010, Future) without redesign, since verification is a configurable step (EMP-SCOPE §8 risk mitigation).

## Document Control

| Field | Value |
|---|---|
| Document | DEC-004 Voter Verification Options Paper |
| ID | EMP-DEC004-001 |
| Version | 0.1 |
| Status | Recommendation pending committee approval |
| Owner | Product Owner |
| Change control | New version on approval or method change |

**End of document.**
