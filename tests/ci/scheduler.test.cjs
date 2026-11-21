const { test } = require('node:test');
const assert = require('node:assert/strict');
const { schedule, workerCount } = require('../../scripts/ci/scheduler.cjs');
const { parseUsage, execute } = require('../../scripts/ci/execute.cjs');
const { compare } = require('../../scripts/ci/compare.cjs');
const { commandTasks, setupTasks, browserSuites } = require('../../scripts/ci/task-graph.cjs');
const { plan, editionFiles } = require('../../scripts/ci/test-strategy.cjs');
const { declaration } = require('../../scripts/ci/inventory.cjs');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const task = (id, needs = [], locks = [], slots = 1) => ({ id, needs, locks, slots });
test('scheduler overlaps independent tasks but respects dependencies, resource locks and weighted capacity', async () => {
  const active = new Map(), finished = new Set(); let peak = 0, overlap = false;
  const jobs = [task('build'), task('audio-a', ['build'], ['audio'], 2), task('audio-b', ['build'], ['audio'], 2), task('ui', ['build'], ['port:1']), task('same-port', ['build'], ['port:1']), task('last', ['audio-a', 'audio-b', 'ui', 'same-port'])];
  const results = await schedule(jobs, { workers: 3, async execute(t) {
    for (const need of t.needs) assert(finished.has(need));
    for (const other of active.values()) assert(!other.locks.some(lock => t.locks.includes(lock)));
    active.set(t.id, t); const used = [...active.values()].reduce((n, a) => n + a.slots, 0); assert(used <= 3); peak = Math.max(peak, used); overlap ||= active.size > 1;
    await new Promise(resolve => setImmediate(resolve)); active.delete(t.id); finished.add(t.id); return { exitCode: 0 };
  } });
  assert(overlap); assert.equal(peak, 3); assert(results.every(r => r.status === 'success'));
});
test('first failures and timed out commands are not retried; dependants block, independent evidence survives', async () => {
  const attempts = {};
  const results = await schedule([task('grandchild', ['child']), task('child', ['failure']), task('failure'), task('independent'), task('deadline')], { workers: 2, async execute(t) { attempts[t.id] = (attempts[t.id] || 0) + 1; return { exitCode: t.id === 'failure' ? 1 : 0, timedOut: t.id === 'deadline' }; } });
  assert.deepEqual(attempts, { failure: 1, independent: 1, deadline: 1 });
  assert.deepEqual(results.map(r => r.status), ['blocked', 'blocked', 'failure', 'success', 'failure']);
});
test('invalid graphs and worker settings fail before execution', async () => {
  for (const jobs of [[task('a'), task('a')], [task('a', ['missing'])], [task('a', ['b']), task('b', ['a'])]]) await assert.rejects(schedule(jobs, { execute() { assert.fail('must not execute'); } }));
  for (const value of [0, -1, 1.1, 'bad', 33]) assert.throws(() => workerCount(value));
});
test('cancellation marks pending tasks and stops scheduling new work', async () => {
  const controller = new AbortController();
  const results = await schedule([task('running'), task('pending')], { workers: 1, signal: controller.signal, execute() { controller.abort(); return { exitCode: 0 }; } });
  assert(results.every(r => r.status === 'cancelled'));
});
test('all existing CI commands have reviewed coverage and resource declarations', () => {
  for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) for (const lane of ['ci', 'nightly']) for (const group of app === 'songalong' && lane === 'nightly' ? ['core', 'editions'] : ['core']) {
    for (const [command, args] of plan(app, lane, 'chromium', group)) {
      const entry = declaration(app, command, args);
      assert(entry.coverage.length);
      if (entry.kind === 'audio') assert(entry.locks.includes('realtime-audio'));
    }
    for (const browser of ['chromium', 'webkit']) assert(commandTasks(app, lane, browser, undefined, { group }).length >= plan(app, lane, browser, group).length);
  }
  assert.throws(() => declaration('songalong', 'node', ['new-unreviewed-test.cjs']), /Missing resource/);
  assert.deepEqual(commandTasks('songalong', 'nightly', 'chromium', undefined, { group: 'editions' }).map(t => t.args.at(-1)), editionFiles());
  assert.equal(browserSuites.length, 9);
  assert.equal(commandTasks('dorego', 'nightly', 'chromium').filter(t => t.args.some(arg => /tests\/.*\.e2e\.ts$/.test(arg))).length, 9);
  assert.equal(setupTasks('songalong').filter(t => t.id.endsWith(':build')).length, 1);
});
test('performance comparison refuses changed coverage, commits or failed runs', () => {
  const before = { inventory: { sha: 'a', workers: 1, tasks: [{ ...task('a'), command: 'node', args: ['a.test.cjs'] }] }, results: { passed: true, elapsedMs: 100 } };
  const after = structuredClone(before); after.inventory.workers = 4; after.results.elapsedMs = 25;
  assert.equal(compare(before, after).speedup, 4);
  after.inventory.tasks.push({ ...task('extra'), command: 'node', args: ['extra.test.cjs'] }); assert.throws(() => compare(before, after), /Coverage/); after.inventory.tasks.pop();
  after.inventory.sha = 'b'; assert.throws(() => compare(before, after), /commits/); after.inventory.sha = 'a';
  after.results.passed = false; assert.throws(() => compare(before, after), /Failed/);
});
test('usage parsers retain CPU time and normalize platform RSS units', () => {
  assert.deepEqual(parseUsage('0.50 real 0.20 user 0.10 sys\n 12345 maximum resident set size', 'darwin'), { userSeconds: .2, systemSeconds: .1, maxRssBytes: 12345 });
  assert.equal(parseUsage('Maximum resident set size (kbytes): 10', 'linux').maxRssBytes, 10240);
});
test('executor preserves a failing process log and enforces a real deadline', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-executor-'));
  try {
    const result = await execute({ id: 'failure', command: process.execPath, args: ['-e', 'console.log("first evidence");process.exit(7)'] }, { directory });
    assert.equal(result.exitCode, 7); assert.match(fs.readFileSync(result.log, 'utf8'), /first evidence/);
    const hung = await execute({ id: 'deadline', command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 50 }, { directory });
    assert(hung.timedOut); assert.notEqual(hung.exitCode, 0);
    assert.throws(() => execute({ id: 'failure', command: process.execPath, args: [] }, { directory }), /EEXIST/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('snapshot copies keep workspace links and writes inside the private checkout', () => {
  const { execFileSync } = require('node:child_process');
  const { snapshot, assertRevision } = require('../../scripts/ci/snapshot.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-snapshot-')), source = path.join(directory, 'source'), target = path.join(directory, 'worker');
  fs.mkdirSync(source);
  const git = args => execFileSync('git', args, { cwd: source, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init', '--quiet']); fs.writeFileSync(path.join(source, '.gitignore'), 'node_modules/\n');
    fs.mkdirSync(path.join(source, 'packages/example'), { recursive: true }); fs.writeFileSync(path.join(source, 'packages/example/value'), 'original');
    git(['add', '.']); git(['-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'commit', '--quiet', '-m', 'fixture']);
    fs.mkdirSync(path.join(source, 'node_modules/@fixture'), { recursive: true }); fs.symlinkSync('../../packages/example', path.join(source, 'node_modules/@fixture/example'));
    fs.writeFileSync(path.join(source, 'node_modules/dependency'), 'installed');
    const sha = git(['rev-parse', 'HEAD']); snapshot(source, target, sha);
    assert.equal(fs.realpathSync(path.join(target, 'node_modules/@fixture/example')), fs.realpathSync(path.join(target, 'packages/example')));
    fs.writeFileSync(path.join(target, 'node_modules/dependency'), 'changed'); assert.equal(fs.readFileSync(path.join(source, 'node_modules/dependency'), 'utf8'), 'installed');
    fs.writeFileSync(path.join(target, 'packages/example/value'), 'changed'); assert.equal(fs.readFileSync(path.join(source, 'packages/example/value'), 'utf8'), 'original');
    assert.throws(() => assertRevision(target, sha), /clean, committed/);
    fs.mkdirSync(path.join(target, 'work/browser-results'), { recursive: true }); fs.writeFileSync(path.join(target, 'work/browser-results/failure.txt'), 'first failure');
    fs.mkdirSync(path.join(target, 'work/ci-private'), { recursive: true }); fs.writeFileSync(path.join(target, 'work/ci-private/secret'), 'private');
    fs.mkdirSync(path.join(target, 'apps/soundglow/playwright-report-ui'), { recursive: true }); fs.writeFileSync(path.join(target, 'apps/soundglow/playwright-report-ui/index.html'), 'group report');
    const evidence = path.join(directory, 'evidence'); require('../../scripts/ci/evidence.cjs').retainEvidence(target, evidence);
    assert.match(fs.readFileSync(path.join(evidence, 'source-changes.patch'), 'utf8'), /changed/);
    assert.equal(fs.readFileSync(path.join(evidence, 'work/browser-results/failure.txt'), 'utf8'), 'first failure');
    assert(!fs.existsSync(path.join(evidence, 'work/ci-private'))); assert(!fs.existsSync(path.join(evidence, 'untracked-source/work/ci-private')));
    assert(!fs.existsSync(path.join(evidence, 'node_modules')));
    assert.equal(fs.readFileSync(path.join(evidence, 'apps/soundglow/playwright-report-ui/index.html'), 'utf8'), 'group report');

    git(['worktree', 'remove', '--force', target]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('GitHub overlaps independent setup while releases still require shared validation', () => {
  const root = path.resolve(__dirname, '../..');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) {
    const section = workflow.split(`\n  ${app}:`)[1].split('\n  ')[0];
    // Check the actual selected app block, not a dependency appearing elsewhere.
    assert.match(workflow, new RegExp(`\\n  ${app}:\\n    needs: \\[changes\\]`));
    assert.match(workflow, new RegExp(`release-${app}:\\n    needs: \\[changes, shared, ${app}, accounts\\]`));
  }
  assert.match(workflow, /run: node scripts\/ci\/run-shared.cjs/);
  assert.match(workflow, /outputs\.matrices/);
});

test('direct workspace browser commands declare their real server ports', () => {
  assert(declaration('dorego', 'npm', ['exec', '--workspace=dorego', '--', 'tsx', 'tests/desktop.e2e.ts']).locks.includes('port:4327'));
  assert(declaration('songalong', 'npm', ['exec', '--workspace=songalong', '--', 'tsx', 'tests/amazing-grace-editions.browser.ts']).locks.includes('port:4601'));
});
test('catalog partitions and visual groups cover every original case without collisions', () => {
  const catalog = commandTasks('songalong', 'nightly', 'chromium').filter(task => task.partition);
  assert.deepEqual(catalog.map(task => task.env.TEST_SHARD), ['1/3', '2/3', '3/3']);
  const both = [...catalog, ...commandTasks('songalong', 'nightly', 'webkit').filter(task => task.partition)];
  assert.equal(new Set(both.map(task => task.env.TEST_PORT)).size, both.length);
  const { groups } = require('../../scripts/ci/visual-groups.cjs'), split = groups();
  const all = fs.readdirSync(path.resolve(__dirname, '../../apps/soundglow/tests/visual')).filter(file => file.endsWith('.spec.cjs')).sort();
  assert.deepEqual([...split.ui, ...split.timing].sort(), all);
  const jobs = commandTasks('soundglow', 'nightly', 'chromium').filter(task => task.id.endsWith(':ui') || task.id.endsWith(':timing'));
  assert.equal(jobs.length, 2);
  assert(jobs.find(task => task.kind === 'timing').args.includes('--workers=1'));
  assert(jobs.find(task => task.kind === 'timing').locks.includes('realtime-audio'));
  assert(jobs.every(task => task.needs.includes('soundglow:visual-fixture')));
});

test('ready critical prerequisites reserve capacity instead of starving behind small leaf tasks', async () => {
  const order = [];
  await schedule([{ ...task('running'), priority: 20 }, { ...task('wide', [], [], 2), priority: 10 }, task('leaf')], { workers: 2, async execute(t) {
    order.push(t.id); await new Promise(resolve => setImmediate(resolve)); return { exitCode: 0 };
  } });
  assert.deepEqual(order, ['running', 'wide', 'leaf']);
});

test('an already cancelled task never starts a process or creates logs', async () => {
  const controller = new AbortController(); controller.abort();
  const directory = path.join(os.tmpdir(), 'ci-preaborted-' + process.pid + '-' + Date.now());
  const result = await execute({ id: 'not-started', command: process.execPath, args: ['-e', 'process.exit(99)'] }, { directory, signal: controller.signal });
  assert(result.cancelled); assert(!fs.existsSync(directory));
});

test('backend allocations remain disjoint even when random candidates repeat', async () => {
  const { backendPorts } = require('../../scripts/ci/local.cjs'), allocated = new Set();
  const first = await backendPorts(allocated, () => 0), second = await backendPorts(allocated, () => 0);
  assert.equal(allocated.size, 8);
  assert(Object.values(first).every(port => !Object.values(second).includes(port)));
});

test('local pre-push selection uses CI pending-release recovery, not just changed files', async () => {
  const { selection } = require('../../scripts/ci/local.cjs');
  const selected = await selection({ base: 'origin/main' }, {
    readGit: args => args[0] === 'merge-base' ? 'a'.repeat(40) : 'b'.repeat(40),
    detect: async ({ env }) => {
      assert.equal(env.GITHUB_EVENT_NAME, 'push'); assert.equal(env.CI_BASE_SHA, 'a'.repeat(40)); assert.equal(env.GITHUB_SHA, 'b'.repeat(40));
      return { apps: ['soundglow'], accounts: true, deploy: ['soundglow'], files: ['docs/testing.md'] };
    },
  });
  assert.deepEqual(selected.apps, ['soundglow']); assert(selected.accounts); assert.equal(selected.scope, 'affected');
});

test('parallel Vite servers and catalog partitions own distinct writable dependency caches', () => {
  const path = require('node:path');
  const cwd = path.resolve(__dirname, '../..');
  const tasks = ['dorego', 'notewise', 'songalong', 'soundglow'].flatMap(app =>
    ['chromium', 'webkit'].flatMap(browser => commandTasks(app, 'nightly', browser, cwd)));
  const caches = tasks.map(task => task.env.CI_VITE_CACHE_DIR);
  assert.equal(new Set(caches).size, tasks.length);
  assert(caches.every(directory => directory.startsWith(path.join(cwd, 'work/ci-vite-cache') + path.sep)));
  const catalogs = tasks.filter(task => task.partition);
  assert.equal(catalogs.length, 6);
  assert.equal(new Set(catalogs.map(task => task.env.CI_VITE_CACHE_DIR)).size, 6);
});
