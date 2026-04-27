/**
 * Regression checks for curved-steel-girder-layout engine.
 * Run with: node apps/curved-steel-girder-layout/test-layout-engine.js
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
  Number,
  Date,
  JSON,
  String,
  parseFloat,
  parseInt,
  Infinity,
  isFinite
};
vm.createContext(ctx);

const enginePath = path.join(__dirname, 'layout-engine.js');
vm.runInContext(fs.readFileSync(enginePath, 'utf8'), ctx, { filename: enginePath });

const normalizeLayoutInputs = vm.runInContext('normalizeLayoutInputs', ctx);
const buildCurvedGirderLayout = vm.runInContext('buildCurvedGirderLayout', ctx);
const emitMdxInput = vm.runInContext('emitMdxInput', ctx);
const parseMdxInput = vm.runInContext('parseMdxInput', ctx);

console.log('\n=== 1. Input normalization/validation ===');
{
  const ok = normalizeLayoutInputs({
    radiusFt: 1000,
    centralAngleDeg: 30,
    girderCount: 4,
    girderSpacingFt: 9,
    stationIntervalFt: 25
  });
  assert(ok.girderCount === 4, 'Girder count normalized to integer');

  const fallbackNames = normalizeLayoutInputs({
    projectName: '   ',
    mdxSoftwareVersion: ' ',
    radiusFt: 1000,
    centralAngleDeg: 30,
    girderCount: 4,
    girderSpacingFt: 9,
    stationIntervalFt: 25
  });
  assert(fallbackNames.projectName === 'CURVED_STEEL_GIRDER_LAYOUT', 'Blank project name falls back to default');
  assert(fallbackNames.mdxSoftwareVersion === 'MDX-2025.1-ASSUMED', 'Blank MDX software version falls back to default');

  let caught = false;
  try {
    normalizeLayoutInputs({
      radiusFt: 100,
      centralAngleDeg: 220,
      girderCount: 3,
      girderSpacingFt: 10,
      stationIntervalFt: 20
    });
  } catch (_) {
    caught = true;
  }
  assert(caught, 'Invalid central angle is rejected');
}

console.log('\n=== 2. Geometry checks ===');
{
  const layout = buildCurvedGirderLayout({
    projectName: 'Test Curve',
    mdxSoftwareVersion: 'MDX-2025.1-ASSUMED',
    radiusFt: 100,
    centralAngleDeg: 90,
    curveDirection: 'left',
    girderCount: 3,
    girderSpacingFt: 10,
    stationIntervalFt: 50
  });

  assertClose(layout.alignment.centerlineArcLengthFt, 157.08, 0.02, 'Centerline arc length matches R*theta');
  assertClose(layout.alignment.centerlineChordFt, 141.421, 0.02, 'Chord length matches 2Rsin(theta/2)');
  assert(layout.girders.length === 3, 'Three girders generated');
  assertClose(layout.girders[0].radiusFt, 90, 1e-6, 'Inside girder radius');
  assertClose(layout.girders[2].radiusFt, 110, 1e-6, 'Outside girder radius');
  assert(layout.layout.stationsCenterlineFt[0] === 0, 'Stations start at 0');
  assertClose(layout.layout.stationsCenterlineFt[layout.layout.stationsCenterlineFt.length - 1], 157.08, 0.02, 'Stations end at arc length');
  assert(layout.spanLayout.spanCount === 3, 'Default support layout uses 3 spans');
  assert(layout.spanLayout.supportStationsFt.length === 4, 'Three spans produce four supports');
}

console.log('\n=== 3. MDX Software output shape ===');
{
  const layout = buildCurvedGirderLayout({
    radiusFt: 500,
    centralAngleDeg: 20,
    curveDirection: 'right',
    girderCount: 5,
    girderSpacingFt: 9,
    stationIntervalFt: 30
  });
  const mdx = emitMdxInput(layout);

  assert(mdx.includes('! MDX SOFTWARE INPUT FILE (ASCII KEYWORD FORMAT)'), 'Has MDX Software ASCII header');
  assert(mdx.includes('BEGIN_GEOMETRY'), 'Includes geometry block');
  assert(mdx.includes('BEGIN_FRAMING'), 'Includes framing block');
  assert(mdx.includes('BEGIN_CROSS_FRAMES'), 'Includes cross-frame block');
  assert(mdx.includes('BEGIN_SECTION_SCHEDULE'), 'Includes section schedule block');
  assert(mdx.includes('BEGIN_SUPPORTS'), 'Includes supports block');
  assert(mdx.includes('BEGIN_COMPOSITE'), 'Includes composite block');
  assert(mdx.includes('STEEL_SECTION_LOSS_PERCENT='), 'Includes steel deterioration field');
  assert(mdx.includes('REBAR_SECTION_LOSS_PERCENT='), 'Includes rebar deterioration field');
  assert(mdx.includes('PRESTRESS_SECTION_LOSS_PERCENT='), 'Includes prestress deterioration field');
  assert(!mdx.includes('\r'), 'Uses canonical LF newlines');
}

console.log('\n=== 4. Golden ASCII bytes + round-trip import ===');
{
  const layout = buildCurvedGirderLayout({
    projectName: 'CURVED_4G_3SPAN_R900',
    mdxSoftwareVersion: 'MDX-2025.1-ASSUMED',
    generatedAt: '2026-04-27T00:00:00.000Z',
    radiusFt: 900,
    centralAngleDeg: 30,
    curveDirection: 'left',
    girderCount: 4,
    girderSpacingFt: 10,
    stationIntervalFt: 30,
    deterioration: {
      steelSectionLossPercent: 7.5,
      rebarSectionLossPercent: 2.0,
      prestressSectionLossPercent: 1.5
    }
  });
  const mdx = emitMdxInput(layout);
  const goldenPath = path.join(__dirname, 'fixtures/golden-curved-4g-3span-r900.dat');
  const goldenBytes = fs.readFileSync(goldenPath, 'utf8');

  assert(mdx === goldenBytes, 'ASCII output matches exact golden fixture bytes');

  const parsed = parseMdxInput(mdx);
  assert(parsed.meta.projectName === layout.meta.projectName, 'Round-trip: project name preserved');
  assert(parsed.meta.generatedAt === layout.meta.generatedAt, 'Round-trip: generatedAt preserved');
  assert(parsed.layout.stationLabels.join('|') === layout.layout.stationLabels.join('|'), 'Round-trip: station labels preserved');
  assert(parsed.mdxSoftwareVersion === layout.mdxSoftwareVersion, 'Round-trip: version assumption preserved');
  assertClose(parsed.meta.deterioration.steelSectionLossPercent, 7.5, 1e-9, 'Round-trip: steel deterioration preserved');
}

console.log('\n=== 5. Station labels deterministic formatting ===');
{
  const layout = buildCurvedGirderLayout({
    generatedAt: '2026-04-27T00:00:00.000Z',
    radiusFt: 100,
    centralAngleDeg: 90,
    curveDirection: 'left',
    girderCount: 3,
    girderSpacingFt: 10,
    stationIntervalFt: 50
  });
  assert(layout.layout.stationLabels[0] === '0+00.000', 'Station label starts at 0+00.000');
  assert(layout.layout.stationLabels[1] === '0+50.000', 'Second station label is 0+50.000');
  assert(layout.layout.stationLabels[layout.layout.stationLabels.length - 1] === '1+57.080', 'Last station label is stable and deterministic');
}

console.log('\n=== 6. Deterioration metadata validation ===');
{
  const layout = buildCurvedGirderLayout({
    generatedAt: '2026-04-27T00:00:00.000Z',
    radiusFt: 650,
    centralAngleDeg: 28,
    curveDirection: 'left',
    girderCount: 5,
    girderSpacingFt: 9.5,
    stationIntervalFt: 25,
    deterioration: {
      steelSectionLossPercent: 8.25,
      rebarSectionLossPercent: 3.5,
      prestressSectionLossPercent: 1.25
    }
  });
  assertClose(layout.meta.deterioration.steelSectionLossPercent, 8.25, 1e-9, 'Steel deterioration exported in metadata');
  assertClose(layout.meta.deterioration.rebarSectionLossPercent, 3.5, 1e-9, 'Rebar deterioration exported in metadata');
  assertClose(layout.meta.deterioration.prestressSectionLossPercent, 1.25, 1e-9, 'Prestress deterioration exported in metadata');

  let caught = false;
  try {
    buildCurvedGirderLayout({
      radiusFt: 650,
      centralAngleDeg: 28,
      curveDirection: 'left',
      girderCount: 5,
      girderSpacingFt: 9.5,
      stationIntervalFt: 25,
      deterioration: {
        steelSectionLossPercent: 120,
        rebarSectionLossPercent: 0,
        prestressSectionLossPercent: 0
      }
    });
  } catch (_) {
    caught = true;
  }
  assert(caught, 'Out-of-range deterioration is rejected');
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
