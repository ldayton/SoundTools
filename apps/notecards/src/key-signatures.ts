import {
  KEYS,
  deck,
  name,
  type Card,
  type Letter,
  type Modifier,
} from "./model";
export type Tonality = "major" | "minor";
export type SignaturePractice = Tonality | "both";
export type SignatureCard = Card & { signature: string; tonality: Tonality };
export function signatureDeck(
  practice: SignaturePractice = "major",
  maxAccidentals = 7,
  accidentals: "both" | "sharps" | "flats" = "both",
): SignatureCard[] {
  return KEYS.filter(
    (key) =>
      Math.abs(key.count) <= maxAccidentals &&
      (accidentals === "both" ||
        (accidentals === "sharps" ? key.count >= 0 : key.count <= 0)),
  ).flatMap((key) => {
    // The sixth degree of a major scale is its relative minor, with the same signature.
    const scale = deck({ low: "C3", high: "B3", key: key.id });
    const tonic = "CDEFGAB".indexOf(key.id[0]);
    const major = scale[tonic],
      minor = scale[(tonic + 5) % 7];
    return (["major", "minor"] as const)
      .filter((t) => practice === "both" || t === practice)
      .map((tonality) => ({
        ...(tonality === "major" ? major : minor),
        id: `${tonality}:${key.id}`,
        signature: key.id,
        tonality,
      }));
  });
}
export function matchesSignature(
  card: SignatureCard,
  letter: Letter,
  modifier: Modifier,
) {
  // An enharmonic tonic belongs to a different written signature.
  return card.letter === letter && card.modifier === modifier;
}
export const signatureAnswer = (card: SignatureCard) =>
  `${name(card)} ${card.tonality}`;
