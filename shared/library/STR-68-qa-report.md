# STR-68 QA Re-Verification Evidence (STR-67) - Dataset Reconciliation

Date: 2026-04-27 (UTC)
Issue: STR-67
Related QA thread: STR-68

## Reconciliation Outcome

The shared NC legal-load module has been reconciled to the authoritative Fig 6-147 baseline previously documented in STR-20/STR-21 issue history.

Updated file:
- `apps/_shared/load-trucks/nc-noninterstate-fig6-147.js`

Updated deterministic checks:
- `test/str67-load-trucks.test.js`

## Corrected Fixture Values

- `N01`: 2 axles, `grossK=27.00`
- `N05`: 4 axles, `grossK=69.85`
- `N10`: 4 axles, `grossK=66.15`
- `N16`: 5 axles, `grossK=90.00`
- `EV3`: 3 axles, `grossK=86.00`

## Structural Wiring Re-check

- Shared module path exists:
  - `apps/_shared/load-trucks/nc-noninterstate-fig6-147.js`
- Bridge live-load wrapper remains shared-source compatible:
  - `apps/bridge-live-load/trucks.js`

## Validation Run

Command:

```bash
npm test
```

Result summary:

- Total tests: 28
- Passed: 28
- Failed: 0

Includes STR-67 assertions for:
- shared module truck catalog coverage (`N01..N16`, `EV2`, `EV3`)
- corrected deterministic fixtures and axle counts
- corrected legacy adapter output shape for `N10`
- bridge-live-load re-export compatibility

## QA Request

Please re-run STR-68 against this corrected dataset revision for closure.

## Final Canonical-Path Rerun (Post STR-87)

Trigger context:
- Bridge Engineer confirmed authoritative Fig 6-147 fixture baselines and STR-87 completion for canonical publish.

Canonical project-path verification (`/paperclip/instances/default/projects/245829e2-f68c-4d4a-b82b-1e471525ada7/30537a16-8a33-4542-bb23-56f32c773e6b/_default`):

- Shared module present: `apps/_shared/load-trucks/nc-noninterstate-fig6-147.js`
- Shared helper present: `apps/_shared/load-trucks/rating-app-adoption.js`
- Bridge wrapper present: `apps/bridge-live-load/trucks.js`
- Deterministic fixture test present: `test/str67-load-trucks.test.js`

Authoritative fixture spot-check (gross kips / axle count):
- `N01`: `27.00` / `2`
- `N05`: `69.85` / `4`
- `N10`: `66.15` / `4`
- `N16`: `90.00` / `5`
- `EV3`: `86.00` / `3`

Legal-load lane behavior and deterioration carry-through:
- `apps/_shared/load-trucks/rating-app-adoption.js` enforces truck-only legal lane behavior (`laneLoad = 0` for non-HL93).
- Output carry-through includes mandatory `steelPct`, `rebarPct`, `prestressPct` fields.

Execution evidence:
- `node --test test/str67-load-trucks.test.js` -> `4 passed, 0 failed`
- `node apps/bridge-live-load/test-analysis.js` -> `9 passed, 0 failed`
- `node apps/bridge-load-rating/test-rating-engine.js` -> `170 passed, 0 failed`
- `node apps/composite-steel-girder/test-composite-engine.js` -> `54 passed, 0 failed`
- `node apps/steel-girder-rating/test-steel-engine.js` -> `25 passed, 0 failed`
- `node apps/cored-slab-rating/test-rating-engine.js` -> all tests passed
- `node apps/prestressed-girder-type3-rating/test-rating-engine.js` -> `35 passed, 0 failed`
- `node apps/rc-flat-slab-rating/test-rating-engine.js` -> `28 passed, 0 failed`

Final recommendation:
- STR-68 acceptance criteria are satisfied. Close STR-68 and unblock parent closeout sequencing.
