import { loadPreferences, savePreferences } from "./preferences";
import { mergeRhythmSettings, RHYTHM_TEMPOS } from "./rhythm-model";
import type { InputPolicy, Interruption } from "./live-practice";
import { mountPracticeOptions } from "./practice-controls";
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
const STORAGE = "soundtools:notecards:rhythm:v1";
export class RhythmPractice {
  private resizeFrame = 0;
  private active = false;
  private state: "ready" | "countin" | "playing" | "complete" = "ready";
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
  constructor(
    private element: HTMLElement,
    private changed: () => void,
  ) {
    const saved = loadPreferences(STORAGE, {bpm:this.bpm,level:this.level}, mergeRhythmSettings);
    this.bpm = saved.bpm; this.level = saved.level;
    element.innerHTML = `<div class="practice-controls"><label>Rhythm<select id="rhythm-level"><option value="pulse">Steady quarter notes</option><option value="long-short">Long & short notes</option><option value="eighths">Eighth notes & rests</option></select></label><label>Tempo<select id="rhythm-tempo">${RHYTHM_TEMPOS
      .map((n) => `<option value="${n}">${n} BPM</option>`)
      .join(
        "",
      )}</select></label></div><section class="sequence-practice" aria-label="Rhythm practice"><div class="sequence-top"><span>Rhythm only</span><span>4 bars · 4/4</span></div><h2 class="sequence-title">Find the pulse.</h2><p class="sequence-help">Tap on any piano key, press Space, or use the button. Count through the rests.</p><div class="rhythm-beats" aria-label="Beat in the bar">${[1, 2, 3, 4].map((n) => `<span data-beat="${n}">${n}</span>`).join("")}</div><div class="sequence-score" tabindex="0" role="region" aria-label="Four-bar rhythm"><div class="rhythm-paper"></div></div><p class="sequence-feedback" role="status" aria-live="polite">Two bars to count in, then your turn.</p><button class="rhythm-tap" disabled>Tap</button><div class="sequence-transport"><button class="rhythm-start primary">Start</button><button class="rhythm-new">New rhythm</button></div></section>`;
    mountPracticeOptions(
      element,
      [this.$(".practice-controls")],
      "Changing options starts a new rhythm.",
    );
    for (const field of ["level", "tempo"]) {
      const select = this.$<HTMLSelectElement>("#rhythm-" + field);
      select.value = String(field === "level" ? this.level : this.bpm);
      select.onchange = () => {
        this.stop();
        if (field === "level") this.level = select.value as RhythmLevel;
        else this.bpm = Number(select.value);
        this.bars = makeRhythm(this.level);
        this.render();
        this.save();
      };
    }
    this.$(".rhythm-start").onclick = () => {
      if (this.state === "playing" || this.state === "countin")
        this.interrupt("controls");
      else this.start();
    };
    this.$(".rhythm-new").onclick = () => {
      this.stop();
      this.bars = makeRhythm(this.level);
      this.render();
    };
    const tap = this.$<HTMLButtonElement>(".rhythm-tap");
    tap.onpointerdown = (e) => {
      if (e.button === 0 && !tap.disabled) {
        e.preventDefault();
        this.answer(60);
      }
    };
    tap.onclick = (e) => {
      if (e.detail === 0 && !tap.disabled) this.answer(60);
    };
    tap.onkeydown = (e) => {
      if ([" ", "Enter"].includes(e.key)) {
        e.preventDefault();
        if (!e.repeat) this.answer(60);
      }
    };
    window.addEventListener("keydown", (e) => {
      if (
        this.active &&
        this.state === "playing" &&
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
    new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        const w = this.$(".sequence-score").clientWidth;
        if (this.active && w > 0 && Math.abs(w - this.width) > 2) {
          if (this.state === "playing" || this.state === "countin")
            this.interrupt("controls");
          this.render();
        }
      });
    }).observe(this.$(".sequence-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    return this.active && (this.state === "countin" || this.state === "playing")
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
      this.$(".sequence-feedback").textContent =
        "Stopped. Start again when you’re ready.";
    }
  }
  private save() { savePreferences(STORAGE, {bpm:this.bpm,level:this.level}); }
  private stop() {
    cancelAnimationFrame(this.frame);
    this.state = "ready";
    this.attempt = undefined;
    this.$<HTMLButtonElement>(".rhythm-tap").disabled = true;
    this.$(".rhythm-start").textContent = "Start";
    this.beat = this.step = -1;
    highlightScore(this.$(".rhythm-paper"), undefined, this.$(".sequence-score"));
    this.element
      .querySelectorAll(".is-beat")
      .forEach((e) => e.classList.remove("is-beat"));
    this.changed();
  }
  private render() {
    this.width = this.$(".sequence-score").clientWidth;
    if (!this.width) return;
    try {
      this.events = drawPracticeScore(
        this.$(".rhythm-paper"),
        `X:1\nM:4/4\nL:1/8\nK:C clef=perc stafflines=1\n${this.bars.map((bar) => bar.map((n) => (n.rest ? "z" : "B") + n.beats * 2).join(" ")).join(" | ")} |]\n`,
        this.width,
      );
      this.$(".sequence-feedback").textContent =
        "Two bars to count in, then your turn.";
    } catch (e) {
      this.$(".sequence-feedback").textContent =
        "The rhythm couldn’t load. Try a new rhythm.";
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
    this.$(".rhythm-start").textContent = "Stop";
    this.element
      .querySelectorAll(".rhythm-hit,.rhythm-missed")
      .forEach((e) => e.classList.remove("rhythm-hit", "rhythm-missed"));
    this.changed();
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
      this.$<HTMLButtonElement>(".rhythm-tap").disabled = false;
      this.$(".sequence-feedback").textContent = "Your turn. Keep a steady pulse.";
      this.changed();
    }
    const beat = Math.floor(
      (now - (counting ? this.countStart : this.attempt.start)) / beatMs,
    );
    if (beat !== this.beat) {
      this.beat = beat;
      this.element
        .querySelectorAll<HTMLElement>("[data-beat]")
        .forEach((e) =>
          e.classList.toggle(
            "is-beat",
            Number(e.dataset.beat) === (beat % 4) + 1,
          ),
        );
      if (counting)
        this.$(".sequence-feedback").textContent =
          `Count-in · bar ${Math.floor(beat / 4) + 1} of 2 · beat ${(beat % 4) + 1}`;
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
    this.attempt.tap(timestamp);
  }
  private finish() {
    if (!this.attempt) return;
    this.state = "complete";
    this.$<HTMLButtonElement>(".rhythm-tap").disabled = true;
    highlightScore(this.$(".rhythm-paper"), undefined, this.$(".sequence-score"));
    this.events.forEach((event, i) =>
      (event.elements || [])
        .flat()
        .filter(Boolean)
        .forEach((e) =>
          e.classList.add(
            this.attempt!.hits.has(i) ? "rhythm-hit" : "rhythm-missed",
          ),
        ),
    );
    this.$(".sequence-feedback").textContent =
      `${this.attempt.hits.size} of ${this.attempt.times.length} on the beat · ${this.attempt.missed} missed · ${this.attempt.extras} extra`;
    this.$(".rhythm-start").textContent = "Start again";
    this.changed();
  }
}
