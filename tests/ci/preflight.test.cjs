const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { inventory, preflight, smokeResources } = require('../../scripts/ci/preflight.cjs');
const { manifestLimits } = require('@ldayton/browser-offline');
const bytes = Buffer.from('export const current = true;');
const file = { url: '/assets/main.js', sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
test('rejects invalid, duplicate, source-map and out-of-bounds inventories', () => {
  for (const files of [[file, file], [{ ...file, url: '/assets/private.map' }], [{ ...file, url: '/../secret' }], [{ ...file, sha256: 'broken' }], Array(manifestLimits.practice.files + 1).fill(file)]) assert.throws(() => inventory('songalong', { files }));
});
test('validates the bytes on disk after all bundler transformations', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-'));
  try {
    fs.mkdirSync(path.join(out, 'assets'));
    fs.writeFileSync(path.join(out, 'assets/main.js'), bytes);
    fs.writeFileSync(path.join(out, 'sw.js'), 'worker');
    fs.writeFileSync(path.join(out, 'offline-pack.json'), JSON.stringify({ files: [file] }));
    assert.equal(preflight('songalong', out).files.length, 1);
    fs.writeFileSync(path.join(out, 'assets/main.js'), 'final bundler changed these bytes');
    assert.throws(() => preflight('songalong', out), /do not match/);
  } finally { fs.rmSync(out, { recursive: true }); }
});
test('staged checks reject a wrong revision or a CDN serving HTML in place of JavaScript', async () => {
  const sha = 'a'.repeat(40); let wrong = false;
  const fetch = async url => url.endsWith('/build-info.json') ? Response.json({ app: 'songalong', sha, profile: 'production' }) : url.endsWith('/offline-pack.json') ? Response.json({ files: [file] }) : new Response(wrong ? '<html>fallback</html>' : bytes);
  assert.equal((await smokeResources('https://stage.vercel.app', 'songalong', fetch, sha)).verified, 1);
  await assert.rejects(smokeResources('https://stage.vercel.app', 'songalong', fetch, 'b'.repeat(40)), /commit/);
  wrong = true; await assert.rejects(smokeResources('https://stage.vercel.app', 'songalong', fetch, sha), /integrity mismatch/);
});
