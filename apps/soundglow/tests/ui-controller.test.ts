import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { connectPitchSettings } from "../src/pitch-settings-controller";
import { settingIds, type PitchEdit, type PitchModel, type PitchValues, type SpectrogramEdit, type WorkspaceState } from "../src/settings-contracts";
const require = createRequire(import.meta.url);
const model: PitchModel & { restore(text: string | null): WorkspaceState } = require("../dist/feature-state.js");
const registry = require("../dist/settings-state.js");

function setup(initial = model.restore(null)) {
  let state = initial, writable = true, error: string | null = null, status = "", closed = 0, refreshed = 0, painted = 0;
  let edit!: PitchEdit, reset!: () => void;
  let handlers!: Parameters<Parameters<typeof connectPitchSettings>[0]["presets"]["connect"]>[0];
  let projection: PitchValues | undefined, resetDrafts: boolean | undefined;
  const controller = connectPitchSettings({
    ui: { connect(fn, clear) { edit = fn; reset = clear; }, publish(values, reset) { projection = values; resetDrafts = reset; }, setError(message) { error = message; } },
    presets: { connect(next) { handlers = next; }, publish() {}, status(message) { status = message; }, open() {}, close() { closed++; }, hideToast() {} },
    model, getState: () => state, setState(next) { state = next; }, persist: () => writable,
    refreshFile() { refreshed++; }, repaint() { painted++; }, resolution() {},
  });
  return { controller, edit: (...args: Parameters<PitchEdit>) => edit(...args), reset: () => reset(), handlers: () => handlers,
    readonly() { writable = false; }, writable() { writable = true; },
    snapshot: () => ({ state, error, status, closed, refreshed, painted, projection, resetDrafts }) };
}
test("checked settings identifiers match the real spectrogram registry", () => {
  assert.deepEqual([...settingIds].sort(), [...registry.ids].sort());
  for (const id of settingIds) assert.equal(typeof registry.defaults[id], "string");
});
test("pitch edits validate before projecting, reject invalid ranges and refresh only detection changes", () => {
  const app = setup(), before = app.snapshot().state;
  assert.equal(app.edit("minimum", 900), false);
  assert.deepEqual(app.snapshot().state, before); assert.match(app.snapshot().error!, /pitch settings/);
  assert.equal(app.edit("confidence", .6), true); assert.equal(app.snapshot().error, null);
  assert.equal(app.snapshot().state.pitch.confidence, .6); assert.equal(app.snapshot().refreshed, 0);
  app.edit("method", "filtered"); assert.equal(app.snapshot().refreshed, 1);
  app.reset(); assert.equal(app.snapshot().state.selected, "soundglow"); assert.equal(app.snapshot().refreshed, 2);
  app.controller.publish(true); assert.equal(app.snapshot().resetDrafts, true);
  assert.deepEqual(app.snapshot().projection, app.snapshot().state.pitch);
});
test("a failed live preset write keeps its original saved values and marks live settings unsaved", () => {
  const initial = model.save(model.restore(null), "Practice", "saved-test"), app = setup(initial);
  app.readonly(); assert.equal(app.edit("confidence", .65), true);
  const { state } = app.snapshot(); assert.equal(state.selected, "custom");
  assert.equal(state.pitch.confidence, .65); assert.deepEqual(state.presets, initial.presets);
});
test("failed preset writes can retry without closing or claiming success", () => {
  const app = setup(); app.readonly();
  assert.equal(app.handlers().save("Practice"), false); assert.equal(app.snapshot().closed, 0); assert.equal(app.snapshot().state.presets.length, 0);
  app.writable(); assert.equal(app.handlers().save("Practice"), true); assert.equal(app.snapshot().closed, 1);
  const saved = app.snapshot().state;
  app.readonly(); app.handlers().remove(); assert.deepEqual(app.snapshot().state, saved); assert.equal(app.snapshot().closed, 1);
  app.writable(); app.handlers().remove(); assert.equal(app.snapshot().state.presets.length, 0); assert.equal(app.snapshot().closed, 2);
});
test("model failures remain visible while the preset editor stays open", () => {
  const app = setup(); assert.equal(app.handlers().save(""), false); assert.equal(app.snapshot().closed, 0); assert(app.snapshot().status);
});
// Compile-time regressions: unknown fields and mismatched value types must fail.
function contractErrors(edit: PitchEdit, spectrogram: SpectrogramEdit) {
  // @ts-expect-error not a settings identifier
  edit("maximumm", 500);
  // @ts-expect-error numeric fields reject string commands
  edit("history", "10");
  // @ts-expect-error boolean fields reject numeric commands
  edit("bands", 1);
  // @ts-expect-error not a spectrogram setting
  spectrogram("unknown", "on");
}
void contractErrors;
