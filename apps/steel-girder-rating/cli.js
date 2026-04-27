#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  resolveTruckDefinition,
  runCli,
  getCanonicalDeterioration
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'steel-girder-rating';

const context = createContext();
loadScripts(__dirname, ['../bridge-live-load/trucks.js', '../bridge-live-load/analysis.js', 'steel-sections.js', 'steel-rating-engine.js'], context);

const TRUCKS = getGlobal(context, 'TRUCKS') || {};
const runSteelRating = getGlobal(context, 'runSteelRating');
const getWShapeProps = getGlobal(context, 'getWShapeProps');
const wShapeToSectionParams = getGlobal(context, 'wShapeToSectionParams');

function buildSteelLossCheckPoint(input, steelPct) {
  const factor = Math.max(1 - steelPct / 100, 1e-6);
  let dims = null;

  if (input.sectionType === 'rolled') {
    const ws = getWShapeProps(input.rolledSection);
    dims = wShapeToSectionParams(ws);
  } else {
    dims = input.plateGirder;
  }

  return {
    location: Number(input.spanFt) / 2,
    twRemaining: Number(dims.tw) * factor,
    tfcRemaining: Number(dims.tfc) * factor,
    tftRemaining: Number(dims.tft) * factor,
    bfcRemaining: Number(dims.bfc) * factor,
    bftRemaining: Number(dims.bft) * factor
  };
}

function mapCanonicalDeterioration(input) {
  const canonical = getCanonicalDeterioration(input);
  const mapped = resolveTruckDefinition(input, TRUCKS);

  mapped.checkPoints = Array.isArray(mapped.checkPoints) ? mapped.checkPoints.slice() : [];
  mapped.checkPoints.push(buildSteelLossCheckPoint(mapped, canonical.steelPct));

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/steel-girder-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'mapped_to_midspan_checkPoint_remaining_dims',
          rebar: 'not_applicable',
          prestress: 'not_applicable'
        }
      },
      result: runSteelRating(mapped)
    };
  }
});
