/**
 * Application controller for Prestressed Cored Slab Load Rating.
 * Wires UI to the rating engine.
 */

(function () {
  // ---- Tab navigation ----
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'deadloads') updateDeadLoadDisplay();
    });
  });

  // ---- Truck info ----
  const stateCodeEl = document.getElementById('stateCode');
  const truckInfoEl = document.getElementById('truckInfo');

  stateCodeEl.addEventListener('change', () => {
    truckInfoEl.innerHTML = getTruckInfoHTML(stateCodeEl.value);
    document.getElementById('laneLoad').value = TRUCKS[stateCodeEl.value].laneLoad;
  });
  truckInfoEl.innerHTML = getTruckInfoHTML(stateCodeEl.value);

  // ---- Dead load auto-computation ----
  function updateDeadLoadDisplay() {
    const b = parseFloat(document.getElementById('slabWidth').value) || 48;
    const h = parseFloat(document.getElementById('slabDepth').value) || 21;
    const nVoids = parseInt(document.getElementById('nVoids').value) || 0;
    const dVoid = parseFloat(document.getElementById('voidDiameter').value) || 0;
    const unitWt = parseFloat(document.getElementById('concUnitWeight').value) || 150;

    const rVoid = dVoid / 2;
    const A_solid = b * h;
    const A_voids = nVoids * Math.PI * rVoid * rVoid;
    const A_net = A_solid - A_voids;
    const areaFt2 = A_net / 144;
    const selfWt = areaFt2 * unitWt / 1000;

    document.getElementById('dcSelfWeight').textContent = selfWt.toFixed(3) + ' kip/ft';

    const dwThick = parseFloat(document.getElementById('dwThickness').value) || 0;
    const dwUnitWt = parseFloat(document.getElementById('dwUnitWeight').value) || 140;
    const girderSpacing = parseFloat(document.getElementById('girderSpacing').value) || 4;
    const dwW = (dwThick / 12) * girderSpacing * dwUnitWt / 1000;
    document.getElementById('dwComputed').textContent = dwW.toFixed(3) + ' kip/ft';
  }

  function parseStrandLayout(layoutText, fallbackCount, fallbackDepth) {
    const rows = [];
    const lines = (layoutText || '').split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const parts = line.split('@').map(s => s.trim()).filter(Boolean);
      if (parts.length < 2 || parts.length > 3) {
        return { ok: false, error: `Invalid strand layout row "${line}". Use count@depth or count@depth@debond-ft.` };
      }

      const count = parseInt(parts[0], 10);
      const depth = parseFloat(parts[1]);
      const debondLengthFt = parts.length === 3 ? parseFloat(parts[2]) : 0;

      if (!Number.isFinite(count) || count <= 0) {
        return { ok: false, error: `Invalid strand count in row "${line}".` };
      }
      if (!Number.isFinite(depth) || depth <= 0) {
        return { ok: false, error: `Invalid strand depth in row "${line}".` };
      }
      if (!Number.isFinite(debondLengthFt) || debondLengthFt < 0) {
        return { ok: false, error: `Invalid debond length in row "${line}".` };
      }

      rows.push({ count, depth, debondLengthFt });
    }

    if (rows.length === 0) {
      rows.push({ count: fallbackCount, depth: fallbackDepth, debondLengthFt: 0 });
    }

    return { ok: true, rows };
  }

  // ---- Gather inputs ----
  function getInputs() {
    const spanFt = parseFloat(document.getElementById('spanLength').value) || 40;
    const b = parseFloat(document.getElementById('slabWidth').value) || 48;
    const h = parseFloat(document.getElementById('slabDepth').value) || 21;
    const nVoids = parseInt(document.getElementById('nVoids').value) || 0;
    const dVoid = parseFloat(document.getElementById('voidDiameter').value) || 0;
    const fc = parseFloat(document.getElementById('fc').value) || 5000;
    const girderSpacing = parseFloat(document.getElementById('girderSpacing').value) || 4;
    const concUnitWeight = parseFloat(document.getElementById('concUnitWeight').value) || 150;

    const phiC = parseFloat(document.getElementById('conditionFactor').value);
    const phiS = parseFloat(document.getElementById('systemFactor').value);

    // Prestressing
    const strandType = document.getElementById('strandType').value;
    const nStrands = parseInt(document.getElementById('nStrands').value) || 16;
    const dp = parseFloat(document.getElementById('strandDepth').value) || 18;
    const strandLayoutText = document.getElementById('strandLayout').value;
    const strandLayoutParsed = parseStrandLayout(strandLayoutText, nStrands, dp);
    const fpu = parseFloat(document.getElementById('fpu').value) * 1000 || 270000; // ksi to psi
    const fpyRatio = parseFloat(document.getElementById('fpyRatio').value) || 0.90;
    const fpe = parseFloat(document.getElementById('fpe').value) * 1000 || 150000; // ksi to psi
    const strandLoss = parseFloat(document.getElementById('strandLoss').value) || 0;

    // Mild steel
    const mildBarSize = parseInt(document.getElementById('mildBarSize').value) || 0;
    const mildBarCount = parseInt(document.getElementById('mildBarCount').value) || 0;
    const mildBarDepth = parseFloat(document.getElementById('mildBarDepth').value) || dp;
    const mildFy = parseFloat(document.getElementById('mildFy').value) || 60000;
    const mildLoss = parseFloat(document.getElementById('mildLoss').value) || 0;
    const mildAs = mildBarSize > 0 && mildBarCount > 0
      ? (REBAR_AREAS[mildBarSize] || 0) * mildBarCount
      : 0;

    // Stirrups
    const stirrupSize = parseInt(document.getElementById('stirrupSize').value);
    const stirrupLegs = parseInt(document.getElementById('stirrupLegs').value) || 2;
    const stirrupSpacing = parseFloat(document.getElementById('stirrupSpacing').value) || 12;
    const stirrupLoss = parseFloat(document.getElementById('stirrupLoss').value) || 0;
    const stirrupFy = parseFloat(document.getElementById('stirrupFy').value) || 60000;

    // Dead loads
    const rVoid = dVoid / 2;
    const A_net = b * h - nVoids * Math.PI * rVoid * rVoid;
    const selfWt = (A_net / 144) * concUnitWeight / 1000;
    const dcAdditional = parseFloat(document.getElementById('dcAdditional').value) || 0;
    const dcW = selfWt + dcAdditional;

    const dwThick = parseFloat(document.getElementById('dwThickness').value) || 0;
    const dwUnitWt = parseFloat(document.getElementById('dwUnitWeight').value) || 140;
    const dwW = (dwThick / 12) * girderSpacing * dwUnitWt / 1000;

    // Live load
    const stateCode = stateCodeEl.value;
    const truckDef = TRUCKS[stateCode];
    const impactFactor = parseFloat(document.getElementById('impactFactor').value) || 0.33;
    const laneLoad = parseFloat(document.getElementById('laneLoad').value) || 0.64;
    const distFactor = parseFloat(document.getElementById('distFactor').value) || 0.6;
    const legalGammaLL = parseFloat(document.getElementById('legalGammaLL').value) || 1.80;

    // Methods
    const methods = {
      lrfr: document.getElementById('doLRFR').checked,
      lfr: document.getElementById('doLFR').checked,
      asr: document.getElementById('doASR').checked
    };

    return {
      spanFt, b, h, nVoids, dVoid, fc, girderSpacing,
      strandType, nStrands, dp, strandLayoutText,
      strandLayout: strandLayoutParsed.ok ? strandLayoutParsed.rows : [],
      strandLayoutError: strandLayoutParsed.ok ? '' : strandLayoutParsed.error,
      fpu, fpyRatio, fpe, strandLoss,
      mildAs, mildFy, mildLoss, mildD: mildAs > 0 ? mildBarDepth : 0,
      stirrupSize, stirrupLegs, stirrupSpacing, stirrupLoss, stirrupFy,
      dcW, dwW, truckDef, impactFactor, laneLoad, distFactor,
      phiC, phiS, methods, legalGammaLL
    };
  }

  // ---- Run rating ----
  window.runRating = function () {
    const inputs = getInputs();
    if (!inputs.truckDef) {
      alert('Unknown truck definition.');
      return;
    }
    if (inputs.spanFt <= 0) {
      alert('Span length must be positive.');
      return;
    }
    if (inputs.nVoids > 0 && inputs.dVoid >= inputs.h) {
      alert('Void diameter must be less than slab depth.');
      return;
    }
    if (inputs.dp > inputs.h) {
      alert('Strand depth exceeds slab depth.');
      return;
    }
    if (inputs.strandLayoutError) {
      alert(inputs.strandLayoutError);
      return;
    }
    for (const row of inputs.strandLayout) {
      if (row.depth > inputs.h) {
        alert(`Strand layout depth ${row.depth} in exceeds slab depth ${inputs.h} in.`);
        return;
      }
      if (row.debondLengthFt > inputs.spanFt / 2) {
        alert(`Debond length ${row.debondLengthFt} ft is longer than half-span (${(inputs.spanFt / 2).toFixed(2)} ft).`);
        return;
      }
    }
    if (!inputs.methods.lrfr && !inputs.methods.lfr && !inputs.methods.asr) {
      alert('Select at least one rating method.');
      return;
    }

    const result = runLoadRating(inputs);
    displayResults(result, inputs);
  };

  window.clearResults = function () {
    document.getElementById('summaryBox').classList.add('hidden');
    document.getElementById('summaryBox').innerHTML = '';
    document.getElementById('resultsContainer').innerHTML = '';
  };

  // ---- Display results ----
  function displayResults(r, inputs) {
    const summaryBox = document.getElementById('summaryBox');
    summaryBox.classList.remove('hidden');

    // Find governing RF
    let governingRF = Infinity;
    let governingLabel = '';
    let governingControls = '';
    if (r.lrfr) {
      for (const [, v] of Object.entries(r.lrfr)) {
        if (v.rf < governingRF) { governingRF = v.rf; governingLabel = 'LRFR ' + v.label; governingControls = v.governs; }
      }
    }
    if (r.lfr) {
      for (const [, v] of Object.entries(r.lfr)) {
        if (v.rf < governingRF) { governingRF = v.rf; governingLabel = 'LFR ' + v.label; governingControls = v.governs; }
      }
    }
    if (r.asr) {
      for (const [, v] of Object.entries(r.asr)) {
        if (v.rf < governingRF) { governingRF = v.rf; governingLabel = 'ASR ' + v.label; governingControls = v.governs; }
      }
    }

    const passClass = governingRF >= 1.0 ? 'pass' : 'fail';
    const passText = governingRF >= 1.0 ? 'PASS' : 'FAIL';

    summaryBox.innerHTML = `
      <h4>Rating Summary</h4>
      <div class="governing-rf ${passClass}">
        <span class="rf-value">${governingRF.toFixed(3)}</span>
        <span class="rf-status">${passText}</span>
      </div>
      <div class="summary-details">
        <strong>Governing:</strong> ${governingLabel} (${governingControls})<br>
        <strong>Span:</strong> ${inputs.spanFt} ft | <strong>f'c:</strong> ${inputs.fc} psi<br>
        <strong>&phi;Mn:</strong> <span class="val">${r.phiMn.toFixed(1)} kip-ft</span> |
        <strong>&phi;Vn:</strong> <span class="val">${r.phiVn.toFixed(1)} kip</span><br>
        <strong>Aps (effective):</strong> ${r.strandInfo.effectiveAps.toFixed(3)} in&sup2; |
        <strong>fps:</strong> ${(r.strandInfo.fps / 1000).toFixed(1)} ksi at d<sub>p,m</sub> = ${r.strandInfo.dpMoment.toFixed(3)} in<br>
        <strong>DC Moment:</strong> ${r.deadLoads.dcMoment.toFixed(1)} kip-ft |
        <strong>DW Moment:</strong> ${r.deadLoads.dwMoment.toFixed(1)} kip-ft<br>
        <strong>LL+IM Moment:</strong> ${r.liveLoads.maxMoment.toFixed(1)} kip-ft |
        <strong>LL+IM Shear:</strong> ${r.liveLoads.maxShear.toFixed(1)} kip
      </div>
    `;

    const container = document.getElementById('resultsContainer');
    let html = '';

    // Section properties
    html += `<div class="result-section">
      <h3>Section Properties</h3>
      <table class="result-table">
        <tr><td>Gross Area, Ag</td><td>${r.section.Ag.toFixed(1)} in&sup2;</td></tr>
        <tr><td>Void Area (total)</td><td>${r.section.A_void_total.toFixed(1)} in&sup2;</td></tr>
        <tr><td>N.A. from top, yt</td><td>${r.section.yt.toFixed(2)} in</td></tr>
        <tr><td>Gross I, Ig</td><td>${r.section.Ig.toFixed(0)} in&sup4;</td></tr>
        <tr><td>Top Section Modulus, St</td><td>${r.section.St.toFixed(0)} in&sup3;</td></tr>
        <tr><td>Bottom Section Modulus, Sb</td><td>${r.section.Sb.toFixed(0)} in&sup3;</td></tr>
        <tr><td>Effective Web Width, bw</td><td>${r.section.bw.toFixed(1)} in</td></tr>
      </table>
    </div>`;

    // Strand info
    html += `<div class="result-section">
      <h3>Prestressing Steel</h3>
      <table class="result-table">
        <tr><td>Strand Size</td><td>${STRAND_LABELS[r.strandInfo.strandType] || r.strandInfo.strandType}</td></tr>
        <tr><td>Number of Strands</td><td>${r.strandInfo.nStrands}</td></tr>
        <tr><td>Original Aps</td><td>${r.strandInfo.originalAps.toFixed(3)} in&sup2;</td></tr>
        <tr><td>Section Loss</td><td>${r.strandInfo.strandLoss}%</td></tr>
        <tr><td>Effective Aps</td><td>${r.strandInfo.effectiveAps.toFixed(3)} in&sup2;</td></tr>
        <tr><td>Depth to CG, d<sub>p,all</sub></td><td>${r.strandInfo.dp.toFixed(3)} in</td></tr>
        <tr><td>Flexure d<sub>p,m</sub> / A<sub>ps,m</sub></td><td>${r.strandInfo.dpMoment.toFixed(3)} in / ${r.strandInfo.effectiveApsMoment.toFixed(3)} in&sup2;</td></tr>
        <tr><td>Shear d<sub>p,v</sub> / A<sub>ps,v</sub></td><td>${r.strandInfo.dpShear.toFixed(3)} in / ${r.strandInfo.effectiveApsShear.toFixed(3)} in&sup2;</td></tr>
        <tr><td>fpu</td><td>${(r.strandInfo.fpu / 1000).toFixed(0)} ksi</td></tr>
        <tr><td>fpe (after losses)</td><td>${(r.strandInfo.fpe / 1000).toFixed(0)} ksi</td></tr>
        <tr><td>fps (at ultimate)</td><td>${(r.strandInfo.fps / 1000).toFixed(1)} ksi</td></tr>
      </table>
    </div>`;
    if (r.strandInfo.layout && r.strandInfo.layout.length) {
      html += `<div class="result-section">
        <h3>Strand Layout</h3>
        <table class="result-table">
          <tr><th>Row</th><th>Count</th><th>Depth (in)</th><th>Debond (ft)</th><th>Effective Aps (in&sup2;)</th><th>Used for Mn</th><th>Used for Vn</th></tr>`;
      for (const row of r.strandInfo.layout) {
        html += `<tr>
          <td>${row.row}</td>
          <td>${row.count}</td>
          <td>${row.depth.toFixed(3)}</td>
          <td>${row.debondLengthFt.toFixed(2)}</td>
          <td>${row.effectiveAps.toFixed(3)}</td>
          <td>${row.momentActive ? 'Yes' : 'No'}</td>
          <td>${row.shearActive ? 'Yes' : 'No'}</td>
        </tr>`;
      }
      html += `</table></div>`;
    }

    // Mild steel (if present)
    if (r.mildSteel) {
      html += `<div class="result-section">
        <h3>Mild Steel Reinforcement</h3>
        <table class="result-table">
          <tr><td>As (effective)</td><td>${r.mildSteel.As.toFixed(2)} in&sup2;</td></tr>
          <tr><td>As (original)</td><td>${r.mildSteel.originalAs.toFixed(2)} in&sup2;</td></tr>
          <tr><td>Section Loss</td><td>${r.mildSteel.lossPercent}%</td></tr>
          <tr><td>fy</td><td>${(r.mildSteel.fy / 1000).toFixed(0)} ksi</td></tr>
          <tr><td>Depth, d</td><td>${r.mildSteel.d} in</td></tr>
        </table>
      </div>`;
    }

    // Capacity
    html += `<div class="result-section">
      <h3>Capacity</h3>
      <table class="result-table">
        <tr><td>Mn</td><td>${r.moment.Mn.toFixed(1)} kip-ft</td><td>&phi; = ${r.moment.phi.toFixed(3)}</td><td>&phi;Mn = ${r.phiMn.toFixed(1)} kip-ft</td></tr>
        <tr><td>Stress block, a</td><td>${r.fpsResult.a.toFixed(2)} in</td><td>c = ${r.fpsResult.c.toFixed(2)} in</td><td>&beta;1 = ${r.fpsResult.beta1.toFixed(3)}</td></tr>
        <tr><td>Behavior</td><td colspan="3">${r.fpsResult.isVoidInCompression ? 'Compression into void zone' : 'Compression above voids'} | &epsilon;t = ${r.moment.epsilonT.toFixed(4)}</td></tr>
        <tr><td>Vn</td><td>${r.shear.Vn.toFixed(1)} kip</td><td>&phi; = ${r.shear.phi.toFixed(2)}</td><td>&phi;Vn = ${r.phiVn.toFixed(1)} kip</td></tr>
        <tr><td>Vc</td><td>${r.shear.Vc.toFixed(1)} kip</td><td>Vs</td><td>${r.shear.Vs.toFixed(1)} kip</td></tr>
        <tr><td>dv (eff. shear depth)</td><td>${r.shear.dv.toFixed(2)} in</td><td colspan="2">dv = max(dp-a/2, 0.9dp, 0.72h)</td></tr>
      </table>
    </div>`;

    // LRFR results
    if (r.lrfr) {
      html += `<div class="result-section">
        <h3>LRFR Rating Factors</h3>
        <table class="result-table rating-table">
          <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(r.lrfr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}">
          <td>${v.label}</td>
          <td>${v.rfMoment.toFixed(3)}</td>
          <td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td>
          <td>${v.governs}</td>
          <td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td>
        </tr>`;
      }
      html += `</table></div>`;
    }

    // LFR results
    if (r.lfr) {
      html += `<div class="result-section">
        <h3>LFR Rating Factors</h3>
        <table class="result-table rating-table">
          <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Tons</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(r.lfr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}">
          <td>${v.label}</td>
          <td>${v.rfMoment.toFixed(3)}</td>
          <td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td>
          <td>${v.tons.toFixed(1)} T</td>
          <td>${v.governs}</td>
          <td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td>
        </tr>`;
      }
      html += `</table></div>`;
    }

    // ASR results
    if (r.asr) {
      html += `<div class="result-section">
        <h3>ASR Rating Factors</h3>
        <table class="result-table rating-table">
          <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Tons</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(r.asr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}">
          <td>${v.label}</td>
          <td>${v.rfMoment.toFixed(3)}</td>
          <td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td>
          <td>${v.tons.toFixed(1)} T</td>
          <td>${v.governs}</td>
          <td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td>
        </tr>`;
      }
      html += `</table></div>`;
    }

    container.innerHTML = html;
  }

  // Initialize dead load display
  updateDeadLoadDisplay();
})();
