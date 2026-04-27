# STR-68 QA Report: NC Legal-Load Truck Integration

Source issue: [STR-68](/STR/issues/STR-68)
Build issue under test: [STR-67](/STR/issues/STR-67)
Parent issue: [STR-20](/STR/issues/STR-20)

## Summary

- QA scope executed for NC legal-load integration checks (data fidelity, UI/selection surface, engineering behavior, deterioration metadata/monotonicity).
- Current result: **Partially complete**.
- Blocking defect: shared module path required by [STR-67](/STR/issues/STR-67) (`apps/_shared/load-trucks/nc-noninterstate-fig6-147.js`) is not present yet.

## Evidence

### 1. Data Fidelity (N01..N16 + EV2/EV3)

Verification script confirms:
- 18 NC non-interstate legal vehicles present: N01..N16 + EV2 + EV3
- No missing or extra NC legal codes
- Gross vehicle weights and axle spacing definitions are internally consistent with encoded truck definitions

Computed catalog snapshot:

- `N01` 2 axles, 27.00k, spacing `14`
- `N05` 4 axles, 69.85k, spacing `9/4/4`
- `N10` 4 axles, 66.15k, spacing `9/9/4`
- `N16` 5 axles, 90.00k, spacing `9/4/9/4`
- `EV3` 3 axles, 86.00k, spacing `15/4`

### 2. Engineering Behavior (moving-load spot checks)

Executed tests:

- `node apps/bridge-live-load/test-analysis.js`
- `node apps/bridge-load-rating/test-rating-engine.js`
- `node apps/composite-steel-girder/test-composite-engine.js`
- `node apps/steel-girder-rating/test-steel-engine.js`
- `node apps/cored-slab-rating/test-rating-engine.js`
- `node apps/prestressed-girder-type3-rating/test-rating-engine.js`
- `node apps/rc-flat-slab-rating/test-rating-engine.js`

Result: all executed suites passed (`321 passed`, `0 failed` total).

### 3. Deterioration Schema + Monotonicity

Observed from test suites and output payload checks:

- Deterioration fields for steel/rebar/prestress are represented in rating outputs and scenario summaries for affected apps.
- Increasing deterioration inputs reduce governing RF/capacity monotonically in tested steel, RC, and prestressed scenarios.

## Findings

### FAIL: Required shared truck module architecture not implemented yet

`STR-67` requires shared module extraction to:
- `apps/_shared/load-trucks/nc-noninterstate-fig6-147.js`

Current repository state:
- NC legal truck data remains in `apps/bridge-live-load/trucks.js`
- No `apps/_shared/load-trucks/` module present

Impact:
- Functional behavior mostly passes, but architecture acceptance criterion in [STR-67](/STR/issues/STR-67) is not satisfied.

## Recommendation

- Keep [STR-68](/STR/issues/STR-68) in progress/blocked until [STR-67](/STR/issues/STR-67) provides the shared-module implementation and confirmation from CTO/Bridge Engineer.
- After that update lands, rerun the same QA script list and close with final signoff.

## Re-Review Update (CTO handoff comment `f6b4d1dc-b102-41f5-b15b-dc95f3de0d59`)

A second QA pass was performed against the CTO workspace handoff (`/paperclip/instances/default/workspaces/6be046da-8d5a-4065-8855-c4782f939079`) because the referenced artifacts were not present in this issue workspace.

### Verified as implemented
- `apps/_shared/load-trucks/nc-noninterstate-fig6-147.js` exists
- `apps/_shared/load-trucks/rating-app-adoption.js` exists
- `apps/bridge-live-load/trucks.js` wrapper exists
- Listed app pages include shared scripts and mount wiring
- `npm test` in CTO workspace passes `28/28`

### Blocking QA failure

The new STR-67 shared NC catalog appears inconsistent with prior Fig 6-147 values used in project baseline checks.

Sample mismatch (gross kips):

- `N01`: prior `27.00` vs STR-67 handoff `40`
- `N05`: prior `69.85` vs STR-67 handoff `64`
- `N10`: prior `66.15` vs STR-67 handoff `84`
- `N16`: prior `90.00` vs STR-67 handoff `114`
- `EV3`: prior `86.00` vs STR-67 handoff `72`

Also, axle counts differ on key vehicles (`N10`, `N16`, `EV3`).

Given STR-68 scope requires data fidelity validation to Fig 6-147, this handoff cannot be accepted as final without engineering/source reconciliation.
