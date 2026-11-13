# Ballot Secrecy and Tally Protocol — Specification Draft

**Document ID:** EMP-PROTO-001\
**Version:** 0.1\
**Status:** DRAFT — NOT APPROVED FOR IMPLEMENTATION. Requires DEC-006 specialist review.\
**Document Type:** Protocol Specification (for review)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-ARCH-001 §7/§8, EMP-SEC-001 §§6–7, EMP-PRD-001 FR-VTG/FR-RES\
**Owner:** Security Lead

> **Hold point.** Per SEC-CRY-02, no code implementing this protocol's cryptography may be merged until a specialist reviewer has reviewed this specification and findings are addressed or tracked. This document states the design to be reviewed; it is not an approved protocol. Phase 3 ballot code must not start from an unreviewed version of this document.

---

## 1. Goals and Non-Goals

Goals: ballot secrecy (SEC-BAL-01…05), eligibility + uniqueness (SEC-VOT-01…05), integrity and verifiable tally (FR-RES-003), sealed-until-close (SoD-4/5).

Non-goals (stated limitations, SEC §6): protection against a compromised voter device; coercion resistance in remote voting; secrecy against an adversary controlling both the platform and all key custodians. These must appear verbatim in voter/committee materials.

## 2. Options Put to the Reviewer (from EMP-ARCH §7.2)

| Option | Construction | Assurance | Cost/complexity |
|---|---|---|---|
| A. Verifiable mix-net | Threshold-encrypted ballots → verifiable shuffle with proofs → threshold decryption | Highest unlinkability + verifiability | Highest; proof verification tooling needed |
| B. Homomorphic tally | Additively homomorphic encryption; only aggregates decrypted | Verifiable aggregate; no individual ballot ever decrypted | Limits ballot formats/result rules; multi-choice encoding care |
| C. Sealed encrypted store (baseline) | Ballots encrypted under election key; split-key decryption at tally; published evidence hashes | Lowest of the three; unlinkability rests on separation + metadata discipline, not cryptography | Lowest; may fit pilot if assurance level is stated honestly |

**Question for the reviewer (ARCH-Q1):** which option's assurance justifies its complexity for a 10,000-voter student election, and what claims may we publish for the chosen option (claims register, SEC-ASR-06)?

## 3. Design Constraints (any option must satisfy)

1. **Separation.** Participation record (D2: voter, election, entitlement consumed) and ballot record (D3) share no stored identifier — no voter ID, session ID, OTP ID, IP, or user-agent on the ballot record (EMP-ARCH §7.1.1–3).
2. **Encryption at acceptance.** Ballot plaintext exists only in the voter's client and transiently in the acceptance request; stored form is ciphertext under an election-specific key (SEC-CRY-04).
3. **Sealed until close.** No decryption capability is reachable by application roles before CLOSED + tally authorization (T9, EMP-LIFE-001).
4. **Threshold decryption.** Decryption requires *t-of-n* key custodians (SEC-CRY-05); parameters proposed in `KEY_LIFECYCLE_AND_CUSTODY.md`, fixed only by reviewer + committee.
5. **Append-only.** Ballot store rejects UPDATE/DELETE at the database role level (EMP-ARCH §7.1.7).
6. **Timing resistance.** Ballot records carry coarse timestamps (e.g. truncated to the minute or bucketed) decoupled from participation timestamps; ballot-path logs/traces capture no bodies (SEC-BAL-04/05). Reviewer to assess small-turnout correlation (ARCH-R1).
7. **Verifiable evidence.** Tally emits an evidence package (input ciphertext hashes, proofs or recomputation data per option, output counts) that an independent party can check without platform access (FR-RES-003).
8. **Atomic acceptance.** Entitlement consumption + ciphertext write + audit append in one transaction (EMP-ARCH §8); acknowledgment only after commit (SEC-VOT-05).

## 4. Acceptance Flow (protocol-agnostic skeleton)

Authenticate (DEC-004) → eligibility + window check → short-lived ballot session (bound to entitlement server-side, never written to D3) → client encrypts selections under election public key → submit ciphertext + idempotency token → server validates structure (ciphertext only; plaintext validation happens client-side + via zero-knowledge/range proofs if the chosen option requires) → one transaction: lock entitlement, mark consumed, append ciphertext, append audit (no selections) → commit → receipt (no selections, FR-VTG-007).

> **Open design tension for the reviewer:** server-side structural validation (FR-VTG/SEC-VOT-06) vs encryption-at-client. Resolution depends on option: (A/B) validity proofs; (C) encrypt-after-server-validation weakens secrecy against the server. This tension is exactly why implementation waits for review.

## 5. Review Deliverables Required Before Phase 3

1. Chosen option + written rationale + publishable claims and limitations.
2. Custodian threshold parameters (feeds Q-STK-002).
3. Metadata/timing analysis for the pilot's turnout profile.
4. Receipt/individual-verification position (Q-PRD-002, FR-VTG-011) — default: **out of pilot** unless reviewer advises otherwise.
5. Key ceremony script review (with `KEY_LIFECYCLE_AND_CUSTODY.md`).

## Document Control

| Field | Value |
|---|---|
| Document | Ballot Secrecy and Tally Protocol Specification |
| ID | EMP-PROTO-001 |
| Version | 0.1 |
| Status | Draft for DEC-006 specialist review — not approved |
| Owner | Security Lead |
| Change control | Reviewer findings tracked to closure; new version on approval |

**End of document.**
