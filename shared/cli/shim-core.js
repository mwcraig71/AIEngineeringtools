const fs = require('fs');
const path = require('path');
const vm = require('vm');
const util = require('util');

function createContext() {
  return vm.createContext({
    console,
    Math,
    JSON,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    RegExp,
    Float64Array,
    parseInt,
    parseFloat,
    Infinity,
    NaN,
    isFinite,
    isNaN,
    setTimeout,
    clearTimeout
  });
}

function loadScripts(appDir, scriptPaths, context) {
  for (const scriptPath of scriptPaths) {
    const fullPath = path.resolve(appDir, scriptPath);
    const code = fs.readFileSync(fullPath, 'utf8');
    vm.runInContext(code, context, { filename: fullPath });
  }
}

function getGlobal(context, name) {
  return vm.runInContext(`typeof ${name} !== 'undefined' ? ${name} : undefined`, context);
}

function parseArgs(argv) {
  const args = {
    help: false,
    format: 'json',
    inputPath: null,
    outputPath: null,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      args.help = true;
    } else if (arg === '--format') {
      i += 1;
      if (i >= argv.length) throw new Error('--format requires one of: json, text, mdx.');
      args.format = String(argv[i] || '').toLowerCase();
      if (!['json', 'text', 'mdx'].includes(args.format)) {
        throw new Error(`Unsupported --format value: ${argv[i]}`);
      }
    } else if (arg === '--compact') {
      args.pretty = false;
    } else if (arg === '--input' || arg === '-i') {
      i += 1;
      if (i >= argv.length) throw new Error('--input requires a file path.');
      args.inputPath = argv[i];
    } else if (arg === '--out' || arg === '--output' || arg === '-o') {
      i += 1;
      if (i >= argv.length) throw new Error('--out requires a file path.');
      args.outputPath = argv[i];
    } else if (!arg.startsWith('-') && !args.inputPath) {
      args.inputPath = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJsonInput(inputPath) {
  const raw = inputPath
    ? fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf8')
    : (!process.stdin.isTTY ? fs.readFileSync(0, 'utf8') : null);

  if (!raw || !raw.trim()) {
    throw new Error('No JSON input provided. Pass --input <file> or pipe JSON on stdin.');
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON input: ${err.message}`);
  }
}

function writeJsonOutput(output, args) {
  const text = JSON.stringify(output, null, args.pretty ? 2 : 0) + '\n';
  if (args.outputPath) {
    fs.writeFileSync(path.resolve(process.cwd(), args.outputPath), text, 'utf8');
  }
  process.stdout.write(text);
}

function writeTextOutput(text, args) {
  const out = String(text || '') + '\n';
  if (args.outputPath) {
    fs.writeFileSync(path.resolve(process.cwd(), args.outputPath), out, 'utf8');
  }
  process.stdout.write(out);
}

function writeErrorAndExit(options, err) {
  const body = {
    ok: false,
    tool: options.toolId || options.name || 'unknown-tool',
    error: {
      message: err && err.message ? err.message : String(err)
    }
  };
  process.stderr.write(JSON.stringify(body, null, 2) + '\n');
  process.exit(1);
}

function resolveTruckDefinition(input, trucksByKey) {
  if (!input || typeof input !== 'object') return input;
  if (input.truckDef && typeof input.truckDef === 'object') return input;

  let key = null;
  if (typeof input.truckDef === 'string') key = input.truckDef;
  if (!key && typeof input.truckId === 'string') key = input.truckId;
  if (!key && typeof input.truckKey === 'string') key = input.truckKey;

  if (!key) return input;

  if (!trucksByKey || typeof trucksByKey !== 'object' || !trucksByKey[key]) {
    const available = trucksByKey && typeof trucksByKey === 'object'
      ? Object.keys(trucksByKey).sort().join(', ')
      : '(none)';
    throw new Error(`Unknown truck key "${key}". Available keys: ${available}`);
  }

  return {
    ...input,
    truckDef: trucksByKey[key]
  };
}

function runCli(options) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(
        `${options.name}\n` +
        `Usage: ${options.usage}\n` +
        'Input: JSON via --input <file> (or first positional path) or stdin\n' +
        'Output: stdout (and optional --out <file>)\n' +
        'Formats: --format json|text|mdx\n'
      );
      return;
    }

    const input = readJsonInput(args.inputPath);
    const prepared = options.prepareInput ? options.prepareInput(input) : input;
    const output = options.execute(prepared);

    if (args.format === 'json') {
      writeJsonOutput(output, args);
      return;
    }

    if (args.format === 'text') {
      const text = options.formatText
        ? options.formatText(output)
        : util.inspect(output, { depth: null, colors: false, compact: false });
      writeTextOutput(text, args);
      return;
    }

    if (args.format === 'mdx') {
      if (!options.formatMdx) {
        throw new Error('--format mdx is only supported for curved-steel-girder-layout.');
      }
      writeTextOutput(options.formatMdx(output), args);
      return;
    }
  } catch (err) {
    writeErrorAndExit(options, err);
  }
}

function clampPercent(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`${label} must be between 0 and 100.`);
  }
  return n;
}

function getCanonicalDeterioration(input) {
  const det = (input && input.deterioration && typeof input.deterioration === 'object') ? input.deterioration : {};
  return {
    steelPct: clampPercent(det.steelPct || 0, 'deterioration.steelPct'),
    rebarPct: clampPercent(det.rebarPct || 0, 'deterioration.rebarPct'),
    prestressPct: clampPercent(det.prestressPct || 0, 'deterioration.prestressPct')
  };
}

module.exports = {
  createContext,
  loadScripts,
  getGlobal,
  resolveTruckDefinition,
  runCli,
  getCanonicalDeterioration
};
