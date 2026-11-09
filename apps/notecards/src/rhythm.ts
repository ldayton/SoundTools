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
import { persistence } from "./persistence";
export class RhythmPractice {
  readonly midiSlot: HTMLElement;
  private active = false;
  private result:
    | { hits: number[]; total: number; missed: number; extras: number }
    | undefined;
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
      if (
        Number.isInteger(s?.bpm) &&
        s.bpm >= 40 &&
        s.bpm <= 160 &&
        s.bpm % 5 === 0
      )
        this.bpm = s.bpm;
      if (["pulse", "long-short", "eighths"].includes(s?.level))
        this.level = s.level;
    } catch {}
    element.innerHTML = `<div class="practice-controls"><label>Rhythm<select id="rhythm-level"><option value="pulse">Steady quarter notes</option><option value="long-short">Long & short notes</option><option value="eighths">Eighth notes & rests</option></select></label><label>Tempo<select id="rhythm-tempo">${Array.from(
      { length: 25 },
      (_, i) => 40 + i * 5,
    )
      .map((n) => `<option value="${n}">${n} BPM</option>`)
      .join(
        "",
      )}</select></label></div><section class="hymn-practice" aria-label="Rhythm practice"><div class="hymn-top"><span>Rhythm only</span><span>4 bars · 4/4</span></div><h2 class="hymn-title">Find the pulse.</h2><p class="hymn-help">Tap on any piano key, press Space, or use the button. Count through the rests.</p><div class="rhythm-beats" aria-label="Beat in the bar">${[1, 2, 3, 4].map((n) => `<span data-beat="${n}">${n}</span>`).join("")}</div><div class="hymn-score" tabindex="0" role="region" aria-label="Four-bar rhythm"><div class="rhythm-paper"></div></div><p class="hymn-feedback" role="status" aria-live="polite">Two bars to count in, then your turn.</p><button class="rhythm-tap" disabled>Tap</button><div class="hymn-transport"><button class="rhythm-start">Start · 2-bar count-in</button><button class="rhythm-new">New rhythm</button></div><div class="rhythm-midi-slot"></div></section>`;
    this.midiSlot = this.$(".rhythm-midi-slot");
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
        this.interrupted();
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
      const w = this.$(".hymn-score").clientWidth;
      if (this.active && w > 0 && Math.abs(w - this.width) > 2) {
        if (this.state === "playing" || this.state === "countin")
          this.interrupted();
        this.render();
      }
    }).observe(this.$(".hymn-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get listening() {
    return (
      persistence.writable &&
      this.active &&
      (this.state === "countin" || this.state === "playing")
    );
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.interrupted();
    else {
      if (!this.bars.length) this.bars = makeRhythm(this.level);
      this.render();
    }
    this.changed();
  }
  interrupted() {
    if (this.state === "countin" || this.state === "playing") {
      this.stop();
      this.$(".hymn-feedback").textContent =
        "Paused. Start again when you’re ready.";
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
    this.$<HTMLButtonElement>(".rhythm-tap").disabled = true;
    this.$(".rhythm-start").textContent = "Start · 2-bar count-in";
    this.beat = this.step = -1;
    highlightScore(this.$(".rhythm-paper"), undefined, this.$(".hymn-score"));
    this.element
      .querySelectorAll(".is-beat")
      .forEach((e) => e.classList.remove("is-beat"));
    this.changed();
  }
  private render() {
    this.width = this.$(".hymn-score").clientWidth;
    if (!this.width) return;
    try {
      this.events = drawPracticeScore(
        this.$(".rhythm-paper"),
        `X:1\nM:4/4\nL:1/8\nK:C clef=perc stafflines=1\n${this.bars.map((bar) => bar.map((n) => (n.rest ? "z" : "B") + n.beats * 2).join(" ")).join(" | ")} |]\n`,
        this.width,
      );
      this.$(".hymn-feedback").textContent =
        "Two bars to count in, then your turn.";
      if (this.result) this.showResult();
      this.save();
    } catch (e) {
      this.$(".hymn-feedback").textContent =
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
    this.$(".rhythm-start").textContent = "Pause";
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
      this.$<HTMLButtonElement>(".rhythm-tap").disabled = false;
      this.$(".hymn-feedback").textContent = "Your turn. Keep a steady pulse.";
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
        this.$(".hymn-feedback").textContent =
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
          this.$(".hymn-score"),
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
    if (!this.listening || !this.attempt) return;
    this.attempt.tap(timestamp);
  }
  private finish() {
    if (!this.attempt) return;
    this.state = "complete";
    this.$<HTMLButtonElement>(".rhythm-tap").disabled = true;
    highlightScore(this.$(".rhythm-paper"), undefined, this.$(".hymn-score"));
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
    this.$(".hymn-feedback").textContent =
      `${this.result.hits.length} of ${this.result.total} on the beat · ${this.result.missed} missed · ${this.result.extras} extra`;
    this.$(".rhythm-start").textContent = "Try again · 2-bar count-in";
    this.changed();
  }
}
