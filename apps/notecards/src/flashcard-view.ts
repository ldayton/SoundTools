import { createElement, type ComponentProps } from "react";
import { FlashcardOptions } from "./flashcard-options";
import { mountPracticeOptions } from "./practice-controls";
/** The shell owns navigation; the session owner retains suspended rounds. */
export function mountFlashcardView(
  element: HTMLElement,
  roundLength: number,
  options: Omit<ComponentProps<typeof FlashcardOptions>, "ranges">,
) {
  element.innerHTML = `<div class="below"><div hidden><div class="flashcard-range-controls"><div class="range" id="pitch-range" role="group" aria-label="Sounding guitar pitch range">${(["low", "high"] as const).map((f) => `<div><label for="staff-${f}-spin">${f === "low" ? "Lowest" : "Highest"}</label><div class="note-field"><input id="staff-${f}-spin" aria-label="${f === "low" ? "Lowest" : "Highest"} note" readonly /><button id="staff-${f}-choose" type="button" aria-label="Choose ${f === "low" ? "lowest" : "highest"} note">⌄</button></div></div>`).join("")}</div>
<div class="range" id="piano-range" role="group" aria-label="Piano pitch range" hidden>${(["low", "high"] as const).map((f) => `<div><label for="${f}-spin">${f === "low" ? "Lowest" : "Highest"}</label><div class="note-field"><input id="${f}-spin" aria-label="${f === "low" ? "Lowest" : "Highest"} note" readonly /><button id="${f}-choose" type="button" aria-label="Choose ${f === "low" ? "lowest" : "highest"} note">⌄</button></div></div>`).join("")}</div>
<p id="piano-range-notice" class="piano-range-notice" hidden></p>
</div></div></div><section class="practice" aria-label="Note recognition practice"><div class="card-top"><span id="context"></span><span id="counter"></span></div><progress id="progress" max="${roundLength}" value="0" aria-label="Session progress"></progress>
<div id="question"><div class="answer-line"><span id="feedback" role="status" aria-live="polite">Loading notation…</span></div><p id="signature-prompt" hidden></p><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div><div id="named-note" hidden><span id="target-name"></span><p id="target-string"></p></div><p id="string-prompt" hidden></p><div id="fretboard" hidden></div>
<p id="piano-midi-required" class="piano-midi-required" role="status" hidden></p><div id="piano" hidden></div>

<div class="keyboard" aria-label="Answer keyboard"><div class="modifiers" role="group" aria-label="Accidental"><button data-mod="-1" aria-label="Flat" aria-pressed="false">♭</button><button data-mod="0" aria-label="Natural" aria-pressed="true">♮</button><button data-mod="1" aria-label="Sharp" aria-pressed="false">♯</button></div><div class="letters" role="group" aria-label="Note letter">${"CDEFGAB"
    .split("")
    .map((l) => `<button data-letter="${l}">${l}</button>`)
    .join("")}</div></div>

<p class="hint" id="name-hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p><p class="hint location-hint" hidden>Choose a fret on the highlighted string.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p></div>
<div class="sequence-transport flashcard-transport"><button id="feedback-next" hidden>Next question →</button><button id="restart-round" type="button">Start again</button></div><div id="summary" hidden><p class="eyebrow">SESSION COMPLETE</p><h2>A little sharper.</h2><p id="result"></p><button id="continue" class="primary">Keep going <span aria-hidden="true">→</span></button><p class="summary-note" id="suggestion"></p></div></section>
`;
  mountPracticeOptions(
    element.querySelector<HTMLElement>(".below")!,
    [],
    createElement(FlashcardOptions, {
      ...options,
      ranges: element.querySelector<HTMLElement>(".flashcard-range-controls")!,
    }),
  );
}
