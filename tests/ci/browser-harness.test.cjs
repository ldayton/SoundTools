const { test } = require('node:test');
const assert = require('node:assert/strict');
const { browserName, clean } = require('../../scripts/ci/browser-harness.cjs');
test('uses the configured engine and rejects misspellings rather than silently launching Chromium', () => {
  assert.equal(browserName({ TEST_BROWSER: 'firefox' }), 'firefox');
  assert.equal(browserName({ SOUNDGLOW_TEST_BROWSER: 'webkit' }), 'webkit');
  assert.throws(() => browserName({ TEST_BROWSER: 'chrome' }), /Unknown/);
});
test('failure output redacts sign-in credentials', () => { assert.equal(clean('https://example.test/#token_hash=secret&type=email'), 'https://example.test/#token_hash=[redacted]&type=email'); });
