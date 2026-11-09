import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MidiKeyboard,
  type MidiRequest,
  type MidiStatus,
} from "../src/midi-input";
function fixture(names = ["GO:KEYS 5"]) {
  let now = 100,
    calls = 0;
  const notes: number[] = [],
    states: MidiStatus[] = [];
  const inputs = new Map<string, MIDIInput>();
  const access = { inputs, onstatechange: null } as unknown as MIDIAccess;
  function port(name: string, id = name) {
    const p = {
      id,
      name,
      state: "connected",
      connection: "closed",
      onmidimessage: null,
      async open(this: { connection: string }) {
        this.connection = "open";
        return this;
      },
      async close(this: { connection: string }) {
        this.connection = "closed";
        return this;
      },
    } as unknown as MIDIInput;
    inputs.set(id, p);
    return p;
  }
  names.forEach((n) => port(n));
  const keyboard = new MidiKeyboard(
    async () => {
      calls++;
      return access;
    },
    (n) => notes.push(n),
    (s) => states.push(s),
    () => now,
  );
  const send = (data: number[], timeStamp = now, id = names[0]) =>
    inputs.get(id)?.onmidimessage?.call(inputs.get(id)!, {
      data: new Uint8Array(data),
      timeStamp,
    } as MIDIMessageEvent);
  return {
    keyboard,
    notes,
    states,
    inputs,
    access,
    port,
    send,
    now: () => ++now,
    calls: () => calls,
    change: async () => {
      access.onstatechange?.call(access, {} as MIDIConnectionEvent);
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}
test("MIDI requests are explicit; unsupported browsers do not try requesting", async () => {
  const f = fixture();
  assert.equal(f.calls(), 0);
  await f.keyboard.connect();
  assert.equal(f.calls(), 1);
  assert.equal(f.states.at(-1)?.state, "connected");
  const states: MidiStatus[] = [];
  const unsupported = new MidiKeyboard(
    undefined,
    () => assert.fail(),
    (s) => states.push(s),
  );
  await unsupported.connect();
  assert.equal(states.at(-1)?.state, "unsupported");
});
test("only fresh note-on gestures grade; held notes, chords, pedals and note-offs do not", async () => {
  const f = fixture();
  await f.keyboard.connect();
  f.keyboard.setAccepting(true);
  f.send([0x90, 60, 100]);
  f.send([0x90, 60, 100]); // repeated note-on while held
  f.keyboard.setAccepting(false);
  f.send([0x90, 64, 100]); // chord/second finger during feedback
  f.keyboard.setAccepting(true);
  f.send([0x90, 67, 100]); // still the same gesture after next card
  f.send([0xb0, 64, 127]); // sustain pedal
  f.send([0x80, 60, 0]);
  f.send([0x90, 64, 0]);
  f.send([0x80, 67, 0]);
  assert.deepEqual(f.notes, [60]);
  f.send([0x92, 61, 1]); // any MIDI channel; even a soft note counts
  assert.deepEqual(f.notes, [60, 61]);
});
test("hidden/feedback notes latch until released; stale queued packets never answer", async () => {
  const f = fixture();
  await f.keyboard.connect();
  f.keyboard.setAccepting(false);
  f.send([0x90, 60, 90]);
  f.now();
  f.keyboard.setAccepting(true);
  f.send([0x90, 60, 90]);
  assert.deepEqual(f.notes, []);
  f.send([0x80, 60, 0]);
  f.send([0x90, 61, 90], 50); // queued before activation
  assert.deepEqual(f.notes, []);
  f.send([0x80, 61, 0]);
  f.send([0x90, 62, 90]);
  assert.deepEqual(f.notes, [62]);
  f.send([0xb0, 123, 0]);
  f.send([0x90, 63, 90]);
  assert.deepEqual(f.notes, [62, 63]);
  for (const packet of [
    [0xfe],
    [0x90, 64],
    [0xb0, 1, 127],
    [0xe0, 1, 2],
    [0x90, 128, 90],
  ])
    f.send(packet);
  assert.deepEqual(f.notes, [62, 63]);
});
test("GO:KEYS is preferred, unrelated ports are not silently selected, and input changes detach old listeners", async () => {
  const f = fixture(["IAC loopback", "GO:KEYS 5"]);
  await f.keyboard.connect();
  assert.equal(f.states.at(-1)?.selected, "GO:KEYS 5");
  await f.keyboard.select("IAC loopback");
  assert.equal(f.inputs.get("GO:KEYS 5")?.onmidimessage, null);
  assert.equal(f.states.at(-1)?.selected, "IAC loopback");
  f.keyboard.disconnect();
  assert.equal(f.access.onstatechange, null);
  assert.equal(f.inputs.get("IAC loopback")?.onmidimessage, null);
  const ambiguous = fixture(["Keyboard A", "Keyboard B"]);
  await ambiguous.keyboard.connect();
  assert.equal(ambiguous.states.at(-1)?.state, "waiting");
});
test("hotplug and replug resume the intended keyboard, including a changed port ID", async () => {
  const f = fixture([]);
  await f.keyboard.connect();
  assert.equal(f.states.at(-1)?.state, "waiting");
  const first = f.port("GO:KEYS 5", "a");
  await f.change();
  assert.equal(f.states.at(-1)?.selected, "a");
  f.inputs.delete("a");
  await f.change();
  assert.equal(first.onmidimessage, null);
  assert.equal(f.states.at(-1)?.state, "waiting");
  f.port("GO:KEYS 5", "b");
  await f.change();
  assert.equal(f.states.at(-1)?.selected, "b");
});
test("permission errors are recoverable and cancelling a pending request cannot reconnect", async () => {
  let resolve!: (access: MIDIAccess) => void;
  const f = fixture();
  const states: MidiStatus[] = [];
  const pending = new MidiKeyboard(
    () => new Promise((r) => (resolve = r)),
    () => {},
    (s) => states.push(s),
  );
  const connected = pending.connect();
  pending.disconnect();
  resolve(f.access);
  await connected;
  assert.equal(states.at(-1)?.state, "idle");
  assert.equal(f.access.onstatechange, null);
  let denied = true;
  const retry = new MidiKeyboard(
    async () => {
      if (denied) throw { name: "NotAllowedError", message: "private" };
      return f.access;
    },
    () => {},
    (s) => states.push(s),
  );
  await retry.connect();
  assert.equal(states.at(-1)?.state, "denied");
  denied = false;
  await retry.connect();
  assert.equal(states.at(-1)?.state, "connected");
});
test("failed opening does not loop on state notifications; retry and cancel during opening work", async () => {
  const f = fixture();
  const port = f.inputs.values().next().value!;
  let attempts = 0;
  port.open = async () => {
    attempts++;
    throw Error("unavailable");
  };
  await f.keyboard.connect();
  assert.equal(f.states.at(-1)?.state, "error");
  await f.change();
  assert.equal(attempts, 1);
  port.open = async () => port;
  await f.keyboard.connect();
  assert.equal(f.states.at(-1)?.state, "connected");
  f.keyboard.disconnect();
  let resolve!: (input: MIDIInput) => void;
  port.open = () => new Promise((r) => (resolve = r));
  const connecting = f.keyboard.connect();
  await Promise.resolve();
  f.keyboard.disconnect();
  resolve(port);
  await connecting;
  assert.equal(f.states.at(-1)?.state, "idle");
  assert.equal(port.onmidimessage, null);
});

test("permission revocation immediately detaches inputs and requires a new connect action", async () => {
  const f = fixture();
  await f.keyboard.connect();
  f.keyboard.setAccepting(true);
  f.keyboard.permissionRevoked();
  assert.equal(f.states.at(-1)?.state, "denied");
  assert.equal(f.access.onstatechange, null);
  f.send([0x90, 60, 100]);
  assert.deepEqual(f.notes, []);
  await f.keyboard.connect();
  assert.equal(f.states.at(-1)?.state, "connected");
});

test("sight reading accepts legato and polyphony without weakening flashcard guards or re-arming on each note", async () => {
  const f = fixture();
  const gestures: { note: number; held: readonly number[] }[] = [];
  f.keyboard.setPerformanceListener((note, held) =>
    gestures.push({ note, held }),
  );
  await f.keyboard.connect();
  f.keyboard.setPerformanceMode(true);
  f.keyboard.setAccepting(true);
  f.send([0x90, 60, 100]);
  f.now();
  f.keyboard.setAccepting(true);
  f.send([0x90, 64, 100], 100); // Same queued timestamp remains valid throughout the continuous session.
  f.send([0x90, 67, 100]);
  f.send([0x90, 67, 100]);
  assert.deepEqual(gestures, [
    { note: 60, held: [60] },
    { note: 64, held: [60, 64] },
    { note: 67, held: [60, 64, 67] },
  ]);
  assert.deepEqual(f.notes, []);
  f.keyboard.setAccepting(false);
  f.send([0x80, 60, 0]);
  f.send([0x90, 62, 100]);
  assert.equal(gestures.length, 3);
  f.keyboard.setAccepting(true);
  f.send([0x90, 62, 100]);
  assert.equal(gestures.length, 3);
  f.send([0x80, 62, 0]);
  f.send([0x90, 62, 100]);
  assert.equal(gestures.length, 4);
  f.keyboard.setPerformanceMode(false);
  f.send([0x90, 65, 100]);
  assert.deepEqual(f.notes, []);
  for (const n of [60, 62, 64, 65, 67]) f.send([0x80, n, 0]);
  f.send([0x90, 65, 100]);
  assert.deepEqual(f.notes, [65]);
});
