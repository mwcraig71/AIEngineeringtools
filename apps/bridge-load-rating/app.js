/**
 * Application controller for RC Tee Beam Load Rating.
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

  // ---- Rebar layer management ----
  let layerCount = 1;

  window.addRebarLayer = function () {
    layerCount++;
    const container = document.getElementById('rebarLayersContainer');
    const div = document.createElement('div');
    div.className = 'rebar-layer';
    div.dataset.layer = layerCount - 1;
    div.innerHTML = `
      <div class="layer-header">Layer ${layerCount}</div>
      <div class="form-row">
        <label>Bar Size:</label>
        <select class="rebar-size">
          <option value="3">#3</option><option value="4">#4</option>
          <option value="5">#5</option><option value="6">#6</option>
          <option value="7">#7</option><option value="8" selected>#8</option>
          <option value="9">#9</option><option value="10">#10</option>
          <option value="11">#11</option><option value="14">#14</option>
          <option value="18">#18</option>
        </select>
      </div>
      <div class="form-row">
        <label>Number of Bars:</label>
        <input type="number" class="rebar-count" value="2" min="1" max="20" step="1">
      </div>
      <div class="form-row">
        <label>Depth to C.G., d (in):</label>
        <input type="number" class="rebar-depth" value="24" min="1" max="96" step="0.25">
      </div>
      <div class="form-row">
        <label>Section Loss (%):</label>
        <input type="number" class="rebar-loss" value="0" min="0" max="100" step="1">
      </div>
    `;
    container.appendChild(div);
  };

  window.removeRebarLayer = function () {
    const container = document.getElementById('rebarLayersContainer');
    if (container.children.length > 1) {
      container.removeChild(container.lastElementChild);
      layerCount--;
    }
  };

  // ---- Dead load auto-computation ----
  function updateDeadLoadDisplay() {
    const bf = parseFloat(document.getElementById('flangeWidth').value) || 48;
    const hf = parseFloat(document.getElementById('flangeThickness').value) || 7;
    const bw = parseFloat(document.getElementById('webWidth').value) || 14;
    const h = parseFloat(document.getElementById('totalDepth').value) || 30;
    const unitWt = parseFloat(document.getElementById('concUnitWeight').value) || 150;

    const hw = h - hf;
    const areaFt2 = (bf * hf + bw * hw) / 144; // in^2 -> ft^2
    const selfWt = areaFt2 * unitWt / 1000; // kip/ft

    document.getElementById('dcSelfWeight').textContent = selfWt.toFixed(3) + ' kip/ft';

    const dwThick = parseFloat(document.getElementById('dwThickness').value) || 0;
    const dwUnitWt = parseFloat(document.getElementById('dwUnitWeight').value) || 140;
    const beamSpacing = parseFloat(document.getElementById('beamSpacing').value) || 4;
    const dwW = (dwThick / 12) * beamSpacing * dwUnitWt / 1000; // kip/ft
    document.getElementById('dwComputed').textContent = dwW.toFixed(3) + ' kip/ft';
  }

  // ---- Gather inputs ----
  function getInputs() {
    const spanFt = parseFloat(document.getElementById('spanLength').value) || 40;
    const bf = parseFloat(document.getElementById('flangeWidth').value) || 48;
    const hf = parseFloat(document.getElementById('flangeThickness').value) || 7;
    const bw = parseFloat(document.getElementById('webWidth').value) || 14;
    const h = parseFloat(document.getElementById('totalDepth').value) || 30;
    const fc = parseFloat(document.getElementById('fc').value) || 3000;
    const fy = parseFloat(document.getElementById('fy').value) || 60000;
    const beamSpacing = parseFloat(document.getElementById('beamSpacing').value) || 4;
    const concUnitWeight = parseFloat(document.getElementById('concUnitWeight').value) || 150;

    const phiC = parseFloat(document.getElementById('conditionFactor').value);
    const phiS = parseFloat(document.getElementById('systemFactor').value);

    // Rebar layers
    const rebarLayers = [];
    document.querySelectorAll('.rebar-layer').forEach(el => {
      rebarLayers.push({
        barSize: parseInt(el.querySelector('.rebar-size').value),
        count: parseInt(el.querySelector('.rebar-count').value) || 1,
        depth: parseFloat(el.querySelector('.rebar-depth').value) || 27,
        lossPercent: parseFloat(el.querySelector('.rebar-loss').value) || 0
      });
    });

    // Stirrups
    const stirrupSize = parseInt(document.getElementById('stirrupSize').value);
    const stirrupLegs = parseInt(document.getElementById('stirrupLegs').value) || 2;
    const stirrupSpacing = parseFloat(document.getElementById('stirrupSpacing').value) || 12;
    const stirrupLoss = parseFloat(document.getElementById('stirrupLoss').value) || 0;

    // Dead loads
    const hw = h - hf;
    const areaFt2 = (bf * hf + bw * hw) / 144;
    const selfWt = areaFt2 * concUnitWeight / 1000;
    const dcAdditional = parseFloat(document.getElementById('dcAdditional').value) || 0;
    const dcW = selfWt + dcAdditional;

    const dwThick = parseFloat(document.getElementById('dwThickness').value) || 0;
    const dwUnitWt = parseFloat(document.getElementById('dwUnitWeight').value) || 140;
    const dwW = (dwThick / 12) * beamSpacing * dwUnitWt / 1000;

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
      spanFt, bf, hf, bw, h, fc, fy, beamSpacing,
      rebarLayers, stirrupSize, stirrupLegs, stirrupSpacing, stirrupLoss,
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
    if (inputs.hf >= inputs.h) {
      alert('Flange thickness must be less than total depth.');
      return;
    }
    if (inputs.bw > inputs.bf) {
      alert('Web width should not exceed flange width for a tee beam.');
      return;
    }
    if (!inputs.methods.lrfr && !inputs.methods.lfr && !inputs.methods.asr) {
      alert('Select at least one rating method.');
      return;
    }
    // Warn if any rebar depth exceeds total section depth
    for (const layer of inputs.rebarLayers) {
      if (layer.depth > inputs.h) {
        alert('Rebar depth (' + layer.depth + ' in) exceeds total section depth (' + inputs.h + ' in).');
        return;
      }
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

    // Find governing RF across all methods
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
        <strong>Span:</strong> ${inputs.spanFt} ft | <strong>f'c:</strong> ${inputs.fc} psi | <strong>fy:</strong> ${inputs.fy/1000} ksi<br>
        <strong>&phi;Mn:</strong> <span class="val">${r.phiMn.toFixed(1)} kip-ft</span> |
        <strong>&phi;Vn:</strong> <span class="val">${r.phiVn.toFixed(1)} kip</span><br>
        <strong>As (effective):</strong> ${r.totalAs.toFixed(2)} in&sup2; at d = ${r.d.toFixed(1)} in<br>
        <strong>DC Moment:</strong> ${r.deadLoads.dcMoment.toFixed(1)} kip-ft |
        <strong>DW Moment:</strong> ${r.deadLoads.dwMoment.toFixed(1)} kip-ft<br>
        <strong>LL+IM Moment:</strong> ${r.liveLoads.maxMoment.toFixed(1)} kip-ft |
        <strong>LL+IM Shear:</strong> ${r.liveLoads.maxShear.toFixed(1)} kip
      </div>
    `;

    // Detailed results
    const container = document.getElementById('resultsContainer');
    let html = '';

    // Section properties
    html += `<div class="result-section">
      <h3>Section Properties</h3>
      <table class="result-table">
        <tr><td>Gross Area, Ag</td><td>${r.section.Ag.toFixed(1)} in&sup2;</td></tr>
        <tr><td>N.A. from top, yt</td><td>${r.section.yt.toFixed(2)} in</td></tr>
        <tr><td>Gross I, Ig</td><td>${r.section.Ig.toFixed(0)} in&sup4;</td></tr>
        <tr><td>Top Section Modulus, St</td><td>${r.section.St.toFixed(0)} in&sup3;</td></tr>
        <tr><td>Bottom Section Modulus, Sb</td><td>${r.section.Sb.toFixed(0)} in&sup3;</td></tr>
      </table>
    </div>`;

    // Rebar summary
    html += `<div class="result-section">
      <h3>Reinforcement (with Deterioration)</h3>
      <table class="result-table">
        <tr><th>Layer</th><th>Bars</th><th>Original As</th><th>Loss %</th><th>Effective As</th><th>Depth d</th></tr>`;
    r.effectiveRebar.forEach((layer, i) => {
      html += `<tr>
        <td>${i + 1}</td>
        <td>${layer.count} - #${layer.barSize}</td>
        <td>${layer.originalAs.toFixed(2)} in&sup2;</td>
        <td>${layer.lossPercent}%</td>
        <td>${layer.effectiveAs.toFixed(2)} in&sup2;</td>
        <td>${layer.depth} in</td>
      </tr>`;
    });
    html += `<tr class="total-row">
        <td colspan="4"><strong>Total Effective As</strong></td>
        <td><strong>${r.totalAs.toFixed(2)} in&sup2;</strong></td>
        <td><strong>d = ${r.d.toFixed(1)} in</strong></td>
      </tr>
      </table>
    </div>`;

    // Capacity
    html += `<div class="result-section">
      <h3>Capacity</h3>
      <table class="result-table">
        <tr><td>Mn</td><td>${r.moment.Mn.toFixed(1)} kip-ft</td><td>&phi; = ${r.moment.phi.toFixed(3)}</td><td>&phi;Mn = ${r.phiMn.toFixed(1)} kip-ft</td></tr>
        <tr><td>Stress block, a</td><td>${r.moment.a.toFixed(2)} in</td><td>c = ${r.moment.c.toFixed(2)} in</td><td>&beta;1 = ${r.moment.beta1.toFixed(3)}</td></tr>
        <tr><td>Behavior</td><td colspan="3">${r.moment.isFlange ? 'T-beam (compression into web)' : 'Rectangular (compression in flange only)'} | &epsilon;t = ${r.moment.epsilonT.toFixed(4)}</td></tr>
        <tr><td>Vn</td><td>${r.shear.Vn.toFixed(1)} kip</td><td>&phi; = ${r.shear.phi.toFixed(2)}</td><td>&phi;Vn = ${r.phiVn.toFixed(1)} kip</td></tr>
        <tr><td>Vc</td><td>${r.shear.Vc.toFixed(1)} kip</td><td>Vs</td><td>${r.shear.Vs.toFixed(1)} kip</td></tr>
        <tr><td>dv (eff. shear depth)</td><td>${r.shear.dv.toFixed(2)} in</td><td colspan="2">dv = max(d-a/2, 0.9d, 0.72h)</td></tr>
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
