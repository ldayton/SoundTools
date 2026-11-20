import assert from "node:assert/strict";
import test from "node:test";
import data from "../src/backing-phrases/ensemble.json";
import {
  ensembleScoreIssues,
  readEnsembleLibrary,
  ensemblePhraseTake,
} from "../src/backing-ensemble-phrases";
import {
  genreBackingArrangement as arrange,
  rawGenreBackingArrangement,
  referenceGenreBackingArrangement,
} from "../src/backing-genre-engine";
import {
  practicePitchClasses,
  type ScalePracticeQuality,
} from "../src/backing-scale-harmony";
import { BACKING_GENRES } from "../src/backing-genres";
import {
  backingSampleChoices,
  type BackingStyle,
  type backingPack,
} from "../src/backing-track-model";
import type { BackingPattern } from "../src/backing-patterns";
import { acousticPalette } from "../src/backing-acoustic-palette";
import { rootsPalette } from "../src/backing-roots-palette";
import { pocketPalette } from "../src/backing-pocket-palette";
import { reggaePalette } from "../src/backing-reggae-palette";
import { gospelPalette } from "../src/backing-gospel-palette";
import v2 from "../src/assets/backing-v2/manifest.json";
import drums from "../src/assets/backing-drum-v3/manifest.json";
const presets: [BackingStyle, BackingPattern][] = [
  ["blues", "standard"],
  ["rock", "standard"],
  ["country", "two-step"],
  ["folk", "fingerpicked"],
  ["folk", "strummed"],
  ["gospel", "standard"],
  ["reggae", "standard"],
  ["funk", "standard"],
  ["soul", "standard"],
];
const base = {
  ...v2,
  samples: { ...v2.samples, ...drums.samples },
} as unknown as typeof backingPack;
const packs = new Map(
  presets.map(([s]) => [
    s,
    s === "folk" || s === "country"
      ? acousticPalette(s)
      : s === "blues" || s === "rock"
        ? rootsPalette(s, base)
        : s === "funk" || s === "soul"
          ? pocketPalette(s, base)
          : s === "reggae"
            ? reggaePalette(base)
            : gospelPalette(base),
  ]),
);

test("every ensemble profile has two distinct authored sentences per feel and rejects bad revisions", () => {
  assert.deepEqual(ensembleScoreIssues, []);
  assert.ok(readEnsembleLibrary(data).library);
  for (const p of Object.values(data.profiles))
    assert.equal(new Set(p.phrases.map((s) => JSON.stringify(s.bars))).size, 4);
  const change = (edit: (x: typeof data) => void) => {
    const d = structuredClone(data);
    edit(d);
    const r = readEnsembleLibrary(d);
    assert.equal(r.library, null);
    assert.ok(r.issues.length);
  };
  change((x) => {
    x.version = 2;
  });
  change((x) => {
    x.profiles.funk.tracks.bass.cells.hook[0][0] = -1;
  });
  change((x) => {
    x.profiles.reggae.tracks.keys.instrument = "missing";
  });
  change((x) => {
    x.profiles.soul.phrases[0].bars[0].cells.keys = "missing";
  });
  change((x) => {
    x.profiles.rock.phrases[1].id = x.profiles.rock.phrases[0].id;
  });
  change((x) => {
    x.profiles.country.gainDb.major.active = Infinity;
  });
  change((x) => {
    x.profiles.strummed.phrases[0].bars[0].answer = "unexpected" as never;
  });
  const missingPhrase = structuredClone(data);
  missingPhrase.profiles.soul.phrases[0] = null as never;
  assert.equal(readEnsembleLibrary(missingPhrase).library, null);
  for (const input of [null, {}, { ...data, profiles: {} }])
    assert.equal(readEnsembleLibrary(input).library, null);
});

test("all nine production presets use authored scores in every key and remain native, diatonic and loop-safe at tempo limits", () => {
  // Sample choice ignores timing/gain/duration. Check each distinct lookup once;
  // all events still undergo the complete pitch, timing and overlap assertions.
  const checkedSamples = new Set<string>();
  for (const [style, pattern] of presets)
    for (const quality of ["major", "minor"] as const)
      for (const mode of ["steady", "active"] as const)
        for (let tonic = 0; tonic < 12; tonic++)
          for (const tempo of [50, 90, 180]) {
            const t = arrange(
                style,
                mode,
                quality,
                0,
                tempo,
                tonic,
                pattern,
                quality,
              ),
              pcs = practicePitchClasses(tonic, quality);
            assert.ok(
              t.phraseIds?.length,
              `${style}/${pattern}/${quality}/${tonic}: no authored score`,
            );
            assert.equal(new Set(t.phraseIds).size, 2);
            const ends = new Map<string, number>();
            for (const e of t.events) {
              assert.ok(
                Number.isFinite(e.beat) &&
                  e.beat >= 0 &&
                  e.duration > 0 &&
                  e.beat + e.duration <= t.beats,
                `${style}/${pattern}: bounds`,
              );
              assert.ok(
                Number.isFinite(e.level) &&
                  e.level > 0 &&
                  e.velocity > 0 &&
                  e.velocity <= 127,
              );
              if (!["drums", "percussion"].includes(e.part)) {
                assert.ok(
                  pcs.includes(e.note % 12),
                  `${style}/${quality}/${tonic}: ${e.note}`,
                );
                assert.ok(e.absolute);
                if (e.part === "bass") assert.ok(e.note >= 28 && e.note <= 55);
                if (e.part === "keys") assert.ok(e.note >= 48 && e.note <= 79);
                const physical =
                  e.instrument?.startsWith("funk-") && e.part === "guitar"
                    ? "funk-guitar"
                    : e.instrument?.startsWith("rock-") && e.part === "guitar"
                      ? "rock-guitar"
                      : e.instrument;
                const key =
                  e.part +
                  ":" +
                  physical +
                  ":" +
                  (e.part === "guitar"
                    ? e.string
                    : e.part === "bass"
                      ? "bass"
                      : e.note);
                assert.ok(
                  e.beat >= (ends.get(key) ?? -1) - 1e-6,
                  `${style}/${mode}/${tempo}: overlapping ${key}`,
                );
                ends.set(key, e.beat + e.duration);
              }
              const sampleKey = JSON.stringify([
                style,
                e.part,
                e.instrument,
                e.string,
                e.absolute,
                e.articulation,
                e.note,
                e.velocity,
                tonic,
              ]);
              if (
                tempo === 90 &&
                e.instrument !== "tonewheel-organ" &&
                !checkedSamples.has(sampleKey)
              ) {
                checkedSamples.add(sampleKey);
                const samples = backingSampleChoices(
                  e,
                  tonic,
                  false,
                  undefined,
                  packs.get(style)!,
                );
                assert.ok(
                  samples.length,
                  `${style}/${tonic}: missing ${e.instrument}/${e.note}/${e.string}/${e.articulation}`,
                );
                assert.ok(
                  samples.every(
                    ([, s]) =>
                      s.note === e.note &&
                      (!e.instrument || s.instrument === e.instrument),
                  ),
                  "native instrument pitch",
                );
              }
            }
            for (let i = 0; i < t.plan.bars.length; i++)
              assert.equal(
                t.events.find(
                  (e) => e.part === "bass" && Math.floor(e.beat / 4) === i,
                )!.note % 12,
                tonic,
                "bass establishes tonic",
              );
          }
});

test("every scale type retains safe practice harmony and the score order survives key/tempo edits and loop seams", () => {
  const scales: ScalePracticeQuality[] = [
    "major",
    "minor",
    "major-pentatonic",
    "minor-pentatonic",
    "major-blues",
    "minor-blues",
  ];
  for (const [style, pattern] of presets)
    for (const mode of ["steady", "active"] as const) {
      const first = arrange(style, mode, "major", 0, 90, 0, pattern, "major");
      const next = arrange(style, mode, "major", 1, 90, 0, pattern, "major");
      const ids = [...first.phraseIds!, ...next.phraseIds!];
      assert.ok(ids.every((id, i) => !i || id !== ids[i - 1]));
      for (const scale of scales)
        for (const tonic of [0, 5, 11]) {
          const quality = scale.startsWith("major") ? "major" : "minor";
          const t = arrange(
              style,
              mode,
              quality,
              0,
              120,
              tonic,
              pattern,
              scale,
            ),
            pcs = practicePitchClasses(tonic, scale);
          for (const e of t.events)
            if (!["drums", "percussion"].includes(e.part))
              assert.ok(pcs.includes(e.note % 12));
          if (quality === "major")
            assert.deepEqual(t.phraseIds, first.phraseIds);
        }
    }
});

test("scores preserve genre form, source immutability, mixer identities and the previous arranger as fallback/reference", () => {
  for (const [style, pattern] of presets) {
    const reference = referenceGenreBackingArrangement(
        style,
        "active",
        "major",
        0,
        90,
        0,
        pattern,
        "major",
      ),
      before = structuredClone(reference);
    const t = arrange(style, "active", "major", 0, 90, 0, pattern, "major");
    assert.notDeepEqual(t.events, reference.events);
    assert.equal(t.beats, reference.beats);
    assert.equal(t.plan.bars.length, BACKING_GENRES[style].form.bars);
    assert.deepEqual(reference, before);
    assert.ok(!reference.phraseIds?.length);
    assert.equal(ensemblePhraseTake(reference, pattern, null), undefined);
    const raw = rawGenreBackingArrangement(
      style,
      "active",
      "major",
      0,
      90,
      0,
      pattern,
      "major",
    );
    assert.deepEqual(raw.plan, t.plan);
    assert.equal(raw.events.length, t.events.length);
  }
});

test("genre-specific performance gestures survive the shared renderer", () => {
  const country = arrange(
    "country",
    "active",
    "major",
    0,
    104,
    0,
    "two-step",
    "major",
  );
  for (const e of country.events.filter(
    (e) => e.instrument === "electric-twang",
  )) {
    const chord = country.events.filter(
      (n) =>
        n.instrument === "electric-twang" &&
        (Math.abs(n.beat - e.beat) * 60) / 104 < 0.025,
    );
    assert.ok(
      chord.length <= 2,
      "Country's electric reply is a double stop, not another full strummed guitar",
    );
  }
  const reggae = arrange(
    "reggae",
    "steady",
    "major",
    0,
    78,
    0,
    undefined,
    "major",
  );
  const firstSkank = reggae.events.filter(
    (e) => e.instrument === "reggae-guitar" && e.beat < 1,
  );
  assert.ok(firstSkank.length >= 2);
  assert.ok(
    firstSkank[0].string! > firstSkank.at(-1)!.string!,
    "upstrokes brush from high strings toward low strings",
  );
  const soul = arrange("soul", "steady", "major", 0, 84, 0, undefined, "major");
  assert.ok(
    soul.events
      .filter((e) => e.instrument === "soul-keys" && e.beat < 1)
      .every((e) => e.note % 12 !== 0),
    "Soul's rootless call leaves the tonic to bass",
  );
  const blues = arrange(
    "blues",
    "active",
    "major",
    0,
    90,
    0,
    undefined,
    "major",
  );
  const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;
  assert.ok(
    mean(
      blues.events
        .filter((e) => e.instrument === "blues-lead")
        .map((e) => e.note),
    ) >
      mean(
        blues.events
          .filter((e) => e.instrument === "blues-rhythm")
          .map((e) => e.note),
      ) +
        5,
    "Blues lead answers sit above the rhythm riff",
  );
});
