/**
 * Basic tests for the steel girder rating engine.
 * Run with: node test-steel-engine.js
 */

// Load dependencies — use Function() to put everything in global scope
const fs = require('fs');
const path = require('path');

function loadGlobal(filePath) {
  const code = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
  const fn = new Function(code);
  fn.call(global);
}

// Assign to global so scripts see each other's globals
const scriptOrder = [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'steel-sections.js',
  'steel-rating-engine.js'
];
for (const s of scriptOrder) {
  const code = fs.readFileSync(path.join(__dirname, s), 'utf8');
  // Use vm to run in global context
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

// Test 1: W-shape database
console.log('\n=== W-Shape Database ===');
const w33 = getWShapeProps('W33x130');
assert(w33 !== null, 'W33x130 exists');
assert(w33.d === 33.09, 'W33x130 depth = 33.09');
assert(w33.A === 38.3, 'W33x130 area = 38.3');

// Test 2: Section property computation
console.log('\n=== Section Properties ===');
const params = wShapeToSectionParams(w33);
const section = computeSteelSectionProps(params.D, params.tw, params.bfc, params.tfc, params.bft, params.tft);
assert(approx(section.d, w33.d, 0.05), `Total depth ~ ${w33.d} (got ${section.d.toFixed(2)})`);
assert(section.A > 0, 'Area > 0');
assert(section.Ix > 0, 'Ix > 0');
assert(section.Zx > 0, 'Zx > 0');
// For doubly symmetric, ybar should be ~ d/2
assert(approx(section.ybar, section.d / 2, 0.5), `NA near mid-depth for symmetric section (ybar=${section.ybar.toFixed(2)})`);

// Test 3: Flexural capacity
console.log('\n=== Flexural Capacity ===');
const Fy = 50; // ksi
const Lb = 10; // ft (short unbraced length)
const moment = computeSteelMn(section, Fy, Lb, 1.0);
assert(moment.Mn > 0, 'Mn > 0');
assert(moment.Mp > 0, 'Mp > 0');
assert(moment.Mn <= moment.Mp + 0.1, 'Mn <= Mp');
assert(moment.phi === 1.0, 'phi = 1.0 for steel flexure');
console.log(`  Mn = ${moment.Mn.toFixed(1)} kip-ft, Mp = ${moment.Mp.toFixed(1)} kip-ft, My = ${moment.My.toFixed(1)} kip-ft`);
console.log(`  Web: ${moment.webClass}, Flange: ${moment.flangeClass}, Governs: ${moment.governs}`);
console.log(`  Lp = ${moment.Lp.toFixed(1)} ft, Lr = ${moment.Lr.toFixed(1)} ft`);

// Test 4: LTB reduction with long unbraced length
console.log('\n=== LTB Check ===');
const momentLong = computeSteelMn(section, Fy, 50, 1.0);
assert(momentLong.Mn < moment.Mn, `Mn with Lb=50ft (${momentLong.Mn.toFixed(1)}) < Mn with Lb=10ft (${moment.Mn.toFixed(1)})`);

// Test 5: Shear capacity
console.log('\n=== Shear Capacity ===');
const shear = computeSteelVn(section, Fy, 0);
assert(shear.Vn > 0, 'Vn > 0');
assert(shear.C > 0 && shear.C <= 1.0, 'C between 0 and 1');
console.log(`  Vn = ${shear.Vn.toFixed(1)} kip, Vp = ${shear.Vp.toFixed(1)} kip, C = ${shear.C.toFixed(3)}`);

// Test 6: Section loss
console.log('\n=== Section Loss ===');
const lostSection = applySectionLoss(params, { twRemaining: params.tw * 0.75, tftRemaining: params.tft * 0.8 });
assert(lostSection.tw < section.tw, 'Reduced web thickness');
assert(lostSection.A < section.A, 'Reduced area after loss');
assert(lostSection.Ix < section.Ix, 'Reduced Ix after loss');
const momentLost = computeSteelMn(lostSection, Fy, Lb, 1.0);
assert(momentLost.Mn < moment.Mn, 'Reduced Mn after section loss');

// Test 7: Full rating run
console.log('\n=== Full Rating (Rolled Section) ===');
const result = runSteelRating({
  sectionType: 'rolled',
  rolledSection: 'W33x130',
  Fy: 50,
  spanFt: 60,
  Lb: 20,
  Cb: 1.0,
  stiffenerSpacing: 0,
  checkPoints: [
    { location: 30, twRemaining: 0.45, tftRemaining: 0.7 }
  ],
  dcW: 0.5,
  dwW: 0.05,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.6,
  phiC: 1.0,
  phiS: 1.0,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.80
});

assert(result.pointResults.length >= 1, `Check points evaluated (got ${result.pointResults.length})`);
assert(result.governingResult !== null, 'Has governing result');
assert(result.governingResult.governingRF > 0, `Governing RF > 0 (got ${result.governingResult.governingRF.toFixed(3)})`);
console.log(`  Governing RF = ${result.governingResult.governingRF.toFixed(3)}`);
console.log(`  Governing: ${result.governingResult.governingLabel} at ${result.governingResult.label}`);
console.log(`  Check points: ${result.pointResults.map(p => p.label).join(', ')}`);

// Test 8: Plate girder
console.log('\n=== Full Rating (Plate Girder) ===');
const pgResult = runSteelRating({
  sectionType: 'plate',
  plateGirder: { D: 48, tw: 0.4375, bfc: 16, tfc: 1.25, bft: 16, tft: 1.25 },
  Fy: 50,
  spanFt: 80,
  Lb: 25,
  Cb: 1.0,
  stiffenerSpacing: 60,
  checkPoints: [],
  dcW: 0.6,
  dwW: 0.08,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.55,
  phiC: 0.95,
  phiS: 1.0,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.80
});

assert(pgResult.governingResult.governingRF > 0, `Plate girder RF > 0 (got ${pgResult.governingResult.governingRF.toFixed(3)})`);
console.log(`  Governing RF = ${pgResult.governingResult.governingRF.toFixed(3)}`);
console.log(`  Governing: ${pgResult.governingResult.governingLabel}`);

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
