#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  runCli,
  getCanonicalDeterioration,
  buildCodeReferences
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'cmp-culvert-rating';

const context = createContext();
loadScripts(__dirname, ['rating-engine.js'], context);

const runCMPCulvertRating = getGlobal(context, 'runCMPCulvertRating');
const createDefaultCMPCulvertInput = getGlobal(context, 'createDefaultCMPCulvertInput');

function mapCanonicalDeterioration(input) {
  const baseInput = (input && input.useDefaultInput === true && typeof createDefaultCMPCulvertInput === 'function')
    ? createDefaultCMPCulvertInput()
    : input;

  const canonical = getCanonicalDeterioration(baseInput);
  const mapped = { ...baseInput };
  mapped.deterioration = {
    ...(mapped.deterioration || {}),
    steel: {
      useSegmentedLoss: false,
      uniformLossPercent: canonical.steelPct,
      crownLossPercent: canonical.steelPct,
      springlineLossPercent: canonical.steelPct,
      invertLossPercent: canonical.steelPct
    },
    rebar: {
      lossPercent: canonical.rebarPct
    },
    prestress: {
      lossPercent: canonical.prestressPct
    }
  };

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/cmp-culvert-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    const rawResult = runCMPCulvertRating(mapped);
    const { generatedAt, ...stableResult } = rawResult || {};
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'mapped_to_deterioration.steel.*LossPercent',
          rebar: 'mapped_to_deterioration.rebar.lossPercent',
          prestress: 'mapped_to_deterioration.prestress.lossPercent'
        }
      },
      codeReferences: buildCodeReferences({
        toolId: TOOL_ID,
        enginePath: '/apps/cmp-culvert-rating/rating-engine.js',
        sourceFiles: [
          '/apps/cmp-culvert-rating/rating-engine.js'
        ],
        governingCode: ['AASHTO MBE (culvert rating workflow)', 'AASHTO LRFD culvert and serviceability checks'],
        keyFunctions: [
          'computeRingCompression',
          'computeRingBending',
          'computeBuckling',
          'computeSeamCapacity',
          'runCMPCulvertRating'
        ],
        sectionLossHandling: {
          steel: 'Mapped to uniform/crown/springline/invert loss fields.',
          rebar: 'Mapped to `deterioration.rebar.lossPercent`.',
          prestress: 'Mapped to `deterioration.prestress.lossPercent`.'
        }
      }),
      result: stableResult
    };
  }
});
