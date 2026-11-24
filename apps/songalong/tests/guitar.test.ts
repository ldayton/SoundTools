import { stagedHymn } from "../../../packages/music-practice/test-fixtures/hymns";
import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
  guitarChordPitches,
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
const hymn = hymns.find((h) => h.slug === "ill-fly-away")!;
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
        n.el_type === "note"
          ? n.lyric?.map((x: { syllable: string }) => x.syllable) || []
          : [],
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
  assert.equal((guitar.abc.match(/"G7"/g) || []).length, 2);
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
test("legacy guitar settings migrate to the instrument edition and all retained songs have a guitar edition", () => {
  assert.deepEqual(hymnArrangements(hymn).map(a=>a.id),["original","piano","guitar-edition"]);
  const other = stagedHymn;
  assert.ok(!hymnArrangements(other).some((a) => a.id === "guitar"));
  const saved = mergeHymnSettings(hymnPreferences(hymn.id), {
    arrangement: "guitar",
  });
  assert.equal(saved.arrangement, "guitar-edition");
  assert.equal(
    mergeHymnSettings(saved, { hymn: other.id }).arrangement,
    "guitar-edition",
  );
});

test("chord tab uses playable D, G and A7 voicings and transposes its audio once", () => {
  assert.deepEqual(guitarChordPitches(2), [50, 57, 62, 66]);
  assert.deepEqual(guitarChordPitches(7), [43, 47, 50, 55, 59, 67]);
  assert.deepEqual(guitarChordPitches(9, true), [45, 52, 55, 61, 64]);
  for (const key of HYMN_KEYS) {
    const transpose = hymnTransposition(hymn.key, key).semitones;
    const score = arrangeHymn(
      hymn,
      "guitar-chords",
      0,
      0,
      "both",
      undefined,
      transpose,
    );
    const audio = parse(score.abc).audio;
    const prepared = hymnPlaybackScore({
      hymn,
      arrangement: "guitar-chords",
      sectionBars: 0,
      section: 0,
      hands: "both",
      totalBars: score.totalBars,
      sections: score.sections,
      abc: score.abc,
      audio,
      transpose,
      stanzas: [1],
    });
    const first = prepared.audio.tracks
      .slice(1)
      .flat()
      .flatMap((n) => (n.cmd === "note" && n.start === 0 ? [n.pitch] : []));
    assert.deepEqual(first, guitarChordPitches(transpose));
    assert.equal(prepared.audio.totalDuration, 16);
  }
});

test("I'll Fly Away lesson chords align with the sung syllables, without extra turnarounds", () => {
  for (const arrangement of ["guitar", "guitar-chords"] as const) {
    const score = arrangeHymn(hymn, arrangement, 0, 0);
    const abc = hymnLyricsAbc(score.abc, {
      hymn,
      selected: [1],
      offset: 0,
      skipChordTies: true,
    });
    const changes = parse(abc)
      .tune.lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note" && n.chord?.length
          ? [[n.chord[0].name, n.lyric?.[0]?.syllable]]
          : [],
      );
    assert.deepEqual(changes, [
      ["C", "Some"],
      ["F", "I'll"],
      ["C", "way."],
      ["G7", "fly"],
      ["C", "way."],
      ["F", "I'll"],
      ["C", "way."],
      ["G7", "fly"],
      ["C", "way."],
    ]);
    const d = abcjs.strTranspose(abc, abcjs.parseOnly(abc), 2);
    const transposed = parse(d)
      .tune.lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note"
          ? n.chord?.map((c: { name: string }) => c.name) || []
          : [],
      );
    assert.deepEqual(transposed, [
      "D",
      "G",
      "D",
      "A7",
      "D",
      "G",
      "D",
      "A7",
      "D",
    ]);
  }
});

test("cropped guitar sections name their opening chord even when it continues from the preceding bar", () => {
  const score = arrangeHymn(hymn, "guitar", 4, 1);
  const first = parse(score.abc)
    .tune.lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
    .find((n) => n.el_type === "note");
  assert.ok(first?.el_type === "note");
  assert.equal(first.chord?.[0].name, "C");
});
