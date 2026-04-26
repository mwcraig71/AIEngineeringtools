/**
 * Application controller — wires UI events to the analysis engine and renderer.
 */

(function () {
  const spanTypeEl = document.getElementById('spanType');
  const numSpansEl = document.getElementById('numSpans');
  const spanLengthsContainer = document.getElementById('spanLengthsContainer');
  const stateCodeEl = document.getElementById('stateCode');
  const truckInfoEl = document.getElementById('truckInfo');

  // ---- UI Setup ----
  spanTypeEl.addEventListener('change', onSpanTypeChange);
  numSpansEl.addEventListener('change', onNumSpansChange);
  stateCodeEl.addEventListener('change', onStateChange);

  function onSpanTypeChange() {
    if (spanTypeEl.value === 'simple') {
      numSpansEl.value = 1;
      numSpansEl.disabled = true;
      rebuildSpanInputs(1);
    } else {
      numSpansEl.disabled = false;
      numSpansEl.value = Math.max(2, parseInt(numSpansEl.value) || 2);
      rebuildSpanInputs(parseInt(numSpansEl.value));
    }
  }

  function onNumSpansChange() {
    let n = parseInt(numSpansEl.value) || 1;
    if (spanTypeEl.value === 'continuous') n = Math.max(2, n);
    numSpansEl.value = n;
    rebuildSpanInputs(n);
  }

  function rebuildSpanInputs(n) {
    const existing = spanLengthsContainer.querySelectorAll('.span-length');
    const currentValues = Array.from(existing).map(el => parseFloat(el.value) || 60);

    spanLengthsContainer.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const val = currentValues[i] || currentValues[currentValues.length - 1] || 60;
      const row = document.createElement('div');
      row.className = 'form-row span-length-row';
      row.innerHTML = `
        <label>Span ${i + 1} Length (ft):</label>
        <input type="number" class="span-length" value="${val}" min="1" max="500" step="0.1">
      `;
      spanLengthsContainer.appendChild(row);
    }
  }

  function onStateChange() {
    const code = stateCodeEl.value;
    truckInfoEl.innerHTML = getTruckInfoHTML(code);
    const truckDef = TRUCKS[code];
    if (truckDef) {
      document.getElementById('laneLoad').value = truckDef.laneLoad || 0;
    }
  }

  // Initialize
  numSpansEl.disabled = true;
  onStateChange();

  // ---- Analysis ----
  window.runAnalysis = function () {
    const spans = getSpanLengths();
    const deadLoad = parseFloat(document.getElementById('deadLoad').value) || 0;
    const wearingSurface = parseFloat(document.getElementById('wearingSurface').value) || 0;
    const impactFactor = parseFloat(document.getElementById('impactFactor').value) || 0.33;
    const laneLoad = parseFloat(document.getElementById('laneLoad').value) || 0.64;
    const stateCode = stateCodeEl.value;
    const truckDef = TRUCKS[stateCode];

    if (!truckDef) {
      alert('Unknown state code: ' + stateCode);
      return;
    }
    if (spans.some(s => s <= 0)) {
      alert('All span lengths must be positive.');
      return;
    }

    const result = runFullAnalysis(spans, deadLoad, wearingSurface, truckDef, impactFactor, laneLoad);

    // Draw diagrams
    drawMomentDiagram('momentCanvas', result);
    drawShearDiagram('shearCanvas', result);
    drawBridgeGeometry('bridgeCanvas', result, truckDef);

    // Summary
    const summaryBox = document.getElementById('summaryBox');
    summaryBox.classList.remove('hidden');
    const totalLen = spans.reduce((a, b) => a + b, 0);
    summaryBox.innerHTML = `
      <h4>Analysis Summary</h4>
      <strong>Configuration:</strong> ${spans.length === 1 ? 'Simple' : 'Continuous'} span
      (${spans.map((s, i) => `Span ${i + 1}: ${s} ft`).join(', ')})<br>
      <strong>Total Length:</strong> ${totalLen.toFixed(1)} ft<br>
      <strong>Design Vehicle:</strong> ${truckDef.name}<br>
      <strong>Dead Load:</strong> ${deadLoad} kip/ft | <strong>Wearing Surface:</strong> ${wearingSurface} kip/ft<br>
      <strong>Impact Factor (IM):</strong> ${(impactFactor * 100).toFixed(0)}%<br>
      <hr style="margin:0.5rem 0;border-color:#c7d4f7">
      <strong>Max Moment:</strong> <span class="val">${result.maxMoment.toFixed(1)} kip-ft</span> |
      <strong>Min Moment:</strong> <span class="val">${result.minMoment.toFixed(1)} kip-ft</span><br>
      <strong>Max Shear:</strong> <span class="val">${result.maxShear.toFixed(1)} kip</span> |
      <strong>Min Shear:</strong> <span class="val">${result.minShear.toFixed(1)} kip</span><br>
      <em style="color:#6b7280;font-size:0.85em">Note: Results are unfactored (service-level). For LRFD Strength I, apply 1.25&times;DC + 1.50&times;DW + 1.75&times;(LL+IM).</em>
    `;
  };

  window.clearResults = function () {
    ['momentCanvas', 'shearCanvas', 'bridgeCanvas'].forEach(id => {
      const c = document.getElementById(id);
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
    });
    document.getElementById('summaryBox').classList.add('hidden');
    document.getElementById('summaryBox').innerHTML = '';
  };

  function getSpanLengths() {
    return Array.from(document.querySelectorAll('.span-length')).map(el => parseFloat(el.value) || 60);
  }
})();
