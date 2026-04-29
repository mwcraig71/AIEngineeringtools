#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  runCli,
  getCanonicalDeterioration,
  buildCodeReferences
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'rc-flat-slab-rating';

const context = createContext();
loadScripts(__dirname, ['../bridge-live-load/trucks.js', '../bridge-live-load/analysis.js', 'rating-engine.js'], context);

const runRCFlatSlabRating = getGlobal(context, 'runRCFlatSlabRating');
const createDefaultFlatSlabInput = getGlobal(context, 'createDefaultFlatSlabInput');

function mapCanonicalDeterioration(input) {
  const baseInput = (input && input.useDefaultInput === true && typeof createDefaultFlatSlabInput === 'function')
    ? createDefaultFlatSlabInput()
    : input;

  const canonical = getCanonicalDeterioration(baseInput);
  const mapped = { ...baseInput };
  mapped.deterioration = {
    ...(mapped.deterioration || {}),
    steelPct: canonical.steelPct,
    rebarPct: canonical.rebarPct,
    prestressPct: canonical.prestressPct,
    steelLossPercent: canonical.steelPct,
    rebarLossPercent: canonical.rebarPct,
    prestressLossPercent: canonical.prestressPct
  };

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/rc-flat-slab-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'mapped_to_deterioration.steelLossPercent',
          rebar: 'mapped_to_deterioration.rebarLossPercent',
          prestress: 'mapped_to_deterioration.prestressLossPercent'
        }
      },
      codeReferences: buildCodeReferences({
        toolId: TOOL_ID,
        enginePath: '/apps/rc-flat-slab-rating/rating-engine.js',
        sourceFiles: [
          '/apps/rc-flat-slab-rating/rating-engine.js',
          '/apps/bridge-live-load/analysis.js',
          '/apps/bridge-live-load/trucks.js'
        ],
        governingCode: ['AASHTO MBE (LRFR/LFR/ASR)', 'AASHTO LRFD reinforced concrete slab provisions'],
        keyFunctions: [
          'computeSectionProperties',
          'computeFlexuralCapacity',
          'computeShearCapacity',
          'computeLiveLoadDemand',
          'runRCFlatSlabRating'
        ],
        sectionLossHandling: {
          steel: 'Mapped to `deterioration.steelLossPercent`.',
          rebar: 'Mapped to `deterioration.rebarLossPercent`.',
          prestress: 'Mapped to `deterioration.prestressLossPercent`.'
        }
      }),
      result: runRCFlatSlabRating(mapped)
    };
  }
});
