import { createViewState } from "./view-state";
import { metronomeSettings, metronomeFrequency } from "./metronome-model";
import { persistence } from "./persistence";
import {
  backingPack,
  backingRate,
  backingSettings,
  type BackingEvent,
  type BackingPart,
  type BackingSample,
  type BackingStyle,
  type BackingMode,
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
  mode: BackingMode;
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
  readonly metronome = createViewState({
    ...metronomeSettings(persistence.read("metronome")),
    enabled: false,
    beat: -1,
    error: "",
  });
  private metroAnchor = 0;
  private metroIndex = 0;
  private metroEpoch = 0;
  private metroVoices = new Set<{ source: OscillatorNode; gain: GainNode }>();
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
    if (document.hidden) this.pauseAll();
  };
  private departing = () => this.pauseAll();

  constructor() {
    document.addEventListener("visibilitychange", this.hidden);
    window.addEventListener("pagehide", this.departing);
  }
  private patch(patch: Partial<Snapshot>) {
    this.model.set({ ...this.model.getSnapshot(), ...patch });
  }
  private remember() {
    const { style, mode, tempo } = this.model.getSnapshot();
    persistence.write("backing-track", { version: 1, style, mode, tempo });
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
  setMode(mode: BackingMode) {
    if (mode !== "steady" && mode !== "active") return;
    if (mode === this.model.getSnapshot().mode) return;
    const beat = this.currentPosition();
    this.patch({ mode });
    this.remember();
    if (this.model.getSnapshot().status === "playing") this.reschedule(beat);
  }
  setMetronomeTempo(tempo: number) {
    if (
      !Number.isFinite(tempo) ||
      this.model.getSnapshot().status === "playing"
    )
      return;
    const value = Math.max(50, Math.min(180, Math.round(tempo)));
    const beat = this.metroPosition();
    this.metronome.set({ ...this.metronome.getSnapshot(), tempo: value });
    this.rememberMetronome();
    if (this.metronome.getSnapshot().enabled && this.context) {
      this.metroAnchor = this.context.currentTime - (beat * 60) / value;
      this.resetClicks(beat);
    }
  }
  private rememberMetronome() {
    const { tempo, downbeat, numerator, denominator } =
      this.metronome.getSnapshot();
    persistence.write("metronome", {
      version: 1,
      tempo,
      downbeat,
      numerator,
      denominator,
    });
  }
  setMetronomeDownbeat(downbeat: boolean) {
    this.metronome.set({ ...this.metronome.getSnapshot(), downbeat });
    this.rememberMetronome();
    if (this.metronome.getSnapshot().enabled)
      this.resetClicks(this.metroPosition());
  }
  setMetronomeSignature(numerator: number, denominator: number) {
    const state = this.metronome.getSnapshot();
    if (!state.downbeat || this.model.getSnapshot().status === "playing")
      return;
    const next = metronomeSettings({ ...state, numerator, denominator });
    this.metronome.set({ ...state, ...next });
    this.rememberMetronome();
    if (state.enabled) this.resetClicks(this.metroPosition());
  }
  async startMetronome() {
    if (
      this.disposed ||
      document.hidden ||
      this.metronome.getSnapshot().enabled
    )
      return;
    const token = ++this.metroEpoch;
    this.metronome.set({
      ...this.metronome.getSnapshot(),
      enabled: true,
      error: "",
    });
    try {
      const context = this.audio();
      await context.resume();
      if (token !== this.metroEpoch || this.disposed) return;
      this.metroAnchor = context.currentTime + 0.06;
      this.resetClicks(
        this.model.getSnapshot().status === "playing"
          ? this.currentPosition()
          : 0,
      );
      this.startTimer();
    } catch {
      if (token !== this.metroEpoch || this.disposed) return;
      this.stopMetronome();
      this.metronome.set({
        ...this.metronome.getSnapshot(),
        error: "Couldn’t start the metronome. Try again.",
      });
    }
  }
  stopMetronome() {
    ++this.metroEpoch;
    this.metronome.set({
      ...this.metronome.getSnapshot(),
      enabled: false,
      beat: -1,
    });
    this.stopClicks();
    this.idle();
  }
  pauseAll() {
    this.stopMetronome();
    this.pause();
  }
  private startTimer() {
    if (!this.timer)
      this.timer = setInterval(() => {
        this.schedule();
        this.scheduleClicks();
      }, 25);
    this.scheduleClicks();
  }
  private idle() {
    if (
      this.model.getSnapshot().status === "playing" ||
      this.metronome.getSnapshot().enabled
    )
      return;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    // Suspend only after click/note release, and recheck both transports.
    setTimeout(() => {
      if (
        !this.disposed &&
        this.model.getSnapshot().status !== "playing" &&
        this.model.getSnapshot().status !== "loading" &&
        !this.metronome.getSnapshot().enabled
      )
        void this.context?.suspend().catch(() => {});
    }, 60);
  }
  private metroPosition() {
    if (!this.context) return 0;
    if (this.model.getSnapshot().status === "playing")
      return this.currentPosition();
    return Math.max(
      0,
      ((this.context.currentTime - this.metroAnchor) *
        this.metronome.getSnapshot().tempo) /
        60,
    );
  }
  private stopClicks() {
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.metroVoices) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.003);
      try {
        voice.source.stop(now + 0.015);
      } catch {
        /* ended */
      }
    }
    this.metroVoices.clear();
  }
  private resetClicks(position: number) {
    this.stopClicks();
    this.metroIndex = Math.ceil(position - 0.000001);
    this.scheduleClicks();
  }
  private scheduleClicks() {
    const context = this.context,
      metro = this.metronome.getSnapshot(),
      backing = this.model.getSnapshot();
    if (!context || !metro.enabled) return;
    const linked = backing.status === "playing";
    const tempo = linked ? backing.tempo : metro.tempo;
    const anchor = linked ? this.anchor : this.metroAnchor;
    const now = context.currentTime;
    if (anchor + (this.metroIndex * 60) / tempo < now - 0.1)
      this.metroIndex = Math.ceil(((now - anchor) * tempo) / 60);
    while (anchor + (this.metroIndex * 60) / tempo <= now + 0.15) {
      const when = anchor + (this.metroIndex * 60) / tempo;
      if (when >= now) {
        const source = context.createOscillator(),
          gain = context.createGain();
        source.frequency.value = metronomeFrequency(
          this.metroIndex,
          metro.downbeat,
          metro.numerator,
          linked,
        );
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(0.13, when + 0.001);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
        source.connect(gain).connect(context.destination);
        const voice = { source, gain };
        this.metroVoices.add(voice);
        source.onended = () => {
          this.metroVoices.delete(voice);
          source.disconnect();
          gain.disconnect();
        };
        source.start(when);
        source.stop(when + 0.05);
      }
      ++this.metroIndex;
    }
    const beat = now < anchor ? -1 : Math.floor(this.metroPosition());
    if (metro.beat !== beat) this.metronome.set({ ...metro, beat });
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
      // Join the next independent click when one is already running, so starting
      // the band does not produce two clicks a few milliseconds apart.
      const metro = this.metronome.getSnapshot();
      const joinAt = metro.enabled
        ? this.metroAnchor +
          (Math.ceil(
            ((context.currentTime + 0.06 - this.metroAnchor) * metro.tempo) /
              60,
          ) *
            60) /
            metro.tempo
        : context.currentTime + 0.06;
      this.patch({ status: "playing" });
      this.reschedule(this.position, joinAt);
      this.startTimer();
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
    ++this.epoch;
    this.stopVoices();
    if (state.status === "loading" || state.status === "playing")
      this.patch({ status: "paused", beat: -1 });
    if (
      state.status === "playing" &&
      this.context &&
      this.metronome.getSnapshot().enabled
    ) {
      this.metroAnchor =
        this.context.currentTime -
        (this.position * 60) / this.metronome.getSnapshot().tempo;
      this.resetClicks(this.position);
    }
    this.idle();
  }

  dispose() {
    this.pauseAll();
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
  private reschedule(position: number, startAt?: number) {
    const context = this.context;
    if (!context) return;
    this.stopVoices();
    const state = this.model.getSnapshot();
    const pattern = backingPack.patterns[state.style][state.mode];
    this.position = position % pattern.beats;
    this.anchor =
      (startAt ?? context.currentTime) - (this.position * 60) / state.tempo;
    this.cycle = 0;
    this.index = pattern.events.findIndex(
      (event) => event.beat >= this.position,
    );
    if (this.index < 0) {
      this.index = 0;
      this.cycle = 1;
    }
    this.lastBeat = -1;
    this.resetClicks(this.position);
    // Restore held strings after tempo/key edits or pause, rather than leaving
    // a silent hole until the next widely spaced chord.
    const when = startAt ?? context.currentTime;
    for (const event of pattern.events) {
      if (
        (event.part === "bass" || event.part === "guitar") &&
        event.beat < this.position &&
        event.beat + event.duration > this.position
      )
        this.sound(event, when, false, this.position - event.beat);
    }
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
  private sound(
    event: BackingEvent,
    when: number,
    release = false,
    offsetBeats = 0,
  ) {
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
    const offset = (offsetBeats * 60) / state.tempo;
    const available = buffer.duration / rate - offset;
    if (available <= 0.003) return;
    const duration =
      pitched && !release
        ? Math.min(
            available,
            ((event.duration - offsetBeats) * 60) / state.tempo,
          )
        : available;
    const level = sample.gain * strength * (event.level ?? 1);
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
    source.start(when, offset * rate);
    source.stop(when + duration + 0.1);
    if (pitched && !release) this.sound(event, when + duration, true);
  }
  private schedule() {
    const context = this.context;
    const state = this.model.getSnapshot();
    if (!context || state.status !== "playing") return;
    const pattern = backingPack.patterns[state.style][state.mode];
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
    const beat =
      now < this.anchor ? -1 : Math.floor(this.currentPosition()) % 4;
    if (beat !== this.lastBeat) {
      this.lastBeat = beat;
      this.patch({ beat });
    }
  }
}
