import { test } from "node:test";
import assert from "node:assert/strict";
import { deck, matches, readProgress, KEYS } from "../src/model";
test("treble deck covers staff or ledger range with no unsupported spellings", () => {
  const staff = deck({ low: "E3", high: "F4", key: "C" });
  assert.equal(staff.length, 9);
  assert.equal(staff[0].id, "E3:0");
  assert.equal(staff.at(-1)!.id, "F4:0");
  const full = deck({ low: "C3", high: "A4", key: "C" });
  assert.equal(full[0].id, "C3:0");
  assert.ok(full.some((c) => c.id === "A4:0"));
  assert.equal(new Set(full.map((c) => c.id)).size, full.length);
  assert.ok(
    !full.some((c) => ["E3:1", "B3:1", "C3:-1", "F3:-1"].includes(c.id)),
  );
});
test("answers compare pitch class, accepting enharmonics without octave", () => {
  for (const card of deck({ low: "C3", high: "A4", key: "C" }))
    assert.ok(matches(card, card.letter, card.modifier));
  assert.ok(
    matches({ id: "B3:-1", letter: "B", octave: 4, modifier: -1 }, "A", 1),
  );
  assert.ok(
    matches({ id: "C4:1", letter: "C", octave: 5, modifier: 1 }, "D", -1),
  );
  assert.ok(
    !matches({ id: "B3:-1", letter: "B", octave: 4, modifier: -1 }, "B", 0),
  );
});
test("saved progress is validated and damaged storage starts safely", () => {
  assert.deepEqual(readProgress("invalid").stats, {});
  const saved = readProgress(
    JSON.stringify({
      version: 2,
      stats: {
        "E3:0": { attempts: 3, correct: 2 },
        "A3:0": { attempts: 1, correct: 3 },
      },
      settings: { low: "C3", high: "A4", key: "C" },
    }),
  );
  assert.deepEqual(saved.stats, { "E3:0": { attempts: 3, correct: 2 } });
  assert.deepEqual(saved.settings, { low: "C3", high: "A4", key: "C" });
});

test("range reaches E2, excludes lower positions and supports a single note", () => {
  const cards = deck({ low: "E2", high: "A4", key: "C" });
  assert.equal(cards[0].id, "E2:0");
  assert.ok(cards.every((c) => c.octave >= 2));
  assert.deepEqual(
    deck({ low: "E2", high: "E2", key: "C" }).map((c) => c.id),
    ["E2:0"],
  );
  assert.throws(() => deck({ low: "D2", high: "A4", key: "C" }));
  assert.throws(() => deck({ low: "F4", high: "E3", key: "C" }));
});

test("written-pitch progress migrates to sounding guitar octaves without moving cards", () => {
  const saved = readProgress(
    JSON.stringify({
      version: 1,
      settings: { low: "E3", high: "A5" },
      stats: { "E4:0": { attempts: 2, correct: 1 } },
    }),
  );
  assert.equal(saved.settings.low, "E2");
  assert.equal(saved.settings.high, "A4");
  assert.deepEqual(saved.stats["E3:0"], { attempts: 2, correct: 1 });
});

test("every major key applies its signature to each letter without explicit accidentals", () => {
  for (const key of KEYS) {
    const cards = deck({ low: "C3", high: "B3", key: key.id });
    assert.equal(cards.length, 7);
    assert.equal(
      cards.filter((c) => c.modifier !== 0).length,
      Math.abs(key.count),
    );
    assert.ok(
      cards.every(
        (c) =>
          c.modifier ===
          ("FCGDAEB".slice(0, key.count).includes(c.letter) && key.count > 0
            ? 1
            : key.count < 0 && "BEADGCF".slice(0, -key.count).includes(c.letter)
              ? -1
              : 0),
      ),
    );
  }
  const sharp = deck({ low: "F3", high: "F3", key: "G" })[0];
  assert.ok(matches(sharp, "F", 1));
  assert.ok(matches(sharp, "G", -1));
  assert.ok(!matches(sharp, "F", 0));
  assert.equal(
    readProgress(JSON.stringify({ version: 2, settings: { key: "invalid" } }))
      .settings.key,
    "C",
  );
});
