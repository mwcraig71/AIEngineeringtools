/**
 * Application controller for Non-Composite Steel Girder Load Rating.
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

  // ---- Section type toggle ----
  const radios = document.querySelectorAll('input[name="sectionType"]');
  const rolledEl = document.getElementById('rolledSection');
  const plateEl = document.getElementById('plateSection');

  radios.forEach(r => {
    r.addEventListener('change', () => {
      const isRolled = document.querySelector('input[name="sectionType"]:checked').value === 'rolled';
      rolledEl.classList.toggle('hidden', !isRolled);
      plateEl.classList.toggle('hidden', isRolled);
      updateDeadLoadDisplay();
    });
  });

  // ---- Populate W-shape dropdown ----
  const wShapeSelect = document.getElementById('wShape');
  const shapes = getWShapeList();
  shapes.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === 'W33x130') opt.selected = true;
    wShapeSelect.appendChild(opt);
  });

  wShapeSelect.addEventListener('change', () => {
    updateRolledDisplay();
    updateDeadLoadDisplay();
  });

  function updateRolledDisplay() {
    const props = getWShapeProps(wShapeSelect.value);
    if (!props) return;
    const el = document.getElementById('rolledProps');
    el.innerHTML = `
      <div class="section-props-grid">
        <span>d = ${props.d} in</span>
        <span>b<sub>f</sub> = ${props.bf} in</span>
        <span>t<sub>f</sub> = ${props.tf} in</span>
        <span>t<sub>w</sub> = ${props.tw} in</span>
        <span>A = ${props.A} in&sup2;</span>
        <span>I<sub>x</sub> = ${props.Ix} in&sup4;</span>
        <span>S<sub>x</sub> = ${props.Sx} in&sup3;</span>
        <span>Z<sub>x</sub> = ${props.Zx} in&sup3;</span>
        <span>r<sub>y</sub> = ${props.ry} in</span>
      </div>
    `;
  }
  updateRolledDisplay();

  // ---- Truck info ----
  const stateCodeEl = document.getElementById('stateCode');
  const truckInfoEl = document.getElementById('truckInfo');
  stateCodeEl.addEventListener('change', () => {
    truckInfoEl.innerHTML = getTruckInfoHTML(stateCodeEl.value);
    document.getElementById('laneLoad').value = TRUCKS[stateCodeEl.value].laneLoad;
  });
  truckInfoEl.innerHTML = getTruckInfoHTML(stateCodeEl.value);

  // ---- Check point management ----
  let checkPointCount = 0;

  window.addCheckPoint = function () {
    checkPointCount++;
    const container = document.getElementById('checkPointsContainer');
    const div = document.createElement('div');
    div.className = 'check-point';
    div.dataset.idx = checkPointCount;

    const spanFt = parseFloat(document.getElementById('spanLength').value) || 60;
    const defaultLoc = Math.round(spanFt / 2 * 10) / 10;

    // Get original section dims for placeholders
    const origDims = getOriginalDims();

    div.innerHTML = `
      <div class="layer-header">Check Point ${checkPointCount}</div>
      <div class="form-row">
        <label>Location from left (ft):</label>
        <input type="number" class="cp-location" value="${defaultLoc}" min="0" max="${spanFt}" step="0.1">
      </div>
      <div class="sub-header">Remaining Dimensions (leave blank for original)</div>
      <div class="form-row">
        <label>Web thickness, t<sub>w</sub> (in):</label>
        <input type="number" class="cp-tw" placeholder="${origDims.tw}" min="0" step="0.0625">
      </div>
      <div class="form-row">
        <label>Top flange thickness, t<sub>fc</sub> (in):</label>
        <input type="number" class="cp-tfc" placeholder="${origDims.tfc}" min="0" step="0.0625">
      </div>
      <div class="form-row">
        <label>Top flange width, b<sub>fc</sub> (in):</label>
        <input type="number" class="cp-bfc" placeholder="${origDims.bfc}" min="0" step="0.125">
      </div>
      <div class="form-row">
        <label>Bot flange thickness, t<sub>ft</sub> (in):</label>
        <input type="number" class="cp-tft" placeholder="${origDims.tft}" min="0" step="0.0625">
      </div>
      <div class="form-row">
        <label>Bot flange width, b<sub>ft</sub> (in):</label>
        <input type="number" class="cp-bft" placeholder="${origDims.bft}" min="0" step="0.125">
      </div>
    `;
    container.appendChild(div);
  };

  window.removeCheckPoint = function () {
    const container = document.getElementById('checkPointsContainer');
    if (container.children.length > 0) {
      container.removeChild(container.lastElementChild);
      checkPointCount = Math.max(0, checkPointCount - 1);
    }
  };

  function getOriginalDims() {
    const isRolled = document.querySelector('input[name="sectionType"]:checked').value === 'rolled';
    if (isRolled) {
      const ws = getWShapeProps(wShapeSelect.value);
      if (ws) return { tw: ws.tw, tfc: ws.tf, bfc: ws.bf, tft: ws.tf, bft: ws.bf };
    }
    return {
      tw: parseFloat(document.getElementById('pgWebThick').value) || 0.5,
      tfc: parseFloat(document.getElementById('pgTopFlangeT').value) || 1.0,
      bfc: parseFloat(document.getElementById('pgTopFlangeW').value) || 14,
      tft: parseFloat(document.getElementById('pgBotFlangeT').value) || 1.0,
      bft: parseFloat(document.getElementById('pgBotFlangeW').value) || 14
    };
  }

  // ---- Dead load computation ----
  function updateDeadLoadDisplay() {
    const isRolled = document.querySelector('input[name="sectionType"]:checked').value === 'rolled';
    let steelArea;
    if (isRolled) {
      const ws = getWShapeProps(wShapeSelect.value);
      steelArea = ws ? ws.A : 0;
    } else {
      const D  = parseFloat(document.getElementById('pgWebDepth').value) || 36;
      const tw = parseFloat(document.getElementById('pgWebThick').value) || 0.5;
      const bfc = parseFloat(document.getElementById('pgTopFlangeW').value) || 14;
      const tfc = parseFloat(document.getElementById('pgTopFlangeT').value) || 1.0;
      const bft = parseFloat(document.getElementById('pgBotFlangeW').value) || 14;
      const tft = parseFloat(document.getElementById('pgBotFlangeT').value) || 1.0;
      steelArea = bfc * tfc + D * tw + bft * tft;
    }

    // Steel unit weight: 490 pcf = 490/144 psi = 3.403 psi
    // Self-weight = A (in^2) * 490 / 144 / 1000 * 12 = A * 490 / 12000 (kip/ft)
    const selfWt = steelArea * 490 / 12000; // kip/ft

    document.getElementById('dcSteelSelf').textContent = selfWt.toFixed(4) + ' kip/ft';

    const dcDeck  = parseFloat(document.getElementById('dcDeck').value) || 0;
    const dcOther = parseFloat(document.getElementById('dcOther').value) || 0;
    const totalDC = selfWt + dcDeck + dcOther;
    document.getElementById('dcTotal').textContent = totalDC.toFixed(4) + ' kip/ft';
  }

  // ---- Gather inputs ----
  function getInputs() {
    const sectionType = document.querySelector('input[name="sectionType"]:checked').value;
    const rolledSection = wShapeSelect.value;
    const Fy = parseFloat(document.getElementById('fy').value) || 50;
    const spanFt = parseFloat(document.getElementById('spanLength').value) || 60;
    const Lb = parseFloat(document.getElementById('unbracedLength').value) || 20;
    const Cb = parseFloat(document.getElementById('cbFactor').value) || 1.0;
    const stiffenerSpacing = parseFloat(document.getElementById('stiffenerSpacing').value) || 0;
    const phiC = parseFloat(document.getElementById('conditionFactor').value);
    const phiS = parseFloat(document.getElementById('systemFactor').value);

    // Plate girder dims
    const plateGirder = {
      D:   parseFloat(document.getElementById('pgWebDepth').value) || 36,
      tw:  parseFloat(document.getElementById('pgWebThick').value) || 0.5,
      bfc: parseFloat(document.getElementById('pgTopFlangeW').value) || 14,
      tfc: parseFloat(document.getElementById('pgTopFlangeT').value) || 1.0,
      bft: parseFloat(document.getElementById('pgBotFlangeW').value) || 14,
      tft: parseFloat(document.getElementById('pgBotFlangeT').value) || 1.0
    };

    // Check points
    const checkPoints = [];
    document.querySelectorAll('.check-point').forEach(el => {
      const loc = parseFloat(el.querySelector('.cp-location').value);
      if (isNaN(loc)) return;
      const cp = { location: loc };
      const tw  = el.querySelector('.cp-tw').value;
      const tfc = el.querySelector('.cp-tfc').value;
      const bfc = el.querySelector('.cp-bfc').value;
      const tft = el.querySelector('.cp-tft').value;
      const bft = el.querySelector('.cp-bft').value;
      if (tw)  cp.twRemaining  = parseFloat(tw);
      if (tfc) cp.tfcRemaining = parseFloat(tfc);
      if (bfc) cp.bfcRemaining = parseFloat(bfc);
      if (tft) cp.tftRemaining = parseFloat(tft);
      if (bft) cp.bftRemaining = parseFloat(bft);
      checkPoints.push(cp);
    });

    // Dead loads
    let steelArea;
    if (sectionType === 'rolled') {
      const ws = getWShapeProps(rolledSection);
      steelArea = ws ? ws.A : 0;
    } else {
      steelArea = plateGirder.bfc * plateGirder.tfc + plateGirder.D * plateGirder.tw + plateGirder.bft * plateGirder.tft;
    }
    const selfWt = steelArea * 490 / 12000;
    const dcDeck = parseFloat(document.getElementById('dcDeck').value) || 0;
    const dcOther = parseFloat(document.getElementById('dcOther').value) || 0;
    const dcW = selfWt + dcDeck + dcOther;
    const dwW = parseFloat(document.getElementById('dwLoad').value) || 0;

    // Live load
    const stateCode = stateCodeEl.value;
    const truckDef = TRUCKS[stateCode];
    const impactFactor = parseFloat(document.getElementById('impactFactor').value) || 0.33;
    const laneLoad = parseFloat(document.getElementById('laneLoad').value) || 0.64;
    const distFactor = parseFloat(document.getElementById('distFactor').value) || 0.6;
    const legalGammaLL = parseFloat(document.getElementById('legalGammaLL').value) || 1.80;

    const methods = {
      lrfr: document.getElementById('doLRFR').checked,
      lfr:  document.getElementById('doLFR').checked,
      asr:  document.getElementById('doASR').checked
    };

    return {
      sectionType, rolledSection, plateGirder,
      Fy, spanFt, Lb, Cb, stiffenerSpacing,
      checkPoints,
      dcW, dwW, truckDef, impactFactor, laneLoad, distFactor,
      phiC, phiS, methods, legalGammaLL
    };
  }

  // ---- Run rating ----
  window.runRating = function () {
    const inputs = getInputs();
    if (!inputs.truckDef) { alert('Unknown truck definition.'); return; }
    if (inputs.spanFt <= 0) { alert('Span length must be positive.'); return; }
    if (!inputs.methods.lrfr && !inputs.methods.lfr && !inputs.methods.asr) {
      alert('Select at least one rating method.'); return;
    }
    for (const cp of inputs.checkPoints) {
      if (cp.location < 0 || cp.location > inputs.spanFt) {
        alert('Check point location (' + cp.location + ' ft) must be within span (0 to ' + inputs.spanFt + ' ft).'); return;
      }
    }

    try {
      const result = runSteelRating(inputs);
      displayResults(result, inputs);
    } catch (e) {
      alert('Error: ' + e.message);
      console.error(e);
    }
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

    const gov = r.governingResult;
    const rf = gov.governingRF;
    const passClass = rf >= 1.0 ? 'pass' : 'fail';
    const passText = rf >= 1.0 ? 'PASS' : 'FAIL';

    const sectionLabel = r.sectionType === 'rolled' ? r.rolledSection : 'Plate Girder';

    summaryBox.innerHTML = `
      <h4>Rating Summary</h4>
      <div class="governing-rf ${passClass}">
        <span class="rf-value">${rf.toFixed(3)}</span>
        <span class="rf-status">${passText}</span>
      </div>
      <div class="summary-details">
        <strong>Governing:</strong> ${gov.governingLabel} at ${gov.label}<br>
        <strong>Section:</strong> ${sectionLabel} | <strong>F<sub>y</sub>:</strong> ${inputs.Fy} ksi | <strong>Span:</strong> ${inputs.spanFt} ft<br>
        <strong>&phi;Mn:</strong> <span class="val">${gov.phiMn.toFixed(1)} kip-ft</span> |
        <strong>&phi;Vn:</strong> <span class="val">${gov.phiVn.toFixed(1)} kip</span><br>
        <strong>Check points evaluated:</strong> ${r.pointResults.length}
        ${gov.hasLoss ? '<br><strong class="loss-warn">Section loss present at governing location</strong>' : ''}
      </div>
    `;

    const container = document.getElementById('resultsContainer');
    let html = '';

    // Base section properties
    const bs = r.baseSection;
    html += `<div class="result-section">
      <h3>Base Section Properties (${sectionLabel})</h3>
      <table class="result-table">
        <tr><td>Total depth, d</td><td>${bs.d.toFixed(2)} in</td><td>Area, A</td><td>${bs.A.toFixed(2)} in&sup2;</td></tr>
        <tr><td>Web depth, D</td><td>${bs.D.toFixed(2)} in</td><td>Web thick, t<sub>w</sub></td><td>${bs.tw.toFixed(4)} in</td></tr>
        <tr><td>Top flange b<sub>fc</sub></td><td>${bs.bfc.toFixed(3)} in</td><td>Top flange t<sub>fc</sub></td><td>${bs.tfc.toFixed(4)} in</td></tr>
        <tr><td>Bot flange b<sub>ft</sub></td><td>${bs.bft.toFixed(3)} in</td><td>Bot flange t<sub>ft</sub></td><td>${bs.tft.toFixed(4)} in</td></tr>
        <tr><td>I<sub>x</sub></td><td>${bs.Ix.toFixed(0)} in&sup4;</td><td>S<sub>xc</sub> (top)</td><td>${bs.Sxc.toFixed(1)} in&sup3;</td></tr>
        <tr><td>S<sub>xt</sub> (bot)</td><td>${bs.Sxt_tens.toFixed(1)} in&sup3;</td><td>Z<sub>x</sub></td><td>${bs.Zx.toFixed(1)} in&sup3;</td></tr>
        <tr><td>D<sub>c</sub></td><td>${bs.Dc.toFixed(2)} in</td><td>r<sub>t</sub></td><td>${bs.rt.toFixed(3)} in</td></tr>
      </table>
    </div>`;

    // Results per check point
    for (const pt of r.pointResults) {
      html += renderPointResult(pt, inputs);
    }

    container.innerHTML = html;
  }

  function renderPointResult(pt, inputs) {
    let html = `<div class="result-section point-result ${pt.hasLoss ? 'has-loss' : ''}">
      <h3>${pt.label}${pt.hasLoss ? ' <span class="loss-badge">Section Loss</span>' : ''}</h3>`;

    // Show reduced section if loss
    if (pt.hasLoss) {
      const s = pt.section;
      html += `<table class="result-table">
        <tr><th colspan="4">Reduced Section at This Location</th></tr>
        <tr><td>t<sub>w</sub></td><td>${s.tw.toFixed(4)} in</td><td>A</td><td>${s.A.toFixed(2)} in&sup2;</td></tr>
        <tr><td>t<sub>fc</sub></td><td>${s.tfc.toFixed(4)} in</td><td>b<sub>fc</sub></td><td>${s.bfc.toFixed(3)} in</td></tr>
        <tr><td>t<sub>ft</sub></td><td>${s.tft.toFixed(4)} in</td><td>b<sub>ft</sub></td><td>${s.bft.toFixed(3)} in</td></tr>
        <tr><td>I<sub>x</sub></td><td>${s.Ix.toFixed(0)} in&sup4;</td><td>S<sub>xc</sub></td><td>${s.Sxc.toFixed(1)} in&sup3;</td></tr>
      </table>`;
    }

    // Capacity
    const m = pt.moment;
    html += `<table class="result-table" style="margin-top:0.5rem">
      <tr><td>M<sub>n</sub></td><td>${m.Mn.toFixed(1)} kip-ft</td><td>M<sub>p</sub></td><td>${m.Mp.toFixed(1)} kip-ft</td></tr>
      <tr><td>M<sub>y</sub></td><td>${m.My.toFixed(1)} kip-ft</td><td>Governs</td><td>${m.governs}</td></tr>
      <tr><td>Web class</td><td>${m.webClass}</td><td>Flange class</td><td>${m.flangeClass}</td></tr>
      <tr><td>L<sub>p</sub></td><td>${m.Lp.toFixed(1)} ft</td><td>L<sub>r</sub></td><td>${m.Lr.toFixed(1)} ft</td></tr>
      <tr><td>&phi;M<sub>n</sub></td><td colspan="3"><strong>${pt.phiMn.toFixed(1)} kip-ft</strong></td></tr>
      <tr><td>V<sub>n</sub></td><td>${pt.shear.Vn.toFixed(1)} kip</td><td>&phi;V<sub>n</sub></td><td><strong>${pt.phiVn.toFixed(1)} kip</strong></td></tr>
      <tr><td>V<sub>p</sub></td><td>${pt.shear.Vp.toFixed(1)} kip</td><td>C</td><td>${pt.shear.C.toFixed(3)}</td></tr>
      <tr><td>D/t<sub>w</sub></td><td>${pt.shear.webRatio.toFixed(1)}</td><td>k</td><td>${pt.shear.k.toFixed(2)}</td></tr>
    </table>`;

    // Demand
    html += `<table class="result-table" style="margin-top:0.5rem">
      <tr><th colspan="4">Demand at ${pt.label}</th></tr>
      <tr><td>DC Moment</td><td>${pt.deadLoads.dcMoment.toFixed(1)} kip-ft</td><td>DC Shear</td><td>${pt.deadLoads.dcShear.toFixed(1)} kip</td></tr>
      <tr><td>DW Moment</td><td>${pt.deadLoads.dwMoment.toFixed(1)} kip-ft</td><td>DW Shear</td><td>${pt.deadLoads.dwShear.toFixed(1)} kip</td></tr>
      <tr><td>LL+IM Moment</td><td>${pt.liveLoads.maxMoment.toFixed(1)} kip-ft</td><td>LL+IM Shear</td><td>${pt.liveLoads.maxShear.toFixed(1)} kip</td></tr>
    </table>`;

    // LRFR
    if (pt.lrfr) {
      html += `<table class="result-table rating-table" style="margin-top:0.5rem">
        <tr><th colspan="6">LRFR Rating Factors</th></tr>
        <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(pt.lrfr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}"><td>${v.label}</td><td>${v.rfMoment.toFixed(3)}</td><td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td><td>${v.governs}</td><td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td></tr>`;
      }
      html += `</table>`;
    }

    // LFR
    if (pt.lfr) {
      html += `<table class="result-table rating-table" style="margin-top:0.5rem">
        <tr><th colspan="7">LFR Rating Factors</th></tr>
        <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Tons</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(pt.lfr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}"><td>${v.label}</td><td>${v.rfMoment.toFixed(3)}</td><td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td><td>${v.tons.toFixed(1)} T</td><td>${v.governs}</td><td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td></tr>`;
      }
      html += `</table>`;
    }

    // ASR
    if (pt.asr) {
      html += `<table class="result-table rating-table" style="margin-top:0.5rem">
        <tr><th colspan="7">ASR Rating Factors</th></tr>
        <tr><th>Level</th><th>RF (Moment)</th><th>RF (Shear)</th><th>Governing RF</th><th>Tons</th><th>Controls</th><th>Status</th></tr>`;
      for (const [, v] of Object.entries(pt.asr)) {
        const cls = v.pass ? 'pass' : 'fail';
        html += `<tr class="${cls}"><td>${v.label}</td><td>${v.rfMoment.toFixed(3)}</td><td>${v.rfShear.toFixed(3)}</td>
          <td><strong>${v.rf.toFixed(3)}</strong></td><td>${v.tons.toFixed(1)} T</td><td>${v.governs}</td><td class="status-cell">${v.pass ? 'PASS' : 'FAIL'}</td></tr>`;
      }
      html += `</table>`;
    }

    html += `</div>`;
    return html;
  }

  // Initialize
  updateDeadLoadDisplay();
})();
