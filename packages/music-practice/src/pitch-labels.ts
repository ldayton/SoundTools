import { keyLabel } from "./piano-model";
export const selectableNoteLabel = (midi: number) =>
  keyLabel(midi, false).split(" / ")[0] + (Math.floor(midi / 12) - 1);
