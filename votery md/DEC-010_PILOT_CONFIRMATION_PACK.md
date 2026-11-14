# DEC-010 — Pilot Organization Confirmation Pack

**Document ID:** EMP-DEC010-001\
**Version:** 0.1\
**Status:** Ready to send — organization in discussion, not confirmed\
**Document Type:** Confirmation Pack\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §7/§19, EMP-PRD-001 NFR-LEG-002, EMP-SCOPE-001 G6\
**Owner:** Product Owner

---

## 1. Purpose

DEC-010 closes when a pilot organization and its election authority are **confirmed in writing** (NFR-LEG-002: confirmed before the election is created in production; G6 evidence = authority letter). This pack is everything needed to get that letter. Until it arrives, EMP builds to the configurable assumptions in section 4 (EMP-SCOPE §8).

## 2. Confirmation Checklist (all required for DEC-010 = Closed)

| # | Item | Evidence | Owner |
|---|---|---|---|
| 1 | Organization named; leadership sponsor identified | Sponsor name + role | Product Owner |
| 2 | Election authority identified (election committee or equivalent) | Committee name, chair, contact | Product Owner |
| 3 | Committee accepts an electronic process (alongside or in place of paper) | Written acceptance (see §3 template) — PRD assumption 1 | Committee chair |
| 4 | Pilot election scope agreed: positions, approximate voter count, target window | One-page election brief signed by committee | Committee + Election admin |
| 5 | Voter register source agreed: who provides the member list, in what format, by when | Register handover note (feeds FR-VOT-001) | Registrar |
| 6 | Named contacts: committee chair, registrar counterpart, IT contact, station coordinator | Contact sheet | Election Operations Lead |
| 7 | Gate approvers named for G6/G8 (EMP-SCOPE §5) | Names in `GOVERNANCE_ROLES_ASSIGNMENT.md` | Product Owner |

## 3. Authority Letter — Template (for committee letterhead)

> To: Election Management Platform (EMP) project — Product Owner
>
> The [Organization name] [Election Committee / authority name] confirms that:
>
> 1. It is the election authority for the [election name] at [organization].
> 2. It authorizes EMP to be used to conduct this election electronically [alongside / in place of] paper processes, under the election rules attached.
> 3. [Name] serves as Committee Chair and is authorized to approve election readiness, opening, tally, and certification under EMP's lifecycle.
> 4. The eligible voter register will be provided by [office] in [format] by [date].
>
> Signed: ______ Name/Title: ______ Date: ______

## 4. Configurable Assumptions (used until confirmation)

From EMP-FOUND-001 §7.1 — planning values, not commitments: 10,000 capacity population; 60–80% turnout; few-hour window (modelled as 4h in EMP-SCALE §3.1); 200 concurrent / 400 load-test; online primary, assisted secondary; offline disabled. Every one of these is a configuration value, not a hard-coded constant — code must not bake them in (Phase 1 note).

Questions the committee must answer at confirmation (feed open questions): voting window + extension rules (Q-LIFE-004, SCALE-Q1), assisted-station count/share (SCALE-Q2), availability target (SCALE-Q3), ballot-order policy (Q-PRD-003), certification quorum/second approver (Q-PRD-004, Q-LIFE-002), recount triggers (Q-LIFE-001), register inspectability (Q-LIFE-003), minimum participation (Q-LIFE-005).

## 5. Escalation (dated decision plan)

If written confirmation is not received by **W0 + 6** (see `PHASE_0_EXECUTION_PLAN.md` §5): Product Owner approaches a second candidate organization with this same pack; DEC-010 stays open with the new candidate named. Phase 1 architecture work is not blocked by DEC-010; Phase 2 register work is designed to the assumptions above.

## Document Control

| Field | Value |
|---|---|
| Document | DEC-010 Pilot Confirmation Pack |
| ID | EMP-DEC010-001 |
| Version | 0.1 |
| Status | Ready to send |
| Owner | Product Owner |
| Change control | New version on confirmation |

**End of document.**
