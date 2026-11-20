import { createPortal } from "react-dom";
import { useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Text, Title } from "@mantine/core";
import { createViewState } from "./view-state";
import {
  PracticeHeader,
  HymnStatus,
  PracticeCount,
  PracticeFeedback,
  PracticeSummary,
  type PresentationModel,
  type PresentationKind,
} from "./practice-presentation";
import { pianoPresentation } from "./piano-presentation";

/** Ordinary view data only. Controllers commit geometry changes before measuring renderer hosts. */
export function frameState<T extends object>(initial: T) {
  const state = createViewState(initial);
  return {
    ...state,
    patch(patch: Partial<T>) {
      flushSync(() => state.set({ ...state.getSnapshot(), ...patch }));
    },
  };
}
export function PianoPanel({
  id,
  children,
  required = false,
}: {
  id: string;
  required?: boolean;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(
    pianoPresentation.subscribe,
    pianoPresentation.getSnapshot,
  );
  return (
    <div
      id={id}
      className={`practice-piano piano-keybed ${required ? "answer-piano" : "reference-piano"}`}
      hidden={(!required && !state.visible) || state.available[id] === false}
    >
      {children}
    </div>
  );
}
type FrameProps = {
  presentation: PresentationModel;
  transport: ReactNode;
  panelId?: string;
  headerHost: HTMLElement;
  next?: () => void;
};
export function PracticeFrame({
  presentation,
  kind,
  label,
  className = "",
  children,
  next,
  arrangement,
}: {
  presentation: PresentationModel;
  kind: PresentationKind;
  label: string;
  className?: string;
  children: ReactNode;
  next?: () => void;
  arrangement?: string;
}) {
  return (
    <section
      className={`practice-surface ${className}`}
      aria-label={label}
      data-arrangement={arrangement}
    >
      {kind !== "hymn" && (
        <>
          <div className="presentation-header">
            <PracticeHeader model={presentation} kind={kind} />
          </div>
        </>
      )}

      {children}
      {next && (
        <div className="presentation-summary">
          <PracticeSummary model={presentation} kind={kind} next={next} />
        </div>
      )}
    </section>
  );
}
function SessionTransport({
  presentation,
  kind,
  transport,
  headerHost,
}: FrameProps & { kind: PresentationKind }) {
  return createPortal(
    <div className="notewise-session-controls">
      {transport}
      <PracticeCount model={presentation} kind={kind} />
    </div>,
    headerHost,
  );
}
export const flashcardBodyState = () =>
  frameState({
    mode: "staff",
    empty: false,
    questionHidden: false,
    named: "",
    prompt: "",
    signature: "",
    notationLabel: "Guitar treble clef with octave-down 8; identify the note",
    midiRequired: false,
  });
export function FlashcardFrame({
  presentation,
  transport,
  headerHost,
  answers,
  body,
  panelId,
  next,
}: FrameProps & {
  answers: ReactNode;
  body: ReturnType<typeof flashcardBodyState>;
  panelId: string;
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  const piano = s.mode === "piano",
    signature = s.mode === "signature";
  const location = s.mode === "find" || s.mode === "staff-find";
  const notation =
    !s.empty &&
    (["staff", "staff-find", "tab", "signature"].includes(s.mode) || piano);
  return (
    <PracticeFrame
      presentation={presentation}
      kind="flashcard"
      label="Note recognition practice"
      className="practice"
      next={next}
    >
      <div
        id="question"
        hidden={s.questionHidden}
        className={[
          piano && "piano-question",
          s.mode === "staff-find" && "paired",
          signature && "signature-question",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <p id="signature-prompt" hidden={!signature || s.empty}>
          {s.signature}
        </p>
        <div
          id="notation"
          role="img"
          aria-label={s.notationLabel}
          hidden={!notation}
        />
        <div id="named-note" hidden={s.mode !== "find" || s.empty}>
          <span id="target-name">{s.named}</span>
          <p id="target-string">{s.prompt}</p>
        </div>
        <p id="string-prompt" hidden={s.mode !== "staff-find" || s.empty}>
          {s.prompt}
        </p>
        <div
          id="fretboard"
          hidden={
            s.empty || ["staff", "tab", "piano", "signature"].includes(s.mode)
          }
        />
        <p
          id="piano-midi-required"
          className="piano-midi-required"
          role="status"
          hidden={!s.midiRequired}
        >
          MIDI keyboard required — this note is outside the on-screen keys. Play
          it on your connected keyboard, or change the practice range.
        </p>
        <div className="presentation-feedback">
          <PracticeFeedback model={presentation} kind="flashcard" />
        </div>
        <div
          className="keyboard"
          aria-label="Answer keyboard"
          hidden={location || piano}
        >
          {answers}
        </div>
        <p className="hint" id="name-hint" hidden={location || piano}>
          <span className="desktop-hint">
            Press A–G to answer. First press + for sharp; − for flat; 0 to
            return to natural
          </span>
          <span className="mobile-hint">
            Choose ♯ or ♭ first, then tap the letter.
          </span>
        </p>
        <p className="hint location-hint" hidden={!location}>
          <span className="desktop-hint">
            Use ← / → to move, Enter to answer.
          </span>
        </p>
      </div>
      <SessionTransport
        presentation={presentation}
        kind="flashcard"
        transport={transport}
        headerHost={headerHost}
      />
      <PianoPanel id={panelId} required={piano}>
        <div id="piano" hidden={!piano || s.empty} />
      </PianoPanel>
    </PracticeFrame>
  );
}
export function PatternFrame({
  presentation,
  transport,
  headerHost,
  panelId,
}: FrameProps & { panelId: string }) {
  return (
    <PracticeFrame
      presentation={presentation}
      kind="pattern"
      label="Interval pattern practice"
      className="sequence-practice"
    >
      <div
        className="sequence-score"
        role="region"
        tabIndex={0}
        aria-label="Two-bar interval pattern"
      >
        <div className="pattern-paper" />
      </div>
      <div className="presentation-feedback">
        <PracticeFeedback model={presentation} kind="pattern" />
      </div>
      <SessionTransport
        presentation={presentation}
        kind="pattern"
        transport={transport}
        headerHost={headerHost}
      />
      <div className="pattern-midi-slot" />
      <PianoPanel id={panelId}>
        <div className="pattern-piano" />
      </PianoPanel>
    </PracticeFrame>
  );
}
export const hymnBodyState = () =>
  frameState({
    noKey: false,
    arrangement: "melody",
    scoreLabel: "Hymn score with aligned lyrics",
    title: "",
    credits: [] as string[],
  });
export function HymnFrame({
  headerHost,
  presentation,
  transport,
  passage,
  panelId,
  body,
  favorite,
}: FrameProps & {
  panelId: string;
  body: ReturnType<typeof hymnBodyState>;
  passage: ReactNode;
  headerHost: HTMLElement;
  favorite: ReactNode;
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  return (
    <PracticeFrame
      presentation={presentation}
      kind="hymn"
      label="Hymn sight reading"
      className="sequence-practice"
      arrangement={s.arrangement}
    >
      {createPortal(transport, headerHost)}
      <HymnStatus model={presentation} />
      <div
        className="sequence-score"
        tabIndex={0}
        role="region"
        aria-label={s.scoreLabel}
      >
        <PracticeFeedback model={presentation} kind="hymn" errorsOnly />
        {s.noKey && (
          <p className="hymn-no-key" role="status">
            No available key fits these note limits. Widen or clear the lowest
            or highest note.
          </p>
        )}
        <div className="hymn-score-page" hidden={s.noKey}>
          <header className="hymn-score-heading">
            {favorite}
            <Title order={2} className="sequence-title" tabIndex={-1}>
              {s.title}
            </Title>
            <div className="hymn-score-credits">
              {s.credits.map((credit) => (
                <Text key={credit} size="sm">
                  {credit}
                </Text>
              ))}
            </div>
          </header>
          <div className="hymn-paper" />
        </div>
      </div>
      {passage}
      <div className="hymn-midi-slot" />
      <PianoPanel id={panelId}>
        <div className="hymn-piano" />
      </PianoPanel>
    </PracticeFrame>
  );
}
export const rhythmBodyState = () => frameState({ beat: -1 });
export function RhythmFrame({
  presentation,
  transport,
  headerHost,
  tap,
  body,
}: FrameProps & { tap: ReactNode; body: ReturnType<typeof rhythmBodyState> }) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  return (
    <PracticeFrame
      presentation={presentation}
      kind="rhythm"
      label="Rhythm practice"
      className="sequence-practice"
    >
      <div className="rhythm-beats" aria-label="Beats">
        {[1, 2, 3, 4].map((beat) => (
          <span
            key={beat}
            data-beat={beat}
            className={beat === s.beat ? "is-beat" : undefined}
          >
            {beat}
          </span>
        ))}
      </div>
      <div className="presentation-feedback">
        <PracticeFeedback model={presentation} kind="rhythm" />
      </div>
      <div
        className="sequence-score"
        tabIndex={0}
        role="region"
        aria-label="Four-bar rhythm"
      >
        <div className="rhythm-paper" />
      </div>
      <div className="rhythm-tap-slot practice-control-slot">{tap}</div>
      <SessionTransport
        presentation={presentation}
        kind="rhythm"
        transport={transport}
        headerHost={headerHost}
      />
      <div className="rhythm-midi-slot" />
    </PracticeFrame>
  );
}
export const theoryBodyState = () =>
  frameState({
    question: false,
    answers: false,
    stepsVisible: false,
    explanationVisible: false,
    explanation: "",
    walk: false,
    midiNotice: false,
    steps: [] as { label: number; done: boolean }[],
  });
export function TheoryFrame({
  presentation,
  transport,
  headerHost,
  answers,
  panelId,
  body,
  kind,
  next,
}: FrameProps & {
  answers: ReactNode;
  panelId: string;
  body: ReturnType<typeof theoryBodyState>;
  kind: "scales" | "intervals";
}) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  return (
    <PracticeFrame
      presentation={presentation}
      kind="theory"
      label={
        kind === "scales" ? "Scale and degree practice" : "Interval practice"
      }
      className="sequence-practice theory-surface"
      next={next}
    >
      <div
        className="theory-notation"
        role="img"
        aria-label="Theory question"
        hidden={!s.question}
      />
      <div
        className="theory-steps"
        aria-label="Scale progress"
        hidden={!s.stepsVisible}
      >
        {s.steps.map((step, i) => (
          <span key={i} className={step.done ? "is-done" : undefined}>
            {step.label}
          </span>
        ))}
      </div>
      <div className="presentation-feedback">
        <PracticeFeedback model={presentation} kind="theory" />
      </div>
      <div
        className="theory-answers"
        aria-label="Answer choices"
        hidden={!s.answers}
      >
        {answers}
      </div>
      <p
        className="theory-explanation"
        role="status"
        hidden={!s.explanationVisible}
      >
        {s.explanation}
      </p>
      <div
        className="theory-walk"
        role="img"
        aria-label="Counted staff positions"
        hidden={!s.walk}
      />
      <Text size="sm" className="theory-midi-notice" hidden={!s.midiNotice}>
        This note needs a MIDI keyboard. You can also narrow the pitch range.
      </Text>
      <SessionTransport
        presentation={presentation}
        kind="theory"
        transport={transport}
        headerHost={headerHost}
      />
      <PianoPanel id={panelId}>
        <div className="theory-piano" />
      </PianoPanel>
    </PracticeFrame>
  );
}
