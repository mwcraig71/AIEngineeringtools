# STR-93 QA Review

Date: 2026-04-27  
Issue: STR-93

## Scope

- Restore the pre-`50cd59b` `index.html` UI for the 7 impacted load-rating/load-analysis apps to remove the starter-template regression and bring back original app screens (including tabbed layouts where applicable).

## Changes Applied

- Reverted `index.html` to pre-regression (`bd88b12`) versions for:
  - `apps/bridge-live-load/index.html`
  - `apps/bridge-load-rating/index.html`
  - `apps/composite-steel-girder/index.html`
  - `apps/cored-slab-rating/index.html`
  - `apps/prestressed-girder-type3-rating/index.html`
  - `apps/rc-flat-slab-rating/index.html`
  - `apps/steel-girder-rating/index.html`

## Verification Evidence

- File-level rollback verification:
  - `git diff --name-only bd88b12 -- <7 restored index files>` -> no output (exact match to pre-regression versions)
- Regression marker removal:
  - `STRINTEG_STARTER_TEMPLATE_V1` no longer present in all 7 restored pages.
- Engine tests (targeted):
  - `node apps/bridge-live-load/test-analysis.js` -> PASS
  - `node apps/bridge-load-rating/test-rating-engine.js` -> PASS
  - `node apps/composite-steel-girder/test-composite-engine.js` -> PASS
  - `node apps/cored-slab-rating/test-rating-engine.js` -> PASS
  - `node apps/prestressed-girder-type3-rating/test-rating-engine.js` -> PASS
  - `node apps/rc-flat-slab-rating/test-rating-engine.js` -> PASS
  - `node apps/steel-girder-rating/test-steel-engine.js` -> PASS

## QA Request

Please perform QA review for STR-93 focused on:

1. UI regression validation in the 7 listed apps (ensure original input/result views render, including tab controls where expected).
2. Smoke interaction checks for key inputs/actions in each restored page.
3. Confirmation that no shared-shell starter-template UI remains on these pages.
