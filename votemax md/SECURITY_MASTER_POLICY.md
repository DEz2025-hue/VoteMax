# Security Master Policy

> **Model update (v0.2):** the role model is now four roles — `platform_admin`, `organization_owner`, `auditor`, `voter` — per EMP-STAKE-001 v0.2. References below to committee chair, election administrator, voter registrar, observer, station officer, candidate-as-role, polling stations, or assisted voting are superseded; all voting is online.

**Document ID:** EMP-SEC-001\
**Version:** 0.1\
**Status:** Draft for review\
**Document Type:** Security Policy\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001, EMP-PRD-001, EMP-ARCH-001\
**Owner:** Security Lead

---

## 1. Purpose and Scope

This policy sets the mandatory security and privacy requirements for EMP. It applies to all people, systems, code, infrastructure, and procedures involved in building, operating, and supporting the platform, including contractors, polling station staff, and AI-assisted development tools.

Security is a foundational product requirement, not an optional feature (EMP-FOUND-001 section 10). Where this policy conflicts with a schedule or convenience, this policy prevails unless the Security Lead approves a documented exception.

**Terms.** "Must" and "must not" are mandatory. "Should" is expected unless an exception is recorded.

## 2. Security Objectives

The twelve principles from EMP-FOUND-001 are the objectives of this policy:

| # | Principle | Primary controls in this policy |
|---|---|---|
| 1 | Ballot secrecy | Sections 6, 7, 11 |
| 2 | Eligibility | Sections 5, 8 |
| 3 | Uniqueness | Section 8 |
| 4 | Integrity | Sections 7, 8, 9 |
| 5 | Verifiability | Sections 9, 13 |
| 6 | Availability | Sections 12, 14 |
| 7 | Tenant isolation | Section 5 |
| 8 | Least privilege | Section 5 |
| 9 | Separation of duties | Sections 5, 7 |
| 10 | Auditability | Section 9 |
| 11 | Resilience | Sections 12, 14 |
| 12 | Independent assurance | Section 13 |

## 3. Governance

| Role | Security responsibility |
|---|---|
| Security Lead | Owns this policy, threat management, exception approval, security gate (G2) |
| Technical Lead | Implements controls, secure engineering standards |
| Product Owner | Accepts residual risk with Security Lead consultation |
| Election Operations Lead | Operational security procedures at stations and on election day |
| Independent Reviewer | External assessment |
| All personnel | Follow policy; report incidents immediately |

**Exceptions** must be written, time-limited, approved by the Security Lead, and recorded. Exceptions that weaken ballot secrecy, eligibility, uniqueness, or integrity require approval from both the Security Lead and the independent reviewer's acknowledgment.

## 4. Risk and Threat Management

1. A **threat model** is maintained for the platform and updated on any material design change.
2. The model covers at least these adversaries:

| Adversary | Examples |
|---|---|
| External attacker | Credential stuffing, injection, denial of service |
| Malicious voter | Double voting, impersonation, ballot-submission abuse |
| Compromised voter device | Malware, session theft |
| Coercer or vote buyer | Remote pressure on voters (cannot be fully mitigated; see section 6) |
| Malicious insider | Rogue administrator, registrar, developer, operator, or station officer |
| Colluding insiders | Multiple privileged people acting together |
| Candidate or supporter | Pressure on officers, disputed results |
| Infrastructure or provider compromise | Cloud account takeover, supply-chain attack |
| Nation-state or well-resourced actor | Considered at a level appropriate to organizational elections; escalation requires review |

3. The register of risks (EMP-FOUND-001 section 16) is reviewed at every phase exit.

## 5. Identity, Access, and Tenant Isolation

| ID | Control |
|---|---|
| SEC-IAM-01 | All privileged accounts must use multi-factor authentication. Phishing-resistant methods should be preferred for platform administrators and key custodians. |
| SEC-IAM-02 | Authorization must be enforced on the server for every request. UI hiding is not a control. |
| SEC-IAM-03 | Roles and separation-of-duties rules must follow `STAKEHOLDERS_AND_USER_ROLES.md`, enforced in code and tested. |
| SEC-IAM-04 | Access must follow least privilege and be time-bound where practical. |
| SEC-IAM-05 | Role grants, revocations, and failed privileged attempts must be audited. |
| SEC-IAM-06 | Sessions must be short-lived, revocable, and protected (secure, HttpOnly, SameSite cookies or equivalent token protections). |
| SEC-IAM-07 | Authentication endpoints must enforce rate limiting and abuse detection. |
| SEC-IAM-08 | Emergency access must require multiple approvers, be time-boxed, and be reviewed after use. |
| SEC-IAM-09 | Access reviews must occur before each election and quarterly otherwise. |
| SEC-TEN-01 | Tenant identity must derive from the authenticated identity, not client-controlled input alone. |
| SEC-TEN-02 | Tenant isolation must be enforced at the application and database layers (for example row-level security). |
| SEC-TEN-03 | Automated cross-tenant access tests must run in CI and block releases on failure. |
| SEC-TEN-04 | Exports, reports, background jobs, caches, and search must be tenant-scoped. |

## 6. Ballot Secrecy and Privacy Controls

| ID | Control |
|---|---|
| SEC-BAL-01 | Voter identity must not be stored with or linkable to ballot content. |
| SEC-BAL-02 | Ballot records must not contain voter, session, or device identifiers. |
| SEC-BAL-03 | Application logs, traces, analytics, error reports, and backups must not contain ballot selections or data enabling linkage. |
| SEC-BAL-04 | Request and response bodies on the ballot path must never be logged or captured by error tracking or APM tools. |
| SEC-BAL-05 | Timing and ordering metadata must be handled according to the reviewed protocol to resist correlation. |
| SEC-BAL-06 | No role, including platform administrators and database administrators, may have a standard access path to linked ballot-and-voter data. |
| SEC-BAL-07 | Monitoring must expose aggregates only. Small-group breakdowns must be suppressed once implemented (FR-MON-006). |
| SEC-BAL-08 | Polling station user interfaces must prevent officers from viewing ballot screens and must clear session state on completion. |
| SEC-BAL-09 | Privacy impact assessment must be completed before the pilot, covering voter data, telemetry, and backups. |

**Stated limitations.** The platform must not claim that:
- A voter's device is free from malware.
- Remote voting prevents coercion or vote selling.
- Secrecy is guaranteed against an adversary that controls both the platform and all key custodians.

These limitations must be presented plainly in voter-facing and committee-facing materials.

## 7. Cryptography and Key Management

| ID | Control |
|---|---|
| SEC-CRY-01 | Only reviewed, standard cryptographic algorithms and well-maintained libraries may be used. |
| SEC-CRY-02 | No custom cryptographic primitive or protocol may be implemented without specialist review (DEC-006). |
| SEC-CRY-03 | Data must be encrypted in transit (TLS 1.2 or higher; TLS 1.3 preferred) and at rest. |
| SEC-CRY-04 | Election keys must be generated, stored, and used inside managed KMS or HSM boundaries where available. |
| SEC-CRY-05 | Ballot decryption must require multiple key custodians acting together; no single person may unseal ballots. |
| SEC-CRY-06 | The key lifecycle (generation, distribution, storage, use, rotation, destruction) must be documented, rehearsed, and auditable. |
| SEC-CRY-07 | Key custodian activities must be logged with independent witnesses where feasible. |
| SEC-CRY-08 | Secrets must never appear in source code, logs, tickets, or chat. A secrets manager must be used. |
| SEC-CRY-09 | A key compromise response procedure must exist, including rotation and election-impact decisions. |
| SEC-CRY-10 | Custody continuity (absence, loss, handover) must be planned and tested before the pilot. |

## 8. Voting Integrity Controls

| ID | Control |
|---|---|
| SEC-VOT-01 | Voter eligibility and entitlement must be verified server-side before a ballot is issued and again at acceptance. |
| SEC-VOT-02 | Entitlement consumption and ballot acceptance must occur atomically. |
| SEC-VOT-03 | Duplicate-ballot prevention must be verified by concurrency tests, including bursts and retries. |
| SEC-VOT-04 | Submission must be idempotent. Retries must never create duplicate accepted ballots. |
| SEC-VOT-05 | Acceptance must be acknowledged only after durable commit. |
| SEC-VOT-06 | Ballot structure must be validated against the election rules on the server. |
| SEC-VOT-07 | Voting outside the window must be rejected server-side regardless of client state. |
| SEC-VOT-08 | Voter register changes after freeze must follow the exception procedure and require multi-party approval. |
| SEC-VOT-09 | Voter credentials or tokens delivered through notifications must be single-purpose, short-lived, and unusable for impersonation if intercepted after use. |
| SEC-VOT-10 | Anti-automation controls (rate limiting, bot resistance) must protect voter-facing endpoints without excluding legitimate low-end devices. |
| SEC-VOT-11 | Assisted voting must use central eligibility and entitlement checks identical to online voting. |

## 9. Audit, Logging, and Evidence

| ID | Control |
|---|---|
| SEC-AUD-01 | Important actions must create audit records: authentication of privileged users, role changes, configuration changes, register changes, election state transitions, key custody actions, tally operations, certification, exports, and exceptions. |
| SEC-AUD-02 | Audit records must be append-only, tamper-evident (hash chained), and protected from modification or deletion by application and administrator roles. |
| SEC-AUD-03 | Audit chain digests must be periodically anchored outside administrator control. |
| SEC-AUD-04 | Audit records must be privacy-conscious: they must not contain ballot selections or voter-ballot linkage. |
| SEC-AUD-05 | Audit data must be time-synchronized and retained per the retention policy. |
| SEC-AUD-06 | Independent auditors must be able to verify the audit chain with provided tooling. |
| SEC-AUD-07 | Operational logs must be centralized, access-controlled, and monitored for security events. |

## 10. Secure Software Development

| ID | Control |
|---|---|
| SEC-SDL-01 | Documentation must precede implementation. Code must follow the approved requirements and architecture. |
| SEC-SDL-02 | **AI-assisted development must follow approved documentation and must not independently introduce unapproved architectural or security changes.** AI-generated code receives the same review, testing, and scanning as human-written code. |
| SEC-SDL-03 | All changes must go through version control, peer review, and automated checks. |
| SEC-SDL-04 | Critical workflows (eligibility, ballot acceptance, tally, certification, authorization) must have automated tests and require security-focused review. |
| SEC-SDL-05 | Dependencies must be pinned, scanned for known vulnerabilities, and monitored. New dependencies in security-critical code require review. |
| SEC-SDL-06 | Static analysis, secret scanning, and dependency scanning must run in CI; failures block merge or release by severity policy. |
| SEC-SDL-07 | Build artifacts must be reproducible, signed or otherwise integrity-protected, and traceable to a commit. |
| SEC-SDL-08 | Database schema changes must use reviewed, version-controlled migrations. |
| SEC-SDL-09 | Production access must be through controlled, audited paths. Direct production changes outside the release process are prohibited. |
| SEC-SDL-10 | No mock data may be presented as real election data. Test and seed data must be clearly separated and cannot be loaded into production. |
| SEC-SDL-11 | Input validation, output encoding, parameterized queries, and secure defaults must be applied across all interfaces. |
| SEC-SDL-12 | OWASP ASVS (suitable level) and relevant election-system guidance must inform security requirements and review. |

## 11. Data Protection

| ID | Control |
|---|---|
| SEC-DAT-01 | Data classification must define at least: Public, Internal, Confidential (voter personal data), Restricted (keys, tally material, ballots). |
| SEC-DAT-02 | Personal data collection must be minimized to what eligibility verification requires. |
| SEC-DAT-03 | Applicable Liberian legal and data-protection requirements must be reviewed before the pilot (DEC-005), with obligations tracked as requirements. |
| SEC-DAT-04 | Retention and deletion periods must be defined per data class and election type. |
| SEC-DAT-05 | Backups must be encrypted, access-controlled, tested for restore, and must not restore linkage between voters and ballots. |
| SEC-DAT-06 | Production data must not be used in development or test environments. Where unavoidable, it must be anonymized and approved. |
| SEC-DAT-07 | Exports containing personal data must be authorized, logged, and protected. |
| SEC-DAT-08 | Data subject requests and breach notification obligations must be documented in the incident procedure. |

## 12. Infrastructure and Operations

| ID | Control |
|---|---|
| SEC-OPS-01 | Environments must be separated (development, test, staging, production) with distinct credentials. |
| SEC-OPS-02 | Infrastructure must be defined as code, reviewed, and version-controlled. |
| SEC-OPS-03 | Network access must follow least privilege; databases and key services must not be publicly reachable. |
| SEC-OPS-04 | Edge protections (WAF, DDoS mitigation, rate limiting) must be enabled for election windows. |
| SEC-OPS-05 | Systems must be patched on a defined schedule; emergency patching must be possible during freeze with Security Lead approval. |
| SEC-OPS-06 | Cloud accounts must use MFA, least-privilege roles, break-glass controls, and activity monitoring. |
| SEC-OPS-07 | A change freeze must apply before and during the voting window except for approved emergency changes. |
| SEC-OPS-08 | Election-day staffing, escalation paths, and decision authority must be documented. |
| SEC-OPS-09 | Polling station devices must be hardened, managed, and limited to approved functions. Stations must follow documented physical security procedures. |

## 13. Independent Assurance

| ID | Control |
|---|---|
| SEC-ASR-01 | An independent assessment of ballot secrecy, eligibility, integrity, and availability must be completed before any live election (DEC-007). |
| SEC-ASR-02 | The independent reviewer must be engaged during design, not only after build. |
| SEC-ASR-03 | Penetration testing must cover external, authenticated, cross-tenant, and station contexts. |
| SEC-ASR-04 | No critical or high findings may remain unresolved at production approval. Medium findings require documented treatment. |
| SEC-ASR-05 | Auditors and observers must be able to verify tally evidence per their approved scope. |
| SEC-ASR-06 | A **claims register** must record every public security or integrity claim with its evidence. The platform must not claim certification, independent approval, or properties not backed by evidence. |
| SEC-ASR-07 | Findings and remediation must be tracked to closure. |

## 14. Incident Response and Resilience

| ID | Control |
|---|---|
| SEC-INC-01 | An incident response plan must exist with severity levels, roles, communications, and decision authority, including the election committee. |
| SEC-INC-02 | Incidents affecting ballot secrecy, eligibility, integrity, or availability during a voting window must trigger immediate escalation to the Security Lead, Technical Lead, and committee chair. |
| SEC-INC-03 | The plan must define when voting is paused, extended, or suspended, and who authorizes it. |
| SEC-INC-04 | Evidence must be preserved for investigation without exposing ballot content. |
| SEC-INC-05 | Backup, failover, and committed-ballot recovery must be tested before live authorization. |
| SEC-INC-06 | Incident exercises (tabletop and technical) must occur before the pilot and after major changes. |
| SEC-INC-07 | Post-incident reviews must produce tracked corrective actions. |
| SEC-INC-08 | Communications to voters and stakeholders about incidents must be accurate and approved by the committee. |

## 15. Third-Party and Supply Chain Security

| ID | Control |
|---|---|
| SEC-SUP-01 | Providers (hosting, messaging, monitoring) must be assessed for security, data location, and legal exposure before use. |
| SEC-SUP-02 | Third-party services must not receive ballot selections or voter-ballot linkable data. |
| SEC-SUP-03 | Notification providers must be configured so messages contain no sensitive election content. |
| SEC-SUP-04 | Provider access to production data must be restricted, logged, and covered by contract. |
| SEC-SUP-05 | Open-source and commercial dependencies must be inventoried (software bill of materials). |

## 16. Personnel and Operational Security

| ID | Control |
|---|---|
| SEC-PER-01 | Personnel with privileged access must be vetted appropriately and trained on election security and privacy. |
| SEC-PER-02 | Polling station officers must receive training and sign conduct commitments, including the rule against viewing or influencing ballots. |
| SEC-PER-03 | Access must be removed promptly on role change or departure. |
| SEC-PER-04 | Conflict-of-interest declarations must be collected from election administrators, registrars, officers, and custodians. |
| SEC-PER-05 | Personnel must report suspected incidents without fear of penalty for good-faith reports. |

## 17. Compliance with This Policy

- **Verification:** security gate G2 (`PRODUCT_SCOPE_AND_MVP.md`) confirms control implementation with evidence.
- **Control traceability:** each SEC control maps to a requirement, an implementation reference, and a test or review record.
- **Review cycle:** this policy is reviewed at every phase exit, after any incident of severity high or above, and after significant design change.
- **Violations:** breaches of policy are handled through the incident process; deliberate violations may result in access removal and escalation to the organization.

## 18. Open Items

| ID | Item |
|---|---|
| SEC-OI-1 | Cryptographic protocol and key custody model (DEC-006) |
| SEC-OI-2 | Independent assessor selection (DEC-007) |
| SEC-OI-3 | Legal and data-protection requirements (DEC-005) |
| SEC-OI-4 | Voter verification method security properties (DEC-004) |
| SEC-OI-5 | External party for audit chain anchoring |
| SEC-OI-6 | Retention schedule per data class |
| SEC-OI-7 | Named incident commander and committee decision procedure |

## Document Control

| Field | Value |
|---|---|
| Document | Security Master Policy |
| ID | EMP-SEC-001 |
| Version | 0.1 |
| Status | Draft for review |
| Owner | Security Lead |
| Review frequency | At every phase exit and after significant incidents |
| Change control | Version-controlled updates; Security Lead approval |

**End of document.**
