export type ChordPreviewTone = { pitch: number; string?: number };
/** Preserve the displayed voicing, including doubled guitar tones and its capo. */
export function guitarChordTones(
  shape: readonly (number | null)[],
  capo = 0,
): ChordPreviewTone[] {
  return shape.flatMap((fret, string) =>
    fret === null
      ? []
      : [{ pitch: [40, 45, 50, 55, 59, 64][string] + fret + capo, string }],
  );
}
export function chordPreviewSequence(
  tones: readonly ChordPreviewTone[],
  instrument: "piano" | "guitar",
) {
  const release = instrument === "piano" ? 0.12 : 0.045;
  const ordered = [...tones].sort((a, b) => a.pitch - b.pitch);
  return [
    ...ordered.map((tone) => ({
      ...tone,
      start: 0,
      duration: 1 - release,
      volume: 0.7,
    })),
    ...ordered.map((tone, index) => ({
      ...tone,
      start: 1 + index * 0.5,
      duration: 0.5 - release,
      volume: 0.7,
    })),
  ];
}

/** Match average preview energy while preserving headroom for recorded transients. */
export function chordPreviewGain(rms: number, peak: number) {
  if (!Number.isFinite(rms) || !Number.isFinite(peak) || rms < 0 || peak < 0)
    throw Error("Invalid preview PCM level");
  return rms > 0 && peak > 0 ? Math.min(0.04 / rms, 0.45 / peak) : 1;
}
