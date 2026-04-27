# STR-84 Load Rating - Revised Per-Member / Per-Span Matrix

## Why Revised
Per comment [acaa769d](/STR/issues/STR-84#comment-acaa769d-c107-4ccf-8997-2611a46eb223), this analysis was rerun without assuming the smallest section controls all spans.

This revision runs each member-size case separately by span length.

## Bridge Inputs from Inspection
- Structure: `180570026103105`
- Bridge description: 4-span continuous steel stringer on concrete substructure
- Span lengths: `40 ft - 72 ft - 72 ft - 40 ft`
- Reported member sizes in PDF OCR: `WF33x130` and `WF33x141`

## Tool and Deterioration Contract
- Tool: `apps/steel-girder-rating/cli.js`
- Section-loss dimensions always included in each run:
  - `steelPct`: active in capacity reduction
  - `rebarPct`: explicit input and marked N.A. for this steel-member app
  - `prestressPct`: explicit input and marked N.A. for this steel-member app
- Deterioration vector used for observed-condition rerun:
  - `steelPct = 5`
  - `rebarPct = 2`
  - `prestressPct = 0`

## Section-Library Gap Handling
`W33x141` is not present in the app section catalog. For the second reported member, the run uses `W33x152` as a proxy (nearest heavier available W33 section).

CTO follow-up needed to add legacy section `W33x141` to the section library for exact member matching.

## Full Input + Intermediate Output Artifacts
All inputs and all intermediate outputs are saved here:
- Consolidated bundle: `shared/library/str-84-artifacts/full-case-matrix.json`
- Per-case input/output files:
  - `shared/library/str-84-artifacts/w33x130_40ft_reported_member_1.input.json`
  - `shared/library/str-84-artifacts/w33x130_40ft_reported_member_1.output.json`
  - `shared/library/str-84-artifacts/w33x130_72ft_reported_member_1.input.json`
  - `shared/library/str-84-artifacts/w33x130_72ft_reported_member_1.output.json`
  - `shared/library/str-84-artifacts/w33x152_40ft_reported_member_2_proxy.input.json`
  - `shared/library/str-84-artifacts/w33x152_40ft_reported_member_2_proxy.output.json`
  - `shared/library/str-84-artifacts/w33x152_72ft_reported_member_2_proxy.input.json`
  - `shared/library/str-84-artifacts/w33x152_72ft_reported_member_2_proxy.output.json`

Intermediate outputs included in each `*.output.json` include (not limited to):
- `canonicalDeterioration`
- `result.baseSection`
- `result.baseSectionParams`
- `result.liveLoads` (envelopes and vectors)
- `result.pointResults[*]`:
  - section properties after section-loss mapping
  - moment/shear capacities and governing limit states
  - dead/live load effects
  - LRFR/LFR/ASR result sets
- `result.governingResult`

## Case Matrix Results (Observed Deterioration)
| Case | Section | Span (ft) | Governing RF | Governing Mode |
|---|---|---:|---:|---|
| `w33x130_40ft_reported_member_1` | W33x130 | 40 | 1.204 | LRFR Legal Load (Moment) |
| `w33x130_72ft_reported_member_1` | W33x130 | 72 | 0.274 | LRFR Legal Load (Moment) |
| `w33x152_40ft_reported_member_2_proxy` | W33x152 (proxy for reported W33x141) | 40 | 1.524 | LRFR Legal Load (Moment) |
| `w33x152_72ft_reported_member_2_proxy` | W33x152 (proxy for reported W33x141) | 72 | 0.406 | LRFR Legal Load (Moment) |

Controlling case in this rerun:
- `w33x130_72ft_reported_member_1`
- Governing RF: `0.274`

## Exact Case Inputs (All)

### `w33x130_40ft_reported_member_1`
```json
{
  "sectionType": "rolled",
  "Fy": 50,
  "Lb": 20,
  "Cb": 1,
  "stiffenerSpacing": 0,
  "checkPoints": [],
  "dcW": 0.62,
  "dwW": 0.09,
  "truckId": "AASHTO",
  "impactFactor": 0.33,
  "laneLoad": 0.64,
  "distFactor": 0.58,
  "phiC": 1,
  "phiS": 1,
  "methods": { "lrfr": true, "lfr": true, "asr": true },
  "legalGammaLL": 1.8,
  "deterioration": { "steelPct": 5, "rebarPct": 2, "prestressPct": 0 },
  "meta": {
    "structureNumber": "180570026103105",
    "bridgeDescription": "4-span continuous steel stringer",
    "inspectionDate": "2024-01-28",
    "source": "18-057-0261-03-105_RTInsp_2024-01.pdf",
    "note": "Case-matrix rerun per user direction: no single-size global assumption.",
    "memberLabel": "reported_member_1",
    "sectionNote": null
  },
  "rolledSection": "W33x130",
  "spanFt": 40
}
```

### `w33x130_72ft_reported_member_1`
```json
{
  "sectionType": "rolled",
  "Fy": 50,
  "Lb": 20,
  "Cb": 1,
  "stiffenerSpacing": 0,
  "checkPoints": [],
  "dcW": 0.62,
  "dwW": 0.09,
  "truckId": "AASHTO",
  "impactFactor": 0.33,
  "laneLoad": 0.64,
  "distFactor": 0.58,
  "phiC": 1,
  "phiS": 1,
  "methods": { "lrfr": true, "lfr": true, "asr": true },
  "legalGammaLL": 1.8,
  "deterioration": { "steelPct": 5, "rebarPct": 2, "prestressPct": 0 },
  "meta": {
    "structureNumber": "180570026103105",
    "bridgeDescription": "4-span continuous steel stringer",
    "inspectionDate": "2024-01-28",
    "source": "18-057-0261-03-105_RTInsp_2024-01.pdf",
    "note": "Case-matrix rerun per user direction: no single-size global assumption.",
    "memberLabel": "reported_member_1",
    "sectionNote": null
  },
  "rolledSection": "W33x130",
  "spanFt": 72
}
```

### `w33x152_40ft_reported_member_2_proxy`
```json
{
  "sectionType": "rolled",
  "Fy": 50,
  "Lb": 20,
  "Cb": 1,
  "stiffenerSpacing": 0,
  "checkPoints": [],
  "dcW": 0.62,
  "dwW": 0.09,
  "truckId": "AASHTO",
  "impactFactor": 0.33,
  "laneLoad": 0.64,
  "distFactor": 0.58,
  "phiC": 1,
  "phiS": 1,
  "methods": { "lrfr": true, "lfr": true, "asr": true },
  "legalGammaLL": 1.8,
  "deterioration": { "steelPct": 5, "rebarPct": 2, "prestressPct": 0 },
  "meta": {
    "structureNumber": "180570026103105",
    "bridgeDescription": "4-span continuous steel stringer",
    "inspectionDate": "2024-01-28",
    "source": "18-057-0261-03-105_RTInsp_2024-01.pdf",
    "note": "Case-matrix rerun per user direction: no single-size global assumption.",
    "memberLabel": "reported_member_2_proxy",
    "sectionNote": "Inspection OCR shows WF33x141; tool section catalog lacks W33x141. Used nearest heavier W33x152 as proxy."
  },
  "rolledSection": "W33x152",
  "spanFt": 40
}
```

### `w33x152_72ft_reported_member_2_proxy`
```json
{
  "sectionType": "rolled",
  "Fy": 50,
  "Lb": 20,
  "Cb": 1,
  "stiffenerSpacing": 0,
  "checkPoints": [],
  "dcW": 0.62,
  "dwW": 0.09,
  "truckId": "AASHTO",
  "impactFactor": 0.33,
  "laneLoad": 0.64,
  "distFactor": 0.58,
  "phiC": 1,
  "phiS": 1,
  "methods": { "lrfr": true, "lfr": true, "asr": true },
  "legalGammaLL": 1.8,
  "deterioration": { "steelPct": 5, "rebarPct": 2, "prestressPct": 0 },
  "meta": {
    "structureNumber": "180570026103105",
    "bridgeDescription": "4-span continuous steel stringer",
    "inspectionDate": "2024-01-28",
    "source": "18-057-0261-03-105_RTInsp_2024-01.pdf",
    "note": "Case-matrix rerun per user direction: no single-size global assumption.",
    "memberLabel": "reported_member_2_proxy",
    "sectionNote": "Inspection OCR shows WF33x141; tool section catalog lacks W33x141. Used nearest heavier W33x152 as proxy."
  },
  "rolledSection": "W33x152",
  "spanFt": 72
}
```
