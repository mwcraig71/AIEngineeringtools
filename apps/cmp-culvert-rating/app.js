(function () {
  const form = document.getElementById('ratingForm');
  const output = document.getElementById('output');
  const btnDefaults = document.getElementById('btnDefaults');
  const btnDownload = document.getElementById('btnDownload');

  let lastResult = null;

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function getNumber(id, fallback) {
    const v = Number(document.getElementById(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  function getBool(id, fallback) {
    const v = document.getElementById(id).value;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return fallback;
  }

  function parseFillHeights(text) {
    if (typeof text !== 'string') {
      throw new Error('Fill heights must be a comma-separated list.');
    }

    const tokens = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (tokens.length === 0) {
      throw new Error('At least one fill height is required.');
    }

    return tokens.map((token, index) => {
      const n = Number(token);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error('Invalid fill height at position ' + (index + 1) + ': "' + token + '".');
      }
      return n;
    });
  }

  function collectInput() {
    return {
      fillHeightsFt: parseFillHeights(document.getElementById('fillHeightsFt').value),
      geometry: {
        shape: document.getElementById('shape').value,
        diameterFt: getNumber('diameterFt', 8),
        wallThicknessIn: getNumber('wallThicknessIn', 0.188),
        seamEfficiency: getNumber('seamEfficiency', 0.82),
        beddingFactor: getNumber('beddingFactor', 1.0)
      },
      materials: {
        steelFyKsi: getNumber('steelFyKsi', 42),
        steelEKsi: getNumber('steelEKsi', 29000),
        poisson: getNumber('poisson', 0.3),
        rebarFyKsi: getNumber('rebarFyKsi', 60),
        prestressEffectiveStressKsi: getNumber('prestressEffectiveStressKsi', 125)
      },
      composite: {
        rebarAreaIn2PerFt: getNumber('rebarAreaIn2PerFt', 0.45),
        prestressAreaIn2PerFt: getNumber('prestressAreaIn2PerFt', 0.18),
        leverArmIn: getNumber('leverArmIn', 6)
      },
      loads: {
        soilUnitWeightPcf: getNumber('soilUnitWeightPcf', 125),
        liveSurfaceIntensityKsf: getNumber('liveSurfaceIntensityKsf', 1.6),
        liveDepthExponent: getNumber('liveDepthExponent', 1.25),
        impactFactor: getNumber('impactFactor', 0.33),
        constructionSurchargeKsf: getNumber('constructionSurchargeKsf', 0.15)
      },
      serviceability: {
        allowableDeflectionPercent: getNumber('allowableDeflectionPercent', 5),
        deflectionConstant: getNumber('deflectionConstant', 0.02)
      },
      deterioration: {
        steel: {
          useSegmentedLoss: getBool('useSegmentedLoss', true),
          uniformLossPercent: getNumber('uniformLossPercent', 15),
          crownLossPercent: getNumber('crownLossPercent', 20),
          springlineLossPercent: getNumber('springlineLossPercent', 15),
          invertLossPercent: getNumber('invertLossPercent', 25)
        },
        rebar: {
          lossPercent: getNumber('rebarLossPercent', 10)
        },
        prestress: {
          lossPercent: getNumber('prestressLossPercent', 12)
        }
      }
    };
  }

  function formatRf(rf) {
    if (!Number.isFinite(rf)) return 'inf';
    return rf.toFixed(3);
  }

  function rfClass(rf) {
    if (!Number.isFinite(rf)) return 'rf-good';
    return rf < 1 ? 'rf-bad' : 'rf-good';
  }

  function render(result) {
    let html = '';

    html += '<section>';
    html += '<h2>Results by Fill Height</h2>';
    html += '<table><thead><tr>';
    html += '<th>Fill (ft)</th>';
    html += '<th>Base Inv RF</th><th>Det Inv RF</th><th>Delta</th><th>Governing LS (Det)</th>';
    html += '<th>Base Op RF</th><th>Det Op RF</th><th>Delta</th>';
    html += '</tr></thead><tbody>';

    for (let i = 0; i < result.resultsByFill.length; i++) {
      const row = result.resultsByFill[i];
      const bi = row.baseline.governing.inventory.value;
      const di = row.deteriorated.governing.inventory.value;
      const bo = row.baseline.governing.operating.value;
      const doo = row.deteriorated.governing.operating.value;

      html += '<tr>';
      html += '<td>' + row.fillFt.toFixed(2) + '</td>';
      html += '<td class="' + rfClass(bi) + '">' + formatRf(bi) + '</td>';
      html += '<td class="' + rfClass(di) + '">' + formatRf(di) + '</td>';
      html += '<td>' + row.sensitivity.deltaInventoryRF.toFixed(3) + '</td>';
      html += '<td>' + row.deteriorated.governing.inventory.limitState + '</td>';
      html += '<td class="' + rfClass(bo) + '">' + formatRf(bo) + '</td>';
      html += '<td class="' + rfClass(doo) + '">' + formatRf(doo) + '</td>';
      html += '<td>' + row.sensitivity.deltaOperatingRF.toFixed(3) + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    html += '<p class="small-note">RF &lt; 1.0 indicates no rating margin under selected assumptions.</p>';
    html += '</section>';

    const first = result.resultsByFill[0];
    html += '<section>';
    html += '<h2>Section-Loss Snapshot (first fill height)</h2>';
    html += '<table><thead><tr><th>Metric</th><th>Baseline</th><th>Deteriorated</th></tr></thead><tbody>';
    html += '<tr><td>Steel thickness crown (in)</td><td>' + first.baseline.effectiveSection.steelThicknessIn.crownIn.toFixed(4) + '</td><td>' + first.deteriorated.effectiveSection.steelThicknessIn.crownIn.toFixed(4) + '</td></tr>';
    html += '<tr><td>Steel thickness springline (in)</td><td>' + first.baseline.effectiveSection.steelThicknessIn.springlineIn.toFixed(4) + '</td><td>' + first.deteriorated.effectiveSection.steelThicknessIn.springlineIn.toFixed(4) + '</td></tr>';
    html += '<tr><td>Steel thickness invert (in)</td><td>' + first.baseline.effectiveSection.steelThicknessIn.invertIn.toFixed(4) + '</td><td>' + first.deteriorated.effectiveSection.steelThicknessIn.invertIn.toFixed(4) + '</td></tr>';
    html += '<tr><td>Composite rebar area (in^2/ft)</td><td>' + first.baseline.effectiveSection.rebarAreaIn2PerFt.effective.toFixed(4) + '</td><td>' + first.deteriorated.effectiveSection.rebarAreaIn2PerFt.effective.toFixed(4) + '</td></tr>';
    html += '<tr><td>Composite prestress area (in^2/ft)</td><td>' + first.baseline.effectiveSection.prestressAreaIn2PerFt.effective.toFixed(4) + '</td><td>' + first.deteriorated.effectiveSection.prestressAreaIn2PerFt.effective.toFixed(4) + '</td></tr>';
    html += '</tbody></table>';
    html += '</section>';

    output.innerHTML = html;
  }

  function setDefaults() {
    const d = createDefaultCMPCulvertInput();

    setValue('fillHeightsFt', d.fillHeightsFt.join(', '));

    setValue('shape', d.geometry.shape);
    setValue('diameterFt', d.geometry.diameterFt);
    setValue('wallThicknessIn', d.geometry.wallThicknessIn);
    setValue('seamEfficiency', d.geometry.seamEfficiency);
    setValue('beddingFactor', d.geometry.beddingFactor);

    setValue('steelFyKsi', d.materials.steelFyKsi);
    setValue('steelEKsi', d.materials.steelEKsi);
    setValue('poisson', d.materials.poisson);
    setValue('rebarFyKsi', d.materials.rebarFyKsi);
    setValue('prestressEffectiveStressKsi', d.materials.prestressEffectiveStressKsi);

    setValue('rebarAreaIn2PerFt', d.composite.rebarAreaIn2PerFt);
    setValue('prestressAreaIn2PerFt', d.composite.prestressAreaIn2PerFt);
    setValue('leverArmIn', d.composite.leverArmIn);

    setValue('soilUnitWeightPcf', d.loads.soilUnitWeightPcf);
    setValue('liveSurfaceIntensityKsf', d.loads.liveSurfaceIntensityKsf);
    setValue('liveDepthExponent', d.loads.liveDepthExponent);
    setValue('impactFactor', d.loads.impactFactor);
    setValue('constructionSurchargeKsf', d.loads.constructionSurchargeKsf);

    setValue('allowableDeflectionPercent', d.serviceability.allowableDeflectionPercent);
    setValue('deflectionConstant', d.serviceability.deflectionConstant);

    setValue('useSegmentedLoss', d.deterioration.steel.useSegmentedLoss ? 'true' : 'false');
    setValue('uniformLossPercent', d.deterioration.steel.uniformLossPercent);
    setValue('crownLossPercent', d.deterioration.steel.crownLossPercent);
    setValue('springlineLossPercent', d.deterioration.steel.springlineLossPercent);
    setValue('invertLossPercent', d.deterioration.steel.invertLossPercent);
    setValue('rebarLossPercent', d.deterioration.rebar.lossPercent);
    setValue('prestressLossPercent', d.deterioration.prestress.lossPercent);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    try {
      const input = collectInput();
      const result = runCMPCulvertRating(input);
      lastResult = result;
      btnDownload.disabled = false;
      render(result);
    } catch (err) {
      alert('Rating failed: ' + err.message);
    }
  });

  btnDefaults.addEventListener('click', function () {
    setDefaults();
    output.innerHTML = '';
    btnDownload.disabled = true;
    lastResult = null;
  });

  btnDownload.addEventListener('click', function () {
    if (!lastResult) return;

    const blob = new Blob([JSON.stringify(lastResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cmp-culvert-rating-report.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  setDefaults();
})();
