const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { apps } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const npm = (app, task) => ['npm', ['run', task, '--workspace=' + app]];
const script = (app, file) => ['npm', ['exec', '--workspace=' + app, '--', 'tsx', file]];
function plan(app, profile, browser = 'chromium') {
  if (!apps[app] || !['focused', 'regression'].includes(profile) || !['chromium', 'webkit'].includes(browser)) throw Error('Choose an app, focused/regression profile, and chromium/webkit');
  const full = profile === 'regression';
  const tasks = {
    dorego: full
      ? ['test:layout', 'test:browsers', ...(browser === 'chromium' ? ['test:diagnostics-ui', 'test:resilience'] : [])]
      : ['test:desktop', 'test:workspace', 'test:channels'],
    notewise: full
      ? ['test:layout', 'test:workspace', 'test:guitar', 'test:piano', 'test:practice', 'test:theory', 'test:navigation', 'test:midi', 'test:signatures', 'test:offline', 'test:backing', ...(browser === 'chromium' ? ['test:browser', 'test:piano-audio', 'test:diagnostics', 'test:backing-realism', 'test:backing-genres'] : [])]
      : ['test:workspace', 'test:piano', 'test:midi'],
    songalong: full
      ? ['test:layout', 'test:split', 'test:sidebars', 'test:hymn-keys', 'test:stanzas', 'test:hymn-playback', 'test:sight', 'test:fingerings', 'test:offline', 'test:catalog', ...(browser === 'chromium' ? ['test:diagnostics'] : [])]
      : ['test:workspace', 'test:fingerings'],
    soundglow: full && browser === 'webkit'
      ? ['test:ui-browsers']
      : ['test:core', ...(full ? ['test:updates', 'test:visual', 'test:resilience'] : [])],
  };
  const commands = tasks[app].map(task => npm(app, task));
  if (!full && app === 'notewise') commands.push(
    script(app, 'tests/guitar.browser.ts'),
    script(app, 'tests/backing-mixer.browser.ts'),
  );
  if (!full && app === 'songalong') commands.push(script(app, 'tests/hymn-playback.browser.ts'));
  if (full && app === 'dorego' && browser === 'chromium') commands.push(
    ['node', ['scripts/test-render-recovery.cjs']],
    ['node', ['packages/browser-diagnostics/test-browser.cjs']],
    ['node', ['tests/ci/protected-stage.browser.cjs']],
  );
  return commands;
}
function check(app, profile) {
  const browser = process.env.TEST_BROWSER || 'chromium';
  const commands = plan(app, profile, browser);
  const environment = { ...process.env, TEST_BROWSER: browser, TEST_BROWSERS: browser, SOUNDGLOW_TEST_BROWSER: browser, CI_USE_BUILD: '1' };
  const run = (command, args, env = environment) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit', timeout: 20 * 60 * 1000 });
  // Shared music unit tests already ran once in the shared job.
  if (app !== 'notewise' && app !== 'soundglow') run('npm', ['test', '--workspace=' + app]);
  run(process.execPath, ['scripts/ci/build.cjs', app]);
  // Only the exhaustive cross-app boundary tests need a sibling fixture build.
  if (profile === 'regression' && app === 'songalong') run(process.execPath, ['scripts/ci/build.cjs', 'notewise']);
  for (const [command, args] of commands) run(command, args);
  if (profile === 'focused') run(process.execPath, ['scripts/ci/smoke-local.cjs', app], { ...environment, TEST_BROWSER: 'webkit' });
}
module.exports = { plan, check };
if (require.main === module) {
  try { check(process.argv[2], process.argv[3] || 'focused'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
