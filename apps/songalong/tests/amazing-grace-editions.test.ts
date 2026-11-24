import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import {
  graceGuitarPosition,
  graceLyricData,
  graceChordOffset,
} from "../../../packages/music-practice/src/amazing-grace";
const hymn = hymns.find((h) => h.slug === "amazing-grace")!;
function read(abc: string) {
  const tune = abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
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
const progression: [number, string, number][] = [
  [0, "G", 1],
  [1, "G", 3],
  [4, "G", 2],
  [6, "D7", 1],
  [7, "Em", 2],
  [9, "C", 1],
  [10, "G", 3],
  [13, "G", 3],
  [16, "G", 2],
  [18, "D7", 1],
  [19, "G", 5],
  [24, "G", 1],
  [25, "G", 3],
  [28, "G", 3],
  [31, "C", 3],
  [34, "G", 3],
  [37, "Em", 2],
  [39, "G", 1],
  [40, "G", 2],
  [42, "D7", 1],
  [43, "G", 5],
];
const pianoChords: Record<string, number[]> = {
  G: [43, 47, 50],
  C: [48, 52, 55],
  Em: [40, 43, 47],
  D7: [42, 45, 48],
};
const guitarChords: Record<string, number[]> = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  Em: [40, 47, 52, 55, 59, 64],
  D7: [50, 57, 60, 66],
};
test("Amazing Grace exposes Piano, Guitar and Voice + Piano and migrates saved arrangements", () => {
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => [a.id, a.label]),
    [
      ["original", "Voice + Piano"],
      ["guitar-vocal", "Guitar + Voice"],
      ["piano", "Piano"],
      ["guitar-edition", "Guitar"],
    ],
  );
  for (const arrangement of ["melody", "bass", "chords", "broken"])
    assert.equal(
      hymnPreferences(hymn.id, { arrangement }).arrangement,
      "piano",
    );
  for (const arrangement of [
    "guitar",
    "guitar-chords",
    "guitar-edition",
    "guitar-fingerstyle",
  ]) {
    const s = hymnPreferences(hymn.id, {
      arrangement,
      hands: "left",
      scoreDisplay: "tab",
    });
    assert.equal(s.arrangement, "guitar-edition");
    assert.equal(s.hands, "left");
    assert.equal(s.scoreDisplay, "tab");
  }
  assert.equal(hymnPreferences(hymn.id,{arrangement:"original"}).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id).bpm, 72);
});
test("piano preserves every source melody attack, ornament, and tie with compact accompaniment", () => {
  const source = read(hymn.harmony),
    score = arrangeHymn(hymn, "piano", 0),
    piano = read(score.abc);
  assert.deepEqual(piano.tracks[0], source.tracks[0]);
  assert.equal(piano.audio.totalDuration * 4, 48);
  assert.deepEqual(
    piano.tune.lines[0].staff?.map((s) => s.clef?.type),
    ["treble", "bass"],
  );
  const expected = progression.flatMap(([start, chord, duration]) =>
    pianoChords[chord].map((p) => [p, start, duration]),
  );
  assert.deepEqual(piano.tracks[1], expected);
  assert(
    Math.max(...piano.tracks[1].map((n) => n[0])) <
      Math.min(...piano.tracks[0].map((n) => n[0])),
  );
  for (const chord of Object.values(pianoChords))
    assert(chord.at(-1)! - chord[0] <= 7);
  for (const [hand, index] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      piano.tracks[index],
    );
});
test("guitar preserves the reviewed harmonic rhythm, ringing ties, and four open shapes without a capo", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc);
  assert.equal(score.tune.lines[0].staff?.[0].clef?.type, "treble-8");
  assert.equal(score.audio.totalDuration * 4, 48);
  assert.deepEqual(
    score.tracks[0],
    progression.flatMap(([start, chord, duration]) =>
      guitarChords[chord].map((p) => [p, start, duration]),
    ),
  );
  for (const chord of Object.values(guitarChords)) {
    const positions = chord.map((p) => graceGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(new Set(positions.map((p) => p.str)).size, positions.length);
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
  }
});
test("sections resume held notes at the correct pitch and truncate ties at their endpoints", () => {
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const whole = read(arrangeHymn(hymn, arrangement, 0).abc);
    for (let section = 0; section < 5; section++) {
      const part = arrangeHymn(hymn, arrangement, 4, section),
        actual = read(part.abc);
      const from = part.from === 0 ? 0 : 1 + (part.from - 1) * 3,
        to = part.to === 17 ? 48 : 1 + (part.to - 1) * 3;
      const expected = whole.tracks.map((track) =>
        track
          .filter(([, s, d]) => s < to && s + d > from)
          .map(([p, s, d]) => [
            p,
            Math.max(s, from) - from,
            Math.min(s + d, to) - Math.max(s, from),
          ]),
      );
      assert.deepEqual(
        actual.tracks,
        expected,
        `${arrangement}, section ${section}`,
      );
    }
  }
});
test("all three verses retain their exact words, including empty tied continuations", () => {
  const data = graceLyricData(hymn);
  assert.equal(data.stanzas.length, 3);
  const letters = (tokens: string[]) =>
    tokens
      .join("")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  for (let i = 0; i < 3; i++)
    assert.equal(
      letters(data.stanzas[i].syllables),
      letters(hymn.stanzas[i].syllables.filter((s) => s !== "*")),
    );
  assert.equal(data.stanzas[0].syllables[0], "A-");
  assert.equal(data.stanzas[0].syllables[graceChordOffset(8)], "*");
  assert.equal(data.stanzas[0].syllables[graceChordOffset(16)], "*");
});
test("production playback keeps the original 48-beat verses and sounding guitar register", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const score = arrangeHymn(hymn, arrangement, 0),
      audio = read(score.abc).audio;
    const plan = hymnPlaybackScore({
      hymn,
      arrangement,
      sectionBars: 0,
      section: 0,
      hands: "both",
      totalBars: 17,
      sections: 1,
      abc: score.abc,
      audio,
      transpose: 0,
      stanzas: [1, 2, 3],
    });
    assert.equal(plan.audio.totalDuration * 4, 144);
    assert.deepEqual(
      plan.verses?.map((v) => v.end - v.start),
      [48, 48, 48],
    );
    if (arrangement === "guitar-edition")
      assert.deepEqual(
        plan.audio.tracks[0].flatMap((n) =>
          n.cmd === "note" && n.start === 0 ? [n.pitch] : [],
        ),
        [50],
      );
  }
});

test("fingerstyle preserves the complete melody one octave lower with first-position bass and harmony", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc),
    piano = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(
    score.tracks[0],
    piano.tracks[0].map(([p, s, d]) => [p - 12, s, d]),
  );
  const voicings: Record<string, number[]> = {
    G: [43, 47],
    Em: [40, 47],
    C: [48],
    D7: [42, 48],
  };
  assert.deepEqual(
    score.tracks[1],
    progression.flatMap(([start, chord, duration]) =>
      voicings[chord].map((p) => [p, start, duration]),
    ),
  );
  const notes = score.tracks.flat();
  for (const start of new Set(notes.map((n) => n[1]))) {
    const sounding = notes.filter(
      ([, s, d]) => s <= start && s + d > start + 1e-7,
    );
    const positions = sounding.map(([p]) => graceGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict at ${start}`,
    );
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
    const frets = positions.filter((p) => p.num > 0).map((p) => p.num);
    if (frets.length) assert(Math.max(...frets) - Math.min(...frets) <= 2);
  }
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc).tracks[0],
    score.tracks[0],
  );
});
