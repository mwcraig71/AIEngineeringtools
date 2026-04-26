/**
 * CMP culvert rating deterministic tests
 * Run: node apps/cmp-culvert-rating/test-rating-engine.js
 */

const {
  createDefaultCMPCulvertInput,
  runCMPCulvertRating,
  computeSteelThicknessByZone,
  computeEffectiveCompositeAreas,
  parseFillHeights
} = require('./rating-engine');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL: ' + msg);
  }
}

function assertClose(a, b, tol, msg) {
  assert(Math.abs(a - b) <= tol, `${msg} (expected ${b}, got ${a})`);
}

console.log('\n=== Fill-height parsing and validation ===');
{
  const fills = parseFillHeights([2, '4', 6.5]);
  assert(fills.length === 3, 'fill parser returns all valid heights');
  assertClose(fills[1], 4, 1e-12, 'string numeric fill converted correctly');

  let threw = false;
  try {
    parseFillHeights([]);
  } catch (err) {
    threw = true;
  }
  assert(threw, 'empty fill array throws');
}

console.log('\n=== Deterioration transforms ===');
{
  const input = createDefaultCMPCulvertInput();

  const steelBase = computeSteelThicknessByZone(input, input.deterioration, 'baseline');
  const steelDet = computeSteelThicknessByZone(input, input.deterioration, 'deteriorated');
  assert(steelDet.crownIn < steelBase.crownIn, 'deteriorated crown thickness reduced');
  assert(steelDet.invertIn < steelBase.invertIn, 'deteriorated invert thickness reduced');

  const compBase = computeEffectiveCompositeAreas(input, input.deterioration, 'baseline');
  const compDet = computeEffectiveCompositeAreas(input, input.deterioration, 'deteriorated');
  assert(compDet.rebarEffectiveIn2PerFt < compBase.rebarEffectiveIn2PerFt, 'rebar effective area reduced');
  assert(compDet.prestressEffectiveIn2PerFt < compBase.prestressEffectiveIn2PerFt, 'prestress effective area reduced');
}

console.log('\n=== Baseline vs deteriorated outputs for all fill heights ===');
{
  const input = createDefaultCMPCulvertInput();
  const out = runCMPCulvertRating(input);

  assert(out.resultsByFill.length === input.fillHeightsFt.length, 'one result row per fill height');
  assert(out.baseline.length === input.fillHeightsFt.length, 'baseline rows match fill count');
  assert(out.deteriorated.length === input.fillHeightsFt.length, 'deteriorated rows match fill count');

  for (let i = 0; i < out.resultsByFill.length; i++) {
    const row = out.resultsByFill[i];
    assert(row.sensitivity.deltaInventoryRF <= 1e-9, 'deterioration does not improve inventory RF');
    assert(row.sensitivity.deltaOperatingRF <= 1e-9, 'deterioration does not improve operating RF');
  }
}

console.log('\n=== Fill-height monotonic trend ===');
{
  const input = createDefaultCMPCulvertInput();
  input.fillHeightsFt = [1, 3, 5, 7, 9, 11];
  const out = runCMPCulvertRating(input);
  const invs = out.resultsByFill.map(r => r.deteriorated.governing.inventory.value);

  for (let i = 1; i < invs.length; i++) {
    assert(invs[i] <= invs[i - 1] + 1e-9, `deteriorated inventory RF decreases with fill depth (${invs[i]} <= ${invs[i - 1]})`);
  }
}

console.log('\n=== Segmented loss sensitivity ===');
{
  const input = createDefaultCMPCulvertInput();
  const base = runCMPCulvertRating(input).resultsByFill[2].deteriorated.governing.inventory.value;

  const worseInvert = createDefaultCMPCulvertInput();
  worseInvert.deterioration.steel.invertLossPercent = 45;
  const worse = runCMPCulvertRating(worseInvert).resultsByFill[2].deteriorated.governing.inventory.value;

  assert(worse <= base + 1e-9, 'higher segmented invert loss does not increase deteriorated RF');
}

console.log('\n=== Validation boundaries ===');
{
  const input = createDefaultCMPCulvertInput();
  input.deterioration.rebar.lossPercent = 101;

  let threw = false;
  try {
    runCMPCulvertRating(input);
  } catch (err) {
    threw = true;
  }
  assert(threw, 'loss > 100 throws validation');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
