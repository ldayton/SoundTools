import { FlashcardFrame } from "./practice-frame";
import { mountPracticeSurface } from "./practice-surfaces";
import { createElement, type ComponentProps } from "react";
import { FlashcardOptions } from "./flashcard-options";
import { registerPracticeOptions } from "./practice-options";
/** The shell owns navigation; the session owner retains suspended rounds. */
export function mountFlashcardView(
  element: HTMLElement,
  options: ComponentProps<typeof FlashcardOptions>,
  frame: ComponentProps<typeof FlashcardFrame>,
) {
  mountPracticeSurface(element, createElement(FlashcardFrame, frame));
  registerPracticeOptions(
    element,
    createElement(FlashcardOptions, {
      ...options,
    }),
  );
}
