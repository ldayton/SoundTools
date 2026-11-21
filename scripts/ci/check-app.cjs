const path = require('node:path');
const { apps } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const { plan } = require('./test-strategy.cjs');
const { runCommand, recorder } = require('./test-command.cjs');
function check(app, profile) {
  const browser = process.env.TEST_BROWSER || 'chromium';
  const commands = plan(app, profile, browser);
  const environment = { ...process.env, TEST_BROWSER: browser, TEST_BROWSERS: browser, SOUNDGLOW_TEST_BROWSER: browser, CI_USE_BUILD: '1' };
  const record = recorder(path.join(root, 'work/ci-results', `${app}-${profile}-${browser}.jsonl`), { app, profile, browser });
  const run = (command, args, env = environment) => runCommand(command, args, { cwd: root, env, stdio: 'inherit', timeout: 20 * 60 * 1000, record });
  // Shared music unit tests already ran once in the shared job.
  if (profile !== 'editions' && app !== 'notewise' && app !== 'soundglow') run('npm', ['test', '--workspace=' + app]);
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
