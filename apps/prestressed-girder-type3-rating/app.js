(function () {
  const form = document.getElementById('ratingForm');
  const outputEl = document.getElementById('output');
  let lastRun = null;

  function setDefaults() {
    const d = createDefaultTypeIIIInput();

    setValue('spanFt', d.spanFt);

    setValue('depth', d.geometry.depth);
    setValue('topFlangeWidth', d.geometry.topFlangeWidth);
    setValue('topFlangeThickness', d.geometry.topFlangeThickness);
    setValue('webThickness', d.geometry.webThickness);
    setValue('bottomFlangeWidth', d.geometry.bottomFlangeWidth);
    setValue('bottomFlangeThickness', d.geometry.bottomFlangeThickness);

    setValue('fcPsi', d.materials.fcPsi);
    setValue('fyPsi', d.materials.fyPsi);
    setValue('fpuKsi', d.materials.fpuKsi);

    setValue('strandType', d.prestress.strandType);
    setValue('nStrands', d.prestress.nStrands);
    setValue('jackingStressKsi', d.prestress.jackingStressKsi);
    setValue('longTermLossPercent', d.prestress.longTermLossPercent);
    setValue('dp', d.prestress.dp);

    setValue('topBarSize', d.reinforcement.topLongitudinal.barSize);
    setValue('topBarCount', d.reinforcement.topLongitudinal.count);
    setValue('topBarDepth', d.reinforcement.topLongitudinal.depth);

    setValue('bottomBarSize', d.reinforcement.bottomLongitudinal.barSize);
    setValue('bottomBarCount', d.reinforcement.bottomLongitudinal.count);
    setValue('bottomBarDepth', d.reinforcement.bottomLongitudinal.depth);

    setValue('stirrupSize', d.reinforcement.stirrups.barSize);
    setValue('stirrupLegs', d.reinforcement.stirrups.legs);
    setValue('stirrupSpacing', d.reinforcement.stirrups.spacing);

    setValue('selfWeightKipPerFt', d.loads.dead.selfWeightKipPerFt);
    setValue('deckCompositeKipPerFt', d.loads.dead.deckCompositeKipPerFt);
    setValue('wearingSurfaceKipPerFt', d.loads.dead.wearingSurfaceKipPerFt);
    setValue('superimposedKipPerFt', d.loads.dead.superimposedKipPerFt);

    setValue('designTruckCode', d.loads.live.designTruckCode);
    setValue('hl93RearSpacingFt', d.loads.live.hl93RearSpacingFt);
    setValue('legalTruckCode', d.loads.live.legalTruckCode);
    setValue('laneLoadKipPerFt', d.loads.live.laneLoadKipPerFt);
    setValue('permitLaneLoadKipPerFt', d.loads.live.permitLaneLoadKipPerFt);
    setValue('impact', d.loads.live.impact);
    setValue('distributionFactor', d.loads.live.distributionFactor);

    setValue('permitAxlesJson', JSON.stringify(d.loads.live.permitTruck.axles, null, 2));

    setValue('loss_rebar', d.deterioration.loss_rebar);
    setValue('loss_stirrup', d.deterioration.loss_stirrup);
    setValue('loss_strand', d.deterioration.loss_strand);
    setValue('loss_structural_steel', d.deterioration.loss_structural_steel);
    setValue('prestress_stress_reduction', d.deterioration.prestress_stress_reduction);
  }

  function setValue(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = v;
  }

  function getNumber(id, fallback) {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  function getInt(id, fallback) {
    const v = parseInt(document.getElementById(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  }

  function collectInput() {
    let permitAxles;
    try {
      permitAxles = JSON.parse(document.getElementById('permitAxlesJson').value);
      if (!Array.isArray(permitAxles)) throw new Error('Permit axles must be an array.');
    } catch (err) {
      alert('Invalid permit axle JSON: ' + err.message);
      return null;
    }

    return {
      spanFt: getNumber('spanFt', 90),
      geometry: {
        name: 'AASHTO Type III',
        depth: getNumber('depth', 45),
        topFlangeWidth: getNumber('topFlangeWidth', 20),
        topFlangeThickness: getNumber('topFlangeThickness', 7),
        webThickness: getNumber('webThickness', 7),
        bottomFlangeWidth: getNumber('bottomFlangeWidth', 26),
        bottomFlangeThickness: getNumber('bottomFlangeThickness', 8)
      },
      materials: {
        fcPsi: getNumber('fcPsi', 8000),
        fyPsi: getNumber('fyPsi', 60000),
        fpuKsi: getNumber('fpuKsi', 270)
      },
      prestress: {
        strandType: document.getElementById('strandType').value,
        nStrands: getInt('nStrands', 34),
        jackingStressKsi: getNumber('jackingStressKsi', 202),
        longTermLossPercent: getNumber('longTermLossPercent', 22),
        dp: getNumber('dp', 40),
        fpuKsi: getNumber('fpuKsi', 270)
      },
      reinforcement: {
        topLongitudinal: {
          barSize: getInt('topBarSize', 6),
          count: getInt('topBarCount', 4),
          depth: getNumber('topBarDepth', 4)
        },
        bottomLongitudinal: {
          barSize: getInt('bottomBarSize', 8),
          count: getInt('bottomBarCount', 8),
          depth: getNumber('bottomBarDepth', 41.5)
        },
        stirrups: {
          barSize: getInt('stirrupSize', 4),
          legs: getInt('stirrupLegs', 2),
          spacing: getNumber('stirrupSpacing', 12)
        }
      },
      loads: {
        dead: {
          selfWeightKipPerFt: getNumber('selfWeightKipPerFt', 0.7),
          deckCompositeKipPerFt: getNumber('deckCompositeKipPerFt', 0.55),
          wearingSurfaceKipPerFt: getNumber('wearingSurfaceKipPerFt', 0.12),
          superimposedKipPerFt: getNumber('superimposedKipPerFt', 0.08)
        },
        live: {
          designTruckCode: document.getElementById('designTruckCode').value,
          hl93RearSpacingFt: getNumber('hl93RearSpacingFt', 14),
          legalTruckCode: document.getElementById('legalTruckCode').value,
          legalRearSpacingFt: null,
          permitTruck: { axles: permitAxles },
          laneLoadKipPerFt: getNumber('laneLoadKipPerFt', 0.64),
          permitLaneLoadKipPerFt: getNumber('permitLaneLoadKipPerFt', 0),
          impact: getNumber('impact', 0.33),
          distributionFactor: getNumber('distributionFactor', 0.62)
        }
      },
      deterioration: {
        loss_rebar: getNumber('loss_rebar', 0),
        loss_stirrup: getNumber('loss_stirrup', 0),
        loss_strand: getNumber('loss_strand', 0),
        loss_structural_steel: getNumber('loss_structural_steel', 0),
        prestress_stress_reduction: getNumber('prestress_stress_reduction', 0)
      }
    };
  }

  function collectMetadata() {
    const out = {};
    const codedIds = [
      'B.LR.01', 'B.LR.02', 'B.LR.03', 'B.LR.04', 'B.LR.05', 'B.LR.06', 'B.LR.07',
      'B.C.01', 'B.C.02', 'B.C.03', 'B.C.04',
      'B.W.01'
    ];
    for (let i = 0; i < codedIds.length; i++) {
      const id = codedIds[i];
      const el = document.getElementById(id.replace(/\./g, '_'));
      out[id] = el ? el.value : '';
    }
    const uncodedKeys = [
      'bridgeNumber', 'facilityCarried', 'featureIntersected',
      'inspector', 'inspectionCompletionDate', 'maintenanceSection',
      'bridgeDescription', 'comments',
      'primeFirmNameNumber', 'subFirmNameNumber', 'waNumber',
      'controllingElement', 'loadRatingToolUsed',
      'isDlcRating', 'isConcurrence', 'loadRatingStatement'
    ];
    for (let i = 0; i < uncodedKeys.length; i++) {
      const key = uncodedKeys[i];
      const el = document.getElementById(key);
      out[key] = el ? el.value : '';
    }
    const rowsEl = document.getElementById('legalLoadRowsJson');
    let rows = [];
    if (rowsEl && rowsEl.value && rowsEl.value.trim().length > 0) {
      try {
        const parsed = JSON.parse(rowsEl.value);
        if (Array.isArray(parsed)) rows = parsed;
      } catch (e) {
        rows = [];
      }
    }
    out.legalLoadRows = rows;
    return out;
  }

  function formatRFTable(title, rows) {
    const keys = Object.keys(rows);
    let html = `<h3>${title}</h3><table><thead><tr><th>Case</th><th>RF-M</th><th>RF-V</th><th>RF</th><th>Governs</th></tr></thead><tbody>`;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const r = rows[k];
      html += `<tr><td>${k}</td><td>${r.rfMoment.toFixed(3)}</td><td>${r.rfShear.toFixed(3)}</td><td>${r.rf.toFixed(3)}</td><td>${r.governs}</td></tr>`;
    }
    html += '</tbody></table>';
    return html;
  }

  function render(result) {
    const baseGov = result.sensitivity.governingBaselineRF;
    const detGov = result.sensitivity.governingDeterioratedRF;

    outputEl.innerHTML = `
      <div class="summary">
        <h2>Type III Prestressed Girder Rating Result</h2>
        <p><strong>Baseline Governing RF:</strong> ${baseGov.rf.toFixed(3)} (${baseGov.method} ${baseGov.case}, ${baseGov.governs})</p>
        <p><strong>Deteriorated Governing RF:</strong> ${detGov.rf.toFixed(3)} (${detGov.method} ${detGov.case}, ${detGov.governs})</p>
        <p><strong>Delta RF:</strong> ${result.sensitivity.deltaRF.toFixed(3)}</p>
      </div>

      <div class="split">
        <section>
          <h2>Baseline (0% Loss)</h2>
          ${formatRFTable('LRFR', result.baseline.lrfr)}
          ${formatRFTable('LFR', result.baseline.lfr)}
          ${formatRFTable('ASR', result.baseline.asr)}
        </section>

        <section>
          <h2>Deteriorated</h2>
          ${formatRFTable('LRFR', result.deteriorated.lrfr)}
          ${formatRFTable('LFR', result.deteriorated.lfr)}
          ${formatRFTable('ASR', result.deteriorated.asr)}
        </section>
      </div>

      <section>
        <h2>Capacities</h2>
        <table>
          <thead><tr><th>Metric</th><th>Baseline</th><th>Deteriorated</th></tr></thead>
          <tbody>
            <tr><td>&phi;Mn (kip-ft)</td><td>${result.baseline.flexure.phiMn.toFixed(1)}</td><td>${result.deteriorated.flexure.phiMn.toFixed(1)}</td></tr>
            <tr><td>&phi;Vn (kip)</td><td>${result.baseline.shear.phiVn.toFixed(1)}</td><td>${result.deteriorated.shear.phiVn.toFixed(1)}</td></tr>
            <tr><td>Effective Aps (in^2)</td><td>${result.baseline.effectivePrestress.effectiveAps.toFixed(3)}</td><td>${result.deteriorated.effectivePrestress.effectiveAps.toFixed(3)}</td></tr>
            <tr><td>Effective fpe (ksi)</td><td>${(result.baseline.effectivePrestress.fpe / 1000).toFixed(1)}</td><td>${(result.deteriorated.effectivePrestress.fpe / 1000).toFixed(1)}</td></tr>
          </tbody>
        </table>
      </section>
    `;
  }

  function populateSelects() {
    const designSelect = document.getElementById('designTruckCode');
    const legalSelect = document.getElementById('legalTruckCode');

    const keys = Object.keys(TRUCKS);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const t = TRUCKS[key];
      const opt1 = document.createElement('option');
      opt1.value = key;
      opt1.textContent = `${key} - ${t.name}`;
      designSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = key;
      opt2.textContent = `${key} - ${t.name}`;
      legalSelect.appendChild(opt2);
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const input = collectInput();
    if (!input) return;

    try {
      const result = runTypeIIIRating(input, { traceMode: true });
      lastRun = { input: input, result: result };
      render(result);
    } catch (err) {
      alert('Rating failed: ' + err.message);
    }
  });

  document.getElementById('btnDefaults').addEventListener('click', function () {
    setDefaults();
  });
  document.getElementById('btnGenerateReport').addEventListener('click', function () {
    if (!lastRun) {
      alert('Run rating before generating report.');
      return;
    }
    try {
      generatePrestressedType3Report({
        input: lastRun.input,
        result: lastRun.result,
        metadata: collectMetadata()
      });
    } catch (err) {
      alert('Report generation failed: ' + err.message);
    }
  });

  populateSelects();
  setDefaults();
})();
