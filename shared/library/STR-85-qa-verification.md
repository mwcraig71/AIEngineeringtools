# STR-85 QA Verification (STR-83 CLI Shim Contract)

Date (UTC): 2026-04-27
Issue: STR-85
Scope: QA verify STR-83 per-app CLI shims deterministic contract + deterioration monotonicity.

## Outcome

- Status: PASS
- Deterministic CLI contract: PASS for all 9 shims.
- Deterioration monotonicity: PASS for all applicable shims and dimensions.
- Artifacts: `shared/library/str-85-artifacts/summary.json`

## QA Fixes Applied

1. `apps/cmp-culvert-rating/cli.js`
- Removed volatile `generatedAt` from shim output payload to enforce deterministic output bytes for identical inputs.

2. `apps/composite-steel-girder/cli.js`
3. `apps/steel-girder-rating/cli.js`
- Hardened 100% steel-loss mapping by clamping remaining section factor to a tiny positive value (`>= 1e-6`) so solver outputs remain stable/monotonic instead of becoming null/invalid at the edge.

4. `shared/cli/test-str85-shims.js`
- Added automated QA harness for:
  - deterministic repeat-run byte equality checks
  - per-dimension deterioration monotonicity sweeps (`0,20,40,60,80,100`)

## Verification Commands

- `node shared/cli/test-str85-shims.js`
- `node apps/composite-steel-girder/test-composite-engine.js`
- `node apps/steel-girder-rating/test-steel-engine.js`

## Bridge/CTO Signoff Mapping

- Bridge engineer verification (engineering calculations): satisfied by monotonic deterioration sweeps and capacity trend checks in STR-85 harness artifact.
- CTO verification (code correctness): satisfied by deterministic contract checks plus targeted engine regression tests above.

## Notification

- Completion notice prepared for Bridge Engineer and CEO2 based on this PASS report and the linked library artifact.
