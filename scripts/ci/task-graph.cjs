const path = require('node:path');
const fs = require('node:fs');
const { plan } = require('./test-strategy.cjs');
const { declaration } = require('./inventory.cjs');
const root = path.resolve(__dirname, '../..');
const browserSuites = Object.freeze(['desktop', 'workspace', 'breath-squares', 'breath-audio', 'audio-channels', 'pages', 'lifecycle', 'offline', 'spelling']);
function environment(browser, tier = 'ci') { return { CI_TIER: tier, TEST_BROWSER: browser, TEST_BROWSERS: browser, SOUNDGLOW_TEST_BROWSER: browser, CI_USE_BUILD: '1' }; }
function setupTasks(app, cwd = root, { prefix = app, needs = [], visual = false } = {}) {
  const tasks = [];
  if (!['notewise', 'soundglow'].includes(app)) tasks.push({ id: `${prefix}:units`, command: 'npm', args: app === 'dorego' ? ['run', 'test:unit', '--workspace=' + app] : ['test', '--workspace=' + app], cwd, needs, locks: [`files:${cwd}`], slots: 2, priority: 60 });
  tasks.push({ id: `${prefix}:build`, command: process.execPath, args: ['scripts/ci/build.cjs', app], cwd, needs: tasks.length ? [tasks[0].id] : needs, locks: [`files:${cwd}`], slots: 2, priority: 60 });
  if (app === 'soundglow' && visual) tasks.push({ id: `${prefix}:visual-fixture`, command: process.execPath, args: ['scripts/ci/prepare-visual.cjs'], cwd, needs: [`${prefix}:build`], locks: [`files:${cwd}`], priority: 60 });
  return tasks;
}
function commandTasks(app, tier, browser, cwd = root, { group = 'core', shard = '1/1', prefix = `${app}:${tier}:${group}:${browser}${shard === '1/1' ? '' : ':shard-' + shard.replace('/', '-of-')}`, needs = [`${app}:build`] } = {}) {
  if (group !== 'editions' && shard !== '1/1') throw Error('Only edition groups accept an outer shard');
  const selected = require('./shard.cjs').partition(plan(app, tier, browser, group), shard);
  if (!selected.length) throw Error('Edition shard is empty');
  const commands = selected.flatMap(([command, args]) => app === 'dorego' && args.includes('test:browsers')
    ? browserSuites.map(suite => ['npm', ['exec', '--workspace=dorego', '--', 'tsx', `tests/${suite}.e2e.ts`]]) : [[command, args]]);
  return commands.flatMap(([command, args], index) => {
    const policy = declaration(app, command, args);
    const base = { id: `${prefix}:${index}`, command: command === 'node' ? process.execPath : command, args, cwd, needs, env: environment(browser, tier), ...policy, timeoutMs: 20 * 60000 };
    if (policy.partition) {
      const { total, portBase, defaultPort } = policy.partition;
      return Array.from({ length: total }, (_, shard) => {
        const port = portBase + (browser === 'webkit' ? total : 0) + shard;
        return { ...base, id: `${base.id}:shard-${shard + 1}`, partition: { index: shard + 1, total },
          env: { ...base.env, TEST_SHARD: `${shard + 1}/${total}`, TEST_PORT: String(port) },
          locks: [...base.locks.filter(lock => lock !== `port:${defaultPort}`), `port:${port}`] };
      });
    }
    if (app === 'soundglow' && args.some(arg => ['test:visual', 'test:ui-browsers'].includes(arg))) {
      const { groups } = require('./visual-groups.cjs'), files = groups();
      const kinds = args.includes('test:visual') ? ['ui', 'timing'] : ['ui'];
      return kinds.map(kind => {
        const port = policy.visual.portBase + (browser === 'webkit' ? 2 : 0) + (kind === 'timing' ? 1 : 0);
        return { ...base, id: `${base.id}:${kind}`, command: 'npm',
          args: ['exec', '--workspace=soundglow', '--', 'playwright', 'test', ...files[kind].map(file => `tests/visual/${file}`), `--workers=${kind === 'ui' ? policy.visual.uiWorkers : 1}`],
          needs: [...needs, `${app}:visual-fixture`], slots: kind === 'ui' ? policy.visual.uiWorkers : 1,
          locks: [`port:${port}`, ...(kind === 'timing' ? ['realtime-audio'] : [])],
          env: { ...base.env, SOUNDGLOW_TEST_PORT: String(port), SOUNDGLOW_TEST_GROUP: kind },
          coverage: [{ command: 'playwright', args: ['test', ...files[kind].map(file => `tests/visual/${file}`)], cwd: 'apps/soundglow' }], kind,
        };
      });
    }
    return [base];
  }).concat(tier === 'ci' && group === 'core' ? [{ id: `${prefix}:smoke`, command: process.execPath, args: ['scripts/ci/smoke-local.cjs', app], cwd, needs, locks: [], env: environment('webkit', tier), coverage: [{ command: 'node', args: ['scripts/ci/smoke-local.cjs', app], cwd: '' }] }] : []);
}
// The real development-command test rebuilds dist/ui. Finish it before any
// browser or packager reads that output; Node's isolated pool can then overlap
// read-only DSP/state checks. Hosted WebKit has no Node task or output mutation.
function orderAppChecks(tasks) {
  const unit = tasks.find(task => task.args.includes('test:unit') && task.args.includes('--workspace=soundglow'));
  if (unit) for (const task of tasks) {
    if (task !== unit && (/^soundglow:(?:ci|nightly):/.test(task.id) || task.id === 'soundglow:visual-fixture')) task.needs = [...new Set([...task.needs, unit.id])];
  }
  return tasks;
}
function sharedTasks(cwd = root, { needs = [], unitWorkers = Number(process.env.CI_UNIT_WORKERS || (process.env.CI ? 2 : 4)) } = {}) {
  if (!Number.isInteger(unitWorkers) || unitWorkers < 1 || unitWorkers > 8) throw Error('CI_UNIT_WORKERS must be 1..8');
  const base = [
    ['history', 'npm', ['run', 'verify:history']],
    ['diagnostics', 'npm', ['run', 'build:shared', '--', 'diagnostics']],
  ].map(([name, command, args]) => ({ id: `shared:${name}`, command, args, cwd, needs, locks: [], priority: name === 'diagnostics' ? 100 : 80 }));
  for (const [name, command, args, slots] of [
    ['contracts', 'npm', ['run', 'test:shared'], 1],
    ['music', process.execPath, ['--import', 'tsx', '--test', `--test-concurrency=${unitWorkers}`, ...fs.readdirSync(path.join(cwd, 'packages/music-practice/tests')).filter(file => file.endsWith('.test.ts')).sort().map(file => `tests/${file}`)], unitWorkers],
    ['policy', process.execPath, ['--test', ...fs.readdirSync(path.join(cwd, 'tests/ci')).filter(file => file.endsWith('.test.cjs')).sort().map(file => `tests/ci/${file}`)], 1],
  ]) base.push({ id: `shared:${name}`, command, args, cwd: name === 'music' ? path.join(cwd, 'packages/music-practice') : cwd, needs: ['shared:diagnostics'], locks: [], slots, priority: name === 'policy' ? 80 : name === 'contracts' ? 40 : 20 });
  return base;
}
module.exports = { orderAppChecks, browserSuites, environment, setupTasks, commandTasks, sharedTasks };
