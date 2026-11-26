import abcjs from "abcjs";
import { collectPianoScore } from "../../src/piano-score-fingering";
type Passage = {
  id: string;
  title: string;
  category: string;
  key: string;
  meter: string;
  bpm: number;
  abc: string;
  notes: {
    id: string;
    hand: string;
    midi: number;
    start: number;
    duration: number;
  }[];
  variants: { label: string; digits: Record<string, number> }[];
};
const ns = "http://www.w3.org/2000/svg";
function field(id: string, width = 70, multiline = false) {
  return `<span class="field ${multiline ? "multiline" : ""}" data-field="${id}" data-multiline="${multiline}" style="width:${width}px"></span>`;
}
function escape(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function score(host: HTMLElement, c: Passage, digits?: Record<string, number>) {
  // The common page header supplies the review tempo and feel. Section boxes
  // and source metronome text are omitted equally; all music is checked below.
  const printed = c.abc
    .split("\n")
    .filter((line) => !/^Q:|^P:/.test(line))
    .join("\n")
    .replace(/\[P:[^\]]*\]/g, "");
  // abcjs accepts engraving settings here; its public visual type omits staffsep.
  const params = {
    add_classes: true,
    staffwidth: 620,
    paddingtop: 25,
    paddingbottom: 16,
    paddingleft: 14,
    paddingright: 14,
    staffsep: 43,
    stretchlast: true,
    oneSvgPerLine: true,
    scale: 1,
  };
  const tune = abcjs.renderAbc(host, printed, params)[0];
  tune.setUpAudio({ chordsOff: true });
  const collected = collectPianoScore(tune);
  const signature = (notes: Passage["notes"]) =>
    JSON.stringify(
      notes.map((n) => [n.id, n.hand, n.midi, n.start, n.duration]),
    );
  if (signature(collected.notes) !== signature(c.notes))
    throw Error("Rendered music changed: " + c.id);
  const marks: {
    entry: (typeof collected.entries)[number];
    x: number;
    y: number;
    svg: SVGSVGElement;
    digit: number | undefined;
    chord: boolean;
  }[] = [];
  const seen = new Set<string>();
  for (const entry of collected.entries) {
    const digit = digits?.[entry.id];
    if (entry.tieFrom || !entry.absolute) continue;
    const unique = entry.hand + ":" + entry.start + ":" + entry.midi;
    if (seen.has(unique)) continue;
    seen.add(unique);
    const group =
      entry.absolute.elemset.find((e) => e.classList.contains("abcjs-note")) ||
      entry.absolute.elemset[0];
    const heads =
      group?.querySelectorAll<SVGGraphicsElement>(".abcjs-notehead");
    const head = heads?.[entry.pitchIndex];
    const svg = group?.ownerSVGElement;
    if (!head || !svg) throw Error("Missing printed notehead: " + entry.id);
    const matrix = svg.getScreenCTM()!.inverse().multiply(head.getScreenCTM()!),
      box = head.getBBox();
    const center = new DOMPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      ).matrixTransform(matrix),
      left = new DOMPoint(box.x, box.y).matrixTransform(matrix).x;
    const chord = (entry.note.pitches?.length || 0) > 1;
    marks.push({
      entry,
      x: chord ? left - 17 : center.x,
      y: chord ? center.y : center.y + (entry.hand === "right" ? -17 : 21),
      svg,
      digit,
      chord,
    });
  }
  // Stack chord digits in the same pitch order, equally for every candidate.
  const groups = new Map<object, typeof marks>();
  for (const mark of marks) {
    const key = mark.entry.note;
    const list = groups.get(key) || [];
    list.push(mark);
    groups.set(key, list);
  }
  for (const list of groups.values())
    if (list.some((m) => m.chord)) {
      list.sort((a, b) => a.y - b.y);
      const middle = (list[0].y + list.at(-1)!.y) / 2;
      list.forEach((m, i) => (m.y = middle + (i - (list.length - 1) / 2) * 12));
    }
  for (const m of marks) {
    if (m.digit === undefined) continue;
    const label = document.createElementNS(ns, "text");
    label.textContent = String(m.digit);
    label.setAttribute("x", String(m.x));
    label.setAttribute("y", String(m.y + 4));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "Arial, sans-serif");
    label.setAttribute("font-size", "13");
    label.setAttribute("font-weight", "600");
    label.setAttribute("stroke", "none");
    label.classList.add("review-digit");
    label.dataset.noteId = m.entry.id;
    m.svg.append(label);
  }
  // Reserve the same annotation bounds even for omitted digits and the blank
  // packet. Low LH labels must not be clipped by abcjs's original SVG bounds.
  for (const svg of host.querySelectorAll("svg")) {
    const own = marks.filter((m) => m.svg === svg),
      width = svg.width.baseVal.value,
      height = svg.height.baseVal.value;
    const top = Math.min(0, ...own.map((m) => m.y - 19)),
      bottom = Math.max(height, ...own.map((m) => m.y + 13));
    svg.setAttribute("viewBox", `0 ${top} ${width} ${bottom - top}`);
    svg.setAttribute("height", String(bottom - top));
  }
  // abcjs fixes the host and line wrappers to its original unannotated height.
  // Remove those wrappers so the extended SVG bounds participate in page flow.
  const svgs = Array.from(host.querySelectorAll("svg"));
  host.replaceChildren(...svgs);
  host.style.removeProperty("height");
  host.style.overflow = "visible";
  return {
    notes: collected.notes.length,
    marks: marks.filter((m) => m.digit !== undefined).length,
    svgs: host.querySelectorAll("svg").length,
  };
}
function review(c: Passage) {
  return `<section class="ratings"><p><b>Rate each version</b> 1 = poor, 5 = excellent; use N/A if you cannot judge.</p><table><thead><tr><th>Version</th><th>Comfort</th><th>Consistency</th><th>Beginner fit</th></tr></thead><tbody>${["A", "B", "C"].map((label) => `<tr><th>${label}</th>${["comfort", "consistency", "beginner"].map((metric) => `<td>${field(c.id + "." + label + "." + metric, 58)}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="preference"><b>Preferred</b> ${field(c.id + ".preference", 95)} <span>A, B, C, Tie or None</span> &nbsp; <b>Tied versions</b> ${field(c.id + ".ties", 90)}</p><div class="notes-label">Trouble spots, missing digits, corrections or a better alternative</div>${field(c.id + ".notes", 670, true)}</section>`;
}
export function renderPacket(
  payload: { study: string; cases: Passage[] },
  kind: "independent" | "comparison",
) {
  document.body.innerHTML = "";
  const cover = document.createElement("section");
  cover.className = "sheet cover";
  cover.innerHTML = `<div class="eyebrow">PIANO FINGERING REVIEW · ${payload.study}</div><h1>${kind === "independent" ? "Independent fingerings" : "Blind comparison"}</h1><p class="lead">${kind === "independent" ? "Write your own fingering before opening the comparison packet." : "Compare three proposals for the same eight passages."}</p><div class="rule"></div>${kind === "independent" ? `<h2>First pass</h2><ol><li>Use the learner profile below. Assume a beginner if no other level is recorded.</li><li>Play each passage at a comfortable tempo. Treat it as a short independent excerpt.</li><li>Write a coherent fingering on the unmarked score. Include important held-note constraints and any alternatives you would teach.</li><li>Finish this packet before opening the proposals. Keep your first choices unchanged during the later comparison.</li></ol>` : `<h2>Second pass</h2><ol><li>Complete the independent-fingering packet first.</li><li>Try A, B and C on the keyboard. Each version has identical music, layout and hand assignment.</li><li>Rate comfort, consistency through the phrase, and suitability for this learner from 1 to 5. Mark N/A if the excerpt is insufficient.</li><li>Choose a preferred version. Ties and None are valid. Mark the exact notes you would change, including any missing or physically conflicting digits.</li></ol><p>Version letters are reassigned for each passage. Some proposals may be identical. Return both marked packets before opening the separate organizer key.</p>`}<h2>Learner profile</h2><div class="profile">Learner or ID ${field(kind + ".learner", 440)}<br>Experience and comfortable reach ${field(kind + ".level", 360)}<br>Teacher ${field(kind + ".teacher", 270)} &nbsp; Date ${field(kind + ".date", 145)}</div><h2>Notation</h2><p>1 = thumb, 5 = little finger. The upper piano staff is right hand and the lower is left hand; the first two excerpts use right hand alone. A held or tied continuation keeps its finger and is not numbered again.</p><p>The music is taken from SongAlong. Lyrics are omitted for space. Every excerpt uses the same moderate practice tempo for comparison; you may play slower. The Voice + Piano excerpt shows the keyboard part only.</p><p class="muted">Eight excerpts · About 15 minutes per packet · New teacher judgments are pending. No preferred answer is implied by the order.</p><footer>${payload.study} · ${kind === "independent" ? "Independent pass" : "Blind comparison"} · 1 / 9</footer>`;
  document.body.append(cover);
  const metrics: {
    id: string;
    label: string;
    notes: number;
    marks: number;
    svgs: number;
  }[] = [];
  payload.cases.forEach((c, index) => {
    const sheet = document.createElement("section");
    sheet.className = "sheet";
    sheet.innerHTML = `<header><div class="eyebrow">${payload.study} · ${c.id} · ${escape(c.category)}</div><h2>${escape(c.title)}</h2><div class="meta">${escape(c.key)} major · ${escape(c.meter)} · ${c.notes.every((n) => n.hand === "right") ? "Right hand alone" : "Both piano hands"} · ${/Swing/i.test(c.abc) ? "Swing feel · " : ""}Practice quarter note = ${c.bpm}</div></header>`;
    document.body.append(sheet);
    const variants =
      kind === "independent"
        ? [{ label: "Your independent fingering", digits: undefined }]
        : c.variants;
    for (const variant of variants) {
      const block = document.createElement("div");
      block.className = "proposal";
      block.innerHTML = `<div class="version">${variant.label}</div><div class="score"></div>`;
      sheet.append(block);
      metrics.push({
        id: c.id,
        label: variant.label,
        ...score(block.querySelector(".score")!, c, variant.digits),
      });
    }
    if (kind === "independent")
      sheet.insertAdjacentHTML(
        "beforeend",
        `<div class="independent-notes"><h3>Your alternatives or teaching notes</h3>${field(c.id + ".independent-notes", 670, true)}<p>Keep these choices as your independent first response.</p></div>`,
      );
    else sheet.insertAdjacentHTML("beforeend", review(c));
    sheet.insertAdjacentHTML(
      "beforeend",
      `<footer>${payload.study} · ${c.id} · ${kind === "independent" ? "Independent pass" : "Blind comparison"} · ${index + 2} / 9</footer>`,
    );
  });
  return metrics;
}
