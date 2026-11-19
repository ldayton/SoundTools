import { test } from "node:test";
import assert from "node:assert/strict";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { gospelOrganScene, gospelChordPitches } from "../src/backing-gospel";
import { gospelPalette } from "../src/backing-gospel-palette";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";
import { scalePitchClasses } from "../src/backing-arrangement";
import {
  backingSampleChoices,
  backingSettings,
  type backingPack,
} from "../src/backing-track-model";

const pack = gospelPalette({
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack);
test("gospel is diatonic, loop-safe and playable in every key and both scale qualities", () => {
  assert.equal(backingSettings({ style: "gospel" }).style, "gospel");
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const take = arrange("gospel", mode, quality, 0, 76, tonic),
          pcs = scalePitchClasses(tonic, quality);
        assert.equal(take.beats, 256);
        assert.equal(take.plan.bars[0].level, take.plan.bars.at(-1)!.level);
        for (const e of take.events) {
          assert.ok(
            Number.isFinite(e.beat) &&
              e.beat >= 0 &&
              e.duration > 0 &&
              e.beat + e.duration <= take.beats,
          );
          if (e.part === "bass" || e.part === "keys")
            assert.ok(pcs.includes(e.note % 12));
          if (e.instrument === "tonewheel-organ") {
            assert.ok(e.note >= 60 && e.note <= 91);
            for (
              let bar = Math.floor(e.beat / 4);
              bar * 4 < e.beat + e.duration;
              bar++
            )
              assert.ok(
                gospelChordPitches(quality, tonic, bar).includes(e.note % 12),
                "held organ never crosses into an incompatible chord",
              );
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
              "native prepared pitch coverage",
            );
          }
        }
        for (let bar = 0; bar < 64; bar++) {
          const bass = take.events.filter(
            (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
          );
          assert.ok(
            bass.length >= 2 && bass.length <= (mode === "active" ? 3 : 2),
          );
        }
      }
});

test("gospel has sustained organ, complementary piano and deliberate dynamic/rotary development", () => {
  const steady = arrange("gospel", "steady", "major", 0, 76, 0),
    active = arrange("gospel", "active", "major", 0, 76, 0);
  assert.ok(
    steady.events.some(
      (e) => e.instrument === "tonewheel-organ" && e.duration > 7.7,
    ),
    "common tones stay held without bar-by-bar reattacks",
  );
  assert.ok(steady.events.some((e) => e.instrument === "acoustic-piano"));
  assert.ok(!active.events.some((e) => e.part === "guitar"));
  assert.ok(
    active.events.some((e) => e.part === "percussion" && e.note === 54),
  );
  assert.ok(!steady.events.some((e) => e.part === "percussion"));
  assert.ok(active.events.length > steady.events.length);
  assert.ok(
    active.events.some(
      (e) =>
        e.instrument === "tonewheel-organ" && e.note > 79 && e.duration < 0.3,
    ),
    "short organ answers above the held accompaniment",
  );
  const opening = gospelOrganScene(active, 0),
    lift = gospelOrganScene(active, 120),
    ending = gospelOrganScene(active, 256 - 1e-6);
  assert.equal(opening.rotary, "slow");
  assert.equal(lift.rotary, "fast");
  assert.ok(
    lift.registration > opening.registration &&
      lift.expression > opening.expression,
  );
  assert.equal(ending.rotary, opening.rotary);
  assert.ok(Math.abs(ending.expression - opening.expression) < 1e-6);
  assert.equal(gospelOrganScene(steady, 120).rotary, "slow");
  for (const tempo of [50, 180]) {
    const t = arrange("gospel", "active", "minor", 2, tempo, 11);
    assert.ok(
      t.events.every(
        (e) => e.beat >= 0 && e.duration > 0 && e.beat + e.duration <= t.beats,
      ),
    );
  }
});
