import {MAQAM_QUALITIES,isMaqam} from "../src/maqamat";
import test from "node:test";
import assert from "node:assert/strict";
import { genreBackingArrangement } from "../src/backing-genre-engine";
import { backingGenres } from "../src/backing-genres";
import {
  practicePitchClasses,
  scalePracticeHarmony,
  type ScalePracticeQuality,
} from "../src/backing-scale-harmony";
const qualities: ScalePracticeQuality[] = [
  "major",
  "minor",
  "major-pentatonic",
  "minor-pentatonic",
  "major-blues",
  "minor-blues",
  ...MAQAM_QUALITIES,
];
test("scale harmony preserves all attacks, sounds, levels and durations, keeps bass sparse and every pitched note in the selected scale", () => {
  for (const { id } of backingGenres)
    for (const quality of qualities)
      for (const tonic of [0, 2, 6, 9, 11])
        for (const mode of ["steady", "active"] as const) {
          const a = genreBackingArrangement(
            id,
            mode,
            quality.startsWith("major") ? "major" : "minor",
            0,
            90,
            tonic,
          );
          const before = JSON.stringify(a),
            b = scalePracticeHarmony(a, quality),
            pcs = practicePitchClasses(tonic, quality);
          assert.equal(JSON.stringify(a), before);
          assert.equal(b.events.length, a.events.length);
          b.events.forEach((e, i) => {
            const { note, absolute, ...performance } = e,
              {
                note: oldNote,
                absolute: oldAbsolute,
                ...original
              } = a.events[i];
            assert.deepEqual(performance, original);
            if (e.part === "drums" || e.part === "percussion")
              assert.deepEqual(e, a.events[i]);
            else {
              assert.ok(pcs.includes(note % 12), `${id} ${quality} ${note}`);
              if(isMaqam(quality))assert.ok([0,7].includes((note-tonic+120)%12));
            }
          });
          assert.ok(b.plan.bars.every((bar) => bar.root === tonic));
          const bassBars = new Set<number>();
          for (const e of b.events.filter((e) => e.part === "bass")) {
            const bar = Math.floor(e.beat / 4);
            if (!bassBars.has(bar)) {
              assert.equal(e.note % 12, tonic);
              bassBars.add(bar);
            }
          }
        }
});
