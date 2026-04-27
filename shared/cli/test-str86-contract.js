#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'shared', 'library', 'bridge-engineering-tools.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

const LOAD_RATING_IDS = new Set(
  manifest.tools
    .filter((tool) => tool.category === 'bridge-load-rating')
    .map((tool) => tool.id)
);

function runNode(args) {
  return spawnSync('node', args, {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function sampleInputAbsolute(tool) {
  return path.join(ROOT, String(tool.sampleInput || '').replace(/^\//, ''));
}

function sha256(text) {
  return `sha256:${crypto.createHash('sha256').update(text).digest('hex')}`;
}

function parseJsonOrNull(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkHelp(tool) {
  const cliPath = path.join(ROOT, 'apps', tool.id, 'cli.js');
  const proc = runNode([cliPath, '--help']);
  ensure(proc.status === 0, `--help failed (exit ${proc.status})`);
  ensure(proc.stdout.includes('Usage:'), '--help output missing Usage');
  ensure(proc.stdout.includes('Formats:'), '--help output missing Formats');
  return { pass: true };
}

function checkUnknownArgStructuredError(tool) {
  const cliPath = path.join(ROOT, 'apps', tool.id, 'cli.js');
  const proc = runNode([cliPath, '--definitely-unknown-flag']);
  ensure(proc.status !== 0, 'unknown arg should be non-zero');

  const errJson = parseJsonOrNull(proc.stderr);
  ensure(errJson && typeof errJson === 'object', 'stderr is not JSON');
  ensure(errJson.ok === false, 'stderr JSON missing ok=false');
  ensure(errJson.tool === tool.id, `stderr JSON tool mismatch: expected ${tool.id}`);
  ensure(errJson.error && typeof errJson.error.message === 'string', 'stderr JSON missing error.message');
  ensure(errJson.error.message.includes('Unknown argument'), 'stderr JSON missing unknown argument message');
  return { pass: true };
}

function checkDeterministicAndFingerprint(tool) {
  const cliPath = path.join(ROOT, 'apps', tool.id, 'cli.js');
  const input = sampleInputAbsolute(tool);

  const run1 = runNode([cliPath, '--input', input, '--compact']);
  const run2 = runNode([cliPath, '--input', input, '--compact']);

  ensure(run1.status === 0, `run1 failed (exit ${run1.status})`);
  ensure(run2.status === 0, `run2 failed (exit ${run2.status})`);
  ensure(run1.stdout === run2.stdout, 'repeat run output bytes differ');

  const actualFingerprint = sha256(run1.stdout);
  ensure(
    actualFingerprint === tool.expectedOutputFingerprint,
    `fingerprint mismatch expected=${tool.expectedOutputFingerprint} actual=${actualFingerprint}`
  );

  const parsed = parseJsonOrNull(run1.stdout);
  ensure(parsed && typeof parsed === 'object', 'stdout is not JSON');

  if (LOAD_RATING_IDS.has(tool.id)) {
    const canonical = parsed.canonicalDeterioration;
    ensure(canonical && typeof canonical === 'object', 'missing canonicalDeterioration for load-rating app');
    ensure(Number.isFinite(Number(canonical.steelPct)), 'canonicalDeterioration.steelPct missing/invalid');
    ensure(Number.isFinite(Number(canonical.rebarPct)), 'canonicalDeterioration.rebarPct missing/invalid');
    ensure(Number.isFinite(Number(canonical.prestressPct)), 'canonicalDeterioration.prestressPct missing/invalid');
    ensure(canonical.applicability && typeof canonical.applicability === 'object', 'missing applicability map');
    for (const key of ['steel', 'rebar', 'prestress']) {
      ensure(typeof canonical.applicability[key] === 'string', `missing applicability.${key}`);
    }
  }

  return {
    pass: true,
    actualFingerprint
  };
}

function checkMdxContract(tool) {
  const cliPath = path.join(ROOT, 'apps', tool.id, 'cli.js');
  const input = sampleInputAbsolute(tool);
  const proc = runNode([cliPath, '--input', input, '--format', 'mdx']);

  if (tool.id === 'curved-steel-girder-layout') {
    ensure(proc.status === 0, `curved mdx should succeed (exit ${proc.status})`);
    ensure(proc.stdout.trim().length > 0, 'curved mdx output is empty');
    return { pass: true, mode: 'supported' };
  }

  ensure(proc.status !== 0, `mdx should fail for ${tool.id}`);
  const errJson = parseJsonOrNull(proc.stderr);
  ensure(errJson && errJson.ok === false, 'mdx failure stderr is not structured JSON');
  ensure(typeof errJson.error?.message === 'string', 'mdx failure missing error.message');
  ensure(
    errJson.error.message.includes('--format mdx is only supported for curved-steel-girder-layout.'),
    `unexpected mdx failure message: ${errJson.error.message}`
  );
  return { pass: true, mode: 'unsupported' };
}

function main() {
  const checks = [];
  let failed = false;

  for (const tool of manifest.tools) {
    const perTool = {
      app: tool.id,
      help: null,
      deterministic: null,
      mdxContract: null,
      structuredError: null
    };

    const runCheck = (name, fn) => {
      try {
        perTool[name] = fn(tool);
      } catch (err) {
        failed = true;
        perTool[name] = {
          pass: false,
          error: err && err.message ? err.message : String(err)
        };
      }
    };

    runCheck('help', checkHelp);
    runCheck('structuredError', checkUnknownArgStructuredError);
    runCheck('deterministic', checkDeterministicAndFingerprint);
    runCheck('mdxContract', checkMdxContract);
    checks.push(perTool);
  }

  const summary = {
    helpPass: checks.every((row) => row.help && row.help.pass),
    structuredErrorPass: checks.every((row) => row.structuredError && row.structuredError.pass),
    deterministicPass: checks.every((row) => row.deterministic && row.deterministic.pass),
    mdxContractPass: checks.every((row) => row.mdxContract && row.mdxContract.pass)
  };
  summary.overallPass = Object.values(summary).every(Boolean);

  const report = {
    issue: 'STR-86',
    scope: 'CLI contract hardening across 9 bridge apps',
    generatedAtUtc: new Date().toISOString(),
    checks,
    summary
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(summary.overallPass ? 0 : 1);
}

main();
