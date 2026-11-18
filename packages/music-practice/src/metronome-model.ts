/** BPM counts clicks: the selected denominator note when accents are enabled. */
export function metronomeSettings(input: unknown) {
  const value = input as
    | {
        tempo?: unknown;
        downbeat?: unknown;
        numerator?: unknown;
        denominator?: unknown;
      }
    | undefined;
  return {
    tempo:
      typeof value?.tempo === "number" && Number.isFinite(value.tempo)
        ? Math.max(50, Math.min(180, Math.round(value.tempo)))
        : 90,
    downbeat: value?.downbeat === true,
    numerator:
      typeof value?.numerator === "number" && Number.isFinite(value.numerator)
        ? Math.max(1, Math.min(16, Math.round(value.numerator)))
        : 4,
    denominator: [2, 4, 8, 16].includes(Number(value?.denominator))
      ? Number(value?.denominator)
      : 4,
  };
}
export function metronomeFrequency(
  index: number,
  downbeat: boolean,
  numerator: number,
  linked: boolean,
) {
  return downbeat && index % (linked ? 4 : numerator) === 0 ? 1500 : 1000;
}
