/**
 * Composite Steel Girder Load Rating Engine
 *
 * Computes load rating factors per AASHTO MBE for composite steel girders:
 *   - LRFR (Load and Resistance Factor Rating)
 *   - LFR  (Load Factor Rating)
 *   - ASR  (Allowable Stress Rating)
 *
 * Supports rolled W-shapes and plate girder sections with concrete deck.
 * Composite section analysis per AASHTO LRFD Chapter 6.
 *
 * References:
 *   AASHTO LRFD Bridge Design Specifications, Chapter 6
 *   AASHTO Manual for Bridge Evaluation (MBE), Chapter 6
 */

const E_STEEL = 29000; // ksi
const UNIT_WEIGHT_CONCRETE = 0.150; // kcf (normal weight)

function ensureSimpleSpanModel(analysisModel, engineName) {
  const model = analysisModel || 'simple-span';
  if (model !== 'simple-span') {
    throw new Error(`${engineName} currently supports simple-span analysis only. Set analysisModel to "simple-span" for this app.`);
  }
}

function validateUnitConsistency(params) {
  const deck = params.deck || {};
  if ((params.Fy || 0) > 200) {
    throw new Error('Fy appears to be entered in psi. Enter steel yield strength in ksi (e.g., 50).');
  }
  if ((deck.fc || 0) > 25) {
    throw new Error('Deck concrete f\'c appears to be entered in psi. Enter deck.fc in ksi (e.g., 4).');
  }
  if ((params.impactFactor || 0) > 1) {
    throw new Error('Impact factor must be a decimal (e.g., 0.33), not a percent.');
  }
  if ((params.dc1W || 0) > 20 ||
      (params.dc2W || 0) > 20 ||
      (params.dwW || 0) > 20 ||
      (params.laneLoad || 0) > 20) {
    throw new Error('Distributed loads look too large for kip/ft inputs. Verify lane/dead-load units.');
  }
}

// ============================================================
// Steel section property computation (reused from non-composite)
// ============================================================

function computeSteelSectionProps(D, tw, bfc, tfc, bft, tft) {
  const d = tfc + D + tft;
  const Afc = bfc * tfc;
  const Aw = D * tw;
  const Aft = bft * tft;
  const A = Afc + Aw + Aft;

  const yfc = tfc / 2;
  const yw = tfc + D / 2;
  const yft = tfc + D + tft / 2;

  const ybar = (Afc * yfc + Aw * yw + Aft * yft) / A;

  const Ifc = bfc * tfc * tfc * tfc / 12 + Afc * (ybar - yfc) * (ybar - yfc);
  const Iw = tw * D * D * D / 12 + Aw * (ybar - yw) * (ybar - yw);
  const Ift = bft * tft * tft * tft / 12 + Aft * (ybar - yft) * (ybar - yft);
  const Ix = Ifc + Iw + Ift;

  const ytop = ybar;
  const ybot = d - ybar;
  const Sxt = Ix / ytop;
  const Sxb = Ix / ybot;
  const Sxc = Sxt;
  const Sxt_tens = Sxb;

  const Dc = ybar - tfc;
  const { Zx, Yp } = computeSteelPlasticProps(D, tw, bfc, tfc, bft, tft);

  const Iyc = tfc * bfc * bfc * bfc / 12;
  const Iyt = tft * bft * bft * bft / 12;
  const Iy = Iyc + Iyt + D * tw * tw * tw / 12;

  const rt = bfc / Math.sqrt(12 * (1 + (Dc * tw) / (3 * bfc * tfc)));
  const J = (bfc * tfc * tfc * tfc + D * tw * tw * tw + bft * tft * tft * tft) / 3;

  return {
    d, D, tw, bfc, tfc, bft, tft,
    A, Afc, Aw, Aft,
    ybar, ytop, ybot,
    Ix, Sxt, Sxb, Sxc, Sxt_tens,
    Dc, Zx, Yp,
    Iy, Iyc, Iyt, rt, J
  };
}

function computeSteelPlasticProps(D, tw, bfc, tfc, bft, tft) {
  const Afc = bfc * tfc;
  const Aw = D * tw;
  const Aft = bft * tft;
  const totalA = Afc + Aw + Aft;
  const halfA = totalA / 2;

  let Yp;
  if (Afc >= halfA) {
    Yp = halfA / bfc;
  } else if (Afc + Aw >= halfA) {
    Yp = tfc + (halfA - Afc) / tw;
  } else {
    Yp = tfc + D + (halfA - Afc - Aw) / bft;
  }

  let Zx = 0;
  if (Yp <= tfc) {
    const aAbove = bfc * Yp;
    const aBelow_f = bfc * (tfc - Yp);
    Zx = aAbove * (Yp / 2) + aBelow_f * ((tfc - Yp) / 2) +
         Aw * (tfc + D / 2 - Yp) + Aft * (tfc + D + tft / 2 - Yp);
  } else if (Yp <= tfc + D) {
    const dw_above = Yp - tfc;
    const dw_below = D - dw_above;
    Zx = Afc * (Yp - tfc / 2) +
         tw * dw_above * dw_above / 2 +
         tw * dw_below * dw_below / 2 +
         Aft * (tfc + D + tft / 2 - Yp);
  } else {
    const df_above = Yp - tfc - D;
    const df_below = tft - df_above;
    Zx = Afc * (Yp - tfc / 2) +
         Aw * (Yp - tfc - D / 2) +
         bft * df_above * df_above / 2 +
         bft * df_below * df_below / 2;
  }

  return { Zx, Yp };
}

function wShapeToSectionParams(ws) {
  const D = ws.d - 2 * ws.tf;
  return { D, tw: ws.tw, bfc: ws.bf, tfc: ws.tf, bft: ws.bf, tft: ws.tf };
}

/**
 * Apply section loss to base section parameters.
 * Returns modified section properties with reduced dimensions.
 *
 * @param {object} baseProps - base section { D, tw, bfc, tfc, bft, tft }
 * @param {object} loss - { twRemaining, tfcRemaining, tftRemaining, bfcRemaining, bftRemaining }
 *   Any undefined values use original dimensions.
 */
function applyCompositeSectionLoss(baseProps, loss) {
  const tw  = loss.twRemaining  !== undefined ? loss.twRemaining  : baseProps.tw;
  const tfc = loss.tfcRemaining !== undefined ? loss.tfcRemaining : baseProps.tfc;
  const tft = loss.tftRemaining !== undefined ? loss.tftRemaining : baseProps.tft;
  const bfc = loss.bfcRemaining !== undefined ? loss.bfcRemaining : baseProps.bfc;
  const bft = loss.bftRemaining !== undefined ? loss.bftRemaining : baseProps.bft;
  const D = baseProps.D;
  return computeSteelSectionProps(D, tw, bfc, tfc, bft, tft);
}

// ============================================================
// Concrete and composite section properties
// ============================================================

/**
 * Compute modular ratio n = Es/Ec.
 * Ec = 33 * wc^1.5 * sqrt(f'c) for normal weight concrete (ksi).
 * @param {number} fc - concrete compressive strength (ksi)
 * @param {number} wc - unit weight of concrete (kcf), default 0.150
 * @returns {number} modular ratio n (rounded to nearest integer per AASHTO)
 */
function computeModularRatio(fc, wc) {
  if (!wc) wc = UNIT_WEIGHT_CONCRETE;
  // wc in pcf for the ACI formula: Ec = 33 * wc^1.5 * sqrt(f'c) (psi)
  const wcPcf = wc * 1000; // 0.150 kcf -> 150 pcf
  const fcPsi = fc * 1000;  // ksi -> psi
  const EcPsi = 33 * Math.pow(wcPcf, 1.5) * Math.sqrt(fcPsi); // psi
  const Ec = EcPsi / 1000; // ksi
  const n = E_STEEL / Ec;
  return { n: Math.round(n), Ec };
}

/**
 * Compute effective flange width per AASHTO LRFD 4.6.2.6.
 * For interior girders: beff = min(L/4, 12*ts + max(tw, bf/2), S)
 * For exterior girders: beff = min(L/8, 6*ts + max(tw/2, bf/4), S/2 + overhang)
 *
 * Simplified: use min(L/4, 12*ts, S) for interior; allow manual override.
 *
 * @param {number} spanFt - span length (ft)
 * @param {number} ts - slab thickness (in)
 * @param {number} girderSpacing - girder spacing (in), 0 for manual override
 * @param {number} tw - web thickness (in)
 * @returns {number} effective flange width (in)
 */
function computeEffectiveWidth(spanFt, ts, girderSpacing, tw) {
  const spanIn = spanFt * 12;
  const limit1 = spanIn / 4;
  const limit2 = 12 * ts;
  let beff;
  if (girderSpacing > 0) {
    beff = Math.min(limit1, limit2, girderSpacing);
  } else {
    beff = Math.min(limit1, limit2);
  }
  return beff;
}

/**
 * Compute transformed composite section properties.
 *
 * Convention: top of steel section is at y=0, positive downward.
 * The concrete slab sits above the steel top flange with a haunch.
 *
 * @param {object} steel - steel section properties from computeSteelSectionProps
 * @param {object} deck - { ts, beff, fc, haunch }
 *   ts: slab structural thickness (in)
 *   beff: effective flange width (in)
 *   fc: concrete f'c (ksi)
 *   haunch: haunch depth between top of steel and bottom of slab (in)
 * @param {number} nRatio - modular ratio (n for short-term, 3n for long-term)
 * @returns composite section properties
 */
function computeCompositeSectionProps(steel, deck, nRatio) {
  const { ts, beff, haunch } = deck;

  // Transformed slab width
  const btr = beff / nRatio;

  // Slab area (transformed)
  const Aslab = btr * ts;

  // Steel centroid from top of steel
  const ySteel = steel.ybar; // from top of steel

  // Slab centroid from top of steel (slab is above steel)
  // Position: slab mid-depth is at -(haunch + ts/2) from top of steel
  const ySlab = -(haunch + ts / 2);

  // Combined centroid from top of steel
  const Atotal = steel.A + Aslab;
  const ybarComp = (steel.A * ySteel + Aslab * ySlab) / Atotal;

  // Moment of inertia (parallel axis theorem)
  const Islab = btr * ts * ts * ts / 12 + Aslab * (ybarComp - ySlab) * (ybarComp - ySlab);
  const Isteel = steel.Ix + steel.A * (ybarComp - ySteel) * (ybarComp - ySteel);
  const Icomp = Islab + Isteel;

  // Distances from composite NA to extreme fibers
  const yTopSlab = ybarComp - (-(haunch + ts)); // distance from NA to top of slab
  const yTopSteel = ybarComp; // distance from NA to top of steel (y=0)
  const yBotSteel = steel.d - ybarComp; // distance from NA to bottom of steel

  // Section moduli
  const StopSlab = Icomp / Math.abs(yTopSlab);   // top of slab (concrete)
  const StopSteel = Icomp / Math.abs(yTopSteel);  // top of steel
  const SbotSteel = Icomp / yBotSteel;            // bottom of steel (tension)

  return {
    Atotal,
    ybarComp, // from top of steel, positive down
    Icomp,
    yTopSlab,
    yTopSteel,
    yBotSteel,
    StopSlab,
    StopSteel,
    SbotSteel,
    Aslab,
    btr,
    nRatio
  };
}

/**
 * Compute composite plastic moment Mp per AASHTO 6.10.7.1.2.
 *
 * For positive moment: PNA search through 7 cases.
 * Forces: Ps = 0.85*f'c*beff*ts, Pw = Fy*D*tw, Pt = Fy*bft*tft, Pc = Fy*bfc*tfc
 *
 * @param {object} steel - steel section properties
 * @param {object} deck - { ts, beff, fc, haunch }
 * @param {number} Fy - steel yield strength (ksi)
 * @returns {{ Mp, Yp_pna, dpna, Dp, Dt }} in kip-in and inches
 */
function computeCompositeMp(steel, deck, Fy) {
  const { ts, beff, haunch } = deck;
  const { D, tw, bfc, tfc, bft, tft } = steel;

  const Ps = 0.85 * deck.fc * beff * ts;  // slab force
  const Pc = Fy * bfc * tfc;              // compression flange force
  const Pw = Fy * D * tw;                 // web force
  const Pt = Fy * bft * tft;              // tension flange force

  // Total steel tensile force
  const Psteel = Pc + Pw + Pt;

  // Convention: measure from top of slab downward
  // Top of slab = 0
  // Bottom of slab = ts
  // Top of steel = ts + haunch
  // Top of web = ts + haunch + tfc
  // Bottom of web = ts + haunch + tfc + D
  // Bottom of steel = ts + haunch + tfc + D + tft

  const dSlab = ts;
  const dTopSteel = ts + haunch;
  const dTopWeb = ts + haunch + tfc;
  const dBotWeb = ts + haunch + tfc + D;
  const dBotSteel = ts + haunch + tfc + D + tft;

  let Yp, Mp;

  if (Ps >= Psteel) {
    // Case 1: PNA in slab
    // Depth of PNA from top of slab
    Yp = (Psteel / (0.85 * deck.fc * beff));
    // Ensure PNA is within slab
    Yp = Math.min(Yp, ts);

    // Mp: sum of force * distance to PNA for each component
    const Cs = 0.85 * deck.fc * beff * Yp; // compression in slab above PNA
    Mp = Cs * (Yp / 2) +
         Pc * (dTopSteel + tfc / 2 - Yp) +
         Pw * (dTopWeb + D / 2 - Yp) +
         Pt * (dBotWeb + tft / 2 - Yp);
    // Since forces above PNA are compression and below are tension,
    // the net compression above = Cs, net tension below = Psteel - (Ps - Cs)
    // Actually recompute properly:
    // All steel is in tension below slab PNA
    // Slab above PNA is in compression
    Mp = Cs * Yp / 2 +
         Pc * (dTopSteel + tfc / 2 - Yp) +
         Pw * (dTopWeb + D / 2 - Yp) +
         Pt * (dBotWeb + tft / 2 - Yp);
  } else if (Ps + Pc >= Pw + Pt) {
    // PNA may be in top flange
    // PNA in top flange: Ps + Pc_above = Pc_below + Pw + Pt
    // Let y = depth of PNA from top of steel
    // Fy*bfc*y + Ps = Fy*bfc*(tfc - y) + Pw + Pt
    // 2*Fy*bfc*y = Pw + Pt - Ps + Fy*bfc*tfc
    const yInFlange = (Pw + Pt - Ps + Pc) / (2 * Fy * bfc);

    if (yInFlange >= 0 && yInFlange <= tfc) {
      // PNA is in the top (compression) flange
      Yp = dTopSteel + yInFlange;
      const Pc_above = Fy * bfc * yInFlange;
      const Pc_below = Fy * bfc * (tfc - yInFlange);

      Mp = Ps * (Yp - ts / 2) +
           Pc_above * (yInFlange / 2) +
           Pc_below * ((tfc - yInFlange) / 2) +
           Pw * (dTopWeb + D / 2 - Yp) +
           Pt * (dBotWeb + tft / 2 - Yp);
    } else {
      // PNA in web
      Yp = computePNAinWeb(Ps, Pc, Pw, Pt, Fy, tw, D, dTopSteel, dTopWeb, dBotWeb, tfc, tft, ts, deck);
      Mp = computeMpAtPNA(Yp, Ps, Pc, Pw, Pt, Fy, tw, bfc, bft, D, tfc, tft, ts, haunch, beff, deck);
    }
  } else {
    // PNA in web
    Yp = computePNAinWeb(Ps, Pc, Pw, Pt, Fy, tw, D, dTopSteel, dTopWeb, dBotWeb, tfc, tft, ts, deck);
    Mp = computeMpAtPNA(Yp, Ps, Pc, Pw, Pt, Fy, tw, bfc, bft, D, tfc, tft, ts, haunch, beff, deck);
  }

  // Dp = distance from top of slab to PNA
  const Dp = Yp;
  // Dt = total depth of composite section
  const Dt = dBotSteel;

  return { Mp, Yp, Dp, Dt };
}

function computePNAinWeb(Ps, Pc, Pw, Pt, Fy, tw, D, dTopSteel, dTopWeb, dBotWeb, tfc, tft, ts, deck) {
  // PNA in web: Ps + Pc + Fy*tw*yw = Fy*tw*(D - yw) + Pt
  // where yw = distance from top of web to PNA
  // 2*Fy*tw*yw = Pt - Ps - Pc + Pw
  const yw = (Pt - Ps - Pc + Pw) / (2 * Fy * tw);
  return dTopWeb + Math.max(0, Math.min(yw, D));
}

function computeMpAtPNA(Yp, Ps, Pc, Pw, Pt, Fy, tw, bfc, bft, D, tfc, tft, ts, haunch, beff, deck) {
  const dTopSteel = ts + haunch;
  const dTopWeb = dTopSteel + tfc;
  const dBotWeb = dTopWeb + D;

  let Mp = 0;

  // Slab contribution (always in compression, centroid at ts/2 from top of slab)
  Mp += Ps * Math.abs(Yp - ts / 2);

  // Top flange
  const cfCentroid = dTopSteel + tfc / 2;
  if (Yp >= dTopSteel + tfc) {
    // Entire top flange above PNA (in compression)
    Mp += Pc * Math.abs(Yp - cfCentroid);
  } else if (Yp > dTopSteel) {
    // Partially split
    const above = Yp - dTopSteel;
    const below = tfc - above;
    Mp += Fy * bfc * above * (above / 2) + Fy * bfc * below * (below / 2);
  } else {
    // Entire top flange below PNA (in tension)
    Mp += Pc * Math.abs(cfCentroid - Yp);
  }

  // Web
  if (Yp >= dTopWeb && Yp <= dBotWeb) {
    const webAbove = Yp - dTopWeb;
    const webBelow = D - webAbove;
    Mp += Fy * tw * webAbove * webAbove / 2 + Fy * tw * webBelow * webBelow / 2;
  } else if (Yp < dTopWeb) {
    Mp += Pw * Math.abs(dTopWeb + D / 2 - Yp);
  } else {
    Mp += Pw * Math.abs(Yp - dTopWeb - D / 2);
  }

  // Bottom flange (tension)
  const bfCentroid = dBotWeb + tft / 2;
  Mp += Pt * Math.abs(bfCentroid - Yp);

  return Mp;
}

// ============================================================
// Composite Flexural Capacity - AASHTO LRFD 6.10.7
// ============================================================

/**
 * Compute nominal flexural resistance for composite section in positive moment.
 * Per AASHTO LRFD 6.10.7.1 (compact sections) and 6.10.7.2 (noncompact).
 *
 * @param {object} steel - steel section properties
 * @param {object} deck - { ts, beff, fc, haunch }
 * @param {number} Fy - yield strength (ksi)
 * @param {number} Lb - unbraced length (ft) - for positive moment, Lb is typically small
 * @param {number} Cb - moment gradient factor
 * @param {object} compositeST - short-term composite section properties
 * @param {object} compositeLT - long-term composite section properties
 * @returns flexural capacity object
 */
function computeCompositeMn(steel, deck, Fy, Lb, Cb, compositeST, compositeLT) {
  if (Cb === undefined) Cb = 1.0;

  const { D, tw, bfc, tfc } = steel;

  // Compute plastic moment
  const plastic = computeCompositeMp(steel, deck, Fy);
  const Mp = plastic.Mp; // kip-in
  const Dp = plastic.Dp;
  const Dt = plastic.Dt;

  // Yield moment for composite section (first yield in steel)
  // My = moment causing first yield accounting for staged loading
  // Simplified: My = Fy * Sst_bot (short-term composite bottom section modulus)
  const My = Fy * compositeST.SbotSteel; // kip-in

  // Web compactness per AASHTO 6.10.6.2.2
  const Dcp = computeDcp(steel, deck, Fy);
  const lambdaW = (Dcp > 0) ? 2 * Dcp / tw : 0;
  const lambdaPw = 3.76 * Math.sqrt(E_STEEL / Fy);

  let webClass;
  if (lambdaW <= lambdaPw) {
    webClass = 'compact';
  } else {
    webClass = 'noncompact';
  }

  // Compression flange slenderness
  const lambdaF = bfc / (2 * tfc);
  const lambdaPf = 0.38 * Math.sqrt(E_STEEL / Fy);

  let flangeClass;
  if (lambdaF <= lambdaPf) {
    flangeClass = 'compact';
  } else {
    flangeClass = 'noncompact';
  }

  // Ductility check per AASHTO 6.10.7.3: Dp <= 0.42 * Dt
  const ductilityOK = Dp <= 0.42 * Dt;

  let Mn, governs;

  if (webClass === 'compact' && flangeClass === 'compact') {
    // Compact section: AASHTO 6.10.7.1.2
    if (Dp <= 0.1 * Dt) {
      Mn = Mp;
      governs = 'Plastic moment (Mp)';
    } else {
      // Mn = Mp * (1.07 - 0.7 * Dp/Dt)
      Mn = Mp * (1.07 - 0.7 * Dp / Dt);
      Mn = Math.min(Mn, Mp);
      governs = 'Dp/Dt reduction';
    }
  } else {
    // Noncompact: Mn limited to My
    // Per 6.10.7.2: Fn = min of FLB, LTB, web bend-buckling stresses
    // Then Mn = Fn * Sxc
    // For positive moment composite with concrete deck providing bracing,
    // LTB typically does not govern
    Mn = My;
    governs = 'Yield moment (My)';
  }

  // Ductility limit: if Dp > 0.42*Dt, section fails ductility
  if (!ductilityOK) {
    governs = 'FAILS ductility (Dp/Dt > 0.42)';
  }

  const phi = 1.00; // AASHTO LRFD 6.5.4.2

  return {
    Mn: Mn / 12, // kip-ft
    Mp: Mp / 12, // kip-ft
    My: My / 12, // kip-ft
    governs,
    phi,
    webClass,
    flangeClass,
    Dp,
    Dt,
    DpDt: Dp / Dt,
    ductilityOK,
    Dcp
  };
}

/**
 * Compute depth of web in compression at plastic moment (Dcp) for composite section.
 * For positive moment, the PNA is typically in the slab or top flange,
 * so Dcp = 0 (no web in compression) or a small portion.
 */
function computeDcp(steel, deck, Fy) {
  const { D, tw, bfc, tfc, bft, tft } = steel;
  const { ts, beff, haunch, fc } = deck;

  const Ps = 0.85 * fc * beff * ts;
  const Pc = Fy * bfc * tfc;
  const Pw = Fy * D * tw;
  const Pt = Fy * bft * tft;

  // If PNA is in slab or top flange, Dcp = 0
  if (Ps + Pc >= Pw + Pt) {
    // Check if PNA is in flange
    const yInFlange = (Pw + Pt - Ps + Pc) / (2 * Fy * bfc);
    if (yInFlange <= tfc) {
      return 0; // PNA in slab or top flange, no web in compression
    }
  }

  // PNA is in web
  const yw = (Pt - Ps - Pc + Pw) / (2 * Fy * tw);
  return Math.max(0, Math.min(yw, D));
}

// ============================================================
// Shear Capacity (same as non-composite - web governed)
// ============================================================

function computeSteelVn(section, Fy, stiffenerSpacing) {
  const { D, tw } = section;
  const Vp = 0.58 * Fy * D * tw;
  const ratio = D / tw;

  let k;
  if (stiffenerSpacing > 0) {
    const doOverD = stiffenerSpacing / D;
    k = 5 + 5 / (doOverD * doOverD);
  } else {
    k = 5.0;
  }

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
  const phi = 1.00;

  return { Vn, Vp, C, phi, webRatio: ratio, k };
}

// ============================================================
// Shear Connector Design - AASHTO 6.10.10
// ============================================================

/**
 * Compute shear connector (stud) capacity per AASHTO 6.10.10.4.3.
 *
 * Qn = 0.5 * Asc * sqrt(f'c * Ec) <= Asc * Fu
 *
 * @param {number} studDiameter - stud diameter (in)
 * @param {number} fc - concrete f'c (ksi)
 * @param {number} Ec - concrete modulus (ksi)
 * @param {number} Fu - stud ultimate tensile strength (ksi), default 60
 * @returns {{ Qn, Asc }}
 */
function computeStudCapacity(studDiameter, fc, Ec, Fu) {
  if (!Fu) Fu = 60; // ksi, typical for headed studs
  const Asc = Math.PI * studDiameter * studDiameter / 4;
  const Qn1 = 0.5 * Asc * Math.sqrt(fc * Ec);
  const Qn2 = Asc * Fu;
  const Qn = Math.min(Qn1, Qn2);
  return { Qn, Asc };
}

/**
 * Compute horizontal shear at the interface and required number of studs.
 *
 * Vh = min(0.85*f'c*beff*ts, As*Fy) per AASHTO 6.10.10.4.2
 *
 * @param {object} steel - steel section properties
 * @param {object} deck - deck parameters
 * @param {number} Fy - steel yield strength
 * @param {number} Qn - individual stud capacity
 * @param {number} studsPerRow - number of studs per cross-section row
 * @returns {{ Vh, nRequired, pitch }}
 */
function computeShearConnectorDemand(steel, deck, Fy, Qn, studsPerRow, spanFt) {
  const { ts, beff, fc } = deck;
  const Vh1 = 0.85 * fc * beff * ts; // concrete crushing
  const Vh2 = steel.A * Fy;          // steel yielding
  const Vh = Math.min(Vh1, Vh2);

  // Number of studs required between max moment and zero moment (half span)
  const nRequired = Math.ceil(Vh / (Qn * studsPerRow));

  // Pitch (spacing) = half span / nRequired
  const halfSpanIn = spanFt * 12 / 2;
  const pitch = nRequired > 0 ? halfSpanIn / nRequired : 0;

  return {
    Vh,
    Vh1,
    Vh2,
    nRequired: nRequired * studsPerRow,
    nRows: nRequired,
    pitch,
    studsPerRow
  };
}

// ============================================================
// Dead load demand with construction staging
// ============================================================

/**
 * Compute dead loads with composite staging.
 * DC1 = dead load applied to steel section alone (before composite)
 * DC2 = dead load applied to composite section (after composite)
 * DW = wearing surface applied to composite section
 */
function computeCompositeDeadLoad(spanFt, dc1W, dc2W, dwW) {
  return {
    dc1Moment: dc1W * spanFt * spanFt / 8,
    dc1Shear: dc1W * spanFt / 2,
    dc2Moment: dc2W * spanFt * spanFt / 8,
    dc2Shear: dc2W * spanFt / 2,
    dwMoment: dwW * spanFt * spanFt / 8,
    dwShear: dwW * spanFt / 2
  };
}

function computeCompositeDeadLoadAtX(spanFt, dc1W, dc2W, dwW, x) {
  return {
    dc1Moment: dc1W * x * (spanFt - x) / 2,
    dc1Shear: Math.abs(dc1W * (spanFt / 2 - x)),
    dc2Moment: dc2W * x * (spanFt - x) / 2,
    dc2Shear: Math.abs(dc2W * (spanFt / 2 - x)),
    dwMoment: dwW * x * (spanFt - x) / 2,
    dwShear: Math.abs(dwW * (spanFt / 2 - x))
  };
}

// ============================================================
// Live load demand - reuses bridge-live-load engine
// ============================================================

function computeCompositeLiveLoad(spanFt, truckDef, impactFactor, laneLoadW, distFactor) {
  const nPts = ANALYSIS_POINTS;

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

  let tandemEnv = null;
  const tandemAxles = getTandemAxles(truckDef);
  if (tandemAxles) {
    tandemEnv = truckEnvelopeSimple(spanFt, tandemAxles, nPts, impactFactor);
  }

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

  const maxMoment = Math.max(truckMaxM + laneMaxM, tandemMaxM + laneMaxM) * distFactor;
  const maxShear = Math.max(truckMaxV + laneMaxV, tandemMaxV + laneMaxV) * distFactor;

  // Truck-only (no IM) for LFR/ASR
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

  // Full envelopes
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

  // No-IM envelopes
  const momentEnvNoIM = [];
  const shearEnvNoIM = [];
  for (let i = 0; i <= nPts; i++) {
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
    momentEnvNoIM, shearEnvNoIM
  };
}

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
// LRFR Rating - AASHTO MBE 6A.4.2 (Composite)
// ============================================================

const COMPOSITE_LRFR_FACTORS = {
  design_inventory: { label: 'Design - Inventory', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.75 },
  design_operating: { label: 'Design - Operating', gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.35 },
  legal:            { label: 'Legal Load',         gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.80 },
  permit_routine:   { label: 'Permit - Routine',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.30 },
  permit_special:   { label: 'Permit - Special',   gammaDC: 1.25, gammaDW: 1.50, gammaLL: 1.15 }
};

function computeCompositeLRFR(phiMn, phiVn, deadLoads, liveLoads, phiC, phiS, legalGammaLL) {
  const results = {};
  for (const [key, factors] of Object.entries(COMPOSITE_LRFR_FACTORS)) {
    const { gammaDC, gammaDW } = factors;
    const gammaLL = (key === 'legal' && legalGammaLL !== undefined) ? legalGammaLL : factors.gammaLL;

    const dcMoment = deadLoads.dc1Moment + deadLoads.dc2Moment;
    const dcShear = deadLoads.dc1Shear + deadLoads.dc2Shear;

    const Rn_m = phiC * phiS * phiMn;
    const numerM = Rn_m - gammaDC * dcMoment - gammaDW * deadLoads.dwMoment;
    const denomM = gammaLL * liveLoads.maxMoment;
    const rfMoment = denomM > 0 ? numerM / denomM : Infinity;

    const Rn_v = phiC * phiS * phiVn;
    const numerV = Rn_v - gammaDC * dcShear - gammaDW * deadLoads.dwShear;
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
// LFR Rating (Composite)
// ============================================================

function computeCompositeLFR(Mn, Vn, deadLoads, liveLoads, spanFt, truckDef) {
  const A1 = 1.3;
  const PHI_MOMENT = 1.00;
  const PHI_SHEAR = 1.00;

  const lfrImpact = Math.min(50 / (spanFt + 125), 0.30);
  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, a) => s + a.weight, 0) / 2
    : 36;

  const levels = {
    inventory: { label: 'Inventory', A2: 2.17 },
    operating: { label: 'Operating', A2: 1.30 }
  };

  const D_moment = deadLoads.dc1Moment + deadLoads.dc2Moment + deadLoads.dwMoment;
  const D_shear = deadLoads.dc1Shear + deadLoads.dc2Shear + deadLoads.dwShear;
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
// ASR Rating (Composite)
// ============================================================

function computeCompositeASR(section, compositeST, Fy, deadLoads, liveLoads, spanFt, truckDef) {
  const levels = {
    inventory: { label: 'Inventory', Fb: 0.55 * Fy, Fv: 0.33 * Fy },
    operating: { label: 'Operating', Fb: 0.75 * Fy, Fv: 0.33 * Fy }
  };

  const D_moment = deadLoads.dc1Moment + deadLoads.dc2Moment + deadLoads.dwMoment;
  const D_shear = deadLoads.dc1Shear + deadLoads.dc2Shear + deadLoads.dwShear;

  const asrImpact = Math.min(50 / (spanFt + 125), 0.30);
  const truckWeightTons = (truckDef && truckDef.axles)
    ? truckDef.axles.reduce((s, a) => s + a.weight, 0) / 2
    : 36;

  // Use composite section modulus for bottom flange (tension)
  const Sbot = compositeST.SbotSteel;
  const results = {};

  for (const [key, level] of Object.entries(levels)) {
    const Ma = level.Fb * Sbot / 12; // kip-ft
    const Va = level.Fv * section.D * section.tw; // kips

    const denomM = liveLoads.lfrTruckM * (1 + asrImpact);
    const denomV = liveLoads.lfrTruckV * (1 + asrImpact);

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
// Master composite rating function
// ============================================================

/**
 * Run complete composite steel girder load rating.
 *
 * @param {object} params - all input parameters
 */
function runCompositeRating(params) {
  const {
    sectionType, rolledSection, plateGirder,
    Fy, spanFt, Lb, Cb, stiffenerSpacing,
    checkPoints,
    dc1W, dc2W, dwW,
    truckDef, impactFactor, laneLoad, distFactor,
    phiC, phiS, methods, legalGammaLL, analysisModel,
    deck, studs
  } = params;

  ensureSimpleSpanModel(analysisModel, 'composite-steel-girder');
  validateUnitConsistency({ Fy, impactFactor, dc1W, dc2W, dwW, laneLoad, deck });

  // 1. Base steel section
  let baseSectionParams;
  if (sectionType === 'rolled') {
    const ws = getWShapeProps(rolledSection);
    if (!ws) throw new Error('Unknown W-shape: ' + rolledSection);
    baseSectionParams = wShapeToSectionParams(ws);
  } else {
    baseSectionParams = plateGirder;
  }

  const steelSection = computeSteelSectionProps(
    baseSectionParams.D, baseSectionParams.tw,
    baseSectionParams.bfc, baseSectionParams.tfc,
    baseSectionParams.bft, baseSectionParams.tft
  );

  // 2. Concrete and composite properties (base section)
  const { n, Ec } = computeModularRatio(deck.fc);
  const beff = deck.beffOverride > 0
    ? deck.beffOverride
    : computeEffectiveWidth(spanFt, deck.ts, deck.girderSpacing || 0, baseSectionParams.tw);

  const deckProps = { ts: deck.ts, beff, fc: deck.fc, haunch: deck.haunch || 0 };

  // Short-term composite (n) - for live load
  const compositeST = computeCompositeSectionProps(steelSection, deckProps, n);
  // Long-term composite (3n) - for dead load after composite
  const compositeLT = computeCompositeSectionProps(steelSection, deckProps, 3 * n);

  // 3. Shear connectors (based on base section)
  let shearConnectors = null;
  if (studs && studs.diameter > 0) {
    const studResult = computeStudCapacity(studs.diameter, deck.fc, Ec, studs.Fu || 60);
    const connDemand = computeShearConnectorDemand(
      steelSection, deckProps, Fy,
      studResult.Qn, studs.perRow || 2, spanFt
    );
    shearConnectors = { ...studResult, ...connDemand };
  }

  // 4. Live load demand (full envelope)
  const liveLoads = computeCompositeLiveLoad(spanFt, truckDef, impactFactor, laneLoad, distFactor);
  const nPts = ANALYSIS_POINTS;

  // 5. Build check points list
  const allCheckPoints = [];

  // Add user-defined check points (section loss locations)
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

  // Always include midspan if not already covered
  const midspan = spanFt / 2;
  const hasMidspan = allCheckPoints.some(cp => Math.abs(cp.location - midspan) < 0.1);
  if (!hasMidspan) {
    allCheckPoints.push({
      location: midspan,
      label: `Midspan (${midspan.toFixed(1)} ft)`,
      loss: {}
    });
  }

  // Always include support for shear check
  const hasSupport = allCheckPoints.some(cp => cp.location < 0.1);
  if (!hasSupport) {
    allCheckPoints.push({
      location: 0,
      label: 'Support (0.0 ft)',
      loss: {}
    });
  }

  // 6. Rate at each check point
  const pointResults = [];
  let governingResult = null;

  for (const cp of allCheckPoints) {
    const hasLoss = Object.keys(cp.loss).some(k => cp.loss[k] !== undefined);

    // Steel section at this point (apply loss if present)
    const ptSteelSection = hasLoss
      ? applyCompositeSectionLoss(baseSectionParams, cp.loss)
      : steelSection;

    // Recompute composite properties if section loss present
    const ptCompositeST = hasLoss
      ? computeCompositeSectionProps(ptSteelSection, deckProps, n)
      : compositeST;
    const ptCompositeLT = hasLoss
      ? computeCompositeSectionProps(ptSteelSection, deckProps, 3 * n)
      : compositeLT;

    // Flexural capacity at this point
    const moment = computeCompositeMn(ptSteelSection, deckProps, Fy, Lb, Cb, ptCompositeST, ptCompositeLT);
    const phiMn = moment.phi * moment.Mn;

    // Shear capacity at this point
    const shear = computeSteelVn(ptSteelSection, Fy, stiffenerSpacing);
    const phiVn = shear.phi * shear.Vn;

    // Dead load at this location
    const deadLoads = computeCompositeDeadLoadAtX(spanFt, dc1W, dc2W, dwW, cp.location);

    // Live load at this location
    const ptIndex = Math.round(cp.location / spanFt * nPts);
    const llAtPt = getLiveLoadAtPoint(liveLoads, ptIndex, nPts);
    const llForRating = {
      maxMoment: llAtPt.maxMoment,
      maxShear: llAtPt.maxShear,
      lfrTruckM: llAtPt.lfrTruckM,
      lfrTruckV: llAtPt.lfrTruckV
    };

    const ptResult = {
      location: cp.location,
      label: cp.label,
      section: ptSteelSection,
      steelSection: ptSteelSection,
      compositeST: ptCompositeST,
      compositeLT: ptCompositeLT,
      moment,
      phiMn,
      shear,
      phiVn,
      deadLoads,
      liveLoads: llForRating,
      hasLoss,
      loss: cp.loss
    };

    // Rating calculations
    if (methods.lrfr) {
      ptResult.lrfr = computeCompositeLRFR(phiMn, phiVn, deadLoads, llForRating, phiC, phiS, legalGammaLL);
    }
    if (methods.lfr) {
      ptResult.lfr = computeCompositeLFR(moment.Mn, shear.Vn, deadLoads, llForRating, spanFt, truckDef);
    }
    if (methods.asr) {
      ptResult.asr = computeCompositeASR(ptSteelSection, ptCompositeST, Fy, deadLoads, llForRating, spanFt, truckDef);
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
    steelSection,
    baseSectionParams,
    compositeST,
    compositeLT,
    deckProps,
    n,
    Ec,
    beff,
    liveLoads,
    shearConnectors,
    pointResults,
    governingResult,
    sectionType,
    rolledSection: sectionType === 'rolled' ? rolledSection : null
  };
}
