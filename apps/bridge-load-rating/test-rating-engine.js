/**
 * QA Test Suite for RC Tee Beam Load Rating Engine
 * Tests numerical accuracy, deterioration, edge cases, cross-method consistency, and pass/fail logic.
 * Run with: node test-rating-engine.js
 */

// Load dependencies in order
const fs = require('fs');
const vm = require('vm');

const context = vm.createContext({
  Math, Array, Float64Array, Infinity, console, parseInt, parseFloat,
  Object, Number, isFinite, NaN, undefined, null: null, true: true, false: false
});

// Load files in dependency order
const files = [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'rating-engine.js'
];

for (const f of files) {
  const code = fs.readFileSync(__dirname + '/' + f, 'utf8');
  // Wrap in IIFE that assigns to this (context global) since const/function are block-scoped
  vm.runInContext(`(function() { ${code} \n
    // Export all declarations to global context
    if (typeof TRUCKS !== 'undefined') this.TRUCKS = TRUCKS;
    if (typeof ANALYSIS_POINTS !== 'undefined') this.ANALYSIS_POINTS = ANALYSIS_POINTS;
    if (typeof REBAR_AREAS !== 'undefined') this.REBAR_AREAS = REBAR_AREAS;
    if (typeof REBAR_DIAMETERS !== 'undefined') this.REBAR_DIAMETERS = REBAR_DIAMETERS;
    if (typeof LRFR_FACTORS !== 'undefined') this.LRFR_FACTORS = LRFR_FACTORS;
    if (typeof getTruckAxles !== 'undefined') this.getTruckAxles = getTruckAxles;
    if (typeof getTandemAxles !== 'undefined') this.getTandemAxles = getTandemAxles;
    if (typeof getTruckInfoHTML !== 'undefined') this.getTruckInfoHTML = getTruckInfoHTML;
    if (typeof simpleBeamUniformMomentShear !== 'undefined') this.simpleBeamUniformMomentShear = simpleBeamUniformMomentShear;
    if (typeof simpleBeamPointLoadMomentShear !== 'undefined') this.simpleBeamPointLoadMomentShear = simpleBeamPointLoadMomentShear;
    if (typeof truckEnvelopeSimple !== 'undefined') this.truckEnvelopeSimple = truckEnvelopeSimple;
    if (typeof pointLoadEffects !== 'undefined') this.pointLoadEffects = pointLoadEffects;
    if (typeof computeGrossSection !== 'undefined') this.computeGrossSection = computeGrossSection;
    if (typeof computeEffectiveRebar !== 'undefined') this.computeEffectiveRebar = computeEffectiveRebar;
    if (typeof computeRebarTotals !== 'undefined') this.computeRebarTotals = computeRebarTotals;
    if (typeof computeMn !== 'undefined') this.computeMn = computeMn;
    if (typeof computeBeta1 !== 'undefined') this.computeBeta1 = computeBeta1;
    if (typeof computeVn !== 'undefined') this.computeVn = computeVn;
    if (typeof computeDeadLoadDemand !== 'undefined') this.computeDeadLoadDemand = computeDeadLoadDemand;
    if (typeof computeLRFR !== 'undefined') this.computeLRFR = computeLRFR;
    if (typeof computeLFR !== 'undefined') this.computeLFR = computeLFR;
    if (typeof computeASR !== 'undefined') this.computeASR = computeASR;
    if (typeof computeLiveLoadDemand !== 'undefined') this.computeLiveLoadDemand = computeLiveLoadDemand;
    if (typeof runLoadRating !== 'undefined') this.runLoadRating = runLoadRating;
  }).call(this);`, context);
}

// Extract via context
const computeGrossSection = context.computeGrossSection;
const computeEffectiveRebar = context.computeEffectiveRebar;
const computeRebarTotals = context.computeRebarTotals;
const computeMn = context.computeMn;
const computeBeta1 = context.computeBeta1;
const computeVn = context.computeVn;
const computeDeadLoadDemand = context.computeDeadLoadDemand;
const computeLRFR = context.computeLRFR;
const computeLFR = context.computeLFR;
const computeASR = context.computeASR;
const computeLiveLoadDemand = context.computeLiveLoadDemand;
const runLoadRating = context.runLoadRating;
const REBAR_AREAS = context.REBAR_AREAS;
const REBAR_DIAMETERS = context.REBAR_DIAMETERS;
const LRFR_FACTORS = context.LRFR_FACTORS;
const TRUCKS = context.TRUCKS;
const ANALYSIS_POINTS = context.ANALYSIS_POINTS;

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) <= tol;
  if (ok) {
    passed++;
  } else {
    failed++;
    const detail = `${msg} — expected ${expected}, got ${actual} (tol=${tol})`;
    failures.push(detail);
    console.log(`  FAIL: ${detail}`);
  }
}

// =================================================================
// 1. SECTION PROPERTY TESTS
// =================================================================
console.log('\n=== 1. Section Properties ===');

{
  // Tee beam: bf=48, hf=7, bw=14, h=30
  const s = computeGrossSection(48, 7, 14, 30);

  // Manual: Af = 48*7 = 336, Aw = 14*23 = 322, Ag = 658
  assertClose(s.Ag, 658, 0.1, 'Gross area Ag');
  assertClose(s.Af, 336, 0.1, 'Flange area');
  assertClose(s.Aw, 322, 0.1, 'Web area');
  assertClose(s.hw, 23, 0.1, 'Web height');

  // yf = 3.5, yw = 7 + 23/2 = 18.5
  // yt = (336*3.5 + 322*18.5) / 658 = (1176 + 5957) / 658 = 10.838
  assertClose(s.yt, 10.838, 0.01, 'Neutral axis yt');
  assertClose(s.yb, 30 - 10.838, 0.01, 'Neutral axis yb');

  // Ig = bf*hf^3/12 + Af*(yt-yf)^2 + bw*hw^3/12 + Aw*(yt-yw)^2
  const Ig_manual = 48*343/12 + 336*(10.838-3.5)**2 + 14*12167/12 + 322*(10.838-18.5)**2;
  assertClose(s.Ig, Ig_manual, 1, 'Moment of inertia Ig');

  assertClose(s.St, s.Ig / s.yt, 0.1, 'Top section modulus St');
  assertClose(s.Sb, s.Ig / s.yb, 0.1, 'Bottom section modulus Sb');
}

// Rectangular section (hf=h, acts like rectangle)
{
  const s = computeGrossSection(14, 30, 14, 30);
  assertClose(s.Ag, 14*30, 0.1, 'Rectangular section Ag');
  assertClose(s.yt, 15.0, 0.01, 'Rectangular section yt');
  assertClose(s.Ig, 14*30*30*30/12, 1, 'Rectangular Ig = bh^3/12');
}

// =================================================================
// 2. REBAR DETERIORATION TESTS
// =================================================================
console.log('\n=== 2. Rebar Deterioration ===');

{
  // 0% loss
  const layers0 = computeEffectiveRebar([{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }]);
  assertClose(layers0[0].effectiveAs, 4 * 0.79, 0.001, '0% loss: full As');

  // 50% loss
  const layers50 = computeEffectiveRebar([{ barSize: 8, count: 4, depth: 27, lossPercent: 50 }]);
  assertClose(layers50[0].effectiveAs, 4 * 0.79 * 0.5, 0.001, '50% loss: half As');

  // 100% loss
  const layers100 = computeEffectiveRebar([{ barSize: 8, count: 4, depth: 27, lossPercent: 100 }]);
  assertClose(layers100[0].effectiveAs, 0, 0.001, '100% loss: zero As');

  // Multiple layers with different losses
  const multiLayers = computeEffectiveRebar([
    { barSize: 8, count: 4, depth: 27, lossPercent: 0 },
    { barSize: 6, count: 2, depth: 24, lossPercent: 25 }
  ]);
  assertClose(multiLayers[0].effectiveAs, 3.16, 0.01, 'Multi-layer: layer 1 As');
  assertClose(multiLayers[1].effectiveAs, 2 * 0.44 * 0.75, 0.01, 'Multi-layer: layer 2 As (25% loss)');

  // Centroid computation
  const totals = computeRebarTotals(multiLayers);
  const expectedAs = 3.16 + 0.66;
  const expectedD = (3.16 * 27 + 0.66 * 24) / expectedAs;
  assertClose(totals.totalAs, expectedAs, 0.01, 'Multi-layer total As');
  assertClose(totals.d, expectedD, 0.1, 'Multi-layer weighted centroid d');
}

// Deterioration proportionality: RF should decrease with increased loss
{
  console.log('\n--- Deterioration RF proportionality ---');
  const baseParams = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };

  const losses = [0, 25, 50, 75, 100];
  const rfs = [];
  for (const loss of losses) {
    const params = { ...baseParams, rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: loss }] };
    const r = runLoadRating(params);
    const rf = r.lrfr.design_inventory.rfMoment;
    rfs.push(rf);
  }

  // RF should monotonically decrease
  for (let i = 1; i < rfs.length - 1; i++) {
    assert(rfs[i] < rfs[i-1], `RF decreases: ${losses[i]}% loss RF(${rfs[i].toFixed(3)}) < ${losses[i-1]}% loss RF(${rfs[i-1].toFixed(3)})`);
  }
  // 100% loss: zero capacity but dead load remains, so RF is negative
  assert(rfs[rfs.length - 1] < 0, '100% loss gives RF < 0 (dead load exceeds zero capacity)');

  console.log(`  Deterioration RFs: ${rfs.map(r => r.toFixed(3)).join(', ')}`);
}

// =================================================================
// 3. FLEXURAL CAPACITY (Mn) TESTS
// =================================================================
console.log('\n=== 3. Flexural Capacity ===');

{
  // beta1 tests
  assertClose(computeBeta1(3000), 0.85, 0.001, 'beta1 at 3000 psi');
  assertClose(computeBeta1(4000), 0.85, 0.001, 'beta1 at 4000 psi');
  assertClose(computeBeta1(5000), 0.80, 0.001, 'beta1 at 5000 psi');
  assertClose(computeBeta1(6000), 0.75, 0.001, 'beta1 at 6000 psi');
  assertClose(computeBeta1(8000), 0.65, 0.001, 'beta1 at 8000 psi');
  assertClose(computeBeta1(10000), 0.65, 0.001, 'beta1 clamped at 10000 psi');

  // Known hand calc: bf=48, hf=7, bw=14, h=30, As=3.16 in^2, d=27, fc=3000, fy=60000
  // a = As*fy / (0.85*fc*bf) = 3.16*60000 / (0.85*3000*48) = 189600 / 122400 = 1.549 in
  // a <= hf=7, so rectangular behavior
  // Mn = As*fy*(d - a/2) = 3.16*60000*(27 - 0.7745) = 3.16*60000*26.2255 = 4,973,955 lb-in
  // Mn = 4,973,955 / 12000 = 414.5 kip-ft
  const mn = computeMn(3000, 60000, 48, 7, 14, 3.16, 27);
  assertClose(mn.a, 1.549, 0.01, 'Stress block depth a');
  assert(!mn.isFlange, 'Rectangular behavior (a < hf)');
  assertClose(mn.Mn, 414.5, 1.0, 'Mn ~ 414.5 kip-ft');
  assert(mn.phi === 0.90, 'phi = 0.90 for tension-controlled');

  // Test T-beam behavior with large As
  // As=10 in^2, d=27, fc=3000, fy=60000, bf=48, hf=7, bw=14
  // a_rect = 10*60000/(0.85*3000*48) = 600000/122400 = 4.902 -> still < 7, rectangular
  // Need more steel: As=20
  // a = 20*60000/(0.85*3000*48) = 1200000/122400 = 9.804 > hf=7 -> T-beam!
  const mnT = computeMn(3000, 60000, 48, 7, 14, 20, 27);
  assert(mnT.isFlange, 'T-beam behavior with large As');
  assert(mnT.a > 0, 'T-beam stress block a > 0');

  // Zero steel
  const mn0 = computeMn(3000, 60000, 48, 7, 14, 0, 27);
  assertClose(mn0.Mn, 0, 0.001, 'Zero steel gives Mn=0');
}

// =================================================================
// 4. SHEAR CAPACITY (Vn) TESTS
// =================================================================
console.log('\n=== 4. Shear Capacity ===');

{
  // fc=3000, bw=14, d=27, h=30, Av=2*0.20=0.40, s=12, fy=60000
  // dv = max(0.9*27, 0.72*30) = max(24.3, 21.6) = 24.3
  // Vc = 2*sqrt(3000)*14*24.3 = 2*54.772*14*24.3 = 37,266 lbs
  // Vs = 0.40*60000*24.3/12 = 48,600 lbs
  // VnMax = 0.25*3000*14*24.3 = 255,150 lbs
  // VsEff = min(48600, 255150-37266) = min(48600, 217884) = 48600
  // Vn = (37266 + 48600)/1000 = 85.866 kips
  const vn = computeVn(3000, 14, 27, 30, 0.40, 12, 60000);
  assertClose(vn.dv, 24.3, 0.01, 'Effective shear depth dv');
  assertClose(vn.Vc, 37.266, 0.5, 'Concrete shear Vc');
  assertClose(vn.Vs, 48.6, 0.5, 'Steel shear Vs');
  assertClose(vn.Vn, 85.866, 1.0, 'Total shear Vn');
  assertClose(vn.phi, 0.90, 0.001, 'Shear phi = 0.90');

  // No stirrups
  const vn0 = computeVn(3000, 14, 27, 30, 0, 0, 60000);
  assertClose(vn0.Vs, 0, 0.01, 'No stirrups: Vs=0');
  assert(vn0.Vn > 0, 'Vc still provides capacity with no stirrups');
}

// =================================================================
// 5. DEAD LOAD DEMAND TESTS
// =================================================================
console.log('\n=== 5. Dead Load Demand ===');

{
  // Simple span: M = wL^2/8, V = wL/2
  const dl = computeDeadLoadDemand(40, 0.5, 0.1);
  assertClose(dl.dcMoment, 0.5 * 40 * 40 / 8, 0.01, 'DC moment = wL^2/8');
  assertClose(dl.dcShear, 0.5 * 40 / 2, 0.01, 'DC shear = wL/2');
  assertClose(dl.dwMoment, 0.1 * 40 * 40 / 8, 0.01, 'DW moment');
  assertClose(dl.dwShear, 0.1 * 40 / 2, 0.01, 'DW shear');

  // Zero dead load
  const dl0 = computeDeadLoadDemand(40, 0, 0);
  assertClose(dl0.dcMoment, 0, 0.001, 'Zero DC: moment=0');
  assertClose(dl0.dwMoment, 0, 0.001, 'Zero DW: moment=0');
}

// =================================================================
// 6. LIVE LOAD INTEGRATION TESTS
// =================================================================
console.log('\n=== 6. Live Load Integration ===');

{
  // HL-93 on 40 ft span
  const ll = computeLiveLoadDemand(40, TRUCKS.AASHTO, 0.33, 0.64, 0.6);

  assert(ll.maxMoment > 0, 'Live load moment > 0');
  assert(ll.maxShear > 0, 'Live load shear > 0');
  assert(ll.truckMoment > 0, 'Truck moment > 0');
  assert(ll.laneMoment > 0, 'Lane moment > 0');
  assert(ll.lfrTruckM > 0, 'LFR truck moment > 0');
  assert(ll.lfrTruckV > 0, 'LFR truck shear > 0');

  // Lane moment for simple span: wL^2/8 * distFactor = 0.64*40^2/8*0.6 = 76.8 kip-ft
  // Wait, that's the moment at midspan. Let's check:
  // simpleBeamUniformMomentShear returns M(x) = w*x*(L-x)/2, max at midspan = wL^2/8
  // laneMaxM = 0.64*40*40/8 = 128 kip-ft, * distFactor=0.6 = 76.8
  assertClose(ll.laneMoment, 76.8, 1.0, 'Lane moment = wL^2/8 * g');

  // Lane shear: wL/2 * g = 0.64*40/2 * 0.6 = 7.68 kips
  assertClose(ll.laneShear, 7.68, 0.5, 'Lane shear = wL/2 * g');

  console.log(`  HL-93 40ft: M=${ll.maxMoment.toFixed(1)}, V=${ll.maxShear.toFixed(1)}, truckM=${ll.truckMoment.toFixed(1)}, laneM=${ll.laneMoment.toFixed(1)}`);
}

// =================================================================
// 7. LRFR RATING FACTOR TESTS
// =================================================================
console.log('\n=== 7. LRFR Rating Factors ===');

{
  // Hand calculation with known values
  const capacity = { phiMn: 373.0, phiVn: 77.3 };
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { maxMoment: 200, maxShear: 30 };

  // Design Inventory: gammaDC=1.25, gammaDW=1.50, gammaLL=1.75
  // RF_m = (1.0*1.0*373 - 1.25*100 - 1.50*20) / (1.75*200)
  //      = (373 - 125 - 30) / 350 = 218/350 = 0.623
  const lrfr = computeLRFR(capacity, deadLoads, liveLoads, 1.0, 1.0);
  assertClose(lrfr.design_inventory.rfMoment, 0.623, 0.002, 'LRFR inventory moment RF');

  // RF_v = (1.0*1.0*77.3 - 1.25*10 - 1.50*2) / (1.75*30)
  //      = (77.3 - 12.5 - 3) / 52.5 = 61.8/52.5 = 1.177
  assertClose(lrfr.design_inventory.rfShear, 1.177, 0.002, 'LRFR inventory shear RF');

  // Governing = min(0.623, 1.177) = 0.623, moment governs
  assertClose(lrfr.design_inventory.rf, 0.623, 0.002, 'LRFR inventory governing RF');
  assert(lrfr.design_inventory.governs === 'Moment', 'LRFR inventory: moment governs');
  assert(!lrfr.design_inventory.pass, 'LRFR inventory: RF < 1.0 -> FAIL');

  // Design Operating: gammaLL=1.35
  // RF_m = (373 - 125 - 30) / (1.35*200) = 218/270 = 0.807
  assertClose(lrfr.design_operating.rfMoment, 0.807, 0.002, 'LRFR operating moment RF');
}

// =================================================================
// 8. LFR RATING FACTOR TESTS
// =================================================================
console.log('\n=== 8. LFR Rating Factors ===');

{
  // Mn=414.5, Vn=85.9
  // D_moment = 100+20 = 120, D_shear = 10+2 = 12
  // lfrTruckM = 150, lfrTruckV = 25
  // impactFactor = 0.33
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  // Inventory: A1=1.3, A2=2.17
  // C_m = 0.90 * 414.5 = 373.05
  // RF_m = (373.05 - 1.3*120) / (2.17*150*(1+0.33)) = (373.05-156) / (2.17*150*1.33)
  //      = 217.05 / 432.915 = 0.5014
  const lfr = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33);
  assertClose(lfr.inventory.rfMoment, 0.501, 0.005, 'LFR inventory moment RF');

  // Shear: C_v = 0.85 * 85.9 = 73.015
  // RF_v = (73.015 - 1.3*12) / (2.17*25*1.33) = (73.015-15.6) / 72.1525 = 0.796
  assertClose(lfr.inventory.rfShear, 0.796, 0.005, 'LFR inventory shear RF');

  // Ton rating = RF * 36
  assert(Math.abs(lfr.inventory.tons - lfr.inventory.rf * 36) < 0.5, 'LFR tons = RF * 36');

  assert(!lfr.inventory.pass, 'LFR inventory: RF < 1.0 -> FAIL');

  // Operating: A2=1.30
  // RF_m = (373.05 - 156) / (1.30*150*1.33) = 217.05 / 259.35 = 0.837
  assertClose(lfr.operating.rfMoment, 0.837, 0.005, 'LFR operating moment RF');
}

// =================================================================
// 9. ASR RATING FACTOR TESTS
// =================================================================
console.log('\n=== 9. ASR Rating Factors ===');

{
  const section = computeGrossSection(48, 7, 14, 30);
  // dv = max(0.9*27, 0.72*30) = 24.3
  const dv = 24.3;
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  // Inventory: Fb = 0.40*3000 = 1200 psi, Fv = 0.95*sqrt(3000) = 52.02 psi
  // Ma = 1200 * St / 12000 kip-ft
  // Va = 52.02 * 14 * 24.3 / 1000 kips
  const asr = computeASR(section, 3000, 60000, 14, dv, deadLoads, liveLoads, 0.33);

  const Ma_inv = 0.40 * 3000 * section.St / 12000;
  assertClose(asr.inventory.Ma, Ma_inv, 0.5, 'ASR inventory Ma');

  const Va_inv = 0.95 * Math.sqrt(3000) * 14 * 24.3 / 1000;
  assertClose(asr.inventory.Va, Va_inv, 0.5, 'ASR inventory Va');

  // RF_m = (Ma - (100+20)) / (150 * 1.33)
  const rfM = (Ma_inv - 120) / (150 * 1.33);
  assertClose(asr.inventory.rfMoment, rfM, 0.005, 'ASR inventory moment RF');

  assert(typeof asr.inventory.tons === 'number', 'ASR reports tonnage');
  assert(typeof asr.operating.Ma === 'number', 'ASR operating Ma exists');

  // Operating Fb should be higher than inventory
  assert(asr.operating.Ma > asr.inventory.Ma, 'Operating Ma > Inventory Ma');
}

// =================================================================
// 10. FULL RATING (runLoadRating) INTEGRATION TEST
// =================================================================
console.log('\n=== 10. Full Rating Integration ===');

{
  const params = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };

  const r = runLoadRating(params);

  // Basic structure checks
  assert(r.section !== undefined, 'Result has section properties');
  assert(r.effectiveRebar !== undefined, 'Result has effective rebar');
  assert(r.totalAs > 0, 'Total As > 0');
  assert(r.d > 0, 'Effective depth d > 0');
  assert(r.moment !== undefined, 'Result has moment capacity');
  assert(r.shear !== undefined, 'Result has shear capacity');
  assert(r.phiMn > 0, 'phiMn > 0');
  assert(r.phiVn > 0, 'phiVn > 0');
  assert(r.lrfr !== undefined, 'LRFR results present');
  assert(r.lfr !== undefined, 'LFR results present');
  assert(r.asr !== undefined, 'ASR results present');

  // Verify As = 4 * 0.79 = 3.16
  assertClose(r.totalAs, 3.16, 0.01, 'Full rating: As = 3.16 in^2');
  assertClose(r.d, 27, 0.01, 'Full rating: d = 27 in');

  console.log(`  phiMn=${r.phiMn.toFixed(1)}, phiVn=${r.phiVn.toFixed(1)}`);
  console.log(`  LRFR Inv RF=${r.lrfr.design_inventory.rf}, LFR Inv RF=${r.lfr.inventory.rf}, ASR Inv RF=${r.asr.inventory.rf}`);
}

// =================================================================
// 11. CROSS-METHOD CONSISTENCY
// =================================================================
console.log('\n=== 11. Cross-Method Consistency ===');

{
  const params = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };

  const r = runLoadRating(params);

  const lrfrInv = r.lrfr.design_inventory.rf;
  const lfrInv = r.lfr.inventory.rf;
  const asrInv = r.asr.inventory.rf;
  const lrfrOp = r.lrfr.design_operating.rf;
  const lfrOp = r.lfr.operating.rf;
  const asrOp = r.asr.operating.rf;

  // All should be same order of magnitude (within factor of 3)
  assert(lrfrInv > 0 && lfrInv > 0 && asrInv > 0, 'All inventory RFs > 0');

  const maxInv = Math.max(lrfrInv, lfrInv, asrInv);
  const minInv = Math.min(lrfrInv, lfrInv, asrInv);
  assert(maxInv / minInv < 3.0, `Inventory RFs within factor of 3: ${minInv.toFixed(3)} to ${maxInv.toFixed(3)}`);

  // Operating should always be >= Inventory for same method
  assert(lrfrOp >= lrfrInv, 'LRFR: operating RF >= inventory RF');
  assert(lfrOp >= lfrInv, 'LFR: operating RF >= inventory RF');
  assert(asrOp >= asrInv, 'ASR: operating RF >= inventory RF');

  console.log(`  Inventory: LRFR=${lrfrInv.toFixed(3)}, LFR=${lfrInv.toFixed(3)}, ASR=${asrInv.toFixed(3)}`);
  console.log(`  Operating: LRFR=${lrfrOp.toFixed(3)}, LFR=${lfrOp.toFixed(3)}, ASR=${asrOp.toFixed(3)}`);
}

// =================================================================
// 12. PASS/FAIL LOGIC
// =================================================================
console.log('\n=== 12. Pass/Fail Logic ===');

{
  // Strong beam: should pass
  const strongParams = {
    spanFt: 20, bf: 48, hf: 7, bw: 14, h: 30, fc: 4000, fy: 60000,
    rebarLayers: [{ barSize: 11, count: 6, depth: 27, lossPercent: 0 }],
    stirrupSize: 5, stirrupLegs: 2, stirrupSpacing: 6, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const rStrong = runLoadRating(strongParams);
  assert(rStrong.lrfr.design_inventory.rf >= 1.0, 'Strong beam: LRFR inventory passes');
  assert(rStrong.lrfr.design_inventory.pass === true, 'Strong beam: pass flag is true');

  // Weak beam: should fail
  const weakParams = {
    spanFt: 80, bf: 36, hf: 6, bw: 12, h: 24, fc: 2500, fy: 40000,
    rebarLayers: [{ barSize: 5, count: 2, depth: 21, lossPercent: 50 }],
    stirrupSize: 3, stirrupLegs: 2, stirrupSpacing: 18, stirrupLoss: 50,
    dcW: 0.8, dwW: 0.2,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.8,
    phiC: 0.85, phiS: 0.85,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const rWeak = runLoadRating(weakParams);
  assert(rWeak.lrfr.design_inventory.rf < 1.0, 'Weak beam: LRFR inventory fails');
  assert(rWeak.lrfr.design_inventory.pass === false, 'Weak beam: pass flag is false');

  console.log(`  Strong beam RF: ${rStrong.lrfr.design_inventory.rf.toFixed(3)} (${rStrong.lrfr.design_inventory.pass ? 'PASS' : 'FAIL'})`);
  console.log(`  Weak beam RF: ${rWeak.lrfr.design_inventory.rf.toFixed(3)} (${rWeak.lrfr.design_inventory.pass ? 'PASS' : 'FAIL'})`);
}

// Verify pass/fail threshold exactly at 1.0
{
  const capacity = { phiMn: 500, phiVn: 200 };
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 0, dwShear: 0 };

  // Set live load so RF_m = (500 - 1.25*100) / (1.75*LL) = 1.0
  // 375 / (1.75*LL) = 1.0 -> LL = 375/1.75 = 214.286
  const liveLoads = { maxMoment: 214.286, maxShear: 1 }; // shear won't govern
  const lrfr = computeLRFR(capacity, deadLoads, liveLoads, 1.0, 1.0);
  assertClose(lrfr.design_inventory.rfMoment, 1.0, 0.002, 'RF exactly 1.0');
  assert(lrfr.design_inventory.pass === true, 'RF=1.0 is PASS (>= 1.0)');
}

// =================================================================
// 13. EDGE CASES
// =================================================================
console.log('\n=== 13. Edge Cases ===');

{
  // Zero dead load
  const params0DL = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0, dwW: 0,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const r0DL = runLoadRating(params0DL);
  assert(r0DL.deadLoads.dcMoment === 0, 'Zero DC: moment=0');
  assert(r0DL.lrfr.design_inventory.rf > 0, 'Zero DL: RF still positive');
  // Zero DL should give higher RF than non-zero DL
  const paramsNorm = { ...params0DL, dcW: 0.5, dwW: 0.1 };
  const rNorm = runLoadRating(paramsNorm);
  assert(r0DL.lrfr.design_inventory.rf > rNorm.lrfr.design_inventory.rf, 'Zero DL gives higher RF');
  console.log(`  Zero DL RF: ${r0DL.lrfr.design_inventory.rf.toFixed(3)} vs Normal DL RF: ${rNorm.lrfr.design_inventory.rf.toFixed(3)}`);

  // Very short span (5 ft)
  const paramsShort = {
    spanFt: 5, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const rShort = runLoadRating(paramsShort);
  assert(isFinite(rShort.lrfr.design_inventory.rf), 'Short span: RF is finite');
  assert(rShort.lrfr.design_inventory.rf > 0, 'Short span: RF > 0');
  console.log(`  Short span (5ft) RF: ${rShort.lrfr.design_inventory.rf.toFixed(3)}`);

  // Very long span (200 ft)
  const paramsLong = {
    spanFt: 200, bf: 96, hf: 8, bw: 18, h: 72, fc: 4000, fy: 60000,
    rebarLayers: [
      { barSize: 11, count: 8, depth: 68, lossPercent: 0 },
      { barSize: 11, count: 4, depth: 65, lossPercent: 0 }
    ],
    stirrupSize: 5, stirrupLegs: 4, stirrupSpacing: 6, stirrupLoss: 0,
    dcW: 2.0, dwW: 0.5,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const rLong = runLoadRating(paramsLong);
  assert(isFinite(rLong.lrfr.design_inventory.rf), 'Long span: RF is finite');
  console.log(`  Long span (200ft) RF: ${rLong.lrfr.design_inventory.rf.toFixed(3)}`);

  // Multiple rebar layers
  const paramsMulti = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [
      { barSize: 8, count: 4, depth: 27, lossPercent: 0 },
      { barSize: 6, count: 2, depth: 24, lossPercent: 10 },
      { barSize: 5, count: 3, depth: 22, lossPercent: 20 }
    ],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true }
  };
  const rMulti = runLoadRating(paramsMulti);
  assert(rMulti.effectiveRebar.length === 3, 'Multi-layer: 3 layers');
  assert(rMulti.totalAs > 3.16, 'Multi-layer: total As > single layer');
  assert(rMulti.d < 27, 'Multi-layer: centroid d < deepest layer');
  console.log(`  Multi-layer: As=${rMulti.totalAs.toFixed(2)}, d=${rMulti.d.toFixed(1)}, RF=${rMulti.lrfr.design_inventory.rf.toFixed(3)}`);
}

// =================================================================
// 14. CONDITION/SYSTEM FACTOR EFFECTS
// =================================================================
console.log('\n=== 14. Condition/System Factor Effects ===');

{
  const baseParams = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    methods: { lrfr: true, lfr: false, asr: false }
  };

  const rGood = runLoadRating({ ...baseParams, phiC: 1.0, phiS: 1.0 });
  const rFair = runLoadRating({ ...baseParams, phiC: 0.95, phiS: 1.0 });
  const rPoor = runLoadRating({ ...baseParams, phiC: 0.85, phiS: 0.85 });

  assert(rGood.lrfr.design_inventory.rf > rFair.lrfr.design_inventory.rf, 'Good > Fair condition RF');
  assert(rFair.lrfr.design_inventory.rf > rPoor.lrfr.design_inventory.rf, 'Fair > Poor condition RF');
  console.log(`  Good: ${rGood.lrfr.design_inventory.rf.toFixed(3)}, Fair: ${rFair.lrfr.design_inventory.rf.toFixed(3)}, Poor: ${rPoor.lrfr.design_inventory.rf.toFixed(3)}`);
}

// =================================================================
// 15. SELECTIVE METHOD EXECUTION
// =================================================================
console.log('\n=== 15. Selective Methods ===');

{
  const baseParams = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12, stirrupLoss: 0,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0
  };

  const rLRFROnly = runLoadRating({ ...baseParams, methods: { lrfr: true, lfr: false, asr: false } });
  assert(rLRFROnly.lrfr !== undefined, 'LRFR only: lrfr present');
  assert(rLRFROnly.lfr === undefined, 'LRFR only: lfr absent');
  assert(rLRFROnly.asr === undefined, 'LRFR only: asr absent');

  const rLFROnly = runLoadRating({ ...baseParams, methods: { lrfr: false, lfr: true, asr: false } });
  assert(rLFROnly.lrfr === undefined, 'LFR only: lrfr absent');
  assert(rLFROnly.lfr !== undefined, 'LFR only: lfr present');

  const rASROnly = runLoadRating({ ...baseParams, methods: { lrfr: false, lfr: false, asr: true } });
  assert(rASROnly.asr !== undefined, 'ASR only: asr present');
  assert(rASROnly.lrfr === undefined, 'ASR only: lrfr absent');
}

// =================================================================
// 16. REBAR DATABASE VALIDATION
// =================================================================
console.log('\n=== 16. Rebar Database ===');

{
  // Verify standard rebar areas per ASTM A615
  assertClose(REBAR_AREAS[3], 0.11, 0.001, '#3 area = 0.11');
  assertClose(REBAR_AREAS[4], 0.20, 0.001, '#4 area = 0.20');
  assertClose(REBAR_AREAS[5], 0.31, 0.001, '#5 area = 0.31');
  assertClose(REBAR_AREAS[6], 0.44, 0.001, '#6 area = 0.44');
  assertClose(REBAR_AREAS[7], 0.60, 0.001, '#7 area = 0.60');
  assertClose(REBAR_AREAS[8], 0.79, 0.001, '#8 area = 0.79');
  assertClose(REBAR_AREAS[9], 1.00, 0.001, '#9 area = 1.00');
  assertClose(REBAR_AREAS[10], 1.27, 0.001, '#10 area = 1.27');
  assertClose(REBAR_AREAS[11], 1.56, 0.001, '#11 area = 1.56');
  assertClose(REBAR_AREAS[14], 2.25, 0.001, '#14 area = 2.25');
  assertClose(REBAR_AREAS[18], 4.00, 0.001, '#18 area = 4.00');
}

// =================================================================
// 17. LFR PHI FACTOR VERIFICATION
// =================================================================
console.log('\n=== 17. LFR uses correct phi factors ===');

{
  // LFR should use fixed phi (0.90 moment, 0.85 shear) per AASHTO Standard Specs
  // NOT the variable LRFD phi from computeMn
  const Mn = 400; // kip-ft
  const Vn = 80;  // kips
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  const lfr = computeLFR(Mn, Vn, deadLoads, liveLoads, 0.33);

  // C_m should be 0.90 * Mn, not the LRFD variable phi
  const expectedCm = 0.90 * 400; // = 360
  const expectedRfM = (expectedCm - 1.3 * 120) / (2.17 * 150 * 1.33);
  assertClose(lfr.inventory.rfMoment, expectedRfM, 0.005, 'LFR uses phi=0.90 for moment');

  // C_v should be 0.85 * Vn
  const expectedCv = 0.85 * 80; // = 68
  const expectedRfV = (expectedCv - 1.3 * 12) / (2.17 * 25 * 1.33);
  assertClose(lfr.inventory.rfShear, expectedRfV, 0.005, 'LFR uses phi=0.85 for shear');
}

// =================================================================
// 18. STIRRUP DETERIORATION EFFECT
// =================================================================
console.log('\n=== 18. Stirrup Deterioration ===');

{
  const baseParams = {
    spanFt: 40, bf: 48, hf: 7, bw: 14, h: 30, fc: 3000, fy: 60000,
    rebarLayers: [{ barSize: 8, count: 4, depth: 27, lossPercent: 0 }],
    stirrupSize: 4, stirrupLegs: 2, stirrupSpacing: 12,
    dcW: 0.5, dwW: 0.1,
    truckDef: TRUCKS.AASHTO, impactFactor: 0.33, laneLoad: 0.64, distFactor: 0.6,
    phiC: 1.0, phiS: 1.0,
    methods: { lrfr: true, lfr: false, asr: false }
  };

  const r0 = runLoadRating({ ...baseParams, stirrupLoss: 0 });
  const r50 = runLoadRating({ ...baseParams, stirrupLoss: 50 });
  const r100 = runLoadRating({ ...baseParams, stirrupLoss: 100 });

  assert(r0.phiVn > r50.phiVn, 'Stirrup 0% > 50% loss: lower phiVn');
  assert(r50.phiVn > r100.phiVn, 'Stirrup 50% > 100% loss: lower phiVn');
  // 100% stirrup loss: Vs = 0, but Vc remains
  assert(r100.phiVn > 0, '100% stirrup loss: still has Vc');

  // Shear RF should decrease
  assert(r0.lrfr.design_inventory.rfShear >= r50.lrfr.design_inventory.rfShear, 'Shear RF decreases with stirrup loss');
  console.log(`  Stirrup loss shear RFs: 0%=${r0.lrfr.design_inventory.rfShear.toFixed(3)}, 50%=${r50.lrfr.design_inventory.rfShear.toFixed(3)}, 100%=${r100.lrfr.design_inventory.rfShear.toFixed(3)}`);
}

// =================================================================
// 19. TRUCK DEFINITIONS
// =================================================================
console.log('\n=== 19. Truck Definitions ===');

{
  assert(TRUCKS.AASHTO !== undefined, 'AASHTO truck defined');
  assert(TRUCKS.NC !== undefined, 'NC truck defined');
  assert(TRUCKS.SC !== undefined, 'SC truck defined');

  // AASHTO HL-93: 8k, 32k, 32k
  assertClose(TRUCKS.AASHTO.axles[0].weight, 8, 0.1, 'HL-93 front axle = 8k');
  assertClose(TRUCKS.AASHTO.axles[1].weight, 32, 0.1, 'HL-93 drive axle = 32k');
  assertClose(TRUCKS.AASHTO.axles[2].weight, 32, 0.1, 'HL-93 rear axle = 32k');
  assert(TRUCKS.AASHTO.variableSpacing.min === 14, 'HL-93 variable spacing min=14');
  assert(TRUCKS.AASHTO.variableSpacing.max === 30, 'HL-93 variable spacing max=30');
  assertClose(TRUCKS.AASHTO.tandem.weight, 25, 0.1, 'Design tandem = 25k each');
  assertClose(TRUCKS.AASHTO.tandem.spacing, 4, 0.1, 'Tandem spacing = 4 ft');
  assertClose(TRUCKS.AASHTO.laneLoad, 0.64, 0.01, 'Lane load = 0.64 kip/ft');

  // Total truck weight = 8+32+32 = 72k = 36 tons
  const totalWt = TRUCKS.AASHTO.axles.reduce((s, a) => s + a.weight, 0);
  assertClose(totalWt, 72, 0.1, 'HL-93 total weight = 72k');
}

// =================================================================
// 20. LRFR LOAD FACTOR TABLE VERIFICATION
// =================================================================
console.log('\n=== 20. LRFR Load Factors ===');

{
  assertClose(LRFR_FACTORS.design_inventory.gammaDC, 1.25, 0.001, 'Inv: gammaDC=1.25');
  assertClose(LRFR_FACTORS.design_inventory.gammaDW, 1.50, 0.001, 'Inv: gammaDW=1.50');
  assertClose(LRFR_FACTORS.design_inventory.gammaLL, 1.75, 0.001, 'Inv: gammaLL=1.75');
  assertClose(LRFR_FACTORS.design_operating.gammaLL, 1.35, 0.001, 'Op: gammaLL=1.35');
  assertClose(LRFR_FACTORS.legal.gammaLL, 1.80, 0.001, 'Legal: gammaLL=1.80');
  assertClose(LRFR_FACTORS.permit_routine.gammaLL, 1.30, 0.001, 'Permit routine: gammaLL=1.30');
  assertClose(LRFR_FACTORS.permit_special.gammaLL, 1.15, 0.001, 'Permit special: gammaLL=1.15');
}

// =================================================================
// 21. PASS/FAIL ROUNDING BUG FIX
// =================================================================
console.log('\n=== 21. Pass/Fail Rounding ===');

{
  // RF that rounds to 1.000 but raw value < 1.0 should be PASS
  const capacity = { phiMn: 500, phiVn: 200 };
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 0, dwShear: 0 };
  // Set LL so RF_m = (500 - 125) / (1.75*LL) = 0.9999...
  // 375 / (1.75*LL) = 0.9999 -> LL = 375/(1.75*0.9999) = 214.307
  const liveLoads = { maxMoment: 214.307, maxShear: 1 };
  const lrfr = computeLRFR(capacity, deadLoads, liveLoads, 1.0, 1.0);
  // Rounded RF should be 1.000, so pass should be true
  assert(lrfr.design_inventory.rf === 1.0, 'Rounded RF=1.000 passes');
  assert(lrfr.design_inventory.pass === true, 'RF rounds to 1.000 -> PASS');
}

// =================================================================
// 22. SHEAR dv WITH d-a/2 TERM
// =================================================================
console.log('\n=== 22. Shear dv includes d-a/2 ===');

{
  // When a is large enough, d-a/2 should govern dv
  // d=27, a=10, h=30
  // d-a/2 = 22, 0.9d = 24.3, 0.72h = 21.6
  // dv = max(22, 24.3, 21.6) = 24.3 (0.9d still governs)
  const vn1 = computeVn(3000, 14, 27, 30, 0.40, 12, 60000, 10);
  assertClose(vn1.dv, 24.3, 0.01, 'dv with a=10: 0.9d governs');

  // Without a parameter, should still work (backward compat)
  const vn2 = computeVn(3000, 14, 27, 30, 0.40, 12, 60000);
  assertClose(vn2.dv, 24.3, 0.01, 'dv without a: backward compatible');

  // d-a/2 can govern when d is large relative to h: d=60, h=40, a=5
  // d-a/2 = 57.5, 0.9d = 54, 0.72h = 28.8
  const vn3 = computeVn(3000, 14, 60, 40, 0.40, 12, 60000, 5);
  assertClose(vn3.dv, 57.5, 0.01, 'dv with large d: d-a/2 governs');
}

// =================================================================
// 23. LEGAL LOAD GAMMA_LL OVERRIDE
// =================================================================
console.log('\n=== 23. Legal Load gamma_LL override ===');

{
  const capacity = { phiMn: 500, phiVn: 200 };
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { maxMoment: 200, maxShear: 30 };

  // Default: gammaLL = 1.80
  const lrfr1 = computeLRFR(capacity, deadLoads, liveLoads, 1.0, 1.0);
  // RF_m = (500 - 125 - 30) / (1.80 * 200) = 345/360 = 0.958
  assertClose(lrfr1.legal.rfMoment, 0.958, 0.002, 'Legal default gammaLL=1.80');

  // Override to 1.45 (ADTT < 100)
  const lrfr2 = computeLRFR(capacity, deadLoads, liveLoads, 1.0, 1.0, 1.45);
  // RF_m = 345 / (1.45 * 200) = 345/290 = 1.190
  assertClose(lrfr2.legal.rfMoment, 1.190, 0.002, 'Legal override gammaLL=1.45');

  // Non-legal levels should not be affected
  assertClose(lrfr2.design_inventory.rfMoment, lrfr1.design_inventory.rfMoment, 0.001,
    'Design inventory unaffected by legalGammaLL');
}

// =================================================================
// 24. LFR AUTO IMPACT FACTOR
// =================================================================
console.log('\n=== 24. LFR Auto Impact Factor ===');

{
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  // With spanFt=40: I = 50/(40+125) = 0.3030, capped at 0.30
  const lfr40 = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33, 40);
  const expectedI40 = Math.min(50 / (40 + 125), 0.30);
  const expectedRfM40 = (0.90 * 414.5 - 1.3 * 120) / (2.17 * 150 * (1 + expectedI40));
  assertClose(lfr40.inventory.rfMoment, expectedRfM40, 0.005, 'LFR auto-impact span=40ft');

  // With spanFt=100: I = 50/(100+125) = 0.2222
  const lfr100 = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33, 100);
  const expectedI100 = 50 / (100 + 125);
  const expectedRfM100 = (0.90 * 414.5 - 1.3 * 120) / (2.17 * 150 * (1 + expectedI100));
  assertClose(lfr100.inventory.rfMoment, expectedRfM100, 0.005, 'LFR auto-impact span=100ft');

  // Longer span should give higher RF (lower impact)
  assert(lfr100.inventory.rfMoment > lfr40.inventory.rfMoment,
    'Longer span -> lower I -> higher LFR RF');

  // Without spanFt: falls back to impactFactor
  const lfrFallback = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33);
  const expectedFallback = (0.90 * 414.5 - 1.3 * 120) / (2.17 * 150 * 1.33);
  assertClose(lfrFallback.inventory.rfMoment, expectedFallback, 0.005, 'LFR fallback to impactFactor');
}

// =================================================================
// 25. TRUCK WEIGHT FROM AXLES
// =================================================================
console.log('\n=== 25. Truck Weight from Axles ===');

{
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  // AASHTO: 8+32+32 = 72k = 36 tons
  const lfr = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33, 40, TRUCKS.AASHTO);
  assertClose(lfr.inventory.tons, lfr.inventory.rf * 36, 0.5, 'AASHTO truck: 36 tons');

  // Without truckDef: falls back to 36
  const lfrNoTruck = computeLFR(414.5, 85.9, deadLoads, liveLoads, 0.33, 40);
  assertClose(lfrNoTruck.inventory.tons, lfrNoTruck.inventory.rf * 36, 0.5, 'Fallback: 36 tons');
}

// =================================================================
// 26. ASR STEEL TENSION CHECK
// =================================================================
console.log('\n=== 26. ASR Steel Tension Check ===');

{
  const section = computeGrossSection(48, 7, 14, 30);
  const dv = 24.3;
  const deadLoads = { dcMoment: 100, dcShear: 10, dwMoment: 20, dwShear: 2 };
  const liveLoads = { lfrTruckM: 150, lfrTruckV: 25 };

  // With steel params: As=3.16, d=27, a=1.55
  const asr = computeASR(section, 3000, 60000, 14, dv, deadLoads, liveLoads, 0.33,
    3.16, 27, 1.55);

  // Inventory steel capacity: Ma_s = 0.55*60000 * 3.16 * (27-1.55/2) / 12000
  const jd = 27 - 1.55 / 2;
  const Ma_s_inv = 0.55 * 60000 * 3.16 * jd / 12000;
  const Ma_c_inv = 0.40 * 3000 * section.St / 12000;

  // Ma should be min of concrete and steel controlled capacities
  const expectedMa = Math.min(Ma_c_inv, Ma_s_inv);
  assertClose(asr.inventory.Ma, Math.round(expectedMa * 10) / 10, 0.5,
    'ASR Ma = min(concrete, steel) capacity');

  // Without steel params: backward compatible (steel check = Infinity)
  const asrNoSteel = computeASR(section, 3000, 60000, 14, dv, deadLoads, liveLoads, 0.33);
  assert(asrNoSteel.inventory.Ma > 0, 'ASR backward compat: Ma > 0');
}

// =================================================================
// SUMMARY
// =================================================================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length > 0) {
  console.log('\nFAILURES:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
