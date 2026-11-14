import { mergeHymnSettings, hymnSettingsFromQuery } from "../src/hymn-settings";
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
  restorePattern,
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
          assert.equal(notes.length, 8);
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

test("older interval patterns extend to two bars while preserving position and interval restrictions", () => {
  const settings = { key: "C", hand: "right", level: "steps" } as const;
  const old = {
    version: 1,
    notes: [60, 62, 64, 65],
    position: 3,
    paused: true,
  };
  const result = restorePattern(old, settings, () => 0)!;
  assert.deepEqual(result.notes.slice(0, 4), old.notes);
  assert.equal(result.notes.length, 8);
  assert.equal(result.position, 3);
  assert.equal(result.paused, true);
  assert.equal(
    restorePattern({ ...old, position: 4 }, settings, () => 0)!.position,
    4,
  );
  assert.equal(
    restorePattern({ ...old, notes: [60, 99, 64, 65] }, settings),
    undefined,
  );
  assert.deepEqual(restorePattern({ version: 2, ...result }, settings), result);
  assert.equal(restorePattern({ ...old, version: 99 }, settings), undefined);
});

test("hymn practice hands must be visible, while both-hand views allow either hand", () => {
  const base = {
    hymn: hymns[0].id,
    arrangement: "bass" as const,
    sectionBars: 2 as const,
    section: 0,
    position: 0,
  };
  for (const viewHands of ["left", "right", "both"] as const)
    for (const hands of ["left", "right", "both"] as const) {
      const settings = mergeHymnSettings(base, { viewHands, hands });
      assert.equal(settings.viewHands, viewHands);
      assert.equal(settings.hands, viewHands === "both" ? hands : viewHands);
    }
  assert.equal(
    hymnSettingsFromQuery(base, new URLSearchParams("view=right&hands=left"))
      .hands,
    "right",
  );
});

test("hymn defaults isolate song-specific key, hands, tempo, count-in and note limits", async () => {
  const { hymnPreferences } = await import("../src/hymn-settings");
  const a = hymnPreferences("amazing-grace", {
    key: "F",
    hands: "left",
    arrangement: "bass",
    bpm: 110,
    countIn: 2,
    low: 60,
    zoom: 1.2,
  });
  const b = hymnPreferences("silent-night");
  assert.equal(a.key, "F");
  assert.equal(a.bpm, 110);
  assert.equal(b.key, "original");
  assert.equal(b.mode, "wait");
  assert.equal(b.bpm, 80);
  assert.equal(b.low, null);
  assert.equal(b.countIn, 0);
  assert.equal(b.arrangement, "melody");
  assert.equal(b.zoom, 1);
  assert.equal(b.hands, "both");
});
