# STR-101 Code Reference Traceability in Calculation Outputs

## Objective

Provide explicit code references in load-rating calculation outputs so engineers can identify the source implementation for each workflow and governing equations.

## What Was Implemented

- Added shared helper `buildCodeReferences(...)` in `/shared/cli/shim-core.js`.
- Updated load-rating CLI shims to emit a `codeReferences` block in output JSON:
  - `/apps/bridge-load-rating/cli.js`
  - `/apps/steel-girder-rating/cli.js`
  - `/apps/composite-steel-girder/cli.js`
  - `/apps/cored-slab-rating/cli.js`
  - `/apps/rc-flat-slab-rating/cli.js`
  - `/apps/cmp-culvert-rating/cli.js`
  - `/apps/prestressed-girder-type3-rating/cli.js`

Each `codeReferences` block includes:
- `enginePath`
- `sourceFiles` (full list of relevant implementation files used by the workflow)
- `governingCode`
- `keyFunctions`
- `sectionLossHandling` for steel/rebar/prestress pathways

## Section-Loss Contract Compliance

The canonical deterioration contract remains explicit in every load-rating CLI output:
- `steelPct`
- `rebarPct`
- `prestressPct`

And each app continues to map these to active inputs or explicit N.A. behavior via `canonicalDeterioration.applicability`.

## Verification

- `node shared/cli/test-str85-shims.js` : pass
- `node shared/cli/test-str90-governance.js` : pass
- `node shared/cli/test-str86-contract.js` : expected deterministic fingerprint changes due to new `codeReferences` output field.

## CTO Escalation Decision

No new tool request is required for STR-101.
- Existing bridge engineering tools in `/shared/library/bridge-engineering-tools.json` fully cover this requirement.
- The enhancement was implemented directly in existing CLI shims and shared contract code.
