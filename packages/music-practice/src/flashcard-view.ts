import { FlashcardFrame } from "./practice-frame";
import { practiceHeaderHost, mountPracticeSurface } from "./practice-surfaces";
import { createElement, type ComponentProps } from "react";
import { FlashcardOptions } from "./flashcard-options";
import { registerPracticeOptions } from "./practice-options";
/** The shell owns navigation; the session owner retains suspended rounds. */
export function mountFlashcardView(
  element: HTMLElement,
  options: ComponentProps<typeof FlashcardOptions>,
  frame: Omit<ComponentProps<typeof FlashcardFrame>, "headerHost">,
) {
  mountPracticeSurface(
    element,
    createElement(FlashcardFrame, {
      ...frame,
      headerHost: practiceHeaderHost(element),
    }),
  );
  registerPracticeOptions(
    element,
    createElement(FlashcardOptions, {
      ...options,
    }),
  );
}
