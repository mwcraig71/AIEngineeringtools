(function () {
  const form = document.getElementById('ratingForm');
  const output = document.getElementById('output');

  function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  }

  function getNumber(id, fallback) {
    const v = parseFloat(document.getElementById(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  function getInt(id, fallback) {
    const v = parseInt(document.getElementById(id).value, 10);
    return Number.isFinite(v) ? v : fallback;
  }

  function setDefaults() {
    const d = createDefaultFlatSlabInput();

    setValue('spanFt', d.spanFt);
    setValue('stripWidthIn', d.geometry.stripWidthIn);
    setValue('slabThicknessIn', d.geometry.slabThicknessIn);

    setValue('fcPsi', d.materials.fcPsi);
    setValue('fyPsi', d.materials.fyPsi);

    setValue('topBarSize', d.reinforcement.top.barSize);
    setValue('topBarCount', d.reinforcement.top.count);
    setValue('topBarDepthIn', d.reinforcement.top.depthIn);

    setValue('bottomBarSize', d.reinforcement.bottom.barSize);
    setValue('bottomBarCount', d.reinforcement.bottom.count);
    setValue('bottomBarDepthIn', d.reinforcement.bottom.depthIn);

    setValue('stirrupBarSize', d.reinforcement.stirrups.barSize);
    setValue('stirrupLegs', d.reinforcement.stirrups.legs);
    setValue('stirrupSpacingIn', d.reinforcement.stirrups.spacingIn);

    setValue('prestressAreaIn2', d.prestress.areaIn2);
    setValue('prestressDepthIn', d.prestress.depthIn);
    setValue('prestressStressPsi', d.prestress.effectiveStressPsi);

    setValue('steelAreaIn2', d.retrofitSteel.areaIn2);
    setValue('steelDepthIn', d.retrofitSteel.depthIn);
    setValue('steelYieldPsi', d.retrofitSteel.yieldPsi);
    setValue('cfrpStripsJson', JSON.stringify(d.cfrp.strips, null, 2));

    setValue('dcKipPerFt', d.loads.dead.dcKipPerFt);
    setValue('dwKipPerFt', d.loads.dead.dwKipPerFt);
    setValue('deadNegativeFactor', d.loads.dead.negativeMomentFactor);

    setValue('designTruckCode', d.loads.live.designTruckCode);
    setValue('designRearSpacingFt', d.loads.live.designRearSpacingFt);
    setValue('laneLoadKipPerFt', d.loads.live.laneLoadKipPerFt);
    setValue('permitLaneLoadKipPerFt', d.loads.live.permitLaneLoadKipPerFt);
    setValue('impact', d.loads.live.impact);
    setValue('distributionFactor', d.loads.live.distributionFactor);
    setValue('liveNegativeFactor', d.loads.live.negativeMomentFactor);
    setValue('permitTruckAxles', JSON.stringify(d.loads.live.permitTruck.axles, null, 2));

    setValue('rebarLossPercent', d.deterioration.rebarLossPercent);
    setValue('steelLossPercent', d.deterioration.steelLossPercent);
    setValue('prestressLossPercent', d.deterioration.prestressLossPercent);
    setValue('cfrpLossPercent', d.deterioration.cfrpLossPercent);
  }

  function populateTruckSelect() {
    const sel = document.getElementById('designTruckCode');
    const keys = Object.keys(TRUCKS);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `${k} - ${TRUCKS[k].name}`;
      sel.appendChild(opt);
    }
  }

  function collectInput() {
    let permitAxles;
    let cfrpStrips;
    try {
      permitAxles = JSON.parse(document.getElementById('permitTruckAxles').value);
      if (!Array.isArray(permitAxles)) {
        throw new Error('Permit truck axles must be an array.');
      }
    } catch (err) {
      alert('Invalid permit axle JSON: ' + err.message);
      return null;
    }

    try {
      cfrpStrips = JSON.parse(document.getElementById('cfrpStripsJson').value || '[]');
      if (!Array.isArray(cfrpStrips)) {
        throw new Error('CFRP strips JSON must be an array.');
      }
    } catch (err) {
      alert('Invalid CFRP strip JSON: ' + err.message);
      return null;
    }

    return {
      spanFt: getNumber('spanFt', 42),
      geometry: {
        stripWidthIn: getNumber('stripWidthIn', 96),
        slabThicknessIn: getNumber('slabThicknessIn', 28)
      },
      materials: {
        fcPsi: getNumber('fcPsi', 5000),
        fyPsi: getNumber('fyPsi', 60000)
      },
      reinforcement: {
        top: {
          barSize: getInt('topBarSize', 8),
          count: getInt('topBarCount', 7),
          depthIn: getNumber('topBarDepthIn', 3.5)
        },
        bottom: {
          barSize: getInt('bottomBarSize', 9),
          count: getInt('bottomBarCount', 8),
          depthIn: getNumber('bottomBarDepthIn', 24.5)
        },
        stirrups: {
          barSize: getInt('stirrupBarSize', 4),
          legs: getInt('stirrupLegs', 2),
          spacingIn: getNumber('stirrupSpacingIn', 12)
        }
      },
      prestress: {
        areaIn2: getNumber('prestressAreaIn2', 1.5),
        depthIn: getNumber('prestressDepthIn', 22),
        effectiveStressPsi: getNumber('prestressStressPsi', 170000)
      },
      retrofitSteel: {
        areaIn2: getNumber('steelAreaIn2', 0.8),
        depthIn: getNumber('steelDepthIn', 25),
        yieldPsi: getNumber('steelYieldPsi', 50000)
      },
      cfrp: {
        strips: cfrpStrips
      },
      loads: {
        dead: {
          dcKipPerFt: getNumber('dcKipPerFt', 1.15),
          dwKipPerFt: getNumber('dwKipPerFt', 0.25),
          negativeMomentFactor: getNumber('deadNegativeFactor', 0.65)
        },
        live: {
          designTruckCode: document.getElementById('designTruckCode').value,
          designRearSpacingFt: getNumber('designRearSpacingFt', 18),
          laneLoadKipPerFt: getNumber('laneLoadKipPerFt', 0.64),
          permitLaneLoadKipPerFt: getNumber('permitLaneLoadKipPerFt', 0),
          impact: getNumber('impact', 0.33),
          distributionFactor: getNumber('distributionFactor', 0.60),
          negativeMomentFactor: getNumber('liveNegativeFactor', 0.65),
          permitTruck: { axles: permitAxles }
        }
      },
      deterioration: {
        rebarLossPercent: getNumber('rebarLossPercent', 0),
        steelLossPercent: getNumber('steelLossPercent', 0),
        prestressLossPercent: getNumber('prestressLossPercent', 0),
        cfrpLossPercent: getNumber('cfrpLossPercent', 0)
      }
    };
  }

  function tableRows(limitStates) {
    return limitStates.map((ls) => {
      return `<tr>
        <td>${ls.limitState}</td>
        <td>${ls.nominalResistance.toFixed(1)}</td>
        <td>${ls.factoredResistance.toFixed(1)}</td>
        <td>${ls.deadLoadEffect.toFixed(1)}</td>
        <td>${ls.liveLoadEffect.toFixed(1)}</td>
        <td>${ls.rating.inventory.toFixed(3)}</td>
        <td>${ls.rating.operating.toFixed(3)}</td>
      </tr>`;
    }).join('');
  }

  function render(result) {
    const design = result.cases.design;
    const permit = result.cases.permit;
    const det = result.deteriorationSummary;

    output.innerHTML = `
      <section class="summary">
        <h2>RC Flat Slab Rating Summary</h2>
        <p><strong>Design governing:</strong> ${design.governing.limitState} (${design.governing.ratingType}) RF=${design.governing.value.toFixed(3)}</p>
        <p><strong>Permit governing:</strong> ${permit.governing.limitState} (${permit.governing.ratingType}) RF=${permit.governing.value.toFixed(3)}</p>
      </section>

      <section>
        <h3>Deterioration Summary</h3>
        <table>
          <thead>
            <tr><th>Material</th><th>Loss %</th><th>Original Area (in²)</th><th>Effective Area (in²)</th></tr>
          </thead>
          <tbody>
            <tr><td>Rebar Top</td><td>${det.rebarLossPercent.toFixed(1)}</td><td>${det.materials.rebarTop.originalArea.toFixed(3)}</td><td>${det.materials.rebarTop.effectiveArea.toFixed(3)}</td></tr>
            <tr><td>Rebar Bottom</td><td>${det.rebarLossPercent.toFixed(1)}</td><td>${det.materials.rebarBottom.originalArea.toFixed(3)}</td><td>${det.materials.rebarBottom.effectiveArea.toFixed(3)}</td></tr>
            <tr><td>Prestress</td><td>${det.prestressLossPercent.toFixed(1)}</td><td>${det.materials.prestress.originalArea.toFixed(3)}</td><td>${det.materials.prestress.effectiveArea.toFixed(3)}</td></tr>
            <tr><td>Structural Steel</td><td>${det.steelLossPercent.toFixed(1)}</td><td>${det.materials.structuralSteel.originalArea.toFixed(3)}</td><td>${det.materials.structuralSteel.effectiveArea.toFixed(3)}</td></tr>
            <tr><td>CFRP (all strips)</td><td>${det.cfrpLossPercent.toFixed(1)}</td><td>${det.materials.cfrp.totalOriginalArea.toFixed(3)}</td><td>${det.materials.cfrp.totalEffectiveArea.toFixed(3)}</td></tr>
            <tr><td>Shear Stirrups (A<sub>v</sub>)</td><td>${det.rebarLossPercent.toFixed(1)}</td><td>${det.materials.stirrups.originalAreaPerSpacing.toFixed(3)}</td><td>${det.materials.stirrups.effectiveAreaPerSpacing.toFixed(3)}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Design Case (${design.truck})</h3>
        <table>
          <thead>
            <tr><th>Limit State</th><th>Nominal Rn</th><th>Factored φRn</th><th>DL Effect</th><th>LL Effect</th><th>RF Inv</th><th>RF Op</th></tr>
          </thead>
          <tbody>${tableRows(design.limitStates)}</tbody>
        </table>
      </section>

      <section>
        <h3>Permit Case</h3>
        <table>
          <thead>
            <tr><th>Limit State</th><th>Nominal Rn</th><th>Factored φRn</th><th>DL Effect</th><th>LL Effect</th><th>RF Inv</th><th>RF Op</th></tr>
          </thead>
          <tbody>${tableRows(permit.limitStates)}</tbody>
        </table>
      </section>
    `;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const input = collectInput();
    if (!input) return;

    try {
      const result = runRCFlatSlabRating(input);
      render(result);
    } catch (err) {
      alert('Rating failed: ' + err.message);
    }
  });

  document.getElementById('btnDefaults').addEventListener('click', function () {
    setDefaults();
  });

  populateTruckSelect();
  setDefaults();
})();
