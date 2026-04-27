/**
 * RC Flat Slab Bridge Rating Engine (one-way strip equivalent)
 *
 * Method assumptions and code references:
 * - One-way equivalent strip analysis for simple-span demand using
 *   bridge live-load helpers from ../bridge-live-load (analysis.js, trucks.js).
 * - LRFR-style rating factor form:
 *   RF = (phi*Rn - gammaDC*DC - gammaDW*DW) / (gammaLL*LL)
 * - Flexure uses Whitney stress block with tension-force equilibrium on
 *   effective (deteriorated) reinforcement/prestress/retrofit steel areas.
 * - Shear uses a simplified AASHTO-style concrete + steel model with
 *   capacity cap: Vn <= 0.25 f'c b dv.
 *
 * Units:
 * - geometry in inches, span in feet
 * - stress in psi
 * - distributed load in kip/ft
 * - moments in kip-ft, shears in kip
 */

const REBAR_AREAS = {
  3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60,
  8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56, 14: 2.25, 18: 4.00
};

const DEFAULT_FACTORS = {
  inventory: { gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.75 },
  operating: { gammaDC: 1.25, gammaDW: 1.35, gammaLL: 1.35 }
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function validateLossPercent(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${name} must be between 0 and 100 percent.`);
  }
  return n;
}

function ensureSimpleSpanModel(analysisModel, engineName) {
  const model = analysisModel || 'simple-span';
  if (model !== 'simple-span') {
    throw new Error(`${engineName} currently supports simple-span analysis only. Set analysisModel to "simple-span" for this app.`);
  }
}

function validateUnitConsistency(input) {
  const mat = input.materials || {};
  const prestress = input.prestress || {};
  const steel = input.retrofitSteel || {};
  const dead = ((input.loads || {}).dead) || {};
  const live = ((input.loads || {}).live) || {};

  if ((mat.fcPsi || 0) > 0 && mat.fcPsi < 500) {
    throw new Error('fcPsi appears to be entered in ksi. Enter concrete strength in psi (e.g., 5000).');
  }
  if ((mat.fyPsi || 0) > 0 && mat.fyPsi < 1000) {
    throw new Error('fyPsi appears to be entered in ksi. Enter steel yield strength in psi (e.g., 60000).');
  }
  if ((prestress.effectiveStressPsi || 0) > 0 && prestress.effectiveStressPsi < 10000) {
    throw new Error('prestressStressPsi appears to be entered in ksi. Enter prestress stress in psi.');
  }
  if ((steel.yieldPsi || 0) > 0 && steel.yieldPsi < 1000) {
    throw new Error('steelYieldPsi appears to be entered in ksi. Enter structural steel yield in psi.');
  }
  if ((live.impact || 0) > 1) {
    throw new Error('Impact factor must be a decimal (e.g., 0.33), not a percent.');
  }
  if ((dead.dcKipPerFt || 0) > 20 ||
      (dead.dwKipPerFt || 0) > 20 ||
      (live.laneLoadKipPerFt || 0) > 20 ||
      (live.permitLaneLoadKipPerFt || 0) > 20) {
    throw new Error('Distributed loads look too large for kip/ft inputs. Verify lane/dead-load units.');
  }
}

function computeBeta1(fcPsi) {
  if (fcPsi <= 4000) return 0.85;
  if (fcPsi >= 8000) return 0.65;
  return 0.85 - 0.05 * ((fcPsi - 4000) / 1000);
}

function barGroupArea(group) {
  if (!group) return 0;
  const areaPer = REBAR_AREAS[group.barSize] || 0;
  return areaPer * (group.count || 0);
}

function effectiveArea(originalArea, lossPercent) {
  const reduction = 1 - lossPercent / 100;
  return originalArea * clamp(reduction, 0, 1);
}

function computeSectionProperties(input) {
  const b = input.geometry.stripWidthIn;
  const h = input.geometry.slabThicknessIn;

  const Ag = b * h;
  const yt = h / 2;
  const Ig = b * Math.pow(h, 3) / 12;

  return {
    b,
    h,
    Ag,
    yt,
    yb: h - yt,
    Ig,
    St: Ig / yt,
    Sb: Ig / (h - yt)
  };
}

function computeEffectiveMaterials(input) {
  const loss = {
    rebarLossPercent: validateLossPercent('rebarLossPercent', input.deterioration.rebarLossPercent),
    steelLossPercent: validateLossPercent('steelLossPercent', input.deterioration.steelLossPercent),
    prestressLossPercent: validateLossPercent('prestressLossPercent', input.deterioration.prestressLossPercent),
    cfrpLossPercent: validateLossPercent('cfrpLossPercent', Number(input.deterioration.cfrpLossPercent || 0))
  };

  const AsTopOriginal = barGroupArea(input.reinforcement.top);
  const AsBotOriginal = barGroupArea(input.reinforcement.bottom);
  const AsTopEff = effectiveArea(AsTopOriginal, loss.rebarLossPercent);
  const AsBotEff = effectiveArea(AsBotOriginal, loss.rebarLossPercent);

  const ApsOriginal = Number(input.prestress.areaIn2 || 0);
  const ApsEff = effectiveArea(ApsOriginal, loss.prestressLossPercent);

  const AsteelOriginal = Number(input.retrofitSteel.areaIn2 || 0);
  const AsteelEff = effectiveArea(AsteelOriginal, loss.steelLossPercent);

  const cfrpStripsInput = (input.cfrp && Array.isArray(input.cfrp.strips)) ? input.cfrp.strips : [];
  const cfrpStrips = cfrpStripsInput.map((strip, i) => {
    const widthIn = Math.max(0, Number(strip.widthIn || 0));
    const thicknessIn = Math.max(0, Number(strip.thicknessIn || 0));
    const count = Math.max(0, Number(strip.count || 0));
    const area = widthIn * thicknessIn * count;
    const depthIn = Number(strip.depthIn || 0);
    const effectiveStressPsi = Math.max(0, Number(strip.effectiveStressPsi || 0));
    const ultimateStressPsi = Math.max(0, Number(strip.ultimateStressPsi || 0));
    const stress = Math.min(
      effectiveStressPsi || ultimateStressPsi || 0,
      ultimateStressPsi || Number.POSITIVE_INFINITY
    );

    return {
      id: strip.id || `cfrp-${i + 1}`,
      widthIn,
      thicknessIn,
      count,
      originalArea: area,
      effectiveArea: effectiveArea(area, loss.cfrpLossPercent),
      depthIn,
      effectiveStressPsi: stress,
      ultimateStressPsi
    };
  });
  const cfrpTotalOriginal = cfrpStrips.reduce((sum, strip) => sum + strip.originalArea, 0);
  const cfrpTotalEffective = cfrpStrips.reduce((sum, strip) => sum + strip.effectiveArea, 0);

  return {
    loss,
    rebar: {
      top: { originalArea: AsTopOriginal, effectiveArea: AsTopEff, depthIn: input.reinforcement.top.depthIn },
      bottom: { originalArea: AsBotOriginal, effectiveArea: AsBotEff, depthIn: input.reinforcement.bottom.depthIn }
    },
    prestress: {
      originalArea: ApsOriginal,
      effectiveArea: ApsEff,
      depthIn: Number(input.prestress.depthIn || 0),
      stressPsi: Number(input.prestress.effectiveStressPsi || 0)
    },
    steel: {
      originalArea: AsteelOriginal,
      effectiveArea: AsteelEff,
      depthIn: Number(input.retrofitSteel.depthIn || 0),
      yieldPsi: Number(input.retrofitSteel.yieldPsi || input.materials.fyPsi)
    },
    cfrp: {
      strips: cfrpStrips,
      totalOriginalArea: cfrpTotalOriginal,
      totalEffectiveArea: cfrpTotalEffective
    }
  };
}

function pickTensionComponents(section, effective, mode) {
  const isPositive = mode === 'positive';
  const mid = section.h / 2;
  const picks = [];

  if (isPositive) {
    picks.push({ area: effective.rebar.bottom.effectiveArea, depthIn: effective.rebar.bottom.depthIn, stressPsi: null, material: 'rebar-bottom' });
  } else {
    picks.push({ area: effective.rebar.top.effectiveArea, depthIn: effective.rebar.top.depthIn, stressPsi: null, material: 'rebar-top' });
  }

  if ((isPositive && effective.prestress.depthIn >= mid) || (!isPositive && effective.prestress.depthIn < mid)) {
    picks.push({ area: effective.prestress.effectiveArea, depthIn: effective.prestress.depthIn, stressPsi: effective.prestress.stressPsi, material: 'prestress' });
  }

  if ((isPositive && effective.steel.depthIn >= mid) || (!isPositive && effective.steel.depthIn < mid)) {
    picks.push({ area: effective.steel.effectiveArea, depthIn: effective.steel.depthIn, stressPsi: null, material: 'structural-steel' });
  }

  for (let i = 0; i < effective.cfrp.strips.length; i++) {
    const strip = effective.cfrp.strips[i];
    if (strip.effectiveArea <= 0 || strip.depthIn <= 0 || strip.effectiveStressPsi <= 0) continue;
    if ((isPositive && strip.depthIn >= mid) || (!isPositive && strip.depthIn < mid)) {
      picks.push({
        area: strip.effectiveArea,
        depthIn: strip.depthIn,
        stressPsi: strip.effectiveStressPsi,
        material: `cfrp-strip-${i + 1}`
      });
    }
  }

  return picks.filter(c => c.area > 0 && c.depthIn > 0);
}

function computeFlexureCapacity(input, section, effective, mode) {
  const fc = input.materials.fcPsi;
  const fy = input.materials.fyPsi;
  const b = section.b;
  const beta1 = computeBeta1(fc);

  const components = pickTensionComponents(section, effective, mode);
  if (components.length === 0) {
    return {
      mode,
      Mn: 0,
      phi: 0.9,
      phiMn: 0,
      a: 0,
      c: 0,
      epsilonT: 0,
      tension: { totalForceLb: 0, dIn: 0, components: [] }
    };
  }

  let totalForce = 0;
  let weightedD = 0;
  const detail = [];

  for (const c of components) {
    let stress = fy;
    if (c.material === 'prestress') stress = c.stressPsi || 0;
    if (c.material === 'structural-steel') stress = effective.steel.yieldPsi || fy;
    if (c.material.indexOf('cfrp-strip-') === 0) stress = c.stressPsi || 0;
    const force = c.area * stress;
    totalForce += force;
    weightedD += force * c.depthIn;
    detail.push({ material: c.material, area: c.area, stressPsi: stress, depthIn: c.depthIn, forceLb: force });
  }

  if (totalForce <= 0) {
    return {
      mode,
      Mn: 0,
      phi: 0.9,
      phiMn: 0,
      a: 0,
      c: 0,
      epsilonT: 0,
      tension: { totalForceLb: 0, dIn: 0, components: detail }
    };
  }

  const d = weightedD / totalForce;
  const a = totalForce / (0.85 * fc * b);
  const c = a / beta1;

  const epsilonT = c > 0 ? 0.003 * Math.abs(d - c) / c : 0.01;
  let phi;
  if (epsilonT >= 0.005) phi = 0.9;
  else if (epsilonT <= 0.002) phi = 0.75;
  else phi = 0.75 + 0.15 * (epsilonT - 0.002) / 0.003;

  const nominalLbIn = totalForce * Math.max(d - a / 2, 0);
  const Mn = nominalLbIn / 12000;

  return {
    mode,
    Mn,
    phi,
    phiMn: phi * Mn,
    a,
    c,
    epsilonT,
    tension: { totalForceLb: totalForce, dIn: d, components: detail }
  };
}

function computeShearCapacity(input, section, effective) {
  const fc = input.materials.fcPsi;
  const fy = input.materials.fyPsi;

  const stirrups = input.reinforcement.stirrups || { barSize: 0, legs: 0, spacingIn: 12 };
  const AvOriginal = (REBAR_AREAS[stirrups.barSize] || 0) * (stirrups.legs || 0);
  const AvEffective = effectiveArea(AvOriginal, effective.loss.rebarLossPercent);

  const d = input.reinforcement.bottom.depthIn;
  const dv = Math.max(0.9 * d, 0.72 * section.h);

  const VcLb = 2 * Math.sqrt(fc) * section.b * dv;
  const VsLb = (stirrups.spacingIn > 0) ? (AvEffective * fy * dv / stirrups.spacingIn) : 0;
  const VnMaxLb = 0.25 * fc * section.b * dv;
  const VnLb = Math.min(VcLb + VsLb, VnMaxLb);

  const phi = 0.9;
  const Vn = Math.max(0, VnLb / 1000);

  return {
    Vn,
    phi,
    phiVn: phi * Vn,
    Vc: VcLb / 1000,
    Vs: Math.max(0, Math.min(VsLb, Math.max(VnMaxLb - VcLb, 0))) / 1000,
    AvOriginal,
    AvEffective,
    dv
  };
}

function computeDeadEffects(input) {
  const L = input.spanFt;
  const wDC = Number(input.loads.dead.dcKipPerFt || 0);
  const wDW = Number(input.loads.dead.dwKipPerFt || 0);

  const mDCPos = wDC * L * L / 8;
  const mDWPos = wDW * L * L / 8;

  const negFactor = clamp(Number(input.loads.dead.negativeMomentFactor || 0.65), 0, 1.2);
  const mDCNeg = mDCPos * negFactor;
  const mDWNeg = mDWPos * negFactor;

  const vDC = wDC * L / 2;
  const vDW = wDW * L / 2;

  return {
    positiveMoment: { DC: mDCPos, DW: mDWPos, total: mDCPos + mDWPos },
    negativeMoment: { DC: mDCNeg, DW: mDWNeg, total: mDCNeg + mDWNeg },
    shear: { DC: vDC, DW: vDW, total: vDC + vDW }
  };
}

function resolveTruck(code, rearSpacingFt) {
  const def = TRUCKS[code];
  if (!def) throw new Error(`Unknown truck code: ${code}`);
  if (!def.variableSpacing) return def;

  const spacing = Number.isFinite(rearSpacingFt) ? rearSpacingFt : def.variableSpacing.min;
  return {
    ...def,
    variableSpacing: {
      ...def.variableSpacing,
      min: spacing,
      max: spacing
    }
  };
}

function computeLiveEffectsCase(input, truckDef, laneLoadKipPerFt) {
  const spanFt = input.spanFt;
  const impact = Number(input.loads.live.impact || 0);
  const dist = Number(input.loads.live.distributionFactor || 1);

  const truck = computeTruckEnvelopeLL(spanFt, truckDef, impact);
  const lane = simpleBeamUniformMomentShear(spanFt, laneLoadKipPerFt, ANALYSIS_POINTS);

  const maxTruckMoment = Math.max.apply(null, truck.maxMoments);
  const maxTruckShear = Math.max.apply(null, truck.maxShears);
  const maxLaneMoment = Math.max.apply(null, lane.moments);
  const maxLaneShear = Math.max.apply(null, lane.shears.map(Math.abs));

  const posMoment = dist * (maxTruckMoment + maxLaneMoment);
  const negMoment = posMoment * clamp(Number(input.loads.live.negativeMomentFactor || 0.65), 0, 1.2);
  const shear = dist * (maxTruckShear + maxLaneShear);

  return {
    truckMoment: dist * maxTruckMoment,
    laneMoment: dist * maxLaneMoment,
    truckShear: dist * maxTruckShear,
    laneShear: dist * maxLaneShear,
    positiveMoment: posMoment,
    negativeMoment: negMoment,
    shear
  };
}

function computeTruckEnvelopeLL(spanFt, truckDef, impactFactor) {
  if (truckDef.variableSpacing) {
    let env = null;
    let first = true;
    const sMin = truckDef.variableSpacing.min;
    const sMax = truckDef.variableSpacing.max;
    for (let sp = sMin; sp <= sMax + 1e-9; sp += 1) {
      const axles = getTruckAxles(truckDef, sp);
      const e = truckEnvelopeSimple(spanFt, axles, ANALYSIS_POINTS, impactFactor);
      if (first) {
        env = e;
        first = false;
      } else {
        for (let i = 0; i < env.maxMoments.length; i++) {
          if (e.maxMoments[i] > env.maxMoments[i]) env.maxMoments[i] = e.maxMoments[i];
          if (e.maxShears[i] > env.maxShears[i]) env.maxShears[i] = e.maxShears[i];
        }
      }
    }
    return env;
  }

  const axles = getTruckAxles(truckDef);
  return truckEnvelopeSimple(spanFt, axles, ANALYSIS_POINTS, impactFactor);
}

function computeRF(phiRn, dead, live, factors) {
  if (live <= 0) return 999;
  return (phiRn - factors.gammaDC * dead.DC - factors.gammaDW * dead.DW) / (factors.gammaLL * live);
}

function buildLimitStateResult(limitName, nominalResistance, phi, dead, live) {
  const phiRn = phi * nominalResistance;

  const invRF = computeRF(phiRn, dead, live, DEFAULT_FACTORS.inventory);
  const opRF = computeRF(phiRn, dead, live, DEFAULT_FACTORS.operating);

  return {
    limitState: limitName,
    nominalResistance,
    phi,
    factoredResistance: phiRn,
    deadLoadEffect: dead.DC + dead.DW,
    liveLoadEffect: live,
    deadBreakdown: dead,
    rating: {
      inventory: invRF,
      operating: opRF
    }
  };
}

function summarizeGoverning(limitStates) {
  let gov = null;
  for (const ls of limitStates) {
    const checks = [
      { type: 'inventory', value: ls.rating.inventory },
      { type: 'operating', value: ls.rating.operating }
    ];
    for (const c of checks) {
      if (!gov || c.value < gov.value) {
        gov = {
          limitState: ls.limitState,
          ratingType: c.type,
          value: c.value
        };
      }
    }
  }
  return gov;
}

function runRCFlatSlabRating(input) {
  ensureSimpleSpanModel(input.analysisModel, 'rc-flat-slab-rating');
  validateUnitConsistency(input);

  const section = computeSectionProperties(input);
  const effective = computeEffectiveMaterials(input);

  const flexPos = computeFlexureCapacity(input, section, effective, 'positive');
  const flexNeg = computeFlexureCapacity(input, section, effective, 'negative');
  const shear = computeShearCapacity(input, section, effective);

  const dead = computeDeadEffects(input);

  const designTruck = resolveTruck(input.loads.live.designTruckCode, input.loads.live.designRearSpacingFt);
  const designLive = computeLiveEffectsCase(input, designTruck, input.loads.live.laneLoadKipPerFt);

  const permitTruck = {
    name: 'Permit Truck',
    axles: input.loads.live.permitTruck.axles || []
  };
  const permitLive = computeLiveEffectsCase(
    input,
    permitTruck,
    Number(input.loads.live.permitLaneLoadKipPerFt || 0)
  );

  const cases = {
    design: {
      truck: designTruck.name,
      liveEffects: designLive,
      limitStates: [
        buildLimitStateResult('positive_flexure', flexPos.Mn, flexPos.phi, dead.positiveMoment, designLive.positiveMoment),
        buildLimitStateResult('negative_flexure', flexNeg.Mn, flexNeg.phi, dead.negativeMoment, designLive.negativeMoment),
        buildLimitStateResult('shear', shear.Vn, shear.phi, dead.shear, designLive.shear)
      ]
    },
    permit: {
      truck: 'Permit Truck',
      liveEffects: permitLive,
      limitStates: [
        buildLimitStateResult('positive_flexure', flexPos.Mn, flexPos.phi, dead.positiveMoment, permitLive.positiveMoment),
        buildLimitStateResult('negative_flexure', flexNeg.Mn, flexNeg.phi, dead.negativeMoment, permitLive.negativeMoment),
        buildLimitStateResult('shear', shear.Vn, shear.phi, dead.shear, permitLive.shear)
      ]
    }
  };

  cases.design.governing = summarizeGoverning(cases.design.limitStates);
  cases.permit.governing = summarizeGoverning(cases.permit.limitStates);

  return {
    metadata: {
      engine: 'rc-flat-slab-rating',
      analysisModel: 'one-way-strip-equivalent',
      unitSystem: 'US'
    },
    section,
    flexure: {
      positive: flexPos,
      negative: flexNeg
    },
    shear,
    deadEffects: dead,
    deteriorationSummary: {
      rebarLossPercent: effective.loss.rebarLossPercent,
      steelLossPercent: effective.loss.steelLossPercent,
      prestressLossPercent: effective.loss.prestressLossPercent,
      cfrpLossPercent: effective.loss.cfrpLossPercent,
      materials: {
        rebarTop: effective.rebar.top,
        rebarBottom: effective.rebar.bottom,
        prestress: effective.prestress,
        structuralSteel: effective.steel,
        cfrp: effective.cfrp,
        stirrups: {
          originalAreaPerSpacing: shear.AvOriginal,
          effectiveAreaPerSpacing: shear.AvEffective
        }
      }
    },
    cases
  };
}

function createDefaultFlatSlabInput() {
  return {
    spanFt: 42,
    geometry: {
      stripWidthIn: 96,
      slabThicknessIn: 28
    },
    materials: {
      fcPsi: 5000,
      fyPsi: 60000
    },
    reinforcement: {
      top: { barSize: 8, count: 7, depthIn: 3.5 },
      bottom: { barSize: 9, count: 8, depthIn: 24.5 },
      stirrups: { barSize: 4, legs: 2, spacingIn: 12 }
    },
    prestress: {
      areaIn2: 1.5,
      depthIn: 22,
      effectiveStressPsi: 170000
    },
    retrofitSteel: {
      areaIn2: 0.8,
      depthIn: 25,
      yieldPsi: 50000
    },
    cfrp: {
      strips: [
        { id: 'A', widthIn: 4, thicknessIn: 0.07, count: 5, depthIn: 26.5, effectiveStressPsi: 95000, ultimateStressPsi: 180000 },
        { id: 'B', widthIn: 8, thicknessIn: 0.07, count: 3, depthIn: 26.5, effectiveStressPsi: 95000, ultimateStressPsi: 180000 },
        { id: 'C', widthIn: 12, thicknessIn: 0.07, count: 2, depthIn: 26.5, effectiveStressPsi: 95000, ultimateStressPsi: 180000 }
      ]
    },
    loads: {
      dead: {
        dcKipPerFt: 1.15,
        dwKipPerFt: 0.25,
        negativeMomentFactor: 0.65
      },
      live: {
        designTruckCode: 'AASHTO',
        designRearSpacingFt: 18,
        laneLoadKipPerFt: 0.64,
        permitLaneLoadKipPerFt: 0,
        impact: 0.33,
        distributionFactor: 0.6,
        negativeMomentFactor: 0.65,
        permitTruck: {
          axles: [
            { weight: 10, position: 0 },
            { weight: 24, position: 12 },
            { weight: 24, position: 24 },
            { weight: 16, position: 36 }
          ]
        }
      }
    },
    deterioration: {
      rebarLossPercent: 0,
      steelLossPercent: 0,
      prestressLossPercent: 0,
      cfrpLossPercent: 0
    }
  };
}
