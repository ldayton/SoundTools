const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyBuild } = require('../../scripts/ci/build.cjs');
test('reused artifacts require the same app, revision, profile and exact bytes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-build-'));
  const file = 'apps/dorego/dist/index.html', revision = 'a'.repeat(40);
  fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
  fs.writeFileSync(path.join(directory, file), 'verified output');
  const data = { app: 'dorego', sha: revision, profile: 'ci', files: { [file]: crypto.createHash('sha256').update('verified output').digest('hex') } };
  const options = { app: 'dorego', revision, directory };
  try {
    assert.equal(verifyBuild(data, options), true);
    for (const mutation of [{ app: 'songalong' }, { sha: 'b'.repeat(40) }, { profile: 'production' }, { files: { '../secret': 'a'.repeat(64) } }]) assert.throws(() => verifyBuild({ ...data, ...mutation }, options));
    fs.writeFileSync(path.join(directory, file), 'corruption');
    assert.throws(() => verifyBuild(data, options), /changed/);
  } finally { fs.rmSync(directory, { recursive: true }); }
});
