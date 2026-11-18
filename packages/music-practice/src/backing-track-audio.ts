import {
  backingArrangement,
  scalePitchClasses,
  type BackingQuality,
} from "./backing-arrangement";
import { createViewState } from "./view-state";
import {
  backingChokes,
  backingAudioGraph,
  compactBackingBuffer,
} from "./backing-performance";
import { metronomeSettings, metronomeFrequency } from "./metronome-model";
import { persistence } from "./persistence";
import {
  backingPack,
  backingClockActive,
  backingSemitones,
  backingSampleChoices,
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
  quality: BackingQuality;
  keyLabel: string;
  syncing: boolean;
  status: "ready" | "loading" | "playing" | "paused" | "error";
  beat: number;
  error: string;
};
type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  end: number;
  part: BackingPart;
  note: number;
  string?: number;
  release: boolean;
};

/** One reusable player owned by an exercise, never by the responsive panel. */
export class BackingTrackPlayer {
  readonly model = createViewState<Snapshot>({
    ...backingSettings(persistence.read("backing-track")),
    tonic: 9,
    quality: "major",
    keyLabel: "A",
    status: "ready",
    syncing: false,
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
  private takeCache = new Map<number, ReturnType<typeof backingArrangement>>();
  private take() {
    let take = this.takeCache.get(this.cycle);
    if (!take) {
      const state = this.model.getSnapshot();
      take = backingArrangement(
        state.style,
        state.mode,
        state.quality,
        this.cycle,
      );
      this.takeCache.set(this.cycle, take);
      // Retain the current and previous take only; long practice stays bounded.
      for (const cycle of this.takeCache.keys())
        if (cycle < this.cycle - 1) this.takeCache.delete(cycle);
    }
    return take;
  }
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
  setKey(
    tonic: number,
    keyLabel: string,
    quality: BackingQuality = this.model.getSnapshot().quality,
  ) {
    const previous = this.model.getSnapshot();
    if (
      previous.tonic === tonic &&
      previous.keyLabel === keyLabel &&
      previous.quality === quality
    )
      return;
    const active =
      previous.status === "playing" || previous.status === "loading";
    if (active)
      this.pause(
        backingClockActive(previous) && this.metronome.getSnapshot().enabled,
      );
    this.patch({ tonic, keyLabel, quality });
    this.takeCache.clear();
    if (active) void this.play();
  }
  setStyle(style: BackingStyle) {
    if (style !== "blues" && style !== "rock") return;
    if (style === this.model.getSnapshot().style) return;
    const playing = this.model.getSnapshot().status === "playing";
    this.patch({ style });
    this.takeCache.clear();
    this.remember();
    this.position = 0;
    if (playing) this.reschedule(0);
  }
  setMode(mode: BackingMode) {
    if (mode !== "steady" && mode !== "active") return;
    if (mode === this.model.getSnapshot().mode) return;
    const beat = this.currentPosition();
    this.patch({ mode });
    this.takeCache.clear();
    this.remember();
    if (this.model.getSnapshot().status === "playing") this.reschedule(beat);
  }
  setMetronomeTempo(tempo: number) {
    if (!Number.isFinite(tempo) || backingClockActive(this.model.getSnapshot()))
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
    if (!state.downbeat || backingClockActive(this.model.getSnapshot())) return;
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
        backingClockActive(this.model.getSnapshot())
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
      backingClockActive(this.model.getSnapshot()) ||
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
    if (backingClockActive(this.model.getSnapshot()))
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
    const linked = backingClockActive(backing);
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
    else if (previous.syncing && this.context) {
      this.anchor = this.context.currentTime - (beat * 60) / value;
      this.resetClicks(beat);
    }
  }
  private audio() {
    if (!this.context || this.context.state === "closed") {
      const context = (this.context = new AudioContext({
        latencyHint: "interactive",
      }));
      const graph = backingAudioGraph(context, backingPack.levels);
      this.output = graph.output;
      this.buses = graph.buses;
    }
    return this.context;
  }
  async play() {
    const state = this.model.getSnapshot();
    if (
      this.disposed ||
      document.hidden ||
      state.status === "playing" ||
      (state.status === "loading" && !state.syncing)
    )
      return;
    const token = ++this.epoch;
    this.patch({ status: "loading", error: "" });
    try {
      // Resume synchronously with the click, before asynchronous sample loading (iOS).
      const context = this.audio();
      await context.resume();
      const current = this.model.getSnapshot();
      const pcs = scalePitchClasses(current.tonic, current.quality);
      const shift = backingSemitones(current.tonic);
      const needed = new Set<string>(
        Object.entries(backingPack.samples)
          .filter(([, sample]) => {
            if (sample.part === "drums" || sample.part === "percussion")
              return true;
            const bass = sample.part === "bass";
            const low = (bass ? 28 : 50) + shift,
              high = (bass ? 55 : 76) + shift;
            const boundary = bass && low < 23 && sample.note === 23;
            return (
              boundary ||
              (pcs.includes(sample.note % 12) &&
                sample.note >= low &&
                sample.note <= high)
            );
          })
          .map(([id]) => id),
      );
      // Old voices have been released before a key reload. Drop unrelated
      // buffers before decoding replacements, avoiding two complete working sets.
      for (const id of this.buffers.keys())
        if (!needed.has(id)) this.buffers.delete(id);
      const queue = [...needed].filter((id) => !this.buffers.has(id));
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (queue.length && token === this.epoch && !this.disposed) {
            const id = queue.shift()!,
              sample = backingPack.samples[id],
              url = urls.get(sample.file);
            if (!url) throw Error("Missing backing sample");
            const response = await fetch(url, {
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok)
              throw Error(`Backing sample request failed (${response.status})`);
            const decoded = await context.decodeAudioData(
              await response.arrayBuffer(),
            );
            const buffer = await compactBackingBuffer(decoded, sample.part);
            if (!this.disposed && token === this.epoch)
              this.buffers.set(id, buffer);
          }
        }),
      );
      if (token !== this.epoch || this.disposed || document.hidden) return;
      for (const id of this.buffers.keys())
        if (!needed.has(id)) this.buffers.delete(id);
      // Join the next independent click when one is already running, so starting
      // the band does not produce two clicks a few milliseconds apart.
      const metro = this.metronome.getSnapshot();
      const resumePosition = state.syncing
        ? this.currentPosition()
        : this.position;
      const joinAt = state.syncing
        ? context.currentTime
        : metro.enabled
          ? this.metroAnchor +
            (Math.ceil(
              ((context.currentTime + 0.06 - this.metroAnchor) * metro.tempo) /
                60,
            ) *
              60) /
              metro.tempo
          : context.currentTime + 0.06;
      this.patch({ status: "playing", syncing: false });
      this.reschedule(resumePosition, joinAt);
      this.startTimer();
    } catch (error) {
      if (token !== this.epoch || this.disposed) return;
      console.error("Backing track playback failed", error);
      this.pause();
      this.patch({
        status: "error",
        error:
          "Couldn’t load the backing track. Check your connection and try again.",
      });
    }
  }
  pause(keepClock = false) {
    const state = this.model.getSnapshot();
    if (backingClockActive(state)) this.position = this.currentPosition();
    ++this.epoch;
    this.stopVoices();
    if (state.status === "loading" || state.status === "playing")
      this.patch({
        status: keepClock ? "loading" : "paused",
        syncing: keepClock,
        beat: keepClock ? state.beat : -1,
      });
    if (
      backingClockActive(state) &&
      !keepClock &&
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
    if (!this.context || !backingClockActive(this.model.getSnapshot()))
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
    const beats = backingPack.patterns[state.style][state.mode].beats;
    this.cycle = Math.floor(position / beats);
    const pattern = this.take();
    this.position = position % pattern.beats;
    this.anchor =
      (startAt ?? context.currentTime) -
      ((this.cycle * pattern.beats + this.position) * 60) / state.tempo;
    this.index = pattern.events.findIndex(
      (event) => event.beat >= this.position,
    );
    if (this.index < 0) {
      this.index = 0;
      ++this.cycle;
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
    const layer = backingSampleChoices(
      event,
      this.model.getSnapshot().tonic,
      release,
      this.buffers,
    );
    const key = `${event.part}-${event.note}-${event.articulation ?? "normal"}-${release}`;
    const index = this.counter.get(key) ?? 0;
    this.counter.set(key, index + 1);
    return layer[index % layer.length];
  }
  private choke(event: BackingEvent, when: number) {
    for (const voice of this.voices) {
      if (
        voice.end <= when ||
        (!voice.release && voice.start > when + 0.00001) ||
        !backingChokes(event, voice)
      )
        continue;
      const envelope = voice.gain.gain;
      if (typeof envelope.cancelAndHoldAtTime === "function")
        envelope.cancelAndHoldAtTime(when);
      else envelope.cancelScheduledValues(when);
      envelope.setTargetAtTime(0, when, 0.006);
      try {
        voice.source.stop(when + 0.03);
      } catch {
        /* already ended */
      }
      voice.end = when;
    }
  }
  private sound(
    event: BackingEvent,
    when: number,
    release = false,
    offsetBeats = 0,
  ) {
    const context = this.context!;
    if (!release) this.choke(event, when);
    const [id, sample] = this.choose(event, release);
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const state = this.model.getSnapshot();
    const pitched = event.part === "bass" || event.part === "guitar";
    const source = context.createBufferSource();
    source.buffer = buffer;
    const rate = pitched
      ? 2 ** ((event.note + backingSemitones(state.tonic) - sample.note) / 12)
      : 1;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    const strength = release
      ? 1
      : Math.min(1.25, event.velocity / sample.velocity) ** 0.8;
    gain.gain.value = 0;
    source.connect(gain).connect(this.buses.get(event.part)!);
    const offset = (offsetBeats * 60) / state.tempo;
    const available = buffer.duration / rate - offset;
    if (available <= 0.003) {
      source.disconnect();
      gain.disconnect();
      return;
    }
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
    const voice: Voice = {
      source,
      gain,
      start: when,
      end: when + duration,
      part: event.part,
      note: event.note,
      string: event.string,
      release,
    };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when, offset * rate);
    source.stop(when + duration + 0.1);
    if (pitched && !release && event.articulation !== "muted")
      this.sound(event, when + duration, true);
  }
  private schedule() {
    const context = this.context;
    const state = this.model.getSnapshot();
    if (!context || state.status !== "playing") return;
    let pattern = this.take();
    const now = context.currentTime;
    // Background throttling must not enqueue an entire missed phrase on return.
    const earliest =
      this.anchor +
      ((this.cycle * pattern.beats + pattern.events[this.index].beat) * 60) /
        state.tempo;
    if (earliest < now - 0.25) {
      this.reschedule(this.currentPosition());
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
        pattern = this.take();
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
