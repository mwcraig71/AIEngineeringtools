/**
 * Non-Composite Steel Girder Load Rating Engine
 *
 * Computes load rating factors per AASHTO MBE for:
 *   - LRFR (Load and Resistance Factor Rating)
 *   - LFR  (Load Factor Rating)
 *   - ASR  (Allowable Stress Rating)
 *
 * Supports rolled W-shapes and plate girder sections.
 * Allows section loss (remaining section) at user-defined locations.
 *
 * References:
 *   AASHTO LRFD Bridge Design Specifications, Chapter 6
 *   AASHTO Manual for Bridge Evaluation (MBE), Chapter 6
 */

const E_STEEL = 29000; // ksi (modulus of elasticity)

function ensureSimpleSpanModel(analysisModel, engineName) {
  const model = analysisModel || 'simple-span';
  if (model !== 'simple-span') {
    throw new Error(`${engineName} currently supports simple-span analysis only. Set analysisModel to "simple-span" for this app.`);
  }
}

function validateUnitConsistency(params) {
  if ((params.Fy || 0) > 200) {
    throw new Error('Fy appears to be entered in psi. Enter steel yield strength in ksi (e.g., 50).');
  }
  if ((params.impactFactor || 0) > 1) {
    throw new Error('Impact factor must be a decimal (e.g., 0.33), not a percent.');
  }
  if ((params.dcW || 0) > 20 || (params.dwW || 0) > 20 || (params.laneLoad || 0) > 20) {
    throw new Error('Distributed loads look too large for kip/ft inputs. Check unit conversion for dcW/dwW/laneLoad.');
  }
}

// ============================================================
// Section property computation for I-shaped steel sections
// ============================================================

/**
 * Compute section properties for a doubly-symmetric or singly-symmetric I-section.
 *
 * @param {number} D   - web depth (clear distance between flanges) (in)
 * @param {number} tw  - web thickness (in)
 * @param {number} bfc - compression (top) flange width (in)
 * @param {number} tfc - compression (top) flange thickness (in)
 * @param {number} bft - tension (bottom) flange width (in)
 * @param {number} tft - tension (bottom) flange thickness (in)
 * @returns section properties object
 */
function computeSteelSectionProps(D, tw, bfc, tfc, bft, tft) {
  // Total depth
  const d = tfc + D + tft;

  // Component areas
  const Afc = bfc * tfc;  // compression flange
  const Aw  = D * tw;     // web
  const Aft = bft * tft;  // tension flange
  const A   = Afc + Aw + Aft;

  // Centroids from top of section
  const yfc = tfc / 2;
  const yw  = tfc + D / 2;
  const yft = tfc + D + tft / 2;

  // Neutral axis from top
  const ybar = (Afc * yfc + Aw * yw + Aft * yft) / A;

  // Moment of inertia about centroidal axis (parallel axis theorem)
  const Ifc = bfc * tfc * tfc * tfc / 12 + Afc * (ybar - yfc) * (ybar - yfc);
  const Iw  = tw * D * D * D / 12 + Aw * (ybar - yw) * (ybar - yw);
  const Ift = bft * tft * tft * tft / 12 + Aft * (ybar - yft) * (ybar - yft);
  const Ix  = Ifc + Iw + Ift;

  // Section moduli
  const ytop = ybar;              // distance from NA to top fiber
  const ybot = d - ybar;          // distance from NA to bottom fiber
  const Sxt = Ix / ytop;          // top fiber section modulus
  const Sxb = Ix / ybot;          // bottom fiber section modulus
  const Sxc = Sxt;                // compression flange (top for simple span)
  const Sxt_tens = Sxb;           // tension flange (bottom for simple span)

  // Depth of web in compression (from top of web to NA)
  const Dc = ybar - tfc;
  // For plastic section: compute plastic neutral axis and Zx
  const { Zx, Yp } = computePlasticProps(D, tw, bfc, tfc, bft, tft);

  // My = Fy * Smin (yield moment uses the smaller section modulus)
  // Mp = Fy * Zx (plastic moment)

  // Weak-axis I (for LTB calculations)
  const Iyc = tfc * bfc * bfc * bfc / 12;
  const Iyt = tft * bft * bft * bft / 12;
  const Iy  = Iyc + Iyt + D * tw * tw * tw / 12;

  // ry for LTB — use compression flange only approximation
  // rt = bfc / sqrt(12 * (1 + (Dc*tw)/(3*bfc*tfc)))  per AASHTO 6.10.8.2.3
  const rt = bfc / Math.sqrt(12 * (1 + (Dc * tw) / (3 * bfc * tfc)));

  // J (St. Venant torsional constant) for I-section
  const J = (bfc * tfc * tfc * tfc + D * tw * tw * tw + bft * tft * tft * tft) / 3;

  return {
    d, D, tw, bfc, tfc, bft, tft,
    A, Afc, Aw, Aft,
    ybar, ytop, ybot,
    Ix, Sxt, Sxb, Sxc, Sxt_tens,
    Dc, Zx, Yp,
    Iy, Iyc, Iyt, rt,
    J
  };
}

/**
 * Compute plastic section modulus Zx and plastic neutral axis depth Yp.
 */
function computePlasticProps(D, tw, bfc, tfc, bft, tft) {
  const Afc = bfc * tfc;
  const Aw  = D * tw;
  const Aft = bft * tft;
  const totalA = Afc + Aw + Aft;
  const halfA = totalA / 2;

  // Find plastic NA: area above PNA = area below PNA
  let Yp;
  if (Afc >= halfA) {
    // PNA is in compression flange
    Yp = halfA / bfc;
  } else if (Afc + Aw >= halfA) {
    // PNA is in web
    Yp = tfc + (halfA - Afc) / tw;
  } else {
    // PNA is in tension flange
    Yp = tfc + D + (halfA - Afc - Aw) / bft;
  }

  // Zx = sum of first moments of areas about PNA
  // Top flange
  let Zx = 0;
  if (Yp <= tfc) {
    // PNA in top flange
    const aAbove = bfc * Yp;
    const aBelow_f = bfc * (tfc - Yp);
    Zx = aAbove * (Yp / 2) + aBelow_f * ((tfc - Yp) / 2) +
         Aw * (tfc + D / 2 - Yp) + Aft * (tfc + D + tft / 2 - Yp);
  } else if (Yp <= tfc + D) {
    // PNA in web
    const dw_above = Yp - tfc;
    const dw_below = D - dw_above;
    Zx = Afc * (Yp - tfc / 2) +
         tw * dw_above * dw_above / 2 +
         tw * dw_below * dw_below / 2 +
         Aft * (tfc + D + tft / 2 - Yp);
  } else {
    // PNA in bottom flange
    const df_above = Yp - tfc - D;
    const df_below = tft - df_above;
    Zx = Afc * (Yp - tfc / 2) +
         Aw * (Yp - tfc - D / 2) +
         bft * df_above * df_above / 2 +
         bft * df_below * df_below / 2;
  }

  return { Zx, Yp };
}

/**
 * Apply section loss to base section properties.
 * Returns modified section properties with reduced dimensions.
 *
 * @param {object} baseProps - base section (rolled or plate girder)
 * @param {object} loss - { twRemaining, tfcRemaining, tftRemaining, bfcRemaining, bftRemaining }
 *   Any undefined values use original dimensions.
 */
function applySectionLoss(baseProps, loss) {
  const tw  = loss.twRemaining  !== undefined ? loss.twRemaining  : baseProps.tw;
  const tfc = loss.tfcRemaining !== undefined ? loss.tfcRemaining : baseProps.tfc;
  const tft = loss.tftRemaining !== undefined ? loss.tftRemaining : baseProps.tft;
  const bfc = loss.bfcRemaining !== undefined ? loss.bfcRemaining : baseProps.bfc;
  const bft = loss.bftRemaining !== undefined ? loss.bftRemaining : baseProps.bft;

  // Web depth stays the same (clear distance between flanges)
  const D = baseProps.D;

  return computeSteelSectionProps(D, tw, bfc, tfc, bft, tft);
}

// ============================================================
// Convert rolled W-shape to generic I-section parameters
// ============================================================

/**
 * Convert W-shape database entry to section parameters.
 * W-shapes are doubly symmetric: top and bottom flanges are identical.
 * D (web depth) = d - 2*tf
 */
function wShapeToSectionParams(ws) {
  const D = ws.d - 2 * ws.tf;
  return {
    D: D,
    tw: ws.tw,
    bfc: ws.bf,
    tfc: ws.tf,
    bft: ws.bf,
    tft: ws.tf
  };
}

// ============================================================
// Flexural capacity — AASHTO LRFD 6.10 (Non-composite)
// ============================================================

/**
 * Compute nominal flexural resistance Mn for a non-composite steel I-section.
 * Per AASHTO LRFD 6.10.8 (for compact/noncompact/slender webs).
 *
 * @param {object} section - section properties from computeSteelSectionProps
 * @param {number} Fy   - yield strength (ksi)
 * @param {number} Lb   - unbraced length (ft)
 * @param {number} Cb   - moment gradient modifier (default 1.0)
 * @returns {{ Mn, Mp, My, Mnf, Mnw, governs, phi, Lp, Lr, webClass, flangeClass }}
 */
function computeSteelMn(section, Fy, Lb, Cb) {
  if (Cb === undefined) Cb = 1.0;
  const LbIn = Lb * 12; // convert to inches

  const { D, tw, bfc, tfc, bft, tft, Sxc, Sxt_tens, Zx, Dc, rt, J, Ix } = section;

  // Plastic moment
  const Mp = Fy * Zx; // kip-in

  // Yield moment (smaller section modulus governs)
  const Smin = Math.min(Sxc, Sxt_tens);
  const My = Fy * Smin; // kip-in

  // Web slenderness classification per AASHTO 6.10.6.2.3
  const lambdaW = 2 * Dc / tw;
  const lambdaPw = 3.76 * Math.sqrt(E_STEEL / Fy); // compact web limit
  const lambdaRw = 5.70 * Math.sqrt(E_STEEL / Fy); // noncompact web limit

  let webClass;
  if (lambdaW <= lambdaPw) {
    webClass = 'compact';
  } else if (lambdaW <= lambdaRw) {
    webClass = 'noncompact';
  } else {
    webClass = 'slender';
  }

  // Compression flange slenderness per AASHTO 6.10.8.2.2
  const lambdaF = bfc / (2 * tfc);
  const lambdaPf = 0.38 * Math.sqrt(E_STEEL / Fy); // compact flange limit
  const lambdaRf = 0.56 * Math.sqrt(E_STEEL / (0.7 * Fy)); // noncompact flange limit

  let flangeClass;
  if (lambdaF <= lambdaPf) {
    flangeClass = 'compact';
  } else if (lambdaF <= lambdaRf) {
    flangeClass = 'noncompact';
  } else {
    flangeClass = 'slender';
  }

  // Lateral-torsional buckling (LTB) — AASHTO 6.10.8.2.3
  const Lp = 1.0 * rt * Math.sqrt(E_STEEL / Fy); // in
  const Lr = Math.PI * rt * Math.sqrt(E_STEEL / (0.7 * Fy)); // in

  let Mnltb; // LTB nominal moment
  if (LbIn <= Lp) {
    // No LTB
    Mnltb = Infinity;
  } else if (LbIn <= Lr) {
    // Inelastic LTB
    Mnltb = Cb * (My - (My - 0.7 * Fy * Sxc) * (LbIn - Lp) / (Lr - Lp));
    Mnltb = Math.min(Mnltb, My);
  } else {
    // Elastic LTB
    const Fcr = Cb * Math.PI * Math.PI * E_STEEL / ((LbIn / rt) * (LbIn / rt));
    Mnltb = Fcr * Sxc;
    Mnltb = Math.min(Mnltb, My);
  }

  // Flange local buckling (FLB) — AASHTO 6.10.8.2.2
  let Mnflb;
  if (flangeClass === 'compact') {
    Mnflb = Infinity; // no reduction
  } else if (flangeClass === 'noncompact') {
    Mnflb = My - (My - 0.7 * Fy * Sxc) * (lambdaF - lambdaPf) / (lambdaRf - lambdaPf);
  } else {
    // Slender flange
    const kc = Math.min(Math.max(4 / Math.sqrt(2 * Dc / tw), 0.35), 0.76);
    const Fcr = 0.9 * E_STEEL * kc / (lambdaF * lambdaF);
    Mnflb = Fcr * Sxc;
  }

  // Web bend-buckling for slender web
  let Mnweb;
  if (webClass === 'slender') {
    const k = 9.0 * ((D / Dc) * (D / Dc)); // minimum k = 7.2 for doubly symmetric
    const Fcrw = 0.9 * E_STEEL * k / (lambdaW * lambdaW / 4);
    const Rb = Math.min(Fcrw / Fy, 1.0); // bend-buckling reduction
    Mnweb = Rb * My;
  } else {
    Mnweb = Infinity;
  }

  // Determine Mn based on web classification
  let Mn, governs;

  if (webClass === 'compact' && flangeClass === 'compact') {
    // Compact section: Mn can reach Mp
    if (LbIn <= Lp) {
      Mn = Mp;
      governs = 'Plastic moment (Mp)';
    } else if (LbIn <= Lr) {
      Mn = Cb * (Mp - (Mp - 0.7 * Fy * Sxc) * (LbIn - Lp) / (Lr - Lp));
      Mn = Math.min(Mn, Mp);
      governs = 'Inelastic LTB';
    } else {
      const Fcr = Cb * Math.PI * Math.PI * E_STEEL / ((LbIn / rt) * (LbIn / rt));
      Mn = Fcr * Sxc;
      Mn = Math.min(Mn, Mp);
      governs = 'Elastic LTB';
    }
  } else {
    // Noncompact or slender: Mn capped at My (or less)
    Mn = Math.min(
      Mnltb === Infinity ? My : Mnltb,
      Mnflb === Infinity ? My : Mnflb,
      Mnweb === Infinity ? My : Mnweb,
      My
    );
    if (Mn === Mnweb && Mnweb < Infinity) governs = 'Web bend-buckling';
    else if (Mn === Mnflb && Mnflb < Infinity) governs = 'Flange local buckling';
    else if (Mn === Mnltb && Mnltb < Infinity) governs = 'Lateral-torsional buckling';
    else governs = 'Yield moment (My)';
  }

  // phi = 1.0 for flexure per AASHTO LRFD 6.5.4.2
  const phi = 1.00;

  // Convert to kip-ft
  const MnKipFt = Mn / 12;
  const MpKipFt = Mp / 12;
  const MyKipFt = My / 12;

  return {
    Mn: MnKipFt,
    Mp: MpKipFt,
    My: MyKipFt,
    MnLTB: (Mnltb === Infinity ? null : Mnltb / 12),
    MnFLB: (Mnflb === Infinity ? null : Mnflb / 12),
    MnWeb: (Mnweb === Infinity ? null : Mnweb / 12),
    governs,
    phi,
    Lp: Lp / 12, // ft
    Lr: Lr / 12, // ft
    webClass,
    flangeClass,
    lambdaW,
    lambdaF,
    Cb
  };
}

// ============================================================
// Shear capacity — AASHTO LRFD 6.10.9
// ============================================================

/**
 * Compute nominal shear resistance Vn for an unstiffened web.
 * Per AASHTO LRFD 6.10.9.2 (unstiffened webs) and 6.10.9.3 (stiffened).
 *
 * @param {object} section - section properties
 * @param {number} Fy - yield strength (ksi)
 * @param {number} stiffenerSpacing - transverse stiffener spacing (in), 0 = unstiffened
 * @returns {{ Vn, Vp, C, phi, webRatio }}
 */
function computeSteelVn(section, Fy, stiffenerSpacing) {
  const { D, tw } = section;

  // Plastic shear force
  const Vp = 0.58 * Fy * D * tw; // kips

  // Web slenderness
  const ratio = D / tw;

  // Shear buckling coefficient k
  let k;
  if (stiffenerSpacing > 0) {
    const doOverD = stiffenerSpacing / D;
    k = 5 + 5 / (doOverD * doOverD);
  } else {
    k = 5.0; // unstiffened
  }

  // C = ratio of shear-buckling resistance to shear yield
  const limit1 = 1.12 * Math.sqrt(E_STEEL * k / Fy);
  const limit2 = 1.40 * Math.sqrt(E_STEEL * k / Fy);

  let C;
  if (ratio <= limit1) {
    C = 1.0;
  } else if (ratio <= limit2) {
    C = limit1 / ratio;
  } else {
    C = 1.57 * E_STEEL * k / (Fy * ratio * ratio);
  }

  const Vn = C * Vp;
  const phi = 1.00; // AASHTO LRFD 6.5.4.2

  return { Vn, Vp, C, phi, webRatio: ratio, k };
}

// ============================================================
// Dead load demand
// ============================================================

/**
 * Compute dead load moments and shears for a simple span.
 */
function computeSteelDeadLoad(spanFt, dcW, dwW) {
  const dcMoment = dcW * spanFt * spanFt / 8;
  const dcShear  = dcW * spanFt / 2;
  const dwMoment = dwW * spanFt * spanFt / 8;
  const dwShear  = dwW * spanFt / 2;
  return { dcMoment, dcShear, dwMoment, dwShear };
}

/**
 * Compute dead load moment and shear at a specific location x (ft) from left support.
 */
function computeSteelDeadLoadAtX(spanFt, dcW, dwW, x) {
  const dcM = dcW * x * (spanFt - x) / 2;
  const dcV = dcW * (spanFt / 2 - x);
  const dwM = dwW * x * (spanFt - x) / 2;
  const dwV = dwW * (spanFt / 2 - x);
  return { dcMoment: dcM, dcShear: Math.abs(dcV), dwMoment: dwM, dwShear: Math.abs(dwV) };
}

// ============================================================
// Live load demand — reuses bridge-live-load engine
// ============================================================

/**
 * Compute live load demand at the critical location (max moment and max shear).
 * For simple spans: max moment at midspan, max shear at support.
 */
function computeSteelLiveLoad(spanFt, truckDef, impactFactor, laneLoadW, distFactor) {
  const nPts = ANALYSIS_POINTS;

  // Truck envelope
  let truckEnv;
  if (truckDef.variableSpacing) {
    const { min: sMin, max: sMax } = truckDef.variableSpacing;
    let first = true;
    for (let sp = sMin; sp <= sMax; sp += 2) {
      const axles = getTruckAxles(truckDef, sp);
      const env = truckEnvelopeSimple(spanFt, axles, nPts, impactFactor);
      if (first) { truckEnv = env; first = false; }
      else {
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

  // Lane load
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

  // HL-93: max of (truck+lane) or (tandem+lane)
  const maxMoment = Math.max(truckMaxM + laneMaxM, tandemMaxM + laneMaxM) * distFactor;
  const maxShear  = Math.max(truckMaxV + laneMaxV, tandemMaxV + laneMaxV) * distFactor;

  // Truck-only demand for LFR/ASR (no lane, no impact — IM applied separately)
  let truckEnvNoIM;
  if (truckDef.variableSpacing) {
    const { min: sMin, max: sMax } = truckDef.variableSpacing;
    let first = true;
    for (let sp = sMin; sp <= sMax; sp += 2) {
      const axles = getTruckAxles(truckDef, sp);
      const env = truckEnvelopeSimple(spanFt, axles, nPts, 0);
      if (first) { truckEnvNoIM = env; first = false; }
      else {
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

  // Also compute full moment/shear envelopes for checking at arbitrary locations
  const momentEnv = [];
  const shearEnv = [];
  for (let i = 0; i <= nPts; i++) {
    const tM = truckEnv.maxMoments[i] + laneResult.moments[i];
    const tdM = tandemEnv ? tandemEnv.maxMoments[i] + laneResult.moments[i] : 0;
    momentEnv.push(Math.max(tM, tdM) * distFactor);

    const tV = truckEnv.maxShears[i] + laneResult.shears[i];
    const tdV = tandemEnv ? tandemEnv.maxShears[i] + laneResult.shears[i] : 0;
    shearEnv.push(Math.max(tV, tdV) * distFactor);
  }

  // Envelopes without IM for LFR/ASR
  const momentEnvNoIM = [];
  const shearEnvNoIM = [];
  for (let i = 0; i <= nPts; i++) {
    const tM = truckEnvNoIM.maxMoments[i];
    const tdM = tandemAxles ? (tandemEnv ? Math.max(...[tandemMaxMNoIM]) : 0) : 0;
    momentEnvNoIM.push(Math.max(truckEnvNoIM.maxMoments[i], tandemMaxMNoIM > truckMaxMNoIM ? tandemMaxMNoIM * truckEnvNoIM.maxMoments[i] / (truckMaxMNoIM || 1) : truckEnvNoIM.maxMoments[i]) * distFactor);
    shearEnvNoIM.push(Math.max(truckEnvNoIM.maxShears[i], tandemMaxVNoIM > truckMaxVNoIM ? tandemMaxVNoIM * truckEnvNoIM.maxShears[i] / (truckMaxVNoIM || 1) : truckEnvNoIM.maxShears[i]) * distFactor);
  }

  return {
    maxMoment, maxShear,
    truckMoment: truckMaxM * distFactor,
    tandemMoment: tandemMaxM * distFactor,
    laneMoment: laneMaxM * distFactor,
    truckShear: truckMaxV * distFactor,
    tandemShear: tandemMaxV * distFactor,
    laneShear: laneMaxV * distFactor,
    lfrTruckM, lfrTruckV,
    momentEnv, shearEnv,
    momentEnvNoIM: momentEnvNoIM,
    shearEnvNoIM: shearEnvNoIM
  };
}

/**
 * Get live load moment and shear at a specific analysis point index.
 */
function getLiveLoadAtPoint(liveLoads, ptIndex, nPts) {
  const i = Math.min(ptIndex, nPts);
  return {
    maxMoment: liveLoads.momentEnv[i] || 0,
    maxShear: liveLoads.shearEnv[i] || 0,
    lfrTruckM: liveLoads.momentEnvNoIM ? liveLoads.momentEnvNoIM[i] || 0 : 0,
    lfrTruckV: liveLoads.shearEnvNoIM ? liveLoads.shearEnvNoIM[i] || 0 : 0
  };
}

// ============================================================
// LRFR Rating — per AASHTO MBE 6A.4.2
// ============================================================

const STEEL_LRFR_FACTORS = {
  design_inventory: { label: 'Design - Inventory', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.75 },
  design_operating: { label: 'Design - Operating', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.35 },
  legal:            { label: 'Legal Load',         gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.80 },
  permit_routine:   { label: 'Permit - Routine',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.30 },
  permit_special:   { label: 'Permit - Special',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.15 }
};

function computeSteelLRFR(phiMn, phiVn, deadLoads, liveLoads, phiC, phiS, legalGammaLL) {
  const results = {};
  for (const [key, factors] of Object.entries(STEEL_LRFR_FACTORS)) {
    const { gammaDC, gammaDW } = factors;
    const gammaLL = (key === 'legal' && legalGammaLL !== undefined) ? legalGammaLL : factors.gammaLL;

    const Rn_m = phiC * phiS * phiMn;
    const numerM = Rn_m - gammaDC * deadLoads.dcMoment - gammaDW * deadLoads.dwMoment;
    const denomM = gammaLL * liveLoads.maxMoment;
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    const Rn_v = phiC * phiS * phiVn;
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

function computeSteelLFR(Mn, Vn, deadLoads, liveLoads, spanFt, truckDef) {
  const A1 = 1.3;
  const PHI_MOMENT = 1.00; // Steel uses phi=1.0 in LFR
  const PHI_SHEAR  = 1.00;

  // Impact factor: I = 50/(L+125), max 0.30
  const lfrImpact = Math.min(50 / (spanFt + 125), 0.30);

  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, a) => s + a.weight, 0) / 2
    : 36;

  const levels = {
    inventory: { label: 'Inventory', A2: 2.17 },
    operating: { label: 'Operating', A2: 1.30 }
  };

  const D_moment = deadLoads.dcMoment + deadLoads.dwMoment;
  const D_shear  = deadLoads.dcShear + deadLoads.dwShear;
  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    const { A2 } = level;
    const C_m = PHI_MOMENT * Mn;
    const numerM = C_m - A1 * D_moment;
    const denomM = A2 * liveLoads.lfrTruckM * (1 + lfrImpact);
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    const C_v = PHI_SHEAR * Vn;
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
// ASR Rating — Allowable Stress Rating for Steel
// ============================================================

/**
 * ASR for steel: RF = (C - D) / (L * (1 + I))
 *
 * C = allowable stress capacity
 *   Inventory: Fb = 0.55 * Fy (bending), Fv = 0.33 * Fy (shear)
 *   Operating: Fb = 0.75 * Fy (bending), Fv = 0.33 * Fy (shear)
 */
function computeSteelASR(section, Fy, deadLoads, liveLoads, spanFt, truckDef) {
  const levels = {
    inventory: { label: 'Inventory', Fb: 0.55 * Fy, Fv: 0.33 * Fy },
    operating: { label: 'Operating', Fb: 0.75 * Fy, Fv: 0.33 * Fy }
  };

  const D_moment = deadLoads.dcMoment + deadLoads.dwMoment;
  const D_shear  = deadLoads.dcShear + deadLoads.dwShear;

  const asrImpact = Math.min(50 / (spanFt + 125), 0.30);
  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, a) => s + a.weight, 0) / 2
    : 36;

  const Smin = Math.min(section.Sxc, section.Sxt_tens);
  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    // Moment capacity: Ma = Fb * S / 12 (kip-ft)
    const Ma = level.Fb * Smin / 12;

    // Shear capacity: Va = Fv * D * tw (kips)
    const Va = level.Fv * section.D * section.tw;

    const denomM = liveLoads.lfrTruckM * (1 + asrImpact);
    const denomV = liveLoads.lfrTruckV * (1 + asrImpact);

    const rfMoment = denomM > 0 ? (Ma - D_moment) / denomM : Infinity;
    const rfShear  = denomV > 0 ? (Va - D_shear) / denomV : Infinity;
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
// Master rating function — with multi-point section loss
// ============================================================

/**
 * Run complete steel girder load rating.
 *
 * @param {object} params
 * @param {string} params.sectionType - 'rolled' or 'plate'
 * @param {string} params.rolledSection - W-shape name (if rolled)
 * @param {object} params.plateGirder - { D, tw, bfc, tfc, bft, tft } (if plate)
 * @param {number} params.Fy - yield strength (ksi)
 * @param {number} params.spanFt
 * @param {number} params.Lb - unbraced length (ft)
 * @param {number} params.Cb - moment gradient modifier
 * @param {number} params.stiffenerSpacing - transverse stiffener spacing (in), 0=unstiffened
 * @param {Array}  params.checkPoints - [{ location (ft from left), twRemaining, tfcRemaining, tftRemaining, bfcRemaining, bftRemaining }]
 * @param {number} params.dcW, params.dwW - dead loads (kip/ft)
 * @param {object} params.truckDef
 * @param {number} params.impactFactor, params.laneLoad, params.distFactor
 * @param {number} params.phiC, params.phiS
 * @param {object} params.methods - { lrfr, lfr, asr }
 * @param {number} params.legalGammaLL
 */
function runSteelRating(params) {
  const {
    sectionType, rolledSection, plateGirder,
    Fy, spanFt, Lb, Cb, stiffenerSpacing,
    checkPoints,
    dcW, dwW, truckDef, impactFactor, laneLoad, distFactor,
    phiC, phiS, methods, legalGammaLL, analysisModel
  } = params;

  ensureSimpleSpanModel(analysisModel, 'steel-girder-rating');
  validateUnitConsistency({ Fy, impactFactor, dcW, dwW, laneLoad });

  // 1. Base section parameters
  let baseSectionParams;
  if (sectionType === 'rolled') {
    const ws = getWShapeProps(rolledSection);
    if (!ws) throw new Error('Unknown W-shape: ' + rolledSection);
    baseSectionParams = wShapeToSectionParams(ws);
  } else {
    baseSectionParams = plateGirder;
  }

  // 2. Compute base section properties (no loss)
  const baseSection = computeSteelSectionProps(
    baseSectionParams.D, baseSectionParams.tw,
    baseSectionParams.bfc, baseSectionParams.tfc,
    baseSectionParams.bft, baseSectionParams.tft
  );

  // 3. Live load demand (full envelope)
  const liveLoads = computeSteelLiveLoad(spanFt, truckDef, impactFactor, laneLoad, distFactor);
  const nPts = ANALYSIS_POINTS;

  // 4. Build check points list
  // Always include midspan and supports as check points
  const allCheckPoints = [];

  // Add user-defined check points
  if (checkPoints && checkPoints.length > 0) {
    for (const cp of checkPoints) {
      allCheckPoints.push({
        location: cp.location,
        label: `x = ${cp.location.toFixed(1)} ft`,
        loss: {
          twRemaining: cp.twRemaining,
          tfcRemaining: cp.tfcRemaining,
          tftRemaining: cp.tftRemaining,
          bfcRemaining: cp.bfcRemaining,
          bftRemaining: cp.bftRemaining
        }
      });
    }
  }

  // Add midspan with no loss if not already covered
  const midspan = spanFt / 2;
  const hasMidspan = allCheckPoints.some(cp => Math.abs(cp.location - midspan) < 0.1);
  if (!hasMidspan) {
    allCheckPoints.push({
      location: midspan,
      label: `Midspan (${midspan.toFixed(1)} ft)`,
      loss: {} // no loss
    });
  }

  // 5. Rate at each check point
  const pointResults = [];
  let governingResult = null;

  for (const cp of allCheckPoints) {
    // Section at this point
    const section = Object.keys(cp.loss).length > 0
      ? applySectionLoss(baseSectionParams, cp.loss)
      : baseSection;

    // Flexural capacity
    const moment = computeSteelMn(section, Fy, Lb, Cb);
    const phiMn = moment.phi * moment.Mn;

    // Shear capacity
    const shear = computeSteelVn(section, Fy, stiffenerSpacing);
    const phiVn = shear.phi * shear.Vn;

    // Dead load at this location
    const deadLoads = computeSteelDeadLoadAtX(spanFt, dcW, dwW, cp.location);

    // Live load at this location
    const ptIndex = Math.round(cp.location / spanFt * nPts);
    const llAtPt = getLiveLoadAtPoint(liveLoads, ptIndex, nPts);

    // Build LL object for rating functions
    const llForRating = {
      maxMoment: llAtPt.maxMoment,
      maxShear: llAtPt.maxShear,
      lfrTruckM: llAtPt.lfrTruckM,
      lfrTruckV: llAtPt.lfrTruckV
    };

    const ptResult = {
      location: cp.location,
      label: cp.label,
      section,
      moment,
      phiMn,
      shear,
      phiVn,
      deadLoads,
      liveLoads: llForRating,
      hasLoss: Object.keys(cp.loss).length > 0,
      loss: cp.loss
    };

    // Rating calculations
    if (methods.lrfr) {
      ptResult.lrfr = computeSteelLRFR(phiMn, phiVn, deadLoads, llForRating, phiC, phiS, legalGammaLL);
    }
    if (methods.lfr) {
      ptResult.lfr = computeSteelLFR(moment.Mn, shear.Vn, deadLoads, llForRating, spanFt, truckDef);
    }
    if (methods.asr) {
      ptResult.asr = computeSteelASR(section, Fy, deadLoads, llForRating, spanFt, truckDef);
    }

    // Find minimum RF at this point
    let minRF = Infinity;
    let minLabel = '';
    for (const method of ['lrfr', 'lfr', 'asr']) {
      if (!ptResult[method]) continue;
      for (const [, v] of Object.entries(ptResult[method])) {
        if (v.rf < minRF) {
          minRF = v.rf;
          minLabel = method.toUpperCase() + ' ' + v.label + ' (' + v.governs + ')';
        }
      }
    }
    ptResult.governingRF = minRF;
    ptResult.governingLabel = minLabel;

    pointResults.push(ptResult);

    // Track overall governing
    if (!governingResult || minRF < governingResult.governingRF) {
      governingResult = ptResult;
    }
  }

  return {
    baseSection,
    baseSectionParams,
    liveLoads,
    pointResults,
    governingResult,
    sectionType,
    rolledSection: sectionType === 'rolled' ? rolledSection : null
  };
}
