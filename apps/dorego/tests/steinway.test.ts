import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('bitKlavier includes all 16 layers at each original minor-third pitch', async () => {
  const { BITKLAVIER_SAMPLES } = await import('../src/bitklavier-samples');
  assert.equal(BITKLAVIER_SAMPLES.length, 480);
  for (let midi = 21; midi <= 108; midi += 3) {
    assert.deepEqual(
      BITKLAVIER_SAMPLES.filter((sample) => sample.midi === midi).map((sample) => sample.layer),
      Array.from({ length: 16 }, (_, i) => i + 1)
    );
  }
  for (const { file } of BITKLAVIER_SAMPLES) {
    const sample = await readFile(new URL(`../public/samples/bitklavier/${file}`, import.meta.url));
    assert.ok(sample.length > 1024, file);
    assert.equal(sample.toString('ascii', 0, 4), 'fLaC', file);
  }
});

test('web piano variants retain stereo resolution and the required source duration', async () => {
  // FLAC STREAMINFO packs rate, channel count, bit depth and frame count into 64 bits.
  const info = (bytes: Buffer) => {
    assert.equal(bytes.toString('ascii', 0, 4), 'fLaC');
    const packed = bytes.readBigUInt64BE(18);
    return {
      rate: Number(packed >> 44n),
      channels: Number((packed >> 41n) & 7n) + 1,
      bits: Number((packed >> 36n) & 31n) + 1,
      frames: Number(packed & ((1n << 36n) - 1n)),
    };
  };
  for (const layer of [11, 12]) {
    for (let midi = 21; midi <= 108; midi += 3) {
      const original = info(
        await readFile(
          new URL(`../public/samples/bitklavier/${midi}-v${layer}.flac`, import.meta.url)
        )
      );
      for (const seconds of [2, 5]) {
        const web = info(
          await readFile(
            new URL(
              `../public/samples/bitklavier-web-v1/${midi}-v${layer}-${seconds}s.flac`,
              import.meta.url
            )
          )
        );
        assert.deepEqual(web, {
          ...original,
          frames: Math.min(original.frames, seconds * original.rate),
        });
      }
    }
  }
});
