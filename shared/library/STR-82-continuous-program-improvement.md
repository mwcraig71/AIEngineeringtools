# STR-82 Continuous Program Improvement Protocol

Source issue: [STR-82](/STR/issues/STR-82)

## Operating Rules

1. Use bridge engineering tools in `shared/library/bridge-engineering-tools.json` first for engineer requests.
2. If no existing tool satisfies the request, prepare a detailed implementation plan and send it to CTO.
3. For all load-rating workflows, always account for section loss in steel, rebar, and prestressing.

## Tool-First Execution Workflow

1. Map incoming request to a tool in the bridge library manifest.
2. Run the tool and collect evidence (inputs, outputs, checks, and test command results).
3. Confirm the deterioration pathway includes steel/rebar/prestress section-loss behavior.
4. If one or more deterioration dimensions are missing, classify as a tooling gap and open CTO handoff.

## Mandatory Section-Loss Contract (Load Rating)

- Required dimensions: `steel`, `rebar`, `prestress`
- Required behavior:
  - Each dimension has explicit user/model input with percent-loss range `[0, 100]`.
  - Outputs report original vs effective section quantities for each applicable material.
  - Sensitivity checks enforce monotonic non-improvement of capacity/rating with increased loss.
- If a material is not physically present in a member type, the tool must still expose a documented zero/N.A. pathway and preserve a common deterioration schema for cross-tool interoperability.

## Current Gap Register (from library + code review)

| Tool | Steel loss | Rebar loss | Prestress loss | Gap summary |
|---|---:|---:|---:|---|
| bridge-load-rating | planned | implemented | planned | Missing unified steel/prestress deterioration fields in current rating inputs/outputs |
| composite-steel-girder | implemented | planned | planned | Missing rebar/prestress section-loss dimensions for composite reinforcement variants |
| cored-slab-rating | planned | planned | implemented | Missing structural steel/rebar loss dimensions in deterioration contract |
| steel-girder-rating | implemented | planned | planned | Missing rebar/prestress dimensions for unified deterioration contract |

## CTO Handoff Template (When Tool/Capability Is Missing)

Use this exact structure when escalating:

1. Problem statement
   - Engineer task requested
   - Why current tools cannot satisfy it
2. Engineering basis
   - Governing specifications/code articles (AASHTO/agency-specific)
   - Required equations and assumptions
3. Data contract
   - Inputs (units, ranges, defaults)
   - Outputs (capacity/rating plus deterioration transparency fields)
   - Backward compatibility requirements
4. UX requirements
   - Required form fields
   - Validation and error behavior
   - Export/import expectations
5. Verification plan
   - Unit tests, regression tests, monotonic deterioration checks
   - Hand-calculation anchor cases
6. Acceptance criteria
   - Functional definition of done
   - Traceability artifacts required in `shared/library/`

## CTO Action Plan for Current Gaps

1. Build a shared deterioration adapter for load-rating apps with canonical keys:
   - `steelLossPercent`
   - `rebarLossPercent`
   - `prestressLossPercent`
2. Add adapter integration to the four gap tools in this sequence:
   - `bridge-load-rating`
   - `steel-girder-rating`
   - `cored-slab-rating`
   - `composite-steel-girder`
3. Add per-tool output block:
   - `deteriorationSummary.materials.{steel,rebar,prestress}.{original,effective}`
4. Add monotonic deterioration tests that sweep `0 -> 100` for each dimension independently and jointly.
5. Update manifest `sectionLossCoverage` from `planned` to `implemented` as each tool is completed.
