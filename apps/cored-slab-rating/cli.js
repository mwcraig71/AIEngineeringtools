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

const TOOL_ID = 'cored-slab-rating';

const context = createContext();
loadScripts(__dirname, ['../bridge-live-load/trucks.js', '../bridge-live-load/analysis.js', 'rating-engine.js'], context);

const TRUCKS = getGlobal(context, 'TRUCKS') || {};
const runLoadRating = getGlobal(context, 'runLoadRating');

function mapCanonicalDeterioration(input) {
  const canonical = getCanonicalDeterioration(input);
  const mapped = resolveTruckDefinition(input, TRUCKS);

  mapped.strandLoss = canonical.prestressPct;
  mapped.mildLoss = canonical.rebarPct;
  mapped.stirrupLoss = canonical.rebarPct;

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/cored-slab-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'not_applicable',
          rebar: 'mapped_to_mildLoss_and_stirrupLoss',
          prestress: 'mapped_to_strandLoss'
        }
      },
      codeReferences: buildCodeReferences({
        toolId: TOOL_ID,
        enginePath: '/apps/cored-slab-rating/rating-engine.js',
        sourceFiles: [
          '/apps/cored-slab-rating/rating-engine.js',
          '/apps/bridge-live-load/analysis.js',
          '/apps/bridge-live-load/trucks.js'
        ],
        governingCode: ['AASHTO MBE (LRFR/LFR/ASR)', 'AASHTO LRFD prestressed concrete provisions'],
        keyFunctions: [
          'computeEffectivePrestress',
          'computeFlexuralCapacity',
          'computeShearCapacity',
          'computeLiveLoadDemand',
          'runLoadRating'
        ],
        sectionLossHandling: {
          steel: 'Accepted as canonical input; N.A. for cored slab strand/rebar model.',
          rebar: 'Mapped to `mildLoss` and `stirrupLoss`.',
          prestress: 'Mapped to `strandLoss`.'
        }
      }),
      result: runLoadRating(mapped)
    };
  }
});
