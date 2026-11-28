// The established listening-page template, with data for ONE comparison only.
// No experiment archive, previous-comparison links, or persisted mix history.
const states = [];
let context, owner;
const clock = () => context ??= new AudioContext();
const format = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const position = s => s.node ? Math.min(s.duration, s.offset + Math.max(0, context.currentTime - s.anchor)) : s.offset;
const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`;
const playIcon = icon('<path fill="currentColor" d="M7 4v16l13-8z"/>');
const pauseIcon = icon('<path fill="currentColor" d="M6 4h4v16H6zm8 0h4v16h-4z"/>');
const startIcon = icon('<path fill="currentColor" d="M4 4h3v16H4zm16 0L8 12l12 8z"/>');

function update(s) {
  s.card.dataset.side = s.side;
  s.card.dataset.playing = String(s.playing);
  if (s.play.dataset.icon !== String(s.playing)) {
    s.play.innerHTML = s.playing ? pauseIcon : playIcon;
    s.play.dataset.icon = String(s.playing);
  }
  s.play.setAttribute("aria-label", `${s.playing ? "Pause" : "Play"} ${s.name}`);
  s.play.title = s.playing ? "Pause" : "Play";
  s.seek.value = position(s);
  s.time.textContent = `${format(position(s))} / ${format(s.duration)}`;
  s.card.querySelectorAll("[data-side]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.side === s.side)));
}
function stop(s) {
  if (!s.node) return;
  s.offset = position(s);
  s.node.onended = null;
  s.node.stop();
  s.node.disconnect();
  s.node = null;
}
function pause(s) {
  ++s.generation;
  stop(s);
  s.playing = false;
  s.status.textContent = "";
  update(s);
}
function activate(s) {
  if (owner === s) return;
  if (owner) {
    pause(owner);
    owner.controller.abort();
    owner.controller = new AbortController();
    owner.buffers.clear();
    owner.pending.clear();
    owner.card.dataset.ready = "false";
  }
  owner = s;
}
async function buffer(s, side) {
  if (s.buffers.has(side)) return s.buffers.get(side);
  if (s.pending.has(side)) return s.pending.get(side);
  const signal = s.controller.signal;
  const request = (async () => {
    const response = await fetch(s.files[side], {signal});
    if (!response.ok) throw Error(`Unable to load ${side}`);
    const decoded = await clock().decodeAudioData(await response.arrayBuffer());
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (Math.abs(decoded.duration - s.duration) > .001) throw Error("Clips are out of sync");
    s.buffers.set(side, decoded);
    s.card.dataset.ready = String(s.buffers.size === 2);
    return decoded;
  })();
  s.pending.set(side, request);
  try { return await request; }
  finally { if (s.pending.get(side) === request) s.pending.delete(side); }
}
function failure(s, error) {
  if (error.name === "AbortError") return;
  pause(s);
  s.status.textContent = error.message;
  s.status.classList.add("error");
}
async function start(s) {
  activate(s);
  stop(s);
  const generation = ++s.generation;
  s.status.textContent = s.buffers.has(s.side) ? "" : "Loading…";
  update(s);
  try {
    await clock().resume();
    const decoded = await buffer(s, s.side);
    if (generation !== s.generation || !s.playing || owner !== s) return;
    if (!s.gain) { s.gain = context.createGain(); s.gain.connect(context.destination); }
    s.gain.gain.value = Number(s.volume.value);
    const node = context.createBufferSource();
    node.buffer = decoded;
    node.connect(s.gain);
    s.node = node;
    s.anchor = context.currentTime + .015;
    node.onended = () => {
      if (s.node !== node) return;
      stop(s); s.offset = s.duration; s.playing = false; update(s);
    };
    node.start(s.anchor, s.offset);
    s.status.textContent = "";
    s.status.classList.remove("error");
    update(s);
    void buffer(s, s.side === "A" ? "B" : "A").catch(e => failure(s, e));
  } catch (error) { if (generation === s.generation) failure(s, error); }
}

try {
  const response = await fetch("comparison.json");
  if (!response.ok) throw Error("Missing comparison");
  const comparison = await response.json();
  for (const clip of comparison.clips) {
    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `<h2></h2><div class="buttons"><button aria-pressed="true" data-side="A">A · Before</button><button aria-pressed="false" data-side="B">B · After</button></div><div class="transport"><button class="restart" title="Return to start">${startIcon}</button><button class="play"></button><input class="seek" type="range" min="0" step=".01" value="0"><output class="time"></output><input class="volume" type="range" min="0" max="1" step=".01" value="1"></div><small class="source"></small><small class="status" role="status"></small>`;
    card.querySelector("h2").textContent = clip.name;
    card.querySelector(".source").textContent = clip.detail;
    document.querySelector("#grid").append(card);
    const s = {...clip, card, side:"A", offset:0, anchor:0, playing:false, node:null, gain:null, generation:0,
      controller:new AbortController(), buffers:new Map(), pending:new Map(),
      ...Object.fromEntries(["restart","play","seek","time","volume","status"].map(k => [k, card.querySelector("." + k)]))};
    states.push(s);
    s.seek.max = s.duration;
    s.seek.setAttribute("aria-label", `Seek ${s.name}`);
    s.volume.setAttribute("aria-label", `Volume ${s.name}`);
    s.restart.setAttribute("aria-label", `Return to start of ${s.name}`);
    s.restart.onclick = () => {
      stop(s); ++s.generation; s.offset = 0;
      if (s.playing) void start(s); else update(s);
    };
    s.play.onclick = () => {
      if (s.playing) { pause(s); return; }
      if (s.offset >= s.duration) s.offset = 0;
      s.playing = true; void start(s);
    };
    s.seek.oninput = () => {
      stop(s); s.offset = Number(s.seek.value);
      if (s.playing) void start(s); else { ++s.generation; update(s); }
    };
    s.volume.oninput = () => { if (s.gain) s.gain.gain.setTargetAtTime(Number(s.volume.value), context.currentTime, .015); };
    card.querySelectorAll("[data-side]").forEach(b => b.onclick = () => {
      if (s.side === b.dataset.side) return;
      stop(s); ++s.generation; s.side = b.dataset.side; update(s);
      if (s.playing) void start(s);
    });
    update(s);
  }
  window.__comparison = {states, position, baseline:comparison.baseline};
} catch (error) { document.querySelector("#error").textContent = error.message; }
function tick() { for (const s of states) if (s.node) update(s); requestAnimationFrame(tick); }
requestAnimationFrame(tick);
addEventListener("beforeunload", () => { for (const s of states) { pause(s); s.controller.abort(); } });
