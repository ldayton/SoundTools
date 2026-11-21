// Executable testing policy. See docs/testing.md before changing suite ownership.
// CI calls explicit lanes, never a growing developer convenience umbrella.
const fs = require('node:fs');
const path = require('node:path');
const { apps } = require('./apps.cjs');
const { tiers, tier: validateTier } = require('./tiers.cjs');
const root = path.resolve(__dirname, '../..');
const budgets = Object.freeze({ ci: Object.freeze({ core: 10 }), nightly: Object.freeze({ core: 30, editions: 15 }) });
function editionFiles(directory = root) {
  return fs.readdirSync(path.join(directory, 'apps/songalong/tests'))
    .filter(file => file.endsWith('-editions.browser.ts')).sort()
    .map(file => `tests/${file}`);
}
const npm = (app, task) => ['npm', ['run', task, '--workspace=' + app]];
const script = (app, file) => ['npm', ['exec', '--workspace=' + app, '--', 'tsx', file]];
function matrix(app, tier) {
  validateTier(tier);
  if (!apps[app]) throw Error('Choose a known app');
  return { include: tiers[tier].browsers.flatMap(browser =>
    (app === 'songalong' && tier === 'nightly' ? ['core', 'editions'] : ['core']).flatMap(group => {
      // Two independent required edition jobs retain the 15-minute budget.
      // Partition the discovered registry, never a second hand-maintained list.
      const shards = group === 'editions' ? Math.min(2, editionFiles().length) : 1;
      if (!shards) throw Error('Nightly requires edition browser coverage');
      return Array.from({ length: shards }, (_, index) => ({ tier, group, browser, timeout: budgets[tier][group], shard: index + 1, shards }));
    })) };
}
function validateSelection(app, tier, browser, group) {
  validateTier(tier);
  if (!apps[app] || !['core', 'editions'].includes(group) || !['chromium', 'webkit'].includes(browser) || group === 'editions' && app !== 'songalong') throw Error('Choose a known app, coverage group and Chromium/WebKit');
}
function nightlyPlan(app, browser, group) {
  if (group === 'editions') return editionFiles().map(file => script(app, file));
  const tasks = {
    dorego: ['test:layout', 'test:browsers', ...(browser === 'chromium' ? ['test:diagnostics-ui', 'test:resilience'] : [])],
    notewise: ['test:layout', 'test:workspace', 'test:guitar', 'test:piano', 'test:practice', 'test:theory', 'test:navigation', 'test:midi', 'test:signatures', 'test:offline', 'test:backing', ...(browser === 'chromium' ? ['test:browser', 'test:piano-audio', 'test:diagnostics', 'test:backing-realism', 'test:backing-genres'] : [])],
    songalong: ['test:layout', 'test:split', 'test:sidebars', 'test:hymn-keys', 'test:stanzas', 'test:hymn-playback', 'test:sight', 'test:fingerings', 'test:offline', 'test:catalog', ...(browser === 'chromium' ? ['test:diagnostics'] : [])],
    soundglow: browser === 'webkit' ? ['test:browser-core', 'test:ui-browsers'] : ['test:unit', 'test:browser-core', 'test:updates', 'test:visual', 'test:resilience'],
  };
  const commands = tasks[app].map(task => npm(app, task));
  if (app === 'songalong') commands.push(script(app, 'tests/audio-lifecycle.browser.ts'), script(app, '../../tests/ci/readiness.browser.mts'));
  if (app === 'notewise') commands.push(script(app, '../../tests/ci/critical-midi.browser.mts'));
  if (app === 'dorego' && browser === 'chromium') commands.push(
    ['node', ['scripts/test-render-recovery.cjs']], ['node', ['tests/ci/protected-stage.browser.cjs']]);
  return commands;
}
// CI maximizes defect detection per second on the Mac Studio. Longer coverage
// is owned explicitly by Nightly. Convenience aliases do not define coverage.
function plan(app, tier, browser = 'chromium', group = 'core') {
  validateSelection(app, tier, browser, group);
  if (tier === 'nightly') return nightlyPlan(app, browser, group);
  if (group !== 'core') throw Error('Edition browser coverage belongs to Nightly');
  return {
    dorego: [npm(app, 'test:desktop')],
    notewise: [script(app, '../../tests/ci/critical-midi.browser.mts')],
    songalong: [script(app, 'tests/audio-lifecycle.browser.ts'), script(app, 'tests/guitar.browser.ts')],
    soundglow: [npm(app, 'test:unit'), ['node', ['tests/ci/silent-audio.browser.cjs']]],
  }[app];
}
module.exports = { budgets, matrix, plan, editionFiles };
if (require.main === module) {
  if (process.argv[2] === 'matrix') {
    const value = JSON.stringify(matrix(process.argv[3], process.argv[4]));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${value}\n`);
    else console.log(value);
  } else if (process.argv[2] === 'editions') {
    const { commandTasks } = require('./task-graph.cjs');
    require('./run.cjs').runTasks(commandTasks('songalong', 'nightly', process.env.TEST_BROWSER || 'chromium', root, { group: 'editions', needs: [] }), { identity: { app: 'songalong', tier: 'nightly', group: 'editions' } }).then(result => { if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
  } else throw Error('Use matrix <app> <ci|nightly> or editions');
}
