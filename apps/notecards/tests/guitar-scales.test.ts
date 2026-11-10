import {
  mergeGuitarScaleSettings,
  guitarScaleFromQuery,
} from "../src/guitar-scale-settings";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scaleNotes,
  scalePositions,
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
