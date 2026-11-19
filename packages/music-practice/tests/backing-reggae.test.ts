import { test } from "node:test";
import assert from "node:assert/strict";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { reggaePalette } from "../src/backing-reggae-palette";
import { tonewheelPartials } from "../src/backing-organ";
import {
  backingSampleChoices,
  type backingPack,
} from "../src/backing-track-model";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";
const pack = reggaePalette({
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack);

test("Reggae has native sample coverage and a quiet diatonic bubble in all keys and tempos", () => {
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        for (const tempo of [50, 78, 180]) {
          const t = arrange("reggae", mode, quality, 1, tempo, tonic);
          const pcs = (
            quality === "major"
              ? [0, 2, 4, 5, 7, 9, 11]
              : [0, 2, 3, 5, 7, 8, 10]
          ).map((n) => (n + tonic) % 12);
          for (const e of t.events) {
            assert.ok(
              Number.isFinite(e.beat) &&
                e.beat >= 0 &&
                e.duration > 0 &&
                e.beat + e.duration <= t.beats,
            );
            if (["bass", "guitar", "keys"].includes(e.part))
              assert.ok(pcs.includes(e.note % 12));
            if (e.instrument === "tonewheel-organ") {
              assert.ok(e.note >= 48 && e.note < 60 && e.duration < 0.25);
              assert.ok((Math.abs((e.beat % 1) - 0.5) * 60) / tempo < 0.04);
            } else {
              const choices = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(
                choices.length,
                `missing ${e.part}/${e.note}/${e.articulation}`,
              );
              assert.ok(
                choices.every(([, s]) => s.note === e.note),
                `native pitch coverage: ${e.part}/${e.note} -> ${choices.map(([, s]) => s.note)}`,
              );
            }
            if (e.part === "guitar") {
              assert.ok(
                e.naturalReleaseOnly && e.guitarReleaseSeconds === 0.018,
              );
              assert.ok(e.duration <= 0.13);
              assert.ok(
                [1, 3].some(
                  (n) => (Math.abs((e.beat % 4) - n) * 60) / tempo < 0.05,
                ),
              );
            }
          }
        }
});

test("Reggae repeats a bass hook, adds restrained Active replies and leaves breathing space", () => {
  const steady = arrange("reggae", "steady", "major", 0, 78, 0),
    active = arrange("reggae", "active", "major", 0, 78, 0);
  assert.ok(
    active.events.filter((e) => e.part === "bass").length >
      steady.events.filter((e) => e.part === "bass").length,
  );
  for (const t of [steady, active]) {
    for (let bar = 0; bar < 64; bar++) {
      const b = t.events.filter(
        (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
      );
      assert.ok(b.length <= (t.plan.mode === "active" ? 3 : 2));
      assert.ok(
        b.reduce((sum, e) => sum + e.duration, 0) < 2.7,
        "bass leaves space rather than sustaining through the bar",
      );
    }
    assert.ok(t.events.some((e) => e.part === "keys"));
    assert.equal(t.phrasing, "reggae-roots-bubble-v2");
  }
  const bubble = tonewheelPartials(55, "warm", "reggae");
  assert.deepEqual(
    [...bubble.imaginary].map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
    [2],
    "8-foot fundamental registration",
  );
  assert.notDeepEqual(
    bubble.imaginary,
    tonewheelPartials(55, "warm").imaginary,
    "Gospel registration stays separate",
  );
});
