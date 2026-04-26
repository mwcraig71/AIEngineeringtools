/**
 * Structural analysis engine for simple and continuous beam bridges.
 *
 * Simple spans: closed-form solutions.
 * Continuous spans: three-moment equation (Clapeyron) for uniform loads,
 *   influence-line based placement for moving point loads.
 */

const ANALYSIS_POINTS = 200; // resolution per span

// ============================================================
// Simple span helpers
// ============================================================

function simpleBeamUniformMomentShear(L, w, nPts) {
  const dx = L / nPts;
  const moments = [];
  const shears = [];
  const positions = [];
  for (let i = 0; i <= nPts; i++) {
    const x = i * dx;
    positions.push(x);
    // M(x) = w*x*(L-x)/2
    moments.push(w * x * (L - x) / 2);
    // V(x) = w*(L/2 - x)
    shears.push(w * (L / 2 - x));
  }
  return { positions, moments, shears };
}

function simpleBeamPointLoadMomentShear(L, P, a, nPts) {
  // Point load P at distance a from left support
  const b = L - a;
  const RL = P * b / L;
  const RR = P * a / L;
  const dx = L / nPts;
  const moments = [];
  const shears = [];
  const positions = [];
  for (let i = 0; i <= nPts; i++) {
    const x = i * dx;
    positions.push(x);
    if (x <= a) {
      moments.push(RL * x);
      shears.push(RL);
    } else {
      moments.push(RR * (L - x));
      shears.push(-RR);
    }
  }
  return { positions, moments, shears };
}

// ============================================================
// Continuous beam solver (three-moment equation for uniform load)
// ============================================================

function solveContinuousUniform(spans, w) {
  // Uniform load on ALL spans (used for dead load)
  const wPerSpan = spans.map(() => w);
  return solveContinuousVariableUniform(spans, wPerSpan);
}

/**
 * Solve continuous beam with potentially different uniform load on each span.
 * wPerSpan[i] = uniform load intensity on span i (can be 0 for unloaded spans).
 */
function solveContinuousVariableUniform(spans, wPerSpan) {
  const n = spans.length;
  if (n === 1) {
    return solveSimpleSpanUniform(spans[0], wPerSpan[0]);
  }

  const numInterior = n - 1;
  const A = Array.from({ length: numInterior }, () => new Float64Array(numInterior));
  const B = new Float64Array(numInterior);

  for (let i = 0; i < numInterior; i++) {
    const Li = spans[i];
    const Li1 = spans[i + 1];
    const wi = wPerSpan[i];
    const wi1 = wPerSpan[i + 1];
    A[i][i] = 2 * (Li + Li1);
    if (i > 0) A[i][i - 1] = Li;
    if (i < numInterior - 1) A[i][i + 1] = Li1;
    B[i] = -wi / 4 * (Li * Li * Li) - wi1 / 4 * (Li1 * Li1 * Li1);
  }

  const M = solveTridiagonal(A, B, numInterior);
  const supportMoments = [0, ...M, 0];

  const allPositions = [];
  const allMoments = [];
  const allShears = [];
  let xOffset = 0;

  for (let s = 0; s < n; s++) {
    const L = spans[s];
    const w = wPerSpan[s];
    const Ma = supportMoments[s];
    const Mb = supportMoments[s + 1];
    const nPts = ANALYSIS_POINTS;
    const dx = L / nPts;

    const RL = w * L / 2 + (Ma - Mb) / L;

    for (let i = 0; i <= nPts; i++) {
      if (s > 0 && i === 0) continue;
      const x = i * dx;
      allPositions.push(xOffset + x);
      const Mx = Ma + RL * x - w * x * x / 2;
      allMoments.push(Mx);
      allShears.push(RL - w * x);
    }
    xOffset += L;
  }

  return { positions: allPositions, moments: allMoments, shears: allShears, supportMoments };
}

function solveSimpleSpanUniform(L, w) {
  const r = simpleBeamUniformMomentShear(L, w, ANALYSIS_POINTS);
  r.supportMoments = [0, 0];
  return r;
}

function solveTridiagonal(A, B, n) {
  // Thomas algorithm for tridiagonal system
  const a = new Float64Array(n); // sub-diagonal
  const b = new Float64Array(n); // diagonal
  const c = new Float64Array(n); // super-diagonal
  const d = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    b[i] = A[i][i];
    if (i > 0) a[i] = A[i][i - 1];
    if (i < n - 1) c[i] = A[i][i + 1];
    d[i] = B[i];
  }

  // Forward sweep
  for (let i = 1; i < n; i++) {
    const m = a[i] / b[i - 1];
    b[i] -= m * c[i - 1];
    d[i] -= m * d[i - 1];
  }

  // Back substitution
  const x = new Float64Array(n);
  x[n - 1] = d[n - 1] / b[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    x[i] = (d[i] - c[i] * x[i + 1]) / b[i];
  }
  return Array.from(x);
}

// ============================================================
// Lane load pattern loading envelope for continuous spans
// Per AASHTO, lane load must be pattern-loaded (applied to
// selected spans) to maximize/minimize force effects.
// ============================================================

function laneLoadPatternEnvelope(spans, laneLoadW, nPts) {
  const n = spans.length;
  if (n === 1) {
    const r = simpleBeamUniformMomentShear(spans[0], laneLoadW, nPts);
    return {
      positions: r.positions,
      maxMoments: r.moments.slice(),
      minMoments: r.moments.map(() => 0),
      maxShears: r.shears.slice(),
      minShears: r.shears.map(v => Math.min(v, 0))
    };
  }

  // For n spans, enumerate all 2^n load patterns (each span loaded or not)
  // Skip the all-unloaded case (pattern 0)
  const numPatterns = 1 << n;

  // Get positions from a reference solution
  const refW = spans.map(() => laneLoadW);
  const ref = solveContinuousVariableUniform(spans, refW);
  const totalPts = ref.positions.length;

  const maxMoments = new Float64Array(totalPts).fill(-Infinity);
  const minMoments = new Float64Array(totalPts).fill(Infinity);
  const maxShears = new Float64Array(totalPts).fill(-Infinity);
  const minShears = new Float64Array(totalPts).fill(Infinity);

  for (let pat = 0; pat < numPatterns; pat++) {
    const wPerSpan = [];
    for (let s = 0; s < n; s++) {
      wPerSpan.push((pat & (1 << s)) ? laneLoadW : 0);
    }

    let result;
    if (pat === 0) {
      // All unloaded — zero effects (still valid as a pattern: no live load)
      for (let i = 0; i < totalPts; i++) {
        if (0 > maxMoments[i]) maxMoments[i] = 0;
        if (0 < minMoments[i]) minMoments[i] = 0;
        if (0 > maxShears[i]) maxShears[i] = 0;
        if (0 < minShears[i]) minShears[i] = 0;
      }
      continue;
    }

    result = solveContinuousVariableUniform(spans, wPerSpan);

    for (let i = 0; i < totalPts; i++) {
      const M = result.moments[i];
      const V = result.shears[i];
      if (M > maxMoments[i]) maxMoments[i] = M;
      if (M < minMoments[i]) minMoments[i] = M;
      if (V > maxShears[i]) maxShears[i] = V;
      if (V < minShears[i]) minShears[i] = V;
    }
  }

  return {
    positions: ref.positions,
    maxMoments: Array.from(maxMoments),
    minMoments: Array.from(minMoments),
    maxShears: Array.from(maxShears),
    minShears: Array.from(minShears)
  };
}

// ============================================================
// Moving load (truck) envelope for simple span
// ============================================================

function truckEnvelopeSimple(L, axles, nPts, impactFactor) {
  const dx = L / nPts;
  const maxMoments = new Float64Array(nPts + 1);
  const minMoments = new Float64Array(nPts + 1);
  const maxShears = new Float64Array(nPts + 1);
  const minShears = new Float64Array(nPts + 1);

  // Truck length
  const truckLen = axles[axles.length - 1].position;

  // Move truck across bridge: front axle from -truckLen to L
  const stepSize = 0.5; // ft
  const nSteps = Math.ceil((L + truckLen) / stepSize);

  for (let step = 0; step <= nSteps; step++) {
    const frontPos = -truckLen + step * stepSize; // position of front axle

    // Compute reactions and effects for this truck position
    for (let i = 0; i <= nPts; i++) {
      const x = i * dx;
      let M = 0;
      let V = 0;

      for (const axle of axles) {
        const axlePos = frontPos + (truckLen - axle.position); // position on bridge
        if (axlePos < 0 || axlePos > L) continue;

        const res = pointLoadEffects(L, axle.weight, axlePos, x);
        M += res.moment;
        V += res.shear;
      }

      // Apply impact factor
      M *= (1 + impactFactor);
      V *= (1 + impactFactor);

      if (step === 0) {
        maxMoments[i] = M;
        minMoments[i] = M;
        maxShears[i] = V;
        minShears[i] = V;
      } else {
        if (M > maxMoments[i]) maxMoments[i] = M;
        if (M < minMoments[i]) minMoments[i] = M;
        if (V > maxShears[i]) maxShears[i] = V;
        if (V < minShears[i]) minShears[i] = V;
      }
    }
  }

  const positions = [];
  for (let i = 0; i <= nPts; i++) positions.push(i * dx);

  return {
    positions,
    maxMoments: Array.from(maxMoments),
    minMoments: Array.from(minMoments),
    maxShears: Array.from(maxShears),
    minShears: Array.from(minShears)
  };
}

function pointLoadEffects(L, P, a, x) {
  const b = L - a;
  const RL = P * b / L;
  const RR = P * a / L;
  let moment, shear;
  if (x <= a) {
    moment = RL * x;
    shear = RL;
  } else {
    moment = RR * (L - x);
    shear = -RR;
  }
  return { moment, shear };
}

// ============================================================
// Moving load envelope for continuous spans
// ============================================================

function truckEnvelopeContinuous(spans, axles, nPts, impactFactor) {
  const totalLength = spans.reduce((a, b) => a + b, 0);
  const n = spans.length;

  // Build influence lines by placing a unit load at each analysis point
  // For each point x along the bridge, IL_M(x, loadPos) and IL_V(x, loadPos)
  // We use direct stiffness / three-moment approach

  const totalPts = n * nPts + 1;
  const dx = totalLength / (totalPts - 1);
  const positions = [];
  for (let i = 0; i < totalPts; i++) positions.push(i * dx);

  const maxMoments = new Float64Array(totalPts).fill(-Infinity);
  const minMoments = new Float64Array(totalPts).fill(Infinity);
  const maxShears = new Float64Array(totalPts).fill(-Infinity);
  const minShears = new Float64Array(totalPts).fill(Infinity);

  const truckLen = axles[axles.length - 1].position;
  const stepSize = 0.5;
  const nSteps = Math.ceil((totalLength + truckLen) / stepSize);

  for (let step = 0; step <= nSteps; step++) {
    const frontPos = -truckLen + step * stepSize;

    // Collect point loads on the bridge
    const loads = [];
    for (const axle of axles) {
      const pos = frontPos + (truckLen - axle.position);
      if (pos >= 0 && pos <= totalLength) {
        loads.push({ P: axle.weight * (1 + impactFactor), pos });
      }
    }
    if (loads.length === 0) continue;

    // Solve for this load case using superposition of point loads
    const result = solveContinuousPointLoads(spans, loads, nPts);

    for (let i = 0; i < totalPts; i++) {
      const M = result.moments[i] || 0;
      const V = result.shears[i] || 0;
      if (M > maxMoments[i]) maxMoments[i] = M;
      if (M < minMoments[i]) minMoments[i] = M;
      if (V > maxShears[i]) maxShears[i] = V;
      if (V < minShears[i]) minShears[i] = V;
    }
  }

  // Ensure zero is included in envelope (no-load case)
  for (let i = 0; i < totalPts; i++) {
    if (maxMoments[i] === -Infinity) maxMoments[i] = 0;
    if (minMoments[i] === Infinity) minMoments[i] = 0;
    if (maxShears[i] === -Infinity) maxShears[i] = 0;
    if (minShears[i] === Infinity) minShears[i] = 0;
  }

  return {
    positions,
    maxMoments: Array.from(maxMoments),
    minMoments: Array.from(minMoments),
    maxShears: Array.from(maxShears),
    minShears: Array.from(minShears)
  };
}

/**
 * Solve continuous beam with point loads using three-moment equation.
 */
function solveContinuousPointLoads(spans, loads, ptsPerSpan) {
  const n = spans.length;
  const numInterior = n - 1;

  // For each interior support, sum contributions from point loads
  // Three-moment with point loads:
  // M_{i-1}*L_i + 2*M_i*(L_i+L_{i+1}) + M_{i+1}*L_{i+1} =
  //   -sum over loads in span i: P_k*b_k*(L_i^2 - b_k^2) / L_i
  //   -sum over loads in span i+1: P_k*a_k*(L_{i+1}^2 - a_k^2) / L_{i+1}

  if (numInterior === 0) {
    // Simple span
    return solveSingleSpanPointLoads(spans[0], loads, ptsPerSpan);
  }

  const A = Array.from({ length: numInterior }, () => new Float64Array(numInterior));
  const B = new Float64Array(numInterior);

  // Determine which span each load falls in
  const spanStarts = [0];
  for (let s = 0; s < n; s++) spanStarts.push(spanStarts[s] + spans[s]);

  for (let i = 0; i < numInterior; i++) {
    const Li = spans[i];
    const Li1 = spans[i + 1];
    A[i][i] = 2 * (Li + Li1);
    if (i > 0) A[i][i - 1] = Li;
    if (i < numInterior - 1) A[i][i + 1] = Li1;

    let rhs = 0;
    // Loads in span i (left of support i+1)
    for (const ld of loads) {
      if (ld.pos >= spanStarts[i] && ld.pos <= spanStarts[i + 1]) {
        const a_k = ld.pos - spanStarts[i];
        const b_k = Li - a_k;
        rhs -= ld.P * b_k * (Li * Li - b_k * b_k) / (6 * Li);
      }
    }
    // Loads in span i+1 (right of support i+1)
    for (const ld of loads) {
      if (ld.pos >= spanStarts[i + 1] && ld.pos <= spanStarts[i + 2]) {
        const a_k = ld.pos - spanStarts[i + 1];
        rhs -= ld.P * a_k * (Li1 * Li1 - a_k * a_k) / (6 * Li1);
      }
    }
    B[i] = rhs;
  }

  const M = numInterior > 0 ? solveTridiagonal(A, B, numInterior) : [];
  const supportMoments = [0, ...M, 0];

  // Compute moment and shear at analysis points
  const allPositions = [];
  const allMoments = [];
  const allShears = [];
  let xOffset = 0;

  for (let s = 0; s < n; s++) {
    const L = spans[s];
    const Ma = supportMoments[s];
    const Mb = supportMoments[s + 1];
    const nP = ptsPerSpan;
    const dx = L / nP;

    // Base reaction from support moments
    let RL = (Ma - Mb) / L;
    // Add point load contributions to left reaction
    for (const ld of loads) {
      if (ld.pos >= spanStarts[s] && ld.pos <= spanStarts[s + 1]) {
        const a_k = ld.pos - spanStarts[s];
        RL += ld.P * (L - a_k) / L;
      }
    }

    for (let i = 0; i <= nP; i++) {
      if (s > 0 && i === 0) continue;
      const x = i * dx;
      const xGlobal = xOffset + x;
      allPositions.push(xGlobal);

      let Mx = Ma + RL * x;
      let Vx = RL;

      // Subtract point loads that have been passed
      for (const ld of loads) {
        if (ld.pos >= spanStarts[s] && ld.pos <= spanStarts[s + 1]) {
          const a_k = ld.pos - spanStarts[s];
          if (x > a_k) {
            Mx -= ld.P * (x - a_k);
            Vx -= ld.P;
          }
        }
      }

      allMoments.push(Mx);
      allShears.push(Vx);
    }
    xOffset += L;
  }

  return { positions: allPositions, moments: allMoments, shears: allShears };
}

function solveSingleSpanPointLoads(L, loads, nPts) {
  const dx = L / nPts;
  const positions = [];
  const moments = new Float64Array(nPts + 1);
  const shears = new Float64Array(nPts + 1);

  for (let i = 0; i <= nPts; i++) {
    positions.push(i * dx);
    const x = i * dx;
    for (const ld of loads) {
      if (ld.pos < 0 || ld.pos > L) continue;
      const res = pointLoadEffects(L, ld.P, ld.pos, x);
      moments[i] += res.moment;
      shears[i] += res.shear;
    }
  }

  return { positions, moments: Array.from(moments), shears: Array.from(shears) };
}

// ============================================================
// AASHTO 3.6.1.3.1 dual-truck case for continuous spans
// 90% of two design trucks (min 50 ft headway) + 90% lane load
// Governs negative moment at interior piers of continuous spans.
// ============================================================

function dualTruckEnvelopeContinuous(spans, truckDef, nPts, impactFactor) {
  const n = spans.length;
  if (n < 2) return null; // only applies to continuous spans

  const totalLength = spans.reduce((a, b) => a + b, 0);
  const totalPts = n * nPts + 1;
  const dx = totalLength / (totalPts - 1);

  const maxMoments = new Float64Array(totalPts).fill(-Infinity);
  const minMoments = new Float64Array(totalPts).fill(Infinity);
  const maxShears = new Float64Array(totalPts).fill(-Infinity);
  const minShears = new Float64Array(totalPts).fill(Infinity);

  // Sweep variable spacing for both trucks
  const sMin = truckDef.variableSpacing ? truckDef.variableSpacing.min : 0;
  const sMax = truckDef.variableSpacing ? truckDef.variableSpacing.max : 0;
  const spacings = truckDef.variableSpacing
    ? Array.from({ length: Math.floor((sMax - sMin) / 2) + 1 }, (_, i) => sMin + i * 2)
    : [0];

  const MIN_HEADWAY = 50; // ft minimum between rear axle of front truck and front axle of rear truck
  const stepSize = 2.0; // coarser step for dual-truck (performance)

  for (const sp of spacings) {
    const axles = truckDef.variableSpacing ? getTruckAxles(truckDef, sp) : truckDef.axles;
    const truckLen = axles[axles.length - 1].position;

    // Truck 1 (leading, further right) sweeps across bridge
    const nSteps1 = Math.ceil((totalLength + truckLen) / stepSize);

    for (let s1 = 0; s1 <= nSteps1; s1++) {
      const front1 = -truckLen + s1 * stepSize;
      // In our coordinate system, front1 is the leftmost (rear) axle of truck 1.
      // The front axle of truck 1 is at front1 + truckLen.
      // The 50-ft headway is measured from truck 1's rear axle (front1) to
      // truck 2's front axle (front2 + truckLen).
      // Constraint: front1 - (front2 + truckLen) >= MIN_HEADWAY
      const front2Max = front1 - MIN_HEADWAY - truckLen;
      // Only sweep truck 2 where it has axles on the bridge
      const front2Start = Math.max(-truckLen, front2Max - totalLength);

      for (let front2 = front2Start; front2 <= front2Max; front2 += stepSize) {

        // Collect all loads from both trucks, scaled by 0.90 and impact
        const loads = [];
        const scale = 0.90 * (1 + impactFactor);
        for (const axle of axles) {
          const pos1 = front1 + (truckLen - axle.position);
          if (pos1 >= 0 && pos1 <= totalLength) {
            loads.push({ P: axle.weight * scale, pos: pos1 });
          }
          const pos2 = front2 + (truckLen - axle.position);
          if (pos2 >= 0 && pos2 <= totalLength) {
            loads.push({ P: axle.weight * scale, pos: pos2 });
          }
        }
        if (loads.length < 2) continue; // need at least one axle from each truck

        const result = solveContinuousPointLoads(spans, loads, nPts);

        for (let i = 0; i < totalPts; i++) {
          const M = result.moments[i] || 0;
          const V = result.shears[i] || 0;
          if (M > maxMoments[i]) maxMoments[i] = M;
          if (M < minMoments[i]) minMoments[i] = M;
          if (V > maxShears[i]) maxShears[i] = V;
          if (V < minShears[i]) minShears[i] = V;
        }
      }
    }
  }

  // Ensure zero baseline
  for (let i = 0; i < totalPts; i++) {
    if (maxMoments[i] === -Infinity) maxMoments[i] = 0;
    if (minMoments[i] === Infinity) minMoments[i] = 0;
    if (maxShears[i] === -Infinity) maxShears[i] = 0;
    if (minShears[i] === Infinity) minShears[i] = 0;
  }

  const positions = [];
  for (let i = 0; i < totalPts; i++) positions.push(i * dx);

  return {
    positions,
    maxMoments: Array.from(maxMoments),
    minMoments: Array.from(minMoments),
    maxShears: Array.from(maxShears),
    minShears: Array.from(minShears)
  };
}

// ============================================================
// Full analysis: combines dead load + truck envelope + lane load
// ============================================================

function runFullAnalysis(spans, deadLoadW, wearingSurfaceW, truckDef, impactFactor, laneLoadW) {
  const isSimple = spans.length === 1;
  const totalW = deadLoadW + wearingSurfaceW;

  // 1. Dead load (uniform) — no impact factor
  let deadResult;
  if (isSimple) {
    deadResult = simpleBeamUniformMomentShear(spans[0], totalW, ANALYSIS_POINTS);
    deadResult.supportMoments = [0, 0];
  } else {
    deadResult = solveContinuousUniform(spans, totalW);
  }

  // 2. Lane load — pattern loaded for continuous spans, uniform for simple
  // Per AASHTO, lane load must be applied to selected spans to maximize effects
  let laneEnv;
  if (isSimple) {
    const lr = simpleBeamUniformMomentShear(spans[0], laneLoadW, ANALYSIS_POINTS);
    laneEnv = {
      positions: lr.positions,
      maxMoments: lr.moments.slice(),
      minMoments: lr.moments.map(() => 0),
      maxShears: lr.shears.slice(),
      minShears: lr.shears.map(v => Math.min(v, 0))
    };
  } else {
    laneEnv = laneLoadPatternEnvelope(spans, laneLoadW, ANALYSIS_POINTS);
  }

  // 3. Truck envelope — with impact factor
  // AASHTO requires enveloping across the full variable rear-axle spacing range (14-30 ft)
  let truckEnv;
  if (truckDef.variableSpacing) {
    const { min: sMin, max: sMax } = truckDef.variableSpacing;
    const spacingStep = 2;
    let firstPass = true;
    for (let sp = sMin; sp <= sMax; sp += spacingStep) {
      const axlesAtSpacing = getTruckAxles(truckDef, sp);
      let env;
      if (isSimple) {
        env = truckEnvelopeSimple(spans[0], axlesAtSpacing, ANALYSIS_POINTS, impactFactor);
      } else {
        env = truckEnvelopeContinuous(spans, axlesAtSpacing, ANALYSIS_POINTS, impactFactor);
      }
      if (firstPass) {
        truckEnv = env;
        firstPass = false;
      } else {
        for (let i = 0; i < env.maxMoments.length; i++) {
          if (env.maxMoments[i] > truckEnv.maxMoments[i]) truckEnv.maxMoments[i] = env.maxMoments[i];
          if (env.minMoments[i] < truckEnv.minMoments[i]) truckEnv.minMoments[i] = env.minMoments[i];
          if (env.maxShears[i] > truckEnv.maxShears[i]) truckEnv.maxShears[i] = env.maxShears[i];
          if (env.minShears[i] < truckEnv.minShears[i]) truckEnv.minShears[i] = env.minShears[i];
        }
      }
    }
  } else {
    const truckAxles = getTruckAxles(truckDef, undefined);
    if (isSimple) {
      truckEnv = truckEnvelopeSimple(spans[0], truckAxles, ANALYSIS_POINTS, impactFactor);
    } else {
      truckEnv = truckEnvelopeContinuous(spans, truckAxles, ANALYSIS_POINTS, impactFactor);
    }
  }

  // 4. Tandem envelope — with impact factor
  let tandemEnv = null;
  const tandemAxles = getTandemAxles(truckDef);
  if (tandemAxles) {
    if (isSimple) {
      tandemEnv = truckEnvelopeSimple(spans[0], tandemAxles, ANALYSIS_POINTS, impactFactor);
    } else {
      tandemEnv = truckEnvelopeContinuous(spans, tandemAxles, ANALYSIS_POINTS, impactFactor);
    }
  }

  // 5. AASHTO 3.6.1.3.1 dual-truck case for continuous spans
  // 90% of two trucks (min 50 ft headway) + 90% lane load
  let dualTruckEnv = null;
  if (!isSimple) {
    dualTruckEnv = dualTruckEnvelopeContinuous(spans, truckDef, ANALYSIS_POINTS, impactFactor);
  }

  // 6. HL-93 combination: max of (truck+lane, tandem+lane, dual-truck+0.9*lane)
  const nPts = deadResult.positions.length;
  const combinedMaxMoments = [];
  const combinedMinMoments = [];
  const combinedMaxShears = [];
  const combinedMinShears = [];

  for (let i = 0; i < nPts; i++) {
    // Case 1: Truck + lane (pattern-loaded)
    let maxM = truckEnv.maxMoments[i] + laneEnv.maxMoments[i];
    let minM = truckEnv.minMoments[i] + laneEnv.minMoments[i];
    let maxV = truckEnv.maxShears[i] + laneEnv.maxShears[i];
    let minV = truckEnv.minShears[i] + laneEnv.minShears[i];

    // Case 2: Tandem + lane (pattern-loaded)
    if (tandemEnv) {
      const maxM_t = tandemEnv.maxMoments[i] + laneEnv.maxMoments[i];
      const minM_t = tandemEnv.minMoments[i] + laneEnv.minMoments[i];
      const maxV_t = tandemEnv.maxShears[i] + laneEnv.maxShears[i];
      const minV_t = tandemEnv.minShears[i] + laneEnv.minShears[i];

      maxM = Math.max(maxM, maxM_t);
      minM = Math.min(minM, minM_t);
      maxV = Math.max(maxV, maxV_t);
      minV = Math.min(minV, minV_t);
    }

    // Case 3: Dual-truck (already 0.90 scaled) + 0.90 * lane envelope
    if (dualTruckEnv) {
      const maxM_d = dualTruckEnv.maxMoments[i] + 0.90 * laneEnv.maxMoments[i];
      const minM_d = dualTruckEnv.minMoments[i] + 0.90 * laneEnv.minMoments[i];
      const maxV_d = dualTruckEnv.maxShears[i] + 0.90 * laneEnv.maxShears[i];
      const minV_d = dualTruckEnv.minShears[i] + 0.90 * laneEnv.minShears[i];

      maxM = Math.max(maxM, maxM_d);
      minM = Math.min(minM, minM_d);
      maxV = Math.max(maxV, maxV_d);
      minV = Math.min(minV, minV_d);
    }

    // Total = dead + live envelope
    combinedMaxMoments.push(deadResult.moments[i] + maxM);
    combinedMinMoments.push(deadResult.moments[i] + minM);
    combinedMaxShears.push(deadResult.shears[i] + maxV);
    combinedMinShears.push(deadResult.shears[i] + minV);
  }

  // Find critical values
  const maxMoment = Math.max(...combinedMaxMoments);
  const minMoment = Math.min(...combinedMinMoments);
  const maxShear = Math.max(...combinedMaxShears);
  const minShear = Math.min(...combinedMinShears);

  return {
    positions: deadResult.positions,
    dead: deadResult,
    laneEnvelope: laneEnv,
    truckEnvelope: truckEnv,
    tandemEnvelope: tandemEnv,
    dualTruckEnvelope: dualTruckEnv,
    combinedMaxMoments,
    combinedMinMoments,
    combinedMaxShears,
    combinedMinShears,
    maxMoment,
    minMoment,
    maxShear,
    minShear,
    spans
  };
}
