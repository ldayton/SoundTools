import { createElement } from "react";
import { mountPracticeSurface } from "./practice-surfaces";
import { MidiControls, midiControlsState } from "./midi-controls";
import {
  browserMidiRequest,
  MidiKeyboard,
  type MidiState,
  type MidiStatus,
} from "./midi-input";
/** Connection details stay in the page; only the categorical state reaches diagnostics. */
export function mountMidiPanel(
  element: HTMLElement,
  answer: (midi: number) => void,
  report: (state: MidiState) => void,
) {
  const model = midiControlsState({
    text: "",
    state: "idle",
    inputs: [],
    selected: "",
  });
  let previous: MidiState | undefined;
  let performanceMode = false;
  let latest: MidiStatus | undefined;
  function render(value: MidiStatus) {
    latest = value;
    const { state } = value;
    const text: Record<MidiState, string> = {
      idle: "Have a keyboard? Play your answers.",
      unsupported:
        "To use a MIDI keyboard, open this app in Chrome on a computer.",
      requesting: "Allow MIDI access in your browser.",
      opening: "Connecting to your keyboard…",
      waiting: value.inputs.length
        ? "Choose your MIDI input."
        : "Connect your keyboard by USB. It will appear here automatically.",
      connected: `${value.name} connected. ${performanceMode ? "Play at your own pace." : "Play one note at a time."}`,
      denied:
        "MIDI access wasn’t allowed. Allow it in your browser’s site settings, then retry.",
      error:
        "Couldn’t connect to the MIDI keyboard. Check the connection and retry.",
    };
    model.set({
      text: text[state],
      state,
      inputs: value.inputs,
      selected: value.selected,
    });
    if (state !== previous) {
      previous = state;
      report(state);
    }
  }
  const keyboard = new MidiKeyboard(browserMidiRequest(), answer, render);
  let permission: PermissionStatus | undefined;
  const connect = async () => {
    await keyboard.connect();
    if (!permission && navigator.permissions) {
      try {
        permission = await navigator.permissions.query({
          name: "midi" as PermissionName,
        });
        permission.addEventListener("change", () => {
          if (permission?.state === "denied") keyboard.permissionRevoked();
        });
      } catch {
        /* Permission observation is not supported by every browser. */
      }
    }
  };
  mountPracticeSurface(
    element,
    createElement(MidiControls, {
      model,
      connect,
      disconnect: () => keyboard.disconnect(),
      select: (value) => {
        void keyboard.select(value);
      },
    }),
  );
  return {
    setAccepting: (enabled: boolean) => keyboard.setAccepting(enabled),
    disconnect: () => keyboard.disconnect(),
    setPerformanceListener: (
      listener: (
        note: number,
        held: readonly number[],
        timestamp: number,
      ) => void,
    ) => keyboard.setPerformanceListener(listener),
    setPerformanceMode(enabled: boolean) {
      performanceMode = enabled;
      keyboard.setPerformanceMode(enabled);
      if (latest) render(latest);
    },
  };
}
