import { newPianoAttacks, type PianoVoice } from "./piano-attacks";
import { RendererLifetime } from "./renderer-lifetime";
import { pitchLabel, type PitchSpellings } from "./sight-feedback";
import { playPianoNote, holdPianoNote, preparePianoSound } from "./piano-audio";
import { visiblePianoLayout } from "./piano-layout";
import { isBlack, keyLabel } from "./piano-model";
/** Native buttons preserve precise hit testing, focus, and screen-reader access. */
export class Piano {
  private lifetime = new RendererLifetime();
  private locked = false;
  private signature = "";
  private focusMidi = 60;
  private request?: [number, number, boolean];
  private marked?: [number, number];
  private gestures = new Map<string, { midi: number; stop(): void }>();
  private pointers = new Set<number>();
  private midiHeld = new Set<number>();
  private sustained = new Set<number>();
  private playing: readonly PianoVoice[] = [];
  private animations = new Map<number, Animation>();
  private tapTimers = new Set<number>();
  private hints?: {
    played: number;
    expected: readonly number[];
    spellings: PitchSpellings;
  };
  visibleBounds: [number, number] = [60, 83];
  contains(midi: number) {
    return this.buttons().some((b) => Number(b.dataset.piano) === midi);
  }
  dispose() {
    if (this.lifetime.disposed) return;
    this.locked = true;
    this.resetInteraction();
    this.lifetime.dispose();
  }
  constructor(
    private element: HTMLElement,
    private answer: (midi: number) => void,
    private rangeChanged: () => void = () => {},
    private options: {
      auditionWhenUnavailable?: boolean;
      interactive?: boolean;
    } = {},
  ) {
    this.lifetime.observe(element, () => this.draw());
    if (this.options.interactive) this.installInteraction();
    this.lifetime.listen(element, "click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-piano]",
      );
      if (this.options.interactive) {
        // Pointer and keyboard gestures were handled on press, not synthesized click.
        // A screen-reader activation has no preceding pointer/keyboard gesture.
        if (button && event.detail === 0) {
          const source = "activation";
          this.press(source, Number(button.dataset.piano));
          const timer = window.setTimeout(() => {
            this.tapTimers.delete(timer);
            this.release(source);
          }, 120);
          this.tapTimers.add(timer);
        }
        return;
      }
      if (button && (!this.locked || this.options.auditionWhenUnavailable)) {
        const note = Number(button.dataset.piano);
        this.focusMidi = note;
        void playPianoNote(note);
        if (!this.locked) this.answer(note);
      }
    });
    this.lifetime.listen(element, "keydown", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-piano]",
      );
      if (!button) return;
      if (event.repeat && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        return;
      }
      const keys = this.buttons();
      const index = keys.indexOf(button);
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? keys.length - 1
            : event.key === "ArrowLeft"
              ? Math.max(0, index - 1)
              : event.key === "ArrowRight"
                ? Math.min(keys.length - 1, index + 1)
                : -1;
      if (target < 0 || (this.locked && !this.options.auditionWhenUnavailable))
        return;
      event.preventDefault();
      this.focusMidi = Number(keys[target].dataset.piano);
      keys.forEach((key, i) => (key.tabIndex = i === target ? 0 : -1));
      keys[target].focus({ preventScroll: true });
    });
  }
  private installInteraction() {
    this.lifetime.listen(this.element, "pointerdown", (event) => {
      if (
        event.button !== 0 ||
        (this.locked && !this.options.auditionWhenUnavailable)
      )
        return;
      const key = (event.target as Element).closest<HTMLElement>(
        "[data-piano]",
      );
      if (!key) return;
      event.preventDefault();
      this.pointers.add(event.pointerId);
      this.element.setPointerCapture(event.pointerId);
      this.press(`pointer:${event.pointerId}`, Number(key.dataset.piano));
    });
    this.lifetime.listen(window, "pointermove", (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const key = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-piano]");
      const source = `pointer:${event.pointerId}`;
      if (key && this.element.contains(key))
        this.press(source, Number(key.dataset.piano));
      else this.release(source);
    });
    const end = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      this.release(`pointer:${event.pointerId}`);
      if (this.element.hasPointerCapture(event.pointerId))
        this.element.releasePointerCapture(event.pointerId);
    };
    this.lifetime.listen(window, "pointerup", end);
    this.lifetime.listen(window, "pointercancel", end);
    this.lifetime.listen(this.element, "lostpointercapture", end);
    this.lifetime.listen(this.element, "keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      const key = (event.target as Element).closest<HTMLElement>(
        "[data-piano]",
      );
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat)
        this.press(`key:${event.key}`, Number(key.dataset.piano));
    });
    this.lifetime.listen(window, "keyup", (event) =>
      this.release(`key:${event.key}`),
    );
    this.lifetime.listen(window, "blur", () => this.resetInteraction());
    this.lifetime.listen(window, "pagehide", () => this.resetInteraction());
    this.lifetime.listen(document, "visibilitychange", () => {
      if (document.hidden) this.resetInteraction();
    });
  }
  get heldPitches(): number[] {
    return [
      ...new Set([
        ...this.midiHeld,
        ...[...this.gestures.values()].map((g) => g.midi),
      ]),
    ];
  }
  private press(source: string, midi: number) {
    if (this.gestures.get(source)?.midi === midi) return;
    this.release(source);
    if (this.locked && !this.options.auditionWhenUnavailable) return;
    const alreadyHeld = this.heldPitches.includes(midi);
    this.focusMidi = midi;
    this.gestures.set(source, { midi, stop: holdPianoNote(midi) });
    this.paintInteraction();
    if (!alreadyHeld) {
      this.strike(midi);
      if (!this.locked) this.answer(midi);
    }
  }
  private release(source: string) {
    const gesture = this.gestures.get(source);
    if (!gesture) return;
    gesture.stop();
    this.gestures.delete(source);
    this.paintInteraction();
  }
  setMidiKeys(keys: { held: readonly number[]; sustained: readonly number[] }) {
    const previous = this.midiHeld;
    this.midiHeld = new Set(keys.held);
    this.sustained = new Set(keys.sustained);
    this.paintInteraction();
    for (const midi of this.midiHeld)
      if (!previous.has(midi)) this.strike(midi);
  }
  /** Playback attacks are separate from held keys and coaching marks; ties keep their onset. */
  setPlayback(notes: readonly PianoVoice[]) {
    const previous = this.playing;
    this.playing = notes;
    this.paintInteraction();
    for (const midi of newPianoAttacks(previous, notes)) this.strike(midi);
    for (const note of previous)
      if (!notes.some((next) => next.pitch === note.pitch)) {
        this.animations.get(note.pitch)?.cancel();
        this.animations.delete(note.pitch);
      }
  }
  resetInteraction() {
    for (const timer of this.tapTimers) clearTimeout(timer);
    this.tapTimers.clear();
    for (const id of this.pointers)
      if (this.element.hasPointerCapture(id))
        this.element.releasePointerCapture(id);
    this.pointers.clear();
    for (const source of [...this.gestures.keys()]) this.release(source);
    this.midiHeld.clear();
    this.sustained.clear();
    this.playing = [];
    for (const animation of this.animations.values()) animation.cancel();
    this.animations.clear();
    this.paintInteraction();
  }
  private paintInteraction() {
    if (!this.options.interactive) return;
    const held = new Set(this.heldPitches);
    for (const key of this.buttons()) {
      const midi = Number(key.dataset.piano);
      key.classList.toggle("is-held", held.has(midi));
      key.classList.toggle(
        "is-sustained",
        !held.has(midi) && this.sustained.has(midi),
      );
      key.classList.toggle(
        "is-playing",
        this.playing.some((note) => note.pitch === midi),
      );
      key.setAttribute("aria-pressed", String(held.has(midi)));
    }
  }
  private strike(midi: number) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const key = this.buttons().find(
      (key) => Number(key.dataset.piano) === midi,
    );
    if (!key) return;
    this.animations.get(midi)?.cancel();
    const animation = key.animate(
      [{ filter: "brightness(0.75)" }, { filter: "brightness(1)" }],
      { duration: 120 },
    );
    this.animations.set(midi, animation);
    animation.onfinish = () => {
      if (this.animations.get(midi) === animation) this.animations.delete(midi);
    };
  }
  private buttons() {
    return [
      ...this.element.querySelectorAll<HTMLButtonElement>("[data-piano]"),
    ];
  }
  show(
    low: number,
    high: number,
    named: boolean,
    preserveFocus = false,
    preserveHint = false,
  ) {
    if (!preserveHint) this.clearHint();
    const hadFocus = this.element.contains(document.activeElement);
    this.request = [low, high, named];
    this.locked = false;
    this.marked = undefined;
    this.draw();
    if (!preserveFocus || !this.contains(this.focusMidi))
      this.focusMidi = this.visibleBounds[0];
    for (const b of this.buttons()) {
      b.classList.remove("is-right", "is-wrong", "answer-hover");
      b.setAttribute("aria-disabled", "false");
      b.tabIndex = Number(b.dataset.piano) === this.focusMidi ? 0 : -1;
    }
    this.paintHint();
    this.rangeChanged();
    if (hadFocus)
      this.buttons()
        .find((b) => Number(b.dataset.piano) === this.focusMidi)
        ?.focus({ preventScroll: true });
  }
  private draw() {
    if (!this.request) return;
    const style = getComputedStyle(this.element);
    const width =
      this.element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    if (width <= 0) return;
    preparePianoSound();
    const [requestedLow, requestedHigh, named] = this.request;
    const layout = visiblePianoLayout(
      width,
      requestedLow,
      requestedHigh,
      named,
      matchMedia("(max-width: 600px)").matches,
    );
    const { low, high, rows: ranges, whiteWidth } = layout;
    const signature = JSON.stringify(layout) + named;
    if (signature === this.signature) return;
    const hadFocus = this.element.contains(document.activeElement);
    const selected = this.buttons()
      .filter((b) => b.classList.contains("sight-key-selected"))
      .map((b) => b.dataset.piano);
    this.signature = signature;
    this.visibleBounds = [low, high];
    {
      const rows: string[] = [];
      for (const [start, end] of ranges) {
        const whites = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        ).filter((n) => !isBlack(n));
        const keys = Array.from(
          { length: end - start + 1 },
          (_, i) => start + i,
        )
          .map((midi) => {
            const black = isBlack(midi),
              index = whites.filter((n) => n < midi).length;
            const position = black
              ? `left:calc(${index} * var(--white) - var(--black) / 2)`
              : `left:calc(${index} * var(--white))`;
            return `<button type="button" class="piano-key ${black ? "black-key" : "white-key"}" data-piano="${midi}" aria-label="${keyLabel(midi, !named)}" tabindex="-1" style="${position}">${midi % 12 === 0 ? `<span class="piano-landmark">C${Math.floor(midi / 12) - 1}</span>` : ""}</button>`;
          })
          .join("");
        rows.push(
          `<div class="piano-octave" style="--whites:${whites.length};--white:${whiteWidth}px;width:${whites.length * whiteWidth}px"><div class="piano-keys">${keys}</div></div>`,
        );
      }
      this.element.innerHTML = `<div class="piano-layout ${named ? "piano-named" : "piano-staff"}" role="group" aria-label="Piano answer keys">${rows.join("")}</div>`;
    }
    if (!this.contains(this.focusMidi)) this.focusMidi = low;
    this.setUnavailable(this.locked);
    for (const b of this.buttons())
      b.tabIndex = Number(b.dataset.piano) === this.focusMidi ? 0 : -1;
    for (const b of this.buttons())
      b.classList.toggle(
        "sight-key-selected",
        selected.includes(b.dataset.piano),
      );
    this.paintHint();
    this.paintInteraction();
    if (this.marked) {
      const locked = this.locked;
      this.feedback(...this.marked);
      this.setUnavailable(locked);
    }
    if (hadFocus)
      this.buttons()
        .find((b) => Number(b.dataset.piano) === this.focusMidi)
        ?.focus({ preventScroll: true });
    this.rangeChanged();
  }
  setUnavailable(unavailable: boolean) {
    this.locked = unavailable;
    for (const button of this.buttons())
      button.setAttribute(
        "aria-disabled",
        String(unavailable && !this.options.auditionWhenUnavailable),
      );
  }
  /** Non-blocking coaching: the learner can retry the same onset immediately. */
  hint(
    played: number,
    expected: readonly number[],
    spellings: PitchSpellings = {},
  ) {
    this.clearHint();
    this.hints = { played, expected, spellings };
    this.paintHint();
  }
  clearHint() {
    if (!this.hints) return;
    this.hints = undefined;
    for (const b of this.buttons()) {
      b.classList.remove("is-right", "is-wrong", "piano-hint");
      b.querySelector(".piano-hint-label")?.remove();
    }
  }
  private paintHint() {
    if (!this.hints) return;
    const { played, expected, spellings } = this.hints;
    for (const b of this.buttons()) {
      const midi = Number(b.dataset.piano);
      const right = expected.includes(midi),
        wrong = midi === played && !right;
      b.classList.toggle("is-right", right);
      b.classList.toggle("is-wrong", wrong);
      b.classList.toggle("piano-hint", right || wrong);
      b.querySelector(".piano-hint-label")?.remove();
      if (right || wrong) {
        const label = document.createElement("span");
        label.className = "piano-hint-label";
        label.textContent = pitchLabel(midi, spellings).split(" / ")[0];
        b.append(label);
      }
    }
  }
  feedback(selected: number, correct: number) {
    this.locked = true;
    this.marked = [selected, correct];
    for (const button of this.buttons()) {
      const midi = Number(button.dataset.piano);
      button.setAttribute(
        "aria-disabled",
        String(!this.options.auditionWhenUnavailable),
      );
      button.classList.remove("answer-hover");
      button.classList.toggle("is-right", midi === correct);
      button.classList.toggle(
        "is-wrong",
        midi === selected && selected !== correct,
      );
    }
  }
}
