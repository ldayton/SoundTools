import { createViewState } from "./view-state";
import { persistence } from "./persistence";
import {
  backingPack,
  backingRate,
  backingSettings,
  type BackingEvent,
  type BackingPart,
  type BackingSample,
  type BackingStyle,
} from "./backing-track-model";

const files = import.meta.glob<string>("./assets/backing-v1/*.flac", {
  eager: true,
  query: "?url",
  import: "default",
});
const urls = new Map(
  Object.entries(files).map(([file, url]) => [file.split("/").pop()!, url]),
);
type Snapshot = {
  style: BackingStyle;
  tempo: number;
  tonic: number;
  keyLabel: string;
  status: "ready" | "loading" | "playing" | "paused" | "error";
  beat: number;
  error: string;
};
type Voice = { source: AudioBufferSourceNode; gain: GainNode; start: number };

/** One reusable player owned by an exercise, never by the responsive panel. */
export class BackingTrackPlayer {
  readonly model = createViewState<Snapshot>({
    ...backingSettings(persistence.read("backing-track")),
    tonic: 9,
    keyLabel: "A",
    status: "ready",
    beat: -1,
    error: "",
  });
  private context?: AudioContext;
  private output?: GainNode;
  private buses = new Map<BackingPart, GainNode>();
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private counter = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private epoch = 0;
  private disposed = false;
  private anchor = 0;
  private position = 0;
  private cycle = 0;
  private index = 0;
  private lastBeat = -1;
  private hidden = () => {
    if (document.hidden) this.pause();
  };
  private departing = () => this.pause();

  constructor() {
    document.addEventListener("visibilitychange", this.hidden);
    window.addEventListener("pagehide", this.departing);
  }
  private patch(patch: Partial<Snapshot>) {
    this.model.set({ ...this.model.getSnapshot(), ...patch });
  }
  private remember() {
    const { style, tempo } = this.model.getSnapshot();
    persistence.write("backing-track", { version: 1, style, tempo });
  }
  setKey(tonic: number, keyLabel: string) {
    const previous = this.model.getSnapshot();
    if (previous.tonic === tonic && previous.keyLabel === keyLabel) return;
    const beat = this.currentPosition();
    this.patch({ tonic, keyLabel });
    if (previous.status === "playing") this.reschedule(beat);
  }
  setStyle(style: BackingStyle) {
    if (style !== "blues" && style !== "rock") return;
    if (style === this.model.getSnapshot().style) return;
    const playing = this.model.getSnapshot().status === "playing";
    this.patch({ style });
    this.remember();
    this.position = 0;
    if (playing) this.reschedule(0);
  }
  setTempo(tempo: number) {
    if (!Number.isFinite(tempo)) return;
    const value = Math.max(50, Math.min(180, Math.round(tempo)));
    const previous = this.model.getSnapshot();
    if (value === previous.tempo) return;
    const beat = this.currentPosition();
    this.patch({ tempo: value });
    this.remember();
    if (previous.status === "playing") this.reschedule(beat);
  }
  private audio() {
    if (!this.context || this.context.state === "closed") {
      const context = (this.context = new AudioContext({
        latencyHint: "interactive",
      }));
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.output = context.createGain();
      this.output.gain.value = 3;
      this.output.connect(limiter).connect(context.destination);
      for (const part of ["drums", "percussion", "bass", "guitar"] as const) {
        const bus = context.createGain();
        bus.gain.value = backingPack.levels[part];
        const comp = context.createDynamicsCompressor();
        comp.threshold.value = part === "bass" ? -26 : -22;
        comp.knee.value = 8;
        comp.ratio.value = part === "bass" ? 2 : 1.5;
        comp.attack.value = 0.014;
        comp.release.value = 0.12;
        bus.connect(comp).connect(this.output);
        this.buses.set(part, bus);
      }
    }
    return this.context;
  }
  async play() {
    const state = this.model.getSnapshot();
    if (
      this.disposed ||
      document.hidden ||
      state.status === "playing" ||
      state.status === "loading"
    )
      return;
    const token = ++this.epoch;
    this.patch({ status: "loading", error: "" });
    try {
      // Resume synchronously with the click, before asynchronous sample loading (iOS).
      const context = this.audio();
      await context.resume();
      const queue = Object.keys(backingPack.samples).filter(
        (id) => !this.buffers.has(id),
      );
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (queue.length && token === this.epoch && !this.disposed) {
            const id = queue.shift()!;
            const sample = backingPack.samples[id];
            const url = urls.get(sample.file);
            if (!url) throw Error("Missing backing sample");
            const response = await fetch(url, {
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok)
              throw Error(`Backing sample request failed (${response.status})`);
            const buffer = await context.decodeAudioData(
              await response.arrayBuffer(),
            );
            if (!this.disposed) this.buffers.set(id, buffer);
          }
        }),
      );
      if (token !== this.epoch || this.disposed || document.hidden) return;
      this.patch({ status: "playing" });
      this.reschedule(this.position);
      this.timer = setInterval(() => this.schedule(), 25);
    } catch {
      if (token !== this.epoch || this.disposed) return;
      this.pause();
      this.patch({
        status: "error",
        error:
          "Couldn’t load the backing track. Check your connection and try again.",
      });
    }
  }
  pause() {
    const state = this.model.getSnapshot();
    if (state.status === "playing") this.position = this.currentPosition();
    const token = ++this.epoch;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopVoices();
    if (state.status === "loading" || state.status === "playing")
      this.patch({ status: "paused", beat: -1 });
    setTimeout(() => {
      if (token === this.epoch && !this.disposed)
        void this.context?.suspend().catch(() => {});
    }, 60);
  }
  dispose() {
    this.pause();
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.hidden);
    window.removeEventListener("pagehide", this.departing);
    this.buffers.clear();
    void this.context?.close().catch(() => {});
  }
  private currentPosition() {
    if (!this.context || this.model.getSnapshot().status !== "playing")
      return this.position;
    return Math.max(
      0,
      ((this.context.currentTime - this.anchor) *
        this.model.getSnapshot().tempo) /
        60,
    );
  }
  private stopVoices() {
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.008);
      try {
        voice.source.stop(now + 0.04);
      } catch {
        /* Already ended. */
      }
    }
  }
  private reschedule(position: number) {
    const context = this.context;
    if (!context) return;
    this.stopVoices();
    const state = this.model.getSnapshot();
    const pattern = backingPack.patterns[state.style];
    this.position = position % pattern.beats;
    this.anchor =
      context.currentTime + 0.06 - (this.position * 60) / state.tempo;
    this.cycle = 0;
    this.index = pattern.events.findIndex(
      (event) => event.beat >= this.position,
    );
    if (this.index < 0) {
      this.index = 0;
      this.cycle = 1;
    }
    this.lastBeat = -1;
    this.schedule();
  }
  private choose(
    event: BackingEvent,
    release = false,
  ): [string, BackingSample] {
    const choices = Object.entries(backingPack.samples).filter(
      ([, s]) =>
        s.part === event.part && s.note === event.note && s.release === release,
    );
    const velocity = choices.reduce(
      (best, [, s]) =>
        Math.abs(s.velocity - event.velocity) < Math.abs(best - event.velocity)
          ? s.velocity
          : best,
      choices[0][1].velocity,
    );
    const layer = choices.filter(([, s]) => s.velocity === velocity);
    const key = `${event.part}-${event.note}-${release}`;
    const index = this.counter.get(key) ?? 0;
    this.counter.set(key, index + 1);
    return layer[index % layer.length];
  }
  private sound(event: BackingEvent, when: number, release = false) {
    const context = this.context!;
    const [id, sample] = this.choose(event, release);
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const state = this.model.getSnapshot();
    const pitched = event.part === "bass" || event.part === "guitar";
    const source = context.createBufferSource();
    source.buffer = buffer;
    const rate = backingRate(event.part, state.tonic);
    source.playbackRate.value = rate;
    const gain = context.createGain();
    const strength = release
      ? 1
      : Math.min(1.25, event.velocity / sample.velocity) ** 0.8;
    gain.gain.value = 0;
    source.connect(gain).connect(this.buses.get(event.part)!);
    const available = buffer.duration / rate;
    const duration =
      pitched && !release
        ? Math.min(available, (event.duration * 60) / state.tempo)
        : available;
    const level = sample.gain * strength;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.002);
    gain.gain.setValueAtTime(level, when + Math.max(0.003, duration - 0.003));
    gain.gain.linearRampToValueAtTime(
      0,
      when + duration + (pitched && !release ? 0.08 : 0.005),
    );
    const voice = { source, gain, start: when };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when);
    source.stop(when + duration + 0.1);
    if (pitched && !release) this.sound(event, when + duration, true);
  }
  private schedule() {
    const context = this.context;
    const state = this.model.getSnapshot();
    if (!context || state.status !== "playing") return;
    const pattern = backingPack.patterns[state.style];
    const now = context.currentTime;
    // Background throttling must not enqueue an entire missed phrase on return.
    const earliest =
      this.anchor +
      ((this.cycle * pattern.beats + pattern.events[this.index].beat) * 60) /
        state.tempo;
    if (earliest < now - 0.25) {
      this.reschedule(this.currentPosition() % pattern.beats);
      return;
    }
    for (;;) {
      const event = pattern.events[this.index];
      const when =
        this.anchor +
        ((this.cycle * pattern.beats + event.beat) * 60) / state.tempo;
      if (when > now + 0.15) break;
      if (when >= now) this.sound(event, when);
      if (++this.index === pattern.events.length) {
        this.index = 0;
        ++this.cycle;
      }
    }
    const beat = Math.floor(this.currentPosition()) % 4;
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.patch({ beat });
    }
  }
}
