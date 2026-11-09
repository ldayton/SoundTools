import abcjs, { type NoteTimingEvent, type TuneObject } from "abcjs";
import hymns from "./hymns.json";
import { WaitForMe, searchHymns } from "./sight-reading-model";
import { Piano } from "./piano";
import { diagnostics } from "./diagnostics";
const STORAGE = "soundtools:notecards:sight-reading:v1";
type VisualTune = TuneObject & { noteTimings: NoteTimingEvent[] };
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
  private chords = false;
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
  readonly midiSlot: HTMLElement;
  constructor(
    private element: HTMLElement,
    private acceptanceChanged: () => void,
  ) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE) || "null");
      this.hymn = hymns.find((h) => h.id === saved?.hymn) || hymns[0];
      this.chords = saved?.chords === true;
      if (Number.isSafeInteger(saved?.position) && saved.position >= 0)
        this.position = saved.position;
    } catch {
      /* Private browsing or an older saved preference. */
    }
    element.innerHTML = `<div class="hymn-controls"><div class="hymn-picker"><label for="hymn-search">Hymn</label><div class="hymn-search-field"><input id="hymn-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="hymn-results" autocomplete="off" spellcheck="false" /><span aria-hidden="true">⌄</span></div><ul id="hymn-results" role="listbox" aria-label="Hymns · familiar favourites first" hidden></ul><p class="hymn-order">Familiar favourites first · ${hymns.length} hymns</p></div><label class="hymn-chords"><input id="hymn-chords" type="checkbox" /> Include chords</label></div>
    <section class="hymn-practice" aria-label="Hymn sight reading"><div class="hymn-top"><span>Wait for me</span><span class="hymn-count"></span></div><h2 class="hymn-title"></h2><p class="hymn-help">Play at your pace. Sing along with the words.</p><progress class="hymn-progress" aria-label="Hymn progress"></progress><div class="hymn-score" tabindex="0" role="region" aria-label="Hymn score with aligned lyrics"><div class="hymn-paper"></div></div><p class="hymn-feedback" role="status" aria-live="polite"></p><div class="hymn-transport"><button type="button" class="hymn-pause">Pause</button><button type="button" class="hymn-restart">Start again</button><button type="button" class="hymn-next" hidden>Next hymn →</button></div><div class="hymn-midi-slot"></div><details class="hymn-screen"><summary>On-screen piano</summary><p class="hymn-screen-hint">Tap the highlighted note’s key.</p><div class="hymn-piano"></div></details><details class="hymn-source"><summary>About this hymn</summary><p class="hymn-credits"></p><a class="hymn-source-link" target="_blank" rel="noopener noreferrer">Open Hymnal source</a><p>Public-domain words, melody and setting. First verse and refrain.</p></details></section>`;
    this.midiSlot = this.$(".hymn-midi-slot");
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
    this.$<HTMLInputElement>("#hymn-chords").checked = this.chords;
    this.$<HTMLInputElement>("#hymn-chords").onchange = (e) => {
      this.chords = (e.target as HTMLInputElement).checked;
      this.position = 0;
      this.paused = false;
      this.render();
      this.save();
    };
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
    this.$(".hymn-next").onclick = () =>
      this.choose(hymns[(hymns.indexOf(this.hymn) + 1) % hymns.length]);
    this.$(".hymn-screen").addEventListener("toggle", () => {
      if ((this.$(".hymn-screen") as HTMLDetailsElement).open)
        this.preparePiano();
    });
    this.observer = new ResizeObserver(() => {
      const width = Math.round(this.$(".hymn-score").clientWidth);
      if (this.active && width > 0 && Math.abs(width - this.lastWidth) > 2)
        this.render();
    });
    this.observer.observe(this.$(".hymn-score"));
  }
  private $<T extends HTMLElement = HTMLElement>(s: string) {
    return this.element.querySelector<T>(s)!;
  }
  get listening() {
    return this.active && this.$("#hymn-results").hidden && !!this.session;
  }
  get accepting() {
    return this.listening && !this.paused && !this.session!.complete;
  }
  setActive(active: boolean) {
    this.active = active;
    if (active) this.render();
    else {
      this.closeResults();
      this.session?.resetGesture();
    }
    this.acceptanceChanged();
  }
  interrupted() {
    this.session?.resetGesture();
    this.clearPianoSelection();
  }
  private save() {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({
          hymn: this.hymn.id,
          chords: this.chords,
          position: this.position,
        }),
      );
    } catch {
      diagnostics.offline("storage", "failed", { cacheReason: "storage" });
    }
  }
  private showResults(query: string) {
    this.interrupted();
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
    this.position = 0;
    this.paused = false;
    this.closeResults();
    this.render();
    this.save();
  }
  private render() {
    const paper = this.$(".hymn-paper");
    this.lastWidth = Math.round(this.$(".hymn-score").clientWidth);
    if (!this.lastWidth) return;
    this.session = undefined;
    this.acceptanceChanged();
    this.$(".hymn-title").textContent = this.hymn.title;
    this.$(".hymn-credits").textContent = this.hymn.credits.join(" ");
    // Link to the verified source mirror; the original site's TLS currently fails.
    this.$<HTMLAnchorElement>(".hymn-source-link").href =
      "https://github.com/mzealey/openhymnal/blob/d35811b2d5c9b0bbc5887d60a2936454815416e8/Complete/" +
      encodeURIComponent(this.hymn.folder) +
      "/" +
      encodeURIComponent(this.hymn.file);
    try {
      const tune = abcjs.renderAbc(
        paper,
        "%%vocalfont sans-serif 12\n" +
          (this.chords ? this.hymn.harmony : this.hymn.melody),
        {
          add_classes: true,
          minPadding: 6,
          responsive: "resize",
          oneSvgPerLine: true,
          staffwidth: Math.max(240, this.lastWidth - 28),
          wrap: {
            minSpacing: 2,
            maxSpacing: 2.6,
            preferredMeasuresPerLine: 4,
          },
          paddingtop: 12,
          paddingbottom: 18,
          paddingleft: 12,
          paddingright: 12,
        },
      )[0] as VisualTune;
      if (!tune || tune.warnings?.length)
        throw Error("Hymn notation could not be read");
      // Computes pitches/ties, not sound: no AudioContext, samples, or audio playback.
      tune.setUpAudio({});
      tune.setTiming(60, 0);
      this.events = tune.noteTimings.filter(
        (e) => e.type === "event" && e.midiPitches?.length,
      );
      this.session = new WaitForMe(
        this.events.map((e) => ({
          pitches: [...new Set(e.midiPitches!.map((p) => p.pitch))],
        })),
        this.position,
      );
      this.position = this.session.index;
      paper
        .querySelectorAll(".abcjs-title,.abcjs-subtitle")
        .forEach((el) => el.remove());
      paper.querySelectorAll("svg").forEach((svg) => {
        if (!svg.querySelector(".abcjs-staff")) {
          const wrapper = svg.parentElement;
          svg.remove();
          if (
            wrapper !== paper &&
            wrapper?.classList.contains("abcjs-container")
          )
            wrapper.remove();
        }
      });
      this.preparePiano();
      this.update(true);
    } catch (error) {
      this.session = undefined;
      this.events = [];
      this.$(".hymn-feedback").textContent =
        "This hymn couldn’t load. Try another hymn or reload.";
      diagnostics.capture(error, "sight_reading.render_failed");
      this.acceptanceChanged();
    }
  }
  private preparePiano() {
    if (!this.session) return;
    const pitches = this.session.steps.flatMap((s) => s.pitches);
    const low = Math.floor(Math.min(...pitches) / 12) * 12;
    const high = Math.ceil((Math.max(...pitches) + 1) / 12) * 12 - 1;
    this.piano.show(low, high, false);
    this.clearPianoSelection();
    this.$(".hymn-screen-hint").textContent = this.chords
      ? "Tap each note in the highlighted chord, in any order."
      : "Tap the highlighted note’s key.";
  }
  private clearPianoSelection() {
    this.element
      .querySelectorAll(".sight-key-selected")
      .forEach((e) => e.classList.remove("sight-key-selected"));
  }
  answer(note: number, held?: readonly number[]) {
    if (!this.listening) return;
    const result = this.session!.answer(note, held, !this.paused);
    if (result === "ignored") return;
    if (result === "restarted") this.paused = false;
    if (result === "wrong") {
      this.$(".hymn-feedback").textContent =
        "Try again — follow the highlighted notes.";
      return;
    }
    if (result === "partial") {
      this.$(".hymn-feedback").textContent = held
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
    this.element
      .querySelectorAll(".sight-current")
      .forEach((el) => el.classList.remove("sight-current"));
    if (!session.complete) {
      const event = this.events[session.index];
      const elements = (event.elements || []).flat().filter(Boolean);
      elements.forEach((el) => el.classList.add("sight-current"));
      if (scroll && elements[0]) {
        const viewport = this.$(".hymn-score");
        const note = (
          elements[0].closest("svg") || elements[0]
        ).getBoundingClientRect();
        const box = viewport.getBoundingClientRect();
        // Scroll only this score, never the entire page or the piano below it.
        if (note.top < box.top || note.bottom > box.bottom)
          viewport.scrollTop += note.top - box.top - 12;
      }
    }
    const complete = session.complete;
    this.$(".hymn-count").textContent = complete
      ? "Complete"
      : `${Math.min(session.index + 1, session.steps.length)} / ${session.steps.length}`;
    const progress = this.$<HTMLProgressElement>(".hymn-progress");
    progress.max = session.steps.length;
    progress.value = session.index;
    this.$(".hymn-feedback").textContent = complete
      ? "Lovely. Sing it again, or choose another hymn."
      : this.paused
        ? "Paused. Continue when you’re ready."
        : this.chords
          ? "Play the highlighted notes together."
          : "Play the highlighted note.";
    this.$<HTMLButtonElement>(".hymn-pause").disabled = complete;
    this.$(".hymn-pause").textContent = this.paused ? "Continue" : "Pause";
    this.$(".hymn-next").hidden = !complete;
    this.piano.setUnavailable(!this.accepting);
    this.acceptanceChanged();
  }
}
