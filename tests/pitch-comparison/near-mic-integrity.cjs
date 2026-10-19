const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const read = file => JSON.parse(fs.readFileSync(file));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = manifest => hash(JSON.stringify(manifest));
function validateInputs(root) {
  const pin = read(path.join(root, 'tests/pitch-comparison/near-mic-manifest.json'));
  assert.deepEqual(read(path.join(root, 'outputs/pitch-comparison/near-mic/manifest.json')), pin, 'Corpus manifest differs from source pin');
  const control = read(path.join(root, 'tests/pitch-comparison/near-mic-control.json'));
  const manifest = {...pin, control};
  for (const clip of [control, ...pin.clips]) {
    const pcm = fs.readFileSync(path.join(root, clip.pcm || `outputs/pitch-comparison/near-mic/${clip.id}.f32`));
    assert.equal(hash(pcm), clip.pcmSha256, `${clip.id}: PCM differs from pin`);
    assert.equal(pcm.length, clip.seconds * 48000 * 4, `${clip.id}: PCM duration differs`);
    assert.equal(hash(fs.readFileSync(path.join(root, clip.wav))), clip.wavSha256, `${clip.id}: WAV differs from pin`);
  }
  return manifest;
}
function validateResults(root, results) {
  const manifest = validateInputs(root);
  assert.equal(results.identity, identity(manifest), 'Results belong to a different corpus');
  const expected = [manifest.control, ...manifest.clips];
  assert.deepEqual(results.clips.map(c => c.id), expected.map(c => c.id), 'Missing, duplicate or reordered results');
  results.clips.forEach((clip, i) => {
    for (const [key, value] of Object.entries(expected[i])) assert.deepEqual(clip[key], value, `${clip.id}: stale ${key}`);
  });
  return manifest;
}
module.exports = {validateInputs, validateResults, identity};
