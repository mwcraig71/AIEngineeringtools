#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const APPS = [
  'bridge-live-load',
  'bridge-load-rating',
  'cmp-culvert-rating',
  'composite-steel-girder',
  'cored-slab-rating',
  'curved-steel-girder-layout',
  'prestressed-girder-type3-rating',
  'rc-flat-slab-rating',
  'steel-girder-rating'
];

const LOSS_SERIES = [0, 20, 40, 60, 80, 100];
const SCORE_EPS = 1e-9;

function sampleInputPath(app) {
  const candidates = [
    path.join(ROOT, 'apps', app, 'examples', 'cli-sample-input.json'),
    path.join(ROOT, 'apps', app, 'examples', 'type3-sample-input.json')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No sample input found for ${app}`);
}

function runCliWithInputPath(app, inputPath) {
  const cliPath = path.join(ROOT, 'apps', app, 'cli.js');
  return execFileSync('node', [cliPath, '--input', inputPath, '--compact'], {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function runCliWithInputObject(app, inputObj) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `str85-${app}-`));
  const inputPath = path.join(dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(inputObj), 'utf8');
  try {
    const raw = runCliWithInputPath(app, inputPath);
    return JSON.parse(raw);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function minRfFromTable(table) {
  let min = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(table || {})) {
    const row = table[key];
    if (!row || !Number.isFinite(Number(row.rf))) continue;
    min = Math.min(min, Number(row.rf));
  }
  return min;
}

function governingScore(app, output) {
  const result = output.result || {};
  switch (app) {
    case 'bridge-load-rating':
      return Number(result.phiMn);
    case 'cored-slab-rating':
      return Number(result.phiMn);
    case 'prestressed-girder-type3-rating':
      return Number(
        result.sensitivity
        && result.sensitivity.governingDeterioratedRF
        && result.sensitivity.governingDeterioratedRF.rf
      );
    case 'steel-girder-rating':
      return Number(
        (Array.isArray(result.pointResults) ? result.pointResults.find((row) => row && row.hasLoss) : null)?.phiMn
      );
    case 'composite-steel-girder':
      return Number(
        (Array.isArray(result.pointResults) ? result.pointResults.find((row) => row && row.hasLoss) : null)?.phiMn
      );
    case 'rc-flat-slab-rating': {
      const design = result.cases && result.cases.design && result.cases.design.governing
        ? Number(result.cases.design.governing.value)
        : Number.NaN;
      const permit = result.cases && result.cases.permit && result.cases.permit.governing
        ? Number(result.cases.permit.governing.value)
        : Number.NaN;
      return Math.min(design, permit);
    }
    case 'cmp-culvert-rating': {
      const rows = Array.isArray(result.deteriorated) ? result.deteriorated : [];
      const first = rows[0];
      return Number(first && first.capacities && first.capacities.bendingKipFtPerFt);
    }
    default:
      return Number.NaN;
  }
}

function deterministicCheck(app) {
  const input = sampleInputPath(app);
  const run1 = runCliWithInputPath(app, input);
  const run2 = runCliWithInputPath(app, input);
  return {
    app,
    pass: run1 === run2
  };
}

function monotonicChecks(app) {
  const inputPath = sampleInputPath(app);
  const baseInput = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const baseOutput = runCliWithInputObject(app, baseInput);
  const applicability = baseOutput.canonicalDeterioration
    && baseOutput.canonicalDeterioration.applicability;

  if (!applicability) {
    return {
      app,
      pass: true,
      skipped: true,
      reason: 'no canonical deterioration contract'
    };
  }

  const dimensions = ['steel', 'rebar', 'prestress'];
  const series = {};
  let pass = true;
  const failures = [];

  for (const dim of dimensions) {
    if (applicability[dim] === 'not_applicable') continue;

    const points = [];
    let prev = Number.POSITIVE_INFINITY;
    for (const loss of LOSS_SERIES) {
      const nextInput = {
        ...baseInput,
        deterioration: {
          steelPct: 0,
          rebarPct: 0,
          prestressPct: 0,
          ...(baseInput.deterioration && typeof baseInput.deterioration === 'object'
            ? baseInput.deterioration
            : {}),
          [`${dim}Pct`]: loss
        }
      };
      const out = runCliWithInputObject(app, nextInput);
      const score = governingScore(app, out);
      if (!Number.isFinite(score)) {
        pass = false;
        failures.push(`${dim}: non-finite score at ${loss}%`);
      } else if (score > prev + SCORE_EPS) {
        pass = false;
        failures.push(`${dim}: score increased at ${loss}% (${score} > ${prev})`);
      }
      prev = score;
      points.push({ lossPct: loss, score });
    }
    series[dim] = points;
  }

  return {
    app,
    pass,
    skipped: false,
    applicability,
    series,
    failures
  };
}

function main() {
  const deterministic = APPS.map(deterministicCheck);
  const monotonic = APPS.map(monotonicChecks);

  const deterministicPass = deterministic.every((row) => row.pass);
  const monotonicPass = monotonic.every((row) => row.pass);
  const overallPass = deterministicPass && monotonicPass;

  const report = {
    issue: 'STR-85',
    scope: 'QA verify STR-83 per-app CLI shims deterministic contract + deterioration monotonicity',
    generatedAtUtc: new Date().toISOString(),
    deterministic,
    monotonic,
    summary: {
      deterministicPass,
      monotonicPass,
      overallPass
    }
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(overallPass ? 0 : 1);
}

main();
