const path = require('node:path');
const { plan } = require('./test-strategy.cjs');
const { setupTasks, commandTasks } = require('./task-graph.cjs');
const { runTasks } = require('./run.cjs');
async function check(app, profile = 'focused') {
  const browser = process.env.TEST_BROWSER || 'chromium', cwd = path.resolve(__dirname, '../..');
  // Validate the lane before creating outputs. Every command uses the same
  // inventory and resource scheduler as the complete local run.
  plan(app, profile, browser);
  const tasks = setupTasks(app, cwd, { visual: profile === 'regression' });
  if (profile === 'editions') tasks.splice(0, tasks.length, ...setupTasks(app, cwd).filter(task => task.id.endsWith(':build')).map(task => ({ ...task, needs: [] })));
  if (profile === 'regression' && app === 'songalong') tasks.push({ id: 'notewise:build', command: process.execPath, args: ['scripts/ci/build.cjs', 'notewise'], cwd, needs: [`${app}:build`], locks: [`files:${cwd}`], slots: 2, priority: 60 });
  tasks.push(...commandTasks(app, profile, browser, cwd, { needs: profile === 'regression' && app === 'songalong' ? ['songalong:build', 'notewise:build'] : [`${app}:build`] }));
  return runTasks(tasks, { identity: { app, profile, browser } });
}
module.exports = { plan, check };
if (require.main === module) check(process.argv[2], process.argv[3]).then(result => { if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
