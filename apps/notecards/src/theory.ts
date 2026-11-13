import { Piano } from "./piano";
import { mountPracticePiano, isPianoVisible } from "./practice-piano";
import { mountPracticeOptions } from "./practice-controls";
import { drawPracticeScore } from "./practice-score";
import { RangePicker } from "./range-picker";
import { persistence } from "./persistence";
import { PracticeSession, type SessionSnapshot } from "./session";
import { defaultProgress, loadProgress, type Progress } from "./progress";
import { KEYS, ROUND_LENGTHS, name } from "./model";
import { diagnostics } from "./diagnostics";
import type { LivePractice, InputPolicy, Interruption } from "./live-practice";
import type { PracticeRoute } from "./navigation";
import {
  TASKS,
  POSITIONS,
  theoryPool,
  questionAnswer,
  theoryExplanation,
  ordinal,
  scaleNotes,
  taskSettings,
  intervalWalk,
  intervalAnswers,
  type TheoryKind,
  type TheoryTask,
  type TheorySettings,
  type TheoryQuestion,
  type TheoryNote,
} from "./theory-model";
type SavedRound = {
  settings: string;
  snapshot: SessionSnapshot;
  step: number;
  firstTry: boolean;
};
function abcNote(n: TheoryNote, includeAccidental = true) {
  return (
    (includeAccidental
      ? n.modifier === 1
        ? "^"
        : n.modifier === -1
          ? "_"
          : ""
      : "") +
    (n.octave >= 5 ? n.letter.toLowerCase() : n.letter) +
    (n.octave >= 5 ? "'".repeat(n.octave - 5) : ",".repeat(4 - n.octave))
  );
}
/** Shared theory round/input owner. Only the question model varies between the two pages. */
class TheoryPractice implements LivePractice {
  private active = false;
  private task: TheoryTask;
  private profiles: Partial<Record<TheoryTask, TheorySettings>> = {};
  private rounds: Partial<Record<TheoryTask, SavedRound>> = {};
  private progress: Progress = defaultProgress();
  private session!: PracticeSession<TheoryQuestion>;
  private step = 0;
  private firstTry = true;
  private piano: Piano;
  private panel: ReturnType<typeof mountPracticePiano>;
  private width = 0;
  private range: RangePicker[] = [];
  private lastFeedback = "";
  private selectedInterval: number | undefined;
  private resetPianoFocus = true;
  private lastKeys: [number, number] | undefined;
  private advanceTimer: number | undefined;
  private pendingAdvance = false;
  constructor(
    private element: HTMLElement,
    private changed: () => void,
    private kind: TheoryKind,
  ) {
    this.task = TASKS[kind][0][0];
    const saved = persistence.read<any>("theory-" + kind);
    if (saved?.version === 1) {
      for (const [task] of TASKS[kind])
        this.profiles[task] = taskSettings(task, saved.profiles?.[task]);
      if (TASKS[kind].some(([t]) => t === saved.task)) this.task = saved.task;
      if (
        kind === "intervals" &&
        saved.profiles?.["name-interval"]?.quality &&
        saved.profiles["name-interval"].quality !== "number" &&
        !saved.profiles?.["name-quality"]
      ) {
        this.profiles["name-quality"] = taskSettings(
          "name-quality",
          saved.profiles["name-interval"],
        );
        if (this.task === "name-interval") this.task = "name-quality";
      }
      if (saved.rounds && typeof saved.rounds === "object")
        this.rounds = saved.rounds;
      this.progress = loadProgress(JSON.stringify(saved.progress));
    }
    const label = (text: string, control: string, cls = "") =>
      `<label class="${cls}">${text}${control}</label>`;
    const select = (
      id: string,
      values: readonly (readonly [string, string])[],
    ) =>
      `<select data-field="${id}">${values.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>`;
    const fields =
      label("Task", select("task", TASKS[kind]), "theory-task-field") +
      label(
        "Cards per round",
        select(
          "roundLength",
          ROUND_LENGTHS.map((n) => [String(n), String(n)]),
        ),
        "round-length",
      ) +
      label(
        "Staff",
        select("clef", [
          ["treble", "Treble"],
          ["bass", "Bass"],
        ]),
      ) +
      (kind === "scales"
        ? label(
            "Scale",
            select("mode", [
              ["major", "Major"],
              ["minor", "Natural minor"],
            ]),
          )
        : label(
            "Build",
            select("quality", [
              ["number", "Within a key"],
              ["basic", "Named interval"],
            ]),
            "theory-quality-field",
          ) +
          label(
            "Key",
            select(
              "intervalKey",
              KEYS.map((k) => [k.id, k.label.split(" ·")[0]]),
            ),
            "theory-interval-key",
          )) +
      label(
        "Direction",
        select("direction", [
          ["up", "Rising"],
          ["down", "Falling"],
          ["both", "Both"],
        ]),
        "theory-direction",
      ) +
      (kind === "intervals"
        ? label(
            "Show notes",
            select("presentation", [
              ["successive", "In sequence"],
              ["together", "Together"],
            ]),
            "theory-presentation",
          ) +
          label(
            "Accidentals",
            select("accidentals", [
              ["naturals", "Natural notes"],
              ["simple", "Sharps & flats"],
            ]),
            "theory-accidentals",
          )
        : "");
    const choices = (
      id: string,
      title: string,
      values: readonly (readonly [string, string])[],
    ) =>
      `<fieldset class="theory-choices" data-choices="${id}"><legend>${title}</legend><div>${values.map(([v, l]) => `<button type="button" data-choice="${v}" aria-pressed="false">${l}</button>`).join("")}</div></fieldset>`;
    element.innerHTML = `<div class="theory-options"><div class="options-row">${fields}</div>${
      kind === "scales"
        ? choices(
            "degrees",
            "Degrees",
            [1, 2, 3, 4, 5, 6, 7].map((n) => [String(n), String(n)]),
          ) +
          choices(
            "keys",
            "Keys",
            KEYS.map((k) => [k.id, k.label.split(" ·")[0]]),
          )
        : choices(
            "intervals",
            "Intervals",
            [2, 3, 4, 5, 6, 7, 8].map((n) => [String(n), ordinal(n)]),
          ) +
          `<div class="theory-quality-choices">${choices(
            "qualities",
            "Qualities",
            [
              ["major", "Major"],
              ["minor", "Minor"],
              ["perfect", "Perfect"],
            ],
          )}<details class="disclosure theory-advanced"><summary>Advanced qualities</summary>${choices(
            "advancedQualities",
            "Include",
            [
              ["augmented", "Augmented"],
              ["diminished", "Diminished"],
            ],
          )}</details></div>` +
          `<div class="range theory-range">${["low", "high"].map((f, i) => `<div><label for="${kind}-${f}">${i ? "Highest" : "Lowest"}</label><div class="note-field"><input id="${kind}-${f}" aria-label="${i ? "Highest" : "Lowest"} note" readonly><button type="button" id="${kind}-${f}-choose" aria-label="Choose ${i ? "highest" : "lowest"} note">⌄</button></div></div>`).join("")}</div>`
    }<details class="theory-example disclosure"><summary>Example</summary><p>${kind === "scales" ? "In C major, C is degree 1. Count C–D–E to find degree 3. Every major scale uses whole–whole–half–whole–whole–whole–half steps." : "Count both notes: C–D is a second; C–D–E is a third. Interval numbers count letter names. A unison repeats the same note; practice starts with seconds. Major, minor and perfect describe their semitone distances. Full interval naming starts with major versus minor thirds."}</p></details></div><section class="sequence-practice theory-surface" aria-label="${kind === "scales" ? "Scale and degree" : "Interval"} practice"><div class="sequence-top"><span class="theory-context"></span><span class="theory-count"></span></div><progress class="theory-progress" aria-label="Session progress"></progress><p class="sequence-feedback" role="status" aria-live="polite"></p><div class="theory-notation" role="img" aria-label="Theory question"></div><div class="theory-steps" aria-label="Scale progress"></div><div class="theory-answers" aria-label="Answer choices"></div><p class="theory-explanation" role="status" hidden></p><div class="theory-walk" role="img" aria-label="Counted staff positions" hidden></div><p class="theory-midi-notice" hidden></p><div class="sequence-transport"><button type="button" class="theory-next" hidden>Next question →</button><button type="button" class="theory-restart">Start again</button></div><div class="theory-piano"></div><div class="theory-summary" hidden><h2>Round complete</h2><p></p><button type="button" class="primary theory-continue">Keep going →</button><p class="theory-suggestion"></p></div></section>`;
    if (kind === "scales") {
      const group = this.$('[data-choices="keys"]');
      const disclosure = document.createElement("details");
      disclosure.className = "disclosure theory-key-options";
      const summary = document.createElement("summary");
      disclosure.append(summary);
      group.before(disclosure);
      disclosure.append(group);
    }
    mountPracticeOptions(element, [this.$(".theory-options")]);
    this.panel = mountPracticePiano(
      this.$(".theory-piano"),
      this.$(".sequence-transport"),
      { changed: () => this.rangeNotice() },
    );
    this.piano = new Piano(
      this.$(".theory-piano"),
      (n) => this.answer(n),
      () => this.rangeNotice(),
    );
    if (kind === "intervals")
      for (const f of ["low", "high"] as const)
        this.range.push(
          new RangePicker(
            this.$(`#${kind}-${f}`),
            this.$(`#${kind}-${f}-choose`),
            (note) => {
              const s = this.settings;
              s[f] = note;
              if (POSITIONS.indexOf(s.low) > POSITIONS.indexOf(s.high))
                s[f === "low" ? "high" : "low"] = note;
              this.reset();
            },
            POSITIONS,
          ),
        );
    for (const field of this.element.querySelectorAll<HTMLSelectElement>(
      "[data-field]",
    ))
      field.onchange = () => {
        if (field.dataset.field === "task") {
          this.save();
          this.task = field.value as TheoryTask;
          const url = new URL(location.href);
          url.searchParams.set("task", this.task);
          history.replaceState({}, "", url);
          this.loadRound();
        } else {
          const id = field.dataset.field as keyof TheorySettings;
          Object.assign(this.settings, {
            [id]: id === "roundLength" ? Number(field.value) : field.value,
          });
          if (id === "clef") {
            this.settings.low = field.value === "bass" ? "C3" : "C4";
            this.settings.high = field.value === "bass" ? "C4" : "C5";
          }
          this.reset();
        }
        this.render();
      };
    for (const group of this.element.querySelectorAll<HTMLElement>(
      "[data-choices]",
    ))
      group.onclick = (event) => {
        const b = (event.target as HTMLElement).closest<HTMLButtonElement>(
          "[data-choice]",
        );
        if (!b) return;
        const id =
          group.dataset.choices === "advancedQualities"
            ? "qualities"
            : (group.dataset.choices as
                "keys" | "degrees" | "intervals" | "qualities");
        const value =
          id === "keys" || id === "qualities"
            ? b.dataset.choice!
            : Number(b.dataset.choice);
        const values = [...this.settings[id]] as (string | number)[];
        if (values.includes(value)) {
          if (values.length === 1) return;
          values.splice(values.indexOf(value), 1);
        } else values.push(value);
        Object.assign(this.settings, { [id]: values });
        this.reset();
      };
    this.$(".theory-next").onclick = () => this.nextQuestion();
    this.$(".theory-restart").onclick = () => this.reset();
    this.$(".theory-continue").onclick = () => {
      this.resetPianoFocus = true;
      this.lastKeys = undefined;
      this.session.continueRound();
      this.session.next();
      this.step = 0;
      this.firstTry = true;
      this.save();
      this.render();
    };
    this.$(".theory-answers").onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-answer]",
      );
      if (b?.dataset.answer === "back") {
        this.selectedInterval = undefined;
        this.render();
      } else if (b) this.identify(b.dataset.answer!);
    };
    window.addEventListener("keydown", (e) => {
      if (
        !this.active ||
        !this.identifying ||
        !this.session?.accepting ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.hidden ||
        document.querySelector(
          '[role="dialog"][aria-modal="true"],.keyboard-menu[aria-expanded="true"]',
        ) ||
        (e.target as Element).closest(
          "input,select,textarea,button,summary,[contenteditable]",
        )
      )
        return;
      if (/^[1-8]$/.test(e.key)) {
        const matching = [
          ...this.$(".theory-answers").querySelectorAll<HTMLButtonElement>(
            "[data-answer]",
          ),
        ].filter((b) => b.dataset.number === e.key);
        if (matching.length === 1) {
          e.preventDefault();
          this.identify(matching[0].dataset.answer!);
        }
      } else {
        const answer = [
          ...this.$(".theory-answers").querySelectorAll<HTMLButtonElement>(
            "[data-key]",
          ),
        ].find((b) => b.dataset.key === e.key);
        if (answer) {
          e.preventDefault();
          this.identify(answer.dataset.answer!);
        }
      }
    });
    new ResizeObserver(() =>
      requestAnimationFrame(() => {
        if (
          this.active &&
          this.$(".theory-notation").clientWidth !== this.width
        )
          this.draw();
      }),
    ).observe(this.$(".theory-notation"));
    this.loadRound();
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  private get settings() {
    return (this.profiles[this.task] ||= taskSettings(this.task));
  }
  private get identifying() {
    return this.task.startsWith("name-");
  }
  get inputPolicy(): InputPolicy {
    return this.active &&
      persistence.writable &&
      !this.identifying &&
      this.session?.accepting &&
      this.session.current
      ? "answer"
      : "none";
  }
  applyRoute(route: PracticeRoute) {
    const task = route.query.get("task");
    if (task && !TASKS[this.kind].some(([t]) => t === task)) return false;
    if (task && task !== this.task) {
      this.save();
      this.task = task as TheoryTask;
      this.loadRound();
    }
    return true;
  }
  enter() {
    this.active = true;
    this.scheduleAdvance();
    this.render();
    this.save();
    this.changed();
  }
  leave() {
    this.active = false;
    this.cancelAdvance();
    this.save();
    this.changed();
  }
  interrupt(_reason: Interruption) {
    if (this.pendingAdvance) {
      this.cancelAdvance();
      this.render();
    }
  }
  private cancelAdvance() {
    window.clearTimeout(this.advanceTimer);
    this.advanceTimer = undefined;
    this.pendingAdvance = false;
  }
  private nextQuestion() {
    this.cancelAdvance();
    this.session.next();
    this.resetPianoFocus = true;
    this.lastKeys = undefined;
    this.selectedInterval = undefined;
    this.step = 0;
    this.firstTry = true;
    this.lastFeedback = "";
    this.save();
    this.render();
  }
  private scheduleAdvance() {
    this.cancelAdvance();
    if (
      !this.active ||
      !persistence.writable ||
      this.session?.status !== "feedback" ||
      (this.identifying && !this.session.feedback?.correct) ||
      document.hidden ||
      !document.hasFocus() ||
      document.querySelector(
        '[role="dialog"][aria-modal="true"],.keyboard-menu[aria-expanded="true"]',
      )
    )
      return;
    const session = this.session,
      task = this.task;
    this.pendingAdvance = true;
    this.advanceTimer = window.setTimeout(
      () => {
        if (
          this.active &&
          this.session === session &&
          this.task === task &&
          !document.hidden &&
          document.hasFocus() &&
          persistence.writable &&
          !document.querySelector(
            '[role="dialog"][aria-modal="true"],.keyboard-menu[aria-expanded="true"]',
          )
        )
          this.nextQuestion();
        else {
          this.cancelAdvance();
          this.render();
        }
      },
      this.session.feedback?.correct ? 600 : 900,
    );
  }
  private loadRound() {
    this.cancelAdvance();
    const s = this.settings;
    this.progress.roundLength = s.roundLength;
    const pool = theoryPool(this.task, s),
      saved = this.rounds[this.task];
    const snapshot =
      saved?.settings === JSON.stringify(s) ? saved.snapshot : undefined;
    const restored = PracticeSession.restore(
      pool,
      this.progress,
      `theory-${this.kind}:`,
      snapshot,
    );
    this.session =
      restored ||
      new PracticeSession(pool, this.progress, `theory-${this.kind}:`);
    if (!this.session.current && !this.session.complete) this.session.next();
    this.step =
      restored &&
      Number.isInteger(saved?.step) &&
      saved!.step >= 0 &&
      saved!.step <= (this.session.current?.notes.length || 1)
        ? saved!.step
        : 0;
    this.firstTry = restored ? saved?.firstTry !== false : true;
    this.lastFeedback = "";
    this.resetPianoFocus = true;
    this.lastKeys = undefined;
    this.selectedInterval = undefined;
  }
  private reset() {
    this.profiles[this.task] = taskSettings(this.task, this.settings);
    delete this.rounds[this.task];
    this.loadRound();
    this.step = 0;
    this.firstTry = true;
    this.lastFeedback = "";
    this.save();
    this.render();
  }
  private save() {
    if (this.session)
      this.rounds[this.task] = {
        settings: JSON.stringify(this.settings),
        snapshot: this.session.snapshot(),
        step: this.step,
        firstTry: this.firstTry,
      };
    persistence.write("theory-" + this.kind, {
      version: 1,
      task: this.task,
      profiles: this.profiles,
      rounds: this.rounds,
      progress: this.progress,
    });
  }
  private identify(answer: string) {
    if (
      !this.active ||
      !persistence.writable ||
      !this.session.accepting ||
      !this.identifying ||
      !this.session.current
    )
      return;
    if (answer.startsWith("select-")) {
      const choices = intervalAnswers(this.settings).filter(
        (a) => a.size === Number(answer.slice(7)),
      );
      if (choices.length === 1)
        answer = `${choices[0].quality} ${ordinal(choices[0].size)}`;
      else {
        this.selectedInterval = Number(answer.slice(7));
        this.render();
        return;
      }
    }
    const q = this.session.current,
      correct = answer === questionAnswer(q, this.task, this.settings);
    this.session.submit(correct);
    this.session.feedback = {
      correct,
      text: theoryExplanation(q, this.task, this.settings),
    };
    this.save();
    this.scheduleAdvance();
    this.render();
    diagnostics.event("practice.answered", { correct });
  }
  answer(midi: number) {
    if (
      this.inputPolicy !== "answer" ||
      !Number.isInteger(midi) ||
      midi < 0 ||
      midi > 127
    )
      return;
    const q = this.session.current!;
    const target =
      this.task === "build-scale"
        ? q.notes[this.step].midi
        : q.notes[this.task === "build-interval" ? 1 : q.degree! - 1].midi;
    const correct =
      this.task === "play-degree"
        ? midi % 12 === (target + 120) % 12
        : midi === target;
    this.lastKeys =
      this.task === "play-degree"
        ? [60 + (midi % 12), 60 + (((target % 12) + 12) % 12)]
        : [midi, target];
    if (!correct) {
      this.firstTry = false;
      this.lastFeedback = `Try ${name(this.task === "build-scale" ? q.notes[this.step] : q)}${this.task === "play-degree" ? "" : this.task === "build-scale" ? q.notes[this.step].octave : q.octave}.`;
    } else if (this.task === "build-scale" && ++this.step < q.notes.length) {
      this.lastFeedback = "";
    } else {
      this.session.submit(this.firstTry);
      this.session.feedback = {
        correct: this.firstTry,
        text: theoryExplanation(q, this.task, this.settings),
      };
      this.lastFeedback = "";
    }
    this.save();
    if (!this.session.accepting) this.scheduleAdvance();
    this.render();
  }
  private rangeNotice() {
    if (!this.piano || !this.session?.current) return;
    const q = this.session.current,
      target =
        this.task === "build-scale"
          ? q.notes[Math.min(this.step, 7)].midi
          : q.notes[this.task === "build-interval" ? 1 : (q.degree || 1) - 1]
              .midi;
    const unavailable =
      !this.identifying &&
      this.task !== "play-degree" &&
      isPianoVisible() &&
      !this.piano.contains(target);
    this.$(".theory-midi-notice").hidden = !unavailable;
    this.$(".theory-midi-notice").textContent =
      "This note needs a MIDI keyboard. You can also narrow the pitch range.";
  }
  private render() {
    if (!this.session) return;
    const s = this.settings,
      q = this.session.current;
    for (const field of this.element.querySelectorAll<HTMLSelectElement>(
      "[data-field]",
    ))
      field.value = String(
        field.dataset.field === "task"
          ? this.task
          : s[field.dataset.field as keyof TheorySettings],
      );
    for (const group of this.element.querySelectorAll<HTMLElement>(
      "[data-choices]",
    )) {
      const id =
        group.dataset.choices === "advancedQualities"
          ? "qualities"
          : (group.dataset.choices as
              "keys" | "degrees" | "intervals" | "qualities");
      group.hidden = id === "degrees" && this.task === "build-scale";
      for (const b of group.querySelectorAll<HTMLButtonElement>(
        "[data-choice]",
      )) {
        const value =
          id === "keys" || id === "qualities"
            ? b.dataset.choice!
            : Number(b.dataset.choice);
        b.hidden =
          id === "qualities" &&
          (b.dataset.choice === "perfect"
            ? !s.intervals.some((n) => [4, 5, 8].includes(n))
            : ["major", "minor"].includes(b.dataset.choice!) &&
              s.intervals.every((n) => [4, 5, 8].includes(n)));
        b.setAttribute(
          "aria-pressed",
          String((s[id] as (string | number)[]).includes(value)),
        );
        if (id === "keys")
          b.textContent = `${name(scaleNotes(b.dataset.choice!, s.mode, 4)[0])} ${s.mode === "minor" ? "minor" : "major"}`;
      }
    }
    if (this.kind === "scales") {
      const selected = s.keys.map(
        (k) =>
          `${name(scaleNotes(k, s.mode, 4)[0])} ${s.mode === "minor" ? "minor" : "major"}`,
      );
      this.$(".theory-key-options summary").textContent =
        `Keys · ${selected.length <= 3 ? selected.join(", ") : selected.length + " selected"}`;
    }
    this.$(".theory-direction").hidden =
      this.kind === "scales"
        ? this.task !== "build-scale"
        : this.identifying && s.presentation === "together";
    if (this.kind === "intervals") {
      const namingQuality =
        this.task === "name-quality" ||
        (this.task === "build-interval" && s.quality !== "number");
      this.$(".theory-quality-field").hidden = this.task !== "build-interval";
      this.$(".theory-interval-key").hidden =
        this.task !== "build-interval" || s.quality !== "number";
      this.$(".theory-quality-choices").hidden = !namingQuality;
      this.$(".theory-accidentals").hidden =
        this.task === "build-interval" && s.quality === "number";
      this.$(".theory-presentation").hidden = !this.identifying;
      this.range[0].setValue(s.low);
      this.range[1].setValue(s.high);
    }
    this.$(".theory-count").textContent =
      `${Math.min(this.session.answered + (this.session.accepting ? 1 : 0), this.session.length)} / ${this.session.length}`;
    const progress = this.$<HTMLProgressElement>(".theory-progress");
    progress.max = this.session.length;
    progress.value = this.session.answered;
    const complete = !q && this.session.complete;
    this.$(".theory-summary").hidden = !complete;
    this.$(".theory-summary > p").textContent =
      `${this.session.correct} of ${this.session.length} correct on the first try.`;
    this.$(".theory-suggestion").textContent =
      this.kind === "scales"
        ? "When this feels comfortable, add another degree or key in Practice options."
        : this.task === "name-interval"
          ? Math.max(...s.intervals) <= 3
            ? "Next, try adding fourths and fifths."
            : Math.max(...s.intervals) <= 5
              ? "Next, try sixths, sevenths and octaves."
              : "Try naming the full interval when these distances feel familiar."
          : "Expand your set when these intervals feel familiar.";
    this.$(".theory-next").hidden =
      !q || this.session.accepting || this.pendingAdvance;
    this.$(".theory-notation").hidden = !q;
    this.$(".theory-answers").hidden = !q || !this.identifying;
    this.$(".theory-steps").hidden = !q || this.task !== "build-scale";
    this.$(".theory-explanation").hidden =
      !q || (this.session.accepting && this.firstTry);
    this.$(".theory-walk").hidden =
      !q?.interval || (this.session.accepting && this.firstTry);
    this.$(".theory-explanation").textContent = q
      ? theoryExplanation(q, this.task, s)
      : "";
    this.panel.setAvailable(!!q && !this.identifying);
    this.$(".theory-midi-notice").hidden = true;
    this.$(".theory-context").textContent =
      q?.keyName ||
      (this.task === "name-interval"
        ? "Read the distance"
        : "Name the full interval");
    if (!q) {
      this.$(".sequence-feedback").textContent = this.session.pool.length
        ? "Round complete."
        : this.task === "name-quality" && intervalAnswers(s).length < 2
          ? "Choose at least two interval answers to compare."
          : "No questions fit these options. Choose matching interval sizes and qualities, or widen the range.";
      this.changed();
      return;
    }
    const root = q.notes[0];
    const prompt =
      this.task === "name-degree"
        ? `Which degree is this in ${q.keyName}?`
        : this.task === "play-degree"
          ? `Play degree ${q.degree} in ${q.keyName}.`
          : this.task === "build-scale"
            ? `Build ${q.keyName} · ${q.direction === "up" ? "rising" : "falling"} · play degree ${q.direction === "up" ? Math.min(this.step + 1, 8) : Math.max(8 - this.step, 1)}.`
            : this.task === "name-interval"
              ? "How far apart are these notes?"
              : this.task === "name-quality"
                ? "Name the full interval."
                : `${s.quality === "number" ? "In " + q.keyName + ", play" : "Play"} ${(q.quality === "augmented" && s.quality !== "number") || (q.interval === 8 && s.quality === "number") ? "an" : "a"} ${s.quality === "number" ? "" : q.quality + " "}${ordinal(q.interval!)} ${q.direction === "up" ? "above" : "below"} ${name(root)}${root.octave}.`;
    this.$(".sequence-feedback").textContent = this.session.accepting
      ? this.lastFeedback || prompt
      : this.session.feedback?.correct
        ? "Correct."
        : this.identifying
          ? "Not quite."
          : "Correct — after correction.";
    this.$(".theory-answers").replaceChildren();
    const size =
      s.intervals.length === 1 ? s.intervals[0] : this.selectedInterval;
    const fullAnswers = intervalAnswers(s);
    const directFull = fullAnswers.length <= 8;
    const answers: string[][] =
      this.task === "name-degree"
        ? s.degrees.map((n) => [String(n), String(n), String(n)])
        : this.task === "name-interval"
          ? s.intervals.map((n) => [ordinal(n), String(n), ordinal(n)])
          : directFull
            ? fullAnswers.map((a) => [
                `${a.quality} ${ordinal(a.size)}`,
                fullAnswers.filter((b) => b.size === a.size).length === 1
                  ? String(a.size)
                  : "",
                `${a.quality} ${ordinal(a.size)}`,
              ])
            : size === undefined
              ? s.intervals.map((n) => [`select-${n}`, String(n), ordinal(n)])
              : fullAnswers
                  .filter((a) => a.size === size)
                  .map((a) => [
                    `${a.quality} ${ordinal(size)}`,
                    "",
                    `${a.quality} ${ordinal(size)}`,
                  ]);
    if (
      this.selectedInterval !== undefined &&
      this.session.accepting &&
      this.task === "name-quality" &&
      !directFull &&
      s.intervals.length > 1
    )
      answers.push(["back", "", "Change interval"]);
    for (const [value, number, label] of answers) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.answer = value;
      b.dataset.number = number;
      b.textContent = label;
      if (
        this.task === "name-quality" &&
        (directFull || size !== undefined) &&
        value !== "back" &&
        (!directFull ||
          fullAnswers.filter((a) => a.quality === value.split(" ")[0])
            .length === 1)
      ) {
        const quality = value.split(" ")[0];
        const shortcut =
          quality === "major" ? "M" : quality === "minor" ? "m" : quality[0];
        b.dataset.key = shortcut;
        b.title = `Press ${shortcut === "M" ? "Shift + M" : shortcut}`;
        const key = document.createElement("kbd");
        key.textContent = shortcut;
        key.setAttribute("aria-hidden", "true");
        b.append(" ", key);
      }
      b.disabled = !this.session.accepting;
      this.$(".theory-answers").append(b);
    }
    this.$(".theory-steps").innerHTML = q.notes
      .map(
        (_, i) =>
          `<span class="${i < this.step ? "is-done" : ""}">${q.direction === "up" ? i + 1 : 8 - i}</span>`,
      )
      .join("");
    if (!this.identifying) {
      if (this.task === "play-degree")
        this.piano.show(60, 71, true, !this.resetPianoFocus);
      else if (this.kind === "scales")
        this.piano.show(
          s.clef === "bass" ? 48 : 60,
          s.clef === "bass" ? 71 : 83,
          false,
          !this.resetPianoFocus,
        );
      else {
        const natural = (p: string) =>
          12 * (Number(p[1]) + 1) +
          [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(p[0])];
        this.piano.show(
          natural(s.low),
          natural(s.high),
          false,
          !this.resetPianoFocus,
        );
      }
      if (this.lastKeys) this.piano.feedback(...this.lastKeys);
      this.piano.setUnavailable(!this.session.accepting);
      this.resetPianoFocus = false;
      this.rangeNotice();
    }
    this.draw();
    this.changed();
  }
  private draw() {
    const q = this.session?.current;
    if (!this.active || !q || this.$(".theory-notation").hidden) return;
    this.width = this.$(".theory-notation").clientWidth;
    if (!this.width) return;
    const notes =
      this.task === "name-degree"
        ? [q.notes[q.degree! - 1]]
        : this.task === "play-degree"
          ? [q.notes[0]]
          : this.task === "build-scale"
            ? q.notes.slice(
                0,
                this.session.accepting
                  ? Math.max(1, this.step + (this.firstTry ? 0 : 1))
                  : 8,
              )
            : this.task === "build-interval" &&
                this.session.accepting &&
                this.firstTry
              ? [q.notes[0]]
              : q.notes;
    try {
      const tokens = notes.map((n) =>
        abcNote(n, this.kind !== "scales" && !q.keyName),
      );
      drawPracticeScore(
        this.$(".theory-notation"),
        `%%stretchlast 0\nX:1\nM:none\nL:1/4\nK:${q.key} clef=${this.settings.clef}\n${this.kind === "intervals" && this.settings.presentation === "together" && notes.length === 2 ? "[" + tokens.join("") + "]" : tokens.join(" ")} |]\n`,
        this.width,
        { compact: true },
      );
      if (!this.$(".theory-walk").hidden) {
        const walk = intervalWalk(q);
        drawPracticeScore(
          this.$(".theory-walk"),
          `X:1\nM:none\nL:1/4\nK:${q.key} clef=${this.settings.clef}\n${walk.map((n, i) => '"^' + (i + 1) + '"' + abcNote(n, !q.keyName)).join(" ")} |]\n`,
          this.width,
          { compact: true },
        );
        this.$(".theory-walk")
          .querySelectorAll(".abcjs-note")
          .forEach((note, i) =>
            note.classList.add(
              i === 0 || i === walk.length - 1
                ? "theory-endpoint"
                : "theory-intermediate",
            ),
          );
      }
    } catch (error) {
      this.$(".sequence-feedback").textContent =
        "This question could not be drawn. Try different practice options.";
      diagnostics.capture(error, "theory.render_failed");
    }
  }
}
export class ScalesPractice extends TheoryPractice {
  constructor(e: HTMLElement, c: () => void) {
    super(e, c, "scales");
  }
}
export class IntervalsPractice extends TheoryPractice {
  constructor(e: HTMLElement, c: () => void) {
    super(e, c, "intervals");
  }
}
