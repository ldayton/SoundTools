import test from "node:test";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import { arrangeHymn } from "../../../packages/music-practice/src/hymn-arrangements";
import {
  planPianoFingering,
  pianoKeyPosition,
} from "../../../packages/music-practice/src/piano-fingering";
import assert from "node:assert/strict";
import { releasedPianoPlanner } from "../../../packages/music-practice/test-fixtures/piano-release-comparison";
test("source melody fingerings remain reachable and match released legacy digits through transposition", async () => {
  const released = (await releasedPianoPlanner()).plan;
  let parts = 0;
  for (const hymn of hymns)
    for (const arrangement of ["melody"] as const)
      for (const transpose of [-5, 0, 4]) {
        const abc = arrangeHymn(hymn, arrangement, 0, 0).abc;
        const tune = abcjs.parseOnly(abc)[0];
        tune.setUpAudio({ midiTranspose: transpose });
        const voices = new Map();
        for (const line of tune.lines)
          for (const [si, staff] of (line.staff || []).entries())
            for (const [vi, voice] of (staff.voices || []).entries()) {
              const id = `${si}:${vi}`;
              const part = voices.get(id) || {
                hand: staff.clef?.type === "bass" ? "left" : "right",
                notes: [],
                rest: false,
              };
              voices.set(id, part);
              for (const item of voice) {
                if (item.el_type !== "note") continue;
                if (!item.pitches?.length) {
                  part.rest = true;
                  continue;
                }
                assert.equal(item.pitches.length, 1);
                const tied = !!item.pitches[0].endTie,
                  midi =
                    item.midiPitches?.[0]?.pitch ?? part.notes.at(-1)?.midi;
                assert.ok(Number.isFinite(midi));
                part.notes.push({
                  midi,
                  duration: item.duration,
                  tied,
                  restBefore: part.rest,
                });
                part.rest = false;
              }
            }
        for (const part of voices.values()) {
          assert.ok(
            part.notes.length > 0,
            `${hymn.title}: each transposed voice must contain notes`,
          );
          const result = planPianoFingering(part.notes, part.hand);
          assert.deepEqual(
            result,
            released(part.notes, part.hand),
            `${hymn.title}: legacy fingerings changed at transpose ${transpose}`,
          );
          parts++;
          assert.equal(result.length, part.notes.length);
          const sign = part.hand === "right" ? 1 : -1;
          result.forEach((f, i) => {
            assert.ok(f.finger >= 1 && f.finger <= 5);
            assert.ok(
              Math.abs(
                pianoKeyPosition(part.notes[i].midi) -
                  (f.anchor + sign * (f.finger - 1)),
              ) <= 0.61,
            );
            if (part.notes[i].tied && i) {
              assert.equal(f.finger, result[i - 1].finger);
              assert.equal(f.anchor, result[i - 1].anchor);
            }
          });
        }
      }
  assert.equal(parts, hymns.length * 3);
});
