const path = require('node:path');
const { browserSuites, environment } = require('./task-graph.cjs');
const { declaration } = require('./inventory.cjs');
const { runTasks } = require('./run.cjs');
function tasks(browsers) {
  return browsers.flatMap(browser => {
    if (!['chromium', 'firefox', 'webkit'].includes(browser)) throw Error('Unknown browser');
    return browserSuites.map(suite => {
      const args = ['exec', '--workspace=dorego', '--', 'tsx', `tests/${suite}.e2e.ts`];
      return { id: `dorego:browsers:${browser}:${suite}`, command: 'npm', args, cwd: path.resolve(__dirname, '../..'), needs: [], env: environment(browser, process.env.CI_TIER || 'ci'), ...declaration('dorego', 'npm', args) };
    });
  });
}
module.exports = { tasks, runBrowserSuites: browsers => runTasks(tasks(browsers), { identity: { app: 'dorego', tier: process.env.CI_TIER || 'ci', group: 'browser-suites' } }) };
