# Governance Roles Assignment and Document Sign-Off

**Document ID:** EMP-GOV-001\
**Version:** 0.1\
**Status:** Template — names pending (blocks Phase 0 exit)\
**Document Type:** Governance Record\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §17, EMP-STAKE-001 §2.1/§6, EMP-PRD-001 FR-IAM-004\
**Owner:** Product Owner

---

## 1. Purpose

EMP-FOUND-001 §17 and EMP-STAKE-001 §2.1 require named owners before the pilot. Phase 0 exit requires the document set **approved by** Product Owner, Technical Lead, and Security Lead — impossible until those people are named. This sheet is filled in one meeting.

> These are **project governance** assignments (who builds/runs EMP), distinct from per-election roles in EMP-STAKE-001 §3 (committee chair, registrar, custodians…), which are assigned per election later.

## 2. Governance Assignments (fill in)

| Role | Name | Organization | Contact | Appointed (date) | MFA enrolled (privileged access, FR-IAM-001) |
|---|---|---|---|---|---|
| Product Owner | | | | | ☐ |
| Technical Lead | | | | | ☐ |
| Security Lead | | | | | ☐ |
| Election Operations Lead | | | | | ☐ |
| Platform administrator (first) | | | | | ☐ |
| Independent Reviewer (external) | | | | | — (DEC-007) |

Rules that apply immediately on appointment (EMP-STAKE-001 §6): platform administrator holds no election role (SoD-3); role grants are audited (FR-IAM-006); conflict-of-interest declarations collected for privileged roles (SEC-PER-04).

## 3. Foundation Document Sign-Off (Phase 0 exit evidence)

Each approver signs the set, or records exceptions. Signing means: *reviewed; approved as the baseline Phase 1 is built against.*

| Document | Product Owner | Technical Lead | Security Lead |
|---|---|---|---|
| EMP-FOUND-001 Project Overview v1.0 | ☐ | ☐ | ☐ |
| EMP-PRD-001 Product Requirements v0.1→1.0 | ☐ | ☐ | ☐ |
| EMP-SCOPE-001 Product Scope and MVP | ☐ | ☐ | ☐ |
| EMP-STAKE-001 Stakeholders and Roles | ☐ | ☐ | ☐ |
| EMP-ROAD-001 Product Roadmap | ☐ | ☐ | ☐ |
| EMP-ARCH-001 System Architecture | ☐ | ☐ | ☐ |
| EMP-SEC-001 Security Master Policy | ☐ | ☐ | ☐ |
| EMP-LIFE-001 Election Lifecycle | ☐ | ☐ | ☐ |
| EMP-SCALE-001 Scalability Architecture | ☐ | ☐ | ☐ |
| EMP-DEC002 / DEC004 decision records | ☐ | ☐ | ☐ |

Exceptions (document, section, reason, approver): ______

On completion: bump signed drafts to v1.0, record approval date here, and update each document's Document Control block by new version (never silent edit — EMP-FOUND-001 §15).

## 4. Decision Authority (until amended in writing)

| Decision | Decides | Must consult |
|---|---|---|
| Scope change (EMP-SCOPE §9) | Product Owner | Technical Lead, Security Lead (mandatory for secrecy/eligibility/integrity/availability) |
| Hosting ratification (DEC-002) | Technical Lead | Security Lead (residency), Product Owner (cost) |
| Verification method (DEC-004) | Election committee (pilot); interim: Product Owner | Security Lead |
| Security exception (EMP-SEC §3) | Security Lead | Independent reviewer acknowledgment for secrecy/eligibility/uniqueness/integrity weakening |
| Live election authorization (G8) | Organization election committee | All leads (G1–G7 evidence) |

## Document Control

| Field | Value |
|---|---|
| Document | Governance Roles Assignment |
| ID | EMP-GOV-001 |
| Version | 0.1 |
| Status | Template — names pending |
| Owner | Product Owner |
| Change control | New version on any appointment change |

**End of document.**
