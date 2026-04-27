# STR-56 Shared UI Kit Migration Notes

## Shared Kit Source
- New shared stylesheet: `/shared/ui/rating-ui-kit.css`
- Purpose: normalize rating-app input and report screens (tokens, panel layout, form controls, tables, summary/report blocks, tabs, and responsive behavior).

## Apps Migrated In STR-56
- `apps/cored-slab-rating/index.html`
  - Updated to consume `../../shared/ui/rating-ui-kit.css`.
  - Strand-layout, deterioration controls, tabbed inputs, and report rendering now consume shared kit classes/tokens.
- `apps/prestressed-girder-type3-rating/index.html`
  - Migrated from bespoke single-column screen to shared panelized input/report layout.
  - Uses shared kit for all form/report components.
- `apps/rc-flat-slab-rating/index.html`
  - Migrated from bespoke single-column screen to shared panelized input/report layout.
  - Uses shared kit for all form/report components.
- `apps/cmp-culvert-rating/index.html`
  - Migrated from bespoke single-column screen to shared panelized input/report layout.
  - Uses shared kit for all form/report components.

## Basic Regression Verification
- Rating engines validated unchanged by automated tests:
  - `node apps/cored-slab-rating/test-rating-engine.js`
  - `node apps/prestressed-girder-type3-rating/test-rating-engine.js`
  - `node apps/rc-flat-slab-rating/test-rating-engine.js`
  - `node apps/cmp-culvert-rating/test-rating-engine.js`

## Remaining Legacy Regions (Follow-up Candidates)
- `apps/bridge-load-rating/styles.css`
  - Still keeps a local style copy with overlapping shared-kit concerns.
- `apps/composite-steel-girder/styles.css`
  - Still keeps a local style copy with overlapping shared-kit concerns.
- `apps/steel-girder-rating/styles.css`
  - Still keeps a local style copy with overlapping shared-kit concerns.

Recommended follow-up ticket:
- Extract remaining app-specific deltas into thin local overrides and move baseline presentation fully to `/shared/ui/rating-ui-kit.css` for all rating apps.
