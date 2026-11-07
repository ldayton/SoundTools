import {
  Renderer,
  Stave,
  StaveNote,
  Formatter,
  VexFlow,
  BarlineType,
} from "vexflow/bravura";
import {
  choose,
  deck,
  POSITIONS,
  KEYS,
  matches,
  name,
  readProgress,
  SESSION_SIZE,
  symbol,
  type Card,
  type Letter,
  type Modifier,
} from "./model";
import "./style.css";

const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const storageKey = "soundtools:notecards:v1";
let saved: string | null = null;
try {
  saved = localStorage.getItem(storageKey);
} catch {}
const { stats, settings } = readProgress(saved);
let current: Card,
  modifier: Modifier = 0,
  answered = 0,
  correct = 0;
let phase: "loading" | "question" | "feedback" | "complete" = "loading";
let recent: string[] = [],
  timer: ReturnType<typeof setTimeout> | undefined;
let pendingNext = false;
$("#app").innerHTML = `
<header><a class="brand" href="/" aria-label="Note by Note home"><span aria-hidden="true">♩</span> Note by Note<span class="dot">.</span></a><span class="family">SOUNDTOOLS</span></header>
<main><div class="intro"><p class="eyebrow">A LITTLE PRACTICE, EVERY DAY</p><h1>Get to know your notes.</h1></div>
<section class="practice" aria-label="Note recognition practice">
<div class="card-top"><span id="context">Guitar · ${KEYS.find((k) => k.id === settings.key)!.label.split(" · ")[0]}</span><span id="counter">1 / ${SESSION_SIZE}</span></div>
<progress id="progress" max="${SESSION_SIZE}" value="0" aria-label="Session progress"></progress>
<div id="question"><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div>
<div class="answer-line"><span id="feedback" role="status" aria-live="polite">Loading notation…</span></div>
<div class="keyboard" aria-label="Answer keyboard"><div class="modifiers" role="group" aria-label="Accidental"><button data-mod="-1" aria-label="Flat" aria-pressed="false">♭</button><button data-mod="0" aria-label="Natural" aria-pressed="true">♮</button><button data-mod="1" aria-label="Sharp" aria-pressed="false">♯</button></div><div class="letters" role="group" aria-label="Note letter">${"CDEFGAB"
  .split("")
  .map((l) => `<button data-letter="${l}">${l}</button>`)
  .join("")}</div></div>
<p class="hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p></div>
<div id="summary" hidden><p class="eyebrow">SESSION COMPLETE</p><h2>A little sharper.</h2><p id="result"></p><button id="continue" class="primary">Keep going <span aria-hidden="true">→</span></button><p class="summary-note">Another 12 notes, whenever you’re ready.</p></div>
</section>
<div class="below"><details><summary>Practice options</summary><label>Key<select id="key">${KEYS.map((k) => `<option value="${k.id}" ${k.id === settings.key ? "selected" : ""}>${k.label}</option>`).join("")}</select></label><div class="range" role="group" aria-label="Sounding guitar pitch range"><label>Lowest<select id="low">${POSITIONS.map((n) => `<option ${n === settings.low ? "selected" : ""}>${n}</option>`).join("")}</select></label><label>Highest<select id="high">${POSITIONS.map((n) => `<option ${n === settings.high ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><p>Changing options starts a fresh session.</p></details><p id="saved" class="saved">Progress remembered on this device.</p></div>
</main><footer>One note at a time.</footer>`;

function save() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ version: 2, stats, settings }),
    );
  } catch {
    $("#saved").textContent = "Progress can’t be saved in this browser.";
  }
}
function setModifier(value: Modifier) {
  modifier = value;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mod]"))
    b.setAttribute("aria-pressed", String(Number(b.dataset.mod) === value));
}
function enableAnswers(enabled: boolean) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mod], [data-letter]",
  ))
    b.disabled = !enabled;
}
function draw(card: Card) {
  const element = $<HTMLDivElement>("#notation");
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(600, 300);
  const context = renderer.getContext();
  context.setFillStyle("#302d55").setStrokeStyle("#302d55");
  const stave = new Stave(14, -2, 244);
  stave
    .addClef("treble", "default", "8vb")
    .addKeySignature(settings.key)
    .setBegBarType(BarlineType.NONE)
    .setEndBarType(BarlineType.NONE)
    .setContext(context)
    .draw();
  const note = new StaveNote({
    keys: [`${card.letter.toLowerCase()}/${card.octave + 1}`],
    duration: "w",
    clef: "treble",
    alignCenter: true,
  });
  Formatter.FormatAndDraw(context, stave, [note]);
  const svg = element.querySelector("svg")!;
  svg.setAttribute("viewBox", "0 0 600 300");
  svg.setAttribute("aria-hidden", "true");
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("transform", "scale(2.2)");
  while (svg.firstChild) group.append(svg.firstChild);
  svg.append(group);
}
function next() {
  pendingNext = false;
  if (answered >= SESSION_SIZE) {
    finish();
    return;
  }
  current = choose(deck(settings), stats, recent);
  recent.push(current.id);
  phase = "question";
  setModifier(0);
  draw(current);
  enableAnswers(true);
  $("#feedback").textContent = "Name this note.";
  $("#feedback").className = "";
  $("#counter").textContent = `${answered + 1} / ${SESSION_SIZE}`;
}
function finish() {
  phase = "complete";
  $("#question").hidden = true;
  $("#summary").hidden = false;
  $("#counter").textContent = `${SESSION_SIZE} / ${SESSION_SIZE}`;
  $("#result").textContent = `${correct} of ${SESSION_SIZE} correct`;
  $("#continue").focus({ preventScroll: true });
}
function answer(letter: Letter) {
  if (phase !== "question") return;
  const accepted = matches(current, letter, modifier);
  phase = "feedback";
  answered++;
  if (accepted) correct++;
  const s = (stats[current.id] ||= { attempts: 0, correct: 0 });
  s.attempts++;
  if (accepted) s.correct++;
  save();
  enableAnswers(false);
  $("#feedback").textContent = accepted
    ? `Yes — ${name(current)}`
    : `That’s ${name(current)}. You answered ${letter}${symbol(modifier)}.`;
  $("#feedback").className = accepted ? "correct" : "incorrect";
  $<HTMLProgressElement>("#progress").value = answered;
  timer = setTimeout(
    () => {
      if (document.hidden) pendingNext = true;
      else next();
    },
    accepted ? 450 : 1600,
  );
}
function start() {
  clearTimeout(timer);
  pendingNext = false;
  answered = correct = 0;
  $("#question").hidden = false;
  $("#summary").hidden = true;
  $<HTMLProgressElement>("#progress").value = 0;
  next();
}
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-letter]"))
  b.onclick = () => answer(b.dataset.letter as Letter);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mod]"))
  b.onclick = () => {
    if (phase === "question") setModifier(Number(b.dataset.mod) as Modifier);
  };
$("#continue").onclick = start;
$<HTMLSelectElement>("#key").onchange = (event) => {
  settings.key = (event.target as HTMLSelectElement).value;
  $("#context").textContent =
    "Guitar · " +
    KEYS.find((k) => k.id === settings.key)!.label.split(" · ")[0];
  recent = [];
  save();
  if (phase !== "loading") start();
};
function syncRange() {
  for (const field of ["low", "high"] as const) {
    const select = $<HTMLSelectElement>("#" + field);
    select.value = settings[field];
    for (const option of select.options)
      option.disabled =
        field === "low"
          ? POSITIONS.indexOf(option.value) > POSITIONS.indexOf(settings.high)
          : POSITIONS.indexOf(option.value) < POSITIONS.indexOf(settings.low);
  }
}
for (const field of ["low", "high"] as const)
  $<HTMLSelectElement>("#" + field).onchange = (event) => {
    settings[field] = (event.target as HTMLSelectElement).value;
    syncRange();
    recent = [];
    save();
    if (phase !== "loading") start();
  };
syncRange();
window.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    phase !== "question"
  )
    return;
  if (
    (event.target as HTMLElement).closest(
      'input, select, textarea, summary, [contenteditable="true"]',
    )
  )
    return;
  const key = event.key.toUpperCase();
  if (/^[A-G]$/.test(key)) {
    event.preventDefault();
    answer(key as Letter);
  } else if (
    ["ArrowUp", "+", "=", "ArrowDown", "-", "♭", "♯", "Escape", "0"].includes(
      event.key,
    )
  ) {
    event.preventDefault();
    setModifier(
      ["ArrowUp", "+", "=", "♯"].includes(event.key)
        ? 1
        : ["ArrowDown", "-", "♭"].includes(event.key)
          ? -1
          : 0,
    );
  }
});
window.addEventListener("blur", () => setModifier(0));
document.addEventListener("visibilitychange", () => {
  setModifier(0);
  if (!document.hidden && pendingNext) next();
});
enableAnswers(false);
// The Bravura entry bundles its fonts; there are no external font requests.
document.fonts.ready
  .then(() => {
    VexFlow.setFonts("Bravura", "Academico");
    start();
  })
  .catch(() => {
    $("#feedback").textContent =
      "Notation couldn’t load. Please reload to try again.";
  });
