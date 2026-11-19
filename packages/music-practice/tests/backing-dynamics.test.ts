import assert from "node:assert/strict";
import test from "node:test";
import {
  compressBackingSample,
  levelBackingSections,
} from "../src/backing-dynamics";
import { rootsArrangement } from "../src/backing-roots";
import { backingPeakCurve } from "../src/backing-performance";
import type { BackingSample } from "../src/backing-track-model";

const sample: BackingSample = {
  file: "test",
  part: "bass",
  note: 40,
  velocity: 64,
  rr: 0,
  gain: 1,
  release: false,
};
function buffer(
  left: Float32Array,
  right = Float32Array.from(left, (n) => n / 2),
) {
  return {
    numberOfChannels: 2,
    sampleRate: 16000,
    length: left.length,
    getChannelData: (ch: number) => (ch ? right : left),
  } as AudioBuffer;
}

test("sample compression preserves stereo, never boosts, and controls strong notes without flattening soft layers", () => {
  const loud = Float32Array.from(
    { length: 16000 },
    (_, i) => 0.5 * Math.sin((i * Math.PI) / 8),
  );
  const original = loud.slice();
  const processed = compressBackingSample(buffer(loud), sample);
  let before = 0,
    after = 0;
  for (let i = 0; i < loud.length; i++) {
    assert.ok(
      Number.isFinite(loud[i]) &&
        Math.abs(loud[i]) <= Math.abs(original[i]) + 1e-7,
    );
    assert.ok(Math.abs(processed.getChannelData(1)[i] - loud[i] / 2) < 1e-7);
    if (i > 4000) {
      before += original[i] ** 2;
      after += loud[i] ** 2;
    }
  }
  assert.ok(
    10 * Math.log10(after / before) < -6,
    "the sustained loud layer is controlled",
  );
  const soft = Float32Array.from(original, (n) => n * 0.001),
    reference = soft.slice();
  compressBackingSample(buffer(soft), sample);
  assert.deepEqual(
    soft,
    reference,
    "quiet notes retain their original level and character",
  );
  const release = original.slice();
  compressBackingSample(buffer(release), { ...sample, release: true });
  assert.deepEqual(
    release,
    original,
    "recorded release samples keep their natural decay",
  );
});

test("section leveling is bounded and changes only gain, preserving all notes, gestures and timing", () => {
  const take = rootsArrangement("blues", "active", "major", 0, 90, 0);
  const prior = structuredClone(take),
    leveled = levelBackingSections(take);
  assert.deepEqual(take, prior, "the original performance remains immutable");
  assert.equal(leveled.events.length, take.events.length);
  let changed = 0;
  for (let i = 0; i < take.events.length; i++) {
    const { level: a, ...original } = take.events[i],
      { level: b, ...next } = leveled.events[i];
    assert.deepEqual(next, original);
    assert.ok(
      b > 0 && b / a <= 10 ** (12 / 20) + 1e-8 && b / a >= 10 ** (-6 / 20),
    );
    if (Math.abs(a - b) > 0.001) changed++;
  }
  assert.ok(changed > take.events.length / 2);
  assert.equal(
    leveled.plan,
    take.plan,
    "registration, voicings and form retain their musical identity",
  );
});

test("the final safety curve is linear at ordinary levels, symmetric, smooth and conservatively bounded", () => {
  const curve = backingPeakCurve();
  assert.equal(curve[4096], 0);
  for (let i = 0; i < curve.length; i++) {
    const x = i / 4096 - 1;
    assert.ok(Number.isFinite(curve[i]) && Math.abs(curve[i]) <= 0.74);
    assert.ok(Math.abs(curve[i] + curve[curve.length - 1 - i]) < 1e-7);
    if (Math.abs(x) < 0.65) assert.ok(Math.abs(curve[i] - x) < 1e-7);
    if (i)
      assert.ok(
        curve[i] >= curve[i - 1] && curve[i] - curve[i - 1] <= 1 / 4096 + 1e-7,
      );
  }
});

test("production leveling preserves every genre's complete musical performance in both feels and tonalities", async () => {
  const { genreBackingArrangement, rawGenreBackingArrangement } =
    await import("../src/backing-genre-engine");
  const { BACKING_GENRES } = await import("../src/backing-genres");
  for (const style of Object.keys(
    BACKING_GENRES,
  ) as (keyof typeof BACKING_GENRES)[])
    for (const mode of ["steady", "active"] as const)
      for (const quality of ["major", "minor"] as const)
        for (const harmony of [undefined, quality]) {
          const raw = rawGenreBackingArrangement(
              style,
              mode,
              quality,
              4,
              100,
              0,
              undefined,
              harmony,
            ),
            normalized = genreBackingArrangement(
              style,
              mode,
              quality,
              4,
              100,
              0,
              undefined,
              harmony,
            );
          assert.deepEqual(normalized.plan, raw.plan);
          assert.equal(normalized.beats, raw.beats);
          assert.equal(normalized.events.length, raw.events.length);
          for (let i = 0; i < raw.events.length; i++) {
            const { level: before, ...a } = raw.events[i],
              { level: after, ...b } = normalized.events[i];
            assert.deepEqual(
              b,
              a,
              `${style}/${mode}/${quality}: notes and timing`,
            );
            assert.ok(Number.isFinite(after));
            assert.ok(after >= before * 10 ** (-6 / 20) - 1e-8);
            assert.ok(after <= before * 10 ** (12 / 20) + 1e-8);
          }
        }
});
