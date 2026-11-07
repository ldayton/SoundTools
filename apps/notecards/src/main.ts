import {
  deck,
  POSITIONS,
  KEYS,
  matches,
  name,
  ROUND_LENGTHS,
  type RoundLength,
  symbol,
  type Card,
  type Letter,
  type Modifier,
} from "./model";
import {
  MODES,
  STRINGS,
  guitarQuestions,
  isLocationMode,
  acceptsLocation,
  locations,
  locationLabel,
  type Mode,
  type GuitarCard,
} from "./guitar";
import { loadProgress, STORAGE_KEY } from "./progress";
import { PracticeSession } from "./session";
import { drawNotation, VexFlow } from "./notation";
import { Fretboard } from "./fretboard";
import "./style.css";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
let returnBoardFocus = false;
let raw: string | null = null;
try {
  raw = localStorage.getItem(STORAGE_KEY);
} catch {}
const progress = loadProgress(raw);
let phase: "loading" | "question" | "feedback" | "complete" | "empty" =
  "loading";
let session: PracticeSession<Card | GuitarCard>;
let modifier: Modifier = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  pendingNext = false;
const profile = () => progress.profiles[progress.mode];
$("#app").innerHTML =
  `<header><a class="brand" href="/" aria-label="Note by Note home"><span aria-hidden="true">♩</span> Note by Note<span class="dot">.</span></a><span class="family">SOUNDTOOLS</span></header>
<main><div class="intro"><p class="eyebrow">A LITTLE PRACTICE, EVERY DAY</p><h1>Get to know your notes.</h1></div>
<label class="mode-selector">Practice<select id="mode">${MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}</select></label>
<section class="practice" aria-label="Note recognition practice"><div class="card-top"><span id="context"></span><span id="counter"></span></div><progress id="progress" max="${progress.roundLength}" value="0" aria-label="Session progress"></progress>
<div id="question"><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div><div id="named-note" hidden><span id="target-name"></span><p id="target-string"></p></div><p id="string-prompt" hidden></p><div id="fretboard" hidden></div>
<div class="answer-line"><span id="feedback" role="status" aria-live="polite">Loading notation…</span></div>
<div class="keyboard" aria-label="Answer keyboard"><div class="modifiers" role="group" aria-label="Accidental"><button data-mod="-1" aria-label="Flat" aria-pressed="false">♭</button><button data-mod="0" aria-label="Natural" aria-pressed="true">♮</button><button data-mod="1" aria-label="Sharp" aria-pressed="false">♯</button></div><div class="letters" role="group" aria-label="Note letter">${"CDEFGAB"
    .split("")
    .map((l) => `<button data-letter="${l}">${l}</button>`)
    .join("")}</div></div>
<p class="hint" id="name-hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p><p class="hint location-hint" hidden>Choose a fret on the highlighted string.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p></div>
<div id="summary" hidden><p class="eyebrow">SESSION COMPLETE</p><h2>A little sharper.</h2><p id="result"></p><button id="continue" class="primary">Keep going <span aria-hidden="true">→</span></button><p class="summary-note" id="suggestion"></p></div></section>
<div class="below"><details><summary>Practice options</summary><label class="round-length">Exercises per round<select id="roundLength">${ROUND_LENGTHS.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label><label>Key<select id="key">${KEYS.map((k) => `<option value="${k.id}">${k.label}</option>`).join("")}</select></label>
<div class="range" id="pitch-range" role="group" aria-label="Sounding guitar pitch range">${(["low", "high"] as const).map((f) => `<label>${f === "low" ? "Lowest" : "Highest"}<select id="${f}">${POSITIONS.map((n) => `<option>${n}</option>`).join("")}</select></label>`).join("")}</div>
<div id="guitar-options" hidden><fieldset class="strings"><legend>Strings</legend>${[
    ...STRINGS,
  ]
    .reverse()
    .map(
      (s) =>
        `<button type="button" data-string-toggle="${s.number}" aria-label="String ${s.number}, ${s.name}" aria-pressed="false">${s.number}<small>${s.name}</small></button>`,
    )
    .join(
      "",
    )}</fieldset><div class="range">${(["minFret", "maxFret"] as const).map((f) => `<label>${f === "minFret" ? "Lowest fret" : "Highest fret"}<select id="${f}">${Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i === 0 ? "0 · Open" : i}</option>`).join("")}</select></label>`).join("")}</div><p class="tuning">Standard tuning · E A D G B E</p></div>
<p>Changing options starts a fresh session.</p></details><p id="saved" class="saved">Progress remembered on this device.</p></div></main><footer>One note at a time.</footer>`;
const board = new Fretboard($("#fretboard"), answerLocation);
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
    "[data-mod],[data-letter]",
  ))
    b.disabled = !enabled;
}
function syncOptions() {
  const p = profile();
  $<HTMLSelectElement>("#roundLength").value = String(progress.roundLength);
  $<HTMLSelectElement>("#mode").value = progress.mode;
  $<HTMLSelectElement>("#key").value = p.key;
  $("#pitch-range").hidden = progress.mode !== "staff";
  $("#guitar-options").hidden = progress.mode === "staff";
  for (const field of ["low", "high"] as const) {
    const select = $<HTMLSelectElement>("#" + field);
    select.value = p[field];
    for (const option of select.options)
      option.disabled =
        field === "low"
          ? POSITIONS.indexOf(option.value) > POSITIONS.indexOf(p.high)
          : POSITIONS.indexOf(option.value) < POSITIONS.indexOf(p.low);
  }
  for (const field of ["minFret", "maxFret"] as const) {
    const select = $<HTMLSelectElement>("#" + field);
    select.value = String(p[field]);
    for (const option of select.options)
      option.disabled =
        field === "minFret"
          ? Number(option.value) > p.maxFret
          : Number(option.value) < p.minFret;
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-string-toggle]",
  )) {
    const active = p.strings.includes(Number(b.dataset.stringToggle));
    b.setAttribute("aria-pressed", String(active));
    b.setAttribute("aria-disabled", String(active && p.strings.length === 1));
  }
  $("#context").textContent =
    "Guitar · " + KEYS.find((k) => k.id === p.key)!.label.split(" · ")[0];
}
function renderQuestion(card: Card | GuitarCard) {
  $("#question").classList.toggle("paired", progress.mode === "staff-find");
  const mode = progress.mode,
    location = isLocationMode(mode),
    notation = ["staff", "staff-find", "tab"].includes(mode);
  $("#notation").hidden = !notation;
  $("#named-note").hidden = mode !== "find";
  $("#string-prompt").hidden = mode !== "staff-find";
  $("#fretboard").hidden = mode === "staff" || mode === "tab";
  $(".keyboard").hidden = location;
  $("#name-hint").hidden = location;
  $(".location-hint").hidden = !location;
  if (notation) {
    $("#notation").setAttribute(
      "aria-label",
      mode === "tab"
        ? "Single guitar tab note to identify"
        : "Guitar treble clef with octave-down 8; identify the note",
    );
    drawNotation(
      $<HTMLDivElement>("#notation"),
      card,
      profile().key,
      mode === "tab",
    );
  }
  if (mode !== "staff") {
    const guitar = card as GuitarCard;
    const prompt = `On string ${guitar.string} · ${STRINGS.find((s) => s.number === guitar.string)!.name}`;
    $("#target-name").textContent = name(card);
    $("#target-string").textContent = prompt;
    $("#string-prompt").textContent = prompt;
    if (mode !== "tab") board.show(guitar, profile(), location);
  }
  $("#feedback").textContent = location
    ? "Find this note."
    : mode === "name"
      ? "Name the highlighted note."
      : "Name this note.";
  $("#feedback").className = "";
}
function next() {
  pendingNext = false;
  const card = session.next();
  if (!card) {
    if (session.complete) finish();
    return;
  }
  phase = "question";
  setModifier(0);
  renderQuestion(card);
  if (
    returnBoardFocus &&
    isLocationMode(progress.mode) &&
    (document.activeElement === document.body ||
      $("#fretboard").contains(document.activeElement))
  )
    board.focusAnswer();
  enableAnswers(true);
  $("#counter").textContent = `${session.answered + 1} / ${session.length}`;
}
function finish() {
  phase = "complete";
  $("#question").hidden = true;
  $("#summary").hidden = false;
  $("#counter").textContent = `${session.length} / ${session.length}`;
  $("#result").textContent = `${session.correct} of ${session.length} correct`;
  $("#suggestion").textContent = session.suggestion;
  $("#continue").focus({ preventScroll: true });
}
function feedback(correct: boolean, text: string) {
  if (!session.submit(correct)) return;
  phase = "feedback";
  save();
  enableAnswers(false);
  $("#feedback").textContent = text;
  $("#feedback").className = correct ? "correct" : "incorrect";
  $<HTMLProgressElement>("#progress").value = session.answered;
  timer = setTimeout(
    () => {
      if (document.hidden) pendingNext = true;
      else next();
    },
    correct ? 450 : 1600,
  );
}
function answerName(letter: Letter) {
  if (phase !== "question" || isLocationMode(progress.mode) || !session.current)
    return;
  const card = session.current,
    correct = matches(card, letter, modifier);
  feedback(
    correct,
    correct
      ? `Yes — ${name(card)}`
      : `That’s ${name(card)}. You answered ${letter}${symbol(modifier)}.`,
  );
}
function answerLocation(string: number, fret: number) {
  if (
    phase !== "question" ||
    !isLocationMode(progress.mode) ||
    !session.current
  )
    return;
  const card = session.current as GuitarCard;
  const correct = acceptsLocation(
    card,
    string,
    fret,
    progress.mode === "staff-find",
  );
  returnBoardFocus = $("#fretboard").contains(document.activeElement);
  board.feedback(
    fret,
    locations(card, profile(), progress.mode === "staff-find").map(
      (c) => c.fret,
    ),
  );
  const accepted = locations(card, profile(), progress.mode === "staff-find")
    .map((c) => (c.fret === 0 ? "open" : String(c.fret)))
    .join(" or ");
  feedback(
    correct,
    correct
      ? `Yes — ${name(card)}, ${locationLabel(string, fret).toLowerCase()}`
      : `${name(card)} is ${accepted === "open" ? "open" : `at fret ${accepted}`} on string ${string}. You chose ${fret === 0 ? "open" : `fret ${fret}`}.`,
  );
}
function start() {
  clearTimeout(timer);
  returnBoardFocus = false;
  pendingNext = false;
  syncOptions();
  $("#question").hidden = false;
  $("#summary").hidden = true;
  $<HTMLProgressElement>("#progress").value = 0;
  $<HTMLProgressElement>("#progress").max = progress.roundLength;
  const pool =
    progress.mode === "staff"
      ? deck(profile())
      : guitarQuestions(progress.mode, profile());
  session = new PracticeSession(pool, progress, progress.mode + ":");
  if (!pool.length) {
    phase = "empty";
    $("#notation").hidden = true;
    $("#named-note").hidden = true;
    $("#string-prompt").hidden = true;
    $("#fretboard").hidden = true;
    enableAnswers(false);
    $("#feedback").textContent =
      "No notes in this key and fret range. Choose more frets or another string.";
    $("#feedback").className = "incorrect";
    $("#counter").textContent = "";
    return;
  }
  next();
}
function changed() {
  syncOptions();
  save();
  if (phase !== "loading") start();
}
$<HTMLSelectElement>("#roundLength").onchange = (e) => {
  progress.roundLength = Number(
    (e.target as HTMLSelectElement).value,
  ) as RoundLength;
  changed();
};
$<HTMLSelectElement>("#mode").onchange = (e) => {
  progress.mode = (e.target as HTMLSelectElement).value as Mode;
  changed();
};
$<HTMLSelectElement>("#key").onchange = (e) => {
  profile().key = (e.target as HTMLSelectElement).value;
  changed();
};
for (const field of ["low", "high"] as const)
  $<HTMLSelectElement>("#" + field).onchange = (e) => {
    profile()[field] = (e.target as HTMLSelectElement).value;
    changed();
  };
for (const field of ["minFret", "maxFret"] as const)
  $<HTMLSelectElement>("#" + field).onchange = (e) => {
    profile()[field] = Number((e.target as HTMLSelectElement).value);
    changed();
  };
for (const b of document.querySelectorAll<HTMLButtonElement>(
  "[data-string-toggle]",
))
  b.onclick = () => {
    const strings = profile().strings,
      n = Number(b.dataset.stringToggle);
    if (strings.includes(n)) {
      if (strings.length === 1) return;
      profile().strings = strings.filter((s) => s !== n);
    } else strings.push(n);
    changed();
  };
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-letter]"))
  b.onclick = () => answerName(b.dataset.letter as Letter);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mod]"))
  b.onclick = () => {
    if (phase === "question") setModifier(Number(b.dataset.mod) as Modifier);
  };
$("#continue").onclick = start;
window.addEventListener("keydown", (event) => {
  // Native button activation also repeats on held Enter: suppress it before mode guards.
  if (
    event.repeat &&
    ["Enter", " "].includes(event.key) &&
    (event.target as HTMLElement).closest("button")
  ) {
    event.preventDefault();
    return;
  }
  if (
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    phase !== "question" ||
    isLocationMode(progress.mode)
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
    answerName(key as Letter);
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
syncOptions();
enableAnswers(false);
document.fonts.ready
  .then(() => {
    VexFlow.setFonts("Bravura", "Academico");
    start();
  })
  .catch(() => {
    $("#feedback").textContent =
      "Notation couldn’t load. Please reload to try again.";
  });
