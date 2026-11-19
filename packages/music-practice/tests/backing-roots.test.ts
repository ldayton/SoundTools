import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genreBackingArrangement as arrange,
  rawGenreBackingArrangement as rawArrange,
} from "../src/backing-genre-engine";
import { rootsPalette } from "../src/backing-roots-palette";
import {
  backingSampleChoices,
  type backingPack,
} from "../src/backing-track-model";
import { backingInstrumentSound } from "../src/backing-band-sounds";
import { backingFingerprint } from "./backing-fingerprint";
import prior from "./fixtures/approved-pocket-before-roots.json";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";
const base = {
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack;
test("Roots Rock and Shuffle Blues stay playable, scale-safe, sample-covered and loop-safe in all keys", () => {
  const covered = new Set<string>(),
    tuning = [40, 45, 50, 55, 59, 64];
  for (const style of ["rock", "blues"] as const) {
    const pack = rootsPalette(style, base);
    for (const mode of ["steady", "active"] as const)
      for (const quality of ["major", "minor"] as const)
        for (let tonic = 0; tonic < 12; tonic++)
          for (const tempo of [50, style === "rock" ? 100 : 90, 180]) {
            const t = arrange(style, mode, quality, 1, tempo, tonic),
              pcs = (
                quality === "major"
                  ? [0, 2, 4, 5, 7, 9, 11]
                  : [0, 2, 3, 5, 7, 8, 10]
              ).map((n) => (n + tonic) % 12);
            assert.equal(t.beats, style === "rock" ? 256 : 288);
            for (const e of t.events) {
              assert.ok(
                e.beat >= 0 &&
                  Number.isFinite(e.beat) &&
                  e.duration > 0 &&
                  (!["bass", "guitar", "keys"].includes(e.part) ||
                    e.beat + e.duration <= t.beats),
                `${style}/${e.part}/${e.beat}/${e.duration}/${t.beats}`,
              );
              if (e.part === "guitar" || e.part === "bass")
                assert.ok(
                  pcs.includes(e.note % 12),
                  `${style}/${quality}/${tonic}/${e.note}`,
                );
              if (e.part === "guitar")
                assert.ok(
                  e.string !== undefined &&
                    e.note - tuning[e.string] >= 0 &&
                    e.note - tuning[e.string] <= 12,
                );
              const identity = [
                style,
                e.part,
                e.instrument,
                e.note,
                e.articulation,
                e.velocity,
                e.string,
              ].join("/");
              if (!covered.has(identity)) {
                const c = backingSampleChoices(
                  e,
                  tonic,
                  false,
                  undefined,
                  pack,
                );
                assert.ok(c.length, `missing ${identity}`);
                assert.ok(c.every(([, s]) => s.note === e.note));
                covered.add(identity);
              }
              const limit = backingInstrumentSound(e.instrument)?.maxSeconds;
              if (limit)
                assert.ok(
                  (e.duration * 60) / tempo + (e.guitarReleaseSeconds ?? 0.08) <
                    limit,
                );
            }
            for (let b = 0; b < t.plan.bars.length; b++)
              assert.ok(
                t.events.filter(
                  (e) => e.part === "bass" && Math.floor(e.beat / 4) === b,
                ).length <= (style === "rock" && mode === "active" ? 3 : 2),
              );
          }
  }
});
test("Roots Rock has palm-muted passages, open choruses and restrained extra replies", () => {
  const steady = arrange("rock", "steady", "major", 0, 100, 0),
    active = arrange("rock", "active", "major", 0, 100, 0);
  assert.ok(
    steady.events.some(
      (e) => e.instrument === "rock-guitar" && e.duration > 1.5,
    ),
  );
  assert.ok(
    steady.events.some(
      (e) =>
        e.instrument === "rock-muted" &&
        e.articulation === "muted" &&
        e.duration < 0.3,
    ),
  );
  assert.ok(active.events.length > steady.events.length);
  assert.ok(
    active.events.filter((e) => e.part === "bass").length >
      steady.events.filter((e) => e.part === "bass").length,
  );
});
test("Shuffle Blues is long-short on a triplet grid, with Active call and response", () => {
  const steady = arrange("blues", "steady", "minor", 0, 90, 0),
    active = arrange("blues", "active", "minor", 0, 90, 0);
  const rhythm = steady.events.filter((e) => e.instrument === "blues-rhythm");
  assert.ok(rhythm.some((e) => e.duration > 0.4));
  assert.ok(rhythm.some((e) => e.duration < 0.14));
  assert.ok(
    rhythm.every(
      (e) => Math.abs((e.beat % 1) - 2 / 3) < 0.07 || e.beat % 1 < 0.07,
    ),
  );
  assert.ok(!steady.events.some((e) => e.instrument === "blues-lead"));
  assert.ok(active.events.some((e) => e.instrument === "blues-lead"));
  assert.ok(
    active.events.filter((e) => e.instrument === "blues-rhythm").length <
      steady.events.filter((e) => e.instrument === "blues-rhythm").length,
  );
});
test("Pocket Funk and Mellow Soul keep their approved musical performances", () => {
  for (const row of prior)
    assert.equal(
      backingFingerprint(
        rawArrange(
          row.style as "funk" | "soul",
          row.mode as "steady" | "active",
          row.quality as "major" | "minor",
          row.cycle,
          row.tempo,
          row.tonic,
        ),
      ),
      row.sha256,
    );
});

test("genre balance uses fixed conservative trims while retaining the original reference mix", async () => {
  const { backingMixGain } = await import("../src/backing-mix-balance");
  const { BACKING_GENRES } = await import("../src/backing-genres");
  assert.equal(backingMixGain("approved-drum-forward"), 1);
  for (const g of Object.values(BACKING_GENRES)) {
    for (const mode of ["steady", "active"] as const) {
      const gain = backingMixGain(g.instrumentation.mix, mode);
      assert.ok(Number.isFinite(gain) && gain > 0 && gain < 4);
    }
  }
  assert.notEqual(
    backingMixGain("intimate-acoustic"),
    backingMixGain("strummed-acoustic"),
  );
});
