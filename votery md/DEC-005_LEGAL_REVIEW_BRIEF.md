# DEC-005 — Legal and Data-Protection Review Brief

**Document ID:** EMP-DEC005-001\
**Version:** 0.1\
**Status:** Brief ready — counsel not yet engaged\
**Document Type:** Legal Review Brief\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §19, EMP-PRD-001 NFR-LEG-001…003, EMP-SEC-001 SEC-DAT-03, SEC-OI-3\
**Owner:** Security Lead (with Product Owner)

---

## 1. Purpose

Instruct Liberian counsel for the DEC-005 review and record what is known today. This brief is a starting checklist, **not legal advice**. NFR-LEG-001 requires applicable requirements identified before the pilot; G6 requires the review complete before a live election.

## 2. Known Legal Landscape (to be confirmed by counsel)

| Item | What public sources indicate (Nov 2026) | Action for counsel |
|---|---|---|
| Data Protection Act | Liberia enacted its **first Data Protection Act** (“Act for the Collection, Processing, Transmission, Storage, Protection, and Use of Personal Information”), signed August 2026; earlier sources confirm no comprehensive law existed before (Constitution Art. 16 privacy only; ECOWAS Supplementary Act signed, AU Malabo not signed) | Obtain the Act text; confirm regulator, registration, breach notification, data-subject rights, and **cross-border transfer rules** (DEC-002 depends on this) |
| Cybercrime Act | Signed alongside (August 2026) | Confirm offences/duties touching platform operation and incident reporting |
| Election authority | Student union elections governed by university/union constitutions, not national electoral law (assumption) | Confirm no national approval is needed for an organizational election; confirm what the pilot committee's constitution requires (electronic voting, quorum, second approver — Q-LIFE-002) |
| Telecommunications / SMS | OTP and notifications ride Liberian carriers via aggregators | Confirm sender-ID/A2P registration duties for OTP SMS |

Any conflict between this table and counsel's advice: counsel prevails and this document is corrected by new version.

## 3. Questions for Counsel (review scope)

1. Data controller/processor roles: EMP vs university; what agreement is required?
2. Lawful basis and notices for processing the voter register (student ID, contact details); data minimization position (FR-VOT-008).
3. Cross-border transfer: may voter personal data be stored/processed in EU (DEC-002 `eu-west`) — or is African residency required (→ `af-south-1`)?
4. Retention: what periods are lawful/required for register, audit records, encrypted ballots (Q-PRD-005 → retention schedule SEC-OI-6)?
5. Breach notification duties and timelines (feeds SEC-INC plan).
6. Electronic records/signatures: are electronic tally/certification records legally effective for an organizational election?
7. Accessibility, language, and voter-notice duties, if any.
8. Any sector rules for universities or student unions affecting election conduct, disputes (Q-STK-004), and publication of results.

## 4. Deliverable and Gate Link

Counsel delivers a short memo answering §3, mapped to requirement IDs (NFR-LEG-001…003, SEC-DAT-03). Memo is G6 evidence (`PRODUCT_SCOPE_AND_MVP.md` §5). Until the memo arrives, DEC-005 = **In progress** (EMP-ROAD-001 Phase 0 asks only that the review has begun — engagement letter is the Phase 0 evidence).

## 5. Engagement Checklist

| Step | State |
|---|---|
| Shortlist Liberian counsel with data/technology practice | ☐ Not started |
| Send this brief + EMP-FOUND-001, EMP-SEC-001, DEC-002 record | ☐ |
| Engagement letter signed (Phase 0 evidence) | ☐ |
| Memo received; obligations converted to tracked requirements | ☐ |
| Retention schedule drafted from memo (Q-PRD-005) | ☐ |

## Document Control

| Field | Value |
|---|---|
| Document | DEC-005 Legal Review Brief |
| ID | EMP-DEC005-001 |
| Version | 0.1 |
| Status | Ready to instruct counsel |
| Owner | Security Lead |
| Change control | New version on counsel advice |

**End of document.**
