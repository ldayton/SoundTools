/** Physical staff-line spacing shared by the two notation engines. */
export const STAFF_LINE_GAP = 10;
/** Distance between the first and fifth staff lines, in CSS pixels at scale 1. */
export const STAFF_HEIGHT = 4 * STAFF_LINE_GAP;
export const ABC_STAFF_LINE_GAP = 7.75;
export const VEXFLOW_STAFF_LINE_GAP = 22; // Ten engraving units, inside our 2.2x SVG group.
export const FLASHCARD_NOTATION_WIDTH =
  (600 * STAFF_LINE_GAP) / VEXFLOW_STAFF_LINE_GAP;
