# DEC-002 — Hosting Provider and Region (Decision Record)

**Document ID:** EMP-DEC002-001\
**Version:** 0.1\
**Status:** Recommendation — pending Technical Lead ratification + latency measurement\
**Document Type:** Decision Record\
**Last Updated:** 11 November 2026\
**Parent Documents:** EMP-FOUND-001 §19, EMP-ARCH-001 §16, EMP-SCALE-001 §9\
**Owner:** Technical Lead

---

## 1. Decision Required

Select cloud provider and region for all EMP environments (dev, test, staging, production). Confirmed direction (11 Nov 2026): **AWS**. This record compares `af-south-1` (Cape Town) and the `eu-west` family and makes a recommendation.

## 2. Options Compared

| Criterion | af-south-1 (Cape Town) | eu-west-1 (Ireland) / eu-west-3 (Paris) | Source / note |
|---|---|---|---|
| Latency from West Africa | Lagos ≈120–160 ms; Monrovia expected similar or worse (traffic may route via Europe) | Lagos ≈80–110 ms (Frankfurt/Paris class); Monrovia likely **lower** than Cape Town | Industry measurements 2026; SCALE-R1. “For West Africa, Europe is closer than South Africa.” |
| AZs / HA | 3 AZs | 3 AZs (both) | Supports EMP-ARCH §16 (≥2 AZs) either way |
| Managed Postgres (RDS/Aurora) + failover | Available; fewer instance families, some newer features lag | Full catalogue | af-south-1 service lag is documented (e.g. some Aurora/Bedrock features absent) |
| KMS / HSM (DEC-006) | KMS available; CloudHSM availability must be verified per service | KMS + CloudHSM broadly available | Verify at ratification; custody model depends on it |
| Cost | Small regional premium on many services | Generally baseline pricing | Election peaks are short (EMP-SCALE §10); premium is bounded |
| Data residency | Data stays in Africa (South Africa) | Data leaves Africa (EU) | **DEC-005 counsel must confirm** Liberia Data Protection Act (enacted 2026) cross-border rules before production data is placed |
| DDoS / WAF / CDN edge | Available | Available | EMP-ARCH §16 either way |

## 3. Recommendation

**Primary: `eu-west-3` (Paris) or `eu-west-1` (Ireland) for the pilot**, because (a) measured West-Africa latency favours Europe over Cape Town, (b) fullest managed Postgres/KMS/HSM catalogue for the security-critical path, and (c) baseline pricing. Prefer Paris on geography (shorter path to West Africa); prefer Ireland if a needed service is missing in Paris — verify service parity at ratification.

**Fallback: `af-south-1`** if DEC-005 counsel requires African data residency, or if Liberia measurements contradict the regional data.

**This recommendation is conditional.** EMP-SCALE-001 §1: no capacity or latency may be represented as achieved until measured. DEC-002 closes only after:

1. Latency probe from at least two Liberian networks (e.g. Monrovia university + mobile) to `af-south-1`, `eu-west-1`, `eu-west-3` — record p50/p95.
2. Service-parity check: RDS PostgreSQL HA + PITR, ElastiCache Redis, KMS (and CloudHSM if DEC-006 needs it), S3 versioning, WAF — in the chosen region.
3. DEC-005 counsel view on cross-border transfer under the Liberia Data Protection Act 2026.

## 4. Consequences

| Area | Consequence |
|---|---|
| Architecture | EMP-ARCH §16 sizing (3 API instances, managed PG + standby, PgBouncer, Redis, S3, CDN/WAF) applies unchanged in either region |
| Scalability | SCALE-Q/§9 sizing process unchanged; staging must be production-like **in the chosen region** for G3 evidence |
| Security | SEC-OPS/SEC-SUP: provider assessment recorded; EU placement adds GDPR-adjacent processor terms — counsel to confirm Liberian Act position |
| Cost | Pilot cost model (DEC-009 input): short election peaks; scale up for window, down after |

## 5. What This Decision Does Not Do

- Does not authorize production data before DEC-005 review and Phase 4/5 gates.
- Does not fix instance sizes — those come from EMP-SCALE §9.1 load-test process in Phase 1/4.
- Does not select DEC-003 (framework/ORM) or DEC-006 (crypto/KMS custody) — KMS availability is an input to DEC-006, not its decision.

## Document Control

| Field | Value |
|---|---|
| Document | DEC-002 Hosting Decision Record |
| ID | EMP-DEC002-001 |
| Version | 0.1 |
| Status | Recommendation pending ratification |
| Owner | Technical Lead |
| Change control | New version on ratification or region change |

**End of document.**
