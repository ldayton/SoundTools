import assert from "node:assert/strict";
import test from "node:test";
import score from "../src/backing-phrases/gospel.json";
import {
  gospelPhraseIssues,
  gospelPhraseLibrary,
  gospelPhraseTake,
  readGospelLibrary,
} from "../src/backing-gospel-phrases";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { gospelArrangement } from "../src/backing-gospel";
import {
  practicePitchClasses,
  scalePracticeHarmony,
  type ScalePracticeQuality,
} from "../src/backing-scale-harmony";
import {
  backingSampleChoices,
  type backingPack,
} from "../src/backing-track-model";
import { gospelPalette } from "../src/backing-gospel-palette";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";

const pack = gospelPalette({
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack);
const qualities: ScalePracticeQuality[] = [
  "major",
  "minor",
  "major-pentatonic",
  "minor-pentatonic",
  "major-blues",
  "minor-blues",
];

test("eight authored scores are accepted, distinct and cover both feels and tonalities", () => {
  assert.deepEqual(gospelPhraseIssues, []);
  assert.ok(gospelPhraseLibrary);
  const signatures = new Set(
    gospelPhraseLibrary.phrases.map((p) => JSON.stringify(p.bars)),
  );
  assert.equal(signatures.size, 8);
  assert.match(gospelPhraseLibrary.provenance.method, /AI-assisted/);
  assert.equal(
    readGospelLibrary(JSON.parse(JSON.stringify(score))).issues.length,
    0,
  );
});

test("score acceptance rejects unsafe output and uncoordinated ensemble answers", () => {
  const cases: [string, (s: typeof score) => void][] = [
    [
      "schema",
      (s) => {
        s.version = 2;
      },
    ],
    [
      "duplicate",
      (s) => {
        s.phrases[1].id = s.phrases[0].id;
      },
    ],
    [
      "reference",
      (s) => {
        s.phrases[0].bars[0].organ = "missing";
      },
    ],
    [
      "pitch",
      (s) => {
        s.cells.organ["maj-held"][0][2] = [1];
      },
    ],
    [
      "native range",
      (s) => {
        s.cells.bass["root-fifth"][0][2] = [24];
      },
    ],
    [
      "GM mapping",
      (s) => {
        s.cells.drums.soft[0][2] = [99];
      },
    ],
    [
      "end boundary",
      (s) => {
        s.cells.piano["maj-soft"][0][0] = 47;
        s.cells.piano["maj-soft"][0][1] = 1;
      },
    ],
    [
      "duration",
      (s) => {
        s.cells.organ["maj-held"][0][1] = 49;
      },
    ],
    [
      "overlap",
      (s) => {
        s.cells.bass["root-fifth"][0][1] = 30;
      },
    ],
    [
      "crowded answer",
      (s) => {
        s.phrases[0].bars[7].answer = "bass";
        s.phrases[0].bars[7].organ = "maj-held";
      },
    ],
    [
      "backbeat",
      (s) => {
        s.cells.drums.soft = s.cells.drums.soft.filter((n) => n[0] !== 12);
      },
    ],
    [
      "ending",
      (s) => {
        s.phrases[0].bars[7].answer = null;
      },
    ],
  ];
  for (const [label, change] of cases) {
    const altered = structuredClone(score);
    change(altered);
    assert.equal(readGospelLibrary(altered).library, null, label);
    assert.ok(readGospelLibrary(altered).issues.length, label);
  }
  for (const bad of [
    null,
    {},
    { ...score, phrases: [null, ...score.phrases.slice(1)] },
    { ...score, provenance: null },
  ])
    assert.equal(readGospelLibrary(bad).library, null);
});

test("production phrases transpose to every supported scale and key at tempo limits, using available native samples", () => {
  for (const scale of qualities)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++)
        for (const tempo of [50, 90, 180]) {
          const quality = scale.startsWith("major") ? "major" : "minor";
          const take = arrange(
            "gospel",
            mode,
            quality,
            0,
            tempo,
            tonic,
            undefined,
            scale,
          );
          assert.equal(take.phrasing, "gospel-phrases-v1");
          assert.equal(take.phraseIds?.length, 8);
          const pcs = practicePitchClasses(tonic, scale);
          let bassEnd = -1;
          for (const e of take.events) {
            assert.ok(
              Number.isFinite(e.beat) &&
                e.beat >= 0 &&
                e.duration > 0 &&
                e.beat + e.duration <= take.beats,
            );
            assert.ok(
              e.velocity > 0 &&
                e.velocity <= 90 &&
                e.level > 0 &&
                Number.isFinite(e.level),
            );
            if (e.part === "bass" || e.part === "keys") {
              assert.ok(
                pcs.includes(e.note % 12),
                `${scale}/${tonic}/${e.note}`,
              );
              assert.ok(e.absolute);
              assert.ok(
                e.note >= (e.part === "bass" ? 28 : 48) &&
                  e.note <= (e.part === "bass" ? 55 : 79),
              );
            }
            if (e.part === "bass") {
              assert.ok(
                e.beat >= bassEnd - 1e-8,
                "monophonic bass after ensemble timing",
              );
              bassEnd = e.beat + e.duration;
            }
            if (e.instrument !== "tonewheel-organ" && tempo === 90) {
              const choices = backingSampleChoices(
                e,
                tonic,
                false,
                undefined,
                pack,
              );
              assert.ok(
                choices.length,
                `missing ${e.part}/${e.note}/${e.articulation}`,
              );
              assert.ok(
                choices.every(([, s]) => s.note === e.note),
                "no emergency sample pitch shifting",
              );
            }
          }
          for (let bar = 0; bar < 64; bar++) {
            const bass = take.events.find(
              (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
            )!;
            assert.equal(
              bass.note % 12,
              tonic,
              "tonic on every bar's first bass attack",
            );
          }
        }
});

test("phrase choice follows eight-bar boundaries, is stable under tempo/key edits and alternates across loop seams", () => {
  const first = arrange(
    "gospel",
    "active",
    "major",
    0,
    76,
    0,
    undefined,
    "major",
  );
  const second = arrange(
    "gospel",
    "active",
    "major",
    1,
    76,
    0,
    undefined,
    "major",
  );
  const changed = arrange(
    "gospel",
    "active",
    "major",
    0,
    120,
    7,
    undefined,
    "major-pentatonic",
  );
  assert.deepEqual(first.phraseIds, changed.phraseIds);
  const ids = [...first.phraseIds!, ...second.phraseIds!];
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id, i) => !i || id !== ids[i - 1]));
  const again = arrange(
    "gospel",
    "active",
    "major",
    0,
    76,
    0,
    undefined,
    "major",
  );
  assert.deepEqual(again, first, "pause/resume regenerates the same take");
});

test("authored scores do not mutate the original plan and unsuitable contexts retain the existing arranger", () => {
  const generic = arrange("gospel", "steady", "major", 0, 76, 0);
  assert.notEqual(generic.phrasing, "gospel-phrases-v1");
  assert.equal(
    gospelPhraseTake(generic),
    undefined,
    "a progression must not be overwritten with a tonic-only score",
  );
  const base = scalePracticeHarmony(
    gospelArrangement("steady", "major", 0, 76, 0),
    "major",
  );
  const before = structuredClone(base);
  assert.equal(
    gospelPhraseTake(base, null),
    undefined,
    "unavailable/rejected library falls back",
  );
  assert.ok(gospelPhraseTake(base));
  assert.deepEqual(base, before);
  assert.equal(
    gospelPhraseTake({ ...base, plan: { ...base.plan, style: "blues" } }),
    undefined,
  );
});
