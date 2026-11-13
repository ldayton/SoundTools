import { ScorePassage } from "./score-passage";
import type { CountInBars } from "./hymn-count-in";
import { OptionalNotePicker, optionalNoteHTML } from "./optional-note-picker";
import {
  hymnPitchRange,
  hymnRangeKeys,
  hymnRangeLabel,
  type HymnRange,
} from "./hymn-range";
import abcjs from "abcjs";
import { preparePianoPlayback } from "./piano-audio";
import { HymnPlayback } from "./hymn-playback";
import { mountPracticePiano, isPianoVisible } from "./practice-piano";
import {
  hymnSettingsFromQuery,
  optionalHymnNote,
  type HymnSettings,
} from "./hymn-settings";
import type { InputPolicy, Interruption } from "./live-practice";
import { mountPracticeOptions } from "./practice-controls";
import {
  HYMN_KEYS,
  type HymnKey,
  hymnKeyLabel,
  hymnKeySuffix,
  hymnTransposition,
  isHymnKey,
} from "./hymn-transpose";
import { feedbackForNotes } from "./sight-feedback";
import type { PracticeEvent } from "./practice-score";
import {
  drawPracticeScore,
  eventSteps,
  highlightScore,
  keyboardRange,
} from "./practice-score";
import {
  ARRANGEMENTS,
  arrangeHymn,
  type Arrangement,
  type HymnHands,
} from "./hymn-arrangements";
import hymns from "./hymns.json";
import { WaitForMe, searchHymns } from "./sight-reading-model";
import { Piano } from "./piano";
import { keyLabel } from "./piano-model";
import { diagnostics } from "./diagnostics";
import { persistence } from "./persistence";
import { bookmark, restoreBookmark, type Bookmark } from "./bookmarks";
type HymnState = {
  version: 1;
  mode?: "wait" | "playback";
  bpm?: number;
  countIn?: CountInBars;
  key?: HymnKey;
  low?: number | null;
  high?: number | null;
  zoom?: number;
  hymn: string;
  arrangement: Arrangement;
  hands?: HymnHands;
  viewHands?: HymnHands;
  reattackTies?: boolean;
  sectionBars: number;
  section: number;
  bookmarks: Record<string, Bookmark>;
  sections: Record<string, number>;
};
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export class SightReading {
  private hymn = hymns[0];
  private key: HymnKey = "original";
  private notePickers = new Map<"low" | "high", OptionalNotePicker>();
  private low: number | null = null;
  private high: number | null = null;
  private preferRangeDefault = false;
  private noMatchingKey = false;
  private rangeCache = new Map<string, HymnRange>();
  private arrangement: Arrangement = "melody";
  private hands: HymnHands = "both";
  private viewHands: HymnHands = "both";
  private reattackTies = false;
  private readonly sectionBars = 0;
  private section = 0;
  private sections = 1;
  private position = 0;
  private bookmarks: Record<string, Bookmark> = {};
  private content = "";
  private legacyBookmark?: { key: string; position: number };
  private savedSections: Record<string, number> = {};
  private handSuffix() {
    return this.arrangement === "melody" || this.hands === "both"
      ? ""
      : `:hands=${this.hands}`;
  }
  private selectionKey() {
    return `${this.hymn.id}:${this.arrangement}:${this.sectionBars}${hymnKeySuffix(this.hymn.key, this.key)}${this.handSuffix()}${this.reattackTies ? ":reattack-ties" : ""}`;
  }
  private restoreSection() {
    this.section = 0;
  }
  private restorePending = true;
  private bookmarkKey() {
    return `${this.hymn.id}:${this.arrangement}:${this.sectionBars}:${this.section}${hymnKeySuffix(this.hymn.key, this.key)}${this.handSuffix()}${this.reattackTies ? ":reattack-ties" : ""}`;
  }

  private mode: "wait" | "playback" = "wait";
  private bpm = 80;
  private countIn: CountInBars = 0;
  private get countInBars(): CountInBars {
    return this.mode === "playback" && /^\d+\/\d+$/.test(this.hymn.meter)
      ? this.countIn
      : 0;
  }
  private playback: HymnPlayback;
  private playbackView = "";
  private playbackFromSection = 0;
  private active = false;
  private paused = false;
  private events: PracticeEvent[] = [];
  private passage: ScorePassage;
  private passageIdentity = "";
  private loopPassage = false;
  private sectionDuration = 0;
  private session?: WaitForMe;
  private piano: Piano;
  private pianoPanel: ReturnType<typeof mountPracticePiano>;
  private observer: ResizeObserver;
  private lastWidth = 0;
  private zoom = 1;
  private matches = hymns;
  private choice = -1;
  readonly midiSlot: HTMLElement;
  constructor(
    private element: HTMLElement,
    private acceptanceChanged: () => void,
  ) {
    try {
      const saved =
        persistence.read<HymnState>("sight") ||
        (persistence.state.legacy.sight as any);
      if (
        saved?.version === 1 &&
        saved.bookmarks &&
        typeof saved.bookmarks === "object"
      )
        this.bookmarks = structuredClone(saved.bookmarks);
      if (
        saved?.version === 1 &&
        saved.sections &&
        typeof saved.sections === "object"
      )
        this.savedSections = structuredClone(saved.sections);
      if (saved?.hands === "left" || saved?.hands === "right")
        this.hands = saved.hands;
      if (["left", "right"].includes(saved?.viewHands || ""))
        this.viewHands = saved!.viewHands!;
      if (this.viewHands !== "both") this.hands = this.viewHands;
      if ([0, 0.5, 1, 2].includes(saved?.countIn as number))
        this.countIn = saved!.countIn!;
      this.reattackTies = saved?.reattackTies === true;
      if (saved?.mode === "playback") this.mode = "playback";
      if (
        Number.isInteger(saved?.bpm) &&
        saved!.bpm! >= 40 &&
        saved!.bpm! <= 200 &&
        saved!.bpm! % 5 === 0
      )
        this.bpm = saved!.bpm!;
      if ([0.85, 1, 1.2].includes(saved?.zoom)) this.zoom = saved.zoom;
      this.low = optionalHymnNote(saved?.low);
      this.high = optionalHymnNote(saved?.high);
      if (isHymnKey(saved?.key)) this.key = saved.key;
      this.hymn = hymns.find((h) => h.id === saved?.hymn) || hymns[0];
      if (ARRANGEMENTS.some((a) => a.id === saved?.arrangement))
        this.arrangement = saved.arrangement;
      else if (saved) {
        this.arrangement = saved.chords === true ? "original" : "melody";
      }
      if (
        saved &&
        saved.version !== 1 &&
        Number.isSafeInteger(saved.position) &&
        saved.position > 0
      )
        this.legacyBookmark = {
          key: this.bookmarkKey(),
          position: saved.position,
        };
      // Legacy positions had no content identity: preserve preferences and original payload,
      // but start the selected section safely instead of applying an unverifiable index.
      if (saved && saved.version !== 1 && saved.position > 0) {
        const notice = document.querySelector<HTMLElement>(
          "#persistence-notice",
        )!;
        notice.hidden = false;
        notice.textContent =
          "Your hymn preferences were imported; its older unversioned bookmark starts at the section beginning. You can restore its older position if this is the same score.";
      }
    } catch {
      /* Private browsing or an older saved preference. */
    }
    element.innerHTML = `<div class="hymn-controls"><div class="hymn-picker"><label for="hymn-search">Hymn</label><div class="hymn-search-field"><input id="hymn-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="hymn-results" autocomplete="off" spellcheck="false" /><span aria-hidden="true">⌄</span></div><ul id="hymn-results" role="listbox" aria-label="Hymns" hidden></ul></div><label class="hymn-key-field">Key<select id="hymn-key" aria-label="Hymn key"><option value="original">Original</option>${HYMN_KEYS.map((key) => `<option value="${key}">${hymnKeyLabel(key)}</option>`).join("")}</select><small class="hymn-key-range" aria-live="polite"></small></label><div class="hymn-range-fields">${optionalNoteHTML("hymn-low", "Lowest note")}${optionalNoteHTML("hymn-high", "Highest note")}<small>Range of the practised part, across the whole hymn.</small></div></div>
    <div class="practice-controls hymn-grades"><label class="hymn-arrangement-field">Arrangement<select id="hymn-arrangement">${ARRANGEMENTS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}</select></label><label class="hymn-view-field">Show<select id="hymn-view"><option value="both">Both hands</option><option value="right">Right hand</option><option value="left">Left hand</option></select></label><label class="hymn-hands-field">Practise hands<select id="hymn-hands"><option value="right">Right hand</option><option value="left">Left hand</option><option value="both">Both hands</option></select></label><label class="hymn-ties-field check"><input id="hymn-reattack-ties" type="checkbox">Re-strike tied notes</label></div>
    <section class="sequence-practice" aria-label="Hymn sight reading"><div class="sequence-top"><span>Wait for me</span><span class="hymn-count"></span></div><h2 class="sequence-title"></h2><p class="sequence-help">Play at your pace. Sing along with the words.</p><progress class="hymn-progress" aria-label="Hymn progress"></progress><p class="sequence-feedback" role="status" aria-live="polite" aria-atomic="true"></p><div class="hymn-passage-controls"><button type="button" class="hymn-cancel-passage" hidden>Cancel selection</button><button type="button" class="hymn-clear-passage" hidden>Clear selection</button><label class="hymn-loop" hidden><input type="checkbox" /> Loop</label><span class="hymn-passage-status" role="status"></span></div><div class="sequence-score" tabindex="0" role="region" aria-label="Hymn score with aligned lyrics" aria-describedby="hymn-scroll-hint"><div class="hymn-paper"></div></div><p id="hymn-scroll-hint" class="hymn-scroll-hint" hidden>Scroll for more ↕</p><div class="sequence-transport"><button type="button" class="hymn-pause">Pause</button><button type="button" class="hymn-restart">Start again</button><button type="button" class="hymn-restore-legacy" hidden></button><button type="button" class="hymn-prev" aria-label="Previous section" hidden>← Previous</button><button type="button" class="hymn-next" hidden>Next hymn →</button></div><div class="hymn-midi-slot"></div><div class="hymn-piano"></div><details class="hymn-source"><summary>About this hymn</summary><p class="hymn-credits"></p><a class="hymn-source-link" target="_blank" rel="noopener noreferrer">Open Hymnal source</a><p class="hymn-source-description"></p></details></section>`;
    this.$(".hymn-pause").after(this.$(".hymn-passage-controls"));
    this.passage = new ScorePassage(
      this.$(".hymn-paper"),
      () => this.syncPassageControls(),
      () => {
        this.position = 0;
        this.restorePending = false;
        this.content = "";
        this.paused = false;
        this.render();
      },
      () => this.update(),
      () => {
        this.interrupt("controls");
        this.paused = true;
      },
    );
    this.$(".hymn-cancel-passage").onclick = () => {
      this.passage.cancel();
      this.update();
    };
    this.$(".hymn-clear-passage").onclick = () => {
      this.passage.clear();
      this.loopPassage = false;
      this.restorePending = true;
      this.render();
    };
    this.$<HTMLInputElement>(".hymn-loop input").onchange = (e) => {
      this.loopPassage = (e.target as HTMLInputElement).checked;
    };
    this.playback = new HymnPlayback(
      () => {
        if (!this.active) return;
        if (this.mode === "playback") this.updatePlayback();
      },
      (error) => {
        diagnostics.capture(error, "hymn_playback.play_failed");
        this.paused = true;
        this.update();
        this.$(".sequence-feedback").textContent =
          "Audio couldn’t load. Try starting again.";
      },
      preparePianoPlayback,
    );
    this.$(".hymn-grades").insertAdjacentHTML(
      "afterbegin",
      `<label>Mode<select id="hymn-mode"><option value="wait">Wait for me</option><option value="playback">Playback</option></select></label><label class="hymn-tempo-field">Tempo<select id="hymn-tempo">${Array.from(
        { length: 33 },
        (_, i) => 40 + i * 5,
      )
        .map((n) => `<option value="${n}">${n} BPM</option>`)
        .join(
          "",
        )}</select></label><label class="hymn-count-in-field">Count-in<select id="hymn-count-in"><option value="0">None</option><option value="0.5">½ bar</option><option value="1">1 bar</option><option value="2">2 bars</option></select></label>`,
    );
    this.$<HTMLSelectElement>("#hymn-count-in").value = String(this.countIn);
    this.$<HTMLSelectElement>("#hymn-mode").value = this.mode;
    this.$<HTMLSelectElement>("#hymn-tempo").value = String(this.bpm);
    this.$<HTMLSelectElement>("#hymn-mode").onchange = (e) => {
      this.interrupt("controls");
      this.mode = (e.target as HTMLSelectElement).value as "wait" | "playback";
      this.preferRangeDefault = this.low !== null || this.high !== null;
      this.playback.restart();
      this.playbackView = "";
      this.render();
      this.save();
    };
    this.$<HTMLSelectElement>("#hymn-count-in").onchange = (e) => {
      this.interrupt("controls");
      this.countIn = Number(
        (e.target as HTMLSelectElement).value,
      ) as CountInBars;
      this.render();
      this.save();
    };
    this.$<HTMLSelectElement>("#hymn-tempo").onchange = (e) => {
      this.bpm = Number((e.target as HTMLSelectElement).value);
      this.playback.setTempo(this.bpm);
      this.save();
    };
    const context = document.createElement("div");
    context.className = "hymn-context";
    context.append(this.$(".hymn-controls"), this.$(".hymn-grades"));
    const tools = document.createElement("div");
    tools.className = "hymn-tools";
    tools.innerHTML =
      '<label class="hymn-size-field">Score size<select aria-label="Score size"><option value="0.85">Small</option><option value="1" selected>Medium</option><option value="1.2">Large</option></select></label>';
    context
      .querySelector(".hymn-controls")!
      .append(
        tools.querySelector("label")!,
        context.querySelector(".hymn-range-fields")!,
      );
    tools.append(this.$(".hymn-source"));
    context.append(tools);
    mountPracticeOptions(element, [context]);
    this.pianoPanel = mountPracticePiano(
      this.$(".hymn-piano"),
      this.$(".sequence-transport"),
      {
        buttonClass: "hymn-keyboard-toggle",
        changed: () => this.updateRangeHint(),
      },
    );
    this.$(".hymn-source").append(this.$(".sequence-help"));
    this.$(".hymn-source").insertAdjacentHTML(
      "beforeend",
      '<p class="hymn-transpose-help"></p>',
    );
    this.$(".sequence-top").append(this.$(".hymn-scroll-hint"));
    this.$<HTMLSelectElement>('[aria-label="Score size"]').value = String(
      this.zoom,
    );
    this.$<HTMLSelectElement>('[aria-label="Score size"]').onchange = (e) => {
      this.zoom = Number((e.target as HTMLSelectElement).value);
      this.render(true);
      this.save();
    };
    this.$(".sequence-top").insertAdjacentHTML(
      "beforeend",
      '<span class="hymn-range-hint" hidden></span>',
    );
    this.midiSlot = this.$(".hymn-midi-slot");
    this.piano = new Piano(
      this.$(".hymn-piano"),
      (note) => {
        if (this.accepting) this.answer(note);
      },
      () => this.updateRangeHint(),
    );
    const input = this.$<HTMLInputElement>("#hymn-search");
    input.value = this.hymn.title;
    input.onfocus = () => {
      input.select();
      this.showResults("");
    };
    input.onclick = () => {
      if (this.$("#hymn-results").hidden) {
        const showingTitle = input.value === this.hymn.title;
        if (showingTitle) input.select();
        this.showResults(showingTitle ? "" : input.value);
      }
    };
    input.oninput = () => this.showResults(input.value);
    input.onkeydown = (e) => {
      if (
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) &&
        !this.$("#hymn-results").hidden
      ) {
        e.preventDefault();
        this.choice =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? this.matches.length - 1
              : Math.max(
                  0,
                  Math.min(
                    this.matches.length - 1,
                    this.choice + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                );
        this.highlightChoice();
      } else if (e.key === "Enter" && !this.$("#hymn-results").hidden) {
        e.preventDefault();
        const hymn = this.matches[this.choice < 0 ? 0 : this.choice];
        if (hymn) this.choose(hymn);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeResults();
      }
    };
    this.$("#hymn-results").onpointerdown = (e) => e.preventDefault();
    this.$("#hymn-results").onclick = (e) => {
      const option = (e.target as Element).closest<HTMLElement>("[data-hymn]");
      const hymn = hymns.find((h) => h.id === option?.dataset.hymn);
      if (hymn) this.choose(hymn);
    };
    input.onblur = () => this.closeResults();
    for (const bound of ["low", "high"] as const) {
      const id = "hymn-" + bound;
      const picker = new OptionalNotePicker(
        this.$("#" + id).closest<HTMLElement>(".optional-note-control")!,
        id,
        (value) => {
          this.save();
          this.interrupt("controls");
          this[bound] = value;
          this.preferRangeDefault = true;
          this.restorePending = true;
          this.render();
          this.save();
        },
      );
      this.notePickers.set(bound, picker);
      picker.setValue(this[bound]);
    }
    this.$<HTMLSelectElement>("#hymn-key").value = this.key;
    this.$<HTMLSelectElement>("#hymn-key").onchange = (e) => {
      const key = (e.target as HTMLSelectElement).value;
      if (!isHymnKey(key)) return;
      this.save(); // Save under the old key before changing the bookmark namespace.
      this.interrupt("controls");
      this.key = key;
      this.restoreSection();
      this.restorePending = true;
      this.render();
    };
    this.$<HTMLInputElement>("#hymn-reattack-ties").checked = this.reattackTies;
    this.$<HTMLInputElement>("#hymn-reattack-ties").onchange = (e) => {
      this.reattackTies = (e.target as HTMLInputElement).checked;
      this.position = 0;
      this.restorePending = true;
      this.render();
      this.save();
    };
    this.$<HTMLSelectElement>("#hymn-view").value = this.viewHands;
    this.$<HTMLSelectElement>("#hymn-hands").value = this.hands;
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    for (const field of ["arrangement", "view", "hands"])
      this.$<HTMLSelectElement>("#hymn-" + field).onchange = (e) => {
        const value = (e.target as HTMLSelectElement).value;
        if (field === "arrangement") this.arrangement = value as Arrangement;
        if (field === "hands") this.hands = value as HymnHands;
        if (field === "view") this.viewHands = value as HymnHands;
        if (this.viewHands !== "both") this.hands = this.viewHands;
        if (["arrangement", "view", "hands"].includes(field))
          this.preferRangeDefault = this.low !== null || this.high !== null;
        this.restoreSection();
        this.restorePending = true;
        this.render();
        this.save();
      };
    this.$(".hymn-prev").onclick = () => this.changeSection(this.section - 1);
    this.$(".hymn-pause").onclick = () => {
      if (this.mode === "playback") {
        if (["playing", "counting", "loading"].includes(this.playback.state))
          this.playback.pause();
        else void this.playback.play(this.bpm, this.countInBars);
        this.playbackView = "";
        this.update();
        return;
      }
      this.paused = !this.paused;
      this.session?.resetGesture();
      this.update();
      this.save();
    };
    this.$(".hymn-restart").onclick = () => {
      if (this.mode === "playback") {
        this.render();
        this.playback.restart();
        this.playbackView = "";
        void this.playback.play(this.bpm, this.countInBars);
        this.update();
        return;
      }
      this.position = 0;
      this.paused = false;
      this.restorePending = false;
      this.render();
      this.save();
    };
    this.$(".hymn-restore-legacy").onclick = () => {
      const old = this.legacyBookmark;
      if (
        this.mode === "playback" ||
        !persistence.writable ||
        !old ||
        old.key !== this.bookmarkKey() ||
        !this.session ||
        old.position > this.session.steps.length
      )
        return;
      this.position = old.position;
      this.paused = false;
      this.legacyBookmark = undefined;
      this.restorePending = false;
      this.render();
      this.save();
      document.querySelector<HTMLElement>("#persistence-notice")!.hidden = true;
    };
    this.$(".hymn-next").onclick = () => {
      if (this.section + 1 < this.sections)
        this.changeSection(this.section + 1);
      else this.choose(hymns[(hymns.indexOf(this.hymn) + 1) % hymns.length]);
    };
    this.observer = new ResizeObserver(() =>
      requestAnimationFrame(() => {
        const width = Math.round(this.$(".sequence-score").clientWidth);
        if (this.active && width > 0 && Math.abs(width - this.lastWidth) > 2)
          this.render(true);
      }),
    );
    this.observer.observe(this.$(".sequence-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    if (
      this.mode === "playback" ||
      !persistence.writable ||
      !this.active ||
      !this.$("#hymn-results").hidden ||
      !this.session ||
      this.noMatchingKey ||
      this.passage.selecting
    )
      return "none";
    return this.paused || this.session.complete ? "restart" : "answer";
  }
  get accepting() {
    return this.inputPolicy === "answer";
  }
  enter() {
    this.active = true;
    this.render();
    this.acceptanceChanged();
  }
  leave() {
    this.active = false;
    this.closeResults();
    this.interrupt("navigation");
    this.acceptanceChanged();
  }
  interrupt(reason: Interruption) {
    if (this.passage.selecting) this.passage.cancel();
    if (reason === "navigation")
      for (const picker of this.notePickers.values()) picker.close();
    this.playback.pause();
    this.playbackView = "";
    if (this.mode === "playback" && this.active) this.updatePlayback();
    this.session?.resetGesture();
    this.clearPianoSelection();
  }
  applyRoute(route: import("./navigation").PracticeRoute) {
    const hymn = route.hymn
      ? hymns.find((h) => h.id === route.hymn)
      : this.hymn;
    if (!hymn) return false;
    const old = this.settings();
    const next = hymnSettingsFromQuery({ ...old, hymn: hymn.id }, route.query);
    const changed =
      old.hymn !== next.hymn ||
      old.key !== next.key ||
      old.low !== next.low ||
      old.high !== next.high ||
      old.arrangement !== next.arrangement ||
      old.hands !== next.hands ||
      old.viewHands !== next.viewHands ||
      old.reattackTies !== next.reattackTies ||
      old.sectionBars !== next.sectionBars;
    if (old.mode !== next.mode || old.bpm !== next.bpm)
      this.interrupt("controls");
    this.mode = next.mode || "wait";
    this.bpm = next.bpm || 80;
    if (this.countIn !== (next.countIn || 0)) this.interrupt("controls");
    this.countIn = next.countIn || 0;
    this.$<HTMLSelectElement>("#hymn-count-in").value = String(this.countIn);
    this.$<HTMLSelectElement>("#hymn-mode").value = this.mode;
    this.$<HTMLSelectElement>("#hymn-tempo").value = String(this.bpm);
    this.preferRangeDefault =
      !route.query.has("key") &&
      (old.hymn !== next.hymn ||
        old.low !== next.low ||
        old.high !== next.high);
    this.low = next.low ?? null;
    this.high = next.high ?? null;
    this.hymn = hymn;
    this.key = next.key || "original";
    this.arrangement = next.arrangement;
    this.hands = next.hands || "both";
    this.viewHands = next.viewHands || "both";
    this.reattackTies = next.reattackTies === true;
    this.$<HTMLInputElement>("#hymn-reattack-ties").checked = this.reattackTies;
    if (changed) this.restoreSection();
    if (changed || this.section !== old.section) {
      this.restorePending = true;
      this.position = 0;
      this.paused = false;
    }
    this.$<HTMLInputElement>("#hymn-search").value = this.hymn.title;
    this.$<HTMLSelectElement>("#hymn-key").value = this.key;
    this.$<HTMLSelectElement>("#hymn-view").value = this.viewHands;
    this.$<HTMLSelectElement>("#hymn-hands").value = this.hands;
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    return true;
  }
  private settings(): HymnSettings {
    return {
      hymn: this.hymn.id,
      mode: this.mode,
      bpm: this.bpm,
      countIn: this.countIn,
      key: this.key,
      low: this.low,
      high: this.high,
      arrangement: this.arrangement,
      hands: this.hands,
      viewHands: this.viewHands,
      reattackTies: this.reattackTies,
      sectionBars: this.sectionBars,
      section: this.section,
      position: this.position,
    };
  }
  private publishRoute() {
    if (!this.active) return;
    const q = new URLSearchParams({
      arrangement: this.arrangement,
      hands: this.hands,
      view: this.viewHands,
    });
    if (this.reattackTies) q.set("ties", "repeat");
    if (this.countIn) q.set("countIn", String(this.countIn));
    if (this.key !== "original") q.set("key", this.key);
    if (this.low !== null) q.set("low", String(this.low));
    if (this.high !== null) q.set("high", String(this.high));
    if (this.mode === "playback") {
      q.set("mode", "playback");
      q.set("tempo", String(this.bpm));
    }
    this.element.dispatchEvent(
      new CustomEvent("hymn-route", {
        detail: `/piano/hymns/${this.hymn.id}?${q}`,
      }),
    );
  }
  private save() {
    this.publishRoute();
    if (this.session && this.content && !this.passage.range)
      this.bookmarks[this.bookmarkKey()] = bookmark(
        this.content,
        this.position,
        this.paused,
        this.session.steps.length,
      );
    this.savedSections[this.selectionKey()] = this.section;
    persistence.write("sight", {
      version: 1,
      mode: this.mode,
      bpm: this.bpm,
      countIn: this.countIn,
      key: this.key,
      low: this.low,
      high: this.high,
      zoom: this.zoom,
      hymn: this.hymn.id,
      arrangement: this.arrangement,
      hands: this.hands,
      viewHands: this.viewHands,
      reattackTies: this.reattackTies,
      sectionBars: this.sectionBars,
      section: this.section,
      bookmarks: this.bookmarks,
      sections: this.savedSections,
    } satisfies HymnState);
  }
  private showResults(query: string) {
    this.interrupt("controls");
    this.matches = searchHymns(hymns, query);
    this.choice = -1;
    const list = this.$("#hymn-results");
    list.innerHTML = this.matches.length
      ? this.matches
          .map(
            (h) =>
              `<li id="hymn-${h.id}" role="option" aria-selected="false" data-hymn="${h.id}">${escape(h.title)}</li>`,
          )
          .join("")
      : '<li class="hymn-no-results" role="presentation">No hymns found. Try another title.</li>';
    list.hidden = false;
    this.$("#hymn-search").setAttribute("aria-expanded", "true");
    this.highlightChoice();
    this.acceptanceChanged();
  }
  private highlightChoice() {
    const input = this.$("#hymn-search");
    input.removeAttribute("aria-activedescendant");
    this.$("#hymn-results")
      .querySelectorAll<HTMLElement>('[role="option"]')
      .forEach((el, i) => {
        el.setAttribute("aria-selected", String(i === this.choice));
        if (i === this.choice) {
          input.setAttribute("aria-activedescendant", el.id);
          el.scrollIntoView({ block: "nearest" });
        }
      });
  }
  private closeResults() {
    this.$("#hymn-results").hidden = true;
    this.$("#hymn-search").setAttribute("aria-expanded", "false");
    this.$("#hymn-search").removeAttribute("aria-activedescendant");
    this.$<HTMLInputElement>("#hymn-search").value = this.hymn.title;
    this.acceptanceChanged();
  }
  private choose(hymn: (typeof hymns)[number]) {
    this.hymn = hymn;
    this.preferRangeDefault = true;
    this.restoreSection();
    this.restorePending = true;
    this.closeResults();
    this.render();
    this.save();
  }
  private syncPassageControls() {
    const selecting = this.passage.selecting;
    const range = this.passage.range;
    this.$(".hymn-passage-controls").hidden =
      this.noMatchingKey || (!range && !selecting);
    this.$(".hymn-cancel-passage").hidden = !selecting;
    if (selecting) {
      this.piano?.setUnavailable(true);
      this.$(".sequence-feedback").textContent = "Practice paused.";
    }
    this.$(".hymn-clear-passage").hidden = !range || selecting;
    this.$(".hymn-loop").hidden = !range || selecting;
    this.$<HTMLInputElement>(".hymn-loop input").checked = this.loopPassage;
    this.$(".hymn-passage-status").textContent = selecting
      ? "Choose the last note, or drag to it."
      : range
        ? `Notes ${range.start + 1}–${range.end + 1} selected`
        : "";
    for (const control of this.element.querySelectorAll<HTMLButtonElement>(
      ".sequence-transport > button",
    ))
      control.disabled = selecting || this.noMatchingKey;
    this.acceptanceChanged();
  }
  private changeSection(section: number, continuingPlayback = false) {
    this.section = section;
    this.restorePending = true;
    this.render(false, continuingPlayback);
    this.save();
  }
  private render(layoutOnly = false, continuingPlayback = false) {
    const paper = this.$(".hymn-paper");
    this.lastWidth = Math.round(this.$(".sequence-score").clientWidth);
    if (!this.lastWidth) return;
    const previous = this.session;
    const feedback = this.$(".sequence-feedback");
    const previousText = feedback.textContent;
    const previousKind = feedback.dataset.kind;
    if (!layoutOnly) {
      if (!continuingPlayback) {
        this.playback.pause();
      }
      this.playbackView = "";
      this.session = undefined;
      this.acceptanceChanged();
    }
    this.$(".sequence-title").textContent = this.hymn.title;
    this.$(".sequence-score").setAttribute(
      "aria-label",
      this.arrangement !== "melody" && this.viewHands === "left"
        ? "Left-hand hymn score"
        : "Hymn score with aligned lyrics",
    );
    this.$(".sequence-practice").dataset.arrangement = this.arrangement;
    this.$(".hymn-credits").textContent = this.hymn.credits.join(" ");
    const tabMusic = "source" in this.hymn && this.hymn.source === "tab-music";
    this.$(".hymn-source-link").textContent = tabMusic
      ? "Tab music source"
      : "Open Hymnal source";
    this.$(".hymn-source-description").textContent = tabMusic
      ? "Keyboard melody with simplified harmony from your tab-music edition."
      : "Public-domain words, melody and setting. First verse and refrain.";
    // Open Hymnal uses a verified mirror; imported practice editions retain their source.
    this.$<HTMLAnchorElement>(".hymn-source-link").href =
      "source" in this.hymn && this.hymn.source === "tab-music"
        ? this.hymn.sourceUrl
        : "https://github.com/mzealey/openhymnal/blob/d35811b2d5c9b0bbc5887d60a2936454815416e8/Complete/" +
          encodeURIComponent(this.hymn.folder) +
          "/" +
          encodeURIComponent(this.hymn.file);
    try {
      this.syncRangeKeys();
      const passageIdentity = `${this.hymn.id}:${this.key}:${this.arrangement}:${this.viewHands}:${this.sectionBars}:${this.section}:${this.reattackTies}`;
      if (passageIdentity !== this.passageIdentity || this.noMatchingKey) {
        this.passage.clear();
        this.loopPassage = false;
        this.passageIdentity = passageIdentity;
      }
      this.$(".hymn-passage-controls").hidden = this.noMatchingKey;
      if (this.noMatchingKey) {
        this.showNoMatchingKey();
        return;
      }
      for (const control of this.element.querySelectorAll<HTMLButtonElement>(
        ".sequence-transport button",
      ))
        control.disabled = false;
      const score = arrangeHymn(
        this.hymn,
        this.arrangement,
        this.sectionBars,
        this.section,
        this.viewHands,
      );
      const transposition = hymnTransposition(this.hymn.key, this.key);
      this.$<HTMLOptionElement>(
        '#hymn-key option[value="original"]',
      ).textContent =
        `Original (${this.hymn.key.replace(/b/g, "♭").replace(/#/g, "♯")})`;
      this.$(".hymn-transpose-help").textContent = transposition.semitones
        ? `${hymnKeyLabel(transposition.key)}, ${transposition.semitones > 0 ? "up" : "down"} ${Math.abs(transposition.semitones)} semitones from ${hymnKeyLabel(this.hymn.key)}. Each key keeps its own progress. The nearest register is used; no notes are folded into another octave.`
        : `Original ${hymnKeyLabel(this.hymn.key)}. Each key keeps its own progress.`;
      this.$("#hymn-key").title = this.$(".hymn-transpose-help").textContent!;
      this.section = score.section;
      this.sections = score.sections;
      this.$(".sequence-help").textContent =
        ARRANGEMENTS.find((a) => a.id === this.arrangement)!.help +
        " Sing along with the words.";
      this.events = drawPracticeScore(paper, score.abc, this.lastWidth, {
        scale: this.zoom,
        reattackTies: this.mode === "wait" && this.reattackTies,
        transpose: transposition.semitones,
        playback: (audio) => {
          this.sectionDuration = audio.totalDuration * 4;
          if (!layoutOnly && !continuingPlayback) {
            this.playbackFromSection = this.section;
            const readAudio = (abc: string) =>
              abcjs.parseOnly(abc)[0].setUpAudio({
                qpm: 60,
                chordsOff: true,
                midiTranspose: transposition.semitones,
              });
            let elapsed = 0;
            const starts = Array.from({ length: this.sections }, (_, i) => {
              const start = elapsed;
              const part =
                i === this.section
                  ? audio
                  : readAudio(
                      arrangeHymn(
                        this.hymn,
                        this.arrangement,
                        this.sectionBars,
                        i,
                        this.viewHands,
                      ).abc,
                    );
              elapsed += part.totalDuration * 4;
              return start;
            });
            // A single full-score audio stream preserves ties across section boundaries.
            // For sectioned original harmony, use the same unfolded bar edition as the display.
            const fullAudio =
              this.sections === 1
                ? audio
                : readAudio(
                    arrangeHymn(
                      this.hymn,
                      this.arrangement,
                      score.totalBars,
                      0,
                      this.viewHands,
                    ).abc,
                  );
            this.playback.load(fullAudio, starts, this.section, {
              meter: this.hymn.meter,
              pickup: abcjs.parseOnly(score.abc)[0].getPickupLength() * 4,
            });
          }
        },
      });
      const visibleEvents = this.events;
      this.passage.bind(visibleEvents);
      const practice =
        this.mode === "wait" &&
        this.arrangement !== "melody" &&
        this.hands !== this.viewHands
          ? arrangeHymn(
              this.hymn,
              this.arrangement,
              this.sectionBars,
              this.section,
              this.hands,
            )
          : score;
      if (practice !== score) {
        // Grade the selected hand's own onsets, including ties and rests. Map
        // those timings back onto the visible grand staff for highlighting.
        const visible = new Map(this.events.map((e) => [e.milliseconds, e]));
        this.events = drawPracticeScore(
          document.createElement("div"),
          practice.abc,
          this.lastWidth,
          {
            transpose: transposition.semitones,
            reattackTies: this.reattackTies,
            playback: () => {},
          },
        ).map((e) => ({
          ...e,
          elements: visible.get(e.milliseconds)?.elements || [],
        }));
      }
      const range = this.passage.range;
      if (range) {
        const from = visibleEvents[range.start].milliseconds / 1000;
        const to =
          visibleEvents[range.end + 1]?.milliseconds / 1000 ||
          this.sectionDuration;
        this.events = this.events.filter(
          (e) => e.milliseconds / 1000 >= from && e.milliseconds / 1000 < to,
        );
        if (!layoutOnly) this.playback.setRange(from, to);
      }
      const steps = eventSteps(this.events, true);
      const content = JSON.stringify({
        matcher: 1,
        abc: practice.abc,
        steps,
        ...(transposition.semitones
          ? { transpose: transposition.semitones }
          : {}),
      });
      if (
        !range &&
        (this.restorePending || (this.content && this.content !== content))
      ) {
        const restored = restoreBookmark(
          this.bookmarks[this.bookmarkKey()],
          content,
          steps.length,
        );
        this.position = restored.position;
        this.paused = restored.paused;
        this.restorePending = false;
      }
      if (!steps.length) {
        this.session = undefined;
        this.$(".sequence-feedback").textContent =
          "No notes for the practising hand in this passage. Select another passage or change hands.";
        this.$(".hymn-count").textContent = "";
        this.$<HTMLButtonElement>(".hymn-pause").disabled = true;
        this.piano.setUnavailable(true);
        this.acceptanceChanged();
        return;
      }
      if (range && this.content !== content) this.position = 0;
      const keepSession = layoutOnly && previous && this.content === content;
      this.content = content;
      this.session = keepSession
        ? previous
        : new WaitForMe(steps, this.position);
      this.position = this.session.index;
      const viewport = this.$(".sequence-score");
      // Two single-staff systems, or one grand-staff system, on a phone.
      const lines = [...paper.querySelectorAll("svg")];
      if (lines.length) {
        const grand = lines.some(
          (line) => line.querySelectorAll(".abcjs-staff").length > 1,
        );
        const height = Math.max(
          ...lines.map((line, i) => {
            const last = grand
              ? line
              : lines[Math.min(i + 1, lines.length - 1)];
            return (
              last.getBoundingClientRect().bottom -
              line.getBoundingClientRect().top
            );
          }),
        );
        viewport.style.setProperty(
          "--phone-score-height",
          `${Math.ceil(height + 8)}px`,
        );
      }
      this.$(".hymn-scroll-hint").hidden =
        viewport.scrollHeight <= viewport.clientHeight + 1;
      this.preparePiano(!!keepSession);
      this.update(true, !!keepSession);
      if (keepSession) {
        feedback.textContent = previousText;
        if (previousKind) feedback.dataset.kind = previousKind;
        for (const note of this.session.selected)
          this.element
            .querySelector(`[data-piano="${note}"]`)
            ?.classList.add("sight-key-selected");
      } else this.save();
    } catch (error) {
      this.playback.pause();
      this.session = undefined;
      this.events = [];
      this.$(".sequence-feedback").textContent =
        "This hymn couldn’t load. Try another hymn or reload.";
      diagnostics.capture(error, "sight_reading.render_failed");
      this.acceptanceChanged();
    }
  }
  private syncHandControls() {
    const countIn = this.$<HTMLSelectElement>("#hymn-count-in");
    countIn.value = String(this.countInBars);
    for (const option of countIn.options)
      option.disabled = this.hymn.meter === "none" && option.value !== "0";
    countIn.title =
      this.hymn.meter === "none"
        ? "This hymn is unmetered, so a bar count-in is unavailable."
        : "Count in before starting or resuming";
    this.$(".hymn-tempo-field").hidden = this.mode !== "playback";
    this.$(".hymn-count-in-field").hidden = this.mode !== "playback";
    this.$(".hymn-ties-field").hidden = this.mode !== "wait";
    this.$(".hymn-view-field").hidden = this.arrangement === "melody";
    this.$(".hymn-hands-field").hidden =
      this.arrangement === "melody" || this.mode !== "wait";
    const hands = this.$<HTMLSelectElement>("#hymn-hands");
    for (const option of hands.options)
      option.disabled =
        this.viewHands !== "both" && option.value !== this.viewHands;
    hands.value = this.hands;
  }
  private cachedMelodyRange() {
    const identity = this.hymn.id;
    let range = this.rangeCache.get(identity);
    if (!range) {
      range = hymnPitchRange(
        arrangeHymn(this.hymn, "melody", 0, 0).abc,
      );
      this.rangeCache.set(identity, range);
    }
    return range;
  }
  private syncRangeKeys() {
    this.syncHandControls();
    // Key limits describe the sung melody, independent of accompaniment or hands.
    const range = this.cachedMelodyRange();
    const { choices, preferred } = hymnRangeKeys(
      this.hymn.key,
      range,
      this.low,
      this.high,
    );
    const select = this.$<HTMLSelectElement>("#hymn-key");
    select.options[0].textContent = `Original (${this.hymn.key.replace(/b/g, "♭").replace(/#/g, "♯")})`;
    for (const option of select.options)
      option.disabled = !choices.find((c) => c.key === option.value)?.fits;
    this.noMatchingKey = preferred === undefined;
    if (
      !this.noMatchingKey &&
      (this.preferRangeDefault ||
        !choices.find((c) => c.key === this.key)?.fits)
    ) {
      if (this.key !== preferred) {
        this.key = preferred!;
        this.restoreSection();
        this.restorePending = true;
      }
    }
    this.preferRangeDefault = false;
    select.value = this.noMatchingKey ? "" : this.key;
    const rangeText = this.$(".hymn-key-range");
    rangeText.hidden = this.noMatchingKey;
    if (!this.noMatchingKey) {
      rangeText.textContent = hymnRangeLabel(
        range,
        this.hymn.key,
        this.key,
      );
    }
    for (const bound of ["low", "high"] as const)
      this.notePickers.get(bound)!.setValue(this[bound]);
  }
  private showNoMatchingKey() {
    this.playback.pause();
    this.$(".sequence-top > span").textContent =
      this.mode === "playback" ? "Playback" : "Wait for me";
    this.session = undefined;
    this.events = [];
    this.content = "";
    this.$(".hymn-paper").innerHTML =
      '<p class="hymn-no-key" role="status">No available key fits these note limits. Widen or clear the lowest or highest note.</p>';
    this.$(".sequence-feedback").textContent = "";
    this.$(".hymn-count").textContent = "";
    this.$<HTMLProgressElement>(".hymn-progress").value = 0;
    for (const control of this.element.querySelectorAll<HTMLButtonElement>(
      ".sequence-transport button",
    ))
      control.disabled = true;
    this.pianoPanel.setAvailable(false);
    this.$(".hymn-range-hint").hidden = true;
    this.$(".hymn-scroll-hint").hidden = true;
    this.$(".sequence-score").style.removeProperty("--phone-score-height");
    this.acceptanceChanged();
    this.save();
  }
  private preparePiano(preserveHint = false) {
    if (!this.session) return;
    this.piano.show(...keyboardRange(this.events), false, false, preserveHint);
    this.clearPianoSelection(!preserveHint);
  }
  private updateRangeHint() {
    if (!this.piano) return;
    if (this.mode === "playback" || !isPianoVisible()) {
      this.$<HTMLElement>(".hymn-range-hint").hidden = true;
      return;
    }
    const missing = (this.session?.current?.pitches || []).filter(
      (note) => !this.piano.contains(note),
    );
    const hint = this.$(".hymn-range-hint");
    hint.hidden = !missing.length;
    hint.textContent = `MIDI needed: ${missing.map((note) => keyLabel(note)).join(", ")}`;
  }
  private clearPianoSelection(clearHint = true) {
    if (clearHint) this.piano?.clearHint();
    this.element
      .querySelectorAll(".sight-key-selected")
      .forEach((e) => e.classList.remove("sight-key-selected"));
  }
  answer(note: number, held?: readonly number[]) {
    if (this.inputPolicy === "none") return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "restarted") {
      this.paused = false;
    }
    if (result === "wrong" || result === "partial") {
      this.$(".sequence-feedback").dataset.kind = result;
      this.$(".sequence-feedback").textContent = feedbackForNotes(
        note,
        this.session!.current.pitches,
        this.session!.selected,
        result,
        this.events[this.session!.index]?.spellings,
        held,
      );
      if (result === "wrong") {
        this.piano.hint(
          note,
          this.session!.current.pitches,
          this.events[this.session!.index]?.spellings,
        );
        return;
      }
      if (!held)
        this.element
          .querySelector(`[data-piano="${note}"]`)
          ?.classList.add("sight-key-selected");
      return;
    }
    if (result === "complete" && this.passage.range && this.loopPassage)
      this.session = new WaitForMe(this.session!.steps);
    this.position = this.session!.index;
    this.clearPianoSelection();
    this.save();
    this.update(true);
  }
  private update(scroll = false, preserveAcceptance = false) {
    const session = this.session;
    if (!session) return;
    if (this.passage.selecting) {
      this.piano.setUnavailable(true);
      this.$(".sequence-feedback").textContent = "Practice paused.";
      this.acceptanceChanged();
      return;
    }
    this.$(".sequence-top > span").textContent =
      this.mode === "playback" ? "Playback" : "Wait for me";
    this.syncHandControls();
    this.pianoPanel.setAvailable(this.mode === "wait");
    if (this.mode === "playback") {
      this.playbackView = "";
      this.updatePlayback();
      this.acceptanceChanged();
      return;
    }
    highlightScore(
      this.$(".hymn-paper"),
      this.events[session.index],
      this.$(".sequence-score"),
      scroll,
    );
    const restore = this.$<HTMLButtonElement>(".hymn-restore-legacy");
    const old = this.legacyBookmark;
    restore.hidden =
      !old ||
      old.key !== this.bookmarkKey() ||
      old.position > session.steps.length;
    if (!restore.hidden)
      restore.textContent = `Restore older bookmark (${Math.min(old!.position + 1, session.steps.length)} / ${session.steps.length})`;
    const complete = session.complete;
    this.$(".hymn-count").textContent = complete
      ? "Complete"
      : `${Math.min(session.index + 1, session.steps.length)} / ${session.steps.length}`;
    const progress = this.$<HTMLProgressElement>(".hymn-progress");
    progress.max = session.steps.length;
    progress.value = session.index;
    delete this.$(".sequence-feedback").dataset.kind;
    this.$(".sequence-feedback").textContent = complete
      ? "Lovely. Sing it again, or choose another hymn."
      : this.paused
        ? "Paused. Continue when you’re ready."
        : this.arrangement !== "melody" && this.hands === "left"
          ? session.current.pitches.length > 1
            ? "Play the highlighted notes with your left hand."
            : "Play the highlighted note with your left hand."
          : session.current.pitches.length > 1
            ? "Play the highlighted notes together."
            : "Play the highlighted note.";
    this.$<HTMLButtonElement>(".hymn-pause").disabled = complete;
    this.$(".hymn-pause").textContent = this.paused ? "Resume" : "Pause";
    this.$(".hymn-prev").hidden = this.section === 0;
    this.$(".hymn-next").hidden =
      !complete && this.section + 1 === this.sections;
    this.$(".hymn-next").textContent =
      this.section + 1 < this.sections ? "Next section →" : "Next hymn →";
    this.updateRangeHint();
    this.piano.setUnavailable(!this.accepting);
    this.showCountIn();
    if (!preserveAcceptance) this.acceptanceChanged();
  }
  private showCountIn() {
    const counting = this.playback.counting;
    if (!counting) return;
    const bars =
      counting.bars === 0.5
        ? "½ bar"
        : counting.bars === 1
          ? "1 bar"
          : `bar ${counting.bar} of ${counting.bars}`;
    this.$(".sequence-feedback").textContent =
      `Count-in · ${bars} · beat ${counting.beat}`;
  }
  private updatePlayback() {
    if (!this.session) return;
    const targetSection = this.playbackFromSection + this.playback.section;
    if (
      !this.passage.range &&
      targetSection !== this.section &&
      this.mode === "playback" &&
      this.active
    ) {
      this.changeSection(targetSection, true);
      return;
    }
    if (
      this.playback.state === "complete" &&
      this.passage.range &&
      this.loopPassage &&
      this.active
    ) {
      this.playback.restart();
      void this.playback.play(this.bpm);
      return;
    }
    const state = this.playback.state;
    const complete = state === "complete";
    let index = this.events.length - 1;
    while (
      index >= 0 &&
      this.events[index].milliseconds > this.playback.sectionPosition * 1000 + 1
    )
      index--;
    if (index < 0) index = 0;
    const sounding = this.playback.sounding;
    const counting = this.playback.counting;
    const view = `${state}:${this.section}:${index}:${sounding}:${counting?.bar}:${counting?.beat}`;
    if (view === this.playbackView) return;
    this.playbackView = view;
    highlightScore(
      this.$(".hymn-paper"),
      complete || state === "counting" || (state === "playing" && !sounding)
        ? undefined
        : this.events[index],
      this.$(".sequence-score"),
      true,
    );
    this.$(".hymn-count").textContent = complete
      ? "Complete"
      : `${index + 1} / ${this.events.length}`;
    const progress = this.$<HTMLProgressElement>(".hymn-progress");
    progress.max = this.events.length;
    progress.value = complete ? this.events.length : index;
    this.$(".sequence-feedback").textContent =
      state === "loading"
        ? "Loading…"
        : state === "playing"
          ? "Sing or play along."
          : complete
            ? "Complete. Play it again, or choose another section."
            : state === "paused"
              ? "Paused."
              : "Press Play to listen.";
    const button = this.$<HTMLButtonElement>(".hymn-pause");
    button.disabled = false;
    button.textContent =
      state === "loading"
        ? "Cancel"
        : state === "playing" || state === "counting"
          ? "Pause"
          : state === "paused"
            ? "Resume"
            : "Play";
    this.$(".hymn-restore-legacy").hidden = true;
    this.$(".hymn-prev").hidden = this.section === 0;
    this.$(".hymn-next").hidden =
      !complete && this.section + 1 === this.sections;
    this.$(".hymn-next").textContent =
      this.section + 1 < this.sections ? "Next section →" : "Next hymn →";
    this.$(".hymn-range-hint").hidden = true;
    this.piano.setUnavailable(true);
    this.showCountIn();
  }
}
