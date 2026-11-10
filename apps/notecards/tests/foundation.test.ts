import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defaultProgress, loadProgress } from "../src/progress";
import {
  defaultProfile,
  mergeProfile,
  profileFromQuery,
} from "../src/exercise-settings";
import { FlashcardSessions } from "../src/flashcard-sessions";
import { deck } from "../src/model";
import { pianoDeck } from "../src/piano-model";
import {
  APP_ROUTE_ROOTS,
  EXERCISES,
  FLASHCARD_EXERCISES,
} from "../src/exercises";
import { mergePatternSettings } from "../src/patterns-model";
import { mergeRhythmSettings } from "../src/rhythm-model";
import {
  mergeHymnSettings,
  hymnSettingsFromQuery,
  type HymnSettings,
} from "../src/hymn-settings";

test("invalid URL fields retain remembered settings; valid overrides do not touch history or other activities", () => {
  const progress = defaultProgress();
  const base = { ...progress.profiles.piano, key: "G", low: "D4", high: "A5" };
  const merged = profileFromQuery(
    "piano",
    base,
    new URLSearchParams("key=invalid&low=C999&clef=invalid&show=name"),
  );
  assert.equal(merged.key, "G");
  assert.equal(merged.low, "D4");
  assert.equal(merged.staffLayout, "grand");
  assert.equal(merged.pianoPrompt, "name");
  assert.equal(base.pianoPrompt, undefined);
  assert.equal(
    profileFromQuery("piano", base, new URLSearchParams("low=B6&high=C2")).low,
    "D4",
  );
  const source = JSON.stringify({
    ...progress,
    profiles: { ...progress.profiles, piano: merged },
  });
  assert.deepEqual(loadProgress(source).profiles.piano, merged);
  assert.equal(
    mergeProfile("name", defaultProfile("name"), { naturalsOnly: false })
      .naturalsOnly,
    false,
  );
});
test("flashcard rounds resume independently; local changes invalidate one round and shared length changes invalidate all", () => {
  const progress = defaultProgress(),
    sessions = new FlashcardSessions();
  const staff = sessions.create(
    "staff",
    deck(progress.profiles.staff),
    progress,
    progress.profiles.staff,
  );
  staff.next(() => 0);
  staff.submit(true);
  staff.next(() => 0);
  const piano = sessions.create(
    "piano",
    pianoDeck(progress.profiles.piano),
    progress,
    progress.profiles.piano,
  );
  piano.next(() => 0);
  sessions.invalidate("piano");
  assert.equal(
    sessions.restore("staff", progress.profiles.staff, 12)?.session,
    staff,
  );
  assert.equal(staff.answered, 1);
  assert.equal(
    sessions.restore("piano", progress.profiles.piano, 12),
    undefined,
  );
  assert.equal(
    sessions.restore("staff", { ...progress.profiles.staff, key: "G" }, 12),
    undefined,
  );
  assert.equal(
    sessions.restore("staff", progress.profiles.staff, 24),
    undefined,
  );
  sessions.invalidateAll();
  assert.equal(
    sessions.restore("staff", progress.profiles.staff, 12),
    undefined,
  );
});
test("live preferences reject damaged values without borrowing unrelated flashcard defaults", () => {
  assert.deepEqual(
    mergePatternSettings(
      { key: "G", hand: "left", level: "skips" },
      { key: "bad", hand: 3, level: null },
    ),
    { key: "G", hand: "left", level: "skips" },
  );
  assert.deepEqual(
    mergeRhythmSettings(
      { bpm: 95, level: "long-short" },
      { bpm: 151, level: "bad" },
    ),
    { bpm: 95, level: "long-short" },
  );
  const hymn: HymnSettings = {
    hymn: "amazing-grace",
    arrangement: "bass",
    sectionBars: 2,
    section: 3,
    position: 4,
  };
  assert.deepEqual(
    hymnSettingsFromQuery(
      hymn,
      new URLSearchParams("arrangement=bad&bars=3&section=-1"),
    ),
    hymn,
  );
  assert.equal(
    mergeHymnSettings(hymn, { hymn: "amazing-grace", chords: true })
      .arrangement,
    "original",
  );
  assert.equal(
    mergeHymnSettings(hymn, { hymn: "amazing-grace", chords: true })
      .sectionBars,
    0,
  );
  assert.deepEqual(
    Object.keys(defaultProgress().profiles).sort(),
    FLASHCARD_EXERCISES.map((e) => e.mode).sort(),
  );
});
test("deployment rewrites cover every registered route scope and exclude asset routes", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  for (const root of APP_ROUTE_ROOTS)
    assert.ok(
      config.rewrites.some(
        (r: { source: string }) =>
          r.source === `/${root}/:path*` || r.source === `/${root}`,
      ),
      root,
    );
  assert.ok(
    !config.rewrites.some(
      (r: { source: string }) =>
        r.source.startsWith("/assets") || r.source.startsWith("/releases"),
    ),
  );
  assert.ok(
    EXERCISES.filter((e) => e.kind === "live").every(
      (e) => typeof e.load === "function",
    ),
  );
});
