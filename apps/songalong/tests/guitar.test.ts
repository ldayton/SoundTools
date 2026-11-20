import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnLyricsAbc } from "../../../packages/music-practice/src/hymn-lyrics";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import {
  hymnPreferences,
  mergeHymnSettings,
} from "../../../packages/music-practice/src/hymn-settings";
import {
  HYMN_KEYS,
  hymnTransposition,
} from "../../../packages/music-practice/src/hymn-transpose";
const hymn = hymns.find((h) => h.id === "ill-fly-away")!;
const parse = (abc: string) => {
  const tune = abcjs.parseOnly(abc)[0];
  const audio = tune.setUpAudio({ chordsOff: true });
  assert.equal(tune.warnings, undefined);
  return {
    tune,
    audio,
    notes: audio.tracks.flat().filter((n) => n.cmd === "note"),
  };
};
test("guitar arrangement retains melody attacks, duration, and words at held-note chord changes", () => {
  const melody = arrangeHymn(hymn, "melody", 0, 0),
    guitar = arrangeHymn(hymn, "guitar", 0, 0);
  const a = parse(melody.abc),
    b = parse(guitar.abc);
  assert.deepEqual(
    b.notes.map((n) => [n.pitch, n.start, n.duration]),
    a.notes.map((n) => [n.pitch, n.start, n.duration]),
  );
  const lyrics = (abc: string) =>
    parse(abc)
      .tune.lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note" ? n.lyric?.map((x: { syllable: string }) => x.syllable) || [] : [],
      )
      .filter((x) => x.trim());
  assert.deepEqual(
    lyrics(
      hymnLyricsAbc(guitar.abc, {
        hymn,
        selected: [1],
        offset: 0,
        skipChordTies: true,
      }),
    ),
    lyrics(hymnLyricsAbc(melody.abc, { hymn, selected: [1], offset: 0 })),
  );
  assert.equal((guitar.abc.match(/"G7"/g) || []).length, 5);
});
test("every key preserves melody timing and guitar playback sounds an octave below the written staff", () => {
  const guitar = arrangeHymn(hymn, "guitar", 0, 0);
  for (const key of HYMN_KEYS) {
    const transpose = hymnTransposition(hymn.key, key).semitones;
    const base = parse(guitar.abc);
    const prepared = hymnPlaybackScore({
      hymn,
      arrangement: "guitar",
      sectionBars: 0,
      section: 0,
      hands: "both",
      totalBars: guitar.totalBars,
      sections: guitar.sections,
      abc: guitar.abc,
      audio: base.audio,
      transpose,
      stanzas: [1],
    });
    const notes = prepared.audio.tracks.flat().filter((n) => n.cmd === "note");
    assert.deepEqual(
      notes.map((n) => [n.pitch, n.start, n.duration]),
      base.notes.map((n) => [n.pitch + transpose - 12, n.start, n.duration]),
    );
    if (key === "D") assert.equal(notes[0].pitch, 66); // high E string, fret 2 = F#4
  }
});
test("guitar is offered only for this song and unsupported saved settings fall back to melody", () => {
  assert.ok(hymnArrangements(hymn).some((a) => a.id === "guitar"));
  const other = hymns.find((h) => h.id === "amazing-grace")!;
  assert.ok(!hymnArrangements(other).some((a) => a.id === "guitar"));
  const saved = mergeHymnSettings(hymnPreferences(hymn.id), {
    arrangement: "guitar",
  });
  assert.equal(saved.arrangement, "guitar");
  assert.equal(
    mergeHymnSettings(saved, { hymn: other.id }).arrangement,
    "melody",
  );
});
