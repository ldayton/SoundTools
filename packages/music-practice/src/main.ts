import { preventRepeatedButtonActivation } from "./input-guards";
import { practicePresentation } from "./practice-presentation";
import { shellStatus } from "./shell-status";
import { createElement } from "react";
import { flashcardBodyState } from "./practice-frame";
import {
  FlashcardAnswers,
  FlashcardControls,
  flashcardControlsState,
} from "./flashcard-controls";
import {
  flashcardOptionsState,
  type FlashcardOptionsSnapshot,
} from "./flashcard-options";
import {
  mountPracticePiano,
  restorePianoVisibility,
  isPianoVisible,
} from "./practice-piano";
import { mountAppShell } from "./app-shell";
import { mountFlashcardView } from "./flashcard-view";
import { ActivityHost } from "./activity-host";
import { FlashcardSessions } from "./flashcard-sessions";
import { mergeProfile, profileFromQuery } from "./exercise-settings";
import { LIVE_EXERCISES, isFlashcardMode, type Mode } from "./exercises";
import { pianoNotation } from "./piano-notation";
import { drawPianoNotation, pianoPracticeFrame } from "./notation";
import {
  deck,
  KEYS,
  ROUND_LENGTHS,
  matches,
  name,
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
} from "./key-signatures";
import { drawKeySignature, drawNotation, VexFlow } from "./notation";
import { mountMidiPanel } from "./midi-panel";
import { Piano } from "./piano";
import {
  pianoDeck,
  pianoBounds,
  pitch,
  acceptsPiano,
  keyLabel,
} from "./piano-model";
import { Fretboard } from "./fretboard";
import "./style.css";
import "./styles/practice.css";
import { setupOffline } from "./offline";
import { offlineState } from "./offline-state";
import { diagnostics, diagnosticsContext } from "./diagnostics";
import { exercise, readRoute, type PracticeRoute } from "./navigation";
import {
  isLiveMode,
  type PracticeActivity,
  type LivePractice,
} from "./live-practice";
import { FeedbackAdvance } from "./feedback-advance";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const feedbackAdvance = new FeedbackAdvance();
let enterFlashcards = () => {};
const flashcardActivity: PracticeActivity = {
  get inputPolicy() {
    return phase === "question" ? "answer" : "none";
  },
  enter: () => enterFlashcards(),
  leave: () => interruptFlashcards(),
  interrupt: () => interruptFlashcards(),
};
function interruptFlashcards() {
  feedbackAdvance.cancel();
  setModifier(0);
  clearAnswerHover();
}
const activities = new ActivityHost({
  load: (mode) => {
    if (!isLiveMode(mode)) return flashcardActivity;
    const element = shell.activityElement(mode);
    element.textContent = "Loading practice…";
    const definition = LIVE_EXERCISES.find((entry) => entry.mode === mode)!;
    return definition
      .load()
      .then((Controller) => new Controller(element, refreshMidiAcceptance));
  },
  changed: refreshMidiAcceptance,
  missing: showMissing,
  failed: (error, mode, current) => {
    if (current && isLiveMode(mode))
      shell.activityElement(mode).textContent =
        "Practice couldn’t load. Choose another mode, then try again.";
    diagnostics.capture(error, "practice.load_failed");
  },
});
const activePractice = () =>
  isLiveMode(progress.mode)
    ? (activities.active as LivePractice | undefined)
    : undefined;
function inputEnvironment() {
  return {
    writable: persistence.writable,
    blocked: shell.inputBlocked,
    visible: !document.hidden,
    focused: document.hasFocus(),
  };
}
function inputPolicy() {
  return activities.inputPolicy(inputEnvironment());
}
const canAnswer = () => inputPolicy() === "answer";
const sessions = new FlashcardSessions();
let fontsReady = false;
let returnBoardFocus = false;
let progress = defaultProgress();
let route = readRoute(new URL(location.href), progress.mode);
if (route.kind === "exercise") progress.mode = route.mode;
function routePreferences(value: PracticeRoute) {
  if (isFlashcardMode(value.mode)) {
    progress.roundLength = progress.roundLengths?.[value.mode] || 12;
    progress.profiles[value.mode] = profileFromQuery(
      value.mode,
      progress.profiles[value.mode],
      value.query,
    );
  }
}
if (route.kind === "exercise") routePreferences(route);
let phase: "loading" | "question" | "feedback" | "complete" | "empty" =
  "loading";
let session: PracticeSession<Card | GuitarCard>;
let modifier: Modifier = 0;
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
const presentation = practicePresentation({ feedback: "Loading notation…" });
let pianoRangeNotice = "";
function optionsSnapshot(): FlashcardOptionsSnapshot {
  const mode = isFlashcardMode(progress.mode) ? progress.mode : null;
  return {
    mode,
    profile: structuredClone(progress.profiles[mode || "staff"]),
    roundLength: progress.roundLength,
    rangeNotice: pianoRangeNotice,
  };
}
const flashcardOptions = flashcardOptionsState(optionsSnapshot());
const flashcardControls = flashcardControlsState({
  enabled: false,
  modifier: 0,
  next: false,
});
const flashcardBody = flashcardBodyState();
mountFlashcardView(
  $("#flashcards"),
  {
    model: flashcardOptions,
    change: (patch) => {
      if (!isFlashcardMode(progress.mode) || !persistence.writable) return;
      const previous = profile();
      progress.profiles[progress.mode] = mergeProfile(progress.mode, previous, {
        ...previous,
        ...patch,
      });
      changed();
    },
    roundLengthChanged: (length) => {
      if (
        !isFlashcardMode(progress.mode) ||
        !persistence.writable ||
        !ROUND_LENGTHS.includes(length)
      )
        return;
      progress.roundLength = length;
      (progress.roundLengths ||= {})[progress.mode] = length;
      changed();
    },
  },
  {
    presentation,
    body: flashcardBody,
    panelId: "flashcards-piano-panel",
    next: () => start(true),
    answers: createElement(FlashcardAnswers, {
      model: flashcardControls,
      answer: answerName,
      modify: (value) => {
        if (canAnswer()) setModifier(value);
      },
    }),
    transport: createElement(FlashcardControls, {
      model: flashcardControls,
      panelId: "flashcards-piano-panel",
      next: () => next(),
      restart: () => {
        if (isFlashcardMode(progress.mode)) sessions.invalidate(progress.mode);
        session = undefined!;
        start(false, false, true);
      },
    }),
  },
);

const board = new Fretboard($("#fretboard"), answerLocation);

const pianoPanel = mountPracticePiano($("#piano"), {
  changed: () => {
    if (fontsReady) refreshPianoRange();
  },
});
pianoPanel.setAvailable(false);
const piano = new Piano($("#piano"), answerPiano, refreshPianoRange);
const midi = mountMidiPanel(
  $("#midi-panel"),
  (note) => {
    if (canAnswer()) answerPiano(note);
  },
  (state) => {
    if (state !== "connected") activities.interrupt("connection");
    shell.reportMidi(state);
    diagnostics.event("midi.state", { midiState: state });
  },
);
midi.setPerformanceListener((note, held, timestamp) => {
  if (isLiveMode(progress.mode) && inputPolicy() !== "none")
    activePractice()?.answer(note, held, timestamp);
});
function refreshMidiAcceptance() {
  midi.setAccepting(
    inputPolicy() !== "none" &&
      (progress.mode === "piano" || isLiveMode(progress.mode)),
  );
}
function refreshPianoRange() {
  if (progress.mode !== "piano") return;
  const [low, high] = piano.visibleBounds;
  const outside =
    isPianoVisible() &&
    pianoDeck(profile()).some((card) => !piano.contains(pitch(card)));
  pianoRangeNotice = outside
    ? `On-screen keys: ${keyLabel(low)}–${keyLabel(high)}. Notes outside these keys require MIDI keyboard input.`
    : "";
  flashcardOptions.set(optionsSnapshot());
  const required =
    isPianoVisible() &&
    !!session?.current &&
    !piano.contains(pitch(session.current));
  piano.setUnavailable(phase !== "question" || required);
  flashcardBody.patch({ midiRequired: required });
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
  flashcardControls.set({
    ...flashcardControls.getSnapshot(),
    modifier: value,
  });
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
  flashcardControls.set({ ...flashcardControls.getSnapshot(), enabled });
}
function syncOptions() {
  const isLive = isLiveMode(progress.mode);
  flashcardOptions.set(optionsSnapshot());
  shell.render(route, progress.mode);
  midi.setPerformanceMode(isLive);
  if (isLive) return;
  const p = profile();
  const isPiano = progress.mode === "piano";
  const isSignature = progress.mode === "signature";
  presentation.set({
    context: isSignature
      ? "Key signatures"
      : (isPiano ? "Piano · " : "Guitar · ") +
        (progress.mode === "name"
          ? p.naturalsOnly
            ? "Naturals only"
            : "All notes"
          : KEYS.find((k) => k.id === p.key)!.label.split(" · ")[0]),
  });
}
function renderQuestion(card: Card | GuitarCard) {
  const renderStarted = performance.now();
  const mode = progress.mode,
    isPiano = mode === "piano",
    isSignature = mode === "signature",
    location = isLocationMode(mode),
    notation =
      ["staff", "staff-find", "tab", "signature"].includes(mode) || isPiano;
  flashcardBody.patch({ mode, empty: false, midiRequired: false });
  pianoPanel.setAvailable(isPiano);
  if (isSignature) {
    const signature = card as SignatureCard;
    flashcardBody.patch({
      signature: signature.tonality === "major" ? "Major key" : "Minor key",
    });
    flashcardBody.patch({
      notationLabel: `Treble clef key signature; identify the ${signature.tonality} key`,
    });
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
    flashcardBody.patch({
      notationLabel: `${label}${shift}; find the sounding note on the piano`,
    });
    drawPianoNotation(
      $<HTMLDivElement>("#notation"),
      representation,
      profile().key,
      pianoPracticeFrame(profile()),
    );
  } else if (notation) {
    flashcardBody.patch({
      notationLabel:
        mode === "tab"
          ? "Single guitar tab note to identify"
          : isPiano
            ? "Treble clef; find the note on the piano"
            : "Guitar treble clef with octave-down 8; identify the note",
    });
    drawNotation(
      $<HTMLDivElement>("#notation"),
      card,
      profile().key,
      mode === "tab",
      !isPiano,
    );
  }
  if (isPiano) {
    const [low, high] = pianoBounds(profile());
    piano.show(low, high, false);
    refreshPianoRange();
    flashcardBody.patch({ named: name(card), prompt: "" });
  } else if (mode !== "staff" && !isSignature) {
    const guitar = card as GuitarCard;
    const prompt = `On string ${guitar.string} · ${STRINGS.find((s) => s.number === guitar.string)!.name}`;
    flashcardBody.patch({ named: name(card), prompt });
    if (mode !== "tab") board.show(guitar, profile(), location);
  }
  presentation.set({
    feedback: isSignature
      ? `Name the ${(card as SignatureCard).tonality} key.`
      : isPiano
        ? "Find this note."
        : location
          ? "Find this note."
          : mode === "name"
            ? "Name the highlighted note."
            : "Name this note.",
  });
  presentation.set({ kind: "" });
  diagnostics.metric("practice.render_ms", performance.now() - renderStarted);
}
function next() {
  feedbackAdvance.cancel();
  if (!persistence.writable) return;
  flashcardControls.set({ ...flashcardControls.getSnapshot(), next: false });
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
  presentation.set({ count: `${session.answered + 1} / ${session.length}` });
}
function finish(announce = true) {
  phase = "complete";
  syncDiagnosticsContext();
  if (announce)
    diagnostics.event("practice.completed", { roundLength: session.length });
  flashcardBody.patch({ questionHidden: true });
  presentation.set({ summary: true });
  presentation.set({ count: `${session.length} / ${session.length}` });
  presentation.set({
    result: `${session.correct} of ${session.length} correct`,
  });
  presentation.set({ suggestion: session.suggestion });
  requestAnimationFrame(() => $("#continue").focus({ preventScroll: true }));
}
function feedback(correct: boolean, text: string) {
  if (!persistence.writable || !session.submit(correct)) return;
  session.feedback = { correct, text };
  phase = "feedback";
  syncDiagnosticsContext();
  diagnostics.event(correct ? "answer.correct" : "answer.incorrect");
  const committed = save();
  enableAnswers(false);
  presentation.set({ feedback: text });
  presentation.set({ kind: correct ? "correct" : "incorrect" });
  presentation.set({ value: session.answered });
  flashcardControls.set({ ...flashcardControls.getSnapshot(), next: true });
  const answeredSession = session,
    answerNumber = session.answered;
  feedbackAdvance.schedule(
    committed,
    correct ? 450 : 1600,
    () =>
      activities.active === flashcardActivity &&
      activities.canInteract(inputEnvironment()) &&
      session === answeredSession &&
      session.answered === answerNumber &&
      phase === "feedback",
    next,
  );
}
function answerName(letter: Letter) {
  if (!canAnswer()) return;
  if (
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
  if (!canAnswer()) return;
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
  if (!canAnswer()) return;
  if (phase !== "question" || progress.mode !== "piano" || !session.current)
    return;
  const card = session.current;
  const correct = acceptsPiano(card, midi);
  piano.feedback(midi, pitch(card));
  const target = name(card) + card.octave;
  feedback(
    correct,
    correct
      ? `Yes — ${target}`
      : `That’s ${target}. You chose ${keyLabel(midi)}.`,
  );
}
function start(continuing = false, restoring = false, restart = false) {
  feedbackAdvance.cancel();
  flashcardControls.set({ ...flashcardControls.getSnapshot(), next: false });
  syncOptions();
  enterFlashcards = () => startFlashcards(continuing, restoring, restart);
  if (route.kind === "exercise" && isLiveMode(progress.mode)) {
    phase = "question";
    syncDiagnosticsContext();
  }
  void activities.activate(route);
}
function startFlashcards(
  continuing: boolean,
  restoring: boolean,
  restart: boolean,
) {
  if (!isFlashcardMode(progress.mode)) return;
  returnBoardFocus = false;
  syncOptions();
  flashcardBody.patch({ questionHidden: false });
  presentation.set({ summary: false });
  presentation.set({ value: 0 });
  presentation.set({ max: progress.roundLength });
  const pool =
    progress.mode === "staff"
      ? deck(profile())
      : progress.mode === "piano"
        ? pianoDeck(profile())
        : progress.mode === "signature"
          ? signatureDeck(
              profile().signaturePractice,
              profile().signatureMaxAccidentals ?? 1,
              profile().signatureAccidentals,
            )
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
          shellStatus.set({
            notice:
              "This activity checkpoint could not be restored. Its original data is preserved; this round starts again.",
          });
        },
      );
    restoring = !!session.current || session.complete;
    phase = session.current ? session.status : "question";
  }
  flashcardOptions.set({ ...optionsSnapshot(), roundLength: session.length });
  presentation.set({ max: session.length });
  if (!pool.length) {
    phase = "empty";
    syncDiagnosticsContext();
    flashcardBody.patch({ empty: true });
    enableAnswers(false);
    presentation.set({
      feedback:
        progress.mode === "name"
          ? "No natural notes in this fret range. Choose more frets or all notes."
          : "No notes in this key and fret range. Choose more frets or another string.",
    });
    presentation.set({ kind: "incorrect" });
    presentation.set({ count: "" });
    return;
  }
  if (restoring && session.complete) finish(false);
  else if (restoring && session.current) {
    phase = session.status === "feedback" ? "feedback" : "question";
    presentation.set({
      count: `${Math.min(session.answered + (phase === "question" ? 1 : 0), session.length)} / ${session.length}`,
    });
    presentation.set({ value: session.answered });
    setModifier(0);
    clearAnswerHover();
    renderQuestion(session.current);
    enableAnswers(phase === "question");
    flashcardControls.set({
      ...flashcardControls.getSnapshot(),
      next: phase === "feedback",
    });
    if (phase === "feedback" && session.feedback) {
      presentation.set({ feedback: session.feedback.text });
      presentation.set({
        kind: session.feedback.correct ? "correct" : "incorrect",
      });
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

window.addEventListener("keydown", (event) => {
  if (preventRepeatedButtonActivation(event)) return;
  if (
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !canAnswer() ||
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
window.addEventListener("pagehide", () => {
  feedbackAdvance.cancel();
  activities.dispose();
  midi.dispose();
  board.dispose();
  piano.dispose();
  pianoPanel.dispose();
  shell.dispose();
});
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
      clef: p.staffLayout || "grand",
    }))
      url.searchParams.set(param, value);
  }
  history.replaceState(null, "", url.pathname + url.search);
  route = readRoute(url, progress.mode);
}
function showMissing() {
  route = { kind: "not-found" };
  feedbackAdvance.cancel();
  void activities.activate(route);
  syncOptions();
  refreshMidiAcceptance();
}
function visit(url: URL, push: boolean) {
  void save();
  if (route.kind === "exercise" && isFlashcardMode(progress.mode) && session)
    sessions.remember(progress.mode, session, profile());
  feedbackAdvance.cancel();
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
syncOptions();
enableAnswers(false);
document.fonts.ready
  .then(async () => {
    await persistence.initialize();
    restorePianoVisibility();
    progress = persistence.state.progress;
    shellStatus.set({ blocked: !persistence.writable });
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
      offlineState.set({
        status:
          "Offline setup isn’t available in this browser. Practice still works while connected.",
      });
      diagnostics.offline("setup", "failed", {}, error);
    }
  })
  .catch((error) => {
    diagnostics.capture(error, "notation.startup_failed");
    presentation.set({
      feedback: "Notation couldn’t load. Please reload to try again.",
    });
  });
