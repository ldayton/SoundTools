import type { createPitchControls } from "./ui/pitch-controls";
import type { createPitchPresets } from "./ui/preset-controls";
import type { PitchEdit, PitchModel, WorkspaceState } from "./settings-contracts";

/** Checked command adapter. The existing feature model still validates and owns state. */
export function connectPitchSettings({ ui, presets, model, getState, setState, persist, refreshFile, repaint, resolution }: {
  ui: Pick<ReturnType<typeof createPitchControls>, "connect" | "publish" | "setError">;
  presets: Pick<ReturnType<typeof createPitchPresets>, "connect" | "publish" | "status" | "open" | "close" | "hideToast">;
  model: PitchModel;
  getState(): WorkspaceState;
  setState(state: WorkspaceState): void;
  persist(state?: WorkspaceState): boolean;
  refreshFile(): void;
  repaint(): void;
  resolution(): void;
}) {
  const message = (error: unknown) => error instanceof Error ? error.message : "Could not change pitch settings.";
  function publishPresets() {
    const state = getState();
    presets.publish(state.selected, [{ value: "soundglow", label: "Soundglow" }, { value: "praat", label: "Praat" }, ...state.presets.map(p => ({ value: p.id, label: p.name }))]);
    resolution();
  }
  function publish(resetDrafts = false) {
    publishPresets();
    ui.publish(getState().pitch, resetDrafts);
  }
  const edit: PitchEdit = (field, value) => {
    const previous = getState();
    const values = model.pitch(previous.pitch);
    values[field] = value;
    let invalid = false;
    try {
      const next = model.changed(previous, values);
      setState(next);
      if (next.pitch.method !== previous.pitch.method) refreshFile();
      ui.setError(null);
      if (persist()) presets.status("");
      else setState({ ...next, selected: "custom", presets: previous.presets });
      repaint();
    } catch (error) { invalid = true; ui.setError(message(error)); }
    publish(false);
    return !invalid;
  };
  function apply(id: string) {
    const previous = getState(), next = model.choose(previous, id);
    setState(next);
    if (previous.pitch.method !== next.pitch.method) refreshFile();
    ui.setError(null); persist(); publish(true); repaint();
  }
  function reset() {
    setState(model.choose(getState(), "soundglow")); refreshFile();
    ui.setError(null); persist(); publish(true); repaint();
  }
  presets.connect({
    choose: apply,
    open() {
      const state = getState(), saved = state.presets.find(p => p.id === state.selected);
      presets.status(""); presets.open({ name: saved?.name || "", title: saved ? "Edit pitch preset" : "Name pitch preset", canDelete: !!saved });
    },
    save(name) {
      try {
        const next = model.save(getState(), name, "saved-" + crypto.randomUUID());
        if (!persist(next)) return false;
        setState(next); publishPresets(); presets.status(""); presets.close(); return true;
      } catch (error) { presets.status(message(error)); return false; }
    },
    remove() {
      try {
        const next = model.remove(getState());
        if (!persist(next)) return;
        setState(next); ui.setError(null); publish(true); repaint(); presets.status(""); presets.close();
      } catch (error) { presets.status(message(error)); }
    },
    cancel() { presets.status(""); presets.close(); },
    dismiss() { presets.hideToast(); },
  });
  ui.connect(edit, reset);
  return { publish };
}
