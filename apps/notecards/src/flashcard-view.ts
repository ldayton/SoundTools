import { KEYS, ROUND_LENGTHS } from "./model";
import { STRINGS } from "./guitar";
import { mountPracticeOptions } from "./practice-controls";
/** Flashcard UI; the app shell owns navigation/settings and the session owner owns suspended rounds. */
export function mountFlashcardView(element: HTMLElement, roundLength: number) {
  element.innerHTML = `<div class="below"><div class="flashcard-options"><div class="options-row"><label class="round-length">Cards per round<select id="roundLength">${ROUND_LENGTHS.map((n) => `<option value="${n}">${n}</option>`).join("")}</select></label><label id="key-setting">Key<select id="key">${KEYS.map((k) => `<option value="${k.id}">${k.label.replace(/ ·.*$/, "")}</option>`).join("")}</select></label>
<label id="signature-practice-setting" hidden>Keys<select id="signaturePractice"><option value="major">Major only</option><option value="minor">Minor only</option><option value="both">Major & minor</option></select></label>
<label id="signature-limit-setting" hidden>Maximum sharps / flats<select id="signatureMaxAccidentals">${Array.from({ length: 8 }, (_, n) => `<option value="${n}">${n === 0 ? "None" : `Up to ${n}`}</option>`).join("")}</select></label>
<label id="signature-accidentals-setting" hidden>Include<select id="signatureAccidentals"><option value="both">Sharps & flats</option><option value="sharps">Sharps only</option><option value="flats">Flats only</option></select></label>
<label id="piano-prompt-setting" hidden>Show<select id="pianoPrompt"><option value="staff">Staff</option><option value="name">Note name</option></select></label>
<label id="name-notes-setting" hidden>Notes<select id="nameNotes"><option value="all">All notes</option><option value="naturals">Naturals</option></select></label>
</div>
<div id="piano-notation-options" hidden><div class="options-row">
<label>Staff layout<select id="staffLayout"><option value="treble">Treble</option><option value="bass">Bass</option><option value="grand">Grand staff</option></select></label>
<label id="overlap-setting">Overlapping notes<select id="overlapPractice"><option value="standard">Standard</option><option value="both">Both clefs</option></select></label>
<label>Octave markings<select id="octavePractice"><option value="off">Off</option><option value="practice">8va / 8vb</option></select></label>
</div><p class="notation-help">8va: play an octave higher. 8vb: play an octave lower.</p>
</div>
<div class="range" id="pitch-range" role="group" aria-label="Sounding guitar pitch range">${(["low", "high"] as const).map((f) => `<div><label for="staff-${f}-spin">${f === "low" ? "Lowest" : "Highest"}</label><div class="note-field"><input id="staff-${f}-spin" aria-label="${f === "low" ? "Lowest" : "Highest"} note" readonly /><button id="staff-${f}-choose" type="button" aria-label="Choose ${f === "low" ? "lowest" : "highest"} note">⌄</button></div></div>`).join("")}</div>
<div class="range" id="piano-range" role="group" aria-label="Piano pitch range" hidden>${(["low", "high"] as const).map((f) => `<div><label for="${f}-spin">${f === "low" ? "Lowest" : "Highest"}</label><div class="note-field"><input id="${f}-spin" aria-label="${f === "low" ? "Lowest" : "Highest"} note" readonly /><button id="${f}-choose" type="button" aria-label="Choose ${f === "low" ? "lowest" : "highest"} note">⌄</button></div></div>`).join("")}</div>
<p id="piano-range-notice" class="piano-range-notice" hidden></p>
<div id="guitar-options" hidden><fieldset class="strings"><legend>Strings</legend>${[
    ...STRINGS,
  ]
    .reverse()
    .map(
      (s) =>
        `<button type="button" data-string-toggle="${s.number}" aria-label="String ${s.number}, ${s.name}" aria-pressed="false">${s.number}<small>${s.name}</small></button>`,
    )
    .join(
      "",
    )}</fieldset><div class="range">${(["minFret", "maxFret"] as const).map((f) => `<label>${f === "minFret" ? "Lowest fret" : "Highest fret"}<select id="${f}">${Array.from({ length: 13 }, (_, i) => `<option value="${i}">${i === 0 ? "0 · Open" : i}</option>`).join("")}</select></label>`).join("")}</div></div>
</div></div><section class="practice" aria-label="Note recognition practice"><div class="card-top"><span id="context"></span><span id="counter"></span></div><progress id="progress" max="${roundLength}" value="0" aria-label="Session progress"></progress>
<div id="question"><div class="answer-line"><span id="feedback" role="status" aria-live="polite">Loading notation…</span></div><p id="signature-prompt" hidden></p><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div><div id="named-note" hidden><span id="target-name"></span><p id="target-string"></p></div><p id="string-prompt" hidden></p><div id="fretboard" hidden></div>
<p id="piano-midi-required" class="piano-midi-required" role="status" hidden></p><div id="piano" hidden></div>

<div class="keyboard" aria-label="Answer keyboard"><div class="modifiers" role="group" aria-label="Accidental"><button data-mod="-1" aria-label="Flat" aria-pressed="false">♭</button><button data-mod="0" aria-label="Natural" aria-pressed="true">♮</button><button data-mod="1" aria-label="Sharp" aria-pressed="false">♯</button></div><div class="letters" role="group" aria-label="Note letter">${"CDEFGAB"
    .split("")
    .map((l) => `<button data-letter="${l}">${l}</button>`)
    .join("")}</div></div>

<p class="hint" id="name-hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p><p class="hint location-hint" hidden>Choose a fret on the highlighted string.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p></div>
<div class="sequence-transport flashcard-transport"><button id="feedback-next" hidden>Next question →</button><button id="restart-round" type="button">Start again</button></div><div id="summary" hidden><p class="eyebrow">SESSION COMPLETE</p><h2>A little sharper.</h2><p id="result"></p><button id="continue" class="primary">Keep going <span aria-hidden="true">→</span></button><p class="summary-note" id="suggestion"></p></div></section>
`;
  mountPracticeOptions(element.querySelector<HTMLElement>(".below")!, [
    element.querySelector<HTMLElement>(".flashcard-options")!,
  ]);
}
