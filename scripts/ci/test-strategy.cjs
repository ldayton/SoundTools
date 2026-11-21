// Executable testing policy. See docs/testing.md before changing suite ownership.
// CI calls explicit lanes, never a growing developer convenience umbrella.
const fs = require('node:fs');
const path = require('node:path');
const { apps } = require('./apps.cjs');
const { tiers, tier: validateTier } = require('./tiers.cjs');
const root = path.resolve(__dirname, '../..');
const budgets = Object.freeze({ ci: Object.freeze({ core: 10, editions: 15 }), nightly: Object.freeze({ core: 30, editions: 15 }) });
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
    (app === 'songalong' ? ['core', 'editions'] : ['core']).map(group => ({ tier, group, browser, timeout: budgets[tier][group] }))) };
}
function plan(app, tier, browser = 'chromium', group = 'core') {
  validateTier(tier);
  if (!apps[app] || !['core', 'editions'].includes(group) || !['chromium', 'webkit'].includes(browser) || group === 'editions' && app !== 'songalong') throw Error('Choose a known app, coverage group and Chromium/WebKit');
  if (group === 'editions') return editionFiles().map(file => script(app, file));
  const nightly = tier === 'nightly';
  const tasks = {
    dorego: nightly
      ? ['test:layout', 'test:browsers', ...(browser === 'chromium' ? ['test:diagnostics-ui', 'test:resilience'] : [])]
      : ['test:desktop', 'test:workspace', 'test:channels'],
    notewise: nightly
      ? ['test:layout', 'test:workspace', 'test:guitar', 'test:piano', 'test:practice', 'test:theory', 'test:navigation', 'test:midi', 'test:signatures', 'test:offline', 'test:backing', ...(browser === 'chromium' ? ['test:browser', 'test:piano-audio', 'test:diagnostics', 'test:backing-realism', 'test:backing-genres'] : [])]
      : ['test:workspace', 'test:piano', 'test:midi'],
    songalong: nightly
      ? ['test:layout', 'test:split', 'test:sidebars', 'test:hymn-keys', 'test:stanzas', 'test:hymn-playback', 'test:sight', 'test:fingerings', 'test:offline', 'test:catalog']
      : ['test:workspace:core', 'test:instrument-audio', 'test:guitar', 'test:fingerings'],
    soundglow: nightly && browser === 'webkit' ? ['test:ui-browsers'] : ['test:core', ...(nightly ? ['test:updates', 'test:visual', 'test:resilience'] : [])],
  };
  const commands = tasks[app].map(task => npm(app, task));
  if (!nightly && app === 'notewise') commands.push(script(app, 'tests/guitar.browser.ts'), script(app, 'tests/backing-mixer.browser.ts'));
  if (!nightly && app === 'songalong') commands.push(script(app, 'tests/hymn-playback.browser.ts'), script(app, '../../tests/ci/readiness.browser.mts'));
  if (app === 'songalong') commands.push(script(app, 'tests/audio-lifecycle.browser.ts'));
  if (nightly && app === 'songalong' && browser === 'chromium') commands.push(npm(app, 'test:diagnostics'));
  if (nightly && app === 'dorego' && browser === 'chromium') commands.push(
    ['node', ['scripts/test-render-recovery.cjs']], ['node', ['packages/browser-diagnostics/test-browser.cjs']], ['node', ['tests/ci/protected-stage.browser.cjs']]);
  return commands;
}
module.exports = { budgets, matrix, plan, editionFiles };
if (require.main === module) {
  if (process.argv[2] === 'matrix') {
    const value = JSON.stringify(matrix(process.argv[3], process.argv[4]));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${value}\n`);
    else console.log(value);
  } else if (process.argv[2] === 'editions') {
    const { commandTasks } = require('./task-graph.cjs');
    require('./run.cjs').runTasks(commandTasks('songalong', process.env.CI_TIER || 'ci', process.env.TEST_BROWSER || 'chromium', root, { group: 'editions', needs: [] }), { identity: { app: 'songalong', tier: process.env.CI_TIER || 'ci', group: 'editions' } }).then(result => { if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
  } else throw Error('Use matrix <app> <ci|nightly> or editions');
}
