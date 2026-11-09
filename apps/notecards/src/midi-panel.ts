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
  element.innerHTML = `<p class="midi-status" role="status" aria-live="polite"></p><div class="midi-actions"><label class="midi-device" hidden>Input<select aria-label="MIDI input"></select></label><button class="midi-connect" type="button">Connect MIDI keyboard</button><button class="midi-disconnect" type="button" hidden>Disconnect</button></div>`;
  const status = element.querySelector<HTMLElement>(".midi-status")!;
  const choose = element.querySelector<HTMLElement>(".midi-device")!;
  const select = element.querySelector<HTMLSelectElement>("select")!;
  const connect = element.querySelector<HTMLButtonElement>(".midi-connect")!;
  const disconnect =
    element.querySelector<HTMLButtonElement>(".midi-disconnect")!;
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
    status.textContent = text[state];
    const signature = JSON.stringify(value.inputs);
    if (select.dataset.ports !== signature) {
      select.dataset.ports = signature;
      select.replaceChildren(
        new Option("Choose input", ""),
        ...value.inputs.map((p) => new Option(p.name, p.id)),
      );
    }
    select.value = value.selected;
    choose.hidden =
      value.inputs.length < 2 &&
      !(value.inputs.length === 1 && !value.selected);
    connect.hidden = ![
      "idle",
      "requesting",
      "opening",
      "denied",
      "error",
    ].includes(state);
    connect.disabled = state === "requesting" || state === "opening";
    connect.textContent = connect.disabled
      ? "Connecting…"
      : state === "denied" || state === "error"
        ? "Retry MIDI"
        : "Connect MIDI keyboard";
    disconnect.hidden = ["idle", "unsupported", "denied"].includes(state);
    element.classList.toggle("midi-connected", state === "connected");
    if (state !== previous) {
      previous = state;
      report(state);
    }
  }
  const keyboard = new MidiKeyboard(browserMidiRequest(), answer, render);
  let permission: PermissionStatus | undefined;
  connect.onclick = async () => {
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
  disconnect.onclick = () => keyboard.disconnect();
  select.onchange = () => {
    void keyboard.select(select.value);
  };
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
