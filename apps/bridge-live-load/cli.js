#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  resolveTruckDefinition,
  runCli
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'bridge-live-load';

const context = createContext();
loadScripts(__dirname, ['trucks.js', 'analysis.js'], context);

const TRUCKS = getGlobal(context, 'TRUCKS') || {};
const runFullAnalysis = getGlobal(context, 'runFullAnalysis');
const runFullAnalysisWithOptions = getGlobal(context, 'runFullAnalysisWithOptions');

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/bridge-live-load/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  prepareInput: (input) => resolveTruckDefinition(input, TRUCKS),
  execute: (input) => ({
    tool: TOOL_ID,
    result: (runFullAnalysisWithOptions || runFullAnalysis)(
      input.spans,
      Number(input.deadLoadW || 0),
      Number(input.wearingSurfaceW || 0),
      input.truckDef,
      Number(input.impactFactor || 0),
      Number(input.laneLoadW || input.laneLoad || 0),
      { incrementFt: Number(input.incrementFt || 1) }
    )
  })
});
