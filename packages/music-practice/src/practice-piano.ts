import { persistence } from "./persistence";
import {
  pianoPresentation,
  onPianoPresentationChange,
  setPianoPresentation,
} from "./piano-presentation";
/** One keyboard visibility preference across every piano exercise. */
export function restorePianoVisibility() {
  const saved = persistence.read<{ version: 1; pianoVisible?: boolean }>(
    "presentation",
  );
  setPianoPresentation(saved?.pianoVisible !== false);
}
export function isPianoVisible() {
  return pianoPresentation.getSnapshot().visible;
}
export function mountPracticePiano(
  keyboard: HTMLElement,
  transport: HTMLElement,
  options: {
    changed?: () => void;
  } = {},
) {
  const panel = document.createElement("div");
  panel.className = "practice-piano";
  panel.id = `${keyboard.closest<HTMLElement>(".live-workspace,#flashcards")!.id}-piano-panel`;
  panel.append(keyboard);
  transport.after(panel);
  let available = true;
  function render() {
    panel.hidden = !available || !isPianoVisible();
    options.changed?.();
  }
  onPianoPresentationChange(render);
  function publish() {
    const state = pianoPresentation.getSnapshot();
    pianoPresentation.set({
      ...state,
      available: { ...state.available, [panel.id]: available },
    });
    render();
  }
  publish();
  return {
    id: panel.id,
    setAvailable(value: boolean) {
      available = value;
      publish();
    },
  };
}
