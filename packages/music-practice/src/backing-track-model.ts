import manifest from "./assets/backing-v1/manifest.json";

export type BackingStyle = "blues" | "rock";
export type BackingPart = "drums" | "percussion" | "bass" | "guitar";
export type BackingEvent = {
  part: BackingPart;
  beat: number;
  note: number;
  duration: number;
  velocity: number;
};
export type BackingSample = {
  file: string;
  part: BackingPart;
  note: number;
  velocity: number;
  rr: number;
  gain: number;
  release: boolean;
};
export const backingPack = manifest as unknown as {
  samples: Record<string, BackingSample>;
  patterns: Record<
    BackingStyle,
    {
      nativeTempo: number;
      beats: number;
      sourceKey: number;
      events: BackingEvent[];
    }
  >;
  levels: Record<BackingPart, number>;
};
export function backingSettings(input: unknown) {
  const value = input as { style?: unknown; tempo?: unknown } | undefined;
  return {
    style: (value?.style === "rock" ? "rock" : "blues") as BackingStyle,
    tempo:
      typeof value?.tempo === "number" && Number.isFinite(value.tempo)
        ? Math.max(50, Math.min(180, Math.round(value.tempo)))
        : 90,
  };
}
/** Shortest transposition from the A-centred recording; unpitched kit stays put. */
export function backingSemitones(tonic: number) {
  return ((Math.round(tonic) - 9 + 18) % 12) - 6;
}
export function backingRate(part: BackingPart, tonic: number) {
  return part === "bass" || part === "guitar"
    ? 2 ** (backingSemitones(tonic) / 12)
    : 1;
}
