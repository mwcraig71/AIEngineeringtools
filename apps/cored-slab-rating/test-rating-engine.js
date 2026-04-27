const fs = require('fs');
const vm = require('vm');

function assertClose(actual, expected, tol, label) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assert(cond, label) {
  if (!cond) throw new Error(label);
}

const ctx = { console, Math };
vm.createContext(ctx);
for (const file of [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'rating-engine.js'
]) {
  const fullPath = `${__dirname}/${file}`;
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), ctx, { filename: fullPath });
}

const runLoadRating = vm.runInContext('runLoadRating', ctx);
const TRUCKS = vm.runInContext('TRUCKS', ctx);

const base = {
  spanFt: 40,
  b: 48,
  h: 21,
  nVoids: 5,
  dVoid: 10,
  fc: 5000,
  girderSpacing: 4,
  strandType: '0.500',
  nStrands: 16,
  dp: 18,
  fpu: 270000,
  fpyRatio: 0.9,
  fpe: 150000,
  strandLoss: 0,
  mildAs: 0,
  mildFy: 60000,
  mildLoss: 0,
  mildD: 0,
  stirrupSize: 4,
  stirrupLegs: 2,
  stirrupSpacing: 12,
  stirrupLoss: 0,
  stirrupFy: 60000,
  dcW: 0.52,
  dwW: 0.093,
  truckDef: TRUCKS.AASHTO,
  impactFactor: 0.33,
  laneLoad: 0.64,
  distFactor: 0.6,
  phiC: 1,
  phiS: 1,
  methods: { lrfr: true, lfr: true, asr: true },
  legalGammaLL: 1.8
};

const singleLayout = runLoadRating({
  ...base,
  strandLayout: [{ count: 16, depth: 18, debondLengthFt: 0 }]
});

const fallbackSingle = runLoadRating({ ...base });

assertClose(singleLayout.strandInfo.dp, 18, 1e-6, 'single-row dp');
assertClose(singleLayout.strandInfo.effectiveAps, 16 * 0.153, 1e-6, 'single-row Aps');
assertClose(singleLayout.phiMn, fallbackSingle.phiMn, 1e-6, 'single-row layout equals legacy scalar behavior (phiMn)');
assertClose(singleLayout.lrfr.design_inventory.rf, fallbackSingle.lrfr.design_inventory.rf, 1e-6, 'single-row layout equals legacy scalar behavior (LRFR RF)');

const multiLayout = runLoadRating({
  ...base,
  strandLayout: [
    { count: 8, depth: 17.5, debondLengthFt: 0 },
    { count: 8, depth: 18.5, debondLengthFt: 0 }
  ]
});

assertClose(multiLayout.strandInfo.effectiveAps, 16 * 0.153, 1e-6, 'multi-row total Aps');
assertClose(multiLayout.strandInfo.dp, 18, 1e-6, 'multi-row weighted dp');
assertClose(multiLayout.phiMn, singleLayout.phiMn, 1e-6, 'multi-row symmetric layout equals single centroid case (phiMn)');

const debondLayout = runLoadRating({
  ...base,
  strandLayout: [
    { count: 8, depth: 17.5, debondLengthFt: 0 },
    { count: 8, depth: 18.5, debondLengthFt: 8 }
  ]
});

assert(debondLayout.strandInfo.effectiveApsMoment > debondLayout.strandInfo.effectiveApsShear,
  'debonded strand row drops out at shear section before flexure section');
assert(debondLayout.strandInfo.layout.some(r => r.debondLengthFt > 0 && !r.shearActive),
  'debonded row marked inactive for shear where appropriate');

let threw = false;
try {
  runLoadRating({ ...base, analysisModel: 'two-span-continuous' });
} catch (err) {
  threw = /simple-span/i.test(err.message);
}
assert(threw, 'unsupported analysisModel throws actionable simple-span error');

threw = false;
try {
  runLoadRating({ ...base, fpu: 270 });
} catch (err) {
  threw = /fpu/i.test(err.message);
}
assert(threw, 'unit guard catches fpu entered in ksi instead of psi');

console.log('cored-slab-rating: all tests passed');
