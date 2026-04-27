# CTO Tool Request Template (Bridge Engineering)

Use this template when no existing bridge tool can satisfy an engineer request.

## 1. Problem Statement

- Engineer task request:
- Why current manifest tools cannot satisfy it:
- Urgency / project impact:

## 2. Engineering Basis

- Governing standards/specifications (AASHTO, state DOT, owner criteria):
- Required equations and assumptions:
- Required load combinations and limit states:

## 3. Data Contract

- Input schema (fields, units, ranges, defaults):
- Output schema (governing rating/capacity + detailed intermediate checks):
- Deterioration schema (must include all three):
  - `steelPct`
  - `rebarPct`
  - `prestressPct`
- Backward compatibility expectations:

## 4. UX and Workflow Requirements

- UI fields and validations:
- CLI contract (`--input`, `--format`, deterministic output requirements):
- Evidence artifacts required in `shared/library/`:

## 5. Verification Matrix

- Unit tests by equation block:
- Regression tests with golden fixtures:
- Deterioration monotonicity sweeps for steel/rebar/prestress:
- Hand-check anchor cases and tolerance limits:

## 6. Acceptance Criteria

- Functional definition of done:
- Engineering signoff requirements:
- QA pass requirements:
- Manifest updates required (`bridge-engineering-tools.json`):

## 7. Delivery Plan

- Milestones and sequencing:
- Risks and mitigations:
- Owner and review gates:
