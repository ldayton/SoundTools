import { test } from "node:test";
import assert from "node:assert/strict";
import { backingFingerprint } from "./backing-fingerprint";
import {
  genreBackingArrangement as arrange,
  rawGenreBackingArrangement as rawArrange,
} from "../src/backing-genre-engine";
import { BACKING_GENRES } from "../src/backing-genres";
import baseline from "./fixtures/approved-before-pocket-styles.json";
import bank from "../src/assets/backing-soul-folk/manifest.json";
import acoustic from "../src/assets/backing-folk-country/manifest.json";
import type { BackingMode } from "../src/backing-track-model";
import type { BackingQuality } from "../src/backing-arrangement";
test("Folk, Country, Gospel and Reggae retain their approved musical arrangements", () => {
  for (const row of baseline) {
    const t = rawArrange(
      row.style as "folk" | "country" | "gospel" | "reggae",
      row.mode as BackingMode,
      row.quality as BackingQuality,
      row.cycle,
      row.tempo,
      row.tonic,
    );
    assert.equal(
      backingFingerprint(t),
      row.sha256,
      `${row.style}/${row.mode}/${row.quality}/${row.tonic}`,
    );
  }
});
test("Soul/Folk retain sparse bass and diatonic, supported instruments in all keys", () => {
  for (const style of ["soul", "folk"] as const)
    for (const quality of ["major", "minor"] as const)
      for (const mode of ["steady", "active"] as const)
        for (let tonic = 0; tonic < 12; tonic++) {
          const t = arrange(
              style,
              mode,
              quality,
              0,
              BACKING_GENRES[style].tempo.preferred,
              tonic,
            ),
            pcs = (
              quality === "major"
                ? [0, 2, 4, 5, 7, 9, 11]
                : [0, 2, 3, 5, 7, 8, 10]
            ).map((n) => (n + tonic) % 12);
          assert.equal(t.beats, 256);
          assert.equal(t.plan.bars[0].level, t.plan.bars.at(-1)!.level);
          for (let bar = 0; bar < 64; bar++)
            assert.ok(
              t.events.filter(
                (e) => e.part === "bass" && Math.floor(e.beat / 4) === bar,
              ).length <= (style === "soul" && mode === "active" ? 3 : 2),
            );
          for (const e of t.events) {
            assert.ok(e.beat >= 0 && e.beat < t.beats && e.duration > 0);
            if (["bass", "guitar", "keys"].includes(e.part)) {
              assert.ok(pcs.includes(e.note % 12));
              assert.ok(e.beat + e.duration <= t.beats);
            }
            if (e.part === "guitar" && style === "folk")
              assert.ok(
                Object.values(acoustic.samples).some(
                  (s) =>
                    s.part === "guitar" &&
                    s.note === e.note &&
                    "string" in s &&
                    s.string === e.string,
                ),
              );
            if (e.part === "keys")
              assert.ok(
                Object.values(bank.samples).some(
                  (s) => s.part === "keys" && s.note === e.note,
                ),
              );
          }
          assert.equal(
            t.events.some((e) => e.part === "keys"),
            style === "soul",
          );
          assert.equal(
            t.events.some((e) => e.part === "guitar"),
            true,
          );
          for (const part of ["bass", style === "soul" ? "keys" : "guitar"])
            assert.ok(
              new Set(
                t.events.filter((e) => e.part === part).map((e) => e.note % 12),
              ).size >= 4,
            );
        }
});
test("warm chord parts ring naturally rather than using the old short electric staccato samples", () => {
  const soul = arrange("soul", "steady", "major", 0, 84, 9),
    folk = arrange("folk", "steady", "major", 0, 88, 9);
  assert.ok(
    soul.events.filter((e) => e.part === "keys").every((e) => e.duration > 3.7),
  );
  assert.ok(
    folk.events
      .filter((e) => e.part === "guitar")
      .every((e) => e.articulation === "normal" && e.naturalReleaseOnly),
  );
  assert.ok(
    folk.events
      .filter((e) => e.part === "guitar")
      .reduce((s, e) => s + e.duration, 0) /
      folk.events.filter((e) => e.part === "guitar").length >
      1,
  );
});
