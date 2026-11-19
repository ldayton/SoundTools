import { test } from "node:test";
import assert from "node:assert/strict";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { pocketPalette } from "../src/backing-pocket-palette";
import {
  backingSampleChoices,
  type backingPack,
} from "../src/backing-track-model";
import { backingInstrumentSound } from "../src/backing-band-sounds";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";
const base = {
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack;

test("Pocket Funk is scale-safe, playable and covered by native attack samples at all tempos", () => {
  const pack = pocketPalette("funk", base),
    tuning = [40, 45, 50, 55, 59, 64];
  const covered = new Set<string>();
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        for (const tempo of [50, 104, 180]) {
          const take = arrange("funk", mode, quality, 1, tempo, tonic),
            pcs = (
              quality === "major"
                ? [0, 2, 4, 5, 7, 9, 11]
                : [0, 2, 3, 5, 7, 8, 10]
            ).map((n) => (n + tonic) % 12);
          for (const e of take.events) {
            assert.ok(
              e.beat >= 0 &&
                Number.isFinite(e.beat) &&
                e.duration > 0 &&
                e.beat + e.duration <= take.beats,
            );
            if (e.part === "bass" || e.part === "guitar")
              assert.ok(pcs.includes(e.note % 12));
            if (e.part === "guitar")
              assert.ok(
                e.string !== undefined &&
                  e.note - tuning[e.string] >= 0 &&
                  e.note - tuning[e.string] <= 12,
              );
            const identity = [
              e.part,
              e.instrument,
              e.note,
              e.articulation,
              e.velocity,
              e.string,
            ].join("/");
            if (!covered.has(identity)) {
              const choices = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(
                choices.length,
                `missing ${e.instrument ?? e.part}/${e.note}/${e.articulation}`,
              );
              assert.ok(choices.every(([, s]) => s.note === e.note));
              covered.add(identity);
            }
            const limit = backingInstrumentSound(e.instrument)?.maxSeconds;
            if (limit)
              assert.ok(
                (e.duration * 60) / tempo + (e.guitarReleaseSeconds ?? 0.08) <
                  limit,
                "retained buffer includes slow-tempo gate and release",
              );
          }
        }
});

test("Pocket Funk interlocks accented chords, muted sixteenths and a sparse bass hook", () => {
  const steady = arrange("funk", "steady", "major", 0, 104, 0),
    active = arrange("funk", "active", "major", 0, 104, 0);
  for (const take of [steady, active]) {
    assert.ok(
      take.events.some(
        (e) =>
          e.instrument === "funk-scratch" &&
          e.articulation === "muted" &&
          e.duration < 0.06,
      ),
    );
    assert.ok(
      take.events.some(
        (e) =>
          e.instrument === "funk-guitar" && Math.abs((e.beat % 1) - 0.75) < 0.1,
      ),
    );
    assert.ok(!take.events.some((e) => e.part === "keys"));
    for (let bar = 0; bar < 64; bar++) {
      const bass = take.events.filter(
        (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
      );
      assert.ok(bass.length <= (take.plan.mode === "active" ? 4 : 3));
      assert.ok(bass.reduce((sum, e) => sum + e.duration, 0) < 1.8);
    }
  }
  assert.ok(
    active.events.some((e) => e.part === "bass" && e.articulation === "ghost"),
  );
  assert.ok(active.events.length > steady.events.length);
  assert.ok(
    Object.keys(pocketPalette("funk", base).samples).every((id) =>
      id.startsWith("funk-"),
    ),
  );
});

test("Mellow Soul seventh voicings and guitar replies stay diatonic and native in all keys", () => {
  const pack = pocketPalette("soul", base),
    covered = new Set<string>();
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        for (const tempo of [50, 84, 180]) {
          const take = arrange("soul", mode, quality, 1, tempo, tonic),
            pcs = (
              quality === "major"
                ? [0, 2, 4, 5, 7, 9, 11]
                : [0, 2, 3, 5, 7, 8, 10]
            ).map((n) => (n + tonic) % 12);
          for (const e of take.events) {
            assert.ok(
              e.beat >= 0 &&
                Number.isFinite(e.beat) &&
                e.duration > 0 &&
                e.beat + e.duration <= take.beats,
            );
            if (["bass", "guitar", "keys"].includes(e.part))
              assert.ok(pcs.includes(e.note % 12));
            const identity = [
              e.part,
              e.instrument,
              e.note,
              e.articulation,
              e.velocity,
              e.string,
            ].join("/");
            if (!covered.has(identity)) {
              const choices = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(choices.length, `missing ${identity}`);
              assert.ok(choices.every(([, s]) => s.note === e.note));
              if (e.part === "keys")
                assert.ok(
                  choices.every(([, s]) => s.velocity === 40),
                  "soft electric-piano layer",
                );
              covered.add(identity);
            }
            if (e.instrument === "soul-keys")
              assert.ok(
                (e.duration * 60) / tempo + 0.16 < 6,
                "keys fit the real six-second recording even at slow tempos",
              );
            const limit = backingInstrumentSound(e.instrument)?.maxSeconds;
            if (limit)
              assert.ok(
                (e.duration * 60) / tempo + (e.guitarReleaseSeconds ?? 0.08) <
                  limit,
              );
          }
        }
});

test("Mellow Soul balances sustained seventh chords, sparse guitar and short Active replies", () => {
  const steady = arrange("soul", "steady", "major", 0, 84, 0),
    active = arrange("soul", "active", "major", 0, 84, 0);
  assert.ok(
    steady.events.some((e) => e.instrument === "soul-keys" && e.duration > 6),
  );
  assert.ok(!steady.events.some((e) => e.part === "keys" && e.duration < 1));
  assert.ok(
    active.events.some((e) => e.instrument === "soul-keys" && e.duration < 1),
  );
  for (const take of [steady, active]) {
    const guitar = take.events.filter((e) => e.part === "guitar"),
      keys = take.events.filter((e) => e.part === "keys");
    assert.ok(
      guitar.length > 0 && guitar.length < keys.length / 2,
      "guitar answers rather than doubling every chord",
    );
    assert.ok(!take.events.some((e) => e.instrument === "tonewheel-organ"));
    for (let bar = 0; bar < 64; bar++)
      assert.ok(
        take.events.filter(
          (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
        ).length <= (take.plan.mode === "active" ? 3 : 2),
      );
  }
  assert.ok(
    active.events.filter((e) => e.part === "guitar").length >
      steady.events.filter((e) => e.part === "guitar").length,
  );
  assert.ok(
    active.events.filter((e) => e.part === "bass").length >
      steady.events.filter((e) => e.part === "bass").length,
  );
  assert.ok(
    Object.keys(pocketPalette("soul", base).samples).every((id) =>
      id.startsWith("soul-"),
    ),
  );
});
