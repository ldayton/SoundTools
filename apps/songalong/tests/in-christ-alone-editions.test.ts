import test from "node:test";
import assert from "node:assert/strict";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnArrangements,
  guitarMidiOffset,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
import {
  christGuitarPosition,
  christGuitarLyricData,
  christGuitarChordOffset,
  christCapoAudio,
  christFingers,
} from "../../../packages/music-practice/src/in-christ-alone";
const hymn = hymns.find((h) => h.id === "in-christ-alone")!;
function read(abc: string, offset = 0) {
  const tune = abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  let audio = tune.setUpAudio({
    qpm: 60,
    chordsOff: true,
    midiTranspose: offset === 2 ? 0 : offset,
  });
  if (offset === 2) audio = christCapoAudio(audio);
  return {
    tune,
    audio,
    tracks: audio.tracks.map((track) =>
      track.flatMap((n) =>
        n.cmd === "note" ? [[n.pitch, n.start, n.duration]] : [],
      ),
    ),
  };
}
test("In Christ Alone has only physical Piano/Guitar editions and migrates prior preferences", () => {
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => [a.id, a.label]),
    [
      ["piano", "Piano"],
      ["guitar-edition", "Guitar"],
    ],
  );
  for (const arrangement of ["original", "melody", "bass", "chords", "broken"])
    assert.equal(
      hymnPreferences(hymn.id, { arrangement }).arrangement,
      "piano",
    );
  for (const arrangement of [
    "guitar",
    "guitar-chords",
    "guitar-fingerstyle",
    "guitar-edition",
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
  assert.equal(hymnPreferences(hymn.id).bpm, 70);
});
test("piano preserves every source note and duration in a comfortable lower octave", () => {
  const source = read(hymn.harmony),
    piano = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(
    piano.tracks,
    source.tracks.map((t) => t.map(([p, s, d]) => [p - 12, s, d])),
  );
  assert.equal(piano.audio.totalDuration, 15.375);
  assert.deepEqual(
    piano.tune.lines[0].staff?.map((s) => s.clef?.type),
    ["treble", "bass"],
  );
  const melody = piano.tracks[0].map((n) => n[0]);
  assert.equal(Math.min(...melody), 57);
  assert.equal(Math.max(...melody), 74);
  for (const n of piano.tracks[1]) {
    const chord = piano.tracks[1].filter((m) => m[1] === n[1]).map((m) => m[0]);
    assert(Math.max(...chord) - Math.min(...chord) <= 7);
  }
  for (const [hand, index] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      piano.tracks[index],
    );
});
test("guitar uses the four source chord shapes, capo 2, and the original harmonic rhythm", () => {
  const score = arrangeHymn(hymn, "guitar-edition", 0, 0, "left"),
    guitar = read(score.abc, 2);
  assert.equal(guitar.audio.totalDuration, 15.375);
  assert.equal(guitar.tune.lines[0].staff?.[0].clef?.type, "treble-8");
  const attacks = [...new Set(guitar.tracks[0].map((n) => n[1]))];
  const shapes = new Set<string>();
  for (const start of attacks) {
    const chord = guitar.tracks[0]
      .filter((n) => n[1] === start)
      .map((n) => n[0] - 2);
    shapes.add(chord.join(","));
    const positions = chord.map((p) => christGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(new Set(positions.map((p) => p.str)).size, positions.length);
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
  }
  assert.deepEqual(
    [...shapes].sort(),
    [
      "48,52,55,60,64",
      "53,57,60,65",
      "43,47,50,55,59,67",
      "45,52,57,60,64",
    ].sort(),
  );
  const piano = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(attacks, [...new Set(piano.tracks[1].map((n) => n[1]))]);
  for (const start of attacks) {
    const actual = guitar.tracks[0]
      .filter((n) => n[1] === start)
      .map((n) => n[0] % 12);
    const expected = piano.tracks[1]
      .filter((n) => n[1] === start)
      .map((n) => n[0] % 12);
    assert.deepEqual(
      [...new Set(actual)].sort(),
      [...new Set(expected)].sort(),
    );
  }
  // A section must retain its sounding octave and capo, including after serialization.
  for (let section = 0; section < 6; section++) {
    const part = arrangeHymn(hymn, "guitar-edition", 4, section, "left");
    const actual = read(part.abc, 2).tracks[0];
    const from = part.from === 0 ? 0 : 0.375 + (part.from - 1) * 0.75;
    const to = part.to === 21 ? 15.375 : 0.375 + (part.to - 1) * 0.75;
    const expected = guitar.tracks[0]
      .filter((n) => n[1] >= from && n[1] < to)
      .map(([p, s, d]) => [p, s - from, d]);
    assert.deepEqual(actual, expected, `Section ${section}`);
  }
});
test("all verses retain chord-aligned lyrics and the final verse omits the vocal coda", () => {
  const data = christGuitarLyricData(hymn);
  assert.equal(data.stanzas.length, 3);
  assert.equal(data.stanzas[2].endingBar, 17);
  assert.equal(data.stanzas[0].syllables[0], "In~Christ~a-");
  assert.equal(data.stanzas[1].syllables[0], "Here~in~the");
  assert(
    data.stanzas[2].syllables
      .slice(christGuitarChordOffset(17))
      .every((s) => s === "*"),
  );
  assert(
    !data.stanzas[0].syllables
      .slice(christGuitarChordOffset(17))
      .every((s) => s === "*"),
  );
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const score = arrangeHymn(hymn, arrangement, 0, 0, "both", 17);
    assert.equal(score.totalBars, 17);
    assert.equal(
      read(score.abc, arrangement === "guitar-edition" ? 2 : 0).audio
        .totalDuration,
      12.375,
    );
  }
});

test("production playback applies capo once and keeps the last verse ending short", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  const score = arrangeHymn(hymn, "guitar-edition", 0);
  const current = read(score.abc, 2).audio;
  const plan = hymnPlaybackScore({
    hymn,
    arrangement: "guitar-edition",
    sectionBars: 0,
    section: 0,
    hands: "both",
    totalBars: 21,
    sections: 1,
    abc: score.abc,
    audio: current,
    transpose: 0,
    stanzas: [1, 2, 3],
  });
  const first = plan.audio.tracks[0]
    .filter((n) => n.cmd === "note" && n.start === 0)
    .map((n) => (n.cmd === "note" ? n.pitch : 0));
  assert.deepEqual(first, [57]);
  assert.deepEqual(
    plan.audio.tracks[1]
      .filter((n) => n.cmd === "note" && n.start === 0)
      .map((n) => (n.cmd === "note" ? n.pitch : 0)),
    [55],
  );
  assert.equal(plan.audio.totalDuration, 43.125);
  assert.deepEqual(
    plan.verses?.map((v) => v.end - v.start),
    [61.5, 61.5, 49.5],
  );
});

test("fingerstyle retains the complete melody and every rhythm, with feasible simultaneous string choices", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc, 2),
    piano = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(score.tracks[0], piano.tracks[0]);
  assert.equal(score.tracks.length, 2);
  const notes = score.tracks.flat();
  for (const start of new Set(notes.map((n) => n[1]))) {
    const sounding = notes.filter(
      ([, s, d]) => s <= start && s + d > start + 1e-7,
    );
    const positions = sounding.map(([p]) => christGuitarPosition(p - 2, true)!);
    assert(positions.every(Boolean));
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict at beat ${start * 4}`,
    );
    const frets = positions.filter((p) => p.num > 0).map((p) => p.num);
    if (frets.length)
      assert(
        Math.max(...frets) - Math.min(...frets) <= 3,
        `Stretch at beat ${start * 4}`,
      );
  }
  // The source's octave leap is retained; the bass releases for the position shift.
  assert(score.tracks[0].some(([p]) => p === 74));
  assert(!score.tracks[1].some(([, s, d]) => s < 7.875 && s + d > 7.625));
  for (let section = 0; section < 6; section++) {
    const part = arrangeHymn(hymn, "guitar-edition", 4, section),
      actual = read(part.abc, 2);
    if (section === 2)
      assert(
        part.abc.includes('"^VII"'),
        "Position indications survive passage extraction",
      );
    const from = part.from === 0 ? 0 : 0.375 + (part.from - 1) * 0.75,
      to = part.to === 21 ? 15.375 : 0.375 + (part.to - 1) * 0.75;
    assert.deepEqual(
      actual.tracks,
      score.tracks.map((track) =>
        track
          .filter(([, s, d]) => s < to && s + d > from)
          .map(([p, s, d]) => [
            p,
            Math.max(s, from) - from,
            Math.min(s + d, to) - Math.max(s, from),
          ]),
      ),
    );
  }
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc, 2).tracks[0],
    score.tracks[0],
  );
});

// A held C grip needs the little finger for the D melody, leaving ring on C bass.
test("C-shape melody extensions leave the held bass fingers available", () => {
  for (const bar of [2, 6, 14]) {
    assert.deepEqual(christFingers("guitar", bar, 0, [64]), [4]);
    assert.deepEqual(christFingers("guitar", bar, 1, [50, 54]), [3, 2]);
  }
});
