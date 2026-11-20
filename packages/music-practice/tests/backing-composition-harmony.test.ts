import assert from "node:assert/strict";
import test from "node:test";
import {
  genreBackingArrangement as arrange,
  rawGenreBackingArrangement,
} from "../src/backing-genre-engine";
import {
  gospelPhraseLibrary,
  gospelPhraseTake,
} from "../src/backing-gospel-phrases";
import { gospelArrangement } from "../src/backing-gospel";
import { scalePracticeHarmony } from "../src/backing-scale-harmony";
const pc = (n: number) => ((n % 12) + 12) % 12;

test("Gospel added ninths sit above the triad and answer phrases resolve to a complete tonic chord", () => {
  assert.ok(gospelPhraseLibrary);
  for (const phrase of gospelPhraseLibrary.phrases) {
    for (const b of phrase.bars) {
      const last = gospelPhraseLibrary.cells.organ[b.organ].at(-1)!;
      if (b.organ === "maj-nine") {
        assert.ok(Math.max(...last[2]) >= 14, "ninth above the core chord");
        assert.ok(
          last[2].every((n, i, a) => i === 0 || n - a[i - 1] >= 3),
          "no C-D-E cluster",
        );
      }
      if (b.organ === "min-sus")
        assert.equal(
          b.piano,
          "rest",
          "piano must not supply the minor third against the suspended fourth",
        );
      if (b.organ.endsWith("answer")) {
        const chord = new Set(last[2].map(pc));
        assert.ok(
          [0, phrase.quality === "major" ? 4 : 3, 7].every((n) => chord.has(n)),
          "a short answer lands on tonic, third and fifth",
        );
      }
    }
  }
});

test("Gospel holds common chord tones without carrying them through a written bass/drum answer", () => {
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (const tonic of [0, 6, 11]) {
        const source = gospelPhraseTake(
          scalePracticeHarmony(
            gospelArrangement(mode, quality, 0, 76, tonic),
            quality,
          ),
        )!;
        const t = rawGenreBackingArrangement(
          "gospel",
          mode,
          quality,
          0,
          76,
          tonic,
          undefined,
          quality,
        );
        const held = source.events.filter(
          (e) => e.instrument === "tonewheel-organ" && e.duration > 4,
        );
        if (mode === "steady")
          assert.ok(held.length, "held chords have actual legato durations");
        for (const e of held) {
          const p = t.events.find(
            (n) =>
              n.instrument === e.instrument &&
              n.note === e.note &&
              Math.abs(n.beat - e.beat) < 0.1,
          )!;
          assert.ok(
            p && Math.abs(p.duration - e.duration) < 0.1,
            "historical progression must not truncate the authored tonic fifth",
          );
        }
        for (const [i, id] of t.phraseIds!.entries()) {
          const phrase = gospelPhraseLibrary!.phrases.find((p) => p.id === id)!;
          for (const [b, bar] of phrase.bars.entries())
            if (bar.answer === "bass" || bar.answer === "drums") {
              const reply = (i * 8 + b) * 4 + 3;
              assert.ok(
                !t.events.some(
                  (e) =>
                    e.part === "keys" &&
                    e.beat < reply &&
                    e.beat + e.duration > reply,
                ),
                "held keys leave the written answer window empty",
              );
            }
        }
      }
});

test("Soul keyboard calls, suspensions and cadences use open spacing and land on tonic harmony in every key", () => {
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const t = arrange(
          "soul",
          mode,
          quality,
          0,
          84,
          tonic,
          undefined,
          quality,
        );
        for (let bar = 0; bar < 64; bar++) {
          const notes = t.events
            .filter(
              (e) =>
                e.instrument === "soul-keys" &&
                Math.abs(e.beat - bar * 4) < 0.2,
            )
            .map((e) => e.note)
            .sort((a, b) => a - b);
          for (let i = 1; i < notes.length; i++)
            assert.ok(
              notes[i] - notes[i - 1] >= 3,
              "factory chords avoid cramped added-tone clusters",
            );
          if (bar % 8 === 7) {
            const chord = new Set(notes.map((n) => pc(n - tonic)));
            assert.ok(
              [0, quality === "major" ? 4 : 3, 7].every((n) => chord.has(n)),
              "cadence spells a tonic triad",
            );
          }
        }
        const first = t.events.filter(
          (e) => e.instrument === "soul-keys" && e.beat < 0.2,
        );
        assert.ok(
          first.every((e) => pc(e.note - tonic) !== 0),
          "the opening leaves the root to bass",
        );
      }
});

test("Folk neighbour figures return by step while the independent thumb continues", () => {
  for (const quality of ["major", "minor"] as const)
    for (const mode of ["steady", "active"] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const t = arrange(
          "folk",
          mode,
          quality,
          0,
          88,
          tonic,
          "fingerpicked",
          quality,
        );
        const notes = t.events
          .filter(
            (e) =>
              e.part === "guitar" &&
              e.string! >= 3 &&
              e.beat >= 14.45 &&
              e.beat < 16,
          )
          .map((e) => e.note);
        assert.equal(notes.length, 3);
        assert.equal(
          notes[0],
          notes[2],
          "neighbour resolves to its starting chord tone",
        );
        assert.equal(
          Math.abs(notes[1] - notes[0]),
          2,
          "stepwise motion without a register jump",
        );
        assert.equal(
          pc(notes[2] - tonic),
          quality === "major" ? 4 : 3,
          "answer returns to the third",
        );
      }
});

test("Blues up/down answers are distinct, step through the triad in order, and stay playable in every key", () => {
  for (const quality of ["major", "minor"] as const)
    for (let tonic = 0; tonic < 12; tonic++) {
      const take = arrange(
        "blues",
        "active",
        quality,
        0,
        90,
        tonic,
        undefined,
        quality,
      );
      const reply = (bar: number) =>
        take.events
          .filter(
            (e) =>
              e.instrument === "blues-lead" && Math.floor(e.beat / 4) === bar,
          )
          .map((e) => e.note);
      // The opening section is deliberately quiet; use the first settled pair.
      const bars = [
        ...new Set(
          take.events
            .filter((e) => e.instrument === "blues-lead")
            .map((e) => Math.floor(e.beat / 4)),
        ),
      ];
      const contours = bars.map((bar) => reply(bar));
      assert.ok(
        contours.some((n) => n.length === 3 && n[0] < n[1] && n[1] < n[2]),
        "rising answer",
      );
      assert.ok(
        contours.some((n) => n.length === 3 && n[0] > n[1] && n[1] > n[2]),
        "falling answer",
      );
      for (const n of contours)
        assert.equal(new Set(n.map(pc)).size, 3, "three distinct chord tones");
    }
});
