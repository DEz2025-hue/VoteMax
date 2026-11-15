# Key Lifecycle and Custody Model - Draft

**Document ID:** EMP-KEY-001\
**Version:** 0.1\
**Status:** DRAFT - requires DEC-006 specialist review before use\
**Document Type:** Key Management Design\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-SEC-001 §7 (SEC-CRY-01…10), EMP-ARCH-001 §§6-7, EMP-DEC002-001\
**Owner:** Security Lead

> **Hold point.** Custody parameters (custodian count, threshold) are **proposals for review**, not decisions. They close with DEC-006 + Q-STK-002 and committee approval (SoD-4: no single person unseals ballots).

---

## 1. Key Inventory

| Key | Purpose | Where it lives | Lifetime |
|---|---|---|---|
| Election ballot key (per election) | Encrypt accepted ballots; threshold-decrypted at tally | Public part published in election config; private part split across custodians / KMS-HSM (option per EMP-PROTO-001) | Created at READY (readiness check #6, EMP-LIFE-001 §6); destroyed/archived per retention after ARCHIVED |
| Platform TLS / infrastructure keys | Transport, disk, backup encryption | Managed KMS (DEC-002 region) | Rotated per provider policy |
| Audit anchor signing key | Sign periodic audit-chain digests anchored externally (SEC-AUD-03) | KMS; use logged | Annual rotation |
| Service secrets (DB, Redis, providers) | Runtime access | Secrets manager only - never in code/logs (SEC-CRY-08) | Rotated on personnel change + schedule |

Application database stores **custody records only** (who holds what share, ceremony events) - never key material (EMP-ARCH §11.1, D5).

## 2. Proposed Custody Model (for reviewer)

- **Custodians:** 5 named individuals drawn from election committee, organization, and independent roles; no custodian may be platform administrator, election administrator, or candidate in that election (SoD-2/3/4).
- **Threshold:** 3-of-5 to decrypt at tally (tolerates 2 absent custodians - SEC-CRY-10 continuity; requires 3 colluding to abuse).
- **Generation ceremony (before READY):** scripted, witnessed, logged to D4 with independent witness where feasible (SEC-CRY-07); shares distributed on hardware tokens or KMS-held shares per reviewed option; ceremony record is readiness evidence.
- **Use:** decryption only inside the authorized tally (T9) with chair authorization + custodian quorum; every use logged; tally approvers are separate people from executors (SoD-5).
- **Continuity:** absence/loss procedure rehearsed before pilot (SEC-CRY-10); share replacement requires ceremony re-run and audit record.
- **Compromise response (SEC-CRY-09):** revoke/rotate where possible; if ballot key compromise is suspected before close, Security Lead + committee decide suspension (T6) impact; documented before pilot, not improvised during it.
- **Destruction:** after retention expiry, private material destroyed with witnessed record; public evidence (hashes, proofs) retained per schedule (DEC-005 output).

Reviewer may change custodian count/threshold and the KMS-vs-HSM split (DEC-002 verified KMS in chosen region; CloudHSM need is a DEC-006 output). Numbers above exist so the reviewer has something concrete to correct.

## 3. Lifecycle Checklist (per election)

| Stage | Action | Evidence |
|---|---|---|
| REGISTER_FROZEN → READY | Generation ceremony; custodians confirmed | Ceremony record, custodian list (readiness #6) |
| OPEN | No key use; custody status monitored | Custody log |
| CLOSED → TALLIED | Quorum decryption under T9 authorization | Tally run record, approvers |
| CERTIFIED → ARCHIVED | Key archived sealed per retention | Archive manifest |
| Retention expiry | Witnessed destruction | Destruction record |

## Document Control

| Field | Value |
|---|---|
| Document | Key Lifecycle and Custody Model |
| ID | EMP-KEY-001 |
| Version | 0.1 |
| Status | Draft for DEC-006 review |
| Owner | Security Lead |
| Change control | New version on reviewer approval |

**End of document.**
