# STR-100: SEQARCH Web for Load Rating Tool Ideas

## Scope

This package applies the bridge engineering library-first governance contract:

1. Use existing bridge engineering tools in `shared/library/bridge-engineering-tools.json` first.
2. If a required tool does not exist, escalate with a detailed CTO build plan.
3. Every load-rating workflow includes section-loss accounting for `steel`, `rebar`, and `prestress` as active inputs or explicit N.A./zero pathways.

## Existing Tool Coverage (Use First)

The following load-rating tools already exist and should be routed first for engineer requests:

- `bridge-load-rating` (RC tee beam)
- `steel-girder-rating`
- `composite-steel-girder`
- `cored-slab-rating` (prestressed)
- `prestressed-girder-type3-rating`
- `rc-flat-slab-rating`
- `cmp-culvert-rating`
- Shared support: `bridge-live-load`, `curved-steel-girder-layout`

All listed rating tools have explicit section-loss coverage for steel/rebar/prestress per manifest contract.

## SEQARCH Web Gaps Requiring New Tools

No existing tool directly covers the following high-value SEQARCH web requests. CTO build planning is required.

## CTO Handoff Plan A: Reinforced Concrete Box Culvert Rating (Multi-Cell)

### 1. Problem Statement

- Engineer task request: rate RC box culverts (single/multi-cell) for flexure, shear, and axial effects with soil-structure interaction simplifications.
- Why current tools cannot satisfy it: `cmp-culvert-rating` targets corrugated metal pipe, not reinforced concrete box culvert behavior/details.
- Urgency / project impact: frequent local agency inventory needs; currently no deterministic in-house web workflow.

### 2. Engineering Basis

- Governing standards/specifications: AASHTO LRFD, AASHTO MBE, state DOT culvert manuals.
- Required equations and assumptions: strip-method demand, earth load + surcharge combinations, section flexure/shear with RC detailing.
- Required load combinations and limit states: Strength I / Service / permit/legal rating cases mapped to LRFR/LFR workflows.

### 3. Data Contract

- Input schema: geometry by cell/wall/slab, fill height, material strengths, reinforcement layers, boundary assumptions, live-load setup.
- Output schema: inventory/operating RFs, controlling limit state/location, detailed demand/capacity traces.
- Deterioration schema:
  - `steelPct`: applies to supplemental structural steel if present, else explicit N.A.=0 path
  - `rebarPct`: applies to slab/wall flexural and shear reinforcement
  - `prestressPct`: explicit input retained for contract consistency; defaults to 0 when no prestressing exists
- Backward compatibility expectations: CLI JSON contract stable with versioned schema.

### 4. UX and Workflow Requirements

- UI fields and validations: culvert dimensions, fill/soil parameters, reinforcement maps, load model, deterioration triplet.
- CLI contract: deterministic `json|text|mdx`, schema-validated input, golden-output reproducibility.
- Evidence artifacts: sample inputs, hand-check sheets, monotonic deterioration sweeps, QA summary in `shared/library/`.

### 5. Verification Matrix

- Unit tests by equation block: earth pressures, live-load distribution, section checks, rating equations.
- Regression tests with golden fixtures: at least 6 representative culvert configurations.
- Deterioration monotonicity sweeps: independent and combined sweeps for steel/rebar/prestress.
- Hand-check anchor cases: minimum 3 with tolerances documented.

### 6. Acceptance Criteria

- Functional definition of done: deterministic rating workflow with governing case traceability.
- Engineering signoff requirements: bridge engineer validation against hand checks and DOT references.
- QA pass requirements: full regression + schema + CLI determinism pass.
- Manifest updates required: add new tool record with entry/engine/test/cli and section-loss coverage.

### 7. Delivery Plan

- Milestones: requirements freeze -> engine prototype -> UI/CLI -> verification -> QA -> release.
- Risks and mitigations: soil/load-model oversimplification risk mitigated by explicit assumption report block.
- Owner and review gates: Bridge Engineer execution, CTO code review, QA review gate.

## CTO Handoff Plan B: Steel Truss Member-Level Load Rating

### 1. Problem Statement

- Engineer task request: member-level truss rating with tension/compression/buckling checks and panel-point force extraction.
- Why current tools cannot satisfy it: no truss force-analysis/rating engine in manifest; girder tools are not topology-compatible.
- Urgency / project impact: common legacy inventory structures remain outside current web stack.

### 2. Engineering Basis

- Governing standards/specifications: AASHTO MBE Chapter 6, AASHTO LRFD steel member provisions.
- Required equations and assumptions: linear truss analysis for member demands, net-section/yield/fracture/buckling resistances.
- Required load combinations and limit states: inventory/operating plus permit/legal truck suites.

### 3. Data Contract

- Input schema: node coordinates, member connectivity/properties, support conditions, bracing lengths, truck/lane definitions.
- Output schema: member RF table, governing member/mode, envelope demand files.
- Deterioration schema:
  - `steelPct`: primary reduction for truss member net/effective areas
  - `rebarPct`: retained with explicit N.A.=0 pathway
  - `prestressPct`: retained with explicit N.A.=0 pathway
- Backward compatibility expectations: no breaking field renames after v1 publish.

### 4. UX and Workflow Requirements

- UI fields and validations: model builder/import, units lock, stability checks, deterioration triplet.
- CLI contract: deterministic analysis/rating outputs and parseable member-level summaries.
- Evidence artifacts: golden truss models, comparison reports vs benchmark examples.

### 5. Verification Matrix

- Unit tests: truss solver, member resistance modes, rating factors.
- Regression: Pratt/Warren/Pony representative fixtures.
- Deterioration sweeps: monotonic RF reduction under rising steel loss; rebar/prestress N.A. pathways tested.
- Hand checks: at least 3 benchmark structures.

### 6. Acceptance Criteria

- Functional definition of done: end-to-end member-level truss rating with transparent governing failure mode.
- Engineering signoff requirements: independent hand-check parity.
- QA pass requirements: all tests + deterministic output fingerprinting.
- Manifest updates required: new tool with section-loss coverage metadata.

### 7. Delivery Plan

- Milestones: solver core -> rating core -> UX/CLI -> verification -> release.
- Risks and mitigations: model-input complexity mitigated with strict validation + starter templates.
- Owner and review gates: Bridge Engineer + CTO + QA.

## CTO Handoff Plan C: Substructure Rating (RC Pier Caps and Columns)

### 1. Problem Statement

- Engineer task request: pier cap/column rating under dead/live/seismic-overstrength combinations for screening-level load rating.
- Why current tools cannot satisfy it: existing tools are superstructure-focused; no substructure rating engine exists.
- Urgency / project impact: substructure bottlenecks delay complete bridge ratings.

### 2. Engineering Basis

- Governing standards/specifications: AASHTO LRFD/MBE and owner seismic screening criteria.
- Required equations and assumptions: column interaction, shear/friction, cap flexure/shear, simplified demand transfer from bearings.
- Required load combinations and limit states: strength/service and owner-required screening combinations.

### 3. Data Contract

- Input schema: geometry, reinforcement, boundary/load transfer assumptions, material strengths, deterioration triplet.
- Output schema: element-level RFs, controlling action/elevation, demand-capacity traces.
- Deterioration schema:
  - `steelPct`: structural steel jackets/plates/anchor steel where applicable, else explicit zero path
  - `rebarPct`: primary RC reinforcement reduction
  - `prestressPct`: applies where prestressed caps/elements exist, else explicit zero path
- Backward compatibility expectations: deterministic JSON schema with version pin.

### 4. UX and Workflow Requirements

- UI fields and validations: separate cap and column tabs, reinforcement checks, deterioration triplet required.
- CLI contract: stable input/output schema and deterministic report generation.
- Evidence artifacts: hand-check packets and scenario matrix.

### 5. Verification Matrix

- Unit tests: interaction, shear, flexure, bearing transfer functions.
- Regression fixtures: non-seismic and seismic-screening examples.
- Deterioration sweeps: steel/rebar/prestress independent + combined sensitivity.
- Hand-check anchors: minimum 3 benchmark examples.

### 6. Acceptance Criteria

- Functional definition of done: reproducible substructure RF outputs with governing modes.
- Engineering signoff requirements: bridge engineer check package approved.
- QA pass requirements: deterministic and regression suite pass.
- Manifest updates required: add tool entry and section-loss coverage block.

### 7. Delivery Plan

- Milestones: scope lock -> engine -> UX/CLI -> verification -> QA release.
- Risks and mitigations: high parameter variability mitigated with presets and guardrail validation.
- Owner and review gates: Bridge Engineer execution, CTO review, QA signoff.

## Implementation Routing Rule for SEQARCH Web

When user requests arrive:

1. Match request to existing manifest tools first.
2. If unmatched, open a CTO handoff packet using this document sections/template.
3. Reject completion if section-loss triplet handling (`steel`, `rebar`, `prestress`) is missing.
