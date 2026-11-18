import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  audioFingerprint,
  restoreSoundglowRecords,
  soundglowRecords,
  type SoundglowSettings,
  type Models,
} from "../src/account-records";
const require = createRequire(import.meta.url),
  feature = require("../dist/feature-state.js"),
  spectrum = require("../dist/settings-state.js");
const models: Models = { spectrogram: spectrum.create, pitch: feature.pitch };
function fixture(): SoundglowSettings {
  return {
    spectrogram: { ...spectrum.create(), presets: [] },
    workspace: {
      active: "pitch",
      pitch: feature.pitch(feature.presets.soundglow),
      selected: "soundglow",
      presets: [],
    },
    playback: { volume: 0.5, speed: 0.75 },
    bookmarks: [],
  };
}
test("settings and presets round-trip through canonical validators; local media and permission data never enter records", () => {
  const s = fixture();
  s.spectrogram.presets.push({
    id: "saved-123",
    name: "Voice",
    settings: { ...s.spectrogram.values, gain: "5" },
  });
  s.workspace.presets.push({
    id: "saved-456",
    name: "Practice",
    settings: feature.pitch({ ...s.workspace.pitch, targetLow: 200 }),
  });
  Object.assign(s, {
    microphone: "private-device",
    consent: true,
    blobs: ["AUDIO BYTES"],
    position: 123,
  });
  const records = soundglowRecords(s),
    restored = restoreSoundglowRecords(records, models);
  assert.equal(restored.spectrogram.presets[0].settings.gain, "5");
  assert.equal(restored.workspace.presets[0].settings.targetLow, 200);
  assert.deepEqual(restored.playback, s.playback);
  assert(!JSON.stringify(records).includes("private-device"));
  assert(!JSON.stringify(records).includes("AUDIO BYTES"));
  assert(!("consent" in records));
  assert.throws(() =>
    restoreSoundglowRecords({ ...records, schema: 2 }, models),
  );
  assert.throws(() =>
    restoreSoundglowRecords(
      {
        ...records,
        pitch: { values: { minimum: 999999 }, selected: "custom" },
      },
      models,
    ),
  );
  assert.throws(() =>
    restoreSoundglowRecords(
      { ...records, playback: { volume: 2, speed: 1 } },
      models,
    ),
  );
});
test("bookmarks refer to file content and can survive a device with no file; unsafe bounds are rejected", async () => {
  const s = fixture(),
    fingerprint = await audioFingerprint(new Blob(["abc"]));
  const b = {
    id: "bookmark-1",
    name: "Verse",
    file: { fingerprint, name: "Singing.wav", duration: 10, bytes: 3 },
    selection: { start: 1, end: 2 },
    viewStart: 0,
    viewSpan: 5,
    feature: "pitch" as const,
    speed: 1,
    addedAt: 10,
  };
  s.bookmarks.push(
    Object.assign(b, { fileId: "LOCAL-ONLY", blob: "PRIVATE AUDIO" }),
  );
  const records = soundglowRecords(s);
  assert(!JSON.stringify(records).includes("LOCAL-ONLY"));
  assert(!JSON.stringify(records).includes("PRIVATE AUDIO"));
  assert.equal(
    restoreSoundglowRecords(records, models).bookmarks[0].file.fingerprint,
    fingerprint,
  );
  assert.throws(() =>
    restoreSoundglowRecords(
      {
        ...records,
        "bookmark:bookmark-1": { ...b, selection: { start: 1, end: 11 } },
      },
      models,
    ),
  );
  assert.equal(await audioFingerprint(new Blob(["abc"])), fingerprint);
  assert.notEqual(await audioFingerprint(new Blob(["abd"])), fingerprint);
  // A boundary/middle change must differ too, while reads stay in 1 MiB chunks.
  const bytes = new Uint8Array(2 * 1024 * 1024 + 1),
    blob = new Blob([bytes]);
  let largest = 0;
  const slice = blob.slice.bind(blob);
  blob.slice = (start, end, ...rest) => {
    largest = Math.max(largest, (end || blob.size) - (start || 0));
    return slice(start, end, ...rest);
  };
  const hash = await audioFingerprint(blob);
  assert(largest <= 1024 * 1024);
  bytes[1024 * 1024] = 1;
  assert.notEqual(await audioFingerprint(new Blob([bytes])), hash);
});
test("concurrent preset deletion keeps the current display as custom", () => {
  const s = fixture();
  s.workspace.selected = "saved-deleted";
  s.spectrogram.selected = "saved-deleted";
  const restored = restoreSoundglowRecords(soundglowRecords(s), models);
  assert.equal(restored.workspace.selected, "custom");
  assert.equal(restored.spectrogram.selected, "custom");
});
