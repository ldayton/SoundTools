import assert from "node:assert/strict";
import test from "node:test";
import {
  folkFingerstyleScoreIssues,
  folkFingerstyleTake,
} from "../src/backing-folk-phrases";
import { referenceGenreBackingArrangement as genreBackingArrangement } from "../src/backing-genre-engine";
import {
  practicePitchClasses,
  type ScalePracticeQuality,
} from "../src/backing-scale-harmony";
import { acousticPalette } from "../src/backing-acoustic-palette";
import { acousticCapo } from "../src/backing-acoustic";
import { backingSampleChoices } from "../src/backing-track-model";

const scales: ScalePracticeQuality[] = [
  "major",
  "minor",
  "major-pentatonic",
  "minor-pentatonic",
  "major-blues",
  "minor-blues",
];
test("authored fingerstyle sentences have valid cells and remain an audition-only alternative", () => {
  assert.deepEqual(folkFingerstyleScoreIssues(), []);
  const a = genreBackingArrangement(
    "folk",
    "active",
    "major",
    0,
    88,
    0,
    "fingerpicked",
    "major",
  );
  const saved = structuredClone(a);
  const b = folkFingerstyleTake(a);
  assert.deepEqual(a, saved);
  assert.notDeepEqual(b.events, a.events);
  assert.equal(b.phrasing, "folk-fingerstyle-phrases-v1");
  assert.equal(a.phrasing, "acoustic-fingerpicked-v1");
  assert.equal(new Set(b.phraseIds).size, 2);
  assert.deepEqual(folkFingerstyleTake(a), b, "repeatable audition");
});
test("fingerstyle voices fit the scale, native strings and hand position without collisions in every key and tempo", () => {
  const pack = acousticPalette("folk"),
    tuning = [40, 45, 50, 55, 59, 64];
  for (const scale of scales)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        for (const tempo of [50, 88, 180]) {
          const quality = scale.startsWith("major") ? "major" : "minor";
          const a = genreBackingArrangement(
              "folk",
              mode,
              quality,
              0,
              tempo,
              tonic,
              "fingerpicked",
              scale,
            ),
            b = folkFingerstyleTake(a);
          const pcs = practicePitchClasses(tonic, scale),
            ends = new Map<string, number>();
          for (const e of b.events) {
            assert.ok(
              e.beat >= 0 && e.duration > 0 && e.beat + e.duration <= b.beats,
            );
            if (e.part !== "drums") assert.ok(pcs.includes(e.note % 12));
            assert.ok(e.velocity > 0 && e.velocity <= 60);
            if (e.part === "guitar" || e.part === "bass") {
              const voice = e.part + ":" + (e.string ?? "bass");
              assert.ok(
                e.beat >= (ends.get(voice) ?? -1) - 1e-7,
                "one physical note per string/bass",
              );
              ends.set(voice, e.beat + e.duration);
            }
            if (e.part === "guitar") {
              const fret = e.note - tuning[e.string!];
              assert.ok(
                fret >= acousticCapo(tonic, quality) &&
                  fret <= 19 &&
                  e.note <= 76,
              );
              const frets = b.events
                .filter(
                  (n) =>
                    n.part === "guitar" &&
                    n.beat <= e.beat &&
                    n.beat + n.duration > e.beat,
                )
                .map((n) => n.note - tuning[n.string!])
                .filter((f) => f > acousticCapo(tonic, quality));
              if (frets.length)
                assert.ok(
                  Math.max(...frets) - Math.min(...frets) <= 4,
                  `${tonic}/${quality}: reachable fingers`,
                );
            }
            if (tempo === 88) {
              const samples = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(
                samples.length,
                `missing ${e.instrument}/${e.note}/${e.string}`,
              );
              assert.ok(
                samples.every(
                  ([, s]) => s.note === e.note && s.instrument === e.instrument,
                ),
              );
            }
          }
          for (let bar = 0; bar < 64; bar++) {
            const thumb = b.events.filter(
              (e) =>
                e.part === "guitar" &&
                e.string! < 3 &&
                Math.floor(e.beat / 4) === bar,
            );
            assert.deepEqual(
              thumb.map((e) => Math.round(e.beat - bar * 4)),
              [0, 1, 2, 3],
            );
            assert.deepEqual(
              thumb.map((e) => (e.note - tonic + 12) % 12),
              [0, 7, 0, 7],
            );
            assert.equal(
              b.events.filter(
                (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
              )[0].note % 12,
              tonic,
            );
          }
        }
});
