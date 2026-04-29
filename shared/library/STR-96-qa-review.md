# STR-96 QA Review

Date: 2026-04-28  
Issue: STR-96

## Status

- `REOPENED -> RESUBMITTED FOR QA`

## Reopen Defects Addressed

1. TxDOT cover-sheet schema was remapped from sample fixture text (`/tmp/str-95/pdf-text.txt`, page 1) and no longer uses fabricated B.C/B.LR meanings.
2. Schema now includes:
- Coded fields: `B.C.01-04`, `B.LR.01-07`, `B.W.01`
- Repeating legal-load fields: `B.EP.01/B.EP.02` (row model)
- Uncoded fields: bridge/facility/feature, inspector+inspection date, maint. section, description/comments, firms+WA, controlling element, rating tool used, DLC/concurrence flags, load-rating statement.
3. Hand-calc section in `report/pdf-report.js` replaced placeholder pages with structured report pages:
- Notes and assumptions
- Input summary
- Member-load demand tables (dead + live by vehicle class)
- Flexure capacity page
- Shear capacity page
- Prestress-loss page
- Rating-equation summary page
4. RATE section replaced from 3 lines to a structured summary block with metadata, span/capacity rows, governing RF rows, and per-vehicle RF rows.

## Verification Evidence

- Engine regression suite:
  - `node apps/prestressed-girder-type3-rating/test-rating-engine.js`
- Manual code inspection for report generation and schema mapping:
  - `shared/library/txdot-cover-sheet-schema.js`
  - `apps/prestressed-girder-type3-rating/report/pdf-report.js`

## QA Request

Please re-review STR-96 against reopen comment `6f0059fb-1b94-4fee-bc10-4509d41cf94c`, with focus on:

1. Field-by-field page-1 mapping parity for TxDOT cover sheet schema.
2. Hand-calc section content structure versus sample report sectioning (notes, inputs, demand, capacities, prestress, equations, summary).
3. RATE-style summary completeness and per-vehicle RF rows.

## Final QA Status (Verified by STR-102)

- `PASS` — reopen remediation validated against TxDOT schema fidelity, hand-calc/RATE report structure, and deterministic engineering calculation checks.
