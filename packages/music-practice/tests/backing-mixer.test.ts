import assert from "node:assert/strict";
import test from "node:test";
import { backingGenres } from "../src/backing-genres";
import { backingPatterns } from "../src/backing-patterns";
import { genreBackingArrangement } from "../src/backing-genre-engine";
import {
  backingMixerLevels,
  backingMixerChannel,
  backingMixerControls,
  backingMixerKey,
} from "../src/backing-mixer";
import { decodeState, migrateLegacy } from "../src/durable-state";

test("mixer controls cover the instruments used by every genre and pattern", () => {
  for (const { id } of backingGenres) {
    const controls = backingMixerControls(id).map((c) => c.id);
    const used = new Set<string>(["metronome"]);
    for (const pattern of backingPatterns(id).length
      ? backingPatterns(id).map((p) => p.value)
      : [undefined])
      for (const mode of ["steady", "active"] as const)
        for (const quality of ["major", "minor"] as const)
          for (const event of genreBackingArrangement(
            id,
            mode,
            quality,
            0,
            90,
            0,
            pattern,
          ).events)
            used.add(backingMixerChannel(event));
    assert.deepEqual(new Set(controls), used, id);
  }
});

test("saved balances reject nonfinite values and preserve mute and boosts", () => {
  assert.ok(Object.values(backingMixerLevels()).every((v) => v === 100));
  assert.deepEqual(
    backingMixerLevels({
      levels: {
        bass: 0,
        guitar: 200,
        organ: 143.4,
        keys: -10,
        percussion: Infinity,
        drums: NaN,
      },
    }),
    {
      drums: 100,
      percussion: 100,
      bass: 0,
      guitar: 200,
      keys: 0,
      organ: 143,
      metronome: 100,
    },
  );
  assert.equal(backingMixerLevels({ levels: { bass: 500 } }).bass, 200);
  assert.deepEqual(backingMixerLevels(null), backingMixerLevels());
});

test("genre mixer checkpoints survive the shared save decoder independently", () => {
  const state = migrateLegacy({});
  state.activities[backingMixerKey("folk")] = {
    version: 1,
    levels: { bass: 0 },
  };
  state.activities[backingMixerKey("gospel")] = {
    version: 1,
    levels: { organ: 150 },
  };
  const decoded = decodeState(JSON.parse(JSON.stringify(state)));
  assert.equal(
    backingMixerLevels(decoded.activities[backingMixerKey("folk")]).bass,
    0,
  );
  assert.equal(
    backingMixerLevels(decoded.activities[backingMixerKey("gospel")]).organ,
    150,
  );
  assert.equal(
    backingMixerLevels(decoded.activities[backingMixerKey("rock")]).bass,
    100,
  );
});
