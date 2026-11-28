const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plan } = require('../../scripts/ci/check-app.cjs');
const { apps } = require('../../scripts/ci/apps.cjs');
const root = path.resolve(__dirname, '../..');
test('every scheduled command resolves to an existing workspace task or browser test', () => {
  for (const app of Object.keys(apps)) for (const profile of ['ci', 'nightly']) for (const browser of ['chromium', 'webkit']) {
    for (const [command, args] of plan(app, profile, browser)) {
      if (command === 'node') { for (const file of args.filter(arg => /\.(?:[cm]?js|tsx?)$/.test(arg))) assert.ok(fs.existsSync(path.join(root, file)), file); continue; }
      assert.equal(command, 'npm');
      const workspace = args.find(a => a.startsWith('--workspace=')).split('=')[1];
      const directory = path.join(root, 'apps', workspace);
      if (args[0] === 'run') assert.ok(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).scripts[args[1]], `${app}: ${args[1]}`);
      else assert.ok(fs.existsSync(path.join(directory, args.at(-1))));
    }
  }
});
test('CI prioritizes playback, MIDI and lifecycle without exhaustive loops', () => {
  const text = app => JSON.stringify(plan(app, 'ci'));
  assert.match(text('dorego'), /test:desktop/);
  assert.match(text('notewise'), /critical-midi/);
  assert.match(text('songalong'), /audio-lifecycle/);
  assert.match(text('songalong'), /guitar.browser/);
  const { executions } = require('../../scripts/ci/coverage.cjs');
  for (const file of ['apps/soundglow/tests/account-records.test.ts', 'apps/soundglow/tests/pitch-comparison/metrics.test.cjs']) assert(executions('soundglow', 'ci').includes(file));
  for (const app of Object.keys(apps)) assert.doesNotMatch(text(app), /test:catalog|test:visual|test:backing-genres|test:offline/);
});
test('exhaustive suites remain available in the regression profile and Firefox is not a CI engine', () => {
  assert.match(JSON.stringify(plan('songalong', 'nightly')), /test:catalog/);
  const { executions } = require('../../scripts/ci/coverage.cjs');
  const { leaves } = require('../../scripts/ci/inventory.cjs');
  const backing = leaves('npm', ['run', 'test:backing-genres', '--workspace=notewise']);
  for (const leaf of backing) assert(executions('notewise', 'nightly').includes(path.posix.join(leaf.cwd, leaf.args[0])), leaf.args[0]);
  assert.match(JSON.stringify(plan('soundglow', 'nightly')), /test:visual/);
  assert.throws(() => plan('songalong', 'ci', 'firefox'));
});
test('shared UI browser controls have one Nightly owner per engine', () => {
  const { executions } = require('../../scripts/ci/coverage.cjs');
  for (const browser of ['chromium', 'webkit']) {
    const scheduled = tier => Object.keys(apps).flatMap(app => executions(app, tier, browser)).filter(file => file === 'scripts/test-ui-controls.cjs');
    assert.equal(scheduled('nightly').length, 1);
    assert.equal(scheduled('ci').length, 0);
  }
});
