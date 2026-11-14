# Threat Model

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-THREAT-001\
**Version:** 0.1\
**Status:** Draft for Security Lead review (update on any material design change — SEC §4)\
**Document Type:** Threat Model\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-SEC-001 §§4–6, EMP-ARCH-001, EMP-PROTO-001\
**Owner:** Security Lead

---

## 1. Scope and Assets

In scope: web/PWA, API, PostgreSQL (D1–D4), KMS/custody (D5), Redis, object storage, stations, notification providers, CI/CD. Assets in priority order: (1) ballot secrecy, (2) eligibility/uniqueness integrity, (3) tally integrity, (4) availability during the window, (5) voter personal data, (6) audit evidence.

## 2. Adversaries (from EMP-SEC-001 §4) and Key Threats

| Adversary | Threat | Primary controls | Residual / honest limit |
|---|---|---|---|
| External attacker | Credential stuffing on voter/admin login; injection; DDoS at open | MFA (SEC-IAM-01), rate limiting tuned for shared-network NAT (SCALE §5.5), parameterized queries (SEC-SDL-11), WAF/DDoS (SEC-OPS-04) | Surge + attack overlap rehearsed in Phase 4 |
| Malicious voter | Double voting; OTP sharing; retry abuse | Atomic entitlement (SEC-VOT-02…04), idempotency, per-account throttling | A voter **can** share their own OTP — cannot be prevented, only stated (DEC-004 §4) |
| Compromised voter device | Malware reads/changes selections | None available to platform | **Out of platform control; never claimed solved** (SEC §6) |
| Coercer / vote buyer | Pressure or purchase of remote votes | Assisted-station alternative; no receipt showing selections (FR-VTG-007) | Remote coercion **cannot be fully mitigated**; stated plainly |
| Malicious insider (admin/registrar/officer/dev) | Link voter↔ballot; alter register; unseal ballots alone | D2/D3 separation with no join path (SEC-BAL-06), SoD-1…9, threshold custody (SoD-4), append-only audit with external anchor (SEC-AUD-02/03), officers never see ballot screen (SEC-BAL-08) | Collusion of ≥ threshold custodians defeats secrecy — stated limit |
| Colluding insiders | Quorum abuse at tally | Separate authorizer/executor/certifier (SoD-5), independent verification (T10), published evidence | Verification is the detection control; prevention has limits — stated |
| Candidate/supporter | Pressure on officers; result disputes | Officer training/conduct (SEC-PER-02), observers, recount procedure (T11) | Committee owns verdicts; platform provides evidence (EMP-LIFE §10) |
| Provider compromise | Cloud account takeover; SMS/email provider leaks OTPs | MFA + least-privilege cloud roles, break-glass (SEC-OPS-06), providers never receive selections (SEC-SUP-02), OTP single-use/short-lived | Provider outage fallback: assisted stations (SCALE §6.1) |
| Timing/metadata analyst (incl. curious insider with log access) | Correlate participation time with ballot order in small races | Coarse ballot timestamps, no ballot-path body logging (SEC-BAL-04/05), aggregates-only monitoring (SEC-BAL-07) | Small-turnout correlation needs DEC-006 analysis (ARCH-R1) — **open** |

## 3. Trust Boundaries

Browser/PWA → (TLS) → Edge/WAF → API modules → {PostgreSQL D1–D4 with RLS, Redis (non-authoritative), Object storage, KMS/D5}. Highest-sensitivity boundary: Voting module write into D3 and Tally module read from D3 — separate DB roles; Tally role activates only in the tally procedure (Phase 3 design must enforce, this model requires).

## 4. Open Items Feeding This Model

ARCH-R1 (small-turnout unlinkability), ARCH-R3 (auth token → ballot path linkage; DEC-004 OTP session must terminate before D3 write), SEC-OI-5 (external anchor party), DEC-006 option choice. Each closes by updating this document with a new version — the model is reviewed at every phase exit (SEC §4.3).

## Document Control

| Field | Value |
|---|---|
| Document | Threat Model |
| ID | EMP-THREAT-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Security Lead |
| Change control | Update on material design change |

**End of document.**
