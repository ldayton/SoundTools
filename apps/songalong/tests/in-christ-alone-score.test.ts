import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import abcjs from "abcjs";
import hymns from "../../../packages/music-practice/src/hymns.json";
import {
  arrangeHymn,
  hymnBarCount,
} from "../../../packages/music-practice/src/hymn-arrangements";
import { hymnPreferences } from "../../../packages/music-practice/src/hymn-settings";
const hymn = hymns.find((h) => h.slug === "in-christ-alone")!;
const source = readFileSync(
  new URL("../hymns/source/in-christ-alone.abc", import.meta.url),
  "utf8",
);
const straight = hymn.harmony.replaceAll(":|", "|]");
const tune = abcjs.parseOnly(straight)[0];
const audio = tune.setUpAudio({ qpm: 60, chordsOff: true });
type Event = [number[], number, number];
// Independent E-flat photo goldens: MIDI pitch, within-bar quarter beat, length.
// The requested D-major source edition sounds one semitone below every photo pitch.
const melody: Event[][] = [
  [
    [[58], 0, 0.5],
    [[60], 0.5, 0.75],
    [[63], 1.25, 0.25],
  ],
  [
    [[63], 0, 1],
    [[58], 1.5, 0.5],
    [[60], 2, 0.5],
    [[63], 2.5, 0.5],
  ],
  [
    [[65], 0, 1],
    [[67], 2, 0.5],
    [[65], 2.5, 0.25],
    [[63], 2.75, 0.25],
  ],
  [
    [[60], 0, 0.5],
    [[67], 0.5, 0.5],
    [[65], 1, 1.5],
    [[63], 2.5, 0.5],
  ],
  [
    [[63], 0, 1],
    [[58], 1.5, 0.5],
    [[60], 2, 0.75],
    [[63], 2.75, 0.25],
  ],
  [
    [[63], 0, 1],
    [[58], 1.5, 0.5],
    [[60], 2, 0.5],
    [[63], 2.5, 0.5],
  ],
  [
    [[65], 0, 1],
    [[67], 2, 0.5],
    [[65], 2.5, 0.25],
    [[63], 2.75, 0.25],
  ],
  [
    [[60], 0, 0.5],
    [[67], 0.5, 0.5],
    [[65], 1, 1.5],
    [[63], 2.5, 0.5],
  ],
  [
    [[63], 0, 1],
    [[63], 1.5, 0.5],
    [[67], 2, 0.5],
    [[70], 2.5, 0.5],
  ],
  [
    [[72], 0, 1],
    [[72], 1.5, 0.5],
    [[70], 2, 0.5],
    [[67], 2.5, 0.5],
  ],
  [
    [[65], 0, 1],
    [[63], 1.5, 0.5],
    [[75], 2, 0.5],
    [[74], 2.5, 0.5],
  ],
  [
    [[72], 0, 1],
    [[72], 1.5, 0.5],
    [[70], 2, 0.5],
    [[67], 2.5, 0.5],
  ],
  [
    [[65], 0, 1],
    [[58], 1.5, 0.5],
    [[60], 2, 0.75],
    [[63], 2.75, 0.25],
  ],
  [
    [[63], 0, 1],
    [[58], 1.5, 0.5],
    [[60], 2, 0.5],
    [[63], 2.5, 0.5],
  ],
  [
    [[65], 0, 1],
    [[67], 2, 0.5],
    [[65], 2.5, 0.25],
    [[63], 2.75, 0.25],
  ],
  [
    [[60], 0, 0.5],
    [[67], 0.5, 0.5],
    [[65], 1, 1.5],
    [[63], 2.5, 0.5],
  ],
  [[[63], 0, 2]],
  [],
  [],
  [],
  [],
];
const inner: Event[][] = [
  [[[56], 0.5, 1]],
  [
    [[55, 58], 0, 2],
    [[56, 60], 2, 1],
  ],
  [
    [[58, 62], 0, 2],
    [[58, 63], 2, 1],
  ],
  [
    [[56], 0, 0.5],
    [[58, 63], 0.5, 0.5],
    [[56, 60, 63], 1, 2],
  ],
  [
    [[55, 58], 0, 2],
    [[56, 60], 2, 1],
  ],
  [
    [[55, 58], 0, 2],
    [[56, 60], 2, 1],
  ],
  [
    [[58, 62], 0, 2],
    [[58, 63], 2, 1],
  ],
  [
    [[56], 0, 0.5],
    [[58, 63], 0.5, 0.5],
    [[56, 60, 63], 1, 2],
  ],
  [
    [[55, 58], 0, 2],
    [[58, 63], 2, 1],
  ],
  [
    [[63, 67], 0, 2],
    [[63], 2, 1],
  ],
  [
    [[58], 0, 2],
    [[63], 0, 1],
    [[62], 1, 1],
    [[63, 70], 2, 1],
  ],
  [
    [[63], 0, 2],
    [[70], 0, 1],
    [[68], 1, 1],
    [[63], 2, 1],
  ],
  [
    [[63], 0, 1],
    [[62], 1, 1],
    [[56, 60], 2, 1],
  ],
  [
    [[55, 58], 0, 2],
    [[56, 60], 2, 1],
  ],
  [
    [[58, 62], 0, 2],
    [[58, 63], 2, 1],
  ],
  [
    [[56], 0, 0.5],
    [[58, 63], 0.5, 0.5],
    [[56, 60, 63], 1, 2],
  ],
  [
    [[55, 58], 0, 1.5],
    [[58], 1.5, 0.5],
    [[60], 2, 0.75],
    [[63], 2.75, 0.25],
  ],
  [
    [[65], 0, 1.5],
    [[67], 1.5, 0.5],
    [[56, 62, 65], 2, 0.75],
    [[63], 2.75, 0.25],
  ],
  [
    [[56, 60], 0, 1.5],
    [[60], 1.5, 0.5],
    [[56, 60], 2, 0.75],
    [[63], 2.75, 0.25],
  ],
  [
    [[55, 58, 63], 0, 1.5],
    [[55], 1.5, 0.5],
    [[56], 2, 0.25],
    [[58], 2.25, 0.25],
    [[63], 2.5, 2],
  ],
  [[[55, 58], 0, 1.5]],
];
const bass: Event[][] = [
  [[[44, 51], 0.5, 1]],
  [
    [[39, 51], 0, 2],
    [[44, 51], 2, 1],
  ],
  [
    [[46], 0, 1],
    [[41], 1, 1],
    [[43], 2, 1],
  ],
  [
    [[44], 0, 0.5],
    [[43], 0.5, 0.5],
    [[41], 1, 1],
    [[46], 2, 1],
  ],
  [
    [[39], 0, 2],
    [[44, 51], 2, 1],
  ],
  [
    [[39, 51], 0, 2],
    [[44, 51], 2, 1],
  ],
  [
    [[46], 0, 1],
    [[41], 1, 1],
    [[43], 2, 1],
  ],
  [
    [[44], 0, 0.5],
    [[43], 0.5, 0.5],
    [[41], 1, 1],
    [[46], 2, 1],
  ],
  [
    [[39], 0, 2],
    [[43], 2, 1],
  ],
  [
    [[44], 0, 1],
    [[56], 1, 1],
    [[55, 58], 2, 1],
  ],
  [
    [[46, 53], 0, 2],
    [[43, 55], 2, 1],
  ],
  [
    [[44, 56], 0, 2],
    [[46, 53], 2, 1],
  ],
  [
    [[46, 58], 0, 2],
    [[44, 51], 2, 1],
  ],
  [
    [[39, 51], 0, 2],
    [[44, 51], 2, 1],
  ],
  [
    [[46], 0, 1],
    [[41], 1, 1],
    [[43], 2, 1],
  ],
  [
    [[44], 0, 0.5],
    [[43], 0.5, 0.5],
    [[41], 1, 1],
    [[46], 2, 1],
  ],
  [
    [[39], 0, 2],
    [[51], 2, 1],
  ],
  [
    [[46], 0, 2.5],
    [[46], 2.5, 0.5],
  ],
  [[[41, 51], 0, 3]],
  [
    [[39], 0, 2],
    [[46], 2, 1],
  ],
  [[[39], 0, 1.5]],
];
const expected = (bars: Event[][]) =>
  bars
    .flatMap((events, index) =>
      events.flatMap(([pitches, start, duration]) =>
        pitches.map((pitch) => [
          pitch - 1,
          (index ? 1.5 + (index - 1) * 3 : 0) + start,
          duration,
        ]),
      ),
    )
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
const actual = (index: number) =>
  audio.tracks[index]
    .flatMap((n) =>
      n.cmd === "note" ? [[n.pitch, n.start * 4, n.duration * 4]] : [],
    )
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
test("D edition transposes every printed voice by one semitone without changing rhythm", () => {
  assert.equal(tune.warnings?.length || 0, 0);
  assert.equal(audio.totalDuration * 4, 60);
  assert.deepEqual(actual(0), expected(melody));
  assert.deepEqual(actual(1), expected(melody));
  assert.deepEqual(actual(2), expected(inner));
  assert.deepEqual(actual(3), [
    [55, 49.5, 2],
    [61, 49.5, 2],
  ]);
  assert.deepEqual(actual(4), expected(bass));
});
test("printed meter, pickup, three staves, organ-only ending and repeat remain intact", () => {
  assert.equal(hymn.key, "D");
  assert.equal(hymn.meter, "3/4");
  assert.equal(tune.getPickupLength() * 4, 1.5);
  assert.equal(hymnBarCount(hymn), 21);
  assert.deepEqual(
    tune.lines[0].staff?.map((s) => [s.clef?.type, s.voices?.length]),
    [
      ["treble", 1],
      ["treble", 3],
      ["bass", 1],
    ],
  );
  assert.equal(
    abcjs.parseOnly(hymn.harmony)[0].setUpAudio({ qpm: 60, chordsOff: true })
      .totalDuration * 4,
    120,
  );
  assert.match(source, /Q:"Steadily"/);
  assert.doesNotMatch(source, /Q:.*=/);
  const chords = tune.lines
    .flatMap((line) => line.staff?.[0]?.voices?.[0] || [])
    .flatMap((note) =>
      note.el_type === "note"
        ? (note.chord || []).map((chord: { name: string }) => chord.name)
        : [],
    );
  assert.deepEqual(chords, [
    "G",
    "D",
    "G",
    "A",
    "D",
    "G",
    "A",
    "D",
    "G",
    "D",
    "G",
    "A",
    "D",
    "G",
    "A",
    "D",
    "G",
    "D",
    "A",
    "D/F♯",
    "G",
    "Bm",
    "A",
    "D",
    "G",
    "A",
    "D/F♯",
    "G",
    "A",
    "D",
    "Em",
    "D",
  ]);
  assert.ok(actual(0).every((n) => n[1] + n[2] <= 48.5));
  assert.ok(actual(2).some((n) => n[1] > 49));
});
test("the canonical In Christ Alone contains all four printed verses", () => {
  assert.equal(hymn.title, "In Christ Alone");
  assert.equal(hymn.stanzas.length, 4);
  assert.ok(hymn.stanzas.every((s) => s.syllables.length === 64));
  const words = (index: number) =>
    hymn.stanzas[index].syllables.join(" ").replace(/-\s+/g, "");
  assert.match(words(1), /In Christ alone! who took on flesh/);
  assert.match(words(2), /^There in the ground/);
  assert.match(words(3), /Here in the power of Christ I'll stand!/);
  assert.equal(hymn.source, "user-supplied-score");
  assert.equal(hymn.sourceUrl, "");
  assert.match(hymn.credits.join(" "), /Rights remain with/);
  assert.equal(hymns.find((h) => h.slug === "in-christ-alone")!.key, "D");
  assert.equal(hymnPreferences(hymn.id).arrangement, "original");
  assert.equal(
    hymnPreferences(hymn.id, { arrangement: "melody" }).arrangement,
    "piano",
  );
  assert.equal(hymns.filter(h=>h.id === hymn.id).length,1);
});
test("teacher chord adaptation preserves the sung and organ melodies; hand selection respects treble clefs", () => {
  const adapted = abcjs.parseOnly(arrangeHymn(hymn, "original", 0, 0, "both").abc)[0].setUpAudio({chordsOff:true});
  const archival = abcjs.parseOnly(hymn.harmony)[0].setUpAudio({chordsOff:true});
  const musical = (tracks: typeof adapted.tracks) => tracks.map(track=>track.map(event=>{
    const {startChar,endChar,...music}=event as typeof event & {startChar?:number;endChar?:number};return music;
  }));
  assert.deepEqual(musical(adapted.tracks.slice(0,2)), musical(archival.tracks.slice(0,2)));
  assert.equal(adapted.totalDuration, archival.totalDuration);
  const right = abcjs.parseOnly(
    arrangeHymn(hymn, "original", 0, 0, "right").abc,
  )[0];
  assert.equal(right.lines[0].staff?.[0]?.voices?.length, 4);
  assert.ok(
    right.lines.every((l) => l.staff?.every((s) => s.clef?.type === "treble")),
  );
  const left = abcjs.parseOnly(
    arrangeHymn(hymn, "original", 0, 0, "left").abc,
  )[0];
  assert.equal(left.lines[0].staff?.[0]?.voices?.length, 1);
  assert.equal(left.lines[0].staff?.[0]?.clef?.type, "bass");
});
