// Browser-only MIDI substitute. No test hooks are included in the application.
// Keep musical draws near zero without giving every library-generated ID the
// same value. A constant zero breaks Mantine's popup/label associations.
let randomDraw = 0;
Math.random = () => ++randomDraw / 1e12;
let calls = 0,
  denied = false;
const options = [],
  inputs = new Map();
const access = { inputs, onstatechange: null };
function add(name, id) {
  const port = {
    name,
    id,
    state: "connected",
    connection: "closed",
    onmidimessage: null,
    async open() {
      this.connection = "open";
      return this;
    },
    async close() {
      this.connection = "closed";
      return this;
    },
  };
  inputs.set(id, port);
  access.onstatechange?.();
}
add("GO:KEYS 5", "roland");
Object.defineProperty(navigator, "requestMIDIAccess", {
  configurable: true,
  value: async (value) => {
    calls++;
    options.push(value);
    if (denied) throw new DOMException("private detail", "NotAllowedError");
    return access;
  },
});
const permission = new EventTarget();
permission.state = "granted";
const query = navigator.permissions.query.bind(navigator.permissions);
Object.defineProperty(navigator.permissions, "query", {
  value: (descriptor) =>
    descriptor.name === "midi"
      ? Promise.resolve(permission)
      : query(descriptor),
});
window.midiTest = {
  revoke() {
    denied = true;
    permission.state = "denied";
    permission.dispatchEvent(new Event("change"));
  },
  send(data, id = "roland", timeStamp = performance.now()) {
    inputs.get(id)?.onmidimessage?.({ data: new Uint8Array(data), timeStamp });
  },
  remove(id) {
    inputs.delete(id);
    access.onstatechange?.();
  },
  add,
  deny(value) {
    denied = value;
    permission.state = value ? "denied" : "granted";
  },
  calls: () => calls,
  options,
};
