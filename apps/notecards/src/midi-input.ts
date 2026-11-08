export type MidiState =
  | "unsupported"
  | "idle"
  | "requesting"
  | "waiting"
  | "opening"
  | "connected"
  | "denied"
  | "error";
export type MidiStatus = {
  state: MidiState;
  inputs: { id: string; name: string }[];
  selected: string;
  name: string;
};
export type MidiRequest = () => Promise<MIDIAccess>;
/** Only physical note gestures are accepted. No MIDI is sent or persisted. */
export class MidiKeyboard {
  private access?: MIDIAccess;
  private input?: MIDIInput;
  private selected = "";
  private preferredName = "";
  private generation = 0;
  private requesting = false;
  private opening = false;
  private held = new Set<number>();
  private accepting = false;
  private acceptAfter = Infinity;
  private state: MidiState;
  constructor(
    private request: MidiRequest | undefined,
    private answer: (midi: number) => void,
    private changed: (status: MidiStatus) => void,
    private now = () => performance.now(),
  ) {
    this.state = request ? "idle" : "unsupported";
    this.publish(this.state);
  }
  private ports() {
    return [...(this.access?.inputs.values() || [])].filter(
      (p) => p.state === "connected",
    );
  }
  private publish(state: MidiState) {
    this.state = state;
    this.changed({
      state,
      inputs: this.ports().map((p) => ({
        id: p.id,
        name: p.name || "MIDI keyboard",
      })),
      selected: this.input?.id || "",
      name: this.input?.name || "MIDI keyboard",
    });
  }
  setAccepting(enabled: boolean) {
    this.accepting = enabled;
    this.acceptAfter = enabled ? this.now() : Infinity;
  }
  async connect() {
    if (!this.request || this.requesting || this.opening) return;
    if (this.access) {
      this.state = "waiting";
      await this.refresh();
      return;
    }
    const token = ++this.generation;
    this.requesting = true;
    this.publish("requesting");
    try {
      const access = await this.request();
      if (token !== this.generation) return;
      this.access = access;
      this.requesting = false;
      access.onstatechange = () => {
        void this.refresh();
      };
      await this.refresh();
    } catch (error) {
      if (token !== this.generation) return;
      this.requesting = false;
      const name =
        error && typeof error === "object" && "name" in error ? error.name : "";
      this.publish(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : "error",
      );
    }
  }
  async select(id: string) {
    const port = this.ports().find((p) => p.id === id);
    if (!port) return;
    this.selected = id;
    this.preferredName = port.name || "";
    await this.attach(port);
  }
  private async refresh() {
    const ports = this.ports();
    // Do not retry a failing port on every connection-state notification.
    if (this.state === "error" && ports.some((p) => p.id === this.selected)) {
      this.publish("error");
      return;
    }
    let port = ports.find((p) => p.id === this.selected);
    if (!port && this.preferredName) {
      const matches = ports.filter((p) => p.name === this.preferredName);
      if (matches.length === 1) port = matches[0];
    }
    if (!this.selected) {
      // A named GO:KEYS port is a safer default than a virtual MIDI loopback.
      const roland = ports.filter((p) => /go[:\s-]*keys/i.test(p.name || ""));
      port =
        roland.length === 1
          ? roland[0]
          : ports.length === 1
            ? ports[0]
            : undefined;
    }
    if (port) {
      this.selected = port.id;
      this.preferredName = port.name || "";
    }
    if (
      port &&
      port === this.input &&
      !this.opening &&
      port.connection === "closed"
    ) {
      this.closeInput();
      this.publish("error");
      return;
    }
    if (port !== this.input) await this.attach(port);
    else
      this.publish(port ? (this.opening ? "opening" : "connected") : "waiting");
  }
  private closeInput() {
    const old = this.input;
    this.input = undefined;
    this.held.clear();
    this.opening = false;
    if (old) {
      old.onmidimessage = null;
      void old.close().catch(() => {});
    }
  }
  private async attach(port: MIDIInput | undefined) {
    if (port === this.input) return;
    const token = ++this.generation;
    this.closeInput();
    if (!port) {
      this.publish("waiting");
      return;
    }
    this.input = port;
    this.opening = true;
    this.publish("opening");
    try {
      await port.open();
      if (token !== this.generation || this.input !== port) {
        if (this.input !== port) await port.close().catch(() => {});
        return;
      }
      this.opening = false;
      // Ignore packets queued before this input finished opening.
      this.acceptAfter = this.accepting ? this.now() : Infinity;
      port.onmidimessage = (event) => {
        if (this.input === port && token === this.generation)
          this.message(event);
      };
      this.publish("connected");
    } catch {
      if (token !== this.generation) return;
      this.closeInput();
      this.publish("error");
    }
  }
  private message(event: MIDIMessageEvent) {
    const data = event.data;
    if (!data || data.length < 3) return;
    const [status, note, velocity] = data;
    if (status < 0x80 || status > 0xef || note > 127 || velocity > 127) return;
    const kind = status & 0xf0,
      key = (status & 0x0f) * 128 + note;
    if (kind === 0xb0 && (note === 120 || note === 123)) {
      const channel = status & 0x0f;
      for (const held of this.held)
        if (Math.floor(held / 128) === channel) this.held.delete(held);
    } else if (kind === 0x80 || (kind === 0x90 && velocity === 0)) {
      this.held.delete(key);
    } else if (kind === 0x90 && !this.held.has(key)) {
      const released = this.held.size === 0;
      this.held.add(key);
      // Notes received during feedback/background still latch until released.
      if (released && this.accepting && event.timeStamp >= this.acceptAfter)
        this.answer(note);
    }
  }
  disconnect() {
    this.stop(this.request ? "idle" : "unsupported");
  }
  permissionRevoked() {
    this.stop("denied");
  }
  private stop(state: MidiState) {
    ++this.generation;
    this.requesting = false;
    if (this.access) this.access.onstatechange = null;
    this.access = undefined;
    this.selected = this.preferredName = "";
    this.closeInput();
    this.publish(state);
  }
}
export function browserMidiRequest(): MidiRequest | undefined {
  try {
    if (
      !window.isSecureContext ||
      typeof navigator.requestMIDIAccess !== "function"
    )
      return;
    // No SysEx, software synths or MIDI outputs are needed for note recognition.
    return () => navigator.requestMIDIAccess({ sysex: false, software: false });
  } catch {
    return;
  }
}
