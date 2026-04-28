const TXDOT_LR_COVER_SCHEMA_V1 = {
  schemaVersion: '1.1.0',
  agency: 'TxDOT',
  form: 'Bridge Load Rating Cover Sheet',
  sourceFixture: '/tmp/str-95/pdf-text.txt PAGE 1',
  codedFields: [
    { id: 'B.C.01', label: 'Deck condition rating', required: false },
    { id: 'B.C.02', label: 'Superstructure condition rating', required: false },
    { id: 'B.C.03', label: 'Substructure condition rating', required: false },
    { id: 'B.C.04', label: 'Culvert condition rating', required: false },
    { id: 'B.LR.01', label: 'Design Load (HS20)', required: true },
    { id: 'B.LR.02', label: 'Design Method (LFD/LRFD)', required: true },
    { id: 'B.LR.03', label: 'Load Rating Date', required: true },
    { id: 'B.LR.04', label: 'Load Rating Method (LFR/LRFR)', required: true },
    { id: 'B.LR.05', label: 'Inventory Load Rating Factor', required: true },
    { id: 'B.LR.06', label: 'Operating Load Rating Factor', required: true },
    { id: 'B.LR.07', label: 'Controlling Legal Load Rating Factor', required: true },
    { id: 'B.W.01', label: 'Year Built', required: false }
  ],
  legalLoadRows: {
    configFieldId: 'B.EP.01',
    factorFieldId: 'B.EP.02',
    required: false,
    repeat: 'one row per legal-load vehicle'
  },
  uncodedFields: [
    { key: 'bridgeNumber', label: 'Bridge Number', required: true },
    { key: 'facilityCarried', label: 'Facility Carried', required: true },
    { key: 'featureIntersected', label: 'Feature Intersected', required: true },
    { key: 'inspector', label: 'Inspector', required: false },
    { key: 'inspectionCompletionDate', label: 'Inspection Completion Date', required: false },
    { key: 'maintenanceSection', label: 'Maint. Section', required: false },
    { key: 'bridgeDescription', label: 'Bridge Description', required: true },
    { key: 'comments', label: 'Comments', required: false },
    { key: 'primeFirmNameNumber', label: 'Prime Firm Name & Number', required: false },
    { key: 'subFirmNameNumber', label: 'Sub Firm Name & Number', required: false },
    { key: 'waNumber', label: 'WA', required: false },
    { key: 'controllingElement', label: 'Controlling Element', required: true },
    { key: 'loadRatingToolUsed', label: 'Load Rating Tool Used for this Element', required: true },
    { key: 'isDlcRating', label: 'DLC rating flag', required: false },
    { key: 'isConcurrence', label: 'Concurrence flag', required: false },
    { key: 'loadRatingStatement', label: 'Load Rating Statement', required: true }
  ]
};

TXDOT_LR_COVER_SCHEMA_V1.fields = TXDOT_LR_COVER_SCHEMA_V1.codedFields;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TXDOT_LR_COVER_SCHEMA_V1 };
}
