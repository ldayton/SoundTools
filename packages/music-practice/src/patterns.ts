import { RendererLifetime } from "./renderer-lifetime";
import { PatternFrame } from "./practice-frame";
import { practicePresentation } from "./practice-presentation";
import { mountPracticeSurface } from "./practice-surfaces";
import { PatternControls, patternControlsState } from "./pattern-controls";
import { createElement } from "react";
import {
  PatternOptions,
  patternOptionsState,
  type PatternOptionsState,
} from "./pattern-options";
import { mountPracticePiano } from "./practice-piano";
import type { InputPolicy, Interruption } from "./live-practice";
import { registerPracticeOptions } from "./practice-options";
import type { NoteTimingEvent } from "abcjs";
import { Piano } from "./piano";
import { WaitForMe } from "./sight-reading-model";
import {
  drawPracticeScore,
  eventSteps,
  highlightScore,
  keyboardRange,
} from "./practice-score";
import {
  makePattern,
  restorePattern,
  type PatternSettings,
} from "./patterns-model";
import { spellPitch } from "./guitar";
import { diagnostics } from "./diagnostics";
import { mergePatternSettings } from "./patterns-model";
import { persistence } from "./persistence";
export class IntervalPatterns {
  private disposeView: () => void;
  private lifetime = new RendererLifetime();
  private presentation = practicePresentation({
    context: "Wait for me",
    title: "Follow the pattern.",
  });
  readonly midiSlot: HTMLElement;
  private active = false;
  private paused = false;
  private advanceTimer = 0;
  private position = 0;
  private options!: PatternOptionsState;
  private controls = patternControlsState({ paused: false });
  private settings: PatternSettings = {
    key: "C",
    hand: "right",
    level: "steps",
  };
  private notes: number[] = [];
  private events: NoteTimingEvent[] = [];
  private session?: WaitForMe;
  private piano: Piano;
  private pianoPanel: ReturnType<typeof mountPracticePiano>;
  private width = 0;
  dispose() {
    if (this.lifetime.disposed) return;
    this.active = false;
    this.cancelAdvance();
    this.lifetime.dispose();
    this.piano.dispose();
    this.pianoPanel.dispose();
    this.disposeView();
  }
  constructor(
    private element: HTMLElement,
    private changed: () => void,
  ) {
    try {
      const s = (persistence.read<any>("patterns") ||
        persistence.state.legacy.patterns) as any;
      this.settings = mergePatternSettings(this.settings, s);
      const restored = restorePattern(s, this.settings);
      if (restored) {
        this.notes = restored.notes;
        this.position = restored.position;
        this.paused = restored.paused;
      }
    } catch {}
    this.disposeView = mountPracticeSurface(
      element,
      createElement(PatternFrame, {
        presentation: this.presentation,
        panelId: `${element.id}-piano-panel`,
        transport: createElement(PatternControls, {
          model: this.controls,
          panelId: `${element.id}-piano-panel`,
          next: () => this.next(),
          restart: () => {
            this.cancelAdvance();
            this.position = 0;
            this.paused = false;
            this.render();
          },
          pause: () => {
            this.paused = !this.paused;
            this.interrupt("controls");
            this.update();
            if (!this.paused && this.session?.complete) this.scheduleAdvance();
          },
        }),
      }),
    );

    this.options = patternOptionsState(structuredClone(this.settings));
    registerPracticeOptions(
      element,
      createElement(PatternOptions, {
        model: this.options,
        onChange: (settings) => {
          this.settings = mergePatternSettings(this.settings, settings);
          this.options.set(structuredClone(this.settings));
          this.next();
          this.save();
        },
      }),
    );
    this.pianoPanel = mountPracticePiano(this.$(".pattern-piano"), {});
    this.midiSlot = this.$(".pattern-midi-slot");
    this.piano = new Piano(this.$(".pattern-piano"), (n) => {
      if (this.accepting) this.answer(n);
    });

    this.lifetime.observe(this.$(".sequence-score"), () => {
      const w = this.$(".sequence-score").clientWidth;
      if (this.active && w > 0 && Math.abs(w - this.width) > 2)
        this.render(true);
    });
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    if (!persistence.writable || !this.active || !this.session) return "none";
    return this.paused || this.session.complete ? "restart" : "answer";
  }
  get accepting() {
    return this.inputPolicy === "answer";
  }
  enter() {
    this.active = true;
    if (!this.notes.length) this.notes = makePattern(this.settings);
    this.render();
    if (this.session?.complete && !this.paused) this.scheduleAdvance();
    this.changed();
  }
  leave() {
    this.active = false;
    this.interrupt("navigation");
    this.changed();
  }
  interrupt(_reason: Interruption) {
    this.cancelAdvance();
    this.session?.resetGesture();
  }
  private save() {
    persistence.write("patterns", {
      version: 2,
      ...this.settings,
      notes: this.notes,
      position: this.position,
      paused: this.paused,
    });
  }
  private cancelAdvance() {
    window.clearTimeout(this.advanceTimer);
    this.advanceTimer = 0;
    if (this.session?.complete)
      this.presentation.set({ feedback: "Well done." });
  }
  private scheduleAdvance() {
    this.cancelAdvance();
    const session = this.session;
    if (
      !session?.complete ||
      this.paused ||
      !this.active ||
      document.hidden ||
      !document.hasFocus() ||
      !persistence.writable
    )
      return;
    this.presentation.set({ feedback: "Well done. Next pattern…" });
    this.advanceTimer = window.setTimeout(() => {
      this.advanceTimer = 0;
      if (
        this.active &&
        !this.paused &&
        !document.hidden &&
        document.hasFocus() &&
        persistence.writable &&
        this.session === session &&
        session.complete
      )
        this.next();
    }, 600);
  }
  private next() {
    this.cancelAdvance();
    this.notes = makePattern(this.settings, Math.random, this.notes);
    this.position = 0;
    this.paused = false;
    this.render();
  }
  private render(layoutOnly = false) {
    this.width = this.$(".sequence-score").clientWidth;
    if (!this.width) return;
    const previous = this.session;
    if (!layoutOnly) {
      this.session = undefined;
      this.changed();
    }
    const music = this.notes
      .map((m, i) => {
        const n = spellPitch(m, this.settings.key)!;
        return (
          (i === 4 ? "| " : "") +
          n.letter +
          (n.octave < 4 ? ",".repeat(4 - n.octave) : "'".repeat(n.octave - 4)) +
          "16"
        );
      })
      .join(" ");
    try {
      this.events = drawPracticeScore(
        this.$(".pattern-paper"),
        `X:1\nM:4/4\nL:1/64\nK:${this.settings.key} clef=${this.settings.hand === "left" ? "bass" : "treble"}\n${music} |]\n`,
        this.width,
        { compact: true },
      );
      this.session =
        layoutOnly && previous
          ? previous
          : new WaitForMe(eventSteps(this.events), this.position);
      this.piano.show(...keyboardRange(this.events), false);
      this.update(true);
    } catch (e) {
      this.presentation.set({
        feedback: "The pattern couldn’t load. Try a new pattern.",
      });
      diagnostics.capture(e, "patterns.render_failed");
      this.changed();
    }
  }
  answer(note: number, held?: readonly number[]) {
    if (this.inputPolicy === "none") return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "wrong") {
      this.presentation.set({
        feedback: "Try again — follow the highlighted note.",
      });
      return;
    }
    if (result === "restarted") {
      this.cancelAdvance();
      this.paused = false;
    }
    this.position = this.session!.index;
    this.update(true);
    if (result === "complete") this.scheduleAdvance();
  }
  private update(scroll = false) {
    const s = this.session;
    if (!s) return;
    highlightScore(
      this.$(".pattern-paper"),
      this.events[s.index],
      this.$(".sequence-score"),
      scroll,
    );
    this.presentation.set({
      count: s.complete ? "Complete" : `${s.index + 1} / ${s.steps.length}`,
    });

    this.presentation.set({ max: s.steps.length });
    this.presentation.set({ value: s.index });
    this.presentation.set({
      feedback: s.complete
        ? this.paused
          ? "Paused. Resume for a new pattern."
          : "Well done."
        : this.paused
          ? "Paused. Continue when you’re ready."
          : "Play the highlighted note.",
    });
    this.controls.set({ paused: this.paused });
    this.piano.setUnavailable(!this.accepting);
    this.changed();
    this.save();
  }
}
