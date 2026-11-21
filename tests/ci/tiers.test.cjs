const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { tiers, tier, fromEvent } = require('../../scripts/ci/tiers.cjs');
const { options, selection, graph } = require('../../scripts/ci/local.cjs');
const { plan } = require('../../scripts/ci/test-strategy.cjs');
const { compare } = require('../../scripts/ci/compare.cjs');

test('CI and Nightly are the only tiers, with explicit event and publication policy', () => {
  assert.deepEqual(Object.keys(tiers), ['ci', 'nightly']);
  assert.deepEqual(Object.values(tiers).map(value => value.name), ['CI', 'Nightly']);
  for (const value of ['focused', 'regression', 'editions', 'full', 'accounts']) {
    assert.throws(() => tier(value));
    assert.throws(() => options(['--tier', value]));
  }
  assert.throws(() => options(['--full']));
  for (const event of ['push', 'pull_request']) assert.equal(fromEvent(event, 'nightly'), 'ci');
  assert.equal(fromEvent('schedule', 'ci'), 'nightly');
  for (const value of Object.keys(tiers)) assert.equal(fromEvent('workflow_dispatch', value), value);
  assert.equal(tiers.nightly.publishes, false);
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.doesNotMatch(workflow, /CI_FULL|inputs\.full/);
  assert.equal((workflow.match(/needs\.changes\.outputs\.tier == 'ci'/g) || []).length, 4);
});

test('local CI and Nightly graphs use the central browser policy and retain their tier', async () => {
  for (const tier of Object.keys(tiers)) {
    const opts = options(['--tier', tier, '--all']);
    const selected = await selection(opts);
    const directories = Object.fromEntries(['shared', ...selected.apps, 'accounts-chromium', 'accounts-webkit'].map(name => [name, require('node:path').resolve(__dirname, '../..')]));
    const tasks = graph(selected, opts, directories);
    assert(tasks.every(task => task.env.CI_TIER === tier));
    assert.equal(tasks.filter(task => /^accounts-.*:tests$/.test(task.id)).length, tier === 'nightly' ? 2 : 0);
    assert.equal(tasks.some(task => task.id.includes(':editions:')), tier === 'nightly');
  }
  assert.throws(() => compare({ inventory: { tier: 'ci' } }, { inventory: { tier: 'nightly' } }), /tiers differ/);
});

test('bounded CI builds all apps with one shared preparation and retains isolation locks', () => {
  const path = require('node:path');
  const { fastGraph } = require('../../scripts/ci/fast-local.cjs');
  const apps = ['dorego', 'notewise', 'songalong', 'soundglow'];
  const tasks = fastGraph({ apps, accounts: true }, path.resolve(__dirname, '../..'));
  assert.equal(tiers.ci.localBudgetMs, 60000);
  assert.equal(tasks.filter(task => task.id === 'shared:diagnostics').length, 1);
  assert(tasks.some(task => task.id === 'shared:music'));
  assert(tasks.some(task => task.id === 'shared:contracts'));
  for (const app of apps) {
    const build = tasks.find(task => task.id === `${app}:build`);
    assert(build.args.includes('--prepared'));
    assert(build.needs.includes('shared:diagnostics'));
    assert(tasks.some(task => task.id === `${app}:ci:core:chromium:smoke`));
  }
  assert(tasks.find(task => task.id === 'dorego:ci:core:chromium:0').locks.includes('realtime-audio'));
  assert(!tasks.some(task => /accounts-.*:backend|:editions:/.test(task.id)));
  assert.throws(() => plan('songalong', 'ci', 'chromium', 'editions'), /Nightly/);
});

// Guard the current executable model, without freezing historical aliases.
test('Nightly owns CI execution files and schedules each file once per engine', () => {
  const { executions, duplicates } = require('../../scripts/ci/coverage.cjs');
  for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) {
    const all = tiers.nightly.browsers.flatMap(browser => {
      const files = executions(app, 'nightly', browser);
      assert.deepEqual(duplicates(files), {}, `${app}/${browser}: repeated test execution`);
      return files;
    });
    for (const file of executions(app, 'ci')) assert(all.includes(file), `${app}: CI execution missing from Nightly: ${file}`);
  }
});

test('Soundglow output mutation finishes before browser readers in both runners', async () => {
  const { fastGraph } = require('../../scripts/ci/fast-local.cjs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const nightly = options(['--tier', 'nightly', '--all']);
  const selected = await selection(nightly);
  const directories = Object.fromEntries(['shared', ...selected.apps, 'accounts-chromium', 'accounts-webkit'].map(name => [name, root]));
  for (const tasks of [fastGraph({ apps: ['soundglow'] }, root), graph(selected, nightly, directories)]) {
    const units = tasks.filter(task => task.args.includes('test:unit') && task.args.includes('--workspace=soundglow'));
    assert.equal(units.length, 1, 'Node checks have one owner, independent of browser count');
    for (const task of tasks.filter(task => /^soundglow:(?:ci|nightly):/.test(task.id) || task.id === 'soundglow:visual-fixture')) {
      if (task !== units[0]) assert(task.needs.includes(units[0].id), `${task.id} reads mutable build output`);
    }
  }
});

test('every GitHub edition shard is required and their union covers each discovered file exactly once', () => {
  const { matrix, editionFiles } = require('../../scripts/ci/test-strategy.cjs');
  const { commandTasks } = require('../../scripts/ci/task-graph.cjs');
  const { partition } = require('../../scripts/ci/shard.cjs');
  for (const browser of tiers.nightly.browsers) {
    const rows = matrix('songalong', 'nightly').include.filter(row => row.browser === browser && row.group === 'editions');
    assert.equal(rows.length, 2);
    assert(rows.every(row => row.timeout === 15 && row.shards === 2));
    const tasks = rows.flatMap(row => commandTasks('songalong', 'nightly', browser, undefined, { group: 'editions', shard: `${row.shard}/${row.shards}` }));
    assert.deepEqual(tasks.map(task => task.args.at(-1)).sort(), editionFiles());
    assert.equal(new Set(tasks.map(task => task.id)).size, tasks.length);
    assert(tasks.every(task => task.needs.includes('songalong:build')));
  }
  for (const count of [1, 3, 5, 7]) {
    const files = Array.from({ length: count }, (_, index) => index);
    const total = Math.min(2, count);
    const union = Array.from({ length: total }, (_, index) => partition(files, `${index + 1}/${total}`)).flat();
    assert.deepEqual(union.sort((a, b) => a - b), files);
  }
  assert.throws(() => commandTasks('songalong', 'nightly', 'webkit', undefined, { shard: '1/2' }), /Only edition/);
  assert.throws(() => commandTasks('songalong', 'nightly', 'webkit', undefined, { group: 'editions', shard: '7/7' }), /empty/);
  const workflow = fs.readFileSync('.github/workflows/validate-app.yml', 'utf8');
  assert.match(workflow, /check-app\.cjs.*matrix\.shard.*matrix\.shards/);
  assert.match(workflow, /group: .*matrix\.shard.*matrix\.shards/);
  assert.match(workflow, /name: timings-.*matrix\.shard.*matrix\.shards/);
});
