export type Profile = 'stereo' | 'sum' | 'left' | 'right';
export interface Variant {
  name: string;
  url: string;
  sampleRate: number;
  channels: number;
  bits: number;
  frames: number;
  bytes: number;
  sha256: string;
  rms: number;
  peak: number;
}
export interface Clip {
  midi: number;
  label: string;
  layer: number;
  variants: Record<Profile, Variant>;
}
export interface Manifest {
  recipe: number;
  clips: Clip[];
}

export function comparisonGains(clip: Clip, match: boolean): Record<Profile, number> {
  const entries = Object.entries(clip.variants) as [Profile, Variant][];
  const relative = Object.fromEntries(
    entries.map(([key, v]) => [key, match ? clip.variants.stereo.rms / v.rms : 1])
  ) as Record<Profile, number>;
  const headroom = Math.min(
    1,
    0.8 / Math.max(...entries.map(([key, v]) => v.peak * relative[key]))
  );
  return Object.fromEntries(entries.map(([key]) => [key, relative[key] * headroom])) as Record<
    Profile,
    number
  >;
}

export class TrialPlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private cache = new Map<string, AudioBuffer>();
  private voices = new Set<{
    source: AudioBufferSourceNode;
    gain: GainNode;
    at: number;
    hold: number;
    level: number;
  }>();
  private generation = 0;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private volume = 0.5;
  constructor(private onEnded: () => void) {}

  setVolume(value: number) {
    this.volume = value;
    if (this.context && this.master) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      if (value === 0) this.master.gain.setValueAtTime(0, this.context.currentTime);
      else this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.01);
    }
  }

  stop() {
    ++this.generation;
    this.controller?.abort();
    clearTimeout(this.timer);
    const now = this.context?.currentTime ?? 0;
    for (const { source, gain, at, hold, level } of this.voices) {
      const elapsed = now - at;
      const current =
        elapsed < 0
          ? 0
          : elapsed < 0.005
            ? (level * elapsed) / 0.005
            : elapsed < hold
              ? level
              : level * Math.max(0, 1 - (elapsed - hold) / 0.3);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
      gain.gain.setTargetAtTime(0, now, 0.003);
      source.stop(now + 0.025);
    }
    this.voices.clear();
    this.onEnded();
  }

  async play(clip: Clip, profile: Profile, match: boolean, phrase: boolean) {
    this.stop();
    const generation = this.generation;
    const context = (this.context ??= new AudioContext());
    if (!this.master) {
      this.master = context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(context.destination);
    }
    // Resume in the user gesture, before fetching. Never start a superseded request.
    await context.resume();
    if (generation !== this.generation) return;
    const variant = clip.variants[profile];
    let buffer = this.cache.get(variant.url);
    if (!buffer) {
      const controller = (this.controller = new AbortController());
      const deadline = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(variant.url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`Recording unavailable (${response.status}). Try again.`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (generation !== this.generation) return;
        this.cache.set(variant.url, buffer);
        if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value!);
      } finally {
        clearTimeout(deadline);
      }
    } else {
      this.cache.delete(variant.url);
      this.cache.set(variant.url, buffer);
    }
    if (generation !== this.generation) return;
    // At most two phrase voices overlap; reserve their combined peak headroom.
    const level = comparisonGains(clip, match)[profile] * (phrase ? 0.5 : 1);
    const start = context.currentTime + 0.025;
    const offsets = phrase ? [-1, 0, 1] : [0];
    const hold = phrase ? 0.32 : 1.15;
    for (const [index, offset] of offsets.entries()) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = 2 ** (offset / 12);
      const gain = context.createGain();
      const at = start + index * 0.46;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(level, at + 0.005);
      gain.gain.setValueAtTime(level, at + hold);
      gain.gain.linearRampToValueAtTime(0, at + hold + 0.3);
      source.connect(gain);
      gain.connect(this.master);
      const voice = { source, gain, at, hold, level };
      this.voices.add(voice);
      source.onended = () => {
        this.voices.delete(voice);
        source.disconnect();
        gain.disconnect();
      };
      source.start(at);
      source.stop(at + hold + 0.31);
    }
    this.timer = setTimeout(
      () => {
        if (generation === this.generation) this.onEnded();
      },
      (0.025 + (offsets.length - 1) * 0.46 + hold + 0.31) * 1000
    );
    return { sampleRate: context.sampleRate, bytes: buffer.length * buffer.numberOfChannels * 4 };
  }

  dispose() {
    this.stop();
    void this.context?.close();
  }
}
