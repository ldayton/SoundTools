const { test } = require('node:test');
const assert = require('node:assert/strict');
const { affected, changes } = require('../../scripts/ci/affected.cjs');
const { apps } = require('../../scripts/ci/apps.cjs');
const appForURL = url => Object.keys(apps).find(app => new URL(url).origin === apps[app].origin);
const { gate } = require('../../scripts/ci/gate.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('app code validates and releases only its app', () => assert.deepEqual(affected(['apps/dorego/client/src/main.ts']).deploy, ['dorego']));
test('shared music code reaches all practice consumers, not unrelated apps', () => assert.deepEqual(affected(['packages/music-practice/src/main.ts']).deploy, ['tagaluya', 'notewise', 'songalong']));
test('ordinary app and music changes do not start the local account backend', () => {
  for (const file of ['apps/dorego/src/style.css', 'packages/music-practice/src/piano-fingering.ts']) assert.equal(affected([file]).accounts, false);
  for (const file of ['packages/account/session.ts', 'packages/music-practice/src/persistence.ts', 'apps/dorego/src/account-records.ts', 'tests/accounts-reliability.browser.mts', 'supabase/migrations/a.sql']) assert.equal(affected([file]).accounts, true);
});
test('transitive account/UI dependencies reach every consumer', () => assert.equal(affected(['packages/account/account.ts']).deploy.length, 5));
test('test and workflow changes validate consumers without publishing', () => {
  assert.deepEqual(affected(['apps/notewise/tests/piano.browser.ts']).apps, ['notewise']);
  assert.deepEqual(affected(['apps/notewise/tests/piano.browser.ts']).deploy, []);
  assert.equal(affected(['.github/workflows/ci.yml']).apps.length, 5);
  assert.deepEqual(affected(['.github/workflows/ci.yml']).deploy, []);
});
test('docs require no browsers or deployments', () => assert.deepEqual(affected(['docs/accounts.md', 'README.md']), { apps: [], deploy: [], accounts: false }));
test('lockfiles, unknown packages and deleted workspaces cannot silently skip apps', () => { for (const file of ['package-lock.json', 'packages/deleted/src/a.ts', 'apps/notecards/src/main.ts']) assert.equal(affected([file]).deploy.length, 5); });
test('nightly and manual validation cover everything without publishing', () => assert.deepEqual(affected([], undefined, true), { apps: ['tagaluya', 'dorego', 'notewise', 'songalong', 'soundglow'], deploy: [], accounts: true }));
test('validates this push and recovers unpublished source changes from live revisions', async () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40); let diff;
  const r = await changes({ env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head, CI_BASE_SHA: base }, fetch: async url => url.includes('api.github.com') ? Response.json({ workflow_runs: [{ head_sha: base }] }) : Response.json({ app: appForURL(url), profile: 'production', sha: base }), git: args => { if (args[0] === 'diff') diff = args; return args[0] === 'diff' ? 'apps/dorego/client/src/main.ts\nREADME.md' : ''; } });
  assert.equal(r.base, base); assert(diff.includes(`${base}...${head}`)); assert.deepEqual(r.deploy, ['dorego']);
});
test('unknown baseline and unavailable history validate conservatively', async () => { const r = await changes({ env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'b'.repeat(40) }, fetch: async () => { throw Error('offline'); } }); assert.equal(r.deploy.length, 5); });
test('a push reads its event baseline without depending on the workflow-history API', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-event-'));
  const event = path.join(directory, 'event.json'), base = 'a'.repeat(40), head = 'b'.repeat(40);
  fs.writeFileSync(event, JSON.stringify({ before: base }));
  try {
    const result = await changes({
      env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head, GITHUB_EVENT_PATH: event },
      fetch: async url => {
        assert.ok(appForURL(url));
        assert.ok(url.endsWith('/build-info.json'));
        return Response.json({ app: appForURL(url), profile: 'production', sha: base });
      },
      git: args => args[0] === 'diff' ? 'apps/dorego/src/style.css' : '',
    });
    assert.equal(result.base, base);
    assert.deepEqual(result.apps, ['dorego']);
    assert.deepEqual(result.deploy, ['dorego']);
    assert.equal(result.accounts, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('release gate rejects failures and cancellations, permits deliberately skipped apps', () => {
  const good = { changes: { result: 'success', outputs: { apps: '["dorego"]', builds: '["dorego"]', accounts: 'false' } }, shared: { result: 'success' }, build: { result: 'success' }, dorego: { result: 'success' }, soundglow: { result: 'skipped' } };
  assert.doesNotThrow(() => gate(good));
  for (const result of ['failure', 'cancelled']) assert.throws(() => gate({ ...good, dorego: { result } }));
  assert.throws(() => gate({ ...good, changes: { result: 'skipped' } }));
  assert.throws(() => gate({ ...good, dorego: { result: 'skipped' } }), /Required validation/);
});
test('an earlier green but unpromoted revision is still released after a docs-only push', async () => {
  const base = 'a'.repeat(40), live = 'c'.repeat(40), head = 'b'.repeat(40);
  const r = await changes({ env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head, CI_BASE_SHA: base }, fetch: async url => url.includes('api.github.com') ? Response.json({ workflow_runs: [{ head_sha: base }] }) : Response.json({ app: appForURL(url), profile: 'production', sha: live }), git: args => args[0] === 'diff' ? (args.includes(`${live}...${head}`) ? 'apps/dorego/src/main.ts\nREADME.md' : 'README.md') : '' });
  assert.deepEqual(r.deploy, ['dorego']); assert.deepEqual(r.apps, ['dorego']);
  assert.equal(r.accounts, false);
});

test('the summary gate requires each selected app validation', () => {
  const good = { changes: { result: 'success', outputs: { apps: '["notewise"]', builds: '["notewise"]', accounts: 'false' } }, shared: { result: 'success' }, build: { result: 'success' }, notewise: { result: 'success' }, 'notewise-backing': { result: 'success' } };
  assert.doesNotThrow(() => gate(good));
  assert.throws(() => gate({ ...good, notewise: { result: 'skipped' } }), /notewise/);
});

test('DoReGo revalidates and releases when its shared Soundglow pitch assets change', () => {
  const result = affected(['apps/soundglow/dist/vendor/praat/processor.js']);
  assert.deepEqual(result.apps, ['dorego', 'soundglow']);
  assert.deepEqual(result.deploy, ['dorego', 'soundglow']);
});

test('Tagalujah validates and releases through its Vercel project', () => {
  assert.deepEqual(affected(['apps/tagaluya/src/main.tsx']).apps, ['tagaluya']);
  assert.deepEqual(affected(['apps/tagaluya/src/main.tsx']).deploy, ['tagaluya']);
});
