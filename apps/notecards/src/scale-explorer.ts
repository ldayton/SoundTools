import { mountPracticeOptions } from "./practice-controls";
import {
  SCALE_TONICS,
  scaleLabel,
  scaleNotes,
  scalePositions,
  type ScaleQuality,
} from "./guitar-scales";
import { persistence } from "./persistence";
import type { LivePractice } from "./live-practice";
import type { PracticeRoute } from "./navigation";
import {
  mergeGuitarScaleSettings,
  guitarScaleFromQuery,
} from "./guitar-scale-settings";
import "./scale-explorer.css";

export class ScaleExplorer implements LivePractice {
  readonly inputPolicy = "none" as const;
  enter() {
    this.render();
  }
  leave() {}
  interrupt() {}
  answer() {}
  applyRoute(route: PracticeRoute) {
    const settings = guitarScaleFromQuery(route.query, {
      tonic: this.tonic,
      quality: this.quality,
    });
    if (settings.tonic !== this.tonic || settings.quality !== this.quality) {
      this.tonic = settings.tonic;
      this.quality = settings.quality;
      this.update();
    }
    return true;
  }
  private tonic = 4;
  private quality: ScaleQuality = "major";
  constructor(
    private element: HTMLElement,
    _changed: () => void,
  ) {
    const saved = persistence.read<{ version: number; settings: unknown }>(
      "guitar-scales",
    );
    const settings = mergeGuitarScaleSettings(
      saved?.version === 1 ? saved.settings : undefined,
    );
    this.tonic = settings.tonic;
    this.quality = settings.quality;
    element.innerHTML = `<div class="scale-controls options-row"><label>Key<select id="scale-key" aria-label="Scale key"></select></label><label>Scale<select id="scale-quality" aria-label="Scale type"><option value="major">Major</option><option value="minor">Natural minor</option></select></label></div>
      <section class="scale-card sequence-practice" aria-labelledby="scale-title"><div class="scale-heading"><h2 id="scale-title"></h2><p class="scale-notes" aria-live="polite"></p></div>
      <p class="scale-orientation">Standard tuning · low E left → high E right</p>
      <div class="scale-diagram"></div><p class="scale-legend"><span class="scale-root-swatch" aria-hidden="true">R</span> Root <span class="scale-note-swatch" aria-hidden="true"></span> Other scale notes</p>
      <p class="scale-optional-legend"><span class="scale-optional-swatch" aria-hidden="true"></span> Gray = optional: same pitch on the next open string.</p>
      <p class="scale-footnote">Open strings above the nut · frets 1–5 below</p>
      <details class="scale-note-list"><summary>Notes by string and fret</summary><div></div></details></section>`;
    mountPracticeOptions(element, [
      element.querySelector<HTMLElement>(".scale-controls")!,
    ]);
    this.key.onchange = () => {
      this.tonic = Number(this.key.value);
      this.update();
    };
    this.type.onchange = () => {
      this.quality = this.type.value as ScaleQuality;
      this.update();
    };
  }
  private get key() {
    return this.element.querySelector<HTMLSelectElement>("#scale-key")!;
  }
  private get type() {
    return this.element.querySelector<HTMLSelectElement>("#scale-quality")!;
  }
  private update() {
    persistence.write("guitar-scales", {
      version: 1,
      settings: { tonic: this.tonic, quality: this.quality },
    });
    this.render();
  }
  private render() {
    this.key.innerHTML = SCALE_TONICS[this.quality]
      .map((name, i) => `<option value="${i}">${scaleLabel(name)}</option>`)
      .join("");
    this.key.value = String(this.tonic);
    this.type.value = this.quality;
    const title = `${scaleLabel(SCALE_TONICS[this.quality][this.tonic])} ${this.quality === "major" ? "major" : "natural minor"}`;
    this.element.querySelector("#scale-title")!.textContent = title;
    this.element.querySelector(".scale-notes")!.textContent = scaleNotes(
      this.tonic,
      this.quality,
    )
      .map((n) => scaleLabel(n.name))
      .join(" · ");
    const positions = scalePositions(this.tonic, this.quality);
    const x = (string: number) => 64 + (6 - string) * 48;
    const y = (fret: number) => (fret === 0 ? 55 : 84 + (fret - 0.5) * 60);
    const notes = positions
      .map(
        (n) =>
          `<g class="scale-tone${n.root ? " scale-root" : ""}${n.openAlternative ? " scale-optional" : ""}" data-string="${n.string}" data-fret="${n.fret}" data-midi="${n.midi}"><circle cx="${x(n.string)}" cy="${y(n.fret)}" r="18"/><text x="${x(n.string)}" y="${y(n.fret) + 5}">${scaleLabel(n.name)}</text>${n.root ? `<text class="scale-root-mark" x="${x(n.string) + 19}" y="${y(n.fret) - 16}">R</text>` : ""}</g>`,
      )
      .join("");
    this.element.querySelector(".scale-diagram")!.innerHTML =
      `<svg viewBox="0 0 352 400" role="img" aria-labelledby="scale-svg-title scale-svg-desc"><title id="scale-svg-title">${title} guitar scale, open strings through fret 5</title><desc id="scale-svg-desc">Six upright strings, low E on the left, high E on the right. Root notes are marked R. Gray fifth-fret notes are optional: play the adjacent higher string open for the same pitch and octave. Other roots are yellow. Full note positions are listed below the diagram.</desc>
      ${[3, 5].map((f) => `<circle class="scale-fret-marker" cx="184" cy="${y(f)}" r="11"/>`).join("")}
      ${[1, 2, 3, 4, 5].map((f) => `<line class="scale-fret" x1="64" x2="304" y1="${84 + f * 60}" y2="${84 + f * 60}"/><text class="scale-fret-number" x="25" y="${y(f) + 5}">${f}</text>`).join("")}
      ${[6, 5, 4, 3, 2, 1].map((s, i) => `<line class="scale-string" x1="${x(s)}" x2="${x(s)}" y1="84" y2="384" style="stroke-width:${2.6 - i * 0.3}"/><text class="scale-tuning" x="${x(s)}" y="20">${["E₂", "A₂", "D₃", "G₃", "B₃", "E₄"][i]}</text>`).join("")}
      <path class="scale-nut" d="M64 84H304"/>${notes}</svg>`;
    this.element.querySelector(".scale-note-list div")!.innerHTML =
      `<table><caption>${title} · sounding pitches</caption><thead><tr><th scope="col">String</th><th scope="col">Fret: note</th></tr></thead><tbody>${[
        6, 5, 4, 3, 2, 1,
      ]
        .map(
          (s) =>
            `<tr><th scope="row">${s}${s === 6 ? " · low E" : s === 1 ? " · high E" : ""}</th><td>${positions
              .filter((n) => n.string === s)
              .map(
                (n) =>
                  `${n.fret === 0 ? "Open" : n.fret}: ${scaleLabel(n.name)}${n.octave}${n.root ? " (root)" : ""}${n.openAlternative ? ` (optional: open string ${n.openAlternative})` : ""}`,
              )
              .join("; ")}</td></tr>`,
        )
        .join("")}</tbody></table>`;
  }
}
