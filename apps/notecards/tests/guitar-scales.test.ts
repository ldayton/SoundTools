import {
  SCALE_SHAPES,
  patternPositions,
  patternShift,
  patternBounds,
  relativePattern,
  migratePattern,
} from "../src/guitar-scale-patterns";
import {
  mergeGuitarScaleSettings,
  guitarScaleFromQuery,
} from "../src/guitar-scale-settings";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scaleNotes,
  scalePositions,
  relativeScale,
  SCALE_TONICS,
  type ScaleQuality,
} from "../src/guitar-scales";
import { defaultProgress, loadProgress } from "../src/progress";
import { decodeState, migrateLegacy } from "../src/durable-state";
const expected = {
  major: [
    "C D E F G A B",
    "Db Eb F Gb Ab Bb C",
    "D E F# G A B C#",
    "Eb F G Ab Bb C D",
    "E F# G# A B C# D#",
    "F G A Bb C D E",
    "F# G# A# B C# D# E#",
    "G A B C D E F#",
    "Ab Bb C Db Eb F G",
    "A B C# D E F# G#",
    "Bb C D Eb F G A",
    "B C# D# E F# G# A#",
  ],
  minor: [
    "C D Eb F G Ab Bb",
    "C# D# E F# G# A B",
    "D E F G A Bb C",
    "Eb F Gb Ab Bb Cb Db",
    "E F# G A B C D",
    "F G Ab Bb C Db Eb",
    "F# G# A B C# D E",
    "G A Bb C D Eb F",
    "G# A# B C# D# E F#",
    "A B C D E F G",
    "Bb C Db Eb F Gb Ab",
    "B C# D E F# G A",
  ],
};
const natural: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const pitch = (name: string) =>
  (natural[name[0]] +
    [...name.slice(1)].reduce((sum, c) => sum + (c === "#" ? 1 : -1), 0) +
    12) %
  12;
for (const quality of ["major", "minor"] as ScaleQuality[]) {
  for (let tonic = 0; tonic < 12; tonic++) {
    test(`${expected[quality][tonic].split(" ")[0]} ${quality}: spelling and complete fret map`, () => {
      const names = expected[quality][tonic].split(" ");
      assert.deepEqual(
        scaleNotes(tonic, quality).map((n) => n.name),
        names,
      );
      const positions = scalePositions(tonic, quality);
      const tuning = [64, 59, 55, 50, 45, 40];
      const pcs = names.map(pitch);
      for (let string = 1; string <= 6; string++)
        for (let fret = 0; fret <= 5; fret++) {
          const midi = tuning[string - 1] + fret;
          const found = positions.filter(
            (n) => n.string === string && n.fret === fret,
          );
          assert.equal(
            found.length,
            pcs.includes(midi % 12) ? 1 : 0,
            `string ${string} fret ${fret}`,
          );
          if (found[0]) {
            const n = found[0];
            assert.equal(n.midi, midi);
            assert.equal(n.root, midi % 12 === tonic);
            assert.equal(n.name, names[pcs.indexOf(midi % 12)]);
            assert.equal(
              (n.octave + 1) * 12 + natural[n.name[0]] + n.accidental,
              midi,
            );
          }
        }
    });
  }
}
test("E major includes open B and all fifth-fret notes omitted in reference", () => {
  const positions = scalePositions(4, "major");
  assert.deepEqual(
    positions.filter((n) => n.fret === 0).map((n) => n.string),
    [6, 5, 2, 1],
  );
  assert.deepEqual(
    positions.filter((n) => n.fret === 5).map((n) => n.name),
    ["A", "E", "A"],
  );
  assert.equal(
    scalePositions(3, "minor").find((n) => n.string === 2 && n.fret === 0)
      ?.octave,
    4,
  ); // Cb4 sounds B3.
});
test("preview settings migrate into an independent activity without losing theory or hymn checkpoints", () => {
  const state = migrateLegacy({});
  const raw = JSON.parse(JSON.stringify(state));
  raw.progress.mode = "scales";
  raw.progress.profiles.scales = {
    scaleTonic: 3,
    scaleQuality: "minor",
    key: "C",
  };
  raw.activities.sight = { version: 1, position: 24 };
  raw.activities["theory-scales"] = { version: 1, task: "name-degree" };
  const restored = decodeState(raw);
  assert.equal(restored.progress.mode, "guitar-scales");
  assert.deepEqual(restored.activities["guitar-scales"], {
    version: 1,
    settings: { tonic: 3, quality: "minor" },
  });
  assert.deepEqual(restored.activities.sight, raw.activities.sight);
  assert.deepEqual(
    restored.activities["theory-scales"],
    raw.activities["theory-scales"],
  );
  assert.deepEqual(
    restored.legacy["guitar-scales-profile"],
    raw.progress.profiles.scales,
  );
  assert.deepEqual(decodeState(restored), restored, "migration is idempotent");
  assert.deepEqual(
    migrateLegacy({ progress: JSON.stringify(raw.progress) }).activities[
      "guitar-scales"
    ],
    restored.activities["guitar-scales"],
  );
  raw.activities["guitar-scales"] = {
    version: 1,
    settings: { tonic: 9, quality: "major" },
  };
  assert.deepEqual(
    decodeState(raw).activities["guitar-scales"],
    raw.activities["guitar-scales"],
    "new preferences win",
  );
  const theory = migrateLegacy({});
  theory.progress.mode = "scales";
  assert.equal(
    decodeState(theory).progress.mode,
    "scales",
    "upstream theory selection is not remapped",
  );
  raw.progress.profiles.scales = { key: "C" };
  delete raw.activities["guitar-scales"];
  assert.deepEqual(
    decodeState(raw).activities["guitar-scales"],
    { version: 1, settings: { tonic: 4, quality: "major" } },
    "default preview selection survives",
  );
});
test("scale settings and URL overrides share validation without resetting valid values", () => {
  const base = { tonic: 3, quality: "minor" as const };
  assert.deepEqual(
    mergeGuitarScaleSettings({ tonic: 12, quality: "harmonic" }, base),
    base,
  );
  assert.deepEqual(
    guitarScaleFromQuery(new URLSearchParams("key=F%23&scale=major"), base),
    { tonic: 6, quality: "major" },
  );
  assert.deepEqual(
    guitarScaleFromQuery(new URLSearchParams("key=invalid&scale=no"), base),
    base,
  );
  assert.equal(
    loadProgress(
      JSON.stringify({ ...defaultProgress(), mode: "guitar-scales" }),
    ).mode,
    "guitar-scales",
  );
});

test("only exact adjacent open-string equivalents at fret five are optional in every scale", () => {
  const nextOpen: Record<number, number> = {
    6: 45,
    5: 50,
    4: 55,
    3: 59,
    2: 64,
  };
  for (const quality of ["major", "minor"] as const)
    for (let tonic = 0; tonic < 12; tonic++) {
      const positions = scalePositions(tonic, quality);
      for (const n of positions) {
        const expected =
          n.fret === 5 && n.midi === nextOpen[n.string]
            ? n.string - 1
            : undefined;
        assert.equal(n.openAlternative, expected);
        if (n.openAlternative)
          assert.ok(
            positions.some(
              (open) =>
                open.string === n.openAlternative &&
                open.fret === 0 &&
                open.midi === n.midi,
            ),
          );
      }
    }
  const c = scalePositions(0, "major");
  assert.deepEqual(
    c.filter((n) => n.openAlternative).map((n) => n.string),
    [6, 5, 4, 2],
  );
  assert.equal(
    c.find((n) => n.string === 3 && n.fret === 5)?.openAlternative,
    undefined,
  );
  assert.equal(
    c.find((n) => n.string === 1 && n.fret === 5)?.openAlternative,
    undefined,
  );
  assert.equal(
    c.find((n) => n.string === 3 && n.fret === 4)?.openAlternative,
    undefined,
  );
  const eRoot = scalePositions(4, "major").find(
    (n) => n.string === 2 && n.fret === 5,
  )!;
  assert.equal(eRoot.root, true);
  assert.equal(eRoot.openAlternative, 1);
});

test("relative scales share exact spellings and fret positions, but change the tonic", () => {
  for (const quality of ["major", "minor"] as const)
    for (let tonic = 0; tonic < 12; tonic++) {
      const relative = relativeScale(tonic, quality);
      const original = scaleNotes(tonic, quality);
      const paired = scaleNotes(
        relative.tonic,
        relative.quality,
        relative.spelling,
      );
      assert.deepEqual(
        original.map((n) => n.name).sort(),
        paired.map((n) => n.name).sort(),
      );
      const locations = (notes: ReturnType<typeof scalePositions>) =>
        notes.map((n) => [n.string, n.fret, n.midi]);
      assert.deepEqual(
        locations(scalePositions(tonic, quality)),
        locations(
          scalePositions(relative.tonic, relative.quality, relative.spelling),
        ),
      );
      const back = relativeScale(
        relative.tonic,
        relative.quality,
        relative.spelling,
      );
      assert.equal(back.tonic, tonic);
      assert.equal(back.quality, quality);
      assert.equal(
        back.spelling || SCALE_TONICS[quality][tonic],
        SCALE_TONICS[quality][tonic],
      );
    }
});
test("relative spelling, saved selections and links retain the actual key signature", () => {
  assert.deepEqual(relativeScale(6, "major"), {
    tonic: 3,
    quality: "minor",
    spelling: "D#",
  });
  assert.deepEqual(relativeScale(3, "minor"), {
    tonic: 6,
    quality: "major",
    spelling: "Gb",
  });
  assert.equal(
    scaleNotes(3, "minor", "D#")
      .map((n) => n.name)
      .join(" "),
    "D# E# F# G# A# B C#",
  );
  assert.equal(
    scaleNotes(6, "major", "Gb")
      .map((n) => n.name)
      .join(" "),
    "Gb Ab Bb Cb Db Eb F",
  );
  const relative = relativeScale(6, "major");
  assert.deepEqual(
    mergeGuitarScaleSettings(JSON.parse(JSON.stringify(relative))),
    relative,
  );
  assert.deepEqual(
    guitarScaleFromQuery(new URLSearchParams("key=D%23&scale=minor"), {
      tonic: 0,
      quality: "major",
    }),
    relative,
  );
  assert.deepEqual(
    mergeGuitarScaleSettings({ tonic: 0, quality: "major", spelling: "Gb" }),
    { tonic: 0, quality: "major" },
  );
  assert.throws(() => scaleNotes(3, "minor", "Gb"));
});

test("Numbered shapes are complete movable fingerings in every major and minor key", () => {
  for (const shape of SCALE_SHAPES)
    for (const quality of ["major", "minor"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const shift = patternShift(tonic, quality, shape);
        const positions = patternPositions(tonic, quality, shape, shift);
        assert.equal(new Set(positions.map((n) => n.pitchClass)).size, 7);
        assert.equal(new Set(positions.map((n) => n.string)).size, 6);
        assert.ok(
          positions.every(
            (n) =>
              n.fret >= 1 && n.fret <= 22 && n.finger >= 1 && n.finger <= 4,
          ),
        );
        assert.ok(positions.filter((n) => n.root).length >= 2);
        const [low, high] = patternBounds(shape, quality);
        for (const direction of [-1, 1]) {
          if (low + shift + direction < 1 || high + shift + direction > 22)
            continue;
          const next = patternPositions(
            (tonic + direction + 12) % 12,
            quality,
            shape,
            shift + direction,
          );
          assert.deepEqual(
            next.map((n) => [n.string, n.fret - direction, n.finger]),
            positions.map((n) => [n.string, n.fret, n.finger]),
          );
        }
        const relative = relativeScale(tonic, quality);
        const relativeShape = relativePattern(shape, quality);
        assert.equal(relativePattern(relativeShape, relative.quality), shape);
        const relativePositions = patternPositions(
          relative.tonic,
          relative.quality,
          relativeShape,
          patternShift(relative.tonic, relative.quality, relativeShape, shift),
        );
        assert.deepEqual(
          new Set(relativePositions.map((n) => n.pitchClass)),
          new Set(positions.map((n) => n.pitchClass)),
        );
      }
  assert.deepEqual(
    patternPositions(7, "major", "1", -5)
      .filter((n) => n.string === 6)
      .map((n) => [n.fret, n.name, n.finger]),
    [
      [2, "F#", 1],
      [3, "G", 2],
      [5, "A", 4],
    ],
  );
});

// Explicit reference fixtures protect fingerings, not just membership in a scale.
test("GuitarScale.org reference positions and minor-specific fingerings", () => {
  assert.deepEqual(
    SCALE_SHAPES.map((s) => patternBounds(s)[0]),
    [7, 10, 12, 2, 4],
  );
  assert.deepEqual(
    SCALE_SHAPES.map((s) => patternBounds(s, "minor")[0]),
    [4, 7, 9, 12, 2],
  );
  assert.deepEqual(
    patternPositions(9, "minor", "3", 0)
      .filter((n) => n.string === 4)
      .map((n) => [n.fret, n.finger]),
    [
      [9, 1],
      [10, 2],
      [12, 4],
    ],
  );
  assert.deepEqual(
    patternPositions(0, "major", "2", 0)
      .filter((n) => n.string === 4)
      .map((n) => [n.fret, n.finger]),
    [
      [10, 1],
      [12, 2],
      [14, 4],
    ],
  );
  assert.deepEqual(
    SCALE_SHAPES.map((s) => patternBounds(s)[0] + patternShift(4, "major", s)),
    [11, 2, 4, 6, 8],
  );
  assert.equal(migratePattern("E", "major"), "1");
  assert.equal(migratePattern("E", "minor"), "2");
  assert.deepEqual(
    mergeGuitarScaleSettings({
      tonic: 0,
      quality: "major",
      pattern: "E",
      shift: 5,
    }),
    { tonic: 0, quality: "major", pattern: "1" },
  );
});

test("A minor Shape 4 includes F on the D string, not B on the G string", () => {
  const notes = patternPositions(9, "minor", "4", 0);
  assert.deepEqual(
    notes.filter((n) => n.string === 4).map((n) => [n.fret, n.finger]),
    [
      [12, 1],
      [14, 3],
      [15, 4],
    ],
  );
  assert.deepEqual(
    notes.filter((n) => n.string === 3).map((n) => [n.fret, n.finger]),
    [
      [12, 1],
      [14, 3],
    ],
  );
});
