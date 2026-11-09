import { test } from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../src/hymns.json";
import {
  ARRANGEMENTS,
  arrangeHymn,
  hymnBarCount,
} from "../src/hymn-arrangements";
import {
  makePattern,
  PATTERN_KEYS,
  type PatternLevel,
} from "../src/patterns-model";
import {
  makeRhythm,
  rhythmOnsets,
  RhythmAttempt,
  type RhythmLevel,
} from "../src/rhythm-model";
test("interval patterns stay in the five-finger position, follow the chosen intervals, and avoid identical neighbours", () => {
  for (const key of PATTERN_KEYS)
    for (const hand of ["right", "left"] as const)
      for (const level of ["steps", "skips", "leaps"] as PatternLevel[]) {
        let previous: number[] = [];
        for (let i = 0; i < 20; i++) {
          const notes = makePattern(
            { key: key.id, hand, level },
            () => 0,
            previous,
          );
          assert.equal(notes.length, 4);
          assert.notEqual(notes.join(), previous.join());
          assert.ok(
            notes.every(
              (n) =>
                n >= key.midi - (hand === "left" ? 12 : 0) &&
                n <= key.midi + 7 - (hand === "left" ? 12 : 0),
            ),
          );
          assert.ok(notes.some((n) => n !== notes[0]));
          previous = notes;
        }
      }
});
test("rhythm generators fill four complete bars, count rests, and never mutate shared tiles", () => {
  for (const level of ["pulse", "long-short", "eighths"] as RhythmLevel[]) {
    const bars = makeRhythm(level, () => 0.7);
    assert.equal(bars.length, 4);
    assert.ok(bars.every((bar) => bar.reduce((s, n) => s + n.beats, 0) === 4));
    assert.equal(rhythmOnsets(bars).beats, 16);
    assert.equal(
      rhythmOnsets(bars).starts.length,
      bars.flat().filter((n) => !n.rest).length,
    );
    bars[0][0].beats = 99;
    assert.equal(
      makeRhythm(level, () => 0.7)[0].reduce((s, n) => s + n.beats, 0),
      4,
    );
  }
});
test("rhythm assessment matches each onset once, tolerates small deviations, and detects missed/rest/extra taps", () => {
  const s = new RhythmAttempt([0, 1, 3], 80, 10000);
  assert.equal(s.tap(9000), "ignored");
  assert.equal(s.tap(10040), "hit");
  assert.equal(s.tap(10040), "extra");
  assert.equal(s.tap(11490), "extra"); // Beat 2 is a rest.
  assert.equal(s.tap(12220), "hit");
  assert.equal(s.missed, 1);
  assert.equal(s.extras, 2);
  assert.throws(() => new RhythmAttempt([0], NaN, 0));
});
function topNotes(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  tune.setUpAudio({});
  let previous: number | null = null;
  return tune.lines
    .flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
    .filter((n) => n.el_type === "note")
    .map((n: any) => {
      const pitch = n.midiPitches?.length
        ? Math.max(...n.midiPitches.map((p: any) => p.pitch))
        : n.pitches?.length
          ? previous
          : null;
      previous = pitch;
      return {
        duration: n.duration,
        pitch,
        lyric: n.lyric?.[0]?.syllable || "",
      };
    });
}
test("all hymn practice stages and sections parse, preserve melody/lyrics, and partition into complete bars", () => {
  let scores = 0;
  for (const hymn of hymns) {
    const total = hymnBarCount(hymn);
    assert.ok(total > 0);
    for (const stage of ARRANGEMENTS)
      for (const size of [0, 2, 4]) {
        const whole = arrangeHymn(hymn, stage.id, size);
        let bars = 0;
        const combined: ReturnType<typeof topNotes> = [];
        for (let i = 0; i < whole.sections; i++) {
          const result = arrangeHymn(hymn, stage.id, size, i);
          bars += result.to - result.from;
          const parsed = abcjs.parseOnly(result.abc)[0];
          assert.equal(
            parsed.warnings?.length || 0,
            0,
            hymn.title + " " + stage.id + " " + i,
          );
          if (stage.id !== "original") combined.push(...topNotes(result.abc));
          scores++;
        }
        assert.equal(bars, total);
        if (stage.id !== "original")
          assert.deepEqual(
            combined,
            topNotes(hymn.melody),
            hymn.title + " " + stage.id + " " + size,
          );
      }
  }
  assert.ok(scores > 1000);
});
