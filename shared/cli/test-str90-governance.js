#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_PATH = path.join(ROOT, 'shared', 'library', 'bridge-engineering-tools.json');
const REQUIRED_LOSS_DIMS = ['steel', 'rebar', 'prestress'];
const VALID_COVERAGE_STATUS = new Set(['implemented', 'not_applicable']);

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function existsFromManifestPath(rawPath) {
  ensure(typeof rawPath === 'string' && rawPath.trim().length > 0, `invalid path value: ${rawPath}`);
  const abs = path.join(ROOT, rawPath.replace(/^\//, ''));
  ensure(fs.existsSync(abs), `missing path referenced by manifest: ${rawPath}`);
  return abs;
}

function checkGovernance(manifest) {
  ensure(manifest && typeof manifest === 'object', 'manifest is not an object');
  ensure(manifest.governance && typeof manifest.governance === 'object', 'manifest.governance is missing');

  const gov = manifest.governance;
  ensure(typeof gov.toolRoutingPolicy === 'string' && gov.toolRoutingPolicy.trim(), 'governance.toolRoutingPolicy missing');
  ensure(typeof gov.missingToolEscalation === 'string' && gov.missingToolEscalation.trim(), 'governance.missingToolEscalation missing');

  ensure(gov.loadRatingSectionLossContract && typeof gov.loadRatingSectionLossContract === 'object', 'governance.loadRatingSectionLossContract missing');
  const contract = gov.loadRatingSectionLossContract;

  ensure(Array.isArray(contract.requiredDimensions), 'loadRatingSectionLossContract.requiredDimensions must be an array');
  for (const dim of REQUIRED_LOSS_DIMS) {
    ensure(contract.requiredDimensions.includes(dim), `requiredDimensions missing "${dim}"`);
  }
  ensure(typeof contract.rule === 'string' && contract.rule.trim(), 'loadRatingSectionLossContract.rule missing');

  return {
    pass: true,
    requiredDimensions: contract.requiredDimensions
  };
}

function checkToolPaths(tool) {
  const checks = {};

  checks.entry = existsFromManifestPath(tool.entry);
  checks.engine = existsFromManifestPath(tool.engine);

  ensure(typeof tool.cli === 'string' && tool.cli.trim().length > 0, `${tool.id}: cli command missing`);
  const cliMatch = tool.cli.match(/node\s+([^\s]+\.js)/);
  ensure(cliMatch, `${tool.id}: cli command must include node <path>.js`);
  checks.cli = existsFromManifestPath(`/${cliMatch[1].replace(/^\//, '')}`);

  if (tool.test) {
    ensure(typeof tool.test === 'string' && tool.test.trim().length > 0, `${tool.id}: test command invalid`);
  }

  if (tool.sampleInput) {
    checks.sampleInput = existsFromManifestPath(tool.sampleInput);
  }

  return checks;
}

function checkLoadRatingCoverage(tool) {
  ensure(tool.sectionLossCoverage && typeof tool.sectionLossCoverage === 'object', `${tool.id}: sectionLossCoverage missing`);

  const details = {};
  for (const dim of REQUIRED_LOSS_DIMS) {
    const status = tool.sectionLossCoverage[dim];
    ensure(typeof status === 'string', `${tool.id}: sectionLossCoverage.${dim} missing`);
    ensure(
      VALID_COVERAGE_STATUS.has(status),
      `${tool.id}: sectionLossCoverage.${dim} must be one of ${Array.from(VALID_COVERAGE_STATUS).join(', ')}`
    );
    details[dim] = status;
  }

  return details;
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  ensure(Array.isArray(manifest.tools) && manifest.tools.length > 0, 'manifest.tools missing or empty');

  const governance = checkGovernance(manifest);
  const toolResults = [];
  let failed = false;

  for (const tool of manifest.tools) {
    const row = {
      app: tool.id,
      category: tool.category,
      paths: null,
      sectionLossCoverage: null,
      pass: true,
      errors: []
    };

    try {
      row.paths = checkToolPaths(tool);
      if (tool.category === 'bridge-load-rating') {
        row.sectionLossCoverage = checkLoadRatingCoverage(tool);
      }
    } catch (err) {
      row.pass = false;
      row.errors.push(err && err.message ? err.message : String(err));
      failed = true;
    }

    toolResults.push(row);
  }

  const summary = {
    governancePass: Boolean(governance && governance.pass),
    toolPass: toolResults.every((row) => row.pass),
    loadRatingCoveragePass: toolResults
      .filter((row) => row.category === 'bridge-load-rating')
      .every((row) => row.pass && row.sectionLossCoverage),
    overallPass: !failed
  };

  const report = {
    issue: 'STR-90',
    scope: 'continuous program improvement governance checks',
    generatedAtUtc: new Date().toISOString(),
    governance,
    tools: toolResults,
    summary
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(summary.overallPass ? 0 : 1);
}

main();
