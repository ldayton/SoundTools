// Executable testing policy. See docs/testing.md before changing suite ownership.
// CI calls explicit lanes, never a growing developer convenience umbrella.
const fs = require('node:fs');
const path = require('node:path');
const { apps } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const budgets = Object.freeze({ focused: 10, editions: 15, regression: 30 });
function editionFiles(directory = root) {
  return fs.readdirSync(path.join(directory, 'apps/songalong/tests'))
    .filter(file => file.endsWith('-editions.browser.ts')).sort()
    .map(file => `tests/${file}`);
}
const npm = (app, task) => ['npm', ['run', task, '--workspace=' + app]];
const script = (app, file) => ['npm', ['exec', '--workspace=' + app, '--', 'tsx', file]];
function matrix(app, profile) {
  if (!apps[app] || !['focused', 'regression'].includes(profile)) throw Error('Choose an app and focused/regression profile');
  return { include: (profile === 'regression' ? ['chromium', 'webkit'] : ['chromium']).flatMap(browser =>
    (app === 'songalong' ? [profile, 'editions'] : [profile]).map(lane => ({ browser, profile: lane, timeout: budgets[lane] }))) };
}
function plan(app, profile, browser = 'chromium') {
  if (!apps[app] || !Object.hasOwn(budgets, profile) || !['chromium', 'webkit'].includes(browser) || profile === 'editions' && app !== 'songalong') throw Error('Choose an app, supported lane, and Chromium/WebKit');
  if (profile === 'editions') return editionFiles().map(file => script(app, file));
  const full = profile === 'regression';
  const tasks = {
    dorego: full
      ? ['test:layout', 'test:browsers', ...(browser === 'chromium' ? ['test:diagnostics-ui', 'test:resilience'] : [])]
      : ['test:desktop', 'test:workspace', 'test:channels'],
    notewise: full
      ? ['test:layout', 'test:workspace', 'test:guitar', 'test:piano', 'test:practice', 'test:theory', 'test:navigation', 'test:midi', 'test:signatures', 'test:offline', 'test:backing', ...(browser === 'chromium' ? ['test:browser', 'test:piano-audio', 'test:diagnostics', 'test:backing-realism', 'test:backing-genres'] : [])]
      : ['test:workspace', 'test:piano', 'test:midi'],
    songalong: full
      ? ['test:layout', 'test:split', 'test:sidebars', 'test:hymn-keys', 'test:stanzas', 'test:hymn-playback', 'test:sight', 'test:fingerings', 'test:offline', 'test:catalog']
      : ['test:workspace:core', 'test:instrument-audio', 'test:guitar', 'test:fingerings'],
    soundglow: full && browser === 'webkit' ? ['test:ui-browsers'] : ['test:core', ...(full ? ['test:updates', 'test:visual', 'test:resilience'] : [])],
  };
  const commands = tasks[app].map(task => npm(app, task));
  if (!full && app === 'notewise') commands.push(script(app, 'tests/guitar.browser.ts'), script(app, 'tests/backing-mixer.browser.ts'));
  if (!full && app === 'songalong') commands.push(script(app, 'tests/hymn-playback.browser.ts'), script(app, '../../tests/ci/readiness.browser.mts'));
  if (app === 'songalong') commands.push(script(app, 'tests/audio-lifecycle.browser.ts'));
  if (full && app === 'songalong' && browser === 'chromium') commands.push(npm(app, 'test:diagnostics'));
  if (full && app === 'dorego' && browser === 'chromium') commands.push(
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
    require('./run.cjs').runTasks(commandTasks('songalong', 'editions', process.env.TEST_BROWSER || 'chromium', root, { needs: [] }), { identity: { app: 'songalong', profile: 'editions' } }).then(result => { if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
  } else throw Error('Use matrix <app> <focused|regression> or editions');
}
