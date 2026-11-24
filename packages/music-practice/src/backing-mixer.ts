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
  "metronome",
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
  channels.push({ id: "metronome", label: "Metronome" });
  return channels;
}

/** Faders follow instrument effects, ahead of both dry and room paths. */
export class BackingMixer {
  private inputs = new Map<
    string,
    { channel: BackingMixerChannel; gain: GainNode; baseline: number }
  >();
  constructor(
    readonly context: BaseAudioContext,
    readonly buses: Map<BackingPart, GainNode>,
    private levels: BackingMixerLevels,
    private defaultGain: (
      event: Pick<BackingEvent, "part" | "instrument">,
    ) => number = () => 1,
  ) {}
  input(event: Pick<BackingEvent, "part" | "instrument">) {
    const channel = backingMixerChannel(event);
    const key = channel + ":" + (event.instrument ?? event.part);
    let entry = this.inputs.get(key);
    if (!entry) {
      const baseline = this.defaultGain(event);
      const gain = this.context.createGain();
      gain.gain.value = (baseline * this.levels[channel]) / 100;
      gain.connect(this.buses.get(event.part)!);
      entry = { channel, gain, baseline };
      this.inputs.set(key, entry);
    }
    const baseline = this.defaultGain(event);
    if (entry.baseline !== baseline) {
      entry.baseline = baseline;
      entry.gain.gain.setTargetAtTime(
        (baseline * this.levels[channel]) / 100,
        this.context.currentTime,
        0.015,
      );
    }
    return entry.gain;
  }
  setLevels(levels: BackingMixerLevels) {
    this.levels = levels;
    for (const { channel, gain, baseline } of this.inputs.values())
      gain.gain.setTargetAtTime(
        (baseline * levels[channel]) / 100,
        this.context.currentTime,
        0.015,
      );
  }
  dispose() {
    for (const { gain } of this.inputs.values()) gain.disconnect();
    this.inputs.clear();
  }
}
