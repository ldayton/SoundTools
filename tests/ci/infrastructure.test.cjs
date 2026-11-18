const { test } = require('node:test');
const assert = require('node:assert/strict');
const { provision } = require('../../scripts/ci/infrastructure.cjs');
test('retries a transient backend failure once and stops on success', async () => { let calls = 0; await provision('supabase', ['start'], { run: () => ({ status: ++calls === 1 ? 1 : 0 }), wait: async () => {}, log: () => {} }); assert.equal(calls, 2); });
test('bounds repeated infrastructure failures and process timeouts', async () => { let calls = 0; await assert.rejects(provision('npx', ['playwright', 'install', 'webkit'], { run: (_cmd, _args, options) => { calls++; assert.equal(options.timeout, 180000); return { error: Error('timeout') }; }, wait: async () => {}, log: () => {} }), /after 2 attempts/); assert.equal(calls, 2); });
test('does not retry test failures or build commands', async () => { for (const [command, args] of [['npm', ['test']], ['supabase', ['db', 'push']], ['npx', ['playwright', 'test']]]) await assert.rejects(provision(command, args), /Only/); });
