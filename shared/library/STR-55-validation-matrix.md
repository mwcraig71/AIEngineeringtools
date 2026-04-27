# STR-55 Regression + Hand-Calc Validation Matrix

Date (UTC): 2026-04-26
Issue: STR-55
Reviewer Agent: QA Engineer

## Summary

- Scope: 8 bridge apps
- Regression outcome: PASS (all suites green)
- Total explicit test counts reported by suites: 338 passed, 0 failed
- Additional cored-slab suite status: pass (assertion-based script without count footer)

## Validation Matrix

| App | Regression command | Regression result | Hand-calc / deterministic checkpoint | Status |
|---|---|---:|---|---|
| bridge-live-load | `node apps/bridge-live-load/test-analysis.js` | 9 passed / 0 failed | `Mmax = wL^2/8 = 200 kip-ft` for `L=40 ft, w=1 kip/ft`; continuous 2-span interior support `M = -wL^2/8 = -312.5 kip-ft` | PASS |
| bridge-load-rating | `node apps/bridge-load-rating/test-rating-engine.js` | 168 passed / 0 failed | Tee-beam flexure hand check `Mn ≈ 414.5 kip-ft` (`As=3.16 in^2, d=27 in, fc'=3 ksi, fy=60 ksi`) and monotonic RF loss trend verified | PASS |
| cmp-culvert-rating | `node apps/cmp-culvert-rating/test-rating-engine.js` | 27 passed / 0 failed | Fill-height sweep and deterioration sensitivity monotonicity validated across ring/bending/buckling checks | PASS |
| composite-steel-girder | `node apps/composite-steel-girder/test-composite-engine.js` | 52 passed / 0 failed | Composite `Mp=3732.0 kip-ft > steel Mp=1916.7 kip-ft`; `Mn=3641.4 kip-ft <= Mp` and section-loss reduction validated | PASS |
| cored-slab-rating | `node apps/cored-slab-rating/test-rating-engine.js` | all assertions passed | Strand-area and centroid invariance check: `Aps = 16 x 0.153 in^2`, weighted `dp = 18 in`; symmetric multi-row equals single-row capacity | PASS |
| prestressed-girder-type3-rating | `node apps/prestressed-girder-type3-rating/test-rating-engine.js` | 33 passed / 0 failed | Deterioration matrix verified with strictly decreasing RF for rebar/stirrup/strand loss vectors | PASS |
| rc-flat-slab-rating | `node apps/rc-flat-slab-rating/test-rating-engine.js` | 26 passed / 0 failed | Baseline/partial/severe loss envelope and CFRP strip width effects validated; monotonic degradation checks pass | PASS |
| steel-girder-rating | `node apps/steel-girder-rating/test-steel-engine.js` | 23 passed / 0 failed | W33x130 benchmark (`d=33.09 in`, `A=38.3 in^2`), `Mn=1721.5 kip-ft <= Mp=1916.7 kip-ft`, LTB reduction with increasing `Lb` verified | PASS |

## Library Registration

Completed app entries are published in:

- `shared/library/bridge-engineering-tools.json`

The manifest now contains all 8 completed bridge apps with entry point, engine path, and test command.
