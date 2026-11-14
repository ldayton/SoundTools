import { useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Text } from "@mantine/core";
import { createViewState } from "./view-state";
import {
  PracticeHeader,
  PracticeProgress,
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
}: {
  id: string;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(
    pianoPresentation.subscribe,
    pianoPresentation.getSnapshot,
  );
  return (
    <div
      id={id}
      className="practice-piano"
      hidden={!state.visible || state.available[id] === false}
    >
      {children}
    </div>
  );
}
type FrameProps = {
  presentation: PresentationModel;
  transport: ReactNode;
  panelId?: string;
  next?: () => void;
};
export function PracticeFrame({
  presentation,
  kind,
  label,
  className = "",
  children,
  feedback = true,
  next,
  arrangement,
}: {
  presentation: PresentationModel;
  kind: PresentationKind;
  label: string;
  className?: string;
  children: ReactNode;
  feedback?: boolean;
  next?: () => void;
  arrangement?: string;
}) {
  return (
    <section
      className={`practice-surface ${className}`}
      aria-label={label}
      data-arrangement={arrangement}
    >
      <div className="presentation-header">
        <PracticeHeader model={presentation} kind={kind} />
      </div>
      <div className="presentation-progress">
        <PracticeProgress model={presentation} kind={kind} />
      </div>
      {feedback && (
        <div className="presentation-feedback">
          <PracticeFeedback model={presentation} kind={kind} />
        </div>
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
      feedback={false}
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
        <div className="presentation-feedback">
          <PracticeFeedback model={presentation} kind="flashcard" />
        </div>
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
          Choose a fret on the highlighted string.
          <span className="desktop-hint">
            {" "}
            Use ← / → to move, Enter to answer.
          </span>
        </p>
      </div>
      <div className="sequence-transport flashcard-transport">{transport}</div>
      <PianoPanel id={panelId}>
        <div id="piano" hidden={!piano || s.empty} />
      </PianoPanel>
    </PracticeFrame>
  );
}
export function PatternFrame({
  presentation,
  transport,
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
      <div className="sequence-transport">{transport}</div>
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
  });
export function HymnFrame({
  presentation,
  transport,
  panelId,
  body,
}: FrameProps & { panelId: string; body: ReturnType<typeof hymnBodyState> }) {
  const s = useSyncExternalStore(body.subscribe, body.getSnapshot);
  return (
    <PracticeFrame
      presentation={presentation}
      kind="hymn"
      label="Hymn sight reading"
      className="sequence-practice"
      arrangement={s.arrangement}
    >
      <div
        className="sequence-score"
        tabIndex={0}
        role="region"
        aria-label={s.scoreLabel}
        aria-describedby="hymn-scroll-hint"
      >
        {s.noKey && (
          <p className="hymn-no-key" role="status">
            No available key fits these note limits. Widen or clear the lowest
            or highest note.
          </p>
        )}
        <div className="hymn-paper" hidden={s.noKey} />
      </div>
      <div className="sequence-transport">{transport}</div>
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
      <p className="sequence-help">
        Tap on any piano key, press Space or use the button. Count through the
        rests.
      </p>
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
      <div
        className="sequence-score"
        tabIndex={0}
        role="region"
        aria-label="Four-bar rhythm"
      >
        <div className="rhythm-paper" />
      </div>
      <div className="rhythm-tap-slot practice-control-slot">{tap}</div>
      <div className="sequence-transport">{transport}</div>
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
      <div className="sequence-transport">{transport}</div>
      <PianoPanel id={panelId}>
        <div className="theory-piano" />
      </PianoPanel>
    </PracticeFrame>
  );
}
