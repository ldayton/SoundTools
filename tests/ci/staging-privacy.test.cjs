const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorizeStagedContext } = require('../../scripts/ci/smoke-browser.cjs');
test('staging interception consumes raw network errors that include private headers', async () => {
  let handle, aborted = false;
  await authorizeStagedContext({ route: async (match, handler) => { handle = handler; assert(match(new URL('https://stage.vercel.app/app.js'))); assert(!match(new URL('https://other.vercel.app/app.js'))); } }, 'https://stage.vercel.app', 'dummy-secret');
  await handle({ request: () => ({ headers: () => ({}) }), fetch: async () => { throw Error('x-vercel-protection-bypass: dummy-secret'); }, abort: async () => { aborted = true; } });
  assert.equal(aborted, true);
});
