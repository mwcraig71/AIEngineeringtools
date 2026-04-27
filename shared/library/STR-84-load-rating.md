# STR-84 Load Rating - Structure 180570026103105

## Scope
- Issue: STR-84 (`load rate this bridge`)
- Source: `18-057-0261-03-105_RTInsp_2024-01.pdf` (inspection date `2024-01-28`)
- Bridge: 4-span continuous steel stringer on concrete substructure
- Spans (W to E): `40 ft - 72 ft - 72 ft - 40 ft`
- Main members: `WF33x130` and `WF33x141` (modeled conservatively as `W33x130`)

## Tool Used
- Library tool: `steel-girder-rating` (`apps/steel-girder-rating/cli.js`)
- Reason: Matches steel stringer/girder load-rating workflow and supports explicit deterioration vector input.

## Modeling Inputs (Engineering Assumptions)
- Section: rolled `W33x130`
- Steel yield: `Fy = 50 ksi`
- Controlling span for rating: `72 ft`
- Unbraced length (assumed): `20 ft`
- Distribution factor (assumed): `0.58`
- Dead load: `dcW = 0.62 kip/ft`, `dwW = 0.09 kip/ft`
- Live load model: `AASHTO` truck + lane (`impactFactor = 0.33`, `laneLoad = 0.64 kip/ft`)

## Section-Loss Contract Compliance
- Steel section loss: active and applied to remaining girder dimensions at the controlling point.
- Rebar section loss: included in the deterioration input vector and recorded as `not_applicable` for this steel superstructure model.
- Prestress section loss: included in the deterioration input vector and recorded as `not_applicable` for this steel superstructure model.

This satisfies the requirement that all three deterioration dimensions are always present as active or explicit N.A./zero pathways.

## Deterioration Scenarios and Results

| Scenario | Steel Loss | Rebar Loss | Prestress Loss | Governing RF | Governing Mode |
|---|---:|---:|---:|---:|---|
| Baseline | 0% | 0% | 0% | 0.360 | LRFR Legal Load (Moment) |
| Observed from inspection notes (minor rust/pitting, minor deck rebar exposure) | 5% | 2% | 0% | 0.274 | LRFR Legal Load (Moment) |
| Sensitivity high | 10% | 5% | 0% | 0.177 | LRFR Legal Load (Moment) |

Observed-scenario additional outputs:
- LFR Inventory RF: `0.310`
- LFR Operating RF: `0.517`
- ASR Inventory RF: `0.509`
- ASR Operating RF: `0.921`

## Interpretation
- Governing check is moment in all scenarios.
- Under the observed deterioration scenario, RF remains below `1.0`, indicating no unrestricted rating under the modeled assumptions.
- Results are sensitive to steel section loss; increasing steel loss from `0%` to `10%` drives RF from `0.360` to `0.177`.

## Limitations and Next Refinements
- This app currently uses a simple-span analysis model; bridge is continuous. Results are therefore screening-level for prioritization, not final posting.
- Refine with:
  - as-built section assignments by span (WF33x130 vs WF33x141),
  - measured corrosion/thickness data by element location,
  - calibrated distribution factors from plans or refined analysis,
  - continuous-span line-girder model for final permit/legal posting decisions.
