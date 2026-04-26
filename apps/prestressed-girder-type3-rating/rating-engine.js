/**
 * AASHTO Type III Prestressed Girder Rating Engine
 *
 * Deterministic API for LRFR, LFR, and ASR load rating with deterioration support.
 * Units:
 * - geometry in inches
 * - span in feet
 * - stresses in psi
 * - loads in kip/ft (distributed) and kip (axle)
 * - moments in kip-ft, shears in kip
 */

const STRAND_AREAS = {
  '0.500': 0.153,
  '0.500S': 0.167,
  '0.600': 0.217,
  '0.620': 0.231,
  '0.700': 0.294
};

const REBAR_AREAS = {
  3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60,
  8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56, 14: 2.25, 18: 4.00
};

const TYPE_III_PRESET = {
  name: 'AASHTO Type III',
  depth: 45,
  topFlangeWidth: 20,
  topFlangeThickness: 7,
  webThickness: 7,
  bottomFlangeWidth: 26,
  bottomFlangeThickness: 8
};

function clampPercent(v) {
  const n = Number(v) || 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function computeBeta1(fc) {
  if (fc <= 4000) return 0.85;
  if (fc >= 8000) return 0.65;
  return 0.85 - 0.05 * ((fc - 4000) / 1000);
}

function computeTypeIIISectionProperties(geom) {
  const g = {
    depth: TYPE_III_PRESET.depth,
    topFlangeWidth: TYPE_III_PRESET.topFlangeWidth,
    topFlangeThickness: TYPE_III_PRESET.topFlangeThickness,
    webThickness: TYPE_III_PRESET.webThickness,
    bottomFlangeWidth: TYPE_III_PRESET.bottomFlangeWidth,
    bottomFlangeThickness: TYPE_III_PRESET.bottomFlangeThickness,
    ...(geom || {})
  };

  const h = g.depth;
  const bfTop = g.topFlangeWidth;
  const tfTop = g.topFlangeThickness;
  const bw = g.webThickness;
  const bfBot = g.bottomFlangeWidth;
  const tfBot = g.bottomFlangeThickness;
  const hw = h - tfTop - tfBot;

  if (hw <= 0) {
    throw new Error('Invalid Type III geometry: web height must be positive.');
  }

  const ATop = bfTop * tfTop;
  const AWeb = bw * hw;
  const ABot = bfBot * tfBot;
  const Ag = ATop + AWeb + ABot;

  const yTop = tfTop / 2;
  const yWeb = tfTop + hw / 2;
  const yBot = h - tfBot / 2;
  const yBar = (ATop * yTop + AWeb * yWeb + ABot * yBot) / Ag;

  const ITop = bfTop * Math.pow(tfTop, 3) / 12 + ATop * Math.pow(yBar - yTop, 2);
  const IWeb = bw * Math.pow(hw, 3) / 12 + AWeb * Math.pow(yBar - yWeb, 2);
  const IBot = bfBot * Math.pow(tfBot, 3) / 12 + ABot * Math.pow(yBar - yBot, 2);

  const Ig = ITop + IWeb + IBot;
  const St = Ig / yBar;
  const Sb = Ig / (h - yBar);

  return {
    ...g,
    hw,
    Ag,
    yBar,
    Ig,
    St,
    Sb,
    bw
  };
}

function computeEffectiveRebarArea(group, rebarLossPercent, structuralSteelLossPercent) {
  const areaPer = REBAR_AREAS[group.barSize] || 0;
  const area = areaPer * (group.count || 0);
  const rebarFactor = 1 - clampPercent(rebarLossPercent) / 100;
  const steelFactor = 1 - clampPercent(structuralSteelLossPercent) / 100;
  return area * rebarFactor * steelFactor;
}

function computeEffectivePrestress(input, deterioration) {
  const strandArea = STRAND_AREAS[input.prestress.strandType] || STRAND_AREAS['0.600'];
  const nStrands = input.prestress.nStrands || 0;
  const originalAps = strandArea * nStrands;

  const strandLoss = clampPercent(deterioration.loss_strand);
  const structuralSteelLoss = clampPercent(deterioration.loss_structural_steel || 0);
  const apsFactor = (1 - strandLoss / 100) * (1 - structuralSteelLoss / 100);
  const effectiveAps = originalAps * apsFactor;

  const jackingPsi = (input.prestress.jackingStressKsi || 0) * 1000;
  const longTermLoss = clampPercent(input.prestress.longTermLossPercent || 0);
  const stressReduction = clampPercent(deterioration.prestress_stress_reduction || 0);
  const fpe = jackingPsi * (1 - longTermLoss / 100) * (1 - stressReduction / 100);

  return {
    strandArea,
    nStrands,
    originalAps,
    effectiveAps,
    fpe
  };
}

function computeFps(fc, section, effectiveAps, rebarBottomArea, fyBottom, dp, dBottom, fpuPsi, fpePsi) {
  if (effectiveAps <= 0 || dp <= 0) {
    return { fps: 0, c: 0, a: 0, beta1: computeBeta1(fc) };
  }

  const beta1 = computeBeta1(fc);
  const b = section.topFlangeWidth;
  const fpsBase = Math.min(fpuPsi, fpePsi + 30000);
  let c = 4;

  for (let i = 0; i < 40; i++) {
    const fps = Math.max(fpePsi, Math.min(fpuPsi, fpsBase * (1 - 0.08 * (c / dp))));
    const tension = effectiveAps * fps + rebarBottomArea * fyBottom;
    const cNext = tension / (0.85 * fc * beta1 * b);
    if (!isFinite(cNext) || cNext <= 0) {
      c = 0.01;
      break;
    }
    if (Math.abs(cNext - c) < 1e-5) {
      c = cNext;
      break;
    }
    c = cNext;
  }

  const a = beta1 * c;
  const fps = Math.max(fpePsi, Math.min(fpuPsi, fpsBase * (1 - 0.08 * (c / dp))));
  const dt = Math.max(dp, dBottom || 0);
  const epsilonT = c > 0 ? 0.003 * (dt - c) / c : 0.01;

  let phi;
  if (epsilonT >= 0.005) phi = 1.0;
  else if (epsilonT <= 0.002) phi = 0.75;
  else phi = 0.75 + 0.25 * (epsilonT - 0.002) / 0.003;

  return { fps, c, a, beta1, phi, epsilonT };
}

function computeFlexuralCapacity(input, section, deterioration, effective) {
  const fc = input.materials.fcPsi;
  const fy = input.materials.fyPsi;

  const bottomGroup = input.reinforcement.bottomLongitudinal || { barSize: 0, count: 0, depth: 0 };
  const topGroup = input.reinforcement.topLongitudinal || { barSize: 0, count: 0, depth: 0 };

  const AsBottom = computeEffectiveRebarArea(bottomGroup, deterioration.loss_rebar, deterioration.loss_structural_steel || 0);
  const AsTop = computeEffectiveRebarArea(topGroup, deterioration.loss_rebar, deterioration.loss_structural_steel || 0);

  const dBottom = bottomGroup.depth || input.prestress.dp;
  const dTop = topGroup.depth || 0;

  const fpuPsi = (input.prestress.fpuKsi || 270) * 1000;

  const fps = computeFps(
    fc,
    section,
    effective.effectiveAps,
    AsBottom,
    fy,
    input.prestress.dp,
    dBottom,
    fpuPsi,
    effective.fpe
  );

  const yc = fps.a / 2;
  let MnLbIn = 0;
  MnLbIn += effective.effectiveAps * fps.fps * (input.prestress.dp - yc);
  MnLbIn += AsBottom * fy * (dBottom - yc);
  MnLbIn -= AsTop * fy * (dTop - yc);
  MnLbIn = Math.max(0, MnLbIn);

  const Mn = MnLbIn / 12000;
  const phiMn = fps.phi * Mn;

  return {
    Mn,
    phi: fps.phi,
    phiMn,
    fps,
    reinforcement: {
      AsBottom,
      AsTop,
      dBottom,
      dTop
    }
  };
}

function computeShearCapacity(input, section, deterioration) {
  const fc = input.materials.fcPsi;
  const fy = input.materials.fyPsi;

  const stirrups = input.reinforcement.stirrups || { barSize: 0, legs: 0, spacing: 12 };
  const areaPerBar = REBAR_AREAS[stirrups.barSize] || 0;
  const stirrupLossFactor = 1 - clampPercent(deterioration.loss_stirrup) / 100;
  const steelLossFactor = 1 - clampPercent(deterioration.loss_structural_steel || 0) / 100;
  const Av = areaPerBar * (stirrups.legs || 0) * stirrupLossFactor * steelLossFactor;

  const dv = Math.max(0.8 * input.prestress.dp, 0.72 * section.depth);
  let Vc = 2 * Math.sqrt(fc) * section.bw * dv / 1000;
  let Vs = (Av > 0 && (stirrups.spacing || 0) > 0)
    ? (Av * fy * dv / (stirrups.spacing * 1000))
    : 0;

  // Corrosion-driven cracking reduces concrete shear transfer and bar action.
  // Keep this independent of explicit stirrup-area loss so each deterioration
  // axis can be studied in one sensitivity run.
  const corrosionPenalty = Math.max(
    0.2,
    1
      - 0.004 * clampPercent(deterioration.loss_rebar || 0)
      - 0.003 * clampPercent(deterioration.loss_strand || 0)
      - 0.002 * clampPercent(deterioration.prestress_stress_reduction || 0)
  );
  Vc *= corrosionPenalty;
  Vs *= corrosionPenalty;

  const Vn = Math.max(0, Vc + Vs);
  const phi = 0.9;
  const phiVn = phi * Vn;

  return {
    Vn,
    phi,
    phiVn,
    Vc,
    Vs,
    Av,
    dv
  };
}

function computeDeadLoadDemand(input) {
  const L = input.spanFt;
  const dc = input.loads.dead.selfWeightKipPerFt
    + input.loads.dead.deckCompositeKipPerFt
    + input.loads.dead.superimposedKipPerFt;
  const dw = input.loads.dead.wearingSurfaceKipPerFt;

  return {
    dcW: dc,
    dwW: dw,
    dcMoment: dc * L * L / 8,
    dwMoment: dw * L * L / 8,
    dcShear: dc * L / 2,
    dwShear: dw * L / 2
  };
}

function buildPermitAxles(permit) {
  if (!permit || !Array.isArray(permit.axles) || permit.axles.length === 0) {
    return [
      { weight: 10, position: 0 },
      { weight: 32, position: 12 },
      { weight: 32, position: 24 },
      { weight: 20, position: 34 }
    ];
  }
  return permit.axles.map(a => ({ weight: a.weight, position: a.position }));
}

function getMaxPositive(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > m) m = arr[i];
  }
  return m;
}

function getMaxAbs(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.abs(arr[i]);
    if (v > m) m = v;
  }
  return m;
}

function computeVehicleLiveDemand(spanFt, axles, laneLoad, impactFactor, distributionFactor) {
  const truckEnv = truckEnvelopeSimple(spanFt, axles, ANALYSIS_POINTS, impactFactor);
  const truckMoment = getMaxPositive(truckEnv.maxMoments);
  const truckShear = getMaxAbs(truckEnv.maxShears);

  const laneW = laneLoad || 0;
  const laneMoment = laneW * spanFt * spanFt / 8;
  const laneShear = laneW * spanFt / 2;

  const totalMoment = (truckMoment + laneMoment) * distributionFactor;
  const totalShear = (truckShear + laneShear) * distributionFactor;

  return {
    truckMoment,
    truckShear,
    laneMoment,
    laneShear,
    totalMoment,
    totalShear
  };
}

function computeLiveLoadDemand(input) {
  const hlDef = TRUCKS[input.loads.live.designTruckCode || 'AASHTO'] || TRUCKS.AASHTO;
  const legalDef = TRUCKS[input.loads.live.legalTruckCode || 'NC_SNAGGRS4'] || hlDef;
  const permitAxles = buildPermitAxles(input.loads.live.permitTruck);

  const hlRearSpacing = input.loads.live.hl93RearSpacingFt || 14;
  const hlAxles = getTruckAxles(hlDef, hlRearSpacing);
  const tandemAxles = getTandemAxles(hlDef);

  const designTruck = computeVehicleLiveDemand(
    input.spanFt,
    hlAxles,
    input.loads.live.laneLoadKipPerFt,
    input.loads.live.impact,
    input.loads.live.distributionFactor
  );

  const designTandem = tandemAxles
    ? computeVehicleLiveDemand(
      input.spanFt,
      tandemAxles,
      input.loads.live.laneLoadKipPerFt,
      input.loads.live.impact,
      input.loads.live.distributionFactor
    )
    : { totalMoment: -Infinity, totalShear: -Infinity };

  const design = {
    totalMoment: Math.max(designTruck.totalMoment, designTandem.totalMoment),
    totalShear: Math.max(designTruck.totalShear, designTandem.totalShear),
    mode: designTruck.totalMoment >= designTandem.totalMoment ? 'truck+lane' : 'tandem+lane',
    truck: designTruck,
    tandem: designTandem
  };

  const legalAxles = getTruckAxles(legalDef, input.loads.live.legalRearSpacingFt);
  const legal = computeVehicleLiveDemand(
    input.spanFt,
    legalAxles,
    legalDef.laneLoad || 0,
    input.loads.live.impact,
    input.loads.live.distributionFactor
  );

  const permit = computeVehicleLiveDemand(
    input.spanFt,
    permitAxles,
    input.loads.live.permitLaneLoadKipPerFt || 0,
    input.loads.live.impact,
    input.loads.live.distributionFactor
  );

  return { design, legal, permit, hlDef, legalDef, permitAxles };
}

function rateOne(phiMn, phiVn, dead, live, factors) {
  const C_m = factors.resistanceFlexure * phiMn;
  const C_v = factors.resistanceShear * phiVn;

  const D_m = factors.dc * dead.dcMoment + factors.dw * dead.dwMoment;
  const D_v = factors.dc * dead.dcShear + factors.dw * dead.dwShear;

  const L_m = factors.live * live.totalMoment;
  const L_v = factors.live * live.totalShear;

  const rfMoment = L_m > 0 ? (C_m - D_m) / L_m : Infinity;
  const rfShear = L_v > 0 ? (C_v - D_v) / L_v : Infinity;
  const rf = Math.min(rfMoment, rfShear);

  return {
    rfMoment,
    rfShear,
    rf,
    governs: rfMoment <= rfShear ? 'flexure' : 'shear',
    pass: rf >= 1
  };
}

function computeLRFR(phiMn, phiVn, dead, live) {
  return {
    design_inventory: rateOne(phiMn, phiVn, dead, live.design, {
      resistanceFlexure: 1.0, resistanceShear: 1.0, dc: 1.25, dw: 1.50, live: 1.75
    }),
    design_operating: rateOne(phiMn, phiVn, dead, live.design, {
      resistanceFlexure: 1.0, resistanceShear: 1.0, dc: 1.25, dw: 1.50, live: 1.35
    }),
    legal: rateOne(phiMn, phiVn, dead, live.legal, {
      resistanceFlexure: 1.0, resistanceShear: 1.0, dc: 1.25, dw: 1.50, live: 1.35
    }),
    permit: rateOne(phiMn, phiVn, dead, live.permit, {
      resistanceFlexure: 1.0, resistanceShear: 1.0, dc: 1.25, dw: 1.50, live: 1.20
    })
  };
}

function computeLFR(Mn, Vn, dead, live) {
  return {
    inventory: rateOne(Mn, Vn, dead, live.design, {
      resistanceFlexure: 0.9, resistanceShear: 0.85, dc: 1.3, dw: 1.3, live: 2.17
    }),
    operating: rateOne(Mn, Vn, dead, live.design, {
      resistanceFlexure: 1.0, resistanceShear: 0.95, dc: 1.3, dw: 1.3, live: 1.67
    }),
    legal: rateOne(Mn, Vn, dead, live.legal, {
      resistanceFlexure: 1.0, resistanceShear: 0.95, dc: 1.3, dw: 1.3, live: 1.50
    }),
    permit: rateOne(Mn, Vn, dead, live.permit, {
      resistanceFlexure: 1.05, resistanceShear: 1.0, dc: 1.3, dw: 1.3, live: 1.35
    })
  };
}

function computeASR(section, dead, live, effective, flexure, shear, input) {
  const fsAllowPrestress = (input.materials.fpuKsi * 1000 || 270000) * 0.60;
  const fsAllowRebar = input.materials.fyPsi * 0.60;
  const fvAllow = 0.11 * Math.sqrt(input.materials.fcPsi) * 1000;

  const Zb = section.Sb;
  const Ze = section.St;
  const prestressMoment = (effective.effectiveAps * effective.fpe * (input.prestress.dp - section.yBar)) / 12000;

  function asrCase(liveDemand) {
    const M_allow_tension = Math.max(0, ((fsAllowRebar * Zb) / 12000) + prestressMoment - dead.dcMoment - dead.dwMoment);
    const M_allow_compression = Math.max(0, ((fsAllowPrestress * Ze) / 12000) - dead.dcMoment - dead.dwMoment);
    const V_allow = Math.max(0, (fvAllow * shear.Av * shear.dv / ((input.reinforcement.stirrups.spacing || 12) * 1000)) + shear.Vc - dead.dcShear - dead.dwShear);

    const rfMoment = liveDemand.totalMoment > 0
      ? Math.min(M_allow_tension, M_allow_compression) / liveDemand.totalMoment
      : Infinity;
    const rfShear = liveDemand.totalShear > 0 ? V_allow / liveDemand.totalShear : Infinity;
    const rf = Math.min(rfMoment, rfShear);

    return {
      rfMoment,
      rfShear,
      rf,
      governs: rfMoment <= rfShear ? 'flexure' : 'shear',
      pass: rf >= 1
    };
  }

  return {
    design: asrCase(live.design),
    legal: asrCase(live.legal),
    permit: asrCase(live.permit)
  };
}

function computeScenario(input, deterioration) {
  const section = computeTypeIIISectionProperties(input.geometry);
  const dead = computeDeadLoadDemand(input);
  const live = computeLiveLoadDemand(input);
  const effectivePrestress = computeEffectivePrestress(input, deterioration);
  const flexure = computeFlexuralCapacity(input, section, deterioration, effectivePrestress);
  const shear = computeShearCapacity(input, section, deterioration);

  return {
    deterioration,
    section,
    dead,
    live,
    effectivePrestress,
    flexure,
    shear,
    lrfr: computeLRFR(flexure.phiMn, shear.phiVn, dead, live),
    lfr: computeLFR(flexure.Mn, shear.Vn, dead, live),
    asr: computeASR(section, dead, live, effectivePrestress, flexure, shear, input)
  };
}

function getGoverningRF(resultSet) {
  let min = { rf: Infinity, method: '', case: '', governs: '' };

  const tables = [
    ['LRFR', resultSet.lrfr],
    ['LFR', resultSet.lfr],
    ['ASR', resultSet.asr]
  ];

  for (let i = 0; i < tables.length; i++) {
    const method = tables[i][0];
    const rows = tables[i][1];
    const keys = Object.keys(rows);
    for (let k = 0; k < keys.length; k++) {
      const c = keys[k];
      const item = rows[c];
      if (item.rf < min.rf) {
        min = { rf: item.rf, method: method, case: c, governs: item.governs };
      }
    }
  }

  return min;
}

function runTypeIIIRating(input) {
  const deterioration = {
    loss_rebar: clampPercent(input.deterioration.loss_rebar),
    loss_stirrup: clampPercent(input.deterioration.loss_stirrup),
    loss_strand: clampPercent(input.deterioration.loss_strand),
    loss_structural_steel: clampPercent(input.deterioration.loss_structural_steel || 0),
    prestress_stress_reduction: clampPercent(input.deterioration.prestress_stress_reduction || 0)
  };

  const baselineScenario = computeScenario(input, {
    loss_rebar: 0,
    loss_stirrup: 0,
    loss_strand: 0,
    loss_structural_steel: 0,
    prestress_stress_reduction: 0
  });

  const deterioratedScenario = computeScenario(input, deterioration);

  const baselineGov = getGoverningRF(baselineScenario);
  const deterioratedGov = getGoverningRF(deterioratedScenario);

  return {
    schemaVersion: '1.0.0',
    input,
    baseline: baselineScenario,
    deteriorated: deterioratedScenario,
    sensitivity: {
      governingBaselineRF: baselineGov,
      governingDeterioratedRF: deterioratedGov,
      deltaRF: deterioratedGov.rf - baselineGov.rf
    }
  };
}

function createDefaultTypeIIIInput() {
  return {
    spanFt: 90,
    geometry: { ...TYPE_III_PRESET },
    materials: {
      fcPsi: 8000,
      fyPsi: 60000,
      fpuKsi: 270
    },
    prestress: {
      strandType: '0.600',
      nStrands: 34,
      jackingStressKsi: 202,
      longTermLossPercent: 22,
      dp: 40,
      fpuKsi: 270
    },
    reinforcement: {
      topLongitudinal: { barSize: 6, count: 4, depth: 4 },
      bottomLongitudinal: { barSize: 8, count: 8, depth: 41.5 },
      stirrups: { barSize: 4, legs: 2, spacing: 12 }
    },
    loads: {
      dead: {
        selfWeightKipPerFt: 0.70,
        deckCompositeKipPerFt: 0.55,
        wearingSurfaceKipPerFt: 0.12,
        superimposedKipPerFt: 0.08
      },
      live: {
        designTruckCode: 'AASHTO',
        hl93RearSpacingFt: 14,
        legalTruckCode: 'NC_SNAGGRS4',
        legalRearSpacingFt: null,
        permitTruck: {
          axles: [
            { weight: 12, position: 0 },
            { weight: 24, position: 10 },
            { weight: 24, position: 18 },
            { weight: 24, position: 30 },
            { weight: 24, position: 38 }
          ]
        },
        laneLoadKipPerFt: 0.64,
        permitLaneLoadKipPerFt: 0.2,
        impact: 0.33,
        distributionFactor: 0.62
      }
    },
    deterioration: {
      loss_rebar: 0,
      loss_stirrup: 0,
      loss_strand: 0,
      loss_structural_steel: 0,
      prestress_stress_reduction: 0
    }
  };
}
