#!/usr/bin/env node

const {
  createContext,
  loadScripts,
  getGlobal,
  runCli
} = require('../../shared/cli/shim-core');

const TOOL_ID = 'curved-steel-girder-layout';

const context = createContext();
loadScripts(__dirname, ['layout-engine.js'], context);

const buildCurvedGirderLayout = getGlobal(context, 'buildCurvedGirderLayout');
const emitMdxInput = getGlobal(context, 'emitMdxInput');
const parseMdxInput = getGlobal(context, 'parseMdxInput');

runCli({
  toolId: TOOL_ID,
  name: `${TOOL_ID} CLI shim`,
  usage: 'node apps/curved-steel-girder-layout/cli.js <input.json> [--out <path>] [--format json|text|mdx] [--help]',
  execute: (input) => {
    if (input && input.mode === 'parse') {
      const layout = parseMdxInput(input.mdxInput || '');
      return {
        tool: TOOL_ID,
        layout,
        mdxInput: emitMdxInput(layout)
      };
    }

    const layout = buildCurvedGirderLayout(input);
    return {
      tool: TOOL_ID,
      layout,
      mdxInput: emitMdxInput(layout)
    };
  },
  formatMdx: (output) => output.mdxInput
});
