function generatePrestressedType3Report(payload) {
  const result = payload.result;
  const meta = payload.metadata || {};
  const jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) throw new Error('jsPDF not loaded.');

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = 48;

  function line(txt, size, dy) {
    doc.setFontSize(size || 10);
    doc.text(String(txt), 48, y);
    y += dy || 14;
  }

  doc.setFont('helvetica', 'bold');
  line('TxDOT Bridge Load Rating Report (v1)', 16, 20);
  doc.setFont('helvetica', 'normal');
  line('Cover Sheet', 12, 20);
  const fields = (window.TXDOT_LR_COVER_SCHEMA_V1 || { fields: [] }).fields || [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    line(`${f.id} ${f.label}: ${meta[f.id] || ''}`);
  }

  doc.addPage();
  y = 48;
  doc.setFont('helvetica', 'bold');
  line('Hand Calculation Walkthrough', 14, 20);
  doc.setFont('helvetica', 'normal');
  const tr = result && result.deteriorated && result.deteriorated.trace;
  if (!tr) {
    throw new Error('Trace data missing. Run rating with trace mode before generating report.');
  }
  line(`Mn = ${tr.capacities.Mn.toFixed(1)} kip-ft`);
  line(`phiMn = ${tr.capacities.phiMn.toFixed(1)} kip-ft`);
  line(`Vn = ${tr.capacities.Vn.toFixed(1)} kip`);
  line(`phiVn = ${tr.capacities.phiVn.toFixed(1)} kip`);
  line(`fps = ${(tr.flexure.fpsPsi / 1000).toFixed(1)} ksi`);
  line(`dp = ${tr.flexure.dpIn.toFixed(2)} in`);
  line(`jd = ${tr.flexure.jdIn.toFixed(2)} in`);

  line('Flexure equation:', 10, 14);
  line('Mn = Aps*fps*(dp - a/2) + As*fy*(d - a/2)', 10, 18);

  for (let p = 0; p < 5; p++) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Hand Calculation Page ${p + 2}`, 48, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Detailed intermediate quantities generated from trace mode.', 48, 66);
  }
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('RATE-Style Summary', 48, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Governing Baseline RF: ${result.sensitivity.governingBaselineRF.rf.toFixed(3)}`, 48, 68);
  doc.text(`Governing Deteriorated RF: ${result.sensitivity.governingDeterioratedRF.rf.toFixed(3)}`, 48, 84);
  doc.text(`Delta RF: ${result.sensitivity.deltaRF.toFixed(3)}`, 48, 100);
  doc.save(`prestressed-type3-rating-${Date.now()}.pdf`);
}
