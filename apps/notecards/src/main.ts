import { mountAppShell } from "./app-shell";
import { mountFlashcardView } from "./flashcard-view";
import { ActivityHost } from "./activity-host";
import { FlashcardSessions } from "./flashcard-sessions";
import { profileFromQuery } from "./exercise-settings";
import { isFlashcardMode, type Mode } from "./exercises";
import { pianoNotation } from "./piano-notation";
import { drawPianoNotation, pianoPracticeFrame } from "./notation";
import { RangePicker } from "./range-picker";
import {
  deck,
  POSITIONS,
  KEYS,
  matches,
  name,
  type RoundLength,
  symbol,
  type Card,
  type Letter,
  type Modifier,
} from "./model";
import {
  STRINGS,
  guitarQuestions,
  isLocationMode,
  acceptsLocation,
  locations,
  locationLabel,
  type GuitarCard,
} from "./guitar";
import { defaultProgress } from "./progress";
import { persistence } from "./persistence";
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
import "./workspace.css";
import "./styles/controls.css";
import { setupOffline } from "./offline";
import {
  diagnostics,
  diagnosticsContext,
  mountDiagnostics,
} from "./diagnostics";
import { exercise, readRoute, type PracticeRoute } from "./navigation";
import { isLiveMode } from "./live-practice";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const activities = new ActivityHost({
  element: (mode) => shell.activityElement(mode),
  changed: refreshMidiAcceptance,
  missing: showMissing,
  failed: (error) => diagnostics.capture(error, "practice.load_failed"),
});
const activePractice = () => activities.active;
const sessions = new FlashcardSessions();
let fontsReady = false;
let returnBoardFocus = false;
let progress = defaultProgress();
let route = readRoute(new URL(location.href), progress.mode);
if (route.kind === "exercise") progress.mode = route.mode;
function routePreferences(value: PracticeRoute) {
  if (isFlashcardMode(value.mode))
    progress.profiles[value.mode] = profileFromQuery(
      value.mode,
      progress.profiles[value.mode],
      value.query,
    );
}
if (route.kind === "exercise") routePreferences(route);
let phase: "loading" | "question" | "feedback" | "complete" | "empty" =
  "loading";
let session: PracticeSession<Card | GuitarCard>;
let modifier: Modifier = 0,
  timer: ReturnType<typeof setTimeout> | undefined,
  pendingNext = false;
const profile = () => {
  if (!isFlashcardMode(progress.mode))
    throw Error("This activity owns its own settings");
  return progress.profiles[progress.mode];
};
function syncDiagnosticsContext() {
  refreshMidiAcceptance();
  diagnosticsContext({
    mode: progress.mode,
    phase,
    roundLength: progress.roundLength,
    ...(isFlashcardMode(progress.mode)
      ? {
          minFret: profile().minFret,
          maxFret: profile().maxFret,
          stringCount: profile().strings.length,
        }
      : {}),
  });
}
const shell = mountAppShell($("#app"), {
  navigate: visit,
  interrupt: (reason) => activities.interrupt(reason),
  inputChanged: refreshMidiAcceptance,
});
mountFlashcardView($("#flashcards"), progress.roundLength);
mountDiagnostics($(".privacy-settings"));
document.querySelector("main")!.inert = true;
const board = new Fretboard($("#fretboard"), answerLocation);
const rangePickers = [
  ...(["low", "high"] as const).map((field) => ({
    field,
    prefix: "",
    positions: PIANO_POSITIONS,
  })),
  ...(["low", "high"] as const).map((field) => ({
    field,
    prefix: "staff-",
    positions: POSITIONS,
  })),
].map(({ field, prefix, positions }) => ({
  field,
  prefix,
  picker: new RangePicker(
    $<HTMLInputElement>(`#${prefix}${field}-spin`),
    $<HTMLButtonElement>(`#${prefix}${field}-choose`),
    (value) => {
      profile()[field] = value;
      const other = field === "low" ? "high" : "low";
      if (positions.indexOf(profile().low) > positions.indexOf(profile().high))
        profile()[other] = value;
      changed();
    },
    positions,
  ),
}));
const piano = new Piano($("#piano"), answerPiano, refreshPianoRange);
const midi = mountMidiPanel(
  $("#midi-panel"),
  (note) => {
    if (!document.hidden && document.hasFocus()) answerPiano(note);
  },
  (state) => {
    if (state !== "connected") activities.interrupt("connection");
    shell.reportMidi(state);
    diagnostics.event("midi.state", { midiState: state });
  },
);
midi.setPerformanceListener((note, held, timestamp) => {
  if (isLiveMode(progress.mode) && !document.hidden && document.hasFocus())
    activePractice()?.answer(note, held, timestamp);
});
function refreshMidiAcceptance() {
  midi.setAccepting(
    persistence.writable &&
      route.kind === "exercise" &&
      !shell.inputBlocked &&
      ((progress.mode === "piano" && phase === "question") ||
        (isLiveMode(progress.mode) &&
          activePractice()?.inputPolicy !== undefined &&
          activePractice()?.inputPolicy !== "none")) &&
      !document.hidden &&
      document.hasFocus(),
  );
}
function refreshPianoRange() {
  if (progress.mode !== "piano") return;
  const named = profile().pianoPrompt === "name";
  const [low, high] = piano.visibleBounds;
  const outside =
    !named && pianoDeck(profile()).some((card) => !piano.contains(pitch(card)));
  $("#piano-range-notice").hidden = !outside;
  $("#piano-range-notice").textContent =
    `On-screen keys: ${keyLabel(low)}–${keyLabel(high)}. Notes outside these keys require MIDI keyboard input.`;
  const required =
    !named && !!session?.current && !piano.contains(pitch(session.current));
  piano.setUnavailable(phase !== "question" || required);
  $("#piano-midi-required").hidden = !required;
  $("#piano-midi-required").textContent =
    "MIDI keyboard required — this note is outside the on-screen keys. Play it on your connected keyboard, or change the practice range.";
  $(".piano-hint").hidden = required;
}
function save() {
  if (!persistence.writable) return Promise.resolve(false);
  if (!isLiveMode(progress.mode) && session)
    persistence.state.activities[progress.mode] = {
      version: 1,
      settings: JSON.stringify(profile()),
      session: session.snapshot(),
    };
  return persistence.save();
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
  const isLive = isLiveMode(progress.mode);
  $<HTMLSelectElement>("#roundLength").value = String(progress.roundLength);
  shell.render(route, progress.mode);
  midi.setPerformanceMode(isLive);
  if (isLive) return;
  const p = profile();
  $<HTMLSelectElement>("#key").value = p.key;
  const isPiano = progress.mode === "piano";
  const isSignature = progress.mode === "signature";
  $("#signature-practice-setting").hidden = !isSignature;
  $<HTMLSelectElement>("#signaturePractice").value =
    p.signaturePractice || "major";
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
  rangePickers.forEach(({ picker, prefix, field }) => {
    picker.close();
    if (prefix ? progress.mode === "staff" : isPiano) picker.setValue(p[field]);
  });
  $("#pitch-range").setAttribute(
    "aria-label",
    isPiano ? "Piano pitch range" : "Sounding guitar pitch range",
  );
  $("#guitar-options").hidden =
    progress.mode === "staff" || isPiano || isSignature;
  $("#key-setting").hidden = progress.mode === "name" || isSignature;
  $("#name-notes-setting").hidden = progress.mode !== "name";
  $<HTMLSelectElement>("#nameNotes").value = p.naturalsOnly
    ? "naturals"
    : "all";
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
    const representation = (session.representation ||= pianoNotation(
      card,
      profile(),
    ));
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
      pianoPracticeFrame(profile()),
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
    refreshPianoRange();
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
  clearTimeout(timer);
  if (!persistence.writable) return;
  $("#feedback-next").hidden = true;
  pendingNext = false;
  const card = session.next();
  if (!card) {
    if (session.complete) {
      finish();
      save();
    }
    return;
  }
  phase = "question";
  syncDiagnosticsContext();
  setModifier(0);
  clearAnswerHover();
  renderQuestion(card);
  save();
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
function finish(announce = true) {
  phase = "complete";
  syncDiagnosticsContext();
  if (announce)
    diagnostics.event("practice.completed", { roundLength: session.length });
  $("#question").hidden = true;
  $("#summary").hidden = false;
  $("#counter").textContent = `${session.length} / ${session.length}`;
  $("#result").textContent = `${session.correct} of ${session.length} correct`;
  $("#suggestion").textContent = session.suggestion;
  $("#continue").focus({ preventScroll: true });
}
function feedback(correct: boolean, text: string) {
  if (!persistence.writable || !session.submit(correct)) return;
  session.feedback = { correct, text };
  phase = "feedback";
  syncDiagnosticsContext();
  diagnostics.event(correct ? "answer.correct" : "answer.incorrect");
  const committed = save();
  enableAnswers(false);
  $("#feedback").textContent = text;
  $("#feedback").className = correct ? "correct" : "incorrect";
  $<HTMLProgressElement>("#progress").value = session.answered;
  $("#feedback-next").hidden = false;
  const answeredSession = session,
    answerNumber = session.answered;
  void committed.then((saved) => {
    if (
      !saved ||
      session !== answeredSession ||
      session.answered !== answerNumber ||
      phase !== "feedback"
    )
      return;
    timer = setTimeout(
      () => {
        if (
          !document.hidden &&
          document.hasFocus() &&
          session === answeredSession &&
          session.answered === answerNumber &&
          phase === "feedback"
        )
          next();
      },
      correct ? 450 : 1600,
    );
  });
}
function answerName(letter: Letter) {
  if (!persistence.writable) return;
  if (
    route.kind !== "exercise" ||
    shell.inputBlocked ||
    phase !== "question" ||
    progress.mode === "piano" ||
    isLiveMode(progress.mode) ||
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
  if (!persistence.writable) return;
  if (
    route.kind !== "exercise" ||
    shell.inputBlocked ||
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
  if (!persistence.writable) return;
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
function start(continuing = false, restoring = false, restart = false) {
  clearTimeout(timer);
  $("#feedback-next").hidden = true;
  pendingNext = false;
  syncOptions();
  void activities.activate(route);
  if (route.kind !== "exercise") {
    refreshMidiAcceptance();
    return;
  }
  if (isLiveMode(progress.mode)) {
    phase = "question";
    syncOptions();
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
  if (!restoring && (!continuing || !session?.continueRound())) {
    const cached = !restart
      ? sessions.restore(progress.mode, profile(), progress.roundLength)
      : undefined;
    session =
      cached?.session ||
      sessions.create(
        progress.mode,
        pool,
        progress,
        profile(),
        !restart ? persistence.read(progress.mode) : undefined,
        (checkpoint) => {
          persistence.state.legacy["recovery:" + progress.mode] =
            structuredClone(checkpoint);
          $("#persistence-notice").hidden = false;
          $("#persistence-notice").textContent =
            "This activity checkpoint could not be restored. Its original data is preserved; this round starts again.";
        },
      );
    restoring = !!session.current || session.complete;
    phase = session.current ? session.status : "question";
  }
  $<HTMLSelectElement>("#roundLength").value = String(session.length);
  $<HTMLProgressElement>("#progress").max = session.length;
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
  if (restoring && session.complete) finish(false);
  else if (restoring && session.current) {
    phase = session.status === "feedback" ? "feedback" : "question";
    $("#counter").textContent =
      `${Math.min(session.answered + (phase === "question" ? 1 : 0), session.length)} / ${session.length}`;
    $<HTMLProgressElement>("#progress").value = session.answered;
    setModifier(0);
    clearAnswerHover();
    renderQuestion(session.current);
    enableAnswers(phase === "question");
    $("#feedback-next").hidden = phase !== "feedback";
    if (phase === "feedback" && session.feedback) {
      $("#feedback").textContent = session.feedback.text;
      $("#feedback").className = session.feedback.correct
        ? "correct"
        : "incorrect";
      piano.setUnavailable(true);
    }
    syncDiagnosticsContext();
  } else {
    diagnostics.event("practice.started", {
      roundLength: progress.roundLength,
    });
    next();
  }
  void save();
}
function changed(scope: "exercise" | "all" = "exercise") {
  if (scope === "all") sessions.invalidateAll();
  else if (isFlashcardMode(progress.mode)) sessions.invalidate(progress.mode);
  writePreferences();
  diagnostics.event("practice.settings_changed");
  syncOptions();
  if (phase !== "loading") {
    session = undefined!;
    start(false, false, true);
  }
}
$<HTMLSelectElement>("#roundLength").onchange = (e) => {
  progress.roundLength = Number(
    (e.target as HTMLSelectElement).value,
  ) as RoundLength;
  changed("all");
};
$<HTMLSelectElement>("#signaturePractice").onchange = (e) => {
  profile().signaturePractice = (e.target as HTMLSelectElement)
    .value as SignaturePractice;
  changed();
};
$<HTMLSelectElement>("#pianoPrompt").onchange = (e) => {
  profile().pianoPrompt = (e.target as HTMLSelectElement).value as
    "staff" | "name";
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
$("#feedback-next").onclick = () => next();
$("#restart-round").onclick = () => {
  if (isFlashcardMode(progress.mode)) sessions.invalidate(progress.mode);
  session = undefined!;
  start(false, false, true);
};
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
    route.kind !== "exercise" ||
    shell.inputBlocked ||
    phase !== "question" ||
    isLocationMode(progress.mode) ||
    progress.mode === "piano" ||
    isLiveMode(progress.mode)
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
  activities.interrupt("focus");
  setModifier(0);
  midi.setAccepting(false);
});
window.addEventListener("focus", refreshMidiAcceptance);
window.addEventListener("pagehide", () => midi.disconnect());
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
document.addEventListener("visibilitychange", () => {
  activities.interrupt("visibility");
  setModifier(0);
  refreshMidiAcceptance();
  // Feedback never advances while away; Continue is an explicit transition.
});
function writePreferences() {
  if (route.kind !== "exercise" || !isFlashcardMode(progress.mode)) return;
  const url = new URL(exercise(progress.mode).path, location.origin);
  const p = profile();
  if (progress.mode === "piano") {
    for (const [param, value] of Object.entries({
      key: p.key,
      low: p.low,
      high: p.high,
      show: p.pianoPrompt || "staff",
      clef: p.staffLayout || "grand",
    }))
      url.searchParams.set(param, value);
  }
  history.replaceState(null, "", url.pathname + url.search);
  route = readRoute(url, progress.mode);
}
function showMissing() {
  route = { kind: "not-found" };
  clearTimeout(timer);
  pendingNext = false;
  void activities.activate(route);
  syncOptions();
  refreshMidiAcceptance();
}
function visit(url: URL, push: boolean) {
  void save();
  if (route.kind === "exercise" && isFlashcardMode(progress.mode) && session)
    sessions.remember(progress.mode, session, profile());
  clearTimeout(timer);
  pendingNext = false;
  activities.interrupt("navigation");
  midi.setAccepting(false);
  route = readRoute(url, progress.mode);
  if (push) history.pushState(null, "", url.pathname + url.search);
  shell.closeMenus();
  if (route.kind === "not-found") showMissing();
  else if (route.kind === "settings") start();
  else {
    progress.mode = route.mode;
    routePreferences(route);
    const cached = isFlashcardMode(route.mode)
      ? sessions.restore(route.mode, profile(), progress.roundLength)
      : undefined;
    session = cached?.session!;
    if (cached) phase = cached.phase;
    if (fontsReady) start(false, !!cached);
    else syncOptions();
    if (progress.mode !== "sight") writePreferences();
  }
  shell.focusContent();
}
$("#sight-reading").addEventListener("hymn-route", (e) => {
  if (
    progress.mode !== "sight" ||
    route.kind === "not-found" ||
    route.kind === "settings"
  )
    return;
  const url = new URL((e as CustomEvent<string>).detail, location.origin);
  if (
    location.pathname !== url.pathname &&
    location.pathname !== exercise("sight").path
  )
    history.pushState(null, "", url.pathname + url.search);
  else history.replaceState(null, "", url.pathname + url.search);
  route = readRoute(url, progress.mode);
});
syncOptions();
enableAnswers(false);
document.fonts.ready
  .then(async () => {
    await persistence.initialize();
    progress = persistence.state.progress;
    document.querySelector("main")!.inert = !persistence.writable;
    route = readRoute(new URL(location.href), progress.mode);
    if (route.kind === "exercise") {
      progress.mode = route.mode;
      routePreferences(route);
    }
    VexFlow.setFonts("Bravura", "Academico");
    fontsReady = true;
    if (route.kind === "not-found") showMissing();
    else {
      if (["/", "/index.html"].includes(location.pathname))
        history.replaceState(
          null,
          "",
          exercise(progress.mode).path + location.search,
        );
      start();
      save();
    }
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
