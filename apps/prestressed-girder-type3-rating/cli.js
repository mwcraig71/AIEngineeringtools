#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  runCli,
  getCanonicalDeterioration
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'prestressed-girder-type3-rating';

const context = createContext();
loadScripts(__dirname, ['../bridge-live-load/trucks.js', '../bridge-live-load/analysis.js', 'rating-engine.js'], context);

const runTypeIIIRating = getGlobal(context, 'runTypeIIIRating');
const createDefaultTypeIIIInput = getGlobal(context, 'createDefaultTypeIIIInput');

function mapCanonicalDeterioration(input) {
  const baseInput = (input && input.useDefaultInput === true && typeof createDefaultTypeIIIInput === 'function')
    ? createDefaultTypeIIIInput()
    : input;

  const canonical = getCanonicalDeterioration(baseInput);
  const mapped = { ...baseInput };
  mapped.deterioration = {
    ...(mapped.deterioration || {}),
    loss_rebar: canonical.rebarPct,
    loss_stirrup: canonical.rebarPct,
    loss_strand: canonical.prestressPct,
    loss_structural_steel: canonical.steelPct,
    prestress_stress_reduction: canonical.prestressPct
  };

  return { mapped, canonical };
}

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/prestressed-girder-type3-rating/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    const { mapped, canonical } = mapCanonicalDeterioration(input);
    return {
      tool: TOOL_ID,
      canonicalDeterioration: {
        ...canonical,
        applicability: {
          steel: 'mapped_to_deterioration.loss_structural_steel',
          rebar: 'mapped_to_deterioration.loss_rebar_and_loss_stirrup',
          prestress: 'mapped_to_deterioration.loss_strand_and_prestress_stress_reduction'
        }
      },
      result: runTypeIIIRating(mapped)
    };
  }
});
