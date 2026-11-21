const { test } = require('node:test');
const assert = require('node:assert/strict');
const { destroyOwnedStack } = require('../../scripts/ci/account-backend.cjs');
const cwd = '/project/work/ci-snapshots/run-123/accounts-chromium';
test('destroys only the exact disposable snapshot stack, including its retained data', () => {
  const calls = [], id = 'a'.repeat(64);
  destroyOwnedStack(cwd, (command, args) => {
    calls.push([command, args]);
    return JSON.stringify({ stacks: [
      { id, project_root: cwd, name: 'default' },
      { id: 'b'.repeat(64), project_root: '/project', name: 'default' },
      { id: 'c'.repeat(64), project_root: cwd + '-other', name: 'default' },
      { id: 'd'.repeat(64), project_root: cwd, name: 'developer' },
    ] });
  });
  assert.deepEqual(calls[1], ['supabase', ['stack', 'destroy', '--stack-id', id, '--yes']]);
  assert.equal(calls.length, 2);
});
test('refuses developer checkouts and does not guess a stack after a failed start', () => {
  assert.throws(() => destroyOwnedStack('/project', () => assert.fail('must not run')), /outside an owned/);
  let calls = 0;
  destroyOwnedStack(cwd, () => { calls++; return '{"stacks":[]}'; });
  assert.equal(calls, 1);
});
