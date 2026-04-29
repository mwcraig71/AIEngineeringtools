#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  resolveTruckDefinition,
  runCli,
  getCanonicalDeterioration,
  buildCodeReferences
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
      codeReferences: buildCodeReferences({
        toolId: TOOL_ID,
        enginePath: '/apps/bridge-load-rating/rating-engine.js',
        sourceFiles: [
          '/apps/bridge-load-rating/rating-engine.js',
          '/apps/bridge-live-load/analysis.js',
          '/apps/bridge-live-load/trucks.js'
        ],
        governingCode: ['AASHTO MBE (LRFR/LFR/ASR)', 'AASHTO LRFD 5.5.4.2', 'AASHTO LRFD 5.7.3.3'],
        keyFunctions: [
          'computeGrossSection',
          'computeEffectiveRebar',
          'computeMn',
          'computeVn',
          'computeLiveLoadDemand',
          'runLoadRating'
        ],
        sectionLossHandling: {
          steel: 'Accepted as canonical input; N.A. for RC tee-beam capacity in this tool.',
          rebar: 'Mapped to every rebar layer `lossPercent` and `stirrupLoss`.',
          prestress: 'Accepted as canonical input; N.A. for non-prestressed member model.'
        }
      }),
      result: runLoadRating(mapped)
    };
  }
});
