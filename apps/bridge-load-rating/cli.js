#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  resolveTruckDefinition,
  runCli,
  getCanonicalDeterioration
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'bridge-load-rating';

const context = createContext();
loadScripts(__dirname, ['../bridge-live-load/trucks.js', '../bridge-live-load/analysis.js', 'rating-engine.js'], context);

const TRUCKS = getGlobal(context, 'TRUCKS') || {};
const runLoadRating = getGlobal(context, 'runLoadRating');

function mapCanonicalDeterioration(input) {
  const canonical = getCanonicalDeterioration(input);
  const mapped = resolveTruckDefinition(input, TRUCKS);

  mapped.rebarLayers = (mapped.rebarLayers || []).map((layer) => ({
    ...layer,
    lossPercent: canonical.rebarPct
  }));
  mapped.stirrupLoss = canonical.rebarPct;

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/bridge-load-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'not_applicable',
          rebar: 'mapped_to_rebarLayers_and_stirrupLoss',
          prestress: 'not_applicable'
        }
      },
      result: runLoadRating(mapped)
    };
  }
});
