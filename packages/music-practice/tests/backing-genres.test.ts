import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import baseline from "./fixtures/approved-backing-aff1d47.json";
import { genreBackingArrangement } from "../src/backing-genre-engine";
import {
  BACKING_GENRES,
  backingGenre,
  genreChord,
} from "../src/backing-genres";
import {
  backingSettings,
  type LegacyBackingStyle,
  type BackingMode,
} from "../src/backing-track-model";
import type { BackingQuality } from "../src/backing-arrangement";
test("central engine reproduces the approved Blues/Rock takes exactly across keys, modes, loops and tempos", () => {
  for (const row of baseline) {
    const take = genreBackingArrangement(
      row.style as LegacyBackingStyle,
      row.mode as BackingMode,
      row.quality as BackingQuality,
      row.cycle,
      row.tempo,
      row.tonic,
    );
    assert.equal(
      createHash("sha256").update(JSON.stringify(take)).digest("hex"),
      row.sha256,
      JSON.stringify(row),
    );
  }
});
test("Country stays sparse, playable and diatonic in all keys with bounded loop endpoints", () => {
  const tuning = [40, 45, 50, 55, 59, 64];
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const take = genreBackingArrangement(
          "country",
          mode,
          quality,
          0,
          104,
          tonic,
        );
        assert.equal(take.beats, 256);
        assert.equal(take.plan.bars.length, 64);
        assert.equal(take.plan.bars[0].level, take.plan.bars.at(-1)!.level);
        assert.equal(take.events.filter((e) => e.part === "bass").length, 128);
        const pcs = (
          quality === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
        ).map((n) => (n + tonic) % 12);
        for (const e of take.events) {
          assert.ok(e.beat >= 0 && e.beat < take.beats && e.duration > 0);
          if (e.part === "bass" || e.part === "guitar") {
            assert.ok(pcs.includes(e.note % 12));
            assert.ok(e.beat + e.duration <= take.beats);
            if (e.part === "guitar")
              assert.ok(
                e.string !== undefined &&
                  e.note - tuning[e.string] >= 0 &&
                  e.note - tuning[e.string] <= 12,
              );
          }
        }
        for (let bar = 0; bar < 64; bar++)
          assert.equal(
            take.events.filter(
              (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
            ).length,
            2,
          );
        assert.ok(
          new Set(
            take.events
              .filter((e) => e.part === "guitar")
              .map((e) => e.note % 12),
          ).size >= 4,
        );
        assert.ok(
          new Set(
            take.events
              .filter((e) => e.part === "bass")
              .map((e) => e.note % 12),
          ).size >= 4,
        );
      }
});
test("genre registry drives selection, valid defaults, harmonic area and section length", () => {
  assert.equal(backingSettings({ style: "country" }).style, "country");
  assert.equal(backingGenre("bogus").id, "blues");
  for (const g of Object.values(BACKING_GENRES)) {
    assert.equal(
      g.form.sections.reduce((sum, s) => sum + s.bars, 0),
      g.form.bars,
    );
    assert.equal(g.interaction.maxBassAttacksPerBar, 2);
    assert.ok(
      g.tempo.preferred >= g.tempo.range[0] &&
        g.tempo.preferred <= g.tempo.range[1],
    );
  }
  assert.equal(genreChord("country", "major", 4).degree, 9);
});
