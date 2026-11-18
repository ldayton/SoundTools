const { test } = require('node:test');
const assert = require('node:assert/strict');
const { affected, changes } = require('../../scripts/ci/affected.cjs');
const { gate } = require('../../scripts/ci/gate.cjs');
test('app code validates and releases only its app', () => assert.deepEqual(affected(['apps/dorego/client/src/main.ts']).deploy, ['dorego']));
test('shared music code reaches both practice consumers, not unrelated apps', () => assert.deepEqual(affected(['packages/music-practice/src/main.ts']).deploy, ['notewise', 'songalong']));
test('transitive account/UI dependencies reach every consumer', () => assert.equal(affected(['packages/account/account.ts']).deploy.length, 4));
test('test and workflow changes validate consumers without publishing', () => {
  assert.deepEqual(affected(['apps/notewise/tests/piano.browser.ts']).apps, ['notewise']);
  assert.deepEqual(affected(['apps/notewise/tests/piano.browser.ts']).deploy, []);
  assert.equal(affected(['.github/workflows/ci.yml']).apps.length, 4);
  assert.deepEqual(affected(['.github/workflows/ci.yml']).deploy, []);
});
test('docs require no browsers or deployments', () => assert.deepEqual(affected(['docs/accounts.md', 'README.md']), { apps: [], deploy: [], accounts: false }));
test('lockfiles, unknown packages and deleted workspaces cannot silently skip apps', () => { for (const file of ['package-lock.json', 'packages/deleted/src/a.ts', 'apps/notecards/src/main.ts']) assert.equal(affected([file]).deploy.length, 4); });
test('nightly and manual validation cover everything without publishing', () => assert.deepEqual(affected([], undefined, true), { apps: ['dorego', 'notewise', 'songalong', 'soundglow'], deploy: [], accounts: true }));
test('uses the last successful push, retaining changes from cancelled pushes', async () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40); let diff;
  const r = await changes({ env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: head }, fetch: async () => Response.json({ workflow_runs: [{ head_sha: base }] }), git: args => { diff = args; return 'apps/dorego/client/src/main.ts\nREADME.md'; } });
  assert.equal(r.base, base); assert(diff.includes(`${base}...${head}`)); assert.deepEqual(r.deploy, ['dorego']);
});
test('unknown baseline and unavailable history validate conservatively', async () => { const r = await changes({ env: { GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'b'.repeat(40) }, fetch: async () => { throw Error('offline'); } }); assert.equal(r.deploy.length, 4); });
test('release gate rejects failures and cancellations, permits deliberately skipped apps', () => {
  const good = { changes: { result: 'success' }, shared: { result: 'success' }, dorego: { result: 'success' }, soundglow: { result: 'skipped' } };
  assert.doesNotThrow(() => gate(good));
  for (const result of ['failure', 'cancelled']) assert.throws(() => gate({ ...good, dorego: { result } }));
  assert.throws(() => gate({ ...good, changes: { result: 'skipped' } }));
});
