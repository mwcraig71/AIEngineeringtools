/**
 * Tests for the composite steel girder rating engine.
 * Run with: node test-composite-engine.js
 */

const fs = require('fs');
const path = require('path');

// Load dependencies into global scope
const scriptOrder = [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'steel-sections.js',
  'composite-rating-engine.js'
];
for (const s of scriptOrder) {
  const code = fs.readFileSync(path.join(__dirname, s), 'utf8');
  require('vm').runInThisContext(code, { filename: s });
}

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; console.log('  PASS: ' + msg); }
  else { failed++; console.error('  FAIL: ' + msg); }
}

function approx(a, b, tol) {
  return Math.abs(a - b) < (tol || 0.1);
}

// ============================================================
// Test 1: Modular ratio
// ============================================================
console.log('\n=== Modular Ratio ===');
const mr = computeModularRatio(4.0);
console.log(`  n = ${mr.n}, Ec = ${mr.Ec.toFixed(0)} ksi`);
assert(mr.n >= 7 && mr.n <= 9, `Modular ratio n=${mr.n} in expected range (7-9) for f'c=4ksi`);
assert(mr.Ec > 3000 && mr.Ec < 4500, `Ec = ${mr.Ec.toFixed(0)} ksi in expected range`);

// ============================================================
// Test 2: Effective flange width
// ============================================================
console.log('\n=== Effective Flange Width ===');
const beff1 = computeEffectiveWidth(60, 8, 96, 0.58);
console.log(`  beff = ${beff1.toFixed(1)} in for 60ft span, 8in slab, 96in spacing`);
assert(beff1 > 0, 'beff > 0');
assert(beff1 <= 96, 'beff <= girder spacing');
assert(beff1 <= 60 * 12 / 4, 'beff <= L/4');
assert(beff1 <= 12 * 8, 'beff <= 12*ts');

// ============================================================
// Test 3: Steel section properties
// ============================================================
console.log('\n=== Steel Section Properties ===');
const w33 = getWShapeProps('W33x130');
assert(w33 !== null, 'W33x130 exists');
const params = wShapeToSectionParams(w33);
const steelSec = computeSteelSectionProps(params.D, params.tw, params.bfc, params.tfc, params.bft, params.tft);
assert(approx(steelSec.d, w33.d, 0.05), `Steel depth ~ ${w33.d} (got ${steelSec.d.toFixed(2)})`);
assert(steelSec.A > 0, 'Steel area > 0');
assert(steelSec.Ix > 0, 'Steel Ix > 0');

// ============================================================
// Test 4: Composite section properties
// ============================================================
console.log('\n=== Composite Section Properties ===');
const deck = { ts: 8, beff: 96, fc: 4.0, haunch: 2 };
const n = mr.n;
const compST = computeCompositeSectionProps(steelSec, deck, n);
const compLT = computeCompositeSectionProps(steelSec, deck, 3 * n);

assert(compST.Icomp > steelSec.Ix, `Short-term Icomp (${compST.Icomp.toFixed(0)}) > steel Ix (${steelSec.Ix.toFixed(0)})`);
assert(compLT.Icomp > steelSec.Ix, `Long-term Icomp (${compLT.Icomp.toFixed(0)}) > steel Ix (${steelSec.Ix.toFixed(0)})`);
assert(compST.Icomp > compLT.Icomp, `Short-term Icomp > Long-term Icomp`);
assert(compST.SbotSteel > steelSec.Sxt_tens, `Composite Sbot (${compST.SbotSteel.toFixed(1)}) > steel Sbot (${steelSec.Sxt_tens.toFixed(1)})`);
assert(compST.ybarComp < steelSec.ybar, `Composite NA moves up (${compST.ybarComp.toFixed(2)}) vs steel (${steelSec.ybar.toFixed(2)})`);
console.log(`  ST Icomp = ${compST.Icomp.toFixed(0)} in4, LT Icomp = ${compLT.Icomp.toFixed(0)} in4`);
console.log(`  ST Sbot = ${compST.SbotSteel.toFixed(1)} in3, LT Sbot = ${compLT.SbotSteel.toFixed(1)} in3`);

// ============================================================
// Test 5: Composite plastic moment
// ============================================================
console.log('\n=== Composite Plastic Moment ===');
const Fy = 50;
const plastic = computeCompositeMp(steelSec, deck, Fy);
const steelMp = Fy * steelSec.Zx / 12; // steel-only Mp in kip-ft
console.log(`  Composite Mp = ${(plastic.Mp / 12).toFixed(1)} kip-ft, Steel-only Mp = ${steelMp.toFixed(1)} kip-ft`);
console.log(`  PNA depth from top of slab = ${plastic.Yp.toFixed(2)} in`);
console.log(`  Dp = ${plastic.Dp.toFixed(2)} in, Dt = ${plastic.Dt.toFixed(2)} in`);
assert(plastic.Mp > 0, 'Composite Mp > 0');
assert(plastic.Mp / 12 > steelMp, `Composite Mp (${(plastic.Mp / 12).toFixed(1)}) > steel Mp (${steelMp.toFixed(1)})`);
assert(plastic.Dp > 0, 'Dp > 0');
assert(plastic.Dt > 0, 'Dt > 0');
assert(plastic.Dp <= plastic.Dt, 'Dp <= Dt');

// ============================================================
// Test 6: Composite flexural capacity
// ============================================================
console.log('\n=== Composite Flexural Capacity ===');
const moment = computeCompositeMn(steelSec, deck, Fy, 20, 1.0, compST, compLT);
assert(moment.Mn > 0, 'Mn > 0');
assert(moment.Mp > 0, 'Mp > 0');
assert(moment.Mn <= moment.Mp + 0.1, 'Mn <= Mp');
assert(moment.phi === 1.0, 'phi = 1.0');
console.log(`  Mn = ${moment.Mn.toFixed(1)} kip-ft, Mp = ${moment.Mp.toFixed(1)} kip-ft, My = ${moment.My.toFixed(1)} kip-ft`);
console.log(`  Governs: ${moment.governs}, Web: ${moment.webClass}, Flange: ${moment.flangeClass}`);
console.log(`  Dp/Dt = ${moment.DpDt.toFixed(4)}, Ductility: ${moment.ductilityOK ? 'OK' : 'FAILS'}`);

// ============================================================
// Test 7: Shear capacity (same as non-composite)
// ============================================================
console.log('\n=== Shear Capacity ===');
const shear = computeSteelVn(steelSec, Fy, 0);
assert(shear.Vn > 0, 'Vn > 0');
assert(shear.C > 0 && shear.C <= 1.0, 'C between 0 and 1');
console.log(`  Vn = ${shear.Vn.toFixed(1)} kip, Vp = ${shear.Vp.toFixed(1)} kip, C = ${shear.C.toFixed(3)}`);

// ============================================================
// Test 8: Shear connector capacity
// ============================================================
console.log('\n=== Shear Connectors ===');
const stud = computeStudCapacity(0.75, 4.0, mr.Ec, 60);
assert(stud.Qn > 0, 'Stud Qn > 0');
assert(stud.Asc > 0, 'Stud Asc > 0');
console.log(`  Qn = ${stud.Qn.toFixed(2)} kip, Asc = ${stud.Asc.toFixed(4)} in2`);

const connDemand = computeShearConnectorDemand(steelSec, deck, Fy, stud.Qn, 2, 60);
assert(connDemand.Vh > 0, 'Vh > 0');
assert(connDemand.nRequired > 0, 'nRequired > 0');
assert(connDemand.pitch > 0, 'Pitch > 0');
console.log(`  Vh = ${connDemand.Vh.toFixed(1)} kip, Studs required = ${connDemand.nRequired}, Pitch = ${connDemand.pitch.toFixed(1)} in`);

// ============================================================
// Test 9: Full composite rating - W33x130, 60ft span
// ============================================================
console.log('\n=== Full Composite Rating (W33x130, 60ft span) ===');
const result1 = runCompositeRating({
  sectionType: 'rolled',
  rolledSection: 'W33x130',
  Fy: 50,
  spanFt: 60,
  Lb: 20,
  Cb: 1.0,
  stiffenerSpacing: 0,
  checkPoints: [],
  dc1W: 0.80,  // steel + wet deck
  dc2W: 0.10,  // barriers etc
  dwW: 0.05,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.6,
  phiC: 1.0,
  phiS: 1.0,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.80,
  deck: { ts: 8, fc: 4.0, haunch: 2, girderSpacing: 96, beffOverride: 0 },
  studs: { diameter: 0.75, Fu: 60, perRow: 2 }
});

assert(result1.pointResults.length >= 1, `Check points evaluated (got ${result1.pointResults.length})`);
assert(result1.governingResult !== null, 'Has governing result');
assert(result1.governingResult.governingRF > 0, `Governing RF > 0 (got ${result1.governingResult.governingRF.toFixed(3)})`);
assert(result1.compositeST !== null, 'Has short-term composite properties');
assert(result1.compositeLT !== null, 'Has long-term composite properties');
assert(result1.shearConnectors !== null, 'Has shear connector results');
console.log(`  Governing RF = ${result1.governingResult.governingRF.toFixed(3)}`);
console.log(`  Governing: ${result1.governingResult.governingLabel} at ${result1.governingResult.label}`);
console.log(`  phiMn = ${result1.pointResults[0].phiMn.toFixed(1)} kip-ft`);
console.log(`  phiVn = ${result1.pointResults[0].phiVn.toFixed(1)} kip`);

// Verify composite rating > non-composite would be (higher capacity with same loads)
assert(result1.pointResults[0].phiMn > steelMp, `Composite phiMn (${result1.pointResults[0].phiMn.toFixed(1)}) > steel Mp (${steelMp.toFixed(1)})`);

// ============================================================
// Test 10: Plate girder composite rating
// ============================================================
console.log('\n=== Full Composite Rating (Plate Girder) ===');
const result2 = runCompositeRating({
  sectionType: 'plate',
  plateGirder: { D: 48, tw: 0.4375, bfc: 16, tfc: 1.25, bft: 18, tft: 1.5 },
  Fy: 50,
  spanFt: 100,
  Lb: 25,
  Cb: 1.0,
  stiffenerSpacing: 60,
  checkPoints: [],
  dc1W: 1.2,
  dc2W: 0.15,
  dwW: 0.08,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.55,
  phiC: 0.95,
  phiS: 1.0,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.80,
  deck: { ts: 9, fc: 4.5, haunch: 3, girderSpacing: 108, beffOverride: 0 },
  studs: { diameter: 0.875, Fu: 60, perRow: 3 }
});

assert(result2.governingResult.governingRF > 0, `Plate girder RF > 0 (got ${result2.governingResult.governingRF.toFixed(3)})`);
assert(result2.shearConnectors !== null, 'Plate girder has shear connector results');
console.log(`  Governing RF = ${result2.governingResult.governingRF.toFixed(3)}`);
console.log(`  Governing: ${result2.governingResult.governingLabel}`);
console.log(`  phiMn = ${result2.pointResults[0].phiMn.toFixed(1)} kip-ft`);
console.log(`  n = ${result2.n}, beff = ${result2.beff.toFixed(1)} in`);

// Verify singly-symmetric section properties
const pgSteel = result2.steelSection;
assert(pgSteel.bft !== pgSteel.bfc || pgSteel.tft !== pgSteel.tfc, 'Singly-symmetric plate girder');
assert(pgSteel.d > 50, `Plate girder total depth > 50in (got ${pgSteel.d.toFixed(1)})`);

// ============================================================
// Test 11: Verify construction staging (DC1 vs DC2)
// ============================================================
console.log('\n=== Construction Staging ===');
const dl = computeCompositeDeadLoadAtX(60, 0.8, 0.1, 0.05, 30);
assert(dl.dc1Moment > 0, 'DC1 moment > 0');
assert(dl.dc2Moment > 0, 'DC2 moment > 0');
assert(dl.dwMoment > 0, 'DW moment > 0');
assert(dl.dc1Moment > dl.dc2Moment, 'DC1 moment > DC2 moment (higher load)');
console.log(`  DC1 M = ${dl.dc1Moment.toFixed(1)}, DC2 M = ${dl.dc2Moment.toFixed(1)}, DW M = ${dl.dwMoment.toFixed(1)} kip-ft`);

// ============================================================
// Test 12: Section loss in composite rating
// ============================================================
console.log('\n=== Section Loss in Composite Rating ===');
const result3 = runCompositeRating({
  sectionType: 'rolled',
  rolledSection: 'W33x130',
  Fy: 50,
  spanFt: 60,
  Lb: 20,
  Cb: 1.0,
  stiffenerSpacing: 0,
  checkPoints: [
    { location: 30, twRemaining: 0.40, tftRemaining: 0.70 }
  ],
  dc1W: 0.80,
  dc2W: 0.10,
  dwW: 0.05,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.6,
  phiC: 1.0,
  phiS: 1.0,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.80,
  deck: { ts: 8, fc: 4.0, haunch: 2, girderSpacing: 96, beffOverride: 0 },
  studs: { diameter: 0.75, Fu: 60, perRow: 2 }
});

// Should have section loss check point + support (midspan covered by the check point at 30ft)
assert(result3.pointResults.length >= 2, `Section loss: check points evaluated (got ${result3.pointResults.length})`);
const lossPoint = result3.pointResults.find(p => p.hasLoss);
assert(lossPoint !== undefined, 'Found a check point with section loss');
assert(lossPoint.section.tw < w33.tw, `Reduced tw (${lossPoint.section.tw.toFixed(4)}) < original (${w33.tw})`);
assert(lossPoint.phiMn < result1.pointResults[0].phiMn,
  `Loss phiMn (${lossPoint.phiMn.toFixed(1)}) < base phiMn (${result1.pointResults[0].phiMn.toFixed(1)})`);
assert(result3.governingResult.governingRF < result1.governingResult.governingRF,
  `Loss RF (${result3.governingResult.governingRF.toFixed(3)}) < base RF (${result1.governingResult.governingRF.toFixed(3)})`);
console.log(`  Loss point phiMn = ${lossPoint.phiMn.toFixed(1)} kip-ft vs base ${result1.pointResults[0].phiMn.toFixed(1)} kip-ft`);
console.log(`  Loss RF = ${result3.governingResult.governingRF.toFixed(3)} vs base RF = ${result1.governingResult.governingRF.toFixed(3)}`);

// ============================================================
// Test 13: Ductility check for deep slab case
// ============================================================
console.log('\n=== Ductility Check ===');
// Use a small steel section with thick slab to push PNA deep
const smallSec = computeSteelSectionProps(20, 0.3, 6, 0.5, 6, 0.5);
const thickDeck = { ts: 12, beff: 96, fc: 6.0, haunch: 0 };
const plasticDeep = computeCompositeMp(smallSec, thickDeck, 50);
console.log(`  Dp/Dt = ${(plasticDeep.Dp / plasticDeep.Dt).toFixed(4)}`);
assert(plasticDeep.Dp > 0, 'Dp > 0 for ductility test');
// Verify the ductility ratio is computed correctly
const dpdt = plasticDeep.Dp / plasticDeep.Dt;
console.log(`  Dp = ${plasticDeep.Dp.toFixed(2)}, Dt = ${plasticDeep.Dt.toFixed(2)}, Dp/Dt = ${dpdt.toFixed(4)}`);

// ============================================================
// Test 14: Analysis model + unit guards
// ============================================================
console.log('\n=== Analysis model + unit guards ===');
let threw = false;
try {
  runCompositeRating({
    sectionType: 'rolled',
    rolledSection: 'W33x130',
    analysisModel: 'two-span-continuous',
    Fy: 50,
    spanFt: 60,
    Lb: 20,
    Cb: 1.0,
    stiffenerSpacing: 0,
    checkPoints: [],
    dc1W: 0.80,
    dc2W: 0.10,
    dwW: 0.05,
    truckDef: TRUCKS.AASHTO,
    impactFactor: 0.33,
    laneLoad: 0.64,
    distFactor: 0.6,
    phiC: 1.0,
    phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true },
    legalGammaLL: 1.80,
    deck: { ts: 8, fc: 4.0, haunch: 2, girderSpacing: 96, beffOverride: 0 },
    studs: { diameter: 0.75, Fu: 60, perRow: 2 }
  });
} catch (err) {
  threw = /simple-span/i.test(err.message);
}
assert(threw, 'Unsupported analysisModel throws actionable simple-span error');

threw = false;
try {
  runCompositeRating({
    sectionType: 'rolled',
    rolledSection: 'W33x130',
    Fy: 50,
    spanFt: 60,
    Lb: 20,
    Cb: 1.0,
    stiffenerSpacing: 0,
    checkPoints: [],
    dc1W: 0.80,
    dc2W: 0.10,
    dwW: 0.05,
    truckDef: TRUCKS.AASHTO,
    impactFactor: 0.33,
    laneLoad: 0.64,
    distFactor: 0.6,
    phiC: 1.0,
    phiS: 1.0,
    methods: { lrfr: true, lfr: true, asr: true },
    legalGammaLL: 1.80,
    deck: { ts: 8, fc: 4000, haunch: 2, girderSpacing: 96, beffOverride: 0 },
    studs: { diameter: 0.75, Fu: 60, perRow: 2 }
  });
} catch (err) {
  threw = /ksi/i.test(err.message);
}
assert(threw, 'Unit guard catches deck.fc entered in psi instead of ksi');

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
