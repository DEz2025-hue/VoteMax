# DEC-006 / DEC-007 — Specialist Reviewer and Independent Assessor Pack

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-DEC0067-001\
**Version:** 0.1\
**Status:** Criteria ready — no firms named or contacted yet\
**Document Type:** Shortlisting Pack\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §19, EMP-SEC-001 SEC-ASR-01…07 / SEC-OI-1…2, EMP-ARCH-001 §7\
**Owner:** Security Lead

---

## 1. Why Two Engagements

| Engagement | Decision | Scope | Needed by |
|---|---|---|---|
| **Cryptographic specialist reviewer** | DEC-006 | Review ballot secrecy + tally protocol options (EMP-ARCH §7.2), threshold key custody model, unlinkability/timing analysis (ARCH-R1, ARCH-R3) | **Phase 1 exit** — design cannot be built before review (SEC-CRY-02) |
| **Independent security assessor** | DEC-007 | Independent assessment of secrecy, eligibility, integrity, availability; penetration test (external, authenticated, cross-tenant, station — SEC-ASR-03); G2 gate evidence | Engaged **during design** (SEC-ASR-02), assessment complete in Phase 4 |

They may be different firms. One firm may do both only if the crypto review and the assessment remain separately staffed and reported — record the arrangement.

## 2. Selection Criteria (score each candidate 0–2 per row)

| Criterion | Crypto reviewer (DEC-006) | Assessor (DEC-007) |
|---|---|---|
| Demonstrated election-system or applied-cryptography review experience | Required | Strongly preferred |
| Published protocol review / verifiable-tally expertise (mix-nets or homomorphic tallying) | Required | Preferred |
| Independence: no stake in EMP build, no reselling of build services to EMP | Required | Required |
| Penetration testing across web, authenticated, tenant-isolation, and station/device contexts | — | Required |
| Familiarity with OWASP ASVS and election-system guidance (SEC-SDL-12) | Preferred | Required |
| Availability to start at Phase 1 design, not only after build | Required | Required |
| Clear deliverable: written findings with severity, remediation, re-test | Required | Required (no critical/high open at G2 — SEC-ASR-04) |
| References from comparable engagements | Required | Required |

**No firm is named in this document.** Naming candidates requires outreach and availability checks; inventing a shortlist of firm names without contact would be a fabricated claim (SEC-ASR-06 claims discipline applies to our own documents too). The Security Lead populates §3 from real responses.

## 3. Candidate Register (populate from outreach)

| Candidate | Type (DEC-006/007) | Contacted | Responded | Score (§2) | Decision |
|---|---|---|---|---|---|
| — | — | ☐ | ☐ | — | — |

## 4. Outreach / RFP Outline (send to each candidate)

1. EMP summary: EMP-FOUND-001 + EMP-ARCH-001 §7 (secrecy constraints) under NDA if needed.
2. Ask: relevant election/crypto review experience; proposed approach; who (named people) does the work; availability for Phase 1; deliverable format; fee structure; conflicts/independence statement.
3. State the gates: SEC-CRY-02 (no custom protocol without review), SEC-ASR-04 (no critical/high findings open at production approval), G2.
4. State the honest-limitations rule: reviewer findings that limit our claims go into the claims register verbatim (SEC-ASR-06).

## 5. Phase 0 Exit Link

Phase 0 requires **reviewers identified** (EMP-ROAD-001). “Identified” = at least one candidate per engagement in §3 with contact made and response received — not merely criteria written. This pack satisfies the preparation half; outreach is the remaining Phase 0 task (owner: Security Lead, by W0 + 4 per `PHASE_0_EXECUTION_PLAN.md` §5).

## Document Control

| Field | Value |
|---|---|
| Document | DEC-006/007 Reviewer Shortlist Pack |
| ID | EMP-DEC0067-001 |
| Version | 0.1 |
| Status | Criteria ready; outreach pending |
| Owner | Security Lead |
| Change control | New version on engagement |

**End of document.**
