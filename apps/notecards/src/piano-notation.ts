import type { Card } from "./model";
import type { Profile } from "./guitar";
import { pitch } from "./piano-model";
export type PianoNotation = {
  layout: "treble" | "bass" | "grand";
  clef: "treble" | "bass";
  written: Card;
  octaveShift: -12 | 0 | 12;
};
/** The card remains the sounding pitch and review identity; this is display only. */
export function pianoNotation(
  card: Card,
  profile: Profile,
  random = Math.random,
): PianoNotation {
  const layout = profile.staffLayout || "grand";
  const sounding = pitch(card);
  let clef: "treble" | "bass" =
    layout === "grand" ? (sounding >= 60 ? "treble" : "bass") : layout;
  // B3–D4: either clef is legible near middle C. Alternate only occasionally.
  if (
    layout === "grand" &&
    profile.overlapPractice === "both" &&
    sounding >= 59 &&
    sounding <= 62 &&
    random() < 0.3
  )
    clef = clef === "treble" ? "bass" : "treble";
  let octaveShift: -12 | 0 | 12 = 0;
  // Mix ordinary notation and octave signs, only where the shift reduces ledger lines.
  if (
    profile.octavePractice === "practice" &&
    (sounding >= 84 || sounding <= 47) &&
    random() < 0.5
  )
    octaveShift = sounding >= 84 ? 12 : -12;
  return {
    layout,
    clef,
    written: { ...card, octave: card.octave - octaveShift / 12 },
    octaveShift,
  };
}
