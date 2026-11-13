# Authorization Pack — G6 Evidence and G8 Final Authorization

**Document ID:** EMP-AUTHZ-001\
**Version:** 0.1\
**Status:** No gate signed — final authorization is currently REFUSED by open blockers (see §2)\
**Document Type:** Gate Evidence Index and Authorization Record (NFR-LEG-002, EMP-SCOPE-001 §5)\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-SCOPE-001 §5, EMP-LIFE-001 §6, DEC-010_PILOT_CONFIRMATION_PACK.md, DEC-005_LEGAL_REVIEW_BRIEF.md\
**Owner:** Organization election committee (custodian: Product Owner)

---

## 1. G6 — Legal and Institutional Evidence (assemble before G8 is considered)

| # | Evidence | Source | State |
|---|---|---|---|
| G6-1 | Election authority letter (named university, committee, electronic process accepted) | `DEC-010_PILOT_CONFIRMATION_PACK.md` §3 | ☐ Not received — pilot in discussion |
| G6-2 | Legal review memo: data protection (Liberia Data Protection Act 2026), retention, electronic records, cross-border position | `DEC-005_LEGAL_REVIEW_BRIEF.md` §3 | ☐ Counsel not engaged |
| G6-3 | Election rules adopted by the committee incl. recount triggers, extension rules, second-approver requirement | Committee (answers Q-LIFE-001/002/004, Q-PRD-003/004) | ☐ Pending committee |
| G6-4 | Data retention schedule per data class | DEC-005 output (Q-PRD-005) | ☐ Pending G6-2 |

## 2. Gate Evidence Index (G1–G8) — Honest Status at Pack Creation

| Gate | Criteria (EMP-SCOPE-001 §5) | Evidence on file | Approver | Status |
|---|---|---|---|---|
| G1 Product | MVP requirements implemented; acceptance criteria pass | Phase 1–3 implementations; 45 automated tests (workflows, security suite) | Product Owner | Partial — acceptance traceability matrix not yet compiled |
| G2 Security | No unresolved critical/high; independent review passed | Internal security suite + Phase 4 report | Security Lead + Independent reviewer | **FAIL — F-01…F-04 open; DEC-006/DEC-007 not engaged** |
| G3 Performance | 10k register; 200 concurrent; 400-session load; bursts | Local harness 600@200 (dev only) | Technical Lead | Not gate-proven — staging k6 outstanding |
| G4 Integrity | No duplicate/lost accepted ballots under defined failures | Concurrency/idempotency tests pass; restart drill **fails** (ballot lost) | Technical + Security Leads | **FAIL — F-01** |
| G5 Operations | Runbook, incident plan, recovery tested; officers trained | Runbook/training/comms/rehearsal packs complete | Election Operations Lead | Partial — unnamed people, unrehearsed |
| G6 Legal | Legal review done; authority in writing | This pack §1 | Election committee | **FAIL — no letter, no memo** |
| G7 Dress rehearsal | Full mock election on production-like infra, real procedures | Pre-rehearsal record (mock only) | Product Owner + Ops Lead | Not run as specified |
| G8 Final authorization | G1–G7 passed; sign-off recorded | This record | Election committee | **Cannot sign** |

## 3. G8 Final Authorization Record (sign only when §2 shows all gates passed)

> We, the [university] [election committee], having reviewed the G1–G7 evidence indexed in this pack, authorize the live [election name] on the Election Management Platform for the window [dates]. We understand the stated limitations in the claims register, including that remote voting cannot prevent coercion and that ballot secrecy does not extend to a voter's own device.

| Signatory | Role | Signature | Date |
|---|---|---|---|
| | Committee chair | | |
| | Second approver (per G6-3 rules) | | |
| | Security Lead (G2 concurrence) | | |
| | Product Owner (G1/G7 concurrence) | | |

**Refusal rule:** if any gate in §2 is not “passed” with evidence attached, this record must instead be completed as a refusal: gate(s) failed, findings, conditions for re-review, signatures of the committee. A signed authorization with an open critical/high finding is a policy violation (EMP-SEC-001 §13, SEC-ASR-04).

## 4. Claims Discipline at Authorization

Only claims listed as permitted in `CLAIMS_REGISTER.md` §1 may be used in voter- or public-facing material for the pilot, quoted with their evidence. Reviewer-imposed limitations from DEC-006/007 reports, when received, are added to the register before G8.

## Document Control

| Field | Value |
|---|---|
| Document | Authorization Pack G6/G8 |
| ID | EMP-AUTHZ-001 |
| Version | 0.1 |
| Status | Unsigned; authorization blocked |
| Owner | Organization election committee |
| Change control | New version on any gate decision |

**End of document.**
