// Supported full local CI entry point. The same policy, inventory and scheduler
// power GitHub lanes; this layer supplies isolated files and backend ownership.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { affected } = require('./affected.cjs');
const { apps } = require('./apps.cjs');
const { git, assertRevision, snapshot, cloneSupported } = require('./snapshot.cjs');
const { sharedTasks, setupTasks, commandTasks } = require('./task-graph.cjs');
const { workerCount } = require('./scheduler.cjs');
const { runTasks } = require('./run.cjs');
const { execute } = require('./execute.cjs');
const root = path.resolve(__dirname, '../..');
function options(args) {
  const result = { base: 'origin/main', full: false, all: false, plan: false, workers: workerCount() };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--full', '--all', '--plan'].includes(arg)) result[arg.slice(2)] = true;
    else if (['--base', '--workers', '--apps'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
      result[arg.slice(2)] = args[++i];
    } else throw Error(`Unknown option: ${arg}`);
  }
  result.workers = workerCount(result.workers);
  if (result.apps && (result.full || result.all)) throw Error('--apps is a diagnostic scope; do not combine with --full/--all');
  return result;
}
function selection(opts) {
  if (opts.apps) {
    const chosen = opts.apps.split(',');
    if (!chosen.length || chosen.some(app => !apps[app]) || new Set(chosen).size !== chosen.length) throw Error('Unknown or duplicate app');
    return { apps: chosen, accounts: false, scope: 'diagnostic' };
  }
  if (opts.full || opts.all) return { ...affected([], undefined, true), scope: opts.full ? 'full' : 'push-all' };
  const base = git(root, ['merge-base', opts.base, 'HEAD']);
  return { ...affected(git(root, ['diff', '--name-only', '--no-renames', `${base}...HEAD`]).split('\n').filter(Boolean)), base, scope: 'affected' };
}
function graph(selected, opts, directories, backends = {}) {
  const shared = sharedTasks(root).map(task => ({ ...task, cwd: path.join(directories.shared, path.relative(root, task.cwd)) }));
  const tasks = [...shared];
  for (const app of selected.apps) {
    const cwd = directories[app];
    tasks.push(...setupTasks(app, cwd, { visual: opts.full }));
    let needs = [`${app}:build`];
    if (opts.full && app === 'songalong') {
      tasks.push({ id: 'songalong:fixture:notewise', command: process.execPath, args: ['scripts/ci/build.cjs', 'notewise'], cwd, needs, locks: [`files:${cwd}`], slots: 2 });
      needs = ['songalong:fixture:notewise'];
    }
    for (const browser of opts.full ? ['chromium', 'webkit'] : ['chromium']) {
      tasks.push(...commandTasks(app, opts.full ? 'regression' : 'focused', browser, cwd, { needs }));
      if (app === 'songalong') tasks.push(...commandTasks(app, 'editions', browser, cwd, { needs }));
    }
  }
  for (const browser of selected.accounts ? opts.full ? ['chromium', 'webkit'] : ['chromium'] : []) {
    const name = `accounts-${browser}`, cwd = directories[name], env = { ...backends[name], TEST_BROWSER: browser };
    tasks.push({ id: `${name}:backend`, command: process.execPath, args: ['scripts/ci/account-backend.cjs', 'start'], cwd, env, needs: [], locks: [], privateLogDirectory: path.join(cwd, 'work/ci-private') });
    tasks.push({ id: `${name}:tests`, command: 'npm', args: ['run', 'test:accounts'], cwd, env,
      needs: [`${name}:backend`, 'shared:diagnostics'], locks: ['account-fixtures', ...[4391, 4392, 4393, 4394].map(port => `port:${port}`)], slots: 2, timeoutMs: 20 * 60000 });
    // The account build reads the diagnostic bundle in its own snapshot.
    tasks.push({ id: `${name}:diagnostics`, command: 'npm', args: ['run', 'build:shared', '--', 'diagnostics'], cwd, needs: [], locks: [`files:${cwd}`] });
    tasks.at(-2).needs.push(`${name}:diagnostics`);
  }
  return tasks;
}
async function backendPorts() {
  // Keep the four reservations together until every requested port is available.
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = 56000 + Math.floor(Math.random() * 1500) * 4, servers = [];
    try {
      for (const offset of [0, 1, 2, 3]) await new Promise((resolve, reject) => {
        const server = net.createServer(); servers.push(server); server.once('error', reject); server.listen(base + offset, '127.0.0.1', resolve);
      });
      return { SUPABASE_DB_PORT: String(base), SUPABASE_API_PORT: String(base + 1), SUPABASE_LOCAL_SMTP_PORT: String(base + 2), SUPABASE_DB_SHADOW_PORT: String(base + 3) };
    } catch {} finally { for (const server of servers) if (server.listening) await new Promise(resolve => server.close(resolve)); }
  }
  throw Error('Unable to reserve local backend ports');
}
async function main(args) {
  const opts = options(args), selected = selection(opts), sha = git(root, ['rev-parse', 'HEAD']);
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`, directory = path.join(root, 'work/ci-results', id);
  const names = ['shared', ...selected.apps, ...(selected.accounts ? opts.full ? ['accounts-chromium', 'accounts-webkit'] : ['accounts-chromium'] : [])];
  const directories = Object.fromEntries(names.map(name => [name, path.join(root, 'work/ci-snapshots', id, name)]));
  if (opts.plan) { console.log(JSON.stringify({ sha, selected, workers: opts.workers, tasks: graph(selected, opts, directories) }, null, 2)); return; }
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Local CI requires Node 24');
  assertRevision(root, sha);
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  const clone = cloneSupported(root), disk = fs.statfsSync(root);
  const requiredBytes = clone ? 3 * 1024 ** 3 : names.length * 1.5 * 1024 ** 3;
  if (disk.bavail * disk.bsize < requiredBytes) throw Error(`Insufficient disk space for ${names.length} snapshots (${clone ? 'copy-on-write' : 'full copies'}); need at least ${(requiredBytes / 1024 ** 3).toFixed(1)} GiB free`);
  // Worktrees do not isolate TCP ports. One host coordinator owns the resource
  // locks across all repository worktrees; concurrent invocations fail clearly.
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), lock = path.join(common, 'soundtools-ci.lock');
  try { fs.mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw Error(`Another local CI coordinator owns ${lock}; inspect owner.json and its PID before removing a stale lock`); throw error; }
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, directory, sha }));
  const created = [], backends = {}, controller = new AbortController();
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let passed = false; const started = performance.now(); const cleanup = [];
  try {
    console.log(`[ci] installing dependencies; snapshots use ${clone ? 'copy-on-write' : 'full copies'}`);
    const install = await execute({ id: 'install', command: 'npm', args: ['ci'], cwd: root }, { directory: path.join(directory, 'bootstrap'), signal: controller.signal });
    if (install.exitCode !== 0 || install.timedOut) throw Error(`npm ci failed; see ${install.log}`);
    for (const name of names) { if (controller.signal.aborted) throw Error('Cancelled'); console.log(`[ci] snapshot ${name}`); snapshot(root, directories[name], sha, { clone }); created.push(name); }
    for (const name of names.filter(name => name.startsWith('accounts-'))) backends[name] = await backendPorts();
    const result = await runTasks(graph(selected, opts, directories, backends), { directory, workers: opts.workers, identity: { selected, bootstrap: install }, signal: controller.signal });
    for (const name of created) assertRevision(directories[name], sha);
    assertRevision(root, sha); passed = result.passed;
    if (!passed) process.exitCode = 1;
  } finally {
    // Always stop only the stacks this invocation owns, including partial starts.
    for (const name of created.filter(name => name.startsWith('accounts-'))) {
      if (!backends[name]) continue;
      const stopped = await execute({ id: `stop-${name}`, command: process.execPath, args: ['scripts/ci/account-backend.cjs', 'stop'], cwd: directories[name], env: backends[name] }, { directory: path.join(directories[name], 'work/ci-private') });
      cleanup.push({ name, exitCode: stopped.exitCode, timedOut: stopped.timedOut });
      if (stopped.exitCode !== 0 || stopped.timedOut) { passed = false; process.exitCode = 1; }
    }
    // Retain nested account per-command reports before successful snapshots go.
    for (const name of created) {
      const reports = path.join(directories[name], 'work/ci-results');
      if (fs.existsSync(reports)) fs.cpSync(reports, path.join(directory, 'nested', name), { recursive: true });
    }
    if (passed) for (const name of created) git(root, ['worktree', 'remove', '--force', directories[name]]);
    else console.error(`Failed snapshots retained: ${path.dirname(directories.shared)}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'local.json'), JSON.stringify({ sha, passed, elapsedMs: Math.round(performance.now() - started), cleanup }, null, 2), { flag: 'wx' });
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); fs.rmSync(lock, { recursive: true });
  }
}
module.exports = { options, selection, graph, backendPorts };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.stack); process.exitCode = 1; });
