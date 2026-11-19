import frozenRhythm from "./fixtures/reggae-funk-pre-sustain-rhythm.json";
import { test } from "node:test";
import assert from "node:assert/strict";
import { backingFingerprint } from "./backing-fingerprint";
import { genreBackingArrangement as arrange } from "../src/backing-genre-engine";
import { BACKING_GENRES } from "../src/backing-genres";
import type { BackingMode } from "../src/backing-track-model";
import type { BackingQuality } from "../src/backing-arrangement";
test("Reggae/Funk keep sparse bass, playable diatonic harmony and valid loop boundaries in every key", () => {
  const tuning = [40, 45, 50, 55, 59, 64];
  for (const style of ["reggae", "funk"] as const)
    for (const mode of ["steady", "active"] as const)
      for (const quality of ["major", "minor"] as const)
        for (let tonic = 0; tonic < 12; tonic++) {
          const take = arrange(
            style,
            mode,
            quality,
            0,
            BACKING_GENRES[style].tempo.preferred,
            tonic,
          );
          assert.equal(take.beats, 256);
          assert.equal(take.plan.bars[0].level, take.plan.bars.at(-1)!.level);
          const pcs = (
            quality === "major"
              ? [0, 2, 4, 5, 7, 9, 11]
              : [0, 2, 3, 5, 7, 8, 10]
          ).map((n) => (n + tonic) % 12);
          for (let bar = 0; bar < 64; bar++) {
            const bass = take.events.filter(
              (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
            );
            assert.ok(bass.length >= 1 && bass.length <= 2);
          }
          for (const part of ["bass", "guitar"] as const) {
            const notes = take.events.filter((e) => e.part === part);
            assert.ok(new Set(notes.map((e) => e.note % 12)).size >= 4);
            for (let i = 0; i < notes.length; i++) {
              const e = notes[i];
              assert.ok(pcs.includes(e.note % 12));
              assert.ok(
                e.beat >= 0 &&
                  e.duration > 0 &&
                  e.beat + e.duration <= take.beats,
              );
              if (part === "guitar") {
                assert.ok(e.string !== undefined);
                const fret = e.note - tuning[e.string!];
                assert.ok(fret >= 0 && fret <= 12);
              }
              const next = notes
                .slice(i + 1)
                .find((n) => part === "bass" || n.string === e.string);
              if (next) assert.ok(e.beat + e.duration <= next.beat + 0.0001);
            }
          }
          const hands = take.events.filter(
            (e) => e.part === "drums" && ![36, 44].includes(e.note),
          );
          let group: typeof hands = [];
          for (const e of hands) {
            if (!group.length || e.beat - group[0].beat < 0.012) group.push(e);
            else group = [e];
            assert.ok(
              group.length <= 2,
              "no simultaneous three-hand drum strokes",
            );
          }
        }
});
test("new genres have distinct one-drop and syncopated funk identities without denser bass in Active", () => {
  const reggae = arrange("reggae", "active", "minor", 0, 78, 9),
    funk = arrange("funk", "active", "minor", 0, 104, 9);
  assert.ok(
    reggae.events
      .filter((e) => e.part === "drums" && e.note === 36)
      .every((e) => Math.abs((e.beat % 4) - 2) < 0.1),
  );
  assert.ok(
    reggae.events
      .filter((e) => e.part === "guitar")
      .every((e) => e.articulation === "normal"),
  );
  assert.ok(
    funk.events.some(
      (e) => e.part === "drums" && e.note === 38 && e.velocity < 40,
    ),
  );
  for (const style of ["reggae", "funk"] as const) {
    const steady = arrange(style, "steady", "minor"),
      active = arrange(style, "active", "minor");
    assert.equal(
      steady.events.filter((e) => e.part === "bass").length,
      active.events.filter((e) => e.part === "bass").length,
    );
  }
});

test("chord sustain revision preserves the original drums, percussion and sparse bass exactly", () => {
  for (const row of frozenRhythm) {
    const take = arrange(
      row.style as "reggae" | "funk",
      row.mode as BackingMode,
      row.quality as BackingQuality,
      row.cycle,
      row.tempo,
      row.tonic,
    );
    assert.equal(
      backingFingerprint(take.events.filter((e) => e.part !== "guitar")),
      row.portableSha256,
    );
  }
  for (const style of ["reggae", "funk"] as const)
    for (const mode of ["steady", "active"] as const) {
      const t = arrange(
        style,
        mode,
        "minor",
        0,
        BACKING_GENRES[style].tempo.preferred,
        9,
      );
      const g = t.events.filter((e) => e.part === "guitar");
      assert.ok(g.every((e) => e.articulation === "normal"));
      assert.ok(g.reduce((sum, e) => sum + e.duration, 0) / g.length > 0.4);
    }
});
