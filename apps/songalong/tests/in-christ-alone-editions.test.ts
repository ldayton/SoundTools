import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { capoAudio } from "../../../packages/music-practice/src/edition-score";
import {
  teacherGuitarPosition,
  teacherChordLyrics,
} from "../../../packages/music-practice/src/in-christ-alone";
import { hymnLyricsAbc } from "../../../packages/music-practice/src/hymn-lyrics";
const hymn = hymns.find((h) => h.slug === "in-christ-alone")!;
function read(abc: string, capo = 0) {
  const tune = abcjs.parseOnly(abc.replaceAll(":|", "|]"))[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  const audio = capoAudio(tune.setUpAudio({ qpm: 60, chordsOff: true }), capo);
  return {
    tune,
    audio,
    tracks: audio.tracks.map((track) =>
      track.flatMap((n) =>
        n.cmd === "note" ? [[n.pitch, n.start * 4, n.duration * 4]] : [],
      ),
    ),
  };
}
const piano = read(arrangeHymn(hymn, "piano", 0).abc);
const guitar = read(arrangeHymn(hymn, "guitar-edition", 0).abc, 2);
test("teacher instrumental editions retain every vocal pitch, rest and dotted rhythm", () => {
  const original = read(hymn.harmony);
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => a.id),
    ["original", "guitar-vocal", "piano", "guitar-edition"],
  );
  assert.deepEqual(
    piano.tracks[0].filter((n) => n[1] < 48.5),
    original.tracks[0],
  );
  assert.deepEqual(guitar.tracks[0], piano.tracks[0]);
  for (const score of [piano, guitar]) {
    assert.equal(score.audio.totalDuration * 4, 60);
    assert.equal(score.tune.getPickupLength() * 4, 1.5);
  }
  // Teacher's printed organ line, in D, continues after the last sung note.
  assert.deepEqual(
    piano.tracks[0].filter((n) => n[1] >= 48.5),
    [
      [59, 48.5, 0.75],
      [62, 49.25, 0.25],
      [64, 49.5, 1.5],
      [66, 51, 0.5],
      [64, 51.5, 0.75],
      [62, 52.25, 0.25],
      [59, 52.5, 1.5],
      [59, 54, 0.5],
      [59, 54.5, 0.75],
      [62, 55.25, 0.25],
      [62, 55.5, 1.5],
      [54, 57, 0.5],
      [55, 57.5, 0.25],
      [57, 57.75, 0.25],
      [62, 58, 2],
    ],
  );
  assert.equal(hymn.stanzas.length, 4);
  assert(hymn.stanzas.every((s) => s.syllables.length === 64 && !s.endingBar));
});
test("compact piano voicings follow slash bass, minor substitutions and the printed ending", () => {
  const chordAt = (beat: number) =>
    piano.tracks[1].filter((n) => n[1] === beat).map((n) => n[0]);
  assert.deepEqual(chordAt(30.5), [42, 45, 50]); // D/F#
  assert.deepEqual(chordAt(33.5), [47, 50, 54]); // Bm
  assert.deepEqual(chordAt(49.5), [49, 52, 55]); // rootless A7
  assert.deepEqual(chordAt(52.5), [40, 43, 47]); // Em
  assert.deepEqual(chordAt(57.5), [45, 50, 54]); // D/A
  assert.deepEqual(chordAt(58.5), [38, 42, 45]); // final D
  for (const start of new Set(piano.tracks[1].map((n) => n[1]))) {
    const notes = chordAt(start);
    assert(Math.max(...notes) - Math.min(...notes) <= 9);
  }
  for (const hand of ["right", "left"] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      piano.tracks[hand === "right" ? 0 : 1],
    );
});
test("capo-two fingerstyle is physically playable through the lower interlude and high position shift", () => {
  const notes = guitar.tracks.flat();
  for (const start of new Set(notes.map((n) => n[1]))) {
    const sounding = notes.filter(
      ([, s, d]) => s <= start && s + d > start + 1e-7,
    );
    const positions = sounding.map(([p]) =>
      teacherGuitarPosition(p - 2, true)!,
    );
    assert(
      positions.every(Boolean),
      `Missing position at ${start}: ${sounding}`,
    );
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict at ${start}`,
    );
    const frets = positions.filter((p) => p.num > 0).map((p) => p.num);
    assert(
      !frets.length || Math.max(...frets) - Math.min(...frets) <= 3,
      `Stretch at ${start}: ${frets}`,
    );
  }
  assert(guitar.tracks[0].some((n) => n[0] === 74));
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc, 2).tracks[0],
    guitar.tracks[0],
  );
  const strums = read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc, 2);
  for (const start of new Set(strums.tracks[0].map((n) => n[1]))) {
    const positions = strums.tracks[0]
      .filter((n) => n[1] === start)
      .map(([p]) => teacherGuitarPosition(p - 2, true)!);
    assert(positions.every(Boolean));
    assert.equal(new Set(positions.map((p) => p.str)).size, positions.length);
  }
});
test("chord accompaniment keeps all four verse texts aligned after the silent pickup", () => {
  const score = arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc;
  const lyrics = teacherChordLyrics(hymn);
  assert.equal(lyrics.stanzas[0].syllables[0], "In~Christ~a-");
  for (let verse = 1; verse <= 4; verse++) {
    const tune = abcjs.parseOnly(
      hymnLyricsAbc(score, { hymn: lyrics, selected: [verse], offset: 0 }),
    )[0];
    const words = tune.lines
      .flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note"
          ? (n.lyric || []).map((l: { syllable: string }) => l.syllable)
          : [],
      )
      .join(" ");
    assert.match(words, /Christ/);
    assert.doesNotMatch(words, /Oh/);
  }
});

test("practice excerpts preserve the same melody and tied ending as the complete written pass", () => {
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const full = arrangement === "piano" ? piano : guitar;
    for (const size of [2, 4])
      for (let section = 0; section < Math.ceil(21 / size); section++) {
        const part = arrangeHymn(hymn, arrangement, size, section);
        const from = part.from ? 1.5 + (part.from - 1) * 3 : 0,
          to = part.to === 21 ? 60 : 1.5 + (part.to - 1) * 3;
        const expected = full.tracks.map((track) =>
          track
            .filter(([, s, d]) => s < to && s + d > from)
            .map(([p, s, d]) => [
              p,
              Math.max(s, from) - from,
              Math.min(s + d, to) - Math.max(s, from),
            ]),
        );
        assert.deepEqual(
          read(part.abc, arrangement === "piano" ? 0 : 2).tracks,
          expected,
          `${arrangement} ${size} bars, section ${section}`,
        );
      }
  }
});

test("production playback keeps the teacher form and applies guitar capo exactly once for every verse", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  const plans = [];
  for (const arrangement of ["original", "piano", "guitar-edition"] as const) {
    const score = arrangeHymn(hymn, arrangement, 0);
    const audio = abcjs
      .parseOnly(score.abc)[0]
      .setUpAudio({ qpm: 60, chordsOff: true });
    const plan = hymnPlaybackScore({
      hymn,
      arrangement,
      sectionBars: 0,
      section: 0,
      hands: "both",
      totalBars: 21,
      sections: 1,
      abc: score.abc,
      audio,
      transpose: 0,
      stanzas: [1, 2, 3, 4],
    });
    assert.deepEqual(
      plan.verses?.map((v) => v.end - v.start),
      [120, 120, 120, 120],
    );
    plans.push(
      plan.audio.tracks[0].flatMap((n) =>
        n.cmd === "note" ? [[n.pitch, n.start, n.duration]] : [],
      ),
    );
  }
  assert.deepEqual(plans[2], plans[1]);
});
