/**
 * QA tests for Type III prestressed girder rating engine.
 * Run with: node test-rating-engine.js
 */

const fs = require('fs');
const vm = require('vm');

const ctx = vm.createContext({
  Math, Array, Float64Array, Infinity, console, parseInt, parseFloat,
  Object, Number, isFinite, NaN, undefined, null: null, true: true, false: false
});

const files = [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'rating-engine.js'
];

for (const f of files) {
  const code = fs.readFileSync(__dirname + '/' + f, 'utf8');
  vm.runInContext(`(function() { ${code}
    if (typeof TRUCKS !== 'undefined') this.TRUCKS = TRUCKS;
    if (typeof ANALYSIS_POINTS !== 'undefined') this.ANALYSIS_POINTS = ANALYSIS_POINTS;
    if (typeof getTruckAxles !== 'undefined') this.getTruckAxles = getTruckAxles;
    if (typeof getTandemAxles !== 'undefined') this.getTandemAxles = getTandemAxles;
    if (typeof truckEnvelopeSimple !== 'undefined') this.truckEnvelopeSimple = truckEnvelopeSimple;
    if (typeof TYPE_III_PRESET !== 'undefined') this.TYPE_III_PRESET = TYPE_III_PRESET;
    if (typeof REBAR_AREAS !== 'undefined') this.REBAR_AREAS = REBAR_AREAS;
    if (typeof STRAND_AREAS !== 'undefined') this.STRAND_AREAS = STRAND_AREAS;
    if (typeof computeTypeIIISectionProperties !== 'undefined') this.computeTypeIIISectionProperties = computeTypeIIISectionProperties;
    if (typeof computeEffectivePrestress !== 'undefined') this.computeEffectivePrestress = computeEffectivePrestress;
    if (typeof computeFlexuralCapacity !== 'undefined') this.computeFlexuralCapacity = computeFlexuralCapacity;
    if (typeof computeShearCapacity !== 'undefined') this.computeShearCapacity = computeShearCapacity;
    if (typeof createDefaultTypeIIIInput !== 'undefined') this.createDefaultTypeIIIInput = createDefaultTypeIIIInput;
    if (typeof runTypeIIIRating !== 'undefined') this.runTypeIIIRating = runTypeIIIRating;
  }).call(this);`, ctx);
}

const computeTypeIIISectionProperties = ctx.computeTypeIIISectionProperties;
const computeEffectivePrestress = ctx.computeEffectivePrestress;
const createDefaultTypeIIIInput = ctx.createDefaultTypeIIIInput;
const runTypeIIIRating = ctx.runTypeIIIRating;

let pass = 0;
let fail = 0;

function assert(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.log('FAIL: ' + msg);
  }
}

function assertClose(actual, expected, tol, msg) {
  assert(Math.abs(actual - expected) <= tol, `${msg}; expected ${expected}, got ${actual}`);
}

console.log('\n=== 1. Type III geometry checks ===');
{
  const s = computeTypeIIISectionProperties();

  // Hand-check using I-shape decomposition:
  // Ag = 20*7 + 7*(45-7-8) + 26*8 = 558 in^2
  assertClose(s.Ag, 558, 0.01, 'Gross area Ag');

  // Centroid from top (manual weighted average)
  const yManual = (140 * 3.5 + 210 * 22 + 208 * 41) / 558;
  assertClose(s.yBar, yManual, 0.001, 'Centroid yBar');

  // Section modulus consistency
  assertClose(s.St, s.Ig / s.yBar, 1e-6, 'Top section modulus relation');
  assertClose(s.Sb, s.Ig / (s.depth - s.yBar), 1e-6, 'Bottom section modulus relation');
}

console.log('\n=== 2. Effective prestress checks ===');
{
  const input = createDefaultTypeIIIInput();
  const out = computeEffectivePrestress(input, {
    loss_strand: 10,
    loss_structural_steel: 5,
    prestress_stress_reduction: 8
  });

  const original = 34 * 0.217;
  assertClose(out.originalAps, original, 1e-6, 'Original Aps');
  assertClose(out.effectiveAps, original * 0.9 * 0.95, 1e-6, 'Aps with strand and steel losses');

  const fpeExpected = 202000 * (1 - 0.22) * (1 - 0.08);
  assertClose(out.fpe, fpeExpected, 1e-6, 'Effective prestress stress with long-term + corrosion stress losses');
}

console.log('\n=== 3. Monotonic RF deterioration checks ===');
{
  function govRFWith(update) {
    const input = createDefaultTypeIIIInput();
    Object.assign(input.deterioration, update);
    const r = runTypeIIIRating(input);
    return r.deteriorated.lrfr.design_inventory.rf;
  }

  const vars = ['loss_rebar', 'loss_stirrup', 'loss_strand'];

  for (const key of vars) {
    const losses = [0, 10, 20, 30, 40];
    const rfs = losses.map(v => govRFWith({ [key]: v }));

    for (let i = 1; i < rfs.length; i++) {
      assert(rfs[i] <= rfs[i - 1] + 1e-9, `${key} monotonic decrease at ${losses[i]}% (${rfs[i]} <= ${rfs[i - 1]})`);
    }
    assert(rfs[rfs.length - 1] < rfs[0], `${key} shows net RF reduction from 0% to ${losses[losses.length - 1]}% loss`);
    console.log(`${key}: ${rfs.map(v => v.toFixed(3)).join(', ')}`);
  }
}

console.log('\n=== 4. Baseline vs deteriorated comparison check ===');
{
  const input = createDefaultTypeIIIInput();
  input.deterioration.loss_rebar = 15;
  input.deterioration.loss_stirrup = 10;
  input.deterioration.loss_strand = 8;
  input.deterioration.prestress_stress_reduction = 7;

  const r = runTypeIIIRating(input);

  assert(r.baseline && r.deteriorated, 'Both baseline and deteriorated results returned in one run');
  assert(r.sensitivity.deltaRF <= 0, 'Deteriorated RF not better than baseline');
  assert(r.deteriorated.flexure.phiMn <= r.baseline.flexure.phiMn + 1e-9, 'Deterioration reduces flexural capacity');
  assert(r.deteriorated.shear.phiVn <= r.baseline.shear.phiVn + 1e-9, 'Deterioration reduces shear capacity');
}

console.log('\n=== 5. Deterministic regression checks ===');
{
  const baselineInput = createDefaultTypeIIIInput();
  const baseline = runTypeIIIRating(baselineInput);

  assertClose(
    baseline.baseline.flexure.phiMn,
    4236.531320807111,
    1e-6,
    'Baseline phiMn regression'
  );
  assertClose(
    baseline.baseline.shear.phiVn,
    94.83409564538056,
    1e-6,
    'Baseline phiVn regression'
  );
  assertClose(
    baseline.baseline.lrfr.design_inventory.rf,
    0.09585370024058226,
    1e-9,
    'Baseline LRFR design inventory RF regression'
  );
  assertClose(
    baseline.baseline.lfr.operating.rf,
    0.12872201049675203,
    1e-9,
    'Baseline LFR operating RF regression'
  );

  const sample = JSON.parse(
    fs.readFileSync(__dirname + '/examples/type3-sample-input.json', 'utf8')
  );
  const sampleResult = runTypeIIIRating(sample);
  assertClose(
    sampleResult.deteriorated.flexure.phiMn,
    4069.591397121013,
    1e-6,
    'Sample deteriorated phiMn regression'
  );
  assertClose(
    sampleResult.deteriorated.shear.phiVn,
    77.91268147213327,
    1e-6,
    'Sample deteriorated phiVn regression'
  );
  assert(
    sampleResult.sensitivity.deltaRF < 0,
    'Sample deterioration decreases governing RF'
  );
}

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
