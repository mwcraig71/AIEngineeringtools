# STR-88 QA Verification

Date (UTC): 2026-04-27
Issue: [STR-88](/STR/issues/STR-88)
Parent: [STR-86](/STR/issues/STR-86)

## Scope
QA verification for STR-86 CLI contract hardening across the 9 canonical bridge apps.

## Commands Executed
- `node shared/cli/test-str86-contract.js`
- `node shared/cli/test-str85-shims.js`
- `node apps/bridge-live-load/test-analysis.js`
- `node apps/bridge-load-rating/test-rating-engine.js`
- `node apps/cmp-culvert-rating/test-rating-engine.js`
- `node apps/composite-steel-girder/test-composite-engine.js`
- `node apps/cored-slab-rating/test-rating-engine.js`
- `node apps/curved-steel-girder-layout/test-layout-engine.js`
- `node apps/prestressed-girder-type3-rating/test-rating-engine.js`
- `node apps/rc-flat-slab-rating/test-rating-engine.js`
- `node apps/steel-girder-rating/test-steel-engine.js`

## Results
- STR-86 contract harness: PASS
  - `--help` contract: PASS (all 9)
  - Structured JSON stderr on invalid args: PASS (all 9)
  - Deterministic repeat-run bytes/fingerprint: PASS (all 9)
  - MDX support policy: PASS (`curved-steel-girder-layout` only)
  - Canonical deterioration keys/applicability: PASS
- STR-85 deterministic + monotonic harness: PASS
- App regression suites: PASS across all 9 app test files.

## Manifest Verification
File: `shared/library/bridge-engineering-tools.json`

- `libraryVersion`: `1.4.1`
- `cmp-culvert-rating` fingerprint:
  - `sha256:fec371c1c9782eb0e0223333b8310af2a2816ba227a8c8a087baf20606ae90e3`
- `sectionLossCoverage` for load-rating apps:
  - `bridge-load-rating`: implemented/implemented/implemented
  - `cmp-culvert-rating`: implemented/implemented/implemented
  - `composite-steel-girder`: implemented/implemented/implemented
  - `cored-slab-rating`: implemented/implemented/implemented
  - `prestressed-girder-type3-rating`: implemented/implemented/implemented
  - `rc-flat-slab-rating`: implemented/implemented/implemented
  - `steel-girder-rating`: implemented/implemented/implemented

## Residual Risk Notes
- Regression harnesses are comprehensive for current canonical fixtures.
- No additional residual blockers identified for STR-88 acceptance.
