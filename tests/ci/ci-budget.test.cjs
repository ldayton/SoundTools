const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { fastLocal } = require('../../scripts/ci/fast-local.cjs');

test('expired end-to-end budget fails before test execution and releases the host lock', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-budget-'));
  const previousExitCode = process.exitCode;
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    fs.mkdirSync(path.join(root, 'packages/music-practice/tests'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests/ci'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"budget-fixture","version":"1.0.0"}');
    git(['init', '--quiet']); git(['add', '.']);
    git(['-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    const sha = git(['rev-parse', 'HEAD']);
    await assert.rejects(fastLocal({ workers: 2, workersExplicit: true }, {
      root, sha, selected: { apps: [], accounts: false }, started: performance.now() - 60001,
    }), /60-second budget before dependency installation/);
    const runs = fs.readdirSync(path.join(root, 'work/ci-results'));
    assert.equal(runs.length, 1);
    const directory = path.join(root, 'work/ci-results', runs[0]);
    const result = JSON.parse(fs.readFileSync(path.join(directory, 'local.json')));
    assert.equal(result.passed, false);
    assert.equal(result.budgetMs, 60000);
    assert(result.elapsedMs > 60000);
    assert(!fs.existsSync(path.join(directory, 'bootstrap')), 'Expired runs must not start installation');
    assert(!fs.existsSync(path.join(directory, 'results.json')), 'No test graph should run after the budget is consumed');
    assert(!fs.existsSync(path.join(root, '.git/soundtools-ci.lock')));
    assert.equal(process.exitCode, 1);
  } finally { process.exitCode = previousExitCode; fs.rmSync(root, { recursive: true, force: true }); }
});
