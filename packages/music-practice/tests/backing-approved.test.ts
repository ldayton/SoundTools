import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedGenreBackingArrangement as arrange,
  rawGenreBackingArrangement,
} from "../src/backing-genre-engine";
import { approvedBackingTake, approvedMixGain } from "../src/backing-approved";
import { practicePitchClasses } from "../src/backing-scale-harmony";
const presets = [
  ["rock", "standard"],
  ["blues", "standard"],
  ["country", "two-step"],
  ["folk", "fingerpicked"],
  ["folk", "strummed"],
  ["reggae", "standard"],
  ["funk", "standard"],
  ["soul", "standard"],
  ["gospel", "standard"],
] as const;
test("approved scores cover complete forms, native pitch classes and playable voices across every key and scale", () => {
  for (const [style, pattern] of presets)
    for (const quality of [
      "major",
      "minor",
      "major-pentatonic",
      "minor-pentatonic",
      "major-blues",
      "minor-blues",
    ] as const)
      for (let tonic = 0; tonic < 12; tonic++) {
        const harmonic = quality.startsWith("minor") ? "minor" : "major",
          t = arrange(
            style,
            "active",
            harmonic,
            0,
            90,
            tonic,
            pattern,
            quality,
          ),
          allowed = practicePitchClasses(tonic, quality),
          ends = new Map<string, number>();
        assert.ok(t.phraseIds?.every((id) => id.startsWith("approved-")));
        assert.equal(t.events.length > 100, true);
        for (const e of t.events) {
          assert.ok(
            e.beat >= 0 &&
              e.beat < t.beats &&
              e.duration > 0 &&
              e.beat + e.duration <= t.beats,
          );
          assert.ok(Number.isFinite(e.level) && e.level > 0);
          if (["guitar", "bass", "keys"].includes(e.part)) {
            assert.ok(
              allowed.includes(((e.note % 12) + 12) % 12),
              `${style}/${quality}/${tonic}: ${e.note}`,
            );
            const key =
              e.part +
              ":" +
              e.instrument +
              ":" +
              (e.part === "bass"
                ? "mono"
                : e.part === "guitar"
                  ? e.string
                  : e.note);
            assert.ok(e.beat >= (ends.get(key) ?? 0) - 1e-7);
            ends.set(key, e.beat + e.duration);
            if (e.part === "guitar") {
              const fret = e.note - [40, 45, 50, 55, 59, 64][e.string!];
              assert.ok(fret >= 0 && fret <= 19);
            }
          }
        }
      }
});
test("approved conversations preserve source, vary across cycles and have a simpler steady feel", () => {
  for (const [style, pattern] of presets) {
    const base = rawGenreBackingArrangement(
        style,
        "active",
        "major",
        0,
        90,
        0,
        pattern,
        "major",
      ),
      before = structuredClone(base);
    approvedBackingTake(base, pattern, "major");
    assert.deepEqual(base, before);
    const active = arrange(
      style,
      "active",
      "major",
      0,
      90,
      0,
      pattern,
      "major",
    );
    assert.notDeepEqual(
      active.events,
      arrange(style, "active", "major", 1, 90, 0, pattern, "major").events,
    );
    assert.ok(
      arrange(style, "steady", "major", 0, 90, 0, pattern, "major").events
        .length < active.events.length,
    );
  }
});
test("supporting instruments participate throughout and leave drum reply windows clear", () => {
  for (const [style, pattern, instrument] of [
    ["folk", "fingerpicked", "upright-bass"],
    ["country", "two-step", "electric-twang"],
    ["soul", "standard", "soul-guitar"],
    ["gospel", "standard", "acoustic-piano"],
  ] as const) {
    const t = arrange(style, "active", "major", 0, 90, 0, pattern, "major");
    for (let b = 0; b < 16; b++)
      assert.ok(
        t.events.filter(
          (e) => e.instrument === instrument && Math.floor(e.beat / 4) === b,
        ).length >= 2,
      );
    for (const [b, bar] of t.plan.bars.entries())
      if (bar.fillStart !== undefined)
        assert.ok(
          !t.events.some(
            (e) =>
              ["bass", "guitar", "keys"].includes(e.part) &&
              e.beat < (b + 1) * 4 &&
              e.beat + e.duration > b * 4 + bar.fillStart!,
          ),
        );
  }
});
test("100% uses the chosen per-instrument genre balances, including separate country guitars", () => {
  assert.equal(
    approvedMixGain("rock", "standard", {
      part: "guitar",
      instrument: "rock-guitar",
    }),
    10 ** (-7 / 20),
  );
  assert.equal(
    approvedMixGain("country", "two-step", {
      part: "guitar",
      instrument: "acoustic-steel",
    }),
    10 ** (-6.5 / 20),
  );
  assert.equal(
    approvedMixGain("country", "two-step", {
      part: "guitar",
      instrument: "electric-twang",
    }),
    10 ** (-8.5 / 20),
  );
  assert.equal(
    approvedMixGain("folk", "strummed", {
      part: "bass",
      instrument: "upright-bass",
    }),
    10 ** (6 / 20),
  );
  assert.equal(
    approvedMixGain("folk", "fingerpicked", {
      part: "bass",
      instrument: "upright-bass",
    }),
    10 ** (1 / 20),
  );
  assert.equal(
    approvedMixGain("gospel", "standard", {
      part: "keys",
      instrument: "acoustic-piano",
    }),
    10 ** (-3.5 / 20),
  );
  assert.equal(
    approvedMixGain("reggae", "standard", {
      part: "keys",
      instrument: "tonewheel-organ",
    }),
    10 ** (1 / 20),
  );
});

import { BackingMixer, backingMixerLevels } from "../src/backing-mixer";
test("instrument faders multiply chosen defaults and refresh when the folk pattern changes", () => {
  const gains: any[] = [];
  const context = {
    currentTime: 0,
    createGain() {
      const n = {
        gain: {
          value: 1,
          setTargetAtTime(v: number) {
            this.value = v;
          },
        },
        connect() {},
        disconnect() {},
      };
      gains.push(n);
      return n;
    },
  } as unknown as BaseAudioContext;
  let pattern: "fingerpicked" | "strummed" = "fingerpicked";
  const mixer = new BackingMixer(
    context,
    new Map([
      ["bass", {} as GainNode],
      ["guitar", {} as GainNode],
    ]),
    backingMixerLevels(),
    (e) => approvedMixGain("folk", pattern, e),
  );
  const bass = mixer.input({ part: "bass", instrument: "upright-bass" });
  assert.equal(bass.gain.value, 10 ** (1 / 20));
  pattern = "strummed";
  assert.equal(mixer.input({ part: "bass", instrument: "upright-bass" }), bass);
  assert.equal(bass.gain.value, 10 ** (6 / 20));
  mixer.setLevels(backingMixerLevels({ levels: { bass: 50 } }));
  assert.equal(bass.gain.value, 0.5 * 10 ** (6 / 20));
  mixer.setLevels(backingMixerLevels({ levels: { bass: 0 } }));
  assert.equal(bass.gain.value, 0);
});

import { genreBackingArrangement } from "../src/backing-genre-engine";
import { backingMixGain } from "../src/backing-mix-balance";
test("chord progressions follow the current chord and maqam retains its dedicated harmony and reference trim", () => {
  for (const [style, pattern] of presets)
    for (const quality of ["major", "minor"] as const)
      for (const tonic of [0, 5, 11]) {
        const t = arrange(style, "active", quality, 0, 90, tonic, pattern);
        for (const e of t.events)
          if (["guitar", "bass", "keys"].includes(e.part)) {
            const b = t.plan.bars[Math.floor(e.beat / 4)];
            assert.ok(
              practicePitchClasses(tonic, quality).includes(
                ((e.note % 12) + 12) % 12,
              ),
              "native sample bank follows the overall key",
            );
            assert.ok(
              practicePitchClasses(
                b.root,
                b.minor ? "minor" : "major",
              ).includes(((e.note % 12) + 12) % 12),
            );
          }
      }
  for (const [style, pattern] of presets)
    assert.deepEqual(
      arrange(style, "active", "major", 0, 90, 0, pattern, "hijaz"),
      genreBackingArrangement(
        style,
        "active",
        "major",
        0,
        90,
        0,
        pattern,
        "hijaz",
      ),
    );
  assert.equal(backingMixGain("roots-room", "active", false), 0.776072);
  assert.equal(backingMixGain("gospel-room", "steady", false), 0.660544);
});
