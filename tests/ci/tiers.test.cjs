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

test('tier rename preserves every pre-migration command and its order', () => {
  const baseline = require('./fixtures/tier-coverage.json');
  assert.equal(Object.keys(baseline).length, 20);
  for (const [key, expected] of Object.entries(baseline)) {
    const [app, tier, group, browser] = key.split('/');
    const commands = plan(app, tier, browser, group);
    assert.equal(commands.length, expected.commands, key);
    assert.equal(createHash('sha256').update(JSON.stringify(commands)).digest('hex'), expected.sha256, key);
  }
});

test('local CI and Nightly graphs use the central browser policy and retain their tier', async () => {
  for (const tier of Object.keys(tiers)) {
    const opts = options(['--tier', tier, '--all']);
    const selected = await selection(opts);
    const directories = Object.fromEntries(['shared', ...selected.apps, 'accounts-chromium', 'accounts-webkit'].map(name => [name, `/private/${name}`]));
    const tasks = graph(selected, opts, directories);
    assert(tasks.every(task => task.env.CI_TIER === tier));
    assert.equal(tasks.filter(task => /^accounts-.*:tests$/.test(task.id)).length, tiers[tier].browsers.length);
    assert(tasks.some(task => task.id.includes(':editions:')));
  }
  assert.throws(() => compare({ inventory: { tier: 'ci' } }, { inventory: { tier: 'nightly' } }), /tiers differ/);
});
