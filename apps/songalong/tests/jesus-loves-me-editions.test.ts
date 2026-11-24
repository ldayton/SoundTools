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
  jesusPosition,
  jesusFingers,
} from "../../../packages/music-practice/src/jesus-loves-me";
import { capoAudio } from "../../../packages/music-practice/src/chord-editions";
import { hymnPlaybackScore } from "../../../packages/music-practice/src/hymn-playback-score";
import { playbackNotes } from "../../../packages/music-practice/src/hymn-playback";
import { performNotes } from "../../../packages/music-practice/src/playback-performance";
const hymn = hymns.find((h) => h.slug === "jesus-loves-me")!;
function read(abc: string, capo = 0) {
  const tune = abcjs.parseOnly(abc)[0];
  assert.equal(tune.warnings?.length || 0, 0, tune.warnings?.join("\n"));
  const audio = capoAudio(tune.setUpAudio({ qpm: 60, chordsOff: true }), capo);
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
const harmony: [number, string, number][] = [
  [0, "I", 3],
  [3, "V7", 1],
  [4, "I", 4],
  [8, "IV", 4],
  [12, "IV", 1],
  [13, "I", 3],
  [16, "I", 3],
  [19, "V7", 1],
  [20, "I", 4],
  [24, "IV", 2],
  [26, "I", 2],
  [28, "I", 1],
  [29, "V7", 1],
  [30, "I", 2],
  [32, "I", 4],
  [36, "IV", 4],
  [40, "I", 4],
  [44, "I", 1],
  [45, "V7", 3],
  [48, "I", 4],
  [52, "IV", 4],
  [56, "I", 3.5],
  [59.5, "V7", 0.5],
  [60, "I", 4],
];
const chords: Record<string, number[]> = {
  I: [51, 55, 58],
  IV: [44, 48, 51],
  V7: [50, 53, 56],
};
const bass: [number, number[], number][] = [
  [0, [48], 3],
  [3, [41, 47], 1],
  [4, [48], 4],
  [8, [53], 4],
  [12, [53], 1],
  [13, [48], 3],
  [16, [48], 3],
  [19, [41, 47], 1],
  [20, [48], 4],
  [24, [53], 2],
  [26, [48], 1],
  [27, [43], 1],
  [28, [48], 1],
  [29, [41, 47], 1],
  [30, [43], 2],
  [32, [48], 4],
  [36, [53], 4],
  [40, [48], 3],
  [43, [43], 1],
  [44, [48], 1],
  [45, [41, 47], 3],
  [48, [48], 4],
  [52, [53], 4],
  [56, [48], 1],
  [57, [43], 1],
  [58, [48], 1.5],
  [59.5, [41, 47], 0.5],
  [60, [43], 4],
];
test("Jesus Loves Me offers Piano, Guitar and Voice + Piano with separate display and practice settings", () => {
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
  for (const arrangement of ["melody", "bass", "chords", "broken"])
    assert.equal(
      hymnPreferences(hymn.id, { arrangement }).arrangement,
      "piano",
    );
  for (const scoreDisplay of ["notation", "tab", "both", "chords"])
    for (const hands of ["both", "right", "left"]) {
      const s = hymnPreferences(hymn.id, {
        arrangement: "guitar-edition",
        scoreDisplay,
        hands,
      });
      assert.equal(s.scoreDisplay, scoreDisplay);
      assert.equal(s.hands, hands);
    }
});
test("all 49 melody notes and exact rhythms survive, Piano in Eb and Guitar one octave lower with capo 3", () => {
  const source = read(arrangeHymn(hymn, "melody", 0).abc);
  assert.equal(source.tracks[0].length, 49);
  for (const a of ["piano", "guitar-edition"] as const) {
    const score = read(arrangeHymn(hymn, a, 0).abc, a === "piano" ? 0 : 3);
    assert.deepEqual(
      score.tracks[0],
      source.tracks[0].map(([p, s, d]) => [p - (a === "piano" ? 0 : 12), s, d]),
    );
    assert.equal(score.audio.totalDuration * 4, 64);
  }
});
test("piano harmony follows the reviewed tonic, subdominant and dominant rhythm without hand collisions", () => {
  const score = read(arrangeHymn(hymn, "piano", 0).abc);
  assert.deepEqual(
    score.tracks[1],
    harmony.flatMap(([s, c, d]) => chords[c].map((p) => [p, s, d])),
  );
  assert(
    Math.max(...score.tracks[1].map((n) => n[0])) <
      Math.min(...score.tracks[0].map((n) => n[0])),
  );
  for (const c of Object.values(chords)) assert(c.at(-1)! - c[0] <= 7);
  for (const [hand, i] of [
    ["right", 0],
    ["left", 1],
  ] as const)
    assert.deepEqual(
      read(arrangeHymn(hymn, "piano", 0, 0, hand).abc).tracks[0],
      score.tracks[i],
    );
});
test("fingerstyle uses the reviewed bass changes, distinct strings and distinct available fingers throughout", () => {
  const score = read(arrangeHymn(hymn, "guitar-edition", 0).abc, 3);
  assert.deepEqual(
    score.tracks[1],
    bass.flatMap(([s, ps, d]) => ps.map((p) => [p + 3, s, d])),
  );
  const ns = score.tracks.flatMap((tr, voice) => tr.map((n) => ({ n, voice })));
  for (const t of new Set(ns.map(({ n }) => n[1]))) {
    const sounding = ns.filter(({ n: [, s, d] }) => s <= t && s + d > t + 1e-7),
      positions = sounding.map(({ n: [p] }) => jesusPosition(p - 3, true)!);
    assert(positions.every(Boolean));
    assert.equal(
      new Set(positions.map((p) => p.str)).size,
      positions.length,
      `String conflict ${t}`,
    );
    assert(positions.every((p) => p.num >= 0 && p.num <= 3));
    const fingers = sounding
      .map(
        ({ n: [p], voice }) =>
          jesusFingers("guitar", Math.floor(t / 4), voice, [p])[0],
      )
      .filter(Boolean);
    assert.equal(new Set(fingers).size, fingers.length, `Finger conflict ${t}`);
  }
});
test("melody and full-shape accompaniment can be practised without changing the full score", () => {
  const full = read(arrangeHymn(hymn, "guitar-edition", 0).abc, 3);
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "right").abc, 3).tracks[0],
    full.tracks[0],
  );
  const voicing: Record<string, number[]> = {
    I: [48, 52, 55, 60, 64],
    IV: [53, 57, 60, 65],
    V7: [43, 47, 50, 55, 59, 65],
  };
  assert.deepEqual(
    read(arrangeHymn(hymn, "guitar-edition", 0, 0, "left").abc, 3).tracks[0],
    harmony.flatMap(([s, c, d]) => voicing[c].map((p) => [p + 3, s, d])),
  );
});
test("all passages retain pitch, capo, complete durations and section labels", () => {
  for (const a of ["piano", "guitar-edition"] as const) {
    const full = read(arrangeHymn(hymn, a, 0).abc, a === "piano" ? 0 : 3);
    for (let section = 0; section < 4; section++) {
      const part = arrangeHymn(hymn, a, 4, section),
        from = part.from * 4,
        to = part.to * 4;
      assert.deepEqual(
        read(part.abc, a === "piano" ? 0 : 3).tracks,
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
    for (const line of full.tune.lines)
      for (const n of line.staff?.[0]?.voices?.[0] || []) {
        if (n.el_type === "part") marks.push([n.title, t]);
        if (n.el_type === "note") t += n.duration * 4;
      }
    assert.deepEqual(marks, [
      ["Verse", 0],
      ["Refrain", 32],
    ]);
  }
});
test("three verses schedule gaplessly and apply capo exactly once", async () => {
  const { hymnPlaybackScore } =
    await import("../../../packages/music-practice/src/hymn-playback-score");
  const score = arrangeHymn(hymn, "guitar-edition", 0),
    audio = read(score.abc, 3).audio,
    plan = hymnPlaybackScore({
      hymn,
      arrangement: "guitar-edition",
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
    [58],
  );
});

test("solo guitar lets the opening G ring over the two E plucks, clears G7, and ends each stanza cleanly", () => {
  const score=arrangeHymn(hymn,"guitar-edition",0);
  assert(score.abc.includes('"^Let ring"'));
  const prepared=hymnPlaybackScore({hymn,arrangement:"guitar-edition",sectionBars:0,section:0,hands:"both",totalBars:16,sections:1,abc:score.abc,audio:read(score.abc,3).audio,transpose:0,stanzas:[1,2,3]});
  const source=playbackNotes(prepared.audio);
  const played=performNotes(source,{instrument:"guitar",positionFor:p=>jesusPosition(p-3,true)});
  for(const offset of [0,64,128]){
    const opening=played.find(n=>n.start===offset && n.pitch===58)!;
    assert.equal(opening.duration,3,"G-string melody rings to the G7 change");
    assert.equal(source.find(n=>n.start===offset && n.pitch===58)!.duration,1,"engraved quarter note stays a quarter note");
    assert.equal(played.find(n=>n.start===offset+1 && n.pitch===55)!.duration,1,"E is replucked on the same string");
    assert.equal(played.find(n=>n.start===offset+2 && n.pitch===55)!.duration,1,"inner note clears at G7");
    const phrase=played.filter(n=>n.start>=offset && n.start<offset+64);
    assert(phrase.every(n=>n.start+n.duration<=offset+64+1e-7));
    for(const t of new Set(phrase.map(n=>n.start))){
      const active=phrase.filter(n=>n.start<=t && n.start+n.duration>t+1e-7);
      assert.equal(new Set(active.map(n=>n.string)).size,active.length,`String collision at ${t}`);
      const frets=active.filter(n=>n.fret!>3).map(n=>n.fret!-3);
      assert(new Set(frets).size<=4 && (!frets.length || Math.max(...frets)-Math.min(...frets)<=3),`Unplayable held shape at ${t}`);
    }
  }
});
