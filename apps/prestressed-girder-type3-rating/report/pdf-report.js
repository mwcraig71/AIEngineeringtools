function generatePrestressedType3Report(payload) {
  const result = payload.result;
  const input = payload.input || (result && result.input) || {};
  const meta = payload.metadata || {};
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error('jsPDF not loaded.');

  const tr = result && result.deteriorated && result.deteriorated.trace;
  if (!tr) {
    throw new Error('Trace data missing. Run rating with trace mode before generating report.');
  }

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const PAGE_BOTTOM = 742;
  let y = 48;

  function title(txt) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(String(txt), 48, y);
    y += 20;
  }

  function heading(txt) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(String(txt), 48, y);
    y += 14;
  }

  function line(txt, size, dy, x) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size || 9);
    doc.text(String(txt), x || 48, y);
    y += dy || 12;
  }

  function ensureRoom(linesNeeded) {
    if (y + linesNeeded * 12 <= PAGE_BOTTOM) return;
    doc.addPage();
    y = 48;
  }

  function fmt(n, digits) {
    return Number(n || 0).toFixed(digits == null ? 2 : digits);
  }

  function fromMeta(schemaField) {
    return meta[schemaField] || '';
  }

  title('TxDOT Bridge Load Rating Report');
  heading('Cover Sheet Data');
  const schema = window.TXDOT_LR_COVER_SCHEMA_V1 || { codedFields: [], uncodedFields: [] };
  const coded = schema.codedFields || schema.fields || [];
  const uncoded = schema.uncodedFields || [];

  ensureRoom(coded.length + uncoded.length + 12);
  for (let i = 0; i < coded.length; i++) {
    const f = coded[i];
    line(f.id + ' ' + f.label + ': ' + fromMeta(f.id));
  }

  if (Array.isArray(meta.legalLoadRows) && meta.legalLoadRows.length > 0) {
    heading('Legal Vehicles (B.EP.01 / B.EP.02)');
    for (let i = 0; i < meta.legalLoadRows.length; i++) {
      const row = meta.legalLoadRows[i] || {};
      line((row.config || '') + ': ' + (row.rf || ''));
    }
  } else {
    line('B.EP.01/B.EP.02: no legal-load rows provided in metadata.');
  }

  for (let i = 0; i < uncoded.length; i++) {
    const f = uncoded[i];
    line(f.label + ': ' + (meta[f.key] || ''));
  }

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 1: Notes and Assumptions');
  const notes = [
    '1) Load rating method: LFR walkthrough output for Type III prestressed member.',
    '2) Demand model: simple-span envelope with truck + lane + impact and distribution factor.',
    '3) Baseline and deteriorated scenarios are solved from one deterministic input set.',
    '4) Report values below are generated from trace-mode outputs.',
    '5) Flexure and shear capacities are converted to rating factors using method-specific factors.'
  ];
  for (let i = 0; i < notes.length; i++) line(notes[i]);

  heading('Input Summary');
  line("f'c = " + fmt(input.materials && input.materials.fcPsi, 0) + ' psi');
  line('fy = ' + fmt(input.materials && input.materials.fyPsi, 0) + ' psi');
  line('fpu = ' + fmt(input.materials && input.materials.fpuKsi, 1) + ' ksi');
  line('Span = ' + fmt(input.spanFt, 2) + ' ft');
  line('dp = ' + fmt(input.prestress && input.prestress.dp, 2) + ' in');
  line('n strands = ' + fmt(input.prestress && input.prestress.nStrands, 0));

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 2: Member Loads');
  const dead = result.deteriorated.dead;
  line('Dead-load demand (DC + DW):');
  line('DC moment = ' + fmt(dead.dcMoment, 2) + ' kip-ft', 9, 12, 64);
  line('DW moment = ' + fmt(dead.dwMoment, 2) + ' kip-ft', 9, 12, 64);
  line('DC shear = ' + fmt(dead.dcShear, 2) + ' kip', 9, 12, 64);
  line('DW shear = ' + fmt(dead.dwShear, 2) + ' kip', 9, 12, 64);

  heading('Live-load demand by vehicle class');
  const demandRows = [
    ['Design Truck', tr.demandByTruck.designTruck],
    ['Design Tandem', tr.demandByTruck.designTandem],
    ['Legal', tr.demandByTruck.legal],
    ['Permit', tr.demandByTruck.permit]
  ];
  for (let i = 0; i < demandRows.length; i++) {
    const row = demandRows[i];
    const d = row[1] || {};
    line(
      row[0] + ': M=' + fmt(d.totalMoment, 2) +
      ' kip-ft, V=' + fmt(d.totalShear, 2) +
      ' kip, truckM=' + fmt(d.truckMoment, 2) +
      ', laneM=' + fmt(d.laneMoment, 2)
    );
  }

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 3: Flexure Capacity');
  line('Mn = ' + fmt(tr.capacities.Mn, 2) + ' kip-ft');
  line('phiMn = ' + fmt(tr.capacities.phiMn, 2) + ' kip-ft');
  line('fps = ' + fmt(tr.flexure.fpsPsi / 1000, 2) + ' ksi');
  line('dp = ' + fmt(tr.flexure.dpIn, 3) + ' in');
  line('a = ' + fmt(tr.flexure.aIn, 3) + ' in');
  line('c = ' + fmt(tr.flexure.cIn, 3) + ' in');
  line('jd = ' + fmt(tr.flexure.jdIn, 3) + ' in');
  line('Equation: Mn = Aps*fps*(dp-a/2) + As*fy*(d-a/2)');

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 4: Shear Capacity');
  line('Vn = ' + fmt(tr.capacities.Vn, 2) + ' kip');
  line('phiVn = ' + fmt(tr.capacities.phiVn, 2) + ' kip');
  line('Concrete + stirrup contributions include deterioration penalties.');
  line('Equation basis: Vn = Vc + Vs; phiVn = phi*Vn.');

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 5: Prestress Losses');
  line('Original Aps = ' + fmt(tr.prestress.originalApsIn2, 3) + ' in^2');
  line('Effective Aps = ' + fmt(tr.prestress.effectiveApsIn2, 3) + ' in^2');
  line('Effective fpe = ' + fmt(tr.prestress.fpePsi / 1000, 2) + ' ksi');
  line('Long-term loss = ' + fmt(tr.prestress.longTermLossPercent, 1) + ' %');
  line('Strand section-loss = ' + fmt(tr.prestress.strandLossPercent, 1) + ' %');
  line('Prestress stress reduction = ' + fmt(tr.prestress.stressReductionPercent, 1) + ' %');

  doc.addPage();
  y = 48;
  title('Hand Calculations Page 6: Rating Equations and Summary');
  line('LFR inventory/operating/legal/permit RF values are from deteriorated scenario.');
  const lfr = result.deteriorated.lfr;
  const lfrKeys = Object.keys(lfr);
  for (let i = 0; i < lfrKeys.length; i++) {
    const k = lfrKeys[i];
    const r = lfr[k];
    line(k + ': RF=' + fmt(r.rf, 3) + ' (RFm=' + fmt(r.rfMoment, 3) + ', RFv=' + fmt(r.rfShear, 3) + ', governs=' + r.governs + ')');
  }

  doc.addPage();
  y = 48;
  title('RATE-Style Summary (Structured)');
  heading('Bridge Metadata + Span Info');
  line('Bridge Number: ' + (meta.bridgeNumber || '')); 
  line('Facility Carried: ' + (meta.facilityCarried || ''));
  line('Feature Intersected: ' + (meta.featureIntersected || ''));
  line('Span ft: ' + fmt(input.spanFt, 2));

  heading('Computed Capacities and Governing RF');
  line('phiMn: ' + fmt(tr.capacities.phiMn, 2) + ' kip-ft');
  line('phiVn: ' + fmt(tr.capacities.phiVn, 2) + ' kip');
  line('Governing baseline RF: ' + fmt(result.sensitivity.governingBaselineRF.rf, 3) + ' (' + result.sensitivity.governingBaselineRF.method + ' ' + result.sensitivity.governingBaselineRF.case + ')');
  line('Governing deteriorated RF: ' + fmt(result.sensitivity.governingDeterioratedRF.rf, 3) + ' (' + result.sensitivity.governingDeterioratedRF.method + ' ' + result.sensitivity.governingDeterioratedRF.case + ')');
  line('Delta RF: ' + fmt(result.sensitivity.deltaRF, 3));

  heading('Per-vehicle rating factors (deteriorated scenario)');
  line('Design Inventory (LRFR): ' + fmt(result.deteriorated.lrfr.design_inventory.rf, 3));
  line('Design Operating (LRFR): ' + fmt(result.deteriorated.lrfr.design_operating.rf, 3));
  line('Legal (LRFR): ' + fmt(result.deteriorated.lrfr.legal.rf, 3));
  line('Permit (LRFR): ' + fmt(result.deteriorated.lrfr.permit.rf, 3));
  line('Inventory (LFR): ' + fmt(result.deteriorated.lfr.inventory.rf, 3));
  line('Operating (LFR): ' + fmt(result.deteriorated.lfr.operating.rf, 3));
  line('Legal (LFR): ' + fmt(result.deteriorated.lfr.legal.rf, 3));
  line('Permit (LFR): ' + fmt(result.deteriorated.lfr.permit.rf, 3));

  doc.save('prestressed-type3-rating-' + Date.now() + '.pdf');
}
