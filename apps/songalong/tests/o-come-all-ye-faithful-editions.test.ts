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
  faithfulFingers,
  faithfulPosition,
} from "../../../packages/music-practice/src/o-come-all-ye-faithful";
const hymn = hymns.find((h) => h.slug === "o-come-all-ye-faithful")!;
function read(abc: string, lineBreaks?: number[]) {
  const tune = abcjs.parseOnly(abc, {lineBreaks})[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
  return {
    tune,
    audio,
    tracks: audio.tracks.map((tr) =>
      tr.flatMap((n) =>
        n.cmd === "note" ? [[n.pitch, n.start * 4, n.duration * 4]] : [],
      ),
    ),
  };
}
// Reviewed harmonic rhythm, in quarter beats, independent of the edition builder.
const changes: [number, string, number][] = [
  [0, "G", 1],
  [1, "G", 4],
  [5, "D", 4],
  [9, "G", 1],
  [10, "D", 1],
  [11, "G", 1],
  [12, "C", 1],
  [13, "G", 2],
  [15, "D", 1],
  [16, "Em", 1],
  [17, "Em", 2],
  [19, "D", 1],
  [20, "A7", 1],
  [21, "D", 1],
  [22, "G", 1],
  [23, "D", 1],
  [24, "Em", 1],
  [25, "D", 2],
  [27, "A7", 1.5],
  [28.5, "D", 0.5],
  [29, "D", 4],
  [33, "Bm", 2],
  [35, "Am", 1],
  [36, "G", 1],
  [37, "Am", 2],
  [39, "G", 2],
  [41, "D", 1],
  [42, "G", 1],
  [43, "Em", 1],
  [44, "Am", 1],
  [45, "D", 3],
  [48, "G", 1],
  [49, "G", 1],
  [50, "D", 1],
  [51, "G", 1],
  [52, "D7", 1],
  [53, "G", 4],
  [57, "G", 1],
  [58, "D", 1],
  [59, "G", 1],
  [60, "D7", 1],
  [61, "G", 2],
  [63, "D", 1],
  [64, "G", 1],
  [65, "D7", 1],
  [66, "G", 1],
  [67, "D", 1],
  [68, "A7", 1],
  [69, "D", 1],
  [70, "D7", 1],
  [71, "G", 1],
  [72, "C", 1],
  [73, "G", 2],
  [75, "D", 1.5],
  [76.5, "G", 0.5],
  [77, "G", 3],
];
const piano: Record<string, number[]> = {
  G: [43, 47, 50],
  C: [48, 52, 55],
  D: [50, 54, 57],
  D7: [42, 45, 48],
  Em: [40, 43, 47],
  Am: [45, 48, 52],
  A7: [49, 52, 55],
  Bm: [47, 50, 54],
};
const bass: Record<string, number[]> = {
  G: [43, 47],
  C: [48],
  D: [42],
  D7: [42, 48],
  Em: [40, 47],
  Am: [45],
  A7: [43, 49],
  Bm: [47],
};
const strum: Record<string, number[]> = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  D: [50, 57, 62, 66],
  D7: [50, 57, 60, 66],
  Em: [40, 47, 52, 55, 59, 64],
  Am: [45, 52, 57, 60, 64],
  A7: [45, 52, 55, 61, 64],
  Bm: [54, 59, 62, 66],
};
function fixture(voicings: Record<string, number[]>) {
  return changes.flatMap(([s, c, d]) => voicings[c].map((p) => [p, s, d]));
}
const boundary = (bar: number) => (bar === 0 ? 0 : 1 + (bar - 1) * 4);
test("Faithful offers Piano, Guitar and Voice + Piano with independent display and practice", () => {
  assert.deepEqual(
    hymnArrangements(hymn).map((a) => [a.id, a.label]),
    [
      ["original", "Voice + Piano"],
      ["guitar-vocal", "Guitar + Voice"],
      ["piano", "Piano"],
      ["guitar-edition", "Guitar"],
    ],
  );
  assert.equal(hymnPreferences(hymn.id,{arrangement:"original"}).arrangement,"original");
  assert.equal(hymnPreferences(hymn.id).bpm, 72);
  for (const scoreDisplay of ["notation", "tab", "both", "chords"])
    for (const hands of ["both", "right", "left"]) {
      const p = hymnPreferences(hymn.id, {
        arrangement: "guitar-edition",
        hands,
        scoreDisplay,
      });
      assert.equal(p.hands, hands);
      assert.equal(p.scoreDisplay, scoreDisplay);
    }
});
test("all 62 source melody attacks, phrasing, pickup and final durations survive", () => {
  const original = read(arrangeHymn(hymn, "melody", 0).abc);
  assert.equal(original.tracks[0].length, 62);
  for (const a of ["piano", "guitar-edition"] as const) {
    const s = read(arrangeHymn(hymn, a, 0).abc);
    assert.deepEqual(
      s.tracks[0],
      original.tracks[0].map(([p, t, d]) => [
        p - (a === "piano" ? 0 : 12),
        t,
        d,
      ]),
    );
    assert.equal(s.audio.totalDuration * 4, 80);
    assert.equal(s.tracks[0][0][2], 1);
    assert.deepEqual(s.tracks[0].at(-1)?.slice(1), [77, 3]);
  }
});
test("Piano follows independently reviewed harmony, with compact separate hands", () => {
  const s = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(s.tracks[1], fixture(piano));
  assert(
    Math.max(...s.tracks[1].map((n) => n[0])) <
      Math.min(...s.tracks[0].map((n) => n[0])),
  );
  for (const chord of Object.values(piano))
    assert(chord.at(-1)! - chord[0] <= 7);
  for (const [hand, i] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      s.tracks[i],
    );
});
test("fingerstyle is playable on distinct strings, with available fingers and no barre", () => {
  const s = read(arrangeHymn(hymn, "guitar-edition", 0).abc);
  assert.deepEqual(s.tracks[1], fixture(bass));
  const ns = s.tracks.flatMap((tr, voice) => tr.map((n) => ({ n, voice })));
  for (const t of new Set(ns.map(({ n }) => n[1]))) {
    const active = ns.filter(({ n: [, s, d] }) => s <= t && s + d > t + 1e-7),
      ps = active.map(({ n: [p] }) => faithfulPosition(p, true)!);
    assert(ps.every(Boolean));
    assert.equal(
      new Set(ps.map((p) => p.str)).size,
      ps.length,
      `strings at ${t}`,
    );
    assert(ps.every((p) => p.num >= 0 && p.num <= 4));
    const fs = active
      .map(({ n: [p], voice }) => faithfulFingers("guitar", 0, voice, [p])[0])
      .filter(Boolean);
    assert.equal(new Set(fs).size, fs.length, `fingers at ${t}`);
    const frets = ps.filter((p) => p.num > 0).map((p) => p.num);
    assert(Math.max(...frets) - Math.min(...frets) <= 3);
  }
});
test("melody and fuller chord shapes are independently available for practice", () => {
  const s = read(arrangeHymn(hymn, "guitar-edition", 0).abc);
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc).tracks[0],
    s.tracks[0],
  );
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc).tracks[0],
    fixture(strum),
  );
});
test("every excerpt preserves notes and durations, including the last-beat refrain pickup", () => {
  for (const a of ["piano", "guitar-edition"] as const) {
    const full = read(arrangeHymn(hymn, a, 0).abc);
    for (let section = 0; section < 6; section++) {
      const part = arrangeHymn(hymn, a, 4, section),
        from = boundary(part.from),
        to = Math.min(80, boundary(part.to));
      assert.deepEqual(
        read(part.abc).tracks,
        full.tracks.map((tr) =>
          tr
            .filter(([, s, d]) => s < to && s + d > from)
            .map(([p, s, d]) => [
              p,
              Math.max(s, from) - from,
              Math.min(s + d, to) - Math.max(s, from),
            ]),
        ),
      );
    }
    let t = 0;
    const marks: unknown[] = [];
    for (const l of full.tune.lines)
      for (const n of l.staff?.[0]?.voices?.[0] || []) {
        if (n.el_type === "part") marks.push([n.title, t]);
        if (n.el_type === "note") t += n.duration * 4;
      }
    assert.deepEqual(marks, [
      ["Verse", 0],
      ["Refrain", 48],
    ]);
  }
  const chords = read(
    arrangeHymn(hymn, "guitar-edition", 0).abc,
  ).tune.lines.flatMap(
    (l) =>
      l.staff?.flatMap((st) =>
        (st.voices || []).flatMap((v) =>
          v.flatMap((n) =>
            n.el_type === "note"
              ? (n.chord || []).map((c: { name: string }) => c.name)
              : [],
          ),
        ),
      ) || [],
  );
  assert.equal(
    chords.filter((c) => c === "D7").length,
    4,
    "D7 at beat 70 is present under held melody",
  );
});
test("three selected verses play gaplessly with the same complete refrain", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  const score = arrangeHymn(hymn, "guitar-edition", 0),
    audio = read(score.abc).audio;
  const plan = hymnPlaybackScore({
    hymn,
    arrangement: "guitar-edition",
    sectionBars: 0,
    section: 0,
    hands: "both",
    totalBars: 21,
    sections: 1,
    abc: score.abc,
    audio,
    transpose: 0,
    stanzas: [1, 2, 3],
  });
  assert.equal(plan.audio.totalDuration * 4, 240);
  assert.deepEqual(
    plan.verses?.map((v) => v.end - v.start),
    [80, 80, 80],
  );
});
test("responsive systems retain timing and keep pickup and short ending attached", async () => {
  const { planScoreLayout } = await import("../../../packages/music-practice/src/score-layout/plan");
  const { sectionBreaks } = await import("../../../packages/music-practice/src/score-layout/abc");
  for (const a of ["piano", "guitar-edition"] as const)
    for (const capacity of [180, 300, 600]) {
      const source = arrangeHymn(hymn, a, 0).abc;
      let duration = 0;
      const measures = read(source).tune.lines.flatMap(line=>line.staff?.[0]?.voices?.[0] || []).flatMap(item=>{
        if(item.el_type === "note")duration+=item.duration;
        if(item.el_type !== "bar")return [];
        const bar={minimumWidth:66,naturalWidth:90,duration};duration=0;return [bar];
      });
      const breaks=planScoreLayout([{startWidth:0,bars:measures,barDuration:1}],capacity).sections[0].breaks;
      const tune = read(source,sectionBreaks([breaks]));
      assert.deepEqual(tune.tracks, read(source).tracks);
      const rows = tune.tune.lines.filter((l) => l.staff),
        first = rows[0].staff![0].voices![0],
        last = rows.at(-1)!.staff![0].voices![0];
      assert(first.filter((n) => n.el_type === "bar").length >= 2);
      assert(last.filter((n) => n.el_type === "bar").length >= 2);
    }
});
test("soprano phrase slurs and the breathing rest remain intact", () => {
  const signature = (abc: string) =>
    abcjs
      .parseOnly(abc)[0]
      .lines.flatMap((l) => l.staff?.[0]?.voices?.[0] || [])
      .flatMap((n) =>
        n.el_type === "note"
          ? [
              [
                n.duration,
                !!n.rest,
                (n.pitches || []).map((p) => [
                  p.startSlur?.length || 0,
                  p.endSlur?.length || 0,
                ]),
              ],
            ]
          : [],
      );
  const source = signature(arrangeHymn(hymn, "melody", 0).abc);
  for (const a of ["piano", "guitar-edition"] as const)
    assert.deepEqual(signature(arrangeHymn(hymn, a, 0).abc), source);
});
