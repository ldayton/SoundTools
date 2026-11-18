import manifest from "./assets/backing-v1/manifest.json";

export type BackingStyle = "blues" | "rock";
export type BackingMode = "steady" | "active";
export type BackingPart = "drums" | "percussion" | "bass" | "guitar";
export type BackingEvent = {
  part: BackingPart;
  beat: number;
  note: number;
  duration: number;
  velocity: number;
  level: number;
  articulation?:
    | "normal"
    | "muted"
    | "ghost"
    | "hat-half"
    | "hat-loose"
    | "rimshot"
    | "offcenter";
  string?: number;
  /** Written at concert pitch, with guitar fingering validated in this key. */
  absolute?: boolean;
  guitarReleaseSeconds?: number;
  guitarReleaseScale?: number;
  guitarAttackSeconds?: number;
};
export type BackingSample = {
  file: string;
  part: BackingPart;
  note: number;
  velocity: number;
  rr: number;
  gain: number;
  release: boolean;
  velocityLow?: number;
  velocityHigh?: number;
  articulation?:
    | "normal"
    | "muted"
    | "ghost"
    | "hat-half"
    | "hat-loose"
    | "rimshot"
    | "offcenter";
};
export const backingPack = manifest as unknown as {
  samples: Record<string, BackingSample>;
  patterns: Record<
    BackingStyle,
    Record<
      BackingMode,
      {
        nativeTempo: number;
        beats: number;
        sourceKey: number;
        events: BackingEvent[];
      }
    >
  >;
  levels: Record<BackingPart, number>;
};
export function backingSettings(input: unknown) {
  const value = input as
    { style?: unknown; mode?: unknown; tempo?: unknown } | undefined;
  return {
    style: (value?.style === "rock" ? "rock" : "blues") as BackingStyle,
    mode: (value?.mode === "active" ? "active" : "steady") as BackingMode,
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

/** Native-pitch selection precedes velocity and alternate-take selection. */
export function backingSampleChoices(
  event: BackingEvent,
  tonic: number,
  release = false,
  available?: { has(id: string): boolean },
  pack = backingPack,
): [string, BackingSample][] {
  const pitched = event.part === "bass" || event.part === "guitar";
  const target =
    event.note + (pitched && !event.absolute ? backingSemitones(tonic) : 0);
  const articulation = release ? "normal" : (event.articulation ?? "normal");
  const choices = Object.entries(pack.samples).filter(
    ([id, s]) =>
      (!available || available.has(id)) &&
      s.part === event.part &&
      s.release === release &&
      (s.articulation ?? "normal") === articulation,
  );
  const distance = Math.min(
    ...choices.map(([, s]) => Math.abs(s.note - target)),
  );
  const pitches = choices.filter(
    ([, s]) => Math.abs(s.note - target) === distance,
  );
  const zoned = pitches.filter(
    ([, s]) =>
      s.velocityLow !== undefined &&
      target === s.note &&
      event.velocity >= s.velocityLow &&
      event.velocity <= s.velocityHigh!,
  );
  if (zoned.length) return zoned;
  const velocity = pitches.reduce(
    (best, [, s]) =>
      Math.abs(s.velocity - event.velocity) < Math.abs(best - event.velocity)
        ? s.velocity
        : best,
    pitches[0][1].velocity,
  );
  return pitches.filter(([, s]) => s.velocity === velocity);
}

/** A key reload can mute the band while its metronome clock keeps running. */
export function backingClockActive(state: {
  status: string;
  syncing?: boolean;
}) {
  return (
    state.status === "playing" ||
    (state.status === "loading" && state.syncing === true)
  );
}
