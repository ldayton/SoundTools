// Supported full local CI entry point. The same policy, inventory and scheduler
// power GitHub lanes; this layer supplies isolated files and backend ownership.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { randomUUID } = require('node:crypto');
const { affected, changes } = require('./affected.cjs');
const { tiers, tier: validateTier } = require('./tiers.cjs');
const { apps } = require('./apps.cjs');
const { git, assertRevision, snapshot, cloneSupported } = require('./snapshot.cjs');
const { sharedTasks, setupTasks, commandTasks } = require('./task-graph.cjs');
const { workerCount, validate } = require('./scheduler.cjs');
const { execFileSync } = require('node:child_process');
const { runTasks } = require('./run.cjs');
const { execute } = require('./execute.cjs');
const { retainEvidence } = require('./evidence.cjs');
const root = path.resolve(__dirname, '../..');
function options(args) {
  const result = { base: 'origin/main', tier: 'ci', all: false, plan: false, workers: workerCount() };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--all', '--plan'].includes(arg)) result[arg.slice(2)] = true;
    else if (['--base', '--workers', '--apps', '--tier'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
      result[arg.slice(2)] = args[++i];
    } else throw Error(`Unknown option: ${arg}`);
  }
  result.workersExplicit = args.includes('--workers') || !!process.env.CI_WORKERS;
  result.workers = workerCount(result.workers);
  result.tier = validateTier(result.tier);
  if (result.apps && (result.tier === 'nightly' || result.all)) throw Error('--apps is a diagnostic scope; do not combine with Nightly/--all');
  return result;
}
async function selection(opts, { readGit = args => git(root, args), detect = changes } = {}) {
  if (opts.apps) {
    const chosen = opts.apps.split(',');
    if (!chosen.length || chosen.some(app => !apps[app]) || new Set(chosen).size !== chosen.length) throw Error('Unknown or duplicate app');
    return { apps: chosen, accounts: false, scope: 'diagnostic' };
  }
  if (opts.tier === 'nightly' || opts.all) return { ...affected([], undefined, true), scope: opts.tier === 'nightly' ? 'nightly' : 'ci-all' };
  const base = readGit(['merge-base', opts.base, 'HEAD']);
  const result = await detect({ env: { ...process.env, GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: '', CI_TIER: 'ci', CI_BASE_SHA: base, GITHUB_SHA: readGit(['rev-parse', 'HEAD']) }, git: readGit });
  return { ...result, scope: 'affected' };
}
function graph(selected, opts, directories, backends = {}) {
  if (opts.tier === 'ci') return require('./fast-local.cjs').fastGraph(selected, directories.shared);
  const shared = sharedTasks(root).map(task => ({ ...task, cwd: path.join(directories.shared, path.relative(root, task.cwd)) }));
  const tasks = [...shared];
  for (const task of tasks) task.env = { ...task.env, CI_TIER: opts.tier };
  for (const app of selected.apps) {
    const cwd = directories[app];
    tasks.push(...setupTasks(app, cwd, { visual: opts.tier === 'nightly' }));
    let needs = [`${app}:build`];
    if (opts.tier === 'nightly' && app === 'songalong') {
      tasks.push({ id: 'songalong:fixture:notewise', command: process.execPath, args: ['scripts/ci/build.cjs', 'notewise'], cwd, needs, locks: [`files:${cwd}`], slots: 2, priority: 60 });
      needs = ['songalong:fixture:notewise'];
    }
    for (const browser of tiers[opts.tier].browsers) {
      tasks.push(...commandTasks(app, opts.tier, browser, cwd, { needs }));
      if (app === 'songalong') tasks.push(...commandTasks(app, opts.tier, browser, cwd, { group: 'editions', needs }));
    }
  }
  for (const browser of selected.accounts ? tiers[opts.tier].browsers : []) {
    const name = `accounts-${browser}`, cwd = directories[name], env = { ...backends[name], CI_TIER: opts.tier, TEST_BROWSER: browser };
    tasks.push({ id: `${name}:backend`, command: process.execPath, args: ['scripts/ci/account-backend.cjs', 'start'], cwd, env, needs: [], locks: Object.values(backends[name] || {}).map(port => `port:${port}`), priority: 100, privateLogDirectory: path.join(cwd, 'work/ci-private') });
    tasks.push({ id: `${name}:tests`, command: 'npm', args: ['run', 'test:accounts'], cwd, env,
      needs: [`${name}:backend`, 'shared:diagnostics'], locks: ['account-fixtures', ...[4391, 4392, 4393, 4394].map(port => `port:${port}`)], slots: 2, priority: 90, timeoutMs: 20 * 60000 });
    // The account build reads the diagnostic bundle in its own snapshot.
    tasks.push({ id: `${name}:diagnostics`, command: 'npm', args: ['run', 'build:shared', '--', 'diagnostics'], cwd, needs: [], locks: [`files:${cwd}`], priority: 100 });
    tasks.at(-2).needs.push(`${name}:diagnostics`);
  }
  for (const task of tasks) task.env = { ...task.env, CI_TIER: opts.tier };
  return tasks;
}
async function backendPorts(allocated = new Set(), random = Math.random) {
  // Keep the four reservations together until every requested port is available.
  for (let attempt = 0; attempt < 100; attempt++) {
    const base = 56000 + ((Math.floor(random() * 1500) + attempt) % 1500) * 4, servers = [];
    const ports = [0, 1, 2, 3].map(offset => base + offset);
    if (ports.some(port => allocated.has(port))) continue;
    try {
      for (const offset of [0, 1, 2, 3]) await new Promise((resolve, reject) => {
        const server = net.createServer(); servers.push(server); server.once('error', reject); server.listen(base + offset, '127.0.0.1', resolve);
      });
      ports.forEach(port => allocated.add(port));
      return { SUPABASE_DB_PORT: String(base), SUPABASE_API_PORT: String(base + 1), SUPABASE_LOCAL_SMTP_PORT: String(base + 2), SUPABASE_DB_SHADOW_PORT: String(base + 3) };
    } catch {} finally { for (const server of servers) if (server.listening) await new Promise(resolve => server.close(resolve)); }
  }
  throw Error('Unable to reserve local backend ports');
}
async function main(args) {
  const startedAt = performance.now();
  const opts = options(args), selected = await selection(opts), sha = git(root, ['rev-parse', 'HEAD']);
  if (opts.tier === 'ci') return require('./fast-local.cjs').fastLocal(opts, { root, started: startedAt, selected, sha });
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`, directory = path.join(root, 'work/ci-results', id);
  const names = ['shared', ...selected.apps, ...(selected.accounts ? tiers[opts.tier].browsers.map(browser => `accounts-${browser}`) : [])];
  const directories = Object.fromEntries(names.map(name => [name, path.join(root, 'work/ci-snapshots', id, name)]));
  const preview = graph(selected, opts, directories); validate(preview);
  if (opts.plan) { console.log(JSON.stringify({ sha, tier: opts.tier, selected, workers: opts.workers, tasks: preview }, null, 2)); return; }
  if (Number(process.versions.node.split('.')[0]) !== 24) throw Error('Local CI requires Node 24');
  assertRevision(root, sha);
  if (selected.accounts) {
    // Docker Desktop can be installed without adding its CLI to the shell PATH.
    const desktopBin = '/Applications/Docker.app/Contents/Resources/bin';
    if (process.platform === 'darwin' && fs.existsSync(path.join(desktopBin, 'docker'))) process.env.PATH = (process.env.PATH || '') + path.delimiter + desktopBin;
    const version = execFileSync('supabase', ['--version'], { encoding: 'utf8' }).trim();
    if (version !== '3.2.0') throw Error('Local CI requires Supabase CLI 3.2.0, matching ci.yml');
    try { execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'ignore' }); }
    catch { throw Error('Docker Desktop must be installed and running; start its GUI app before local CI'); }
  }
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  const clone = cloneSupported(root), disk = fs.statfsSync(root);
  const requiredBytes = clone ? 3 * 1024 ** 3 : names.length * 1.5 * 1024 ** 3;
  if (disk.bavail * disk.bsize < requiredBytes) throw Error(`Insufficient disk space for ${names.length} snapshots (${clone ? 'copy-on-write' : 'full copies'}); need at least ${(requiredBytes / 1024 ** 3).toFixed(1)} GiB free`);
  // Worktrees do not isolate TCP ports. One host coordinator owns the resource
  // locks across all repository worktrees; concurrent invocations fail clearly.
  const common = path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), lock = path.join(common, 'soundtools-ci.lock');
  try { fs.mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw Error(`Another local CI coordinator owns ${lock}; inspect owner.json and its PID before removing a stale lock`); throw error; }
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, directory, sha }));
  const created = [], backends = {}, allocated = new Set(), controller = new AbortController();
  const abort = () => controller.abort(); process.once('SIGINT', abort); process.once('SIGTERM', abort);
  let passed = false; const started = performance.now(); const cleanup = [];
  try {
    console.log(`[ci] installing dependencies; snapshots use ${clone ? 'copy-on-write' : 'full copies'}`);
    const install = await execute({ id: 'install', command: 'npm', args: ['ci'], cwd: root }, { directory: path.join(directory, 'bootstrap'), signal: controller.signal });
    if (install.exitCode !== 0 || install.timedOut) throw Error(`npm ci failed; see ${install.log}`);
    for (const name of names) { if (controller.signal.aborted) throw Error('Cancelled'); console.log(`[ci] snapshot ${name}`); snapshot(root, directories[name], sha, { clone }); created.push(name); }
    for (const name of names.filter(name => name.startsWith('accounts-'))) backends[name] = await backendPorts(allocated);
    const result = await runTasks(graph(selected, opts, directories, backends), { directory, workers: opts.workers, identity: { tier: opts.tier, selected, bootstrap: install }, signal: controller.signal });
    for (const name of created) assertRevision(directories[name], sha);
    assertRevision(root, sha); passed = result.passed;
    if (!passed) process.exitCode = 1;
  } finally {
    // A backend is owned only after its start task was scheduled. Graph or
    // snapshot setup failures must not attempt to stop an unstarted stack.
    const events = path.join(directory, 'events.jsonl');
    const starts = new Set(fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n').filter(Boolean).flatMap(line => { try { const event = JSON.parse(line); return event.status === 'running' ? [event.id] : []; } catch { return []; } }) : []);
    for (const name of created.filter(name => name.startsWith('accounts-'))) {
      if (!backends[name] || !starts.has(`${name}:backend`)) continue;
      const stopped = await execute({ id: `stop-${name}`, command: process.execPath, args: ['scripts/ci/account-backend.cjs', 'stop'], cwd: directories[name], env: backends[name] }, { directory: path.join(directories[name], 'work/ci-private') });
      cleanup.push({ name, exitCode: stopped.exitCode, timedOut: stopped.timedOut });
      if (stopped.exitCode !== 0 || stopped.timedOut) { passed = false; process.exitCode = 1; }
    }
    for (const name of created) retainEvidence(directories[name], path.join(directory, 'evidence', name));
    for (const name of created) {
      const backendFailed = cleanup.some(result => result.name === name && (result.exitCode !== 0 || result.timedOut));
      if (process.env.CI_KEEP_SNAPSHOTS === '1' || backendFailed) console.error(`Snapshot retained by explicit request or failed backend cleanup: ${directories[name]}`);
      else git(root, ['worktree', 'remove', '--force', directories[name]]);
    }
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'local.json'), JSON.stringify({ sha, passed, elapsedMs: Math.round(performance.now() - started), cleanup }, null, 2), { flag: 'wx' });
    process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); fs.rmSync(lock, { recursive: true });
  }
}
module.exports = { options, selection, graph, backendPorts };
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.stack); process.exitCode = 1; });
