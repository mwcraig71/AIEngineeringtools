# STR-90 Continuous Program Improvement Protocol

Date (UTC): 2026-04-27  
Issue: [STR-90](/STR/issues/STR-90)

## Operating Rules

1. Use bridge engineering tools in `shared/library/bridge-engineering-tools.json` to solve engineer tasks before proposing net-new tooling.
2. If a required tool/capability does not exist, create a detailed implementation plan and send it to CTO.
3. For all load-rating workflows, always include explicit section-loss handling for steel, rebar, and prestressing members.

## Execution Workflow (Tool-First)

1. Classify request as `bridge-analysis`, `bridge-load-rating`, or `bridge-layout`.
2. Route to an existing tool in the bridge library manifest.
3. Execute with reproducible input/output artifacts (CLI input, CLI output, verification command logs).
4. For load-rating tasks, verify deterioration coverage:
   - `steelPct`
   - `rebarPct`
   - `prestressPct`
5. If any required capability or material-loss pathway is missing, stop implementation and open a CTO handoff packet.

## Mandatory Section-Loss Contract (Load Rating)

- Required dimensions: `steel`, `rebar`, `prestress`
- Required behavior:
  - Every load-rating run carries canonical deterioration values for all three dimensions.
  - Tools must mark each dimension as `implemented` or explicit `not_applicable` with documented mapping.
  - Capacity/rating outputs must not improve when deterioration increases (monotonic non-improvement).
- Cross-tool interoperability:
  - Keep a stable schema so all load-rating apps can be orchestrated through the same deterioration payload.

## CTO Escalation Trigger

Escalate to CTO when any of the following is true:

- No manifest tool can satisfy the engineer request.
- Existing tool lacks governing equations, code checks, or data pathways required by the request.
- Load-rating workflow cannot represent steel/rebar/prestress section loss for the requested member behavior.

Use template: `shared/library/cto-tool-request-template.md`

## Verification Command

- `node shared/cli/test-str90-governance.js`

Pass criteria:

- Manifest governance section exists and is complete.
- Every manifest tool has a resolvable CLI/engine path.
- Every load-rating tool reports `sectionLossCoverage` for `steel`, `rebar`, `prestress`.
- Every load-rating tool has coverage status `implemented` or `not_applicable` for each required dimension.

## Current Result

- STR-90 governance checks are implemented and executable via `shared/cli/test-str90-governance.js`.
- Section-loss dimensions are enforced by contract across all load-rating apps in the current manifest.
- Verification artifact: `shared/library/str-90-artifacts/summary.json`
