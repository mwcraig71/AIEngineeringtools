/**
 * Prestressed Cored Slab Load Rating Engine
 *
 * Computes load rating factors per AASHTO MBE for:
 *   - LRFR (Load and Resistance Factor Rating)
 *   - LFR  (Load Factor Rating)
 *   - ASR  (Allowable Stress Rating)
 *
 * Handles prestressing strand deterioration via percent section loss.
 * Supports optional mild steel reinforcement.
 */

// ============================================================
// Strand database -- area per strand (in^2)
// ============================================================

const STRAND_AREAS = {
  '0.375': 0.085,
  '0.500': 0.153,
  '0.500S': 0.167,
  '0.600': 0.217,
  '0.620': 0.231,
  '0.700': 0.294
};

const STRAND_LABELS = {
  '0.375': '3/8" dia (0.085 in\u00B2)',
  '0.500': '1/2" dia (0.153 in\u00B2)',
  '0.500S': '1/2" dia special (0.167 in\u00B2)',
  '0.600': '0.6" dia (0.217 in\u00B2)',
  '0.620': '0.62" dia (0.231 in\u00B2)',
  '0.700': '0.7" dia (0.294 in\u00B2)'
};

// Rebar areas for optional mild steel and stirrups
const REBAR_AREAS = {
  3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60,
  8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56, 14: 2.25, 18: 4.00
};

function ensureSimpleSpanModel(analysisModel, engineName) {
  const model = analysisModel || 'simple-span';
  if (model !== 'simple-span') {
    throw new Error(`${engineName} currently supports simple-span analysis only. Set analysisModel to "simple-span" for this app.`);
  }
}

function validateUnitConsistency(params) {
  if (params.fc > 0 && params.fc < 500) {
    throw new Error('f\'c appears to be entered in ksi. Enter concrete strength in psi (e.g., 5000).');
  }
  if (params.fpu > 0 && params.fpu < 10000) {
    throw new Error('fpu appears to be entered in ksi. Enter fpu in psi (e.g., 270000).');
  }
  if (params.fpe > 0 && params.fpe < 10000) {
    throw new Error('fpe appears to be entered in ksi. Enter effective prestress in psi (e.g., 150000).');
  }
  if ((params.mildFy || 0) > 0 && params.mildFy < 1000) {
    throw new Error('Mild steel fy appears to be entered in ksi. Enter mild steel fy in psi.');
  }
  if ((params.stirrupFy || 0) > 0 && params.stirrupFy < 1000) {
    throw new Error('Stirrup fy appears to be entered in ksi. Enter stirrup fy in psi.');
  }
  if (params.impactFactor !== undefined && params.impactFactor > 1) {
    throw new Error('Impact factor must be a decimal (e.g., 0.33), not a percent.');
  }
  if ((params.dcW || 0) > 20 || (params.dwW || 0) > 20 || (params.laneLoad || 0) > 20) {
    throw new Error('Distributed loads look too large for kip/ft inputs. Check unit conversion for dcW/dwW/laneLoad.');
  }
}

function computeWeightedDp(rows, apsKey) {
  let apsSum = 0;
  let momentSum = 0;
  for (const row of rows) {
    const aps = row[apsKey] || 0;
    apsSum += aps;
    momentSum += aps * row.depth;
  }
  return apsSum > 0 ? (momentSum / apsSum) : 0;
}

function computeStrandLayoutProperties({
  strandType, nStrands, dp, strandLayout, strandLoss, spanFt, h
}) {
  const apsPerStrand = STRAND_AREAS[strandType] || 0.153;
  const lossFactor = 1 - (strandLoss || 0) / 100;
  const spanIn = Math.max((spanFt || 0) * 12, 0);
  const xMoment = spanIn / 2;
  const xShear = Math.max(h || 0, 12);

  const normalizedRows = (Array.isArray(strandLayout) && strandLayout.length > 0)
    ? strandLayout.map((row, idx) => ({
      row: idx + 1,
      count: Math.max(0, row.count || 0),
      depth: Math.max(0, row.depth || 0),
      debondLengthFt: Math.max(0, row.debondLengthFt || 0)
    }))
    : [{
      row: 1,
      count: Math.max(0, nStrands || 0),
      depth: Math.max(0, dp || 0),
      debondLengthFt: 0
    }];

  for (const row of normalizedRows) {
    const debondIn = row.debondLengthFt * 12;
    row.originalAps = row.count * apsPerStrand;
    row.effectiveAps = row.originalAps * lossFactor;
    row.momentActive = debondIn < xMoment;
    row.shearActive = debondIn < xShear;
    row.effectiveApsMoment = row.momentActive ? row.effectiveAps : 0;
    row.effectiveApsShear = row.shearActive ? row.effectiveAps : 0;
  }

  const originalAps = normalizedRows.reduce((s, r) => s + r.originalAps, 0);
  const effectiveAps = normalizedRows.reduce((s, r) => s + r.effectiveAps, 0);
  const effectiveApsMoment = normalizedRows.reduce((s, r) => s + r.effectiveApsMoment, 0);
  const effectiveApsShear = normalizedRows.reduce((s, r) => s + r.effectiveApsShear, 0);
  const dpAll = computeWeightedDp(normalizedRows, 'effectiveAps');
  const dpMoment = effectiveApsMoment > 0 ? computeWeightedDp(normalizedRows, 'effectiveApsMoment') : dpAll;
  const dpShear = effectiveApsShear > 0 ? computeWeightedDp(normalizedRows, 'effectiveApsShear') : dpAll;

  return {
    apsPerStrand,
    nStrands: normalizedRows.reduce((s, r) => s + r.count, 0),
    originalAps,
    effectiveAps,
    effectiveApsMoment: effectiveApsMoment > 0 ? effectiveApsMoment : effectiveAps,
    effectiveApsShear: effectiveApsShear > 0 ? effectiveApsShear : effectiveAps,
    dp: dpAll > 0 ? dpAll : (dp || 0),
    dpMoment: dpMoment > 0 ? dpMoment : (dp || 0),
    dpShear: dpShear > 0 ? dpShear : (dp || 0),
    layout: normalizedRows
  };
}

// ============================================================
// Section property computation -- cored slab
// ============================================================

/**
 * Compute gross section properties for a cored slab.
 * Voids are assumed centered at mid-height of the slab.
 *
 * @param {number} b - total slab width (in)
 * @param {number} h - total slab depth (in)
 * @param {number} nVoids - number of circular voids
 * @param {number} dVoid - void diameter (in)
 * @returns section properties
 */
function computeCoredSlabSection(b, h, nVoids, dVoid) {
  const rVoid = dVoid / 2;

  // Solid rectangle
  const A_solid = b * h;
  const I_solid = b * h * h * h / 12;

  // Void areas and inertias (voids at mid-height)
  const A_void_each = Math.PI * rVoid * rVoid;
  const I_void_each = Math.PI * rVoid * rVoid * rVoid * rVoid / 4;
  // Voids centered at h/2, centroid also at h/2, so no parallel axis offset

  const A_void_total = nVoids * A_void_each;
  const I_void_total = nVoids * I_void_each;

  const Ag = A_solid - A_void_total;
  const Ig = I_solid - I_void_total;

  // Centroid at mid-height (symmetric section)
  const yt = h / 2;
  const yb = h / 2;

  // Section moduli
  const St = Ig / yt;
  const Sb = Ig / yb;

  // Effective web width for shear (total width minus void diameters)
  const bw = b - nVoids * dVoid;

  return { Ag, yt, yb, Ig, St, Sb, bw, A_void_total, I_void_total };
}

// ============================================================
// Prestressing steel stress at ultimate (fps)
// AASHTO LRFD 5.6.3.1.1 -- bonded tendons
// ============================================================

/**
 * Compute stress in prestressing steel at nominal flexural resistance.
 *
 * fps = fpu * (1 - k * c / dp)
 * where k = 2 * (1.04 - fpy/fpu)
 *
 * For low-relaxation strands: fpy/fpu = 0.90, k = 0.28
 * For stress-relieved strands: fpy/fpu = 0.85, k = 0.38
 *
 * c is found iteratively from force equilibrium:
 *   0.85 * f'c * beta1 * b * c = Aps * fpu * (1 - k*c/dp) + As*fy
 *   Solve for c.
 */
function computeFps(fpu, fpyRatio, fc, b, h, Aps, dp, As, fy, d, nVoids, dVoid) {
  const beta1 = computeBeta1(fc);
  const k = 2 * (1.04 - fpyRatio);

  if (Aps <= 0 || dp <= 0) {
    return { fps: 0, a: 0, c: 0, beta1, k, isVoidInCompression: false };
  }

  // Iterative solution for c
  // From equilibrium: 0.85*f'c*beta1*b_eff*c = Aps*fpu*(1 - k*c/dp) + As*fy
  // where b_eff depends on whether the stress block extends into the void zone

  // First try assuming compression block is above voids (rectangular behavior)
  // The top of the voids is at h/2 - dVoid/2
  const voidTop = h / 2 - dVoid / 2;

  // Solve quadratic: 0.85*f'c*beta1*b*c + Aps*fpu*k*c/dp = Aps*fpu + As*fy
  // (0.85*f'c*beta1*b + Aps*fpu*k/dp) * c = Aps*fpu + As*fy
  const AsTotal = As || 0;
  const fySteel = fy || 0;

  const coeff = 0.85 * fc * beta1 * b + Aps * fpu * k / dp;
  let c = (Aps * fpu + AsTotal * fySteel) / coeff;
  let a = c * beta1;

  // Check if stress block extends into voids
  let isVoidInCompression = false;
  if (a > voidTop && nVoids > 0 && dVoid > 0) {
    // Stress block extends into void zone -- need to reduce effective width
    // Use iterative approach with reduced width in the void zone
    isVoidInCompression = true;

    // Iterate: the effective compression force is reduced by the void area
    // within the stress block depth
    for (let iter = 0; iter < 20; iter++) {
      a = c * beta1;
      let compressionForce;

      if (a <= voidTop) {
        // Above voids -- full width
        compressionForce = 0.85 * fc * b * a;
      } else {
        // Part above voids (full width) + part through voids (reduced width)
        const a_above = voidTop;
        const a_in_void = Math.min(a - voidTop, dVoid);
        const bw = b - nVoids * dVoid;
        compressionForce = 0.85 * fc * (b * a_above + bw * a_in_void);

        // If stress block goes below voids
        if (a > voidTop + dVoid) {
          const a_below = a - voidTop - dVoid;
          compressionForce += 0.85 * fc * b * a_below;
        }
      }

      const fps_trial = fpu * (1 - k * c / dp);
      const tensionForce = Aps * fps_trial + AsTotal * fySteel;
      const diff = tensionForce - compressionForce;

      if (Math.abs(diff) < 0.01) break;

      // Adjust c
      c += diff / (0.85 * fc * beta1 * b + Aps * fpu * k / dp) * 0.5;
      if (c < 0.01) { c = 0.01; break; }
    }
    a = c * beta1;
  }

  const fps = Math.max(0, fpu * (1 - k * c / dp));

  return { fps, a, c, beta1, k, isVoidInCompression };
}

function computeBeta1(fc) {
  if (fc <= 4000) return 0.85;
  if (fc >= 8000) return 0.65;
  return 0.85 - 0.05 * (fc - 4000) / 1000;
}

// ============================================================
// Flexural capacity (Mn) -- prestressed cored slab
// ============================================================

/**
 * Compute nominal moment capacity Mn for a prestressed cored slab.
 *
 * @param {number} fc - concrete compressive strength (psi)
 * @param {number} b - slab width (in)
 * @param {number} h - slab depth (in)
 * @param {number} Aps - total effective prestressing steel area (in^2)
 * @param {number} fps - stress in prestressing steel at ultimate (psi)
 * @param {number} dp - depth to prestressing steel centroid (in)
 * @param {number} As - mild steel area (in^2)
 * @param {number} fy - mild steel yield strength (psi)
 * @param {number} d - depth to mild steel centroid (in)
 * @param {number} a - stress block depth (in)
 * @param {number} c - neutral axis depth (in)
 * @param {number} nVoids - number of voids
 * @param {number} dVoid - void diameter (in)
 * @returns {{ Mn, phi, epsilonT }}
 */
function computeMn(fc, b, h, Aps, fps, dp, As, fy, d, a, c, nVoids, dVoid) {
  if ((Aps <= 0 || dp <= 0) && (As <= 0 || d <= 0)) {
    return { Mn: 0, phi: 1.00, epsilonT: Infinity };
  }

  const voidTop = h / 2 - dVoid / 2;

  let Mn;
  if (a <= voidTop || nVoids === 0 || dVoid === 0) {
    // Rectangular behavior -- compression block above voids
    Mn = Aps * fps * (dp - a / 2) + (As || 0) * (fy || 0) * ((d || dp) - a / 2);
  } else {
    // Compression extends into voids -- compute moment about top fiber
    // using the actual compression block shape
    const a_above = voidTop;
    const a_in_void = Math.min(a - voidTop, dVoid);
    const bw = b - nVoids * dVoid;

    // Compression force components and their centroids from top
    const C1 = 0.85 * fc * b * a_above; // above voids
    const y1 = a_above / 2;
    const C2 = 0.85 * fc * bw * a_in_void; // through voids
    const y2 = a_above + a_in_void / 2;

    let C3 = 0, y3 = 0;
    if (a > voidTop + dVoid) {
      const a_below = a - voidTop - dVoid;
      C3 = 0.85 * fc * b * a_below;
      y3 = voidTop + dVoid + a_below / 2;
    }

    const Ctotal = C1 + C2 + C3;
    const yc = Ctotal > 0 ? (C1 * y1 + C2 * y2 + C3 * y3) / Ctotal : a / 2;

    Mn = Aps * fps * (dp - yc) + (As || 0) * (fy || 0) * ((d || dp) - yc);
  }

  // Net tensile strain for phi factor
  // eps_t = 0.003 * (dt - c) / c where dt is depth of extreme tension steel
  const dt = Math.max(dp, d || 0);
  const epsilonT = c > 0 ? 0.003 * (dt - c) / c : Infinity;

  // Phi per AASHTO LRFD 5.5.4.2 for prestressed members
  let phi;
  if (epsilonT >= 0.005) {
    phi = 1.00; // tension-controlled (prestressed)
  } else if (epsilonT <= 0.002) {
    phi = 0.75; // compression-controlled
  } else {
    phi = 0.75 + 0.25 * (epsilonT - 0.002) / 0.003; // transition (prestressed)
  }

  // Convert to kip-ft
  const MnKipFt = Mn / 12000;

  return { Mn: MnKipFt, phi, epsilonT };
}

// ============================================================
// Shear capacity (Vn) -- simplified per AASHTO LRFD 5.7.3.3
// ============================================================

/**
 * Compute nominal shear capacity Vn for prestressed cored slab.
 * bw = effective web width (total width minus void diameters)
 */
function computeVn(fc, bw, dp, h, Av, s, fy, a) {
  // Effective shear depth
  const dMinusA2 = (a !== undefined && a > 0) ? (dp - a / 2) : 0;
  const dv = Math.max(dMinusA2, 0.9 * dp, 0.72 * h);

  // Vc = 2 * sqrt(f'c) * bw * dv (lbs) -- simplified
  const Vc = 2 * Math.sqrt(fc) * bw * dv;

  // Vs = Av * fy * dv / s
  const Vs = (s > 0 && Av > 0) ? (Av * fy * dv / s) : 0;

  // Upper limit: Vn <= 0.25*f'c*bw*dv
  const VnMax = 0.25 * fc * bw * dv;
  const VsEff = Math.min(Vs, Math.max(VnMax - Vc, 0));

  const Vn = (Vc + VsEff) / 1000; // kips
  const phi = 0.90;

  return { Vn, Vc: Vc / 1000, Vs: VsEff / 1000, phi, dv };
}

// ============================================================
// Live load demand -- uses bridge-live-load engine
// ============================================================

function computeLiveLoadDemand(spanFt, truckDef, impactFactor, laneLoadW, distFactor) {
  const nPts = ANALYSIS_POINTS;

  // Truck envelope (with variable spacing)
  let truckEnv;
  if (truckDef.variableSpacing) {
    const { min: sMin, max: sMax } = truckDef.variableSpacing;
    let first = true;
    for (let sp = sMin; sp <= sMax; sp += 2) {
      const axles = getTruckAxles(truckDef, sp);
      const env = truckEnvelopeSimple(spanFt, axles, nPts, impactFactor);
      if (first) {
        truckEnv = env;
        first = false;
      } else {
        for (let i = 0; i < env.maxMoments.length; i++) {
          if (env.maxMoments[i] > truckEnv.maxMoments[i]) truckEnv.maxMoments[i] = env.maxMoments[i];
          if (env.maxShears[i] > truckEnv.maxShears[i]) truckEnv.maxShears[i] = env.maxShears[i];
        }
      }
    }
  } else {
    const axles = getTruckAxles(truckDef);
    truckEnv = truckEnvelopeSimple(spanFt, axles, nPts, impactFactor);
  }

  // Tandem envelope
  let tandemEnv = null;
  const tandemAxles = getTandemAxles(truckDef);
  if (tandemAxles) {
    tandemEnv = truckEnvelopeSimple(spanFt, tandemAxles, nPts, impactFactor);
  }

  // Lane load (no impact, uniform)
  const laneResult = simpleBeamUniformMomentShear(spanFt, laneLoadW, nPts);

  const truckMaxM = Math.max(...truckEnv.maxMoments);
  const truckMaxV = Math.max(...truckEnv.maxShears);

  let tandemMaxM = 0, tandemMaxV = 0;
  if (tandemEnv) {
    tandemMaxM = Math.max(...tandemEnv.maxMoments);
    tandemMaxV = Math.max(...tandemEnv.maxShears);
  }

  const laneMaxM = Math.max(...laneResult.moments);
  const laneMaxV = Math.max(...laneResult.shears);

  const truckPlusLaneM = truckMaxM + laneMaxM;
  const tandemPlusLaneM = tandemMaxM + laneMaxM;
  const truckPlusLaneV = truckMaxV + laneMaxV;
  const tandemPlusLaneV = tandemMaxV + laneMaxV;

  const maxMoment = Math.max(truckPlusLaneM, tandemPlusLaneM) * distFactor;
  const maxShear = Math.max(truckPlusLaneV, tandemPlusLaneV) * distFactor;

  // Unfactored truck for LFR/ASR
  let truckEnvNoIM;
  if (truckDef.variableSpacing) {
    const { min: sMin, max: sMax } = truckDef.variableSpacing;
    let first = true;
    for (let sp = sMin; sp <= sMax; sp += 2) {
      const axles = getTruckAxles(truckDef, sp);
      const env = truckEnvelopeSimple(spanFt, axles, nPts, 0);
      if (first) {
        truckEnvNoIM = env;
        first = false;
      } else {
        for (let i = 0; i < env.maxMoments.length; i++) {
          if (env.maxMoments[i] > truckEnvNoIM.maxMoments[i]) truckEnvNoIM.maxMoments[i] = env.maxMoments[i];
          if (env.maxShears[i] > truckEnvNoIM.maxShears[i]) truckEnvNoIM.maxShears[i] = env.maxShears[i];
        }
      }
    }
  } else {
    const axles = getTruckAxles(truckDef);
    truckEnvNoIM = truckEnvelopeSimple(spanFt, axles, nPts, 0);
  }

  const truckMaxMNoIM = Math.max(...truckEnvNoIM.maxMoments);
  const truckMaxVNoIM = Math.max(...truckEnvNoIM.maxShears);

  let tandemMaxMNoIM = 0, tandemMaxVNoIM = 0;
  if (tandemAxles) {
    const tandemEnvNoIM = truckEnvelopeSimple(spanFt, tandemAxles, nPts, 0);
    tandemMaxMNoIM = Math.max(...tandemEnvNoIM.maxMoments);
    tandemMaxVNoIM = Math.max(...tandemEnvNoIM.maxShears);
  }

  const lfrTruckM = Math.max(truckMaxMNoIM, tandemMaxMNoIM) * distFactor;
  const lfrTruckV = Math.max(truckMaxVNoIM, tandemMaxVNoIM) * distFactor;

  return {
    maxMoment, maxShear,
    truckMoment: truckMaxM * distFactor,
    tandemMoment: tandemMaxM * distFactor,
    laneMoment: laneMaxM * distFactor,
    truckShear: truckMaxV * distFactor,
    tandemShear: tandemMaxV * distFactor,
    laneShear: laneMaxV * distFactor,
    lfrTruckM, lfrTruckV
  };
}

// ============================================================
// Dead load demand
// ============================================================

function computeDeadLoadDemand(spanFt, dcW, dwW) {
  const dcMoment = dcW * spanFt * spanFt / 8;
  const dcShear = dcW * spanFt / 2;
  const dwMoment = dwW * spanFt * spanFt / 8;
  const dwShear = dwW * spanFt / 2;
  return { dcMoment, dcShear, dwMoment, dwShear };
}

// ============================================================
// LRFR Rating -- per AASHTO MBE 6A.4.2
// ============================================================

const LRFR_FACTORS = {
  design_inventory: { label: 'Design - Inventory', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.75 },
  design_operating: { label: 'Design - Operating', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.35 },
  legal:            { label: 'Legal Load',         gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.80 },
  permit_routine:   { label: 'Permit - Routine',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.30 },
  permit_special:   { label: 'Permit - Special',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.15 }
};

function computeLRFR(capacity, deadLoads, liveLoads, phiC, phiS, legalGammaLL) {
  const results = {};

  for (const [key, factors] of Object.entries(LRFR_FACTORS)) {
    const { gammaDC, gammaDW } = factors;
    const gammaLL = (key === 'legal' && legalGammaLL !== undefined) ? legalGammaLL : factors.gammaLL;

    const Rn_m = phiC * phiS * capacity.phiMn;
    const numerM = Rn_m - gammaDC * deadLoads.dcMoment - gammaDW * deadLoads.dwMoment;
    const denomM = gammaLL * liveLoads.maxMoment;
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    const Rn_v = phiC * phiS * capacity.phiVn;
    const numerV = Rn_v - gammaDC * deadLoads.dcShear - gammaDW * deadLoads.dwShear;
    const denomV = gammaLL * liveLoads.maxShear;
    const rfShear = denomV > 0 ? numerV / denomV : Infinity;

    const rf = Math.min(rfMoment, rfShear);
    const governs = rfMoment <= rfShear ? 'Moment' : 'Shear';

    const rfRounded = Math.round(rf * 1000) / 1000;
    results[key] = {
      label: factors.label,
      rfMoment: Math.round(rfMoment * 1000) / 1000,
      rfShear: Math.round(rfShear * 1000) / 1000,
      rf: rfRounded,
      governs,
      pass: rfRounded >= 1.0
    };
  }

  return results;
}

// ============================================================
// LFR Rating -- per AASHTO Standard Specifications
// ============================================================

function computeLFR(Mn, Vn, deadLoads, liveLoads, impactFactor, spanFt, truckDef) {
  const A1 = 1.3;
  const PHI_MOMENT_LFR = 1.00; // prestressed members
  const PHI_SHEAR_LFR = 0.90;

  const lfrImpact = (spanFt > 0)
    ? Math.min(50 / (spanFt + 125), 0.30)
    : impactFactor;

  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, a) => s + a.weight, 0) / 2
    : 36;

  const levels = {
    inventory: { label: 'Inventory', A2: 2.17 },
    operating: { label: 'Operating', A2: 1.30 }
  };

  const D_moment = deadLoads.dcMoment + deadLoads.dwMoment;
  const D_shear = deadLoads.dcShear + deadLoads.dwShear;

  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    const { A2 } = level;

    const C_m = PHI_MOMENT_LFR * Mn;
    const numerM = C_m - A1 * D_moment;
    const denomM = A2 * liveLoads.lfrTruckM * (1 + lfrImpact);
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    const C_v = PHI_SHEAR_LFR * Vn;
    const numerV = C_v - A1 * D_shear;
    const denomV = A2 * liveLoads.lfrTruckV * (1 + lfrImpact);
    const rfShear = denomV > 0 ? numerV / denomV : Infinity;

    const rf = Math.min(rfMoment, rfShear);
    const governs = rfMoment <= rfShear ? 'Moment' : 'Shear';
    const tons = rf * truckWeightTons;

    const rfRounded = Math.round(rf * 1000) / 1000;
    results[key] = {
      label: level.label,
      rfMoment: Math.round(rfMoment * 1000) / 1000,
      rfShear: Math.round(rfShear * 1000) / 1000,
      rf: rfRounded,
      tons: Math.round(tons * 10) / 10,
      governs,
      pass: rfRounded >= 1.0
    };
  }

  return results;
}

// ============================================================
// ASR Rating -- Allowable Stress Rating (prestressed)
// ============================================================

/**
 * For prestressed concrete, ASR uses allowable concrete stresses:
 *   Inventory: Fb (compression) = 0.40 * f'c, Ft (tension) = 6 * sqrt(f'c)
 *   Operating: Fb (compression) = 0.60 * f'c, Ft (tension) = 6 * sqrt(f'c)
 *
 * The controlling condition for prestressed members is typically the
 * concrete stress check (compression at top, tension at bottom under service loads).
 *
 * Capacity = fpe * e / Sb + allowable tension - dead load stress contribution
 */
function computeASR(sectionProps, fc, bw, dv, deadLoads, liveLoads, impactFactor, spanFt, truckDef,
                    Aps, fpe, dp, Av, s, fy) {
  const levels = {
    inventory: {
      label: 'Inventory',
      Fb_c: 0.40 * fc,       // allowable compression
      Ft: 6 * Math.sqrt(fc), // allowable tension (psi)
      Fv: 0.95 * Math.sqrt(fc),
      Fs: fy ? 0.55 * fy : 0
    },
    operating: {
      label: 'Operating',
      Fb_c: 0.60 * fc,
      Ft: 6 * Math.sqrt(fc),
      Fv: 1.2 * Math.sqrt(fc),
      Fs: fy ? 0.75 * fy : 0
    }
  };

  const D_moment = deadLoads.dcMoment + deadLoads.dwMoment;
  const D_shear = deadLoads.dcShear + deadLoads.dwShear;
  const L_moment = liveLoads.lfrTruckM;
  const L_shear = liveLoads.lfrTruckV;

  const asrImpact = (spanFt > 0)
    ? Math.min(50 / (spanFt + 125), 0.30)
    : impactFactor;

  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, ax) => s + ax.weight, 0) / 2
    : 36;

  // Prestress effect at bottom fiber (tension side)
  const e = dp - sectionProps.yt; // eccentricity (positive below centroid)
  const P = Aps * fpe; // effective prestress force (lbs)

  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    // Moment capacity based on bottom fiber stress:
    // Under service: fb = -P/A - P*e/Sb + M_total/Sb
    // fb must be <= Ft (tension positive convention: compression negative)
    // Actually using standard convention: compression positive
    // f_bottom = P/A + P*e*yb/I - M/Sb
    // For allowable: f_bottom >= -Ft (tension limit)
    // P/A + P*e/Sb - M/Sb >= -Ft
    // M/Sb <= P/A + P*e/Sb + Ft
    // M_allow = Sb * (P/Ag + P*e/Sb + Ft) / 12000 (in kip-ft)

    // Moment capacity from bottom tension control:
    const f_prestress_bottom = P / sectionProps.Ag + P * e * sectionProps.yb / sectionProps.Ig;
    const Ma_tension = sectionProps.Sb * (f_prestress_bottom + level.Ft) / 12000;

    // Moment capacity from top compression control:
    // f_top = P/A - P*e*yt/I + M/St <= Fb_c
    const f_prestress_top = P / sectionProps.Ag - P * e * sectionProps.yt / sectionProps.Ig;
    const Ma_compression = sectionProps.St * (level.Fb_c - f_prestress_top) / 12000;

    const Ma = Math.min(Ma_tension, Ma_compression);

    // Shear capacity
    const Vc = level.Fv * bw * dv / 1000;
    const Vs = (Av > 0 && s > 0 && level.Fs > 0) ? level.Fs * Av * dv / (s * 1000) : 0;
    const Va = Vc + Vs;

    const denomM = L_moment * (1 + asrImpact);
    const denomV = L_shear * (1 + asrImpact);

    const rfMoment = denomM > 0 ? (Ma - D_moment) / denomM : Infinity;
    const rfShear = denomV > 0 ? (Va - D_shear) / denomV : Infinity;
    const rf = Math.min(rfMoment, rfShear);
    const governs = rfMoment <= rfShear ? 'Moment' : 'Shear';
    const tons = rf * truckWeightTons;

    const rfRounded = Math.round(rf * 1000) / 1000;
    results[key] = {
      label: level.label,
      Ma: Math.round(Ma * 10) / 10,
      Va: Math.round(Va * 10) / 10,
      rfMoment: Math.round(rfMoment * 1000) / 1000,
      rfShear: Math.round(rfShear * 1000) / 1000,
      rf: rfRounded,
      tons: Math.round(tons * 10) / 10,
      governs,
      pass: rfRounded >= 1.0
    };
  }

  return results;
}

// ============================================================
// Master rating function
// ============================================================

function runLoadRating(params) {
  const {
    spanFt, b, h, nVoids, dVoid, fc,
    strandType, nStrands, dp, strandLayout, fpu, fpyRatio, fpe, strandLoss,
    mildAs, mildFy, mildLoss, mildD,
    stirrupSize, stirrupLegs, stirrupSpacing, stirrupLoss, stirrupFy,
    dcW, dwW, truckDef, impactFactor, laneLoad, distFactor,
    phiC, phiS, methods, legalGammaLL, analysisModel
  } = params;

  ensureSimpleSpanModel(analysisModel, 'cored-slab-rating');
  validateUnitConsistency({ fc, fpu, fpe, mildFy, stirrupFy, impactFactor, dcW, dwW, laneLoad });

  // 1. Section properties
  const section = computeCoredSlabSection(b, h, nVoids, dVoid);

  // 2. Effective prestressing steel
  const strandInfo = computeStrandLayoutProperties({
    strandType,
    nStrands,
    dp,
    strandLayout,
    strandLoss,
    spanFt,
    h
  });

  // 3. Stress in prestressing steel at ultimate
  const effectiveMildAs = (mildAs || 0) * (1 - (mildLoss || 0) / 100);
  const fpsResult = computeFps(fpu, fpyRatio, fc, b, h, strandInfo.effectiveApsMoment, strandInfo.dpMoment,
    effectiveMildAs || 0, mildFy || 0, mildD || strandInfo.dpMoment, nVoids, dVoid);

  // 4. Flexural capacity
  const moment = computeMn(fc, b, h, strandInfo.effectiveApsMoment, fpsResult.fps, strandInfo.dpMoment,
    effectiveMildAs || 0, mildFy || 0, mildD || strandInfo.dpMoment,
    fpsResult.a, fpsResult.c, nVoids, dVoid);
  const phiMn = moment.phi * moment.Mn;

  // 5. Shear capacity
  const avPerBar = REBAR_AREAS[stirrupSize] || 0;
  const Av = avPerBar * stirrupLegs * (1 - stirrupLoss / 100);
  const shear = computeVn(fc, section.bw, strandInfo.dpShear, h, Av, stirrupSpacing, stirrupFy || 60000, fpsResult.a);
  const phiVn = shear.phi * shear.Vn;

  // 6. Dead load demand
  const deadLoads = computeDeadLoadDemand(spanFt, dcW, dwW);

  // 7. Live load demand
  const liveLoads = computeLiveLoadDemand(spanFt, truckDef, impactFactor, laneLoad, distFactor);

  // 8. Rating calculations
  const capacity = { phiMn, phiVn };

  const result = {
    section,
    strandInfo: { ...strandInfo, strandType, strandLoss, fpu, fpe, fps: fpsResult.fps },
    fpsResult,
    moment,
    phiMn,
    shear,
    phiVn,
    deadLoads,
    liveLoads,
    capacity,
    mildSteel: (mildAs && mildAs > 0)
      ? { originalAs: mildAs, As: effectiveMildAs, lossPercent: (mildLoss || 0), fy: mildFy, d: mildD }
      : null
  };

  if (methods.lrfr) {
    result.lrfr = computeLRFR(capacity, deadLoads, liveLoads, phiC, phiS, legalGammaLL);
  }
  if (methods.lfr) {
    result.lfr = computeLFR(moment.Mn, shear.Vn, deadLoads, liveLoads, impactFactor, spanFt, truckDef);
  }
  if (methods.asr) {
    result.asr = computeASR(section, fc, section.bw, shear.dv, deadLoads, liveLoads, impactFactor,
      spanFt, truckDef, strandInfo.effectiveApsMoment, fpe, strandInfo.dpMoment, Av, stirrupSpacing, stirrupFy || 60000);
  }

  return result;
}
