import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  parseChordSymbol,
  parseChordSymbols,
  searchGuitarChords,
  assessGuitarFingering,
  findGuitarFingering,
  STANDARD_CHORD_TUNING,
  type GuitarChordOptions,
} from "../src/guitar-chord-search";
import {
  OPEN_CHORD_SHAPES,
  familiarGuitarShapes,
} from "../src/guitar-chord-catalog";

const id = (s: string) =>
  [...s].map((c) => (c === "x" ? "x" : Number(c))).join(",");
test("symbols preserve chord meaning, aliases, spelling and a distinct slash bass", () => {
  for (const alias of ["Cmaj7", "CM7", "CΔ7"])
    assert.deepEqual(
      parseChordSymbol(alias).tones.map((t) => t.note),
      ["C", "E", "G", "B"],
    );
  assert.deepEqual(
    parseChordSymbol("Bø7").tones.map((t) => t.note),
    ["B", "D", "F", "A"],
  );
  assert.deepEqual(
    parseChordSymbol("CΔ9").tones,
    parseChordSymbol("Cmaj9").tones,
  );
  assert.deepEqual(
    parseChordSymbol("CΔ").tones,
    parseChordSymbol("Cmaj7").tones,
  );
  assert.deepEqual(parseChordSymbol("D/F♯").bass, {
    note: "F#",
    pitchClass: 6,
  });
  assert.equal(parseChordSymbol("C6/9").bass, null);
  assert.ok(parseChordSymbol("C6/9").tones.some((t) => t.degree === "6"));
  assert.ok(parseChordSymbol("C9").tones.some((t) => t.degree === "b7"));
  assert.ok(!parseChordSymbol("Cadd9").tones.some((t) => t.degree === "b7"));
  assert.equal(
    parseChordSymbol("C7(b9,#11)").tones.find((t) => t.degree === "#11")?.note,
    "F#",
  );
  assert.deepEqual(
    parseChordSymbols("C7(b9,#11), D/F#, C6/9").map((c) => c.symbol),
    ["C7(b9,#11)", "D/F#", "C6/9"],
  );
  for (const bad of ["", "H7", "nonsense", "C7alt", "C7(", "C),G", "C,,G"])
    assert.throws(() => parseChordSymbols(bad), bad);
});

test("familiar open shapes lead, with conventional fingerings rather than fewest-finger tricks", () => {
  const expected: Record<string, string> = {
    C: "x32010",
    G: "320003",
    D: "xx0232",
    A: "x02220",
    E: "022100",
    Am: "x02210",
    Em: "022000",
    Dm: "xx0231",
    C7: "x32310",
    A7: "x02020",
    E7: "020100",
    D7: "xx0212",
    G7: "320001",
    B7: "x21202",
    Am7: "x02010",
    Em7: "020000",
    Cmaj7: "x32000",
    Cmaj9: "x30000",
  };
  for (const [chord, shape] of Object.entries(expected)) {
    const result = searchGuitarChords(chord, { limit: 3 });
    assert.equal(result.voicings[0]?.id, id(shape), chord + " first shape");
    assert.equal(result.voicings[0].rank.group, "familiar-beginner");
  }
  assert.equal(searchGuitarChords("A").voicings[0].fingering.fingerCount, 3);
  const g = searchGuitarChords("G", { limit: 1000 }).voicings;
  assert.ok(
    g.findIndex((v) => v.id === id("320003")) <
      g.findIndex((v) => v.id === id("320033")),
  );
});

test("F follows the teaching progression from small F to mini-barre to full barre", () => {
  const result = searchGuitarChords("F", { limit: 1000 }).voicings;
  assert.equal(result[0].id, id("xx321x"));
  assert.equal(result[1].id, id("xx3211"));
  assert.ok(result.findIndex((v) => v.id === id("133211")) > 1);
  const noBarres = searchGuitarChords("F", { allowBarres: false });
  assert.equal(noBarres.voicings[0].id, id("xx321x"));
  assert.ok(noBarres.voicings.every((v) => !v.fingering.barres.length));
});

test("conventional low-position B minor and transposed barre forms rank ahead of unfamiliar alternatives", () => {
  assert.equal(searchGuitarChords("Bm").voicings[0].id, id("x24432"));
  assert.equal(searchGuitarChords("F#m").voicings[0].id, id("244222"));
  assert.equal(searchGuitarChords("Db").voicings[0].id, id("x46664"));
});

test("barres and finger budgets are physical contacts, not just repeated fret numbers", () => {
  const limits = { maxFingers: 4, allowBarres: true };
  const f = [1, 3, 3, 2, 1, 1],
    fingers = [1, 3, 4, 2, 1, 1];
  assert.equal(assessGuitarFingering(f, fingers, limits)?.fingerCount, 4);
  assert.equal(
    assessGuitarFingering([1, 3, 3, 2, 0, 1], [1, 3, 4, 2, 0, 1], limits),
    null,
    "barre must not block an open string",
  );
  assert.equal(
    assessGuitarFingering([3, 5, 5, 4, 2, 3], fingers, limits),
    null,
    "barre must not block a lower fretted note",
  );
  assert.equal(
    assessGuitarFingering(f, fingers, { ...limits, allowBarres: false }),
    null,
  );
  assert.equal(
    findGuitarFingering(f, { maxFingers: 2, allowBarres: true }),
    null,
  );
  assert.ok(
    findGuitarFingering([null, 0, 2, 2, 2, 0], {
      maxFingers: 1,
      allowBarres: true,
    }),
  );
  assert.equal(
    findGuitarFingering([null, 0, 2, 2, 2, 0], {
      maxFingers: 1,
      allowBarres: false,
    }),
    null,
  );
  assert.ok(
    assessGuitarFingering([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], {
      maxFingers: 0,
      allowBarres: false,
    }),
  );
  assert.equal(
    findGuitarFingering(f, { maxFingers: NaN, allowBarres: true }),
    null,
  );
});

test("every independently authored familiar fixture has consistent chord tones and valid fingers", () => {
  for (const shape of OPEN_CHORD_SHAPES) {
    assert.ok(
      assessGuitarFingering(shape.frets, shape.fingers, {
        maxFingers: 4,
        allowBarres: true,
      }),
      shape.name,
    );
    const allowed = new Set(shape.chord.tones.map((t) => t.pitchClass));
    const notes = shape.frets.flatMap((f, i) =>
      f === null ? [] : [STANDARD_CHORD_TUNING[i] + f],
    );
    assert.ok(
      notes.every((n) => allowed.has(n % 12)),
      shape.name,
    );
    assert.equal(
      Math.min(...notes) % 12,
      shape.chord.root.pitchClass,
      shape.name,
    );
  }
});

test("practical omissions are explicit and never erase the defining third or seventh", () => {
  const practical = searchGuitarChords("C7", { limit: 1000 });
  assert.ok(
    practical.voicings
      .find((v) => v.id === id("x32310"))
      ?.omittedDegrees.includes("5"),
  );
  const complete = searchGuitarChords("C7", {
    voicingPolicy: "complete",
    limit: 1000,
  });
  assert.ok(!complete.voicings.some((v) => v.id === id("x32310")));
  assert.ok(complete.voicings.every((v) => !v.omittedDegrees.length));
  for (const symbol of ["C9", "C13", "Cm11", "C7b5", "C7b9"])
    for (const v of searchGuitarChords(symbol, { limit: 1000 }).voicings) {
      assert.ok(
        v.omittedDegrees.every((d) => ["5", "9"].includes(d)),
        symbol,
      );
    }
});

test("slash bass is the lowest MIDI pitch, including non-chord basses and reentrant tuning", () => {
  for (const tuning of [undefined, [64, 45, 50, 55, 59, 40]]) {
    const result = searchGuitarChords("D/F#", {
      bass: "any",
      tuning,
      limit: 1000,
    });
    assert.ok(result.total > 0);
    for (const v of result.voicings) {
      assert.equal(v.bassMidi % 12, 6);
      assert.equal(v.bassMidi, Math.min(...v.notes.map((n) => n.midi)));
    }
  }
  const slash = searchGuitarChords("C/D", { limit: 1000 });
  assert.ok(slash.total > 0);
  assert.ok(slash.voicings.every((v) => v.bassMidi % 12 === 2));
  for (const v of searchGuitarChords("C", { bass: "any", limit: 1000 })
    .voicings)
    assert.ok([0, 4, 7].includes(v.bassMidi % 12));
});

test("filters apply equally to familiar and generated shapes; input and results stay independent", () => {
  const tuning = Object.freeze([38, 45, 50, 55, 59, 64]);
  const options: GuitarChordOptions = Object.freeze({
    tuning,
    minFret: 3,
    maxFret: 7,
    maxFretSpan: 2,
    minStrings: 3,
    maxStrings: 4,
    maxFingers: 3,
    allowOpenStrings: false,
    allowBarres: false,
    maxMutedGaps: 1,
    limit: 1000,
  });
  const r = searchGuitarChords("D", options);
  assert.ok(r.total > 0);
  for (const v of r.voicings) {
    assert.ok(
      v.notes.every(
        (n) =>
          n.fret >= 3 &&
          n.fret <= 7 &&
          n.midi === tuning[6 - n.string] + n.fret,
      ),
    );
    assert.ok(
      v.rank.features.fretSpan <= 2 &&
        v.notes.length >= 3 &&
        v.notes.length <= 4 &&
        v.fingering.fingerCount <= 3 &&
        !v.fingering.barres.length &&
        v.rank.features.mutedGaps <= 1,
    );
    assert.equal(
      v.rank.familiarity,
      "generated",
      "standard-tuning catalog must not leak into alternate tuning",
    );
  }
  const before = searchGuitarChords("C");
  before.voicings[0].frets[1] = 99;
  assert.equal(searchGuitarChords("C").voicings[0].id, id("x32010"));
  assert.ok(
    searchGuitarChords("C", { requireOpenString: true }).voicings.every((v) =>
      v.frets.includes(0),
    ),
  );
  for (const bad of [
    { maxFret: 25 },
    { maxFretSpan: 6 },
    { minStrings: 6, maxStrings: 3 },
    { maxFingers: 5 },
    { tuning: [40] },
    { limit: 0 },
    { allowOpenStrings: false, requireOpenString: true },
  ])
    assert.throws(() => searchGuitarChords("C", bad));
});

test("pagination happens after deterministic global ranking and shape deduplication", () => {
  const all = searchGuitarChords("C", { limit: 1000 });
  assert.equal(new Set(all.voicings.map((v) => v.id)).size, all.total);
  const second = searchGuitarChords("C", { offset: 5, limit: 5 });
  assert.equal(second.total, all.total);
  assert.deepEqual(second.voicings, all.voicings.slice(5, 10));
  assert.deepEqual(
    searchGuitarChords("B#").voicings.map((v) => v.id),
    searchGuitarChords("C").voicings.map((v) => v.id),
  );
  assert.ok(
    searchGuitarChords("B#").voicings.some((v) =>
      v.notes.some((n) => n.note === "B#2"),
    ),
  );
});

test("common extended voicings precede unfamiliar combinations and high neck shapes stay below easy low ones", () => {
  assert.equal(searchGuitarChords("C9").voicings[0].id, id("x32333"));
  assert.equal(searchGuitarChords("C13").voicings[0].id, id("x32335"));
  assert.equal(searchGuitarChords("Cm9").voicings[0].id, id("x3133x"));
  const c = searchGuitarChords("C", { limit: 1000 }).voicings;
  assert.ok(
    c.findIndex((v) => v.id === id("x3201x")) <
      c.findIndex((v) => v.id === "8,10,10,9,8,8"),
  );
  assert.equal(
    searchGuitarChords("C", { maxFingers: 0, maxFret: 0 }).total,
    0,
    "valid constraints with no matches are not a parser error",
  );
});

test("all roots and explicit chord families return harmonically consistent, fingerable, globally ordered options", () => {
  const roots = [
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];
  const qualities = [
    "",
    "m",
    "7",
    "m7",
    "maj7",
    "dim",
    "dim7",
    "m7b5",
    "sus2",
    "sus4",
    "6",
    "m6",
    "add9",
    "9",
    "m9",
    "maj9",
    "11",
    "m11",
    "13",
    "maj13",
    "5",
    "aug",
  ];
  for (const root of roots)
    for (const quality of qualities) {
      const symbol = root + quality,
        result = searchGuitarChords(symbol, { limit: 1000 });
      assert.ok(result.total > 0, symbol);
      for (const familiar of familiarGuitarShapes(result.chord))
        assert.ok(
          assessGuitarFingering(familiar.frets, familiar.fingers, {
            maxFingers: 4,
            allowBarres: true,
          }),
          symbol + " preferred fingering: " + familiar.name,
        );
      assert.equal(
        new Set(result.voicings.map((v) => v.id)).size,
        result.voicings.length,
        symbol,
      );
      const tonePcs = new Set(result.chord.tones.map((t) => t.pitchClass));
      for (const [index, v] of result.voicings.entries()) {
        assert.ok(
          v.notes.every((n) => tonePcs.has(n.midi % 12)),
          symbol + " wrong pitch",
        );
        assert.equal(v.bassMidi % 12, result.chord.root.pitchClass, symbol);
        assert.ok(
          assessGuitarFingering(v.frets, v.fingering.fingers, {
            maxFingers: 4,
            allowBarres: true,
          }),
          symbol,
        );
        assert.ok(
          v.omittedDegrees.every((d) => ["5", "9"].includes(d)),
          symbol,
        );
        for (const tone of result.chord.tones)
          assert.equal(
            v.notes.some((n) => n.midi % 12 === tone.pitchClass),
            !v.omittedDegrees.includes(tone.degree),
            symbol + " omission accounting",
          );
        if (index) {
          const previous = result.voicings[index - 1];
          assert.ok(
            (previous.rank.group === "familiar-beginner" &&
              v.rank.group === "other") ||
              (previous.rank.group === v.rank.group &&
                previous.rank.cost <= v.rank.cost),
            symbol + " order",
          );
        }
      }
    }
});

test("command line returns ranked structured results and rejects invalid constraints", () => {
  const cli = fileURLToPath(
    new URL("../scripts/chord-search.ts", import.meta.url),
  );
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", cli, "C, F, Bm", "--json", "--limit", "2"],
    { encoding: "utf8" },
  );
  const results = JSON.parse(output);
  assert.deepEqual(
    results.map((r: { chord: { symbol: string } }) => r.chord.symbol),
    ["C", "F", "Bm"],
  );
  assert.deepEqual(
    results.map((r: { voicings: { id: string }[] }) => r.voicings[0].id),
    [id("x32010"), id("xx321x"), id("x24432")],
  );
  assert.ok(
    results.every((r: { voicings: unknown[] }) => r.voicings.length === 2),
  );
  const invalid = spawnSync(
    process.execPath,
    ["--import", "tsx", cli, "C", "--fingers", "5"],
    { encoding: "utf8" },
  );
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /maxFingers/);
});

test("bounded search agrees with independent brute force on a small fretboard", () => {
  for (const [symbol, pcs, bass] of [
    ["C", [0, 4, 7], 0],
    ["Dm", [2, 5, 9], 2],
    ["E5", [4, 11], 4],
  ] as const) {
    const expected: string[] = [];
    for (let code = 0; code < 4 ** 6; code++) {
      let n = code;
      const f: (number | null)[] = [];
      for (let i = 0; i < 6; i++) {
        const digit = n % 4;
        n = Math.floor(n / 4);
        f.push(digit === 3 ? null : digit);
      }
      const notes = f.flatMap((x, i) =>
        x === null ? [] : [STANDARD_CHORD_TUNING[i] + x],
      );
      if (
        notes.length < 3 ||
        Math.min(...notes) % 12 !== bass ||
        notes.some((x) => !(pcs as readonly number[]).includes(x % 12)) ||
        pcs.some((pc) => !notes.some((x) => x % 12 === pc))
      )
        continue;
      if (f.filter((x) => x !== null && x > 0).length > 4) continue;
      const first = f.findIndex((x) => x !== null);
      let last = 5;
      while (f[last] === null) last--;
      if (f.slice(first, last + 1).includes(null)) continue;
      expected.push(f.map((x) => (x === null ? "x" : x)).join(","));
    }
    const actual = searchGuitarChords(symbol, {
      maxFret: 2,
      maxFretSpan: 1,
      allowBarres: false,
      voicingPolicy: "complete",
      limit: 1000,
    });
    assert.deepEqual(
      actual.voicings.map((v) => v.id).sort(),
      expected.sort(),
      symbol,
    );
  }
});
