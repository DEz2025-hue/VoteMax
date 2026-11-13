# Acceptance Traceability Matrix — Gate G1 Evidence

**Document ID:** EMP-TRACE-001\
**Version:** 0.1\
**Status:** Compiled 12 November 2026 — G1 **not yet passable** (see §4)\
**Document Type:** Requirements Traceability Matrix (EMP-PRD-001 §6, EMP-SCOPE-001 §5 G1)\
**Last Updated:** 12 November 2026\
**Parent Documents:** EMP-PRD-001, EMP-SCOPE-001 §5, EMP-AUTHZ-001 §2\
**Owner:** Product Owner (custodian: Technical Lead)

> Method: every MVP Must/Should requirement in EMP-PRD-001 was checked against the implementation (`apps/api/src`, `apps/web/app`) and the automated suite (49 tests, 9 files, all passing 12 Nov 2026). Status means: **Implemented** = behaviour present and evidenced; **Partial** = core present, stated remainder missing; **Gap** = not implemented; **Blocked** = implemented or designed but an external decision/credential prevents evidence. Gated (`X`), Could (`C`), R2/R3/Future items are listed in §5 only. Mock-custody limits (DEC-006) apply wherever tally/secrecy evidence is cited.

## 1. Functional Requirements (MVP Must/Should: 75)

| ID | Status | Implementation | Evidence |
|---|---|---|---|
| FR-ORG-001 | Implemented | Tenancy context, org-scoped store | `tenancy.spec.ts` (3) |
| FR-ORG-002 | Implemented | `POST /organizations` | `platform.spec.ts` setup flow |
| FR-ORG-003 | Partial | Owner/admin roles assignable; no "admin exists" invariant enforced | Role assignment in `platform.service.ts:assignRole` |
| FR-ORG-004 | Implemented | Tenant resolved from principal, never client input | `tenancy.spec.ts`; `session.guard.ts` |
| FR-ORG-005 | Partial | Name/slug only; no branding/contact/settings endpoint | `platform.service.ts:createOrganization` |
| FR-ORG-006 | Implemented | No ballot-view capability exists; SoD-3 blocks platform admin election roles | `roles.ts` matrix; `auth.spec.ts` |
| FR-IAM-001 | Implemented | scrypt + RFC 6238 TOTP; privileged login requires TOTP | `credentials.spec.ts`; `platform.spec.ts` MFA test |
| FR-IAM-002 | Implemented | `SessionGuard` + `CapabilityGuard` on every non-public route | `security.spec.ts`; controller decorators |
| FR-IAM-003 | Implemented | Assignments scoped by org/election/station | `auth.spec.ts` |
| FR-IAM-004 | Implemented | SoD-1/2/3 in assignment; SoD-4/5 in tally/certify; denials audited | `auth.spec.ts`; `phase3.spec.ts`; `platform.spec.ts` |
| FR-IAM-005 | Partial | Hashed session tokens, 8 h expiry; no revocation/logout endpoint | `platform.service.ts:login/principalForToken` |
| FR-IAM-006 | Implemented | Role grants/denials written to hash-chained audit | `platform.spec.ts` SoD-9 test |
| FR-ELE-001 | Implemented | `POST /elections` (window, rules fields; timezone fixed Africa/Monrovia) | `platform.spec.ts` |
| FR-ELE-002 | Implemented | Positions with seats + maxChoices | `platform.spec.ts` |
| FR-ELE-003 | Implemented | Single/multi-choice via `maxChoices` | `phase3.spec.ts` ballot flow |
| FR-ELE-004 | Partial | Abstain counted; `allowAbstain` always true, not rule-configurable | `platform.service.ts:computeTally` |
| FR-ELE-005 | Implemented | T1–T16 transition table; invalid transitions rejected | `lifecycle.ts`; `platform.spec.ts` |
| FR-ELE-006 | Partial | Config frozen after freeze; no recorded exception procedure | `lifecycle.ts:assertConfigEditable` |
| FR-ELE-007 | Partial | Manual audited open/close; no scheduler auto open/close; window enforced at submit | `platform.service.ts:transition/submitBallot` |
| FR-ELE-008 | Gap | No voter/observer-readable published-rules view | — |
| FR-CAN-001 | Partial | Add only; no edit or withdraw endpoint (`withdrawnAt` honoured at submit) | `platform.service.ts:addCandidate` |
| FR-CAN-002 | Partial | Name + statement; `photo_url` column exists, not exposed in API/ballot | `db/schema.ts`; `ballotForSession` |
| FR-CAN-003 | Gap | No candidate eligibility rule checks | — |
| FR-CAN-004 | Partial | `ballotOrderPolicy` stored (default `fixed`); order never randomized | `platform.service.ts:createElection` |
| FR-CAN-005 | Implemented | SoD-2 blocks candidate holding admin role | `auth.spec.ts` |
| FR-VOT-001 | Implemented | CSV import with per-line error report | `csv-import.ts`; `platform.spec.ts` |
| FR-VOT-002 | Implemented | Duplicate detection; freeze blocked until resolved | `platform.spec.ts` T3 test |
| FR-VOT-003 | Partial | eligible/ineligible/duplicate_unresolved only; no pending/suspended/voted statuses (voted via entitlement) | `csv-import.ts`; `registerStats` |
| FR-VOT-004 | Implemented | Entitlement per voter; atomic consumption in store transaction | `phase3.spec.ts`; `postgres.store.spec.ts` |
| FR-VOT-005 | Partial | Freeze enforced; post-freeze exception procedure not implemented | `platform.service.ts:freezeRegister` |
| FR-VOT-006 | Partial | Student ID + OTP only (DEC-004 recommended); not configurable per election | `platform.service.ts:requestOtp` |
| FR-VOT-007 | Partial | Duplicate resolution only; no dispute/support case workflow | `platform.service.ts:resolveDuplicate` |
| FR-VOT-008 | Partial | Register limited to studentId/name/email/phone by parser design; no minimization review on file | `csv-import.ts:VoterRow` |
| FR-VOT-009 | Implemented | Changes are new audited records; no silent edit path | Audit assertions in specs |
| FR-VTG-001 | Implemented | Web/PWA voter flow | `apps/web/app/vote` |
| FR-VTG-002 | Implemented | Eligibility + entitlement checked before ballot and at submit | `phase3.spec.ts` |
| FR-VTG-003 | Partial | Accessible ballot form; display order follows FR-CAN-004 limit | `apps/web/app/vote` |
| FR-VTG-004 | Implemented | Review-and-confirm step before submit | `apps/web/app/vote`; `phase3.spec.ts` |
| FR-VTG-005 | Implemented | One entitlement → at most one ballot under concurrency | Burst test; `postgres.store.spec.ts` |
| FR-VTG-006 | Implemented | Safe retry (idempotency key) + status check without selections | `phase3.spec.ts` |
| FR-VTG-007 | Implemented | Receipt confirms acceptance only | `phase3.spec.ts`; vote page |
| FR-VTG-008 | Partial | Lightweight page (108 kB first load); throttled-network staging test outstanding (A-3) | Web build; `ACCESSIBILITY_REVIEW.md` |
| FR-VTG-009 | Implemented | No coercion/device-safety claim in code or voter copy | `CLAIMS_REGISTER.md`; vote page |
| FR-VTG-010 | Implemented | Post-close and post-window submissions rejected | `phase3.spec.ts`; `submitBallot` window check |
| FR-AST-001 | Partial | Stations creatable; no station activation windows | `platform.service.ts:createStation` |
| FR-AST-002 | Implemented | Officer must hold station-scoped assignment | `phase3.spec.ts` assisted test |
| FR-AST-003 | Implemented | Officer opens voter session without ballot content | `phase3.spec.ts` assisted test |
| FR-AST-004 | Implemented | Same eligibility/entitlement path as online | `startAssistedSession` → `submitBallot` |
| FR-AST-005 | Implemented | Officer never receives selections by design; conduct rule in training pack | `phase3.spec.ts`; `TRAINING_AND_ONBOARDING.md` |
| FR-AST-006 | Partial | Sessions expire (30 min) and are deleted on submit; no explicit abandoned-session clear procedure | `openBallotSession` |
| FR-AST-007 | Partial | Aggregate participation only; no per-station status view | `participation` |
| FR-AST-008 | Partial | Training pack ready; not delivered or rehearsed with named officers | `TRAINING_AND_ONBOARDING.md` |
| FR-MON-001 | Implemented | Aggregate participation endpoint | `security.spec.ts` aggregates test |
| FR-MON-002 | Implemented | No selections or voter identities in monitoring output | `security.spec.ts` |
| FR-MON-003 | Gap | No station status (online/activity/alerts) endpoint or view | — |
| FR-MON-004 | Gap | No alerting or monitoring dashboard; runbook loop is manual | `ELECTION_DAY_RUNBOOK.md` §4 |
| FR-MON-005 | Partial | Observer/auditor roles with scoped read capabilities; no dedicated observer UI | `roles.ts` matrix |
| FR-RES-001 | Implemented | Tally only after CLOSED, chair-authorized, executor separate, 2 approvers | `phase3.spec.ts` SoD test |
| FR-RES-002 | Implemented | Counts computed from unlinked ballot records only | `phase3.spec.ts` secrecy test |
| FR-RES-003 | Partial | Independent recomputation + tally/evidence hashes; production evidence awaits DEC-006 protocol | `verifyTally`; mock custody noted |
| FR-RES-004 | Partial | Counts and abstentions per published positions; tie handling/result rules not implemented | `computeTally`; `report` |
| FR-RES-005 | Partial | Recount reproduces tally hash; no justification field recorded | `phase3.spec.ts` recount test |
| FR-RES-006 | Implemented | Certification with separate certifier + second approver and §9.1 blockers | `certify` |
| FR-RES-007 | Implemented | Publish only from CERTIFIED with structured report | `phase3.spec.ts` end-to-end |
| FR-RES-008 | Implemented | Certification record retained with tally hash | `recordCertification` |
| FR-RES-009 | Partial | Machine-readable JSON report; no PDF export | `report` |
| FR-AUD-001 | Implemented | Hash-chained audit on every mutation | `audit-chain.spec.ts` |
| FR-AUD-002 | Implemented | Actor/action/time/scope/outcome; selections never recorded | `audit-chain.spec.ts` |
| FR-AUD-003 | Implemented | Append-only triggers on ballot/audit tables (Postgres) | `postgres.store.spec.ts` |
| FR-AUD-004 | Partial | Auditor `audit.read` capability; onboarding/access test not yet delivered | `roles.ts`; `TRAINING_AND_ONBOARDING.md` Part B |
| FR-AUD-005 | Partial | `GET /audit` returns verified chain as JSON; no export file format | `platform.controller.ts:audit` |
| FR-SUP-001 | Blocked | OTP providers coded (SMTP/Africa's Talking/webhook); notice schedule not system-sent; no credentials configured (F-04) | `otp-delivery.ts`; `.env.example` |
| FR-SUP-002 | Implemented | OTP message carries code + expiry only; templates bar selections/credentials | `otp-delivery.ts`; comms pack |
| FR-SUP-003 | Partial | Help-desk scripts documented; no in-system support case workflow | `VOTER_COMMUNICATIONS_PACK.md` §4 |
| FR-SUP-004 | Implemented | Plain-language voter guide and web copy | `VOTER_COMMUNICATIONS_PACK.md` §1 |

## 2. Non-Functional Requirements (26)

| ID | Status | Position |
|---|---|---|
| NFR-SEC-001 | Partial | Controls implemented per policy; DEC-006/007 keep the set incomplete |
| NFR-SEC-002 | Implemented | Secrecy by construction, asserted in `phase3.spec.ts` + logger redaction spec |
| NFR-SEC-003 | Partial | Encryption at rest in app layer (AES-256-GCM ballots); transit/storage encryption is a staging deployment property |
| NFR-SEC-004 | Blocked | Standard constructions used, but protocol unreviewed — DEC-006 |
| NFR-SEC-005 | Blocked | F-02 (Critical) open; DEC-007 assessment not done |
| NFR-SEC-006 | Implemented | Claims register enforced; no certification claimed anywhere |
| NFR-PERF-001 | Implemented | 10,000-record import + reconciliation test |
| NFR-PERF-002 | Partial | 200-concurrent dev harness passes; staging gate evidence outstanding |
| NFR-PERF-003 | Blocked | 400-session k6 gate run not executed (no staging) |
| NFR-PERF-004 | Implemented | Burst/idempotency integrity tests + load harness integrity PASS |
| NFR-PERF-005 | Partial | Targets defined in EMP-SCALE-001; staging verification outstanding |
| NFR-AVL-001 | Partial | No production-like window run yet |
| NFR-AVL-002 | Partial | Restore drill PASS on dev DB (12 in checklist); production backup/failover on staging outstanding |
| NFR-AVL-003 | Partial | Runbook ready; rehearsal with named staff outstanding (pre-rehearsal §5 of rehearsal plan) |
| NFR-AVL-004 | Partial | Failure drill PASS on Postgres dev DB; staging re-run required for gate credit |
| NFR-ACC-001 | Partial | Internal WCAG checklist done; external audit outstanding (claim N-7) |
| NFR-ACC-002 | Partial | Keyboard/native controls pass internally; screen-reader pass outstanding (A-1) |
| NFR-ACC-003 | Partial | Lightweight by design; slow-3G staging test outstanding (A-3) |
| NFR-ACC-004 | Implemented | Assisted station path implemented; delivery of training is Phase 5 operations |
| NFR-QUAL-001 | Implemented | 49 automated tests over eligibility, acceptance, tally, certification |
| NFR-QUAL-002 | Implemented | Drizzle migrations 0000–0005 in version control |
| NFR-QUAL-003 | Implemented | Postgres-backed in production; in-memory store refused when `NODE_ENV=production` |
| NFR-QUAL-004 | Partial | CI build+test on every push; no versioned production release or freeze record yet |
| NFR-LEG-001 | Blocked | DEC-005 counsel not engaged |
| NFR-LEG-002 | Blocked | DEC-010 authority letter not received |
| NFR-LEG-003 | Blocked | Retention schedule awaits DEC-005 output (Q-PRD-005) |

## 3. Counts

| Scope | Implemented | Partial | Gap | Blocked | Total |
|---|---|---|---|---|---|
| Functional (MVP M/S) | 42 | 28 | 4 | 1 | 75 |
| Non-functional | 8 | 12 | 0 | 6 | 26 |
| **Total** | **50** | **40** | **4** | **7** | **101** |

## 4. G1 Conclusion

G1 requires all MVP-priority requirements implemented with acceptance criteria passing (EMP-SCOPE-001 §5). On this matrix G1 is **Partial — cannot pass yet**: 4 gaps (FR-ELE-008, FR-CAN-003, FR-MON-003, FR-MON-004), the FR-SUP-001 block, and 40 partial remainders must be closed or formally accepted by the Product Owner with a dated plan. The largest partial clusters are election-rules publication and candidate administration (ELE/CAN), station/monitoring views (AST/MON), report formats (RES/AUD), and every staging-dependent NFR. Nothing in this matrix weakens the G2/G4 position: DEC-006/007 and F-02/F-04 block independently of G1.

## 5. Out of This Matrix (by PRD release target)

Gated offline voting FR-OFF-001…008 (X, DEC-008); Could/Future/R2/R3 items FR-IAM-007, FR-ELE-009, FR-CAN-006, FR-VOT-010, FR-VTG-011, FR-MON-006, FR-SUP-005. These enter the matrix only when their release is approved through scope change control (EMP-SCOPE-001 §9).

## Document Control

| Field | Value |
|---|---|
| Document | Acceptance Traceability Matrix |
| ID | EMP-TRACE-001 |
| Version | 0.1 |
| Status | Compiled; G1 partial |
| Owner | Product Owner |
| Change control | Update with every requirement, implementation, or test change; re-issue at each gate review |

**End of document.**
