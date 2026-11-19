import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { acousticCapo } from "../src/backing-acoustic";
import { acousticPalette } from "../src/backing-acoustic-palette";
import { backingPatterns } from "../src/backing-patterns";
import { scalePitchClasses } from "../src/backing-arrangement";
import { backingSampleChoices } from "../src/backing-track-model";

test("all three acoustic patterns are playable, diatonic and sample-covered in every major/minor key", () => {
  const tuning = [40, 45, 50, 55, 59, 64];
  for (const style of ["folk", "country"] as const)
    for (const { value: pattern } of backingPatterns(style))
      for (const quality of ["major", "minor"] as const)
        for (const mode of ["steady", "active"] as const)
          for (let tonic = 0; tonic < 12; tonic++) {
            const take = arrange(style, mode, quality, 1, 104, tonic, pattern);
            const pack = acousticPalette(style),
              pcs = scalePitchClasses(tonic, quality);
            const capo = acousticCapo(tonic, quality);
            assert.ok(capo >= 0 && capo <= 4);
            for (const grip of take.plan.grips) {
              const fretted = grip
                .filter((n) => n.fret > capo)
                .map((n) => n.fret);
              assert.ok(
                Math.max(...fretted) - Math.min(...fretted) <= 4,
                "one reachable hand position",
              );
              assert.ok(
                grip.every(
                  (n) => n.fret <= 12 && n.note === tuning[n.string] + n.fret,
                ),
              );
            }
            for (const e of take.events) {
              assert.ok(
                Number.isFinite(e.beat) &&
                  e.beat >= 0 &&
                  e.duration > 0 &&
                  e.beat + e.duration <= take.beats,
              );
              if (e.part !== "drums") assert.ok(pcs.includes(e.note % 12));
              const samples = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(
                samples.length,
                `${style}/${pattern}/${quality}/${tonic}: missing ${e.instrument}/${e.note}`,
              );
              assert.ok(
                samples.every(
                  ([, s]) => s.note === e.note && s.instrument === e.instrument,
                ),
                "no unintended resampling or fallback instrument",
              );
              if (e.part === "guitar")
                assert.equal(
                  e.note - tuning[e.string!],
                  take.plan.grips[Math.floor(e.beat / 4)].find(
                    (n) => n.string === e.string,
                  )!.fret,
                );
            }
            assert.equal(take.plan.bars[0].level, take.plan.bars.at(-1)!.level);
          }
});

test("thumb patterns, strums, two-step and electric answers have distinct jobs", () => {
  const finger = arrange("folk", "steady", "major", 0, 88, 0, "fingerpicked");
  const strum = arrange("folk", "steady", "major", 0, 88, 0, "strummed");
  const country = arrange("country", "active", "major", 0, 104, 0, "two-step");
  const twoStep = arrange("country", "steady", "major", 0, 104, 0, "two-step");
  const inBar = (take: typeof finger, part: string, bar: number) =>
    take.events.filter(
      (e) => e.part === part && Math.floor(e.beat / 4) === bar,
    );
  const thumb = inBar(finger, "guitar", 0).filter((e) => e.string! < 3);
  assert.deepEqual(
    thumb.map((e) => Math.round(e.beat)),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    thumb.map((e) => e.note % 12),
    [0, 7, 0, 7],
  );
  assert.ok(
    inBar(strum, "guitar", 0).filter((e) => e.beat > 0.9 && e.beat < 1.2)
      .length >= 3,
  );
  assert.equal(
    inBar(twoStep, "drums", 0).filter((e) => e.note === 37).length,
    2,
  );
  assert.equal(
    inBar(twoStep, "drums", 0).filter((e) => e.note === 36).length,
    2,
  );
  assert.ok(
    twoStep.events.every(
      (e) => e.part !== "drums" || e.instrument === "brush-drums",
    ),
  );
  assert.ok(country.events.some((e) => e.instrument === "electric-twang"));
  assert.ok(
    !arrange("country", "steady", "major").events.some(
      (e) => e.instrument === "electric-twang",
    ),
  );
  for (const take of [finger, strum, country, twoStep])
    for (const [i, e] of take.events.entries()) {
      if (e.part !== "guitar" && e.part !== "bass") continue;
      const next = take.events
        .slice(i + 1)
        .find(
          (n) =>
            n.part === e.part &&
            n.instrument === e.instrument &&
            (e.part === "bass" || n.string === e.string),
        );
      if (next)
        assert.ok(
          e.beat + e.duration <= next.beat,
          "no overlapping attacks on a physical string/bass",
        );
    }
});

test("slow/fast tempos and later loops keep acoustic attacks inside their harmonic bars", () => {
  for (const style of ["folk", "country"] as const)
    for (const { value: pattern } of backingPatterns(style))
      for (const tempo of [50, 180])
        for (const cycle of [0, 2]) {
          const take = arrange(
            style,
            "active",
            "minor",
            cycle,
            tempo,
            11,
            pattern,
          );
          for (const e of take.events) {
            assert.ok(
              Number.isFinite(e.beat) &&
                e.duration > 0 &&
                e.beat + e.duration <= take.beats,
            );
            if (e.part !== "guitar" && e.part !== "bass") continue;
            const chord = take.plan.bars[Math.floor(e.beat / 4)];
            if (e.part === "guitar")
              assert.ok(
                [
                  chord.root,
                  (chord.root + (chord.minor ? 3 : 4)) % 12,
                  (chord.root + 7) % 12,
                ].includes(e.note % 12),
              );
          }
        }
});

test("optional bank is small, complete, and reuses the existing acoustic soft layer", () => {
  const samples = Object.values(acousticPalette("country").samples);
  let bytes = 0;
  for (const s of samples) {
    const reused = s.file.startsWith("folk-steel-");
    const file = new URL(
      `../src/assets/${reused ? "backing-soul-folk" : "backing-folk-country"}/${s.file}`,
      import.meta.url,
    );
    assert.equal(readFileSync(file).subarray(0, 4).toString(), "fLaC");
    if (!reused) bytes += statSync(file).size;
  }
  assert.equal(samples.length, 380);
  assert.equal(
    samples.filter((s) => s.instrument === "acoustic-steel").length,
    156,
  );
  assert.ok(bytes < 14 * 1024 * 1024);
});
