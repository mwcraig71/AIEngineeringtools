/**
 * RC flat slab rating deterministic QA tests
 * Run: node test-rating-engine.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const files = [
  '../bridge-live-load/trucks.js',
  '../bridge-live-load/analysis.js',
  'rating-engine.js'
];

for (const f of files) {
  const code = fs.readFileSync(path.join(__dirname, f), 'utf8');
  vm.runInThisContext(code, { filename: f });
}

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (expected ${b}, got ${a})`);
}

function runWithLoss(losses) {
  const input = createDefaultFlatSlabInput();
  input.deterioration.rebarLossPercent = losses.rebar;
  input.deterioration.steelLossPercent = losses.steel;
  input.deterioration.prestressLossPercent = losses.prestress;
  input.deterioration.cfrpLossPercent = losses.cfrp || 0;
  return runRCFlatSlabRating(input);
}

console.log('\n=== Baseline no-loss case ===');
{
  const r = runWithLoss({ rebar: 0, steel: 0, prestress: 0 });
  assert(r.cases.design.limitStates.length === 3, 'Three design limit states reported');
  assert(r.cases.permit.limitStates.length === 3, 'Three permit limit states reported');
  assert(r.deteriorationSummary.materials.rebarBottom.originalArea === r.deteriorationSummary.materials.rebarBottom.effectiveArea, 'No-loss keeps rebar area unchanged');
  assert(r.cases.design.governing.value > -2 && r.cases.design.governing.value < 6, 'Baseline governing RF in expected broad range');
}

console.log('\n=== Partial loss cases (10/25/50) ===');
{
  const r10 = runWithLoss({ rebar: 10, steel: 10, prestress: 10 });
  const r25 = runWithLoss({ rebar: 25, steel: 25, prestress: 25 });
  const r50 = runWithLoss({ rebar: 50, steel: 50, prestress: 50 });

  const rf10 = r10.cases.design.governing.value;
  const rf25 = r25.cases.design.governing.value;
  const rf50 = r50.cases.design.governing.value;

  assert(rf10 >= rf25 && rf25 >= rf50, 'Governing design RF decreases with 10/25/50% combined loss');
  assert(r50.deteriorationSummary.materials.prestress.effectiveArea < r10.deteriorationSummary.materials.prestress.effectiveArea, 'Prestress effective area decreases as loss increases');
}

console.log('\n=== Severe loss case (>=75) ===');
{
  const r = runWithLoss({ rebar: 80, steel: 80, prestress: 80 });
  assert(r.cases.design.governing.value < runWithLoss({ rebar: 25, steel: 25, prestress: 25 }).cases.design.governing.value, '80% loss is worse than 25% loss');
}

console.log('\n=== Independent loss toggles ===');
{
  const base = runWithLoss({ rebar: 0, steel: 0, prestress: 0 });
  const onlyRebar = runWithLoss({ rebar: 40, steel: 0, prestress: 0 });
  const onlySteel = runWithLoss({ rebar: 0, steel: 40, prestress: 0 });
  const onlyPrestress = runWithLoss({ rebar: 0, steel: 0, prestress: 40 });

  assert(onlyRebar.deteriorationSummary.materials.rebarBottom.effectiveArea < base.deteriorationSummary.materials.rebarBottom.effectiveArea, 'Rebar-only loss reduces rebar effective area');
  assert(onlySteel.deteriorationSummary.materials.structuralSteel.effectiveArea < base.deteriorationSummary.materials.structuralSteel.effectiveArea, 'Steel-only loss reduces steel effective area');
  assert(onlyPrestress.deteriorationSummary.materials.prestress.effectiveArea < base.deteriorationSummary.materials.prestress.effectiveArea, 'Prestress-only loss reduces prestress effective area');
}

console.log('\n=== Monotonic regression with increasing loss ===');
{
  const levels = [0, 10, 25, 50, 75, 100];
  const rfs = levels.map((lvl) => runWithLoss({ rebar: lvl, steel: lvl, prestress: lvl }).cases.design.governing.value);
  for (let i = 1; i < rfs.length; i++) {
    assert(rfs[i] <= rfs[i - 1] + 1e-9, `RF at ${levels[i]}% (${rfs[i].toFixed(3)}) <= RF at ${levels[i - 1]}% (${rfs[i - 1].toFixed(3)})`);
  }
}

console.log('\n=== Validation and 100% edge behavior ===');
{
  const allGone = runWithLoss({ rebar: 100, steel: 100, prestress: 100, cfrp: 100 });
  assertClose(allGone.deteriorationSummary.materials.rebarTop.effectiveArea, 0, 1e-10, '100% rebar loss gives zero top rebar area');
  assertClose(allGone.deteriorationSummary.materials.prestress.effectiveArea, 0, 1e-10, '100% prestress loss gives zero prestress area');
  assertClose(allGone.deteriorationSummary.materials.structuralSteel.effectiveArea, 0, 1e-10, '100% steel loss gives zero structural steel area');
  assertClose(allGone.deteriorationSummary.materials.cfrp.totalEffectiveArea, 0, 1e-10, '100% CFRP loss gives zero CFRP strip area');

  let threw = false;
  try {
    runWithLoss({ rebar: -1, steel: 0, prestress: 0 });
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Loss below 0% throws validation error');

  threw = false;
  try {
    runWithLoss({ rebar: 0, steel: 101, prestress: 0 });
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Loss above 100% throws validation error');
}

console.log('\n=== CFRP varying width strips behavior ===');
{
  const baseInput = createDefaultFlatSlabInput();
  const base = runRCFlatSlabRating(baseInput);
  const noCfrpInput = createDefaultFlatSlabInput();
  noCfrpInput.cfrp.strips = [];
  const noCfrp = runRCFlatSlabRating(noCfrpInput);

  const expectedArea =
    (4 * 0.07 * 5) +
    (8 * 0.07 * 3) +
    (12 * 0.07 * 2);
  const posInvBase = base.cases.design.limitStates.find(ls => ls.limitState === 'positive_flexure').rating.inventory;
  const posInvNo = noCfrp.cases.design.limitStates.find(ls => ls.limitState === 'positive_flexure').rating.inventory;

  assertClose(base.deteriorationSummary.materials.cfrp.totalOriginalArea, expectedArea, 1e-10, 'CFRP strip total original area matches varying strip definition');
  assert(posInvBase > posInvNo, 'CFRP strips improve positive flexure inventory RF versus no-CFRP case');

  const withCfrpLossInput = createDefaultFlatSlabInput();
  withCfrpLossInput.deterioration.cfrpLossPercent = 45;
  const withCfrpLoss = runRCFlatSlabRating(withCfrpLossInput);
  const posInvLoss = withCfrpLoss.cases.design.limitStates.find(ls => ls.limitState === 'positive_flexure').rating.inventory;
  assert(
    posInvLoss < posInvBase,
    'CFRP loss reduces positive flexure inventory RF'
  );
}

console.log('\n=== End-to-end realistic fixture and expected RF ranges ===');
{
  const input = createDefaultFlatSlabInput();
  input.spanFt = 48;
  input.loads.dead.dcKipPerFt = 1.2;
  input.loads.dead.dwKipPerFt = 0.3;
  input.loads.live.distributionFactor = 0.58;
  input.loads.live.designRearSpacingFt = 20;
  input.deterioration = { rebarLossPercent: 15, steelLossPercent: 10, prestressLossPercent: 20 };

  const r = runRCFlatSlabRating(input);
  const designGov = r.cases.design.governing.value;
  const permitGov = r.cases.permit.governing.value;

  assert(designGov > -1.5 && designGov < 4.5, `Design governing RF in documented range (-1.5, 4.5): ${designGov.toFixed(3)}`);
  assert(permitGov > -1.5 && permitGov < 5.5, `Permit governing RF in documented range (-1.5, 5.5): ${permitGov.toFixed(3)}`);
}

console.log('\n=== Analysis model + unit guards ===');
{
  let threw = false;
  const badModel = createDefaultFlatSlabInput();
  badModel.analysisModel = 'two-span-continuous';
  try {
    runRCFlatSlabRating(badModel);
  } catch (err) {
    threw = /simple-span/i.test(err.message);
  }
  assert(threw, 'Unsupported analysisModel throws actionable simple-span error');

  threw = false;
  const badUnits = createDefaultFlatSlabInput();
  badUnits.materials.fcPsi = 5; // mistaken ksi value
  try {
    runRCFlatSlabRating(badUnits);
  } catch (err) {
    threw = /psi/i.test(err.message);
  }
  assert(threw, 'Unit guard catches fcPsi entered in ksi instead of psi');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
