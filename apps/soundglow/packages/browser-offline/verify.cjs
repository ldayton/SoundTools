const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const pin = JSON.parse(fs.readFileSync('vendor/browser-offline.json', 'utf8'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(fs.readFileSync(path.join('vendor', pin.artifact))), pin.sha256, 'Offline package tarball differs from pin');
assert.equal(require('./package.json').version, pin.version, 'Offline package version differs from pin');
for (const [file, hash] of Object.entries(pin.files)) {
  assert.equal(sha(fs.readFileSync(path.join(__dirname, file))), hash, 'Installed offline file differs: ' + file);
  const canonical = path.join(pin.sourceDirectory, file);
  if (fs.existsSync(canonical)) assert.equal(sha(fs.readFileSync(canonical)), hash, 'Unreleased offline source: ' + file);
}
console.log(`Verified ${pin.name}@${pin.version} (${pin.sha256.slice(0, 12)})`);
