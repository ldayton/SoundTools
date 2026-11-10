import { loadPreferences, savePreferences } from "./preferences";
import { mergeHymnSettings, hymnSettingsFromQuery, type HymnSettings } from "./hymn-settings";
import type { InputPolicy, Interruption } from "./live-practice";
import { mountPracticeOptions } from "./practice-controls";
import type { NoteTimingEvent } from "abcjs";
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
import { diagnostics } from "./diagnostics";
const STORAGE = "soundtools:notecards:sight-reading:v1";
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
  private arrangement: Arrangement = "melody";
  private sectionBars: 0|2|4 = 4;
  private section = 0;
  private sections = 1;
  private position = 0;
  private active = false;
  private paused = false;
  private events: NoteTimingEvent[] = [];
  private session?: WaitForMe;
  private piano: Piano;
  private observer: ResizeObserver;
  private lastWidth = 0;
  private matches = hymns;
  private choice = -1;
  private resizeFrame = 0;
  constructor(
    private element: HTMLElement,
    private acceptanceChanged: () => void,
  ) {
    const saved = loadPreferences(STORAGE,this.settings(),mergeHymnSettings);
    this.restoreSettings(saved);
    element.innerHTML = `<div class="hymn-controls"><div class="hymn-picker"><label for="hymn-search">Hymn</label><div class="hymn-search-field"><input id="hymn-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="hymn-results" autocomplete="off" spellcheck="false" /><span aria-hidden="true">⌄</span></div><ul id="hymn-results" role="listbox" aria-label="Hymns · familiar favourites first" hidden></ul><p class="hymn-order">Familiar favourites first · ${hymns.length} hymns</p></div></div>
    <div class="practice-controls hymn-grades"><label>Arrangement<select id="hymn-arrangement">${ARRANGEMENTS.map((a) => `<option value="${a.id}">${a.label}</option>`).join("")}</select></label><label>Practise<select id="hymn-length"><option value="4">4 bars at a time</option><option value="2">2 bars at a time</option><option value="0">Whole hymn</option></select></label><label class="hymn-section-field">Section<select id="hymn-section"></select></label></div>
    <section class="sequence-practice" aria-label="Hymn sight reading"><div class="sequence-top"><span>Wait for me</span><span class="hymn-count"></span></div><h2 class="sequence-title"></h2><p class="sequence-help">Play at your pace. Sing along with the words.</p><progress class="hymn-progress" aria-label="Hymn progress"></progress><div class="sequence-score" tabindex="0" role="region" aria-label="Hymn score with aligned lyrics"><div class="hymn-paper"></div></div><p class="sequence-feedback" role="status" aria-live="polite"></p><div class="sequence-transport"><button type="button" class="hymn-pause">Pause</button><button type="button" class="hymn-restart">Start again</button><button type="button" class="hymn-prev" hidden>← Previous section</button><button type="button" class="hymn-next" hidden>Next hymn →</button></div><details class="hymn-screen"><summary>On-screen piano</summary><p class="hymn-screen-hint">Tap the highlighted note’s key.</p><div class="hymn-piano"></div></details><details class="hymn-source"><summary>About this hymn</summary><p class="hymn-credits"></p><a class="hymn-source-link" target="_blank" rel="noopener noreferrer">Open Hymnal source</a><p>Public-domain words, melody and setting. First verse and refrain.</p></details></section>`;
    mountPracticeOptions(
      element,
      [this.$(".hymn-controls"), this.$(".practice-controls")],
      "Changing options starts the selected section again.",
    );
    this.piano = new Piano(this.$(".hymn-piano"), (note) => {
      if (this.accepting) this.answer(note);
    });
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
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    this.$<HTMLSelectElement>("#hymn-length").value = String(this.sectionBars);
    for (const field of ["arrangement", "length", "section"])
      this.$<HTMLSelectElement>("#hymn-" + field).onchange = (e) => {
        const value = (e.target as HTMLSelectElement).value;
        if (field === "arrangement") this.arrangement = value as Arrangement;
        if (field === "length") {
          this.sectionBars = Number(value) as 0|2|4;
          this.section = 0;
        }
        if (field === "section") this.section = Number(value);
        this.position = 0;
        this.paused = false;
        this.render();
        this.save();
      };
    this.$(".hymn-prev").onclick = () => this.changeSection(this.section - 1);
    this.$(".hymn-pause").onclick = () => {
      this.paused = !this.paused;
      this.session?.resetGesture();
      this.update();
    };
    this.$(".hymn-restart").onclick = () => {
      this.position = 0;
      this.paused = false;
      this.render();
      this.save();
    };
    this.$(".hymn-next").onclick = () => {
      if (this.section + 1 < this.sections)
        this.changeSection(this.section + 1);
      else this.choose(hymns[(hymns.indexOf(this.hymn) + 1) % hymns.length]);
    };
    this.$(".hymn-screen").addEventListener("toggle", () => {
      if ((this.$(".hymn-screen") as HTMLDetailsElement).open)
        this.preparePiano();
    });
    this.observer = new ResizeObserver(() => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        const width = Math.round(this.$(".sequence-score").clientWidth);
        if (this.active && width > 0 && Math.abs(width - this.lastWidth) > 2)
          this.render();
      });
    });
    this.observer.observe(this.$(".sequence-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get inputPolicy(): InputPolicy {
    if (!this.active || !this.$("#hymn-results").hidden || !this.session)
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
    const previous = this.settings();
    const changedHymn = this.hymn.id !== hymn.id;
    const next = hymnSettingsFromQuery({...previous,hymn:hymn.id,section:changedHymn ? 0 : previous.section},route.query);
    if (previous.hymn !== next.hymn || previous.arrangement !== next.arrangement || previous.sectionBars !== next.sectionBars || previous.section !== next.section) {
      next.position = 0; this.paused = false;
    }
    this.restoreSettings(next);
    this.$<HTMLInputElement>("#hymn-search").value = hymn.title;
    this.$<HTMLSelectElement>("#hymn-arrangement").value = this.arrangement;
    this.$<HTMLSelectElement>("#hymn-length").value = String(this.sectionBars);
    return true;
  }
  private publishRoute() {
    if (!this.active) return;
    const q = new URLSearchParams({
      arrangement: this.arrangement,
      bars: String(this.sectionBars),
      section: String(this.section + 1),
    });
    this.element.dispatchEvent(
      new CustomEvent("hymn-route", {
        detail: `/piano/hymns/${this.hymn.id}?${q}`,
      }),
    );
  }
  private settings(): HymnSettings {
    return {hymn:this.hymn.id,arrangement:this.arrangement,sectionBars:this.sectionBars,section:this.section,position:this.position};
  }
  private restoreSettings(value: HymnSettings) {
    this.hymn = hymns.find((h) => h.id === value.hymn)!;
    this.arrangement = value.arrangement; this.sectionBars = value.sectionBars;
    this.section = value.section; this.position = value.position;
  }
  private save() { this.publishRoute(); savePreferences(STORAGE,this.settings()); }
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
    this.section = 0;
    this.position = 0;
    this.paused = false;
    this.closeResults();
    this.render();
    this.save();
  }
  private changeSection(section: number) {
    this.section = section;
    this.position = 0;
    this.paused = false;
    this.render();
    this.save();
  }
  private render() {
    const paper = this.$(".hymn-paper");
    this.lastWidth = Math.round(this.$(".sequence-score").clientWidth);
    if (!this.lastWidth) return;
    this.session = undefined;
    this.acceptanceChanged();
    this.$(".sequence-title").textContent = this.hymn.title;
    this.$(".hymn-credits").textContent = this.hymn.credits.join(" ");
    // Link to the verified source mirror; the original site's TLS currently fails.
    this.$<HTMLAnchorElement>(".hymn-source-link").href =
      "https://github.com/mzealey/openhymnal/blob/d35811b2d5c9b0bbc5887d60a2936454815416e8/Complete/" +
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
      this.events = drawPracticeScore(paper, score.abc, this.lastWidth);
      this.session = new WaitForMe(eventSteps(this.events), this.position);
      this.position = this.session.index;
      this.preparePiano();
      this.update(true);
      this.publishRoute();
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
    this.$(".hymn-screen-hint").textContent =
      this.arrangement !== "melody"
        ? "Tap each note in the highlighted chord, in any order."
        : "Tap the highlighted note’s key.";
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
    if (result === "wrong") {
      this.$(".sequence-feedback").textContent =
        "Try again — follow the highlighted notes.";
      return;
    }
    if (result === "partial") {
      this.$(".sequence-feedback").textContent = held
        ? "Keep those notes held and add the rest of the chord."
        : "Now add the rest of the highlighted chord.";
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
  private update(scroll = false) {
    const session = this.session;
    if (!session) return;
    highlightScore(
      this.$(".hymn-paper"),
      this.events[session.index],
      this.$(".sequence-score"),
      scroll,
    );
    const complete = session.complete;
    this.$(".hymn-count").textContent = complete
      ? "Complete"
      : `${Math.min(session.index + 1, session.steps.length)} / ${session.steps.length}`;
    const progress = this.$<HTMLProgressElement>(".hymn-progress");
    progress.max = session.steps.length;
    progress.value = session.index;
    this.$(".sequence-feedback").textContent = complete
      ? "Lovely. Sing it again, or choose another hymn."
      : this.paused
        ? "Paused. Resume when you’re ready."
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
    this.$(".hymn-pause").classList.toggle("primary", !complete);
    this.$(".hymn-next").classList.toggle("primary", complete);
    this.piano.setUnavailable(!this.accepting);
    this.acceptanceChanged();
  }
}
