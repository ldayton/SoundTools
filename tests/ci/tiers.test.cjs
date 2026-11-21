const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
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

test('Nightly retains every command displaced from the former CI and Nightly inventories', () => {
  const baseline = require('./fixtures/tier-coverage.json');
  assert.equal(Object.keys(baseline).length, 20);
  for (const [key, expected] of Object.entries(baseline)) {
    const [app, , group, browser] = key.split('/');
    assert.equal(createHash('sha256').update(JSON.stringify(expected.plan)).digest('hex'), expected.sha256, key);
    const commands = new Set(plan(app, 'nightly', browser, group).map(command => JSON.stringify(command)));
    for (const command of expected.plan) assert(commands.has(JSON.stringify(command)), `${key}: lost ${JSON.stringify(command)}`);
  }
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

// The fast tier may evolve, but Nightly must always include its commands too.
test('Nightly is a command-level superset of current CI on both engines', () => {
  for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) for (const browser of tiers.nightly.browsers) {
    const nightly = new Set(plan(app, 'nightly', browser).map(command => JSON.stringify(command)));
    for (const command of plan(app, 'ci', browser)) assert(nightly.has(JSON.stringify(command)));
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
