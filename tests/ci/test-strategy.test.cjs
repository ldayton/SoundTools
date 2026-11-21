const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { matrix, plan, editionFiles } = require('../../scripts/ci/test-strategy.cjs');
const { runCommand, recorder } = require('../../scripts/ci/test-command.cjs');
const root = path.resolve(__dirname, '../..');
// Expand npm aliases so a convenience-script edit cannot silently add an
// exhaustive catalog to the release-critical core lane again.
function leaves(app, task, ancestors = []) {
  assert(!ancestors.includes(task), `Cyclic test script: ${[...ancestors, task].join(' -> ')}`);
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'apps', app, 'package.json'))).scripts;
  assert(scripts[task], `Missing ${app}:${task}`);
  return scripts[task].split(/\s*&&\s*/).flatMap(part => {
    const nested = /^npm run ([\w:.-]+)(?:\s+.*)?$/.exec(part);
    return nested ? leaves(app, nested[1], [...ancestors, task]) : [part];
  });
}
function expanded(app, profile) {
  return plan(app, profile).flatMap(([command, args]) => command === 'npm' && args[0] === 'run' ? leaves(app, args[1]) : [`${command} ${args.join(' ')}`]);
}
test('core and exhaustive edition lanes cannot acquire each other through nested npm aliases', () => {
  for (const lane of ['ci', 'nightly']) {
    const commands = expanded('songalong', lane).join('\n');
    if (lane === 'nightly') assert.match(commands, /instrument-audio\.browser/, 'Full instrument-specific audio remains required in Nightly');
    assert.equal((commands.match(/audio-lifecycle\.browser/g) || []).length, 1, 'Audio departure and recovery remains required');
    assert.doesNotMatch(commands, /test:editions|test-strategy\.cjs editions|-editions\.browser\.ts/);
    if (lane === 'ci') assert.doesNotMatch(commands, /hymn-catalog|offline\.browser|hymn-stanzas/);
  }
  assert(editionFiles().length > 0);
  assert.deepEqual(plan('songalong', 'nightly', 'chromium', 'editions').map(([, args]) => args.at(-1)), editionFiles());
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'apps/songalong/package.json'))).scripts;
  assert.match(scripts['test:editions'], /^node .*test-strategy\.cjs editions$/, 'Local and CI edition commands must use the same registry');
});
test('all edition files are required in Nightly matrices; lanes never share a concurrency identity', () => {
  for (const profile of ['ci', 'nightly']) {
    const rows = matrix('songalong', profile).include;
    const keys = rows.map(row => `${row.browser}-${row.group}-${row.shard}`);
    assert.equal(new Set(keys).size, rows.length);
    for (const browser of profile === 'ci' ? ['chromium'] : ['chromium', 'webkit']) {
      assert(rows.some(row => row.group === 'core' && row.browser === browser));
      assert.equal(rows.some(row => row.group === 'editions' && row.browser === browser), profile === 'nightly');
    }
    assert(rows.every(row => row.timeout > 0 && row.timeout <= 30));
  }
  assert.throws(() => matrix('songalong', 'typo'));
  assert.throws(() => plan('dorego', 'ci', 'chromium', 'editions'));
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/validate-app.yml'), 'utf8');
  assert.match(workflow, /matrix: \$\{\{ fromJSON\(inputs\.matrix\) \}\}/);
  assert.match(workflow, /group: .*matrix\.browser.*matrix\.group/);
  assert.match(workflow, /timeout-minutes: \$\{\{ matrix.timeout \}\}/);
});
test('generic control tests use capability fixtures, not literal production song routes', () => {
  for (const file of ['apps/songalong/tests/workspace.browser.ts', 'apps/songalong/tests/fingerings.browser.ts', 'apps/songalong/tests/hymn-key.browser.ts', 'apps/songalong/tests/hymn-key-menu.browser.ts', 'apps/songalong/tests/hymn-passage.browser.ts', 'apps/songalong/tests/hymn-octave.browser.ts', 'apps/songalong/tests/hymn-recovery.browser.ts', 'apps/songalong/tests/sight-reading.browser.ts', 'packages/music-practice/browser-tests/sidebars.browser.ts', 'apps/songalong/tests/hymn-playback.browser.ts', 'tests/accounts.browser.mts']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /test-fixtures\/hymns/, file);
    assert.doesNotMatch(source, /\/piano\/hymns\/[a-z][a-z-]+/, `${file}: use the capability fixture or move song-specific assertions into an edition test`);
  }
});
test('failed test commands run once, preserve exit/signal evidence and stop the caller', () => {
  let attempts = 0; const records = [];
  const failure = Object.assign(Error('assertion failed'), { status: 1, signal: null });
  assert.throws(() => runCommand('test', ['file'], { execute() { attempts++; throw failure; }, record: result => records.push(result) }), /assertion failed/);
  assert.equal(attempts, 1);
  assert.equal(records[0].status, 'failure');
  assert.equal(records[0].exitCode, 1);
  assert(records[0].elapsedMs >= 0);
});
test('a diagnostic rerun cannot truncate an existing timing/evidence file', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'test-evidence-'));
  const file = path.join(directory, 'attempt.jsonl');
  try {
    recorder(file, { app: 'songalong', tier: 'ci', group: 'core', browser: 'chromium' })({ command: 'test', args: ['file'], elapsedMs: 1, status: 'failure', exitCode: 1, signal: null });
    const firstFailure = fs.readFileSync(file, 'utf8');
    assert.throws(() => recorder(file, {}), /EEXIST/);
    assert.equal(fs.readFileSync(file, 'utf8'), firstFailure);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
