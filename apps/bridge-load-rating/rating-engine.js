/**
 * RC Tee Beam Load Rating Engine
 *
 * Computes load rating factors per AASHTO MBE for:
 *   - LRFR (Load and Resistance Factor Rating)
 *   - LFR  (Load Factor Rating)
 *   - ASR  (Allowable Stress Rating)
 *
 * Supports rebar deterioration via percent section loss.
 */

// ============================================================
// Rebar database — area per bar (in^2)
// ============================================================

const REBAR_AREAS = {
  3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60,
  8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56, 14: 2.25, 18: 4.00
};

const REBAR_DIAMETERS = {
  3: 0.375, 4: 0.500, 5: 0.625, 6: 0.750, 7: 0.875,
  8: 1.000, 9: 1.128, 10: 1.270, 11: 1.410, 14: 1.693, 18: 2.257
};

// ============================================================
// Section property computation
// ============================================================

/**
 * Compute gross section properties for a tee beam.
 * All dimensions in inches, areas in in^2, moments of inertia in in^4.
 */
function computeGrossSection(bf, hf, bw, h) {
  // Flange area
  const Af = bf * hf;
  const yf = hf / 2; // centroid of flange from top

  // Web area (below flange)
  const hw = h - hf;
  const Aw = bw * hw;
  const yw = hf + hw / 2; // centroid of web from top

  const Ag = Af + Aw;
  const yt = (Af * yf + Aw * yw) / Ag; // neutral axis from top
  const yb = h - yt;

  // Moment of inertia about centroidal axis
  const Ig = (bf * hf * hf * hf / 12) + Af * (yt - yf) * (yt - yf) +
             (bw * hw * hw * hw / 12) + Aw * (yt - yw) * (yt - yw);

  // Section moduli
  const St = Ig / yt; // top fiber
  const Sb = Ig / yb; // bottom fiber

  return { Ag, yt, yb, Ig, St, Sb, Af, Aw, hw };
}

/**
 * Compute effective rebar areas after deterioration.
 * Each layer: { barSize, count, depth, lossPercent }
 * Returns array with added `effectiveAs` field.
 */
function computeEffectiveRebar(layers) {
  return layers.map(layer => {
    const areaPerBar = REBAR_AREAS[layer.barSize] || 0;
    const originalAs = areaPerBar * layer.count;
    const effectiveAs = originalAs * (1 - layer.lossPercent / 100);
    return { ...layer, areaPerBar, originalAs, effectiveAs };
  });
}

/**
 * Compute total effective steel area and centroid depth from top.
 */
function computeRebarTotals(effectiveLayers) {
  let totalAs = 0;
  let sumAsd = 0;
  for (const layer of effectiveLayers) {
    totalAs += layer.effectiveAs;
    sumAsd += layer.effectiveAs * layer.depth;
  }
  const d = totalAs > 0 ? sumAsd / totalAs : 0;
  return { totalAs, d };
}

// ============================================================
// Flexural capacity (Mn) — Whitney stress block
// ============================================================

/**
 * Compute nominal moment capacity Mn for an RC tee beam.
 * Uses Whitney rectangular stress block per ACI 318 / AASHTO.
 *
 * @param {number} fc - concrete compressive strength (psi)
 * @param {number} fy - rebar yield strength (psi)
 * @param {number} bf - flange width (in)
 * @param {number} hf - flange thickness (in)
 * @param {number} bw - web width (in)
 * @param {number} As - total effective steel area (in^2)
 * @param {number} d  - effective depth to steel centroid (in)
 * @returns {{ Mn, a, c, beta1, isFlange, phi }}
 */
function computeMn(fc, fy, bf, hf, bw, As, d) {
  const beta1 = computeBeta1(fc);

  // Guard: zero steel area or zero effective depth → zero capacity
  if (As <= 0 || d <= 0) {
    return { Mn: 0, a: 0, c: 0, beta1, isFlange: false, phi: 0.90, epsilonT: Infinity };
  }

  // Assume rectangular behavior first (a <= hf, compression in flange only)
  let a = (As * fy) / (0.85 * fc * bf);

  let Mn, isFlange;
  if (a <= hf) {
    // Rectangular beam behavior
    Mn = As * fy * (d - a / 2);
    isFlange = false;
  } else {
    // True T-beam: compression extends into web
    // Flange contribution: Asf = 0.85 * f'c * (bf - bw) * hf / fy
    const Asf = 0.85 * fc * (bf - bw) * hf / fy;
    const Asw = As - Asf;
    a = (Asw * fy) / (0.85 * fc * bw);
    Mn = Asf * fy * (d - hf / 2) + Asw * fy * (d - a / 2);
    isFlange = true;
  }

  const c = a / beta1;
  const epsilonT = 0.003 * (d - c) / c;

  // Phi factor per AASHTO 5.5.4.2
  let phi;
  if (epsilonT >= 0.005) {
    phi = 0.90; // tension-controlled
  } else if (epsilonT <= 0.002) {
    phi = 0.75; // compression-controlled
  } else {
    phi = 0.75 + 0.15 * (epsilonT - 0.002) / 0.003; // transition
  }

  // Convert to kip-ft
  const MnKipFt = Mn / 12000; // psi*in^2*in -> kip*in / 1000 -> kip-ft / 12

  return { Mn: MnKipFt, a, c, beta1, isFlange, phi, epsilonT };
}

function computeBeta1(fc) {
  if (fc <= 4000) return 0.85;
  if (fc >= 8000) return 0.65;
  return 0.85 - 0.05 * (fc - 4000) / 1000;
}

// ============================================================
// Shear capacity (Vn) — Simplified method per AASHTO 5.7.3.3
// ============================================================

/**
 * Compute nominal shear capacity Vn.
 *
 * @param {number} fc  - f'c (psi)
 * @param {number} bw  - web width (in)
 * @param {number} d   - effective depth (in)
 * @param {number} h   - total section depth (in)
 * @param {number} Av  - effective stirrup area per spacing (in^2)
 * @param {number} s   - stirrup spacing (in)
 * @param {number} fy  - stirrup yield strength (psi)
 * @returns {{ Vn, Vc, Vs, phi, dv }}
 */
function computeVn(fc, bw, d, h, Av, s, fy, a) {
  // Effective shear depth per AASHTO LRFD 5.7.2.8: dv = max(d-a/2, 0.9d, 0.72h)
  const dMinusA2 = (a !== undefined && a > 0) ? (d - a / 2) : 0;
  const dv = Math.max(dMinusA2, 0.9 * d, 0.72 * h);

  // Vc = 2 * sqrt(f'c) * bw * dv  (simplified per AASHTO LRFD 5.7.3.3, in lbs)
  const Vc = 2 * Math.sqrt(fc) * bw * dv;

  // Vs = Av * fy * dv / s  (assuming theta=45 deg per simplified procedure)
  const Vs = (s > 0 && Av > 0) ? (Av * fy * dv / s) : 0;

  // Upper limit per AASHTO LRFD 5.7.3.3: Vn <= 0.25*f'c*bv*dv
  // So Vs <= 0.25*f'c*bv*dv - Vc
  const VnMax = 0.25 * fc * bw * dv; // lbs
  const VsEff = Math.min(Vs, Math.max(VnMax - Vc, 0));

  const Vn = (Vc + VsEff) / 1000; // convert to kips
  const phi = 0.90; // shear phi per AASHTO LRFD 5.5.4.2

  return { Vn, Vc: Vc / 1000, Vs: VsEff / 1000, phi, dv };
}

// ============================================================
// Live load demand — uses bridge-live-load engine
// ============================================================

/**
 * Get maximum live load moment and shear for a simple span.
 * Uses the analysis engine from bridge-live-load app.
 *
 * @param {number} spanFt - span length in feet
 * @param {object} truckDef - truck definition from TRUCKS
 * @param {number} impactFactor - IM (e.g. 0.33)
 * @param {number} laneLoadW - lane load (kip/ft)
 * @param {number} distFactor - distribution factor
 * @returns {{ maxMoment, maxShear, truckMoment, truckShear, tandemMoment, tandemShear, laneMoment, laneShear }}
 */
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

  // Max truck moment & shear
  const truckMaxM = Math.max(...truckEnv.maxMoments);
  const truckMaxV = Math.max(...truckEnv.maxShears);

  // Max tandem moment & shear
  let tandemMaxM = 0, tandemMaxV = 0;
  if (tandemEnv) {
    tandemMaxM = Math.max(...tandemEnv.maxMoments);
    tandemMaxV = Math.max(...tandemEnv.maxShears);
  }

  // Max lane moment & shear
  const laneMaxM = Math.max(...laneResult.moments);
  const laneMaxV = Math.max(...laneResult.shears);

  // HL-93: max of (truck + lane) or (tandem + lane)
  const truckPlusLaneM = truckMaxM + laneMaxM;
  const tandemPlusLaneM = tandemMaxM + laneMaxM;
  const truckPlusLaneV = truckMaxV + laneMaxV;
  const tandemPlusLaneV = tandemMaxV + laneMaxV;

  const maxMoment = Math.max(truckPlusLaneM, tandemPlusLaneM) * distFactor;
  const maxShear = Math.max(truckPlusLaneV, tandemPlusLaneV) * distFactor;

  // Unfactored (no IM) truck moment for LFR/ASR — recompute without impact
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

  // For LFR/ASR: L = max of truck or tandem (without lane, with IM applied via (1+I) separately)
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

/**
 * Compute dead load moments and shears for a simple span.
 * Returns max moment at midspan and max shear at support.
 */
function computeDeadLoadDemand(spanFt, dcW, dwW) {
  // Simple span: M_max = wL^2/8, V_max = wL/2
  const dcMoment = dcW * spanFt * spanFt / 8;
  const dcShear = dcW * spanFt / 2;
  const dwMoment = dwW * spanFt * spanFt / 8;
  const dwShear = dwW * spanFt / 2;

  return { dcMoment, dcShear, dwMoment, dwShear };
}

// ============================================================
// LRFR Rating — per AASHTO MBE 6A.4.2
// ============================================================

/**
 * Load factors per MBE Table 6A.4.2.2-1.
 */
const LRFR_FACTORS = {
  design_inventory: { label: 'Design - Inventory', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.75 },
  design_operating: { label: 'Design - Operating', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.35 },
  legal:            { label: 'Legal Load',         gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.80 },
  permit_routine:   { label: 'Permit - Routine',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.30 },
  permit_special:   { label: 'Permit - Special',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.15 }
};

/**
 * Compute LRFR rating factors for moment and shear.
 *
 * RF = (phi_c * phi_s * phi * Rn - gamma_DC * DC - gamma_DW * DW) / (gamma_LL * (LL+IM))
 */
function computeLRFR(capacity, deadLoads, liveLoads, phiC, phiS, legalGammaLL) {
  const results = {};

  for (const [key, factors] of Object.entries(LRFR_FACTORS)) {
    const { gammaDC, gammaDW } = factors;
    // Allow override of legal load gamma_LL (varies by ADTT per MBE Table 6A.4.5.4.2a-1)
    const gammaLL = (key === 'legal' && legalGammaLL !== undefined) ? legalGammaLL : factors.gammaLL;

    // Moment rating
    const Rn_m = phiC * phiS * capacity.phiMn;
    const numerM = Rn_m - gammaDC * deadLoads.dcMoment - gammaDW * deadLoads.dwMoment;
    const denomM = gammaLL * liveLoads.maxMoment;
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    // Shear rating
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
// LFR Rating — per AASHTO Standard Specifications
// ============================================================

/**
 * RF = (C - A1 * D) / (A2 * L * (1 + I))
 *
 * Inventory: A1 = 1.3, A2 = 2.17
 * Operating: A1 = 1.3, A2 = 1.30
 *
 * C = phi * Mn (or phi * Vn)
 * D = dead load effect (unfactored)
 * L = live load effect (unfactored, without impact)
 * I = impact factor
 */
function computeLFR(Mn, Vn, deadLoads, liveLoads, impactFactor, spanFt, truckDef) {
  const A1 = 1.3;
  const PHI_MOMENT_LFR = 0.90; // AASHTO Standard Specifications
  const PHI_SHEAR_LFR = 0.85;  // AASHTO Standard Specifications

  // Auto-compute impact factor per AASHTO Standard Specs: I = 50/(L+125), max 0.30
  const lfrImpact = (spanFt !== undefined && spanFt > 0)
    ? Math.min(50 / (spanFt + 125), 0.30)
    : impactFactor;

  // Truck weight from axle definitions (for ton rating)
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

    // Moment: C = phi_LFR * Mn (fixed phi per AASHTO Standard Specs, not LRFD variable phi)
    const C_m = PHI_MOMENT_LFR * Mn;
    const numerM = C_m - A1 * D_moment;
    const denomM = A2 * liveLoads.lfrTruckM * (1 + lfrImpact);
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    // Shear: C = phi_LFR * Vn (phi=0.85 per Standard Specs, not 0.90 per LRFD)
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
// ASR Rating — Allowable Stress Rating
// ============================================================

/**
 * RF = (C - D) / (L * (1 + I))
 *
 * C = allowable stress capacity:
 *   Moment: Ma = Fb * St (allowable bending stress times section modulus)
 *   Shear:  Va = Fv * bw * dv (allowable shear stress)
 *
 * Per AASHTO Manual for Condition Evaluation:
 *   Inventory allowable stresses:
 *     Concrete bending: Fb = 0.40 * f'c
 *     Concrete shear:   Fv = 0.95 * sqrt(f'c)
 *   Operating allowable stresses:
 *     Concrete bending: Fb = 0.60 * f'c
 *     Concrete shear:   Fv = 1.2 * sqrt(f'c)
 */
function computeASR(sectionProps, fc, fy, bw, dv, deadLoads, liveLoads, impactFactor, As, d, a, spanFt, truckDef, Av, s) {
  const levels = {
    inventory: {
      label: 'Inventory',
      Fb_c: 0.40 * fc,
      Fv: 0.95 * Math.sqrt(fc),
      Fs: 0.55 * fy
    },
    operating: {
      label: 'Operating',
      Fb_c: 0.60 * fc,
      Fv: 1.2 * Math.sqrt(fc),
      Fs: 0.75 * fy
    }
  };

  const D_moment = deadLoads.dcMoment + deadLoads.dwMoment;
  const D_shear = deadLoads.dcShear + deadLoads.dwShear;
  const L_moment = liveLoads.lfrTruckM;
  const L_shear = liveLoads.lfrTruckV;

  // Lever arm for steel tension capacity
  const jd = (As > 0 && d > 0 && a !== undefined) ? (d - a / 2) : 0;

  // Auto-compute impact factor per AASHTO Standard Specs: I = 50/(L+125), max 0.30
  const asrImpact = (spanFt !== undefined && spanFt > 0)
    ? Math.min(50 / (spanFt + 125), 0.30)
    : impactFactor;

  // Truck weight from axle definitions (for ton rating)
  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, ax) => s + ax.weight, 0) / 2
    : 36;

  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    // Moment capacity: concrete-controlled Ma = Fb * St / 12000 (kip-ft)
    const Ma_concrete = level.Fb_c * sectionProps.St / 12000;

    // Moment capacity: steel tension-controlled Ma_s = Fs * As * jd / 12000 (kip-ft)
    const Ma_steel = (As > 0 && jd > 0) ? level.Fs * As * jd / 12000 : Infinity;

    // Governing moment capacity is the lesser
    const Ma = Math.min(Ma_concrete, Ma_steel);

    // Shear capacity: concrete Vc = Fv * bw * dv (kips)
    const Vc = level.Fv * bw * dv / 1000;

    // Shear capacity: stirrup contribution Vs = Av * Fs * dv / s (kips)
    // Uses same allowable steel stress as flexure per AASHTO Standard Specifications
    const Vs = (Av > 0 && s > 0) ? level.Fs * Av * dv / (s * 1000) : 0;

    // Total allowable shear capacity
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

/**
 * Run complete load rating analysis.
 *
 * @param {object} params
 * @param {number} params.spanFt
 * @param {number} params.bf, params.hf, params.bw, params.h
 * @param {number} params.fc, params.fy
 * @param {Array}  params.rebarLayers - [{ barSize, count, depth, lossPercent }]
 * @param {number} params.stirrupSize, params.stirrupLegs, params.stirrupSpacing, params.stirrupLoss
 * @param {number} params.dcW, params.dwW
 * @param {object} params.truckDef
 * @param {number} params.impactFactor, params.laneLoad, params.distFactor
 * @param {number} params.phiC, params.phiS
 * @param {object} params.methods - { lrfr: bool, lfr: bool, asr: bool }
 */
function runLoadRating(params) {
  const {
    spanFt, bf, hf, bw, h, fc, fy,
    rebarLayers, stirrupSize, stirrupLegs, stirrupSpacing, stirrupLoss,
    dcW, dwW, truckDef, impactFactor, laneLoad, distFactor,
    phiC, phiS, methods, legalGammaLL
  } = params;

  // 1. Section properties
  const section = computeGrossSection(bf, hf, bw, h);

  // 2. Effective rebar
  const effectiveRebar = computeEffectiveRebar(rebarLayers);
  const { totalAs, d } = computeRebarTotals(effectiveRebar);

  // 3. Flexural capacity
  const moment = computeMn(fc, fy, bf, hf, bw, totalAs, d);
  const phiMn = moment.phi * moment.Mn;

  // 4. Shear capacity
  const avPerBar = REBAR_AREAS[stirrupSize] || 0;
  const Av = avPerBar * stirrupLegs * (1 - stirrupLoss / 100);
  const shear = computeVn(fc, bw, d, h, Av, stirrupSpacing, fy, moment.a);
  const phiVn = shear.phi * shear.Vn;

  // 5. Dead load demand
  const deadLoads = computeDeadLoadDemand(spanFt, dcW, dwW);

  // 6. Live load demand
  const liveLoads = computeLiveLoadDemand(spanFt, truckDef, impactFactor, laneLoad, distFactor);

  // 7. Rating calculations
  const capacity = { phiMn, phiVn };

  const result = {
    section,
    effectiveRebar,
    totalAs,
    d,
    moment,
    phiMn,
    shear,
    phiVn,
    deadLoads,
    liveLoads,
    capacity
  };

  if (methods.lrfr) {
    result.lrfr = computeLRFR(capacity, deadLoads, liveLoads, phiC, phiS, legalGammaLL);
  }
  if (methods.lfr) {
    result.lfr = computeLFR(moment.Mn, shear.Vn, deadLoads, liveLoads, impactFactor, spanFt, truckDef);
  }
  if (methods.asr) {
    result.asr = computeASR(section, fc, fy, bw, shear.dv, deadLoads, liveLoads, impactFactor, totalAs, d, moment.a, spanFt, truckDef, Av, stirrupSpacing);
  }

  return result;
}
