// CI's bounded local execution. Nightly keeps disposable multi-backend snapshots.
// CI owns the common host lock and a clean committed checkout; it rebuilds every
// selected artifact and verifies the revision again before reporting success.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { git, assertRevision } = require('./snapshot.cjs');
const { orderAppChecks, sharedTasks, setupTasks, commandTasks } = require('./task-graph.cjs');
const { runTasks } = require('./run.cjs');
const { tiers } = require('./tiers.cjs');
const { execute } = require('./execute.cjs');
function fastGraph(selected, cwd) {
  const tasks = sharedTasks(cwd, { unitWorkers: Number(process.env.CI_UNIT_WORKERS || 8) });
  const preparation = tasks.find(task => task.id === 'shared:diagnostics');
  preparation.args = ['run', 'build:shared'];
  for (const app of selected.apps) {
    const setup = setupTasks(app, cwd);
    for (const task of setup) {
      task.needs = [...task.needs, 'shared:diagnostics'];
      // Shared files are prepared once, before parallel app builds. App outputs
      // are disjoint; there is no shared-checkout build race to serialize.
      task.locks = [`build:${app}`];
      if (task.id.endsWith(':build')) task.args.push('--prepared');
      // SongAlong units read source/fixtures only. Keep their complete required
      // task, but let the independent app build start after shared preparation.
      if(app === 'songalong') {
        if(task.id.endsWith(':units'))task.locks=[];
        if(task.id.endsWith(':build'))task.needs=task.needs.filter(id=>id!==`${app}:units`);
      }
    }
    tasks.push(...setup, ...commandTasks(app, 'ci', 'chromium', cwd));
  }
  for (const task of tasks) task.env = { ...task.env, CI_TIER: 'ci' };
  return orderAppChecks(tasks);
}
async function fastLocal(opts, { root, started, selected, sha }) {
  const directory = path.join(root, 'work/ci-results', `${Date.now()}-${randomUUID().slice(0, 8)}`);
  const tasks = fastGraph(selected, root);
  const workers = opts.workersExplicit ? opts.workers : Math.min(16, Math.max(2, os.availableParallelism()));
  if (opts.plan) { console.log(JSON.stringify({ sha, tier: 'ci', budgetMs: tiers.ci.localBudgetMs, selected, workers, tasks }, null, 2)); return; }
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Local CI requires Node 24');
  assertRevision(root, sha);
  const lock = path.join(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), 'soundtools-ci.lock');
  try { fs.mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw Error(`Another local CI coordinator owns ${lock}`); throw error; }
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, sha, directory }));
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  const timer = setTimeout(abort, Math.max(1, tiers.ci.localBudgetMs - (performance.now() - started)));
  let passed = false;
  try {
    if (performance.now() - started >= tiers.ci.localBudgetMs) throw Error('CI exceeded the 60-second budget before dependency installation');
    // npm ci installs the committed lockfile; installation time counts, too.
    const install = await execute({ id: 'install', command: 'npm', args: ['ci'], cwd: root }, { directory: path.join(directory, 'bootstrap'), signal: controller.signal });
    if (install.exitCode !== 0 || install.timedOut || controller.signal.aborted) throw Error(`CI dependency installation failed or exceeded 60 seconds: ${install.log}`);
    const result = await runTasks(tasks, { directory, workers, identity: { tier: 'ci', selected, bootstrap: install }, signal: controller.signal });
    assertRevision(root, sha);
    passed = result.passed && !controller.signal.aborted && performance.now() - started <= tiers.ci.localBudgetMs;
    if (!passed) process.exitCode = 1;
  } finally {
    clearTimeout(timer); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
    fs.rmSync(lock, { recursive: true });
    const elapsedMs = Math.round(performance.now() - started);
    passed &&= elapsedMs <= tiers.ci.localBudgetMs;
    fs.writeFileSync(path.join(directory, 'local.json'), JSON.stringify({ sha, tier: 'ci', passed, elapsedMs, budgetMs: tiers.ci.localBudgetMs, cleanup: [] }, null, 2));
    console.log(`CI ${passed ? 'passed' : 'failed'}: ${(elapsedMs / 1000).toFixed(2)}s / 60s including selection, install and cleanup. Evidence: ${directory}`);
    if (!passed) process.exitCode = 1;
  }
}
module.exports = { fastGraph, fastLocal };
