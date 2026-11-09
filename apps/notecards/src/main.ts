import { pianoNotation } from "./piano-notation";
import { drawPianoNotation } from "./notation";
import { RangePicker } from "./range-picker";
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
import {
  signatureDeck,
  matchesSignature,
  signatureAnswer,
  type SignatureCard,
  type SignaturePractice,
} from "./key-signatures";
import { drawKeySignature, drawNotation, VexFlow } from "./notation";
import { mountMidiPanel } from "./midi-panel";
import { Piano } from "./piano";
import {
  PIANO_POSITIONS,
  pianoDeck,
  pianoBounds,
  pitch,
  acceptsPiano,
  keyLabel,
} from "./piano-model";
import { Fretboard } from "./fretboard";
import "./style.css";
import { setupOffline } from "./offline";
import {
  diagnostics,
  diagnosticsContext,
  mountDiagnostics,
} from "./diagnostics";
import type { SightReading } from "./sight-reading";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
let sight: SightReading | undefined;
let sightLoading: Promise<void> | undefined;
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
function syncDiagnosticsContext() {
  refreshMidiAcceptance();
  diagnosticsContext({
    mode: progress.mode,
    phase,
    roundLength: progress.roundLength,
    minFret: profile().minFret,
    maxFret: profile().maxFret,
    stringCount: profile().strings.length,
  });
}
$("#app").innerHTML =
  `<header><a class="brand" href="/" aria-label="Note by Note home"><img class="brand-icon" src="/icon.svg" width="32" height="32" alt="" /> Note by Note<span class="dot">.</span></a><span class="family">SOUNDTOOLS</span></header>
<main><div class="intro"><p class="eyebrow">A LITTLE PRACTICE, EVERY DAY</p><h1>Get to know your notes.</h1></div>
<label class="mode-selector">Practice<select id="mode">${MODES.map((m) => `<option value="${m.id}">${m.label}</option>`).join("")}</select></label>
<div id="sight-reading" hidden></div>
<section class="practice" aria-label="Note recognition practice"><div class="card-top"><span id="context"></span><span id="counter"></span></div><progress id="progress" max="${progress.roundLength}" value="0" aria-label="Session progress"></progress>
<div id="question"><p id="signature-prompt" hidden></p><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div><div id="named-note" hidden><span id="target-name"></span><p id="target-string"></p></div><p id="string-prompt" hidden></p><div id="fretboard" hidden></div>
<p id="piano-midi-required" class="piano-midi-required" role="status" hidden></p><div id="piano" hidden></div>
<div class="answer-line"><span id="feedback" role="status" aria-live="polite">Loading notation…</span></div>
<div class="keyboard" aria-label="Answer keyboard"><div class="modifiers" role="group" aria-label="Accidental"><button data-mod="-1" aria-label="Flat" aria-pressed="false">♭</button><button data-mod="0" aria-label="Natural" aria-pressed="true">♮</button><button data-mod="1" aria-label="Sharp" aria-pressed="false">♯</button></div><div class="letters" role="group" aria-label="Note letter">${"CDEFGAB"
    .split("")
    .map((l) => `<button data-letter="${l}">${l}</button>`)
    .join("")}</div></div>
<div id="midi-panel" hidden></div>
<p class="hint piano-hint" hidden>Choose the matching piano key.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p><p class="hint" id="name-hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p><p class="hint location-hint" hidden>Choose a fret on the highlighted string.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p></div>
<div id="summary" hidden><p class="eyebrow">SESSION COMPLETE</p><h2>A little sharper.</h2><p id="result"></p><button id="continue" class="primary">Keep going <span aria-hidden="true">→</span></button><p class="summary-note" id="suggestion"></p></div></section>
<div class="below"><details><summary>Practice options</summary><label class="round-length">Exercises per round<select id="roundLength">${ROUND_LENGTHS.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label><label id="key-setting">Key<select id="key">${KEYS.map((k) => `<option value="${k.id}">${k.label}</option>`).join("")}</select></label>
<label id="signature-practice-setting" hidden>Keys<select id="signaturePractice"><option value="major">Major only</option><option value="minor">Minor only</option><option value="both">Major & minor</option></select></label>
<label id="piano-prompt-setting" hidden>Show<select id="pianoPrompt"><option value="staff">Staff</option><option value="name">Note name</option></select></label>
<div id="piano-notation-options" hidden>
<label>Staff layout<select id="staffLayout"><option value="treble">Treble</option><option value="bass">Bass</option><option value="grand">Grand staff</option></select></label>
<label id="overlap-setting">Overlapping notes<select id="overlapPractice"><option value="standard">Standard placement</option><option value="both">Practice both clefs</option></select></label>
<label>Octave markings<select id="octavePractice"><option value="off">Off</option><option value="practice">Practice 8va/8vb</option></select></label>
<p class="notation-help">8va: play an octave higher than written. 8vb: play an octave lower. Pitch range always refers to the sounding notes.</p>
</div>
<label id="name-notes-setting" hidden>Notes<select id="nameNotes"><option value="all">All notes · sharps & flats</option><option value="naturals">Naturals only</option></select></label>
<div class="range" id="pitch-range" role="group" aria-label="Sounding guitar pitch range">${(["low", "high"] as const).map((f) => `<label>${f === "low" ? "Lowest" : "Highest"}<select id="${f}">${POSITIONS.map((n) => `<option>${n}</option>`).join("")}</select></label>`).join("")}</div>
<div class="range" id="piano-range" role="group" aria-label="Piano pitch range" hidden>${(["low", "high"] as const).map((f) => `<div><label for="${f}-spin">${f === "low" ? "Lowest" : "Highest"}</label><div class="note-field"><input id="${f}-spin" aria-label="${f === "low" ? "Lowest" : "Highest"} note" readonly /><button id="${f}-choose" type="button" aria-label="Choose ${f === "low" ? "lowest" : "highest"} note">⌄</button></div></div>`).join("")}</div>
<p id="piano-range-notice" class="piano-range-notice" hidden></p>
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
<p>Changing options starts a fresh session.</p></details><p id="saved" class="saved">Progress remembered on this device.</p></div><section class="offline-section" aria-label="Offline use"><h2>Take it with you</h2><p id="offline-status" role="status">Saving for offline use…</p><div class="offline-actions"><button id="offline-retry" type="button" hidden>Retry offline setup</button><button id="offline-update" type="button" hidden>Update available</button></div></section></main><footer>One note at a time.</footer>`;
mountDiagnostics(document.querySelector("main")!);
const board = new Fretboard($("#fretboard"), answerLocation);
const rangePickers = (["low", "high"] as const).map(
  (field) =>
    new RangePicker(
      $<HTMLInputElement>(`#${field}-spin`),
      $<HTMLButtonElement>(`#${field}-choose`),
      (value) => {
        profile()[field] = value;
        const other = field === "low" ? "high" : "low";
        if (
          PIANO_POSITIONS.indexOf(profile().low) >
          PIANO_POSITIONS.indexOf(profile().high)
        )
          profile()[other] = value;
        changed();
      },
    ),
);
const piano = new Piano($("#piano"), answerPiano);
const midi = mountMidiPanel(
  $("#midi-panel"),
  (note) => {
    if (!document.hidden && document.hasFocus()) answerPiano(note);
  },
  (state) => {
    if (state !== "connected") sight?.interrupted();
    diagnostics.event("midi.state", { midiState: state });
  },
);
midi.setPerformanceListener((note, held) => {
  if (progress.mode === "sight" && !document.hidden && document.hasFocus())
    sight?.answer(note, held);
});
function refreshMidiAcceptance() {
  midi.setAccepting(
    ((progress.mode === "piano" && phase === "question") ||
      (progress.mode === "sight" && sight?.listening === true)) &&
      !document.hidden &&
      document.hasFocus(),
  );
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    diagnostics.offline("storage", "failed", { cacheReason: "storage" });
    $("#saved").textContent = "Progress can’t be saved in this browser.";
  }
}
function setModifier(value: Modifier) {
  modifier = value;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-mod]"))
    b.setAttribute("aria-pressed", String(Number(b.dataset.mod) === value));
}
// Hover belongs to pointer movement on this question, never to the previous guess.
const answerSelector = "[data-letter],[data-fret],[data-piano]";
function clearAnswerHover() {
  for (const button of document.querySelectorAll(".answer-hover"))
    button.classList.remove("answer-hover");
}
$("#question").addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || phase !== "question") return;
  clearAnswerHover();
  const button = (event.target as Element).closest<HTMLButtonElement>(
    answerSelector,
  );
  if (
    button &&
    !button.disabled &&
    button.getAttribute("aria-disabled") !== "true"
  )
    button.classList.add("answer-hover");
});
$("#question").addEventListener("pointerleave", clearAnswerHover);
function enableAnswers(enabled: boolean) {
  for (const b of document.querySelectorAll<HTMLButtonElement>(
    "[data-mod],[data-letter]",
  ))
    b.disabled = !enabled;
}
function syncOptions() {
  const p = profile();
  const isSight = progress.mode === "sight";
  $("#sight-reading").hidden = !isSight;
  $(".practice").hidden = isSight;
  $(".below").hidden = isSight;
  $<HTMLSelectElement>("#roundLength").value = String(progress.roundLength);
  $<HTMLSelectElement>("#mode").value = progress.mode;
  $<HTMLSelectElement>("#key").value = p.key;
  const isPiano = progress.mode === "piano";
  const isSignature = progress.mode === "signature";
  $("#signature-practice-setting").hidden = !isSignature;
  $<HTMLSelectElement>("#signaturePractice").value =
    p.signaturePractice || "major";
  const positions = isPiano ? PIANO_POSITIONS : POSITIONS;
  $("#midi-panel").hidden = !isPiano && !isSight;
  if (isSight && sight) sight.midiSlot.append($("#midi-panel"));
  else if (!isSight) $("#question").append($("#midi-panel"));
  midi.setPerformanceMode(isSight);
  $("#piano-prompt-setting").hidden = !isPiano;
  $<HTMLSelectElement>("#pianoPrompt").value = p.pianoPrompt || "staff";
  $("#piano-notation-options").hidden = !isPiano || p.pianoPrompt === "name";
  $<HTMLSelectElement>("#staffLayout").value = p.staffLayout || "grand";
  $<HTMLSelectElement>("#overlapPractice").value =
    p.overlapPractice || "standard";
  $<HTMLSelectElement>("#octavePractice").value = p.octavePractice || "off";
  $("#overlap-setting").hidden = p.staffLayout !== "grand";
  $("#pitch-range").hidden = progress.mode !== "staff";
  $("#piano-range").hidden = !isPiano || p.pianoPrompt === "name";
  rangePickers.forEach((picker, i) => {
    picker.close();
    if (isPiano) picker.setValue(p[i === 0 ? "low" : "high"]);
  });
  $("#pitch-range").setAttribute(
    "aria-label",
    isPiano ? "Piano pitch range" : "Sounding guitar pitch range",
  );
  const [screenLow, screenHigh] = isPiano ? pianoBounds(p) : [60, 83];
  const midiOnlyRange =
    isPiano &&
    p.pianoPrompt !== "name" &&
    pianoDeck(p).some(
      (card) => pitch(card) < screenLow || pitch(card) > screenHigh,
    );
  $("#piano-range-notice").hidden = !midiOnlyRange;
  $("#piano-range-notice").textContent =
    `On-screen keys: ${keyLabel(screenLow)}–${keyLabel(screenHigh)}. Notes outside these keys require MIDI keyboard input. Connect your keyboard or choose a smaller range to answer on screen.`;
  $("#guitar-options").hidden =
    progress.mode === "staff" || isPiano || isSignature;
  $("#key-setting").hidden = progress.mode === "name" || isSignature;
  $("#name-notes-setting").hidden = progress.mode !== "name";
  $<HTMLSelectElement>("#nameNotes").value = p.naturalsOnly
    ? "naturals"
    : "all";
  for (const field of ["low", "high"] as const) {
    const select = $<HTMLSelectElement>("#" + field);
    if ([...select.options].map((o) => o.value).join() !== positions.join())
      select.innerHTML = positions.map((n) => `<option>${n}</option>`).join("");
    select.value = p[field];
    for (const option of select.options)
      option.disabled =
        field === "low"
          ? positions.indexOf(option.value) > positions.indexOf(p.high)
          : positions.indexOf(option.value) < positions.indexOf(p.low);
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
  $("#context").textContent = isSignature
    ? "Key signatures"
    : (isPiano ? "Piano · " : "Guitar · ") +
      (progress.mode === "name"
        ? p.naturalsOnly
          ? "Naturals only"
          : "All notes"
        : KEYS.find((k) => k.id === p.key)!.label.split(" · ")[0]);
}
function renderQuestion(card: Card | GuitarCard) {
  const renderStarted = performance.now();
  $("#question").classList.toggle("piano-question", progress.mode === "piano");
  $("#question").classList.toggle("paired", progress.mode === "staff-find");
  const mode = progress.mode,
    isPiano = mode === "piano",
    isSignature = mode === "signature",
    location = isLocationMode(mode),
    notation =
      ["staff", "staff-find", "tab", "signature"].includes(mode) ||
      (isPiano && profile().pianoPrompt !== "name");
  $("#notation").hidden = !notation;
  $("#named-note").hidden = mode !== "find" && !(isPiano && !notation);
  $("#string-prompt").hidden = mode !== "staff-find";
  $("#fretboard").hidden =
    mode === "staff" || mode === "tab" || isPiano || isSignature;
  $("#piano").hidden = !isPiano;
  $("#piano-midi-required").hidden = true;
  $(".piano-hint").hidden = !isPiano;
  $(".keyboard").hidden = location || isPiano;
  $("#name-hint").hidden = location || isPiano;
  $(".location-hint").hidden = !location;
  $("#signature-prompt").hidden = !isSignature;
  $("#question").classList.toggle("signature-question", isSignature);
  if (isSignature) {
    const signature = card as SignatureCard;
    $("#signature-prompt").textContent =
      signature.tonality === "major" ? "Major key" : "Minor key";
    $("#notation").setAttribute(
      "aria-label",
      `Treble clef key signature; identify the ${signature.tonality} key`,
    );
    drawKeySignature($<HTMLDivElement>("#notation"), signature.signature);
  } else if (isPiano && notation) {
    const representation = pianoNotation(card, profile());
    const label =
      representation.layout === "grand"
        ? "Grand staff"
        : `${representation.clef === "bass" ? "Bass" : "Treble"} clef`;
    const shift =
      representation.octaveShift === 12
        ? "; 8va, play one octave higher"
        : representation.octaveShift === -12
          ? "; 8vb, play one octave lower"
          : "";
    $("#notation").setAttribute(
      "aria-label",
      `${label}${shift}; find the sounding note on the piano`,
    );
    drawPianoNotation(
      $<HTMLDivElement>("#notation"),
      representation,
      profile().key,
    );
  } else if (notation) {
    $("#notation").setAttribute(
      "aria-label",
      mode === "tab"
        ? "Single guitar tab note to identify"
        : isPiano
          ? "Treble clef; find the note on the piano"
          : "Guitar treble clef with octave-down 8; identify the note",
    );
    drawNotation(
      $<HTMLDivElement>("#notation"),
      card,
      profile().key,
      mode === "tab",
      !isPiano,
    );
  }
  if (isPiano) {
    const named = profile().pianoPrompt === "name";
    const [low, high] = pianoBounds(profile());
    piano.show(low, high, named);
    const midiRequired = !named && (pitch(card) < low || pitch(card) > high);
    piano.setUnavailable(midiRequired);
    $("#piano-midi-required").hidden = !midiRequired;
    $("#piano-midi-required").textContent =
      "MIDI keyboard required — this note is outside the on-screen keys. Play it on your connected keyboard, or change the practice range.";
    $(".piano-hint").hidden = midiRequired;
    $("#target-name").textContent = name(card);
    $("#target-string").textContent = "";
  } else if (mode !== "staff" && !isSignature) {
    const guitar = card as GuitarCard;
    const prompt = `On string ${guitar.string} · ${STRINGS.find((s) => s.number === guitar.string)!.name}`;
    $("#target-name").textContent = name(card);
    $("#target-string").textContent = prompt;
    $("#string-prompt").textContent = prompt;
    if (mode !== "tab") board.show(guitar, profile(), location);
  }
  $("#feedback").textContent = isSignature
    ? `Name the ${(card as SignatureCard).tonality} key.`
    : isPiano
      ? "Find this note."
      : location
        ? "Find this note."
        : mode === "name"
          ? "Name the highlighted note."
          : "Name this note.";
  $("#feedback").className = "";
  diagnostics.metric("practice.render_ms", performance.now() - renderStarted);
}
function next() {
  pendingNext = false;
  const card = session.next();
  if (!card) {
    if (session.complete) finish();
    return;
  }
  phase = "question";
  syncDiagnosticsContext();
  setModifier(0);
  clearAnswerHover();
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
  syncDiagnosticsContext();
  diagnostics.event("practice.completed", { roundLength: session.length });
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
  syncDiagnosticsContext();
  diagnostics.event(correct ? "answer.correct" : "answer.incorrect");
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
  if (
    phase !== "question" ||
    progress.mode === "piano" ||
    progress.mode === "sight" ||
    isLocationMode(progress.mode) ||
    !session.current
  )
    return;
  const card = session.current;
  const isSignature = progress.mode === "signature";
  const correct = isSignature
    ? matchesSignature(card as SignatureCard, letter, modifier)
    : matches(card, letter, modifier);
  const target = isSignature
    ? signatureAnswer(card as SignatureCard)
    : name(card);
  feedback(
    correct,
    correct
      ? `Yes — ${target}`
      : `That’s ${target}. You answered ${letter}${symbol(modifier)}.`,
  );
}
function answerLocation(string: number, fret: number, keyboard: boolean) {
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
  returnBoardFocus =
    keyboard && $("#fretboard").contains(document.activeElement);
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
function answerPiano(midi: number) {
  if (phase !== "question" || progress.mode !== "piano" || !session.current)
    return;
  const card = session.current;
  const named = profile().pianoPrompt === "name";
  const correct = acceptsPiano(card, midi, profile().pianoPrompt);
  const correctMidi = named ? 60 + (pitch(card) % 12) : pitch(card);
  piano.feedback(named ? 60 + (midi % 12) : midi, correctMidi);
  const target = name(card) + (named ? "" : card.octave);
  feedback(
    correct,
    correct
      ? `Yes — ${target}`
      : `That’s ${target}. You chose ${keyLabel(midi, !named)}.`,
  );
}
function start(continuing = false) {
  clearTimeout(timer);
  pendingNext = false;
  sight?.setActive(progress.mode === "sight");
  if (progress.mode === "sight") {
    phase = "question";
    syncOptions();
    if (!sight && !sightLoading) {
      $("#sight-reading").textContent = "Loading hymns…";
      sightLoading = import("./sight-reading")
        .then(({ SightReading }) => {
          sight = new SightReading($("#sight-reading"), refreshMidiAcceptance);
          syncOptions();
          sight.setActive(progress.mode === "sight");
        })
        .catch((error) => {
          $("#sight-reading").textContent =
            "Hymns couldn’t load. Choose another practice mode, then try again.";
          diagnostics.capture(error, "sight_reading.load_failed");
        })
        .finally(() => {
          sightLoading = undefined;
        });
    }
    syncDiagnosticsContext();
    return;
  }
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
      : progress.mode === "piano"
        ? pianoDeck(profile())
        : progress.mode === "signature"
          ? signatureDeck(profile().signaturePractice)
          : guitarQuestions(progress.mode, profile());
  if (!continuing || !session?.continueRound())
    session = new PracticeSession(
      pool,
      progress,
      (progress.mode === "piano"
        ? "piano-" + (profile().pianoPrompt || "staff")
        : progress.mode) + ":",
    );
  if (!pool.length) {
    phase = "empty";
    syncDiagnosticsContext();
    $("#notation").hidden = true;
    $("#named-note").hidden = true;
    $("#string-prompt").hidden = true;
    $("#fretboard").hidden = true;
    $("#piano").hidden = true;
    $("#signature-prompt").hidden = true;
    $(".piano-hint").hidden = true;
    enableAnswers(false);
    $("#feedback").textContent =
      progress.mode === "name"
        ? "No natural notes in this fret range. Choose more frets or all notes."
        : "No notes in this key and fret range. Choose more frets or another string.";
    $("#feedback").className = "incorrect";
    $("#counter").textContent = "";
    return;
  }
  diagnostics.event("practice.started", { roundLength: progress.roundLength });
  next();
}
function changed() {
  diagnostics.event("practice.settings_changed");
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
$<HTMLSelectElement>("#signaturePractice").onchange = (e) => {
  profile().signaturePractice = (e.target as HTMLSelectElement)
    .value as SignaturePractice;
  changed();
};
$<HTMLSelectElement>("#pianoPrompt").onchange = (e) => {
  profile().pianoPrompt = (e.target as HTMLSelectElement).value as
    | "staff"
    | "name";
  changed();
};
for (const field of [
  "staffLayout",
  "overlapPractice",
  "octavePractice",
] as const)
  $<HTMLSelectElement>("#" + field).onchange = (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (field === "staffLayout")
      profile().staffLayout = value as "treble" | "bass" | "grand";
    if (field === "overlapPractice")
      profile().overlapPractice = value as "standard" | "both";
    if (field === "octavePractice")
      profile().octavePractice = value as "off" | "practice";
    changed();
  };
$<HTMLSelectElement>("#nameNotes").onchange = (e) => {
  profile().naturalsOnly = (e.target as HTMLSelectElement).value === "naturals";
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
$("#continue").onclick = () => start(true);
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
    isLocationMode(progress.mode) ||
    progress.mode === "piano" ||
    progress.mode === "sight"
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
window.addEventListener("blur", () => {
  sight?.interrupted();
  setModifier(0);
  midi.setAccepting(false);
});
window.addEventListener("focus", refreshMidiAcceptance);
window.addEventListener("pagehide", () => midi.disconnect());
document.addEventListener("visibilitychange", () => {
  sight?.interrupted();
  setModifier(0);
  refreshMidiAcceptance();
  if (!document.hidden && pendingNext) next();
});
syncOptions();
enableAnswers(false);
document.fonts.ready
  .then(() => {
    VexFlow.setFonts("Bravura", "Academico");
    start();
    window.dispatchEvent(new Event("soundtools:ready"));
    try {
      setupOffline();
    } catch (error) {
      $("#offline-status").textContent =
        "Offline setup isn’t available in this browser. Practice still works while connected.";
      diagnostics.offline("setup", "failed", {}, error);
    }
  })
  .catch((error) => {
    diagnostics.capture(error, "notation.startup_failed");
    $("#feedback").textContent =
      "Notation couldn’t load. Please reload to try again.";
  });
