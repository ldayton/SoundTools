import { mountPracticePiano, isPianoVisible } from "./practice-piano";
import { hymnSettingsFromQuery, type HymnSettings } from "./hymn-settings";
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
  key?: HymnKey;
  zoom?: number;
  hymn: string;
  arrangement: Arrangement;
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
  private arrangement: Arrangement = "melody";
  private sectionBars: 0 | 2 | 4 = 4;
  private section = 0;
  private sections = 1;
  private position = 0;
  private bookmarks: Record<string, Bookmark> = {};
  private content = "";
  private legacyBookmark?: { key: string; position: number };
  private savedSections: Record<string, number> = {};
  private selectionKey() {
    return `${this.hymn.id}:${this.arrangement}:${this.sectionBars}${hymnKeySuffix(this.hymn.key, this.key)}`;
  }
  private restoreSection() {
    const n = this.savedSections[this.selectionKey()];
    this.section = Number.isSafeInteger(n) && n >= 0 ? n : 0;
  }
  private restorePending = true;
  private bookmarkKey() {
    return `${this.hymn.id}:${this.arrangement}:${this.sectionBars}:${this.section}${hymnKeySuffix(this.hymn.key, this.key)}`;
  }

  private active = false;
  private paused = false;
  private events: PracticeEvent[] = [];
  private session?: WaitForMe;
  private piano: Piano;
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
      if ([0.85, 1, 1.2].includes(saved?.zoom)) this.zoom = saved.zoom;
      if (isHymnKey(saved?.key)) this.key = saved.key;
      this.hymn = hymns.find((h) => h.id === saved?.hymn) || hymns[0];
      if (ARRANGEMENTS.some((a) => a.id === saved?.arrangement))
        this.arrangement = saved.arrangement;
      else if (saved) {
        this.arrangement = saved.chords === true ? "original" : "melody";
        this.sectionBars = 0;
      }
      if ([0, 2, 4].includes(saved?.sectionBars))
        this.sectionBars = saved.sectionBars as 0 | 2 | 4;
      if (Number.isSafeInteger(saved?.section) && saved.section >= 0)
        this.section = saved.section;
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
    element.innerHTML = `<div class="hymn-controls"><div class="hymn-picker"><label for="hymn-search">Hymn</label><div class="hymn-search-field"><input id="hymn-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="hymn-results" autocomplete="off" spellcheck="false" /><span aria-hidden="true">⌄</span></div><ul id="hymn-results" role="listbox" aria-label="Hymns" hidden></ul></div><label class="hymn-key-field">Key<select id="hymn-key" aria-label="Hymn key"><option value="original">Original</option>${HYMN_KEYS.map((key) => `<option value="${key}">${hymnKeyLabel(key)}</option>`).join("")}</select></label></div>
    <div class="practice-controls hymn-grades"><label>Arrangement<select id="hymn-arrangement">${ARRANGEMENTS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}</select></label><label>Practise<select id="hymn-length"><option value="4">4 bars</option><option value="2">2 bars</option><option value="0">Whole hymn</option></select></label><label class="hymn-section-field">Section<select id="hymn-section"></select></label></div>
    <section class="sequence-practice" aria-label="Hymn sight reading"><div class="sequence-top"><span>Wait for me</span><span class="hymn-count"></span></div><h2 class="sequence-title"></h2><p class="sequence-help">Play at your pace. Sing along with the words.</p><progress class="hymn-progress" aria-label="Hymn progress"></progress><p class="sequence-feedback" role="status" aria-live="polite" aria-atomic="true"></p><div class="sequence-score" tabindex="0" role="region" aria-label="Hymn score with aligned lyrics" aria-describedby="hymn-scroll-hint"><div class="hymn-paper"></div></div><p id="hymn-scroll-hint" class="hymn-scroll-hint" hidden>Scroll for more ↕</p><div class="sequence-transport"><button type="button" class="hymn-pause">Pause</button><button type="button" class="hymn-restart">Start again</button><button type="button" class="hymn-restore-legacy" hidden></button><button type="button" class="hymn-prev" aria-label="Previous section" hidden>← Previous</button><button type="button" class="hymn-next" hidden>Next hymn →</button></div><div class="hymn-midi-slot"></div><div class="hymn-piano"></div><details class="hymn-source"><summary>About this hymn</summary><p class="hymn-credits"></p><a class="hymn-source-link" target="_blank" rel="noopener noreferrer">Open Hymnal source</a><p class="hymn-source-description"></p></details></section>`;
    const context = document.createElement("div");
    context.className = "hymn-context";
    context.append(this.$(".hymn-controls"), this.$(".hymn-grades"));
    const tools = document.createElement("div");
    tools.className = "hymn-tools";
    tools.innerHTML =
      '<label class="hymn-size-field">Score size<select aria-label="Score size"><option value="0.85">Small</option><option value="1" selected>Medium</option><option value="1.2">Large</option></select></label>';
    context
      .querySelector(".hymn-controls")!
      .append(tools.querySelector("label")!);
    tools.append(this.$(".hymn-source"));
    context.append(tools);
    mountPracticeOptions(element, [context]);
    mountPracticePiano(this.$(".hymn-piano"), this.$(".sequence-transport"), {
      buttonClass: "hymn-keyboard-toggle",
      changed: () => this.updateRangeHint(),
    });
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
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    this.$<HTMLSelectElement>("#hymn-length").value = String(this.sectionBars);
    for (const field of ["arrangement", "length", "section"])
      this.$<HTMLSelectElement>("#hymn-" + field).onchange = (e) => {
        const value = (e.target as HTMLSelectElement).value;
        if (field === "arrangement") this.arrangement = value as Arrangement;
        if (field === "length") {
          this.sectionBars = Number(value) as 0 | 2 | 4;
          this.section = 0;
        }
        if (field === "section") this.section = Number(value);
        else this.restoreSection();
        this.restorePending = true;
        this.render();
        this.save();
      };
    this.$(".hymn-prev").onclick = () => this.changeSection(this.section - 1);
    this.$(".hymn-pause").onclick = () => {
      this.paused = !this.paused;
      this.session?.resetGesture();
      this.update();
      this.save();
    };
    this.$(".hymn-restart").onclick = () => {
      this.position = 0;
      this.paused = false;
      this.restorePending = false;
      this.render();
      this.save();
    };
    this.$(".hymn-restore-legacy").onclick = () => {
      const old = this.legacyBookmark;
      if (
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
      !persistence.writable ||
      !this.active ||
      !this.$("#hymn-results").hidden ||
      !this.session
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
  interrupt(_reason: Interruption) {
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
      old.arrangement !== next.arrangement ||
      old.sectionBars !== next.sectionBars;
    this.hymn = hymn;
    this.key = next.key || "original";
    this.arrangement = next.arrangement;
    this.sectionBars = next.sectionBars;
    if (changed) this.restoreSection();
    if (route.query.has("section")) this.section = next.section;
    if (changed || this.section !== old.section) {
      this.restorePending = true;
      this.position = 0;
      this.paused = false;
    }
    this.$<HTMLInputElement>("#hymn-search").value = this.hymn.title;
    this.$<HTMLSelectElement>("#hymn-key").value = this.key;
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    this.$<HTMLSelectElement>("#hymn-length").value = String(this.sectionBars);
    return true;
  }
  private settings(): HymnSettings {
    return {
      hymn: this.hymn.id,
      key: this.key,
      arrangement: this.arrangement,
      sectionBars: this.sectionBars,
      section: this.section,
      position: this.position,
    };
  }
  private publishRoute() {
    if (!this.active) return;
    const q = new URLSearchParams({
      arrangement: this.arrangement,
      bars: String(this.sectionBars),
      section: String(this.section + 1),
    });
    if (this.key !== "original") q.set("key", this.key);
    this.element.dispatchEvent(
      new CustomEvent("hymn-route", {
        detail: `/piano/hymns/${this.hymn.id}?${q}`,
      }),
    );
  }
  private save() {
    this.publishRoute();
    if (this.session && this.content)
      this.bookmarks[this.bookmarkKey()] = bookmark(
        this.content,
        this.position,
        this.paused,
        this.session.steps.length,
      );
    this.savedSections[this.selectionKey()] = this.section;
    persistence.write("sight", {
      version: 1,
      key: this.key,
      zoom: this.zoom,
      hymn: this.hymn.id,
      arrangement: this.arrangement,
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
    this.restoreSection();
    this.restorePending = true;
    this.closeResults();
    this.render();
    this.save();
  }
  private changeSection(section: number) {
    this.section = section;
    this.restorePending = true;
    this.render();
    this.save();
  }
  private render(layoutOnly = false) {
    const paper = this.$(".hymn-paper");
    this.lastWidth = Math.round(this.$(".sequence-score").clientWidth);
    if (!this.lastWidth) return;
    const previous = this.session;
    const feedback = this.$(".sequence-feedback");
    const previousText = feedback.textContent;
    const previousKind = feedback.dataset.kind;
    if (!layoutOnly) {
      this.session = undefined;
      this.acceptanceChanged();
    }
    this.$(".sequence-title").textContent = this.hymn.title;
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
      const score = arrangeHymn(
        this.hymn,
        this.arrangement,
        this.sectionBars,
        this.section,
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
      this.$(".hymn-section-field").hidden = this.sections === 1;
      this.$<HTMLSelectElement>("#hymn-section").replaceChildren(
        ...Array.from(
          { length: this.sections },
          (_, i) => new Option(`${i + 1} of ${this.sections}`, String(i)),
        ),
      );
      this.$<HTMLSelectElement>("#hymn-section").value = String(this.section);
      this.$(".sequence-help").textContent =
        ARRANGEMENTS.find((a) => a.id === this.arrangement)!.help +
        " Sing along with the words.";
      this.events = drawPracticeScore(paper, score.abc, this.lastWidth, {
        scale: this.zoom,
        transpose: transposition.semitones,
      });
      const steps = eventSteps(this.events);
      const content = JSON.stringify({
        matcher: 1,
        abc: score.abc,
        steps,
        ...(transposition.semitones
          ? { transpose: transposition.semitones }
          : {}),
      });
      if (this.restorePending || (this.content && this.content !== content)) {
        const restored = restoreBookmark(
          this.bookmarks[this.bookmarkKey()],
          content,
          steps.length,
        );
        this.position = restored.position;
        this.paused = restored.paused;
        this.restorePending = false;
      }
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
      this.preparePiano();
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
      this.session = undefined;
      this.events = [];
      this.$(".sequence-feedback").textContent =
        "This hymn couldn’t load. Try another hymn or reload.";
      diagnostics.capture(error, "sight_reading.render_failed");
      this.acceptanceChanged();
    }
  }
  private preparePiano() {
    if (!this.session) return;
    this.piano.show(...keyboardRange(this.events), false);
    this.clearPianoSelection();
  }
  private updateRangeHint() {
    if (!this.piano) return;
    if (!isPianoVisible()) {
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
  private clearPianoSelection() {
    this.element
      .querySelectorAll(".sight-key-selected")
      .forEach((e) => e.classList.remove("sight-key-selected"));
  }
  answer(note: number, held?: readonly number[]) {
    if (this.inputPolicy === "none") return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "restarted") this.paused = false;
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
      if (result === "wrong") return;
      if (!held)
        this.element
          .querySelector(`[data-piano="${note}"]`)
          ?.classList.add("sight-key-selected");
      return;
    }
    this.position = this.session!.index;
    this.clearPianoSelection();
    this.save();
    this.update(true);
  }
  private update(scroll = false, preserveAcceptance = false) {
    const session = this.session;
    if (!session) return;
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
        : this.arrangement !== "melody"
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
    if (!preserveAcceptance) this.acceptanceChanged();
  }
}
