import { RhythmFrame, rhythmBodyState } from "./practice-frame";
import { practicePresentation } from "./practice-presentation";
import { mountPracticeSurface } from "./practice-surfaces";
import {
  RhythmControls,
  RhythmTap,
  rhythmControlsState,
} from "./rhythm-controls";
import { createElement } from "react";
import {
  RhythmOptions,
  rhythmOptionsState,
  type RhythmOptionsState,
} from "./rhythm-options";
import type { InputPolicy, Interruption } from "./live-practice";
import { registerPracticeOptions } from "./practice-options";
import type { NoteTimingEvent } from "abcjs";
import {
  makeRhythm,
  rhythmOnsets,
  RhythmAttempt,
  type RhythmLevel,
  type RhythmNote,
} from "./rhythm-model";
import { drawPracticeScore, highlightScore } from "./practice-score";
import { diagnostics } from "./diagnostics";
import { mergeRhythmSettings } from "./rhythm-model";
import { persistence } from "./persistence";
export class RhythmPractice {
  private body = rhythmBodyState();
  private presentation = practicePresentation({
    context: "Rhythm only",
    count: "4 bars · 4/4",
    title: "Find the pulse.",
    feedback: "Two bars to count in, then your turn.",
  });
  readonly midiSlot: HTMLElement;
  private active = false;
  private controls = rhythmControlsState({ phase: "ready", response: "" });
  private result:
    | { hits: number[]; total: number; missed: number; extras: number }
    | undefined;
  private state: "ready" | "countin" | "playing" | "complete" = "ready";
  private options!: RhythmOptionsState;
  private bpm = 80;
  private level: RhythmLevel = "pulse";
  private bars: RhythmNote[][] = [];
  private events: NoteTimingEvent[] = [];
  private attempt?: RhythmAttempt;
  private countStart = 0;
  private end = 0;
  private frame = 0;
  private width = 0;
  private beat = -1;
  private step = -1;
  private tapFeedbackTimer = 0;
  constructor(
    private element: HTMLElement,
    private changed: () => void,
  ) {
    try {
      const s = (persistence.read<any>("rhythm") ||
        persistence.state.legacy.rhythm) as any;
      if (
        s?.version === 1 &&
        Array.isArray(s.bars) &&
        s.bars.length === 4 &&
        s.bars.every(
          (b: any) =>
            Array.isArray(b) &&
            b.length > 0 &&
            b.every((n: any) => [0.5, 1, 2].includes(n?.beats)) &&
            b.reduce((sum: number, n: any) => sum + n.beats, 0) === 4,
        )
      ) {
        this.bars = structuredClone(s.bars);
        if (
          s.result &&
          Array.isArray(s.result.hits) &&
          s.result.hits.every(
            (n: any) => Number.isInteger(n) && n >= 0 && n < 32,
          ) &&
          [s.result.total, s.result.missed, s.result.extras].every(
            (n: any) => Number.isSafeInteger(n) && n >= 0,
          )
        ) {
          this.result = structuredClone(s.result);
          this.state = "complete";
        }
      }
      const settings = mergeRhythmSettings(
        { bpm: this.bpm, level: this.level },
        s,
      );
      this.bpm = settings.bpm;
      this.level = settings.level;
    } catch {}
    mountPracticeSurface(
      element,
      createElement(RhythmFrame, {
        presentation: this.presentation,
        body: this.body,
        transport: createElement(RhythmControls, {
          model: this.controls,
          start: () => {
            if (this.state === "playing" || this.state === "countin")
              this.interrupt("controls");
            else this.start();
          },
          next: () => {
            this.stop();
            this.bars = makeRhythm(this.level);
            this.render();
          },
        }),
        tap: createElement(RhythmTap, {
          model: this.controls,
          tap: () => this.tapButton(),
        }),
      }),
    );

    this.midiSlot = this.$(".rhythm-midi-slot");
    this.options = rhythmOptionsState({ bpm: this.bpm, level: this.level });
    registerPracticeOptions(
      element,
      createElement(RhythmOptions, {
        model: this.options,
        onChange: (settings) => {
          this.stop();
          const next = mergeRhythmSettings(
            { bpm: this.bpm, level: this.level },
            settings,
          );
          const materialChanged = this.level !== next.level;
          this.level = next.level;
          this.bpm = next.bpm;
          this.options.set(next);
          if (materialChanged) this.bars = makeRhythm(this.level);
          this.render();
          this.save();
        },
      }),
    );

    window.addEventListener("keydown", (e) => {
      if (
        this.active &&
        ["countin", "playing"].includes(this.state) &&
        e.key === " " &&
        !e.repeat &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target as Element).closest(
          "input,select,textarea,button,summary,[contenteditable]",
        )
      ) {
        e.preventDefault();
        this.answer(60);
      }
    });
    new ResizeObserver(() =>
      requestAnimationFrame(() => {
        const w = this.$(".sequence-score").clientWidth;
        if (this.active && w > 0 && Math.abs(w - this.width) > 2) {
          this.render(true);
        }
      }),
    ).observe(this.$(".sequence-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    return persistence.writable &&
      this.active &&
      (this.state === "countin" || this.state === "playing")
      ? "answer"
      : "none";
  }
  enter() {
    this.active = true;
    if (!this.bars.length) this.bars = makeRhythm(this.level);
    this.render();
    this.changed();
  }
  leave() {
    this.active = false;
    this.stop();
    this.changed();
  }
  interrupt(_reason: Interruption) {
    if (this.state === "countin" || this.state === "playing") {
      this.stop();
      this.presentation.set({
        feedback: "Stopped. Start again when you’re ready.",
      });
    }
  }
  private save() {
    persistence.write("rhythm", {
      version: 1,
      bpm: this.bpm,
      level: this.level,
      bars: this.bars,
      result: this.result,
    });
  }
  private stop() {
    cancelAnimationFrame(this.frame);
    this.state = "ready";
    this.result = undefined;
    this.attempt = undefined;
    this.clearTapFeedback();
    this.controls.set({ ...this.controls.getSnapshot(), phase: this.state });
    this.beat = this.step = -1;
    highlightScore(
      this.$(".rhythm-paper"),
      undefined,
      this.$(".sequence-score"),
    );
    this.body.patch({ beat: -1 });
    this.changed();
  }
  private render(layoutOnly = false) {
    this.width = this.$(".sequence-score").clientWidth;
    if (!this.width) return;
    try {
      const paper = this.$(".rhythm-paper");
      const columns = this.width >= 620 ? 2 : 1;
      paper.style.setProperty("--rhythm-columns", String(columns));
      paper.replaceChildren();
      this.events = this.bars.flatMap((bar, index) => {
        const measure = document.createElement("div");
        measure.className = "rhythm-bar";
        measure.setAttribute("aria-label", `Bar ${index + 1}`);
        paper.append(measure);
        return drawPracticeScore(
          measure,
          `X:1\nM:4/4\nL:1/8\nK:C clef=perc stafflines=1\n${bar.map((n) => (n.rest ? "z" : "B") + n.beats * 2).join(" ")} ${index === this.bars.length - 1 ? "|]" : "|"}\n`,
          (this.width - (columns - 1) * 16) / columns,
          { rhythmGrid: true },
        );
      });
      if (!layoutOnly)
        this.presentation.set({
          feedback: "Two bars to count in, then your turn.",
        });
      if (this.result) this.showResult();
      if (!layoutOnly) this.save();
    } catch (e) {
      this.presentation.set({
        feedback: "The rhythm couldn’t load. Try a new rhythm.",
      });
      diagnostics.capture(e, "rhythm.render_failed");
    }
  }
  private start() {
    this.stop();
    this.state = "countin";
    this.countStart = performance.now();
    const beatMs = 60000 / this.bpm;
    const start = this.countStart + 8 * beatMs;
    const pattern = rhythmOnsets(this.bars);
    this.end = start + pattern.beats * beatMs;
    this.attempt = new RhythmAttempt(pattern.starts, this.bpm, start);
    this.controls.set({ ...this.controls.getSnapshot(), phase: this.state });
    this.element
      .querySelectorAll(".rhythm-hit,.rhythm-missed")
      .forEach((e) => e.classList.remove("rhythm-hit", "rhythm-missed"));
    this.changed();
    this.save();
    this.tick();
  }
  private tick = () => {
    if (
      !this.active ||
      !this.attempt ||
      !["playing", "countin"].includes(this.state)
    )
      return;
    const now = performance.now();
    const beatMs = 60000 / this.bpm;
    const counting = now < this.attempt.start;
    if (!counting && this.state === "countin") {
      this.state = "playing";
      this.presentation.set({ feedback: "Your turn. Keep a steady pulse." });
      this.changed();
    }
    const beat = Math.floor(
      (now - (counting ? this.countStart : this.attempt.start)) / beatMs,
    );
    if (beat !== this.beat) {
      this.beat = beat;
      this.body.patch({ beat: (beat % 4) + 1 });
      if (counting)
        this.presentation.set({
          feedback: `Count-in · bar ${Math.floor(beat / 4) + 1} of 2 · beat ${(beat % 4) + 1}`,
        });
    }
    if (!counting) {
      const index = this.attempt.times.reduce(
        (index, t, i) => (now >= t ? i : index),
        -1,
      );
      if (index !== this.step) {
        this.step = index;
        highlightScore(
          this.$(".rhythm-paper"),
          this.events[index],
          this.$(".sequence-score"),
          true,
        );
      }
    }
    if (now >= this.end + this.attempt.tolerance) {
      this.finish();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
  answer(
    _note: number,
    _held?: readonly number[],
    timestamp = performance.now(),
  ) {
    if (this.inputPolicy === "none" || !this.attempt) return;
    const result = this.attempt.tap(timestamp);
    this.reactToTap(
      result === "ignored"
        ? "Wait…"
        : result === "hit"
          ? "On beat"
          : "Off beat",
      result,
    );
    for (const index of this.attempt.hits.keys())
      for (const e of (this.events[index]?.elements || [])
        .flat()
        .filter(Boolean))
        e.classList.add("rhythm-hit");
  }
  private tapButton() {
    if (!this.active || !persistence.writable) return;
    if (this.state === "ready" || this.state === "complete") {
      this.reactToTap(
        this.state === "ready" ? "Press Start" : "Start again",
        "ignored",
      );
      return;
    }
    this.answer(60);
  }
  private clearTapFeedback() {
    clearTimeout(this.tapFeedbackTimer);
    this.controls.set({
      ...this.controls.getSnapshot(),
      response: "",
      feedback: undefined,
    });
  }
  private reactToTap(text: string, kind: string) {
    this.clearTapFeedback();
    this.controls.set({
      ...this.controls.getSnapshot(),
      response: text,
      feedback: kind,
    });
    this.tapFeedbackTimer = window.setTimeout(
      () => this.clearTapFeedback(),
      400,
    );
  }
  private finish() {
    if (!this.attempt) return;
    this.state = "complete";
    this.clearTapFeedback();
    highlightScore(
      this.$(".rhythm-paper"),
      undefined,
      this.$(".sequence-score"),
    );
    this.result = {
      hits: [...this.attempt.hits.keys()],
      total: this.attempt.times.length,
      missed: this.attempt.missed,
      extras: this.attempt.extras,
    };
    this.showResult();
    this.save();
  }
  private showResult() {
    if (!this.result) return;
    this.state = "complete";
    this.events.forEach((event, i) =>
      (event.elements || [])
        .flat()
        .filter(Boolean)
        .forEach((e) =>
          e.classList.add(
            this.result!.hits.includes(i) ? "rhythm-hit" : "rhythm-missed",
          ),
        ),
    );
    this.presentation.set({
      feedback: `${this.result.hits.length} of ${this.result.total} on the beat · ${this.result.missed} missed · ${this.result.extras} extra`,
    });
    this.controls.set({ ...this.controls.getSnapshot(), phase: this.state });
    this.changed();
  }
}
