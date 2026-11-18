import test from "node:test";
import assert from "node:assert/strict";
import {
  backingArrangement,
  backingChord,
  guitarVoicings,
  scalePitchClasses,
} from "../src/backing-arrangement";
import { backingChokes, backingRoom } from "../src/backing-performance";
import {
  backingSampleChoices,
  backingClockActive,
  backingSemitones,
  type BackingEvent,
} from "../src/backing-track-model";

test("all long takes are deterministic, harmonically compatible and change across cycles", () => {
  for (const style of ["blues", "rock"] as const)
    for (const mode of ["steady", "active"] as const)
      for (const quality of ["major", "minor"] as const) {
        const a = backingArrangement(style, mode, quality),
          b = backingArrangement(style, mode, quality, 1);
        assert.deepEqual(a, backingArrangement(style, mode, quality));
        assert.notDeepEqual(a.events, b.events);
        assert.ok(a.beats >= 256);
        assert.equal(a.beats, b.beats);
        const allowed = scalePitchClasses(9, quality);
        for (const take of [a, b])
          for (const event of take.events) {
            assert.ok(event.beat >= 0 && event.beat < take.beats);
            assert.ok(Number.isFinite(event.level));
            assert.ok(event.duration > 0);
            if (event.part === "guitar" || event.part === "bass") {
              assert.ok(
                allowed.includes(event.note % 12),
                `${quality} ${event.part} ${event.note}`,
              );
              assert.ok(event.beat + event.duration < take.beats);
            }
          }
        const chords = Array.from({ length: a.beats / 4 }, (_, bar) =>
          backingChord(style, quality, bar),
        );
        assert.equal(
          new Set(chords.map((c) => `${c.degree}:${c.minor}`)).size,
          4,
        );
        const guitar = a.events.filter(
          (e) => e.part === "guitar" && e.articulation !== "muted",
        );
        assert.ok(
          guitar.some((e) => e.duration > 4),
          "sustained support retained",
        );
        for (const chord of chords) {
          const grips = guitarVoicings(chord);
          assert.ok(grips.length > 0);
          for (const grip of grips) {
            const frets = grip.filter((n) => n.fret > 0).map((n) => n.fret);
            assert.ok(Math.max(...frets) - Math.min(...frets) <= 4);
            assert.equal(new Set(grip.map((n) => n.string)).size, 3);
          }
        }
      }
});

test("native recordings cover both scale qualities in every key with at most one semitone shift", () => {
  for (const quality of ["major", "minor"] as const)
    for (let tonic = 0; tonic < 12; tonic++) {
      const take = backingArrangement("rock", "active", quality, 2);
      const notes = new Map(
        take.events
          .filter((e) => e.part === "guitar" || e.part === "bass")
          .map((e) => [`${e.part}:${e.note}:${e.articulation}`, e]),
      );
      for (const event of notes.values())
        for (const release of event.articulation === "muted"
          ? [false]
          : [false, true]) {
          const choices = backingSampleChoices(event, tonic, release);
          assert.ok(choices.length >= 2);
          assert.ok(
            choices.every(
              ([, s]) =>
                Math.abs(s.note - event.note - backingSemitones(tonic)) <= 1,
            ),
          );
          if (!release)
            assert.ok(
              choices.every(
                ([, s]) =>
                  (s.articulation ?? "normal") ===
                  (event.articulation ?? "normal"),
              ),
            );
        }
    }
});

test("hat, bass and guitar choking follows physical voices, not all polyphony", () => {
  const event = (
    part: BackingEvent["part"],
    note: number,
    string?: number,
  ): BackingEvent => ({
    part,
    note,
    string,
    beat: 0,
    duration: 1,
    velocity: 60,
    level: 1,
  });
  assert.ok(backingChokes(event("drums", 42), { part: "drums", note: 46 }));
  assert.ok(!backingChokes(event("drums", 38), { part: "drums", note: 46 }));
  assert.ok(backingChokes(event("bass", 33), { part: "bass", note: 40 }));
  assert.ok(
    backingChokes(event("guitar", 60, 3), {
      part: "guitar",
      note: 59,
      string: 3,
    }),
  );
  assert.ok(
    !backingChokes(event("guitar", 60, 3), {
      part: "guitar",
      note: 60,
      string: 4,
    }),
  );
});

test("the original stereo room is deterministic, short and finite", () => {
  for (const rate of [44100, 48000]) {
    const room = backingRoom(rate);
    assert.deepEqual(room, backingRoom(rate));
    assert.notDeepEqual(room[0], room[1]);
    for (const channel of room) {
      assert.ok(channel.length <= rate * 0.37);
      assert.ok(channel.every(Number.isFinite));
      assert.ok(channel.reduce((n, x) => n + x * x, 0) < 1);
      assert.ok(
        channel.slice(0, Math.floor(rate * 0.008)).every((x) => x === 0),
      );
    }
  }
});

test("sample selection tolerates a bounded working set and the clock stays linked during a key reload", () => {
  assert.equal(backingClockActive({ status: "loading", syncing: true }), true);
  assert.equal(
    backingClockActive({ status: "loading", syncing: false }),
    false,
  );
  assert.equal(backingClockActive({ status: "paused", syncing: true }), false);
  const event: BackingEvent = {
    part: "guitar",
    note: 60,
    beat: 0,
    duration: 1,
    velocity: 56,
    level: 1,
  };
  const all = backingSampleChoices({ ...event, velocity: 40 }, 9);
  const available = new Set(all.map(([id]) => id));
  const choices = backingSampleChoices(event, 9, false, available);
  assert.ok(choices.length >= 2);
  assert.ok(
    choices.every(
      ([id, s]) => available.has(id) && s.velocity === 40 && s.note === 60,
    ),
  );
});
