import { createElement, type ComponentProps } from "react";
import { FlashcardOptions } from "./flashcard-options";
import { registerPracticeOptions } from "./practice-options";
/** The shell owns navigation; the session owner retains suspended rounds. */
export function mountFlashcardView(
  element: HTMLElement,
  roundLength: number,
  options: ComponentProps<typeof FlashcardOptions>,
) {
  element.innerHTML = `<section class="practice-surface practice" aria-label="Note recognition practice"><div class="presentation-header"></div><div class="presentation-progress"></div>
<div id="question"><div class="presentation-feedback"></div><p id="signature-prompt" hidden></p><div id="notation" role="img" aria-label="Guitar treble clef with octave-down 8; identify the note"></div><div id="named-note" hidden><span id="target-name"></span><p id="target-string"></p></div><p id="string-prompt" hidden></p><div id="fretboard" hidden></div>
<p id="piano-midi-required" class="piano-midi-required" role="status" hidden></p><div id="piano" hidden></div>

<div class="keyboard" aria-label="Answer keyboard"></div>
<p class="hint" id="name-hint"><span class="desktop-hint">Press A–G to answer. First press + for sharp; − for flat; 0 to return to natural</span><span class="mobile-hint">Choose ♯ or ♭ first, then tap the letter.</span></p><p class="hint location-hint" hidden>Choose a fret on the highlighted string.<span class="desktop-hint"> Use ← / → to move, Enter to answer.</span></p></div>
<div class="sequence-transport flashcard-transport"></div><div class="presentation-summary"></div></section>
`;
  registerPracticeOptions(
    element.id,
    createElement(FlashcardOptions, {
      ...options,
    }),
  );
}
