/**
 * Regression + hand-calculation checks for bridge live-load analysis.
 * Run with: node apps/bridge-live-load/test-analysis.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
}

function assertClose(actual, expected, tol, label) {
  assert(Math.abs(actual - expected) <= tol, `${label} (expected ${expected}, got ${actual})`);
}

const ctx = {
  console,
  Math,
  Float64Array,
  Array,
  Object,
  Number,
  parseInt,
  parseFloat,
  Infinity,
  isFinite
};
vm.createContext(ctx);

for (const file of ['trucks.js', 'analysis.js']) {
  const fullPath = path.join(__dirname, file);
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: fullPath });
}

const TRUCKS = vm.runInContext('TRUCKS', ctx);
const getTruckAxles = vm.runInContext('getTruckAxles', ctx);
const simpleBeamUniformMomentShear = vm.runInContext('simpleBeamUniformMomentShear', ctx);
const simpleBeamPointLoadMomentShear = vm.runInContext('simpleBeamPointLoadMomentShear', ctx);
const solveContinuousUniform = vm.runInContext('solveContinuousUniform', ctx);
const runFullAnalysis = vm.runInContext('runFullAnalysis', ctx);
const runFullAnalysisWithOptions = vm.runInContext('runFullAnalysisWithOptions', ctx);

console.log('\n=== 1. Simple span uniform load hand-calc ===');
{
  const L = 40;
  const w = 1.0;
  const r = simpleBeamUniformMomentShear(L, w, 200);
  const mid = Math.floor(r.positions.length / 2);

  // Hand calc: Mmax = wL^2/8 = 200 kip-ft, Vleft = wL/2 = 20 kip
  assertClose(r.moments[mid], 200, 0.5, 'Simple span Mmax = wL^2/8');
  assertClose(r.shears[0], 20, 1e-6, 'Left reaction shear = wL/2');
  assertClose(r.shears[r.shears.length - 1], -20, 1e-6, 'Right reaction shear = -wL/2');
}

console.log('\n=== 2. Simple span point-load hand-calc ===');
{
  const L = 30;
  const P = 10;
  const a = 10;
  const r = simpleBeamPointLoadMomentShear(L, P, a, 300);

  // Hand calc: RL = P(L-a)/L = 6.667, RR = Pa/L = 3.333, M(a)=RL*a=66.667
  const iAtA = Math.round((a / L) * 300);
  assertClose(r.shears[0], 6.6666667, 1e-3, 'RL for eccentric point load');
  assertClose(r.moments[iAtA], 66.6666667, 0.2, 'Moment at load point');
  assertClose(r.shears[r.shears.length - 1], -3.3333333, 1e-3, 'RR sign convention at right');
}

console.log('\n=== 3. Continuous-span support moment hand-calc ===');
{
  const L = 50;
  const w = 1;
  const result = solveContinuousUniform([L, L], w);

  // Two equal spans with UDL on both spans: interior support moment = -wL^2/8
  assertClose(result.supportMoments[1], -312.5, 1.0, 'Interior support moment = -wL^2/8');
}

console.log('\n=== 4. Variable spacing + zero-live-load isolation ===');
{
  const aashto16 = getTruckAxles(TRUCKS.AASHTO, 16);
  assertClose(aashto16[2].position, 30, 1e-6, 'AASHTO rear axle spacing updates correctly');

  const noLiveTruck = {
    name: 'No live load control truck',
    axles: [{ weight: 0, position: 0 }],
    laneLoad: 0
  };

  const run = runFullAnalysis([40], 1.0, 0, noLiveTruck, 0, 0);
  // With zero lane/truck and w=1 dead load only, Mmax should still be wL^2/8.
  assertClose(run.maxMoment, 200, 0.5, 'Dead-load-only run matches simple hand calc');
}

console.log('\n=== 5. Increment tables for moment/shear output ===');
{
  const noLiveTruck = {
    name: 'No live load control truck',
    axles: [{ weight: 0, position: 0 }],
    laneLoad: 0
  };
  const run = runFullAnalysisWithOptions([10], 1.0, 0, noLiveTruck, 0, 0, { incrementFt: 1 });
  assert(run.forceTables && Array.isArray(run.forceTables.rows), 'Force tables are present');
  assert(run.forceTables.rows.length === 11, '1-ft increment yields 11 stations for 10-ft span');
  assertClose(run.forceTables.rows[0].stationFt, 0, 1e-9, 'First station is 0 ft');
  assertClose(run.forceTables.rows[run.forceTables.rows.length - 1].stationFt, 10, 1e-9, 'Last station is span end');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
