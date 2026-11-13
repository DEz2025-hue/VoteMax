# Accessibility Review — Voter Flow (Internal)

**Document ID:** EMP-A11Y-001\
**Version:** 0.1\
**Status:** Internal review complete — external audit still required for a conformance claim\
**Document Type:** Accessibility Review (NFR-ACC-001…004, WCAG 2.2 AA target)\
**Last Updated:** 11 November 2026\
**Owner:** Technical Lead

> This is an internal checklist review, not a WCAG conformance certification (claim N-7 in `CLAIMS_REGISTER.md`). Screen-reader testing with real assistive technology remains a Phase 4/5 task.

## 1. Findings Against the Voter Flow (`apps/web/app/vote`)

| Check | Result | Note |
|---|---|---|
| Labels on all inputs | Pass | Every input is inside a `<label>`; ballot choices use `<fieldset>`/`<legend>` per position |
| Keyboard operation | Pass | Native radio/checkbox/button controls only; no custom widgets |
| Error identification | Pass | Errors use `role="alert"` and plain language (FR-SUP-004) |
| Status messages | Pass | Step changes are headings; receipt step is a heading + text |
| Color contrast | **Fixed** | Eyebrow text `#8a6d00` (≈3.9:1 at 13px) darkened to `#6d5500` (≈5.9:1) on home/vote/admin |
| Target size | Pass | Inputs/buttons ≥ 40px tall; candidate rows padded 10px |
| No color-only meaning | Pass | Selections are native checked controls, not color |
| Reduced motion | Pass | No animations used |
| Low bandwidth / low-end | Pass (by design) | Ballot page is a single client component; First Load 108 kB shared; throttled-network browser test (EMP-SCALE §7) still to run in staging |
| Language | Pass | Plain-language voter copy; coercion limitation stated on home and vote pages |
| OTP usability | Pass | 6-digit code, 10-minute expiry, `inputMode="numeric"`, `autoComplete="one-time-code"` (added 12 Nov 2026, Phase 5) |
| Assisted path (NFR-ACC-004) | Implemented | Station flow exists; officer training/rehearsal is Phase 5 |

## 2. Remaining Actions

| # | Action | Phase |
|---|---|---|
| A-1 | Screen-reader pass (NVDA/JAWS/VoiceOver) on the vote flow with fixes | 4 (external) / 5 |
| A-2 | ~~`autoComplete="one-time-code"` + SMS/email autofill hints once providers land~~ **Done 12 Nov 2026** (`apps/web/app/vote` OTP input); SMS autofill behaviour to confirm once a real provider lands (F-04) | 5 |
| A-3 | Throttled-network (slow-3G profile) completion test in staging | 4 gate evidence |
| A-4 | 200% zoom / reflow check in the external audit | 4 (external) |

## Document Control

| Field | Value |
|---|---|
| Document | Accessibility Review |
| ID | EMP-A11Y-001 |
| Version | 0.1 |
| Status | Internal review |
| Owner | Technical Lead |
| Change control | Version-controlled updates |

**End of document.**
