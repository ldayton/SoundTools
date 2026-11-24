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
  flyGuitarPosition,
  flyFingers,
} from "../../../packages/music-practice/src/ill-fly-away";
const hymn = hymns.find((h) => h.slug === "ill-fly-away")!;
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
// Reviewed independently against the existing lesson: V7 on “fly” in bars 7 and 15.
const changes: [number, string, number][] = [
  [0, "C", 4],
  [4, "C", 4],
  [8, "F", 4],
  [12, "C", 4],
  [16, "C", 4],
  [20, "C", 4],
  [24, "C", 3],
  [27, "G7", 1],
  [28, "C", 4],
  [32, "C", 4],
  [36, "C", 4],
  [40, "F", 4],
  [44, "C", 4],
  [48, "C", 4],
  [52, "C", 4],
  [56, "C", 3],
  [59, "G7", 1],
  [60, "C", 4],
];
const piano: Record<string, number[]> = {
  C: [48, 52],
  F: [41, 45, 48],
  G7: [47, 50, 53],
};
const guitar: Record<string, number[]> = { C: [48, 52], F: [53], G7: [47, 53] };
const strum: Record<string, number[]> = {
  C: [48, 52, 55, 60, 64],
  F: [53, 57, 60, 65],
  G7: [43, 47, 50, 55, 59, 65],
};
const accompaniment = (voicings: Record<string, number[]>) =>
  changes.flatMap(([start, chord, duration]) =>
    voicings[chord].map((p) => [p, start, duration]),
  );
test("Piano, Guitar and Voice + Piano, with legacy settings migrated and display/practice independent", () => {
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => [a.id, a.label]),
    [
      ["original", "Voice + Piano"],
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
    "guitar-fingerstyle",
    "guitar-edition",
  ]) {
    for (const scoreDisplay of ["notation", "tab", "both", "chords"])
      for (const hands of ["right", "left", "both"]) {
        const s = hymnPreferences(hymn.id, {
          arrangement,
          scoreDisplay,
          hands,
        });
        assert.equal(s.arrangement, "guitar-edition");
        assert.equal(s.scoreDisplay, scoreDisplay);
        assert.equal(s.hands, hands);
      }
  }
  assert.equal(hymnPreferences(hymn.id,{arrangement:"original"}).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id).bpm, 80);
});
test("both instruments retain all 53 melody attacks, ornaments, slurs, rest, tie and fermata in a comfortable octave", () => {
  const source = read(hymn.harmony),
    expected = source.tracks[0].map(([p, s, d]) => [p - 12, s, d]);
  assert.equal(expected.length, 53);
  const notation = (t: ReturnType<typeof read>) =>
    t.tune.lines
      .flatMap((line) => line.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note"
          ? [
              [
                n.duration,
                !!n.rest,
                n.decoration || [],
                n.pitches?.map((p) => [
                  !!p.startTie,
                  !!p.endTie,
                  p.startSlur?.length || 0,
                  p.endSlur?.length || 0,
                ]) || [],
              ],
            ]
          : [],
      );
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const score = read(arrangeHymn(hymn, arrangement, 0).abc);
    assert.deepEqual(score.tracks[0], expected);
    assert.deepEqual(notation(score), notation(source));
    assert.equal(score.audio.totalDuration * 4, 64);
    assert.equal(Math.min(...score.tracks[0].map((n) => n[0])), 55);
    assert.equal(Math.max(...score.tracks[0].map((n) => n[0])), 67);
  }
});
test("both editions share the lesson harmony with compact, independent piano hands", () => {
  const score = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(
    score.tune.lines[0].staff?.map((s) => s.clef?.type),
    ["treble", "bass"],
  );
  assert.deepEqual(score.tracks[1], accompaniment(piano));
  assert(
    Math.max(...score.tracks[1].map((n) => n[0])) <
      Math.min(...score.tracks[0].map((n) => n[0])),
  );
  for (const chord of Object.values(piano))
    assert(chord.at(-1)! - chord[0] <= 7);
  for (const [hand, index] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      score.tracks[index],
    );
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0).abc).tracks[1],
    changes.flatMap(([start, chord, duration]) =>
      (start === 48 ? [48] : guitar[chord]).map((p) => [p, start, duration]),
    ),
  );
});
test("every held fingerstyle combination fits distinct strings and fingers in first position", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc),
    notes = score.tracks.flatMap((track, voice) =>
      track.map((n) => ({ n, voice })),
    );
  for (const start of new Set(notes.map(({ n }) => n[1]))) {
    const sounding = notes.filter(
        ({ n: [, s, d] }) => s <= start && s + d > start + 1e-7,
      ),
      positions = sounding.map(({ n: [p] }) => flyGuitarPosition(p, true)!);
    assert(positions.every(Boolean));
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict at ${start}`,
    );
    assert(positions.every((p) => p.num >= 0 && p.num <= 4));
    const frets = positions.filter((p) => p.num > 0).map((p) => p.num);
    if (frets.length) assert(Math.max(...frets) - Math.min(...frets) <= 2);
    const fingers = sounding
      .map(
        ({ n: [p], voice }) =>
          flyFingers("guitar", Math.floor(start / 4), voice, [p])[0],
      )
      .filter(Boolean);
    assert.equal(
      new Set(fingers).size,
      fingers.length,
      `Finger conflict at ${start}`,
    );
  }
  assert(
    score.tracks[0].some(([p]) => p === 63),
    "D sharp ornament remains intact",
  );
});
test("melody and full-shape chord practice remain available without additional arrangements", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc);
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc).tracks[0],
    score.tracks[0],
  );
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc).tracks[0],
    accompaniment(strum),
  );
});
test("passages preserve both voices, the written octave and the chromatic neighbor", () => {
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const full = read(arrangeHymn(hymn, arrangement, 0).abc);
    for (let section = 0; section < 4; section++) {
      const part = arrangeHymn(hymn, arrangement, 4, section),
        actual = read(part.abc);
      const from = part.from * 4,
        to = part.to * 4;
      assert.deepEqual(
        actual.tracks,
        full.tracks.map((track) =>
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
  }
});
test("all three verses use one continuous clock and the written 64-beat form", async () => {
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
      totalBars: 16,
      sections: 1,
      abc: score.abc,
      audio,
      transpose: 0,
      stanzas: [1, 2, 3],
    });
    assert.equal(plan.audio.totalDuration * 4, 192);
    assert.deepEqual(
      plan.verses?.map((v) => v.end - v.start),
      [64, 64, 64],
    );
    assert.deepEqual(
      plan.audio.tracks[0].flatMap((n) =>
        n.cmd === "note" && n.start === 0 ? [n.pitch] : [],
      ),
      [64],
    );
  }
});

test("section labels identify the first verse bar and the first chorus bar, with beat-based beaming", () => {
  for (const arrangement of ["piano", "guitar-edition"] as const) {
    const { tune } = read(arrangeHymn(hymn, arrangement, 0).abc);
    let beat = 0;
    const parts: unknown[] = [];
    let beams = 0;
    for (const line of tune.lines)
      for (const item of line.staff?.[0]?.voices?.[0] || []) {
        if (item.el_type === "part") parts.push([item.title, beat]);
        if (item.el_type === "note") {
          beat += item.duration * 4;
          if (item.startBeam) beams++;
        }
      }
    assert.deepEqual(parts, [
      ["Verse", 0],
      ["Chorus", 32],
    ]);
    assert(beams >= 8);
  }
});
