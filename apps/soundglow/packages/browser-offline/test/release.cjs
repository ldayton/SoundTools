const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), cp = require('node:child_process');
const source = path.resolve(__dirname, '..'), repo = path.resolve(source, '../..');
for (const scenario of ['changed-same-version', 'version-rollback']) {
  test('release refuses ' + scenario + ' before updating either consumer', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'offline-release-guard-'));
    try {
      const root = path.join(temp, 'Soundglow'), target = path.join(temp, 'DoReGo');
      fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
      fs.mkdirSync(target);
      fs.cpSync(source, path.join(root, 'packages/browser-offline'), { recursive: true });
      fs.copyFileSync(path.join(repo, 'scripts/sync-offline.cjs'), path.join(root, 'scripts/sync-offline.cjs'));
      const pin = JSON.parse(fs.readFileSync(path.join(repo, 'vendor/browser-offline.json')));
      if (scenario === 'version-rollback') pin.version = '99.0.0';
      else fs.appendFileSync(path.join(root, 'packages/browser-offline/runtime.cjs'), '\n// changed without a version bump\n');
      const before = JSON.stringify(pin);
      fs.writeFileSync(path.join(root, 'vendor/browser-offline.json'), before);
      const result = cp.spawnSync(process.execPath, [path.join(root, 'scripts/sync-offline.cjs'), target], { encoding: 'utf8' });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario === 'version-rollback' ? /versions must move forward/ : /increment its version/);
      assert.equal(fs.readFileSync(path.join(root, 'vendor/browser-offline.json'), 'utf8'), before);
      assert.deepEqual(fs.readdirSync(target), []);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  });
}
