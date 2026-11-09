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
  PATTERN_KEYS,
  type PatternSettings,
} from "./patterns-model";
import { spellPitch } from "./guitar";
import { diagnostics } from "./diagnostics";
const STORAGE = "soundtools:notecards:patterns:v1";
export class IntervalPatterns {
  readonly midiSlot: HTMLElement;
  private active = false;
  private paused = false;
  private position = 0;
  private settings: PatternSettings = {
    key: "C",
    hand: "right",
    level: "steps",
  };
  private notes: number[] = [];
  private events: NoteTimingEvent[] = [];
  private session?: WaitForMe;
  private piano: Piano;
  private width = 0;
  constructor(
    private element: HTMLElement,
    private changed: () => void,
  ) {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE) || "null");
      if (PATTERN_KEYS.some((k) => k.id === s?.key)) this.settings.key = s.key;
      if (["right", "left"].includes(s?.hand)) this.settings.hand = s.hand;
      if (["steps", "skips", "leaps"].includes(s?.level))
        this.settings.level = s.level;
    } catch {}
    element.innerHTML = `<div class="practice-controls"><label>Patterns<select id="pattern-level"><option value="steps">Steps & repeated notes</option><option value="skips">Add skips · thirds</option><option value="leaps">Add fourths & fifths</option></select></label><label>Key<select id="pattern-key">${PATTERN_KEYS.map((k) => `<option>${k.id}</option>`).join("")}</select></label><label>Hand<select id="pattern-hand"><option value="right">Right hand</option><option value="left">Left hand</option></select></label></div><section class="hymn-practice" aria-label="Interval pattern practice"><div class="hymn-top"><span>Wait for me</span><span class="pattern-count"></span></div><h2 class="hymn-title">Follow the pattern.</h2><p class="hymn-help">Find the first note, then follow the steps and skips.</p><progress class="pattern-progress" aria-label="Pattern progress"></progress><div class="hymn-score" role="region" tabindex="0" aria-label="Four-note interval pattern"><div class="pattern-paper"></div></div><p class="hymn-feedback" role="status" aria-live="polite"></p><div class="hymn-transport"><button class="pattern-pause">Pause</button><button class="pattern-again">Try again</button><button class="pattern-next">New pattern →</button></div><div class="pattern-midi-slot"></div><details><summary>On-screen piano</summary><div class="pattern-piano"></div></details></section>`;
    this.midiSlot = this.$(".pattern-midi-slot");
    this.piano = new Piano(this.$(".pattern-piano"), (n) => {
      if (this.accepting) this.answer(n);
    });
    for (const field of ["key", "hand", "level"] as const) {
      const select = this.$<HTMLSelectElement>("#pattern-" + field);
      select.value = this.settings[field];
      select.onchange = () => {
        Object.assign(this.settings, { [field]: select.value });
        this.next();
        this.save();
      };
    }
    this.$(".pattern-next").onclick = () => this.next();
    this.$(".pattern-again").onclick = () => {
      this.position = 0;
      this.paused = false;
      this.render();
    };
    this.$(".pattern-pause").onclick = () => {
      this.paused = !this.paused;
      this.interrupted();
      this.update();
    };
    new ResizeObserver(() => {
      const w = this.$(".hymn-score").clientWidth;
      if (this.active && w > 0 && Math.abs(w - this.width) > 2) this.render();
    }).observe(this.$(".hymn-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get listening() {
    return this.active && !!this.session;
  }
  get accepting() {
    return this.listening && !this.paused && !this.session!.complete;
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) {
      if (!this.notes.length) this.notes = makePattern(this.settings);
      this.render();
    } else this.interrupted();
    this.changed();
  }
  interrupted() {
    this.session?.resetGesture();
  }
  private save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(this.settings));
    } catch {
      diagnostics.offline("storage", "failed", { cacheReason: "storage" });
    }
  }
  private next() {
    this.notes = makePattern(this.settings, Math.random, this.notes);
    this.position = 0;
    this.paused = false;
    this.render();
  }
  private render() {
    this.width = this.$(".hymn-score").clientWidth;
    if (!this.width) return;
    this.session = undefined;
    this.changed();
    const music = this.notes
      .map((m) => {
        const n = spellPitch(m, this.settings.key)!;
        return (
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
      );
      this.session = new WaitForMe(eventSteps(this.events), this.position);
      this.piano.show(...keyboardRange(this.events), false);
      this.update(true);
    } catch (e) {
      this.$(".hymn-feedback").textContent =
        "The pattern couldn’t load. Try a new pattern.";
      diagnostics.capture(e, "patterns.render_failed");
      this.changed();
    }
  }
  answer(note: number, held?: readonly number[]) {
    if (!this.listening) return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "wrong") {
      this.$(".hymn-feedback").textContent =
        "Try again — follow the highlighted note.";
      return;
    }
    if (result === "restarted") this.paused = false;
    this.position = this.session!.index;
    this.update(true);
  }
  private update(scroll = false) {
    const s = this.session;
    if (!s) return;
    highlightScore(
      this.$(".pattern-paper"),
      this.events[s.index],
      this.$(".hymn-score"),
      scroll,
    );
    this.$(".pattern-count").textContent = s.complete
      ? "Complete"
      : `${s.index + 1} / ${s.steps.length}`;
    const p = this.$<HTMLProgressElement>(".pattern-progress");
    p.max = s.steps.length;
    p.value = s.index;
    this.$(".hymn-feedback").textContent = s.complete
      ? "Well done. Try a fresh pattern."
      : this.paused
        ? "Paused. Continue when you’re ready."
        : "Play the highlighted note.";
    this.$(".pattern-pause").textContent = this.paused ? "Continue" : "Pause";
    this.$<HTMLButtonElement>(".pattern-pause").disabled = s.complete;
    this.piano.setUnavailable(!this.accepting);
    this.changed();
  }
}
