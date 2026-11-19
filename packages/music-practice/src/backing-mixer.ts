import {
  backingGenre,
  backingGenres,
  type BackingGenreId,
  type GenreDefinition,
} from "./backing-genres";
import type { BackingEvent, BackingPart } from "./backing-track-model";

export const backingMixerChannels = [
  "drums",
  "percussion",
  "bass",
  "guitar",
  "keys",
  "organ",
] as const;
export type BackingMixerChannel = (typeof backingMixerChannels)[number];
export type BackingMixerLevels = Record<BackingMixerChannel, number>;

/** Percentages of the arranged genre balance; master volume stays independent. */
export function backingMixerLevels(input?: unknown): BackingMixerLevels {
  const saved = (input as { levels?: Partial<BackingMixerLevels> } | undefined)
    ?.levels;
  return Object.fromEntries(
    backingMixerChannels.map((channel) => {
      const value = saved?.[channel];
      return [
        channel,
        typeof value === "number" && Number.isFinite(value)
          ? Math.max(0, Math.min(200, Math.round(value)))
          : 100,
      ];
    }),
  ) as BackingMixerLevels;
}

export const backingMixerKey = (style: BackingGenreId) =>
  `backing-mixer:${style}`;

export const isBackingMixerKey = (key: string) =>
  backingGenres.some(({ id }) => backingMixerKey(id) === key);

export function backingMixerChannel(
  event: Pick<BackingEvent, "part" | "instrument">,
): BackingMixerChannel {
  return event.instrument === "tonewheel-organ" ? "organ" : event.part;
}

export function backingMixerControls(style: BackingGenreId) {
  const instruments: GenreDefinition["instrumentation"] =
    backingGenre(style).instrumentation;
  const channels: { id: BackingMixerChannel; label: string }[] = [
    {
      id: "drums",
      label: instruments.drums === "recorded-brushes" ? "Brush drums" : "Drums",
    },
  ];
  if (instruments.drums !== "recorded-brushes")
    channels.push({ id: "percussion", label: "Percussion" });
  channels.push({ id: "bass", label: "Bass" });
  if (instruments.guitar !== "none")
    channels.push({ id: "guitar", label: "Guitar" });
  if (instruments.keys === "electric-piano")
    channels.push({ id: "keys", label: "Electric piano" });
  if (instruments.keys === "piano-and-organ")
    channels.push({ id: "keys", label: "Piano" });
  if (
    instruments.keys === "piano-and-organ" ||
    instruments.keys === "organ-bubble"
  )
    channels.push({ id: "organ", label: "Hammond organ" });
  return channels;
}

/** Faders follow instrument effects, ahead of both dry and room paths. */
export class BackingMixer {
  private inputs = new Map<BackingMixerChannel, GainNode>();
  constructor(
    readonly context: BaseAudioContext,
    readonly buses: Map<BackingPart, GainNode>,
    private levels: BackingMixerLevels,
  ) {}
  input(event: Pick<BackingEvent, "part" | "instrument">) {
    const channel = backingMixerChannel(event);
    let gain = this.inputs.get(channel);
    if (!gain) {
      gain = this.context.createGain();
      gain.gain.value = this.levels[channel] / 100;
      gain.connect(this.buses.get(event.part)!);
      this.inputs.set(channel, gain);
    }
    return gain;
  }
  setLevels(levels: BackingMixerLevels) {
    this.levels = levels;
    for (const [channel, input] of this.inputs)
      input.gain.setTargetAtTime(
        levels[channel] / 100,
        this.context.currentTime,
        0.015,
      );
  }
  dispose() {
    for (const input of this.inputs.values()) input.disconnect();
    this.inputs.clear();
  }
}
