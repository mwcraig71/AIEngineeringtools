const TXDOT_LR_COVER_SCHEMA_V1 = {
  schemaVersion: '1.0.0',
  agency: 'TxDOT',
  form: 'Bridge Load Rating Cover Sheet',
  fields: [
    { id: 'B.LR.01', label: 'Bridge ID', required: true },
    { id: 'B.LR.02', label: 'Structure Number', required: true },
    { id: 'B.LR.03', label: 'County', required: true },
    { id: 'B.LR.04', label: 'Route', required: true },
    { id: 'B.LR.05', label: 'Feature Crossed', required: true },
    { id: 'B.LR.06', label: 'Span Configuration', required: true },
    { id: 'B.LR.07', label: 'Design Loading', required: true },
    { id: 'B.C.01', label: 'Prepared By', required: true },
    { id: 'B.C.02', label: 'Prepared Date', required: true },
    { id: 'B.C.03', label: 'Checked By', required: false },
    { id: 'B.C.04', label: 'Checked Date', required: false }
  ]
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TXDOT_LR_COVER_SCHEMA_V1 };
}
