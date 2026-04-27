# STR-86 CLI Contract Hardening (9 Apps)

Date (UTC): 2026-04-27  
Issue: STR-86  
Scope: Implement STR-72 CLI contract hardening across the 9 canonical bridge apps.

## Outcome

- Status: PASS
- Deterministic output fingerprints: PASS for all 9 apps.
- Structured JSON stderr on CLI failures: PASS for all 9 apps.
- `--format mdx` contract: PASS (supported only by `curved-steel-girder-layout`; rejected elsewhere).
- Section-loss contract surface for load-rating apps: PASS with canonical `{steel,rebar,prestress}` deterioration dimensions plus explicit applicability metadata.

## Changes Applied

1. `shared/cli/test-str86-contract.js`
- Added a dedicated STR-86 contract harness covering:
  - `--help` behavior
  - deterministic repeat-run output equality
  - fingerprint match against manifest `expectedOutputFingerprint`
  - structured JSON stderr for invalid args
  - `--format mdx` support only on `curved-steel-girder-layout`
  - canonical deterioration contract checks for all load-rating tools

2. `shared/library/bridge-engineering-tools.json`
- Bumped `libraryVersion` to `1.4.1`.
- Updated stale fingerprint for `cmp-culvert-rating`.
- Updated `sectionLossCoverage` from `planned` to `implemented` for remaining dimensions now handled via canonical deterioration + explicit N.A. pathways.

3. `shared/library/str-86-artifacts/summary.json`
- Stored machine-readable STR-86 contract verification artifact.

## Verification Commands

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

## QA Handoff

- QA verification ticket required by STR-86 deliverables has been prepared with references to:
  - `shared/library/STR-86-cli-contract-hardening.md`
  - `shared/library/str-86-artifacts/summary.json`
  - `shared/cli/test-str86-contract.js`
