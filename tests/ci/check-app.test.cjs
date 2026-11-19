const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { plan } = require('../../scripts/ci/check-app.cjs');
const { apps } = require('../../scripts/ci/apps.cjs');
const root = path.resolve(__dirname, '../..');
test('every scheduled command resolves to an existing workspace task or browser test', () => {
  for (const app of Object.keys(apps)) for (const profile of ['focused', 'regression']) for (const browser of ['chromium', 'webkit']) {
    for (const [command, args] of plan(app, profile, browser)) {
      if (command === 'node') { assert.ok(fs.existsSync(path.join(root, args[0]))); continue; }
      assert.equal(command, 'npm');
      const workspace = args.find(a => a.startsWith('--workspace=')).split('=')[1];
      const directory = path.join(root, 'apps', workspace);
      if (args[0] === 'run') assert.ok(JSON.parse(fs.readFileSync(path.join(directory, 'package.json'))).scripts[args[1]], `${app}: ${args[1]}`);
      else assert.ok(fs.existsSync(path.join(directory, args.at(-1))));
    }
  }
});
test('focused checks retain audio, instrument input and song fingerings without exhaustive catalogs', () => {
  const text = app => JSON.stringify(plan(app, 'focused'));
  assert.match(text('dorego'), /test:desktop/);
  assert.match(text('notewise'), /test:midi/);
  assert.match(text('notewise'), /backing-mixer/);
  assert.match(text('songalong'), /test:fingerings/);
  assert.match(text('songalong'), /hymn-playback.browser/);
  for (const app of Object.keys(apps)) assert.doesNotMatch(text(app), /test:catalog|test:visual|test:backing-genres|test:offline/);
});
test('exhaustive suites remain available in the regression profile and Firefox is not a CI engine', () => {
  assert.match(JSON.stringify(plan('songalong', 'regression')), /test:catalog/);
  assert.match(JSON.stringify(plan('notewise', 'regression')), /test:backing-genres/);
  assert.match(JSON.stringify(plan('soundglow', 'regression')), /test:visual/);
  assert.throws(() => plan('songalong', 'focused', 'firefox'));
});
