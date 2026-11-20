import type { ScalePracticeQuality } from "./backing-scale-harmony";
import { acousticPalette } from "./backing-acoustic-palette";
import { rootsPalette } from "./backing-roots-palette";
import { pocketPalette } from "./backing-pocket-palette";
import {
  BackingInstrumentRack,
  backingInstrumentSound,
} from "./backing-band-sounds";
import { reggaePalette } from "./backing-reggae-palette";
import { gospelPalette } from "./backing-gospel-palette";
import { TonewheelOrgan } from "./backing-organ";
import { gospelOrganScene } from "./backing-gospel";
import { compressBackingSample } from "./backing-dynamics";
import { backingPattern, type BackingPattern } from "./backing-patterns";
import {
  BackingMixer,
  backingMixerChannels,
  backingMixerKey,
  backingMixerLevels,
  type BackingMixerChannel,
} from "./backing-mixer";
import { genreBackingArrangement } from "./backing-genre-engine";
import { BACKING_GENRES, backingGenre } from "./backing-genres";
import { sharedBackingPocket } from "./backing-shared-pocket";
import { connectBackingGuitar } from "./backing-guitar-transitions";
import drumPack from "./assets/backing-drum-v3/manifest.json";
import {
  articulateDrums,
  drumRoundRobin,
  snareAlternates,
} from "./backing-drum-articulation";
import experimentalPack from "./assets/backing-v2/manifest.json";
import { plannedBackingArrangement } from "./backing-musical-plan";
import { practiceBackingArrangement } from "./backing-phrasing";
import { scalePitchClasses, type BackingQuality } from "./backing-arrangement";
import { createViewState } from "./view-state";
import {
  backingChokes,
  backingAudioGraph,
  compactBackingBuffer,
} from "./backing-performance";
import { metronomeSettings, metronomeFrequency } from "./metronome-model";
import { persistence } from "./persistence";
import { getPianoVolume, subscribePianoVolume } from "./piano-audio";
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

const files = import.meta.glob<string>(
  [
    "./assets/backing-v1/*.flac",
    "./assets/backing-v2/*.flac",
    "./assets/backing-soul-folk/*.flac",
    "./assets/backing-drum-v3/*.flac",
    "./assets/backing-folk-country/*.flac",
    "./assets/backing-gospel/*.flac",
  ],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);
const urls = new Map(
  Object.entries(files).map(([file, url]) => [file.split("/").pop()!, url]),
);
type Snapshot = {
  style: BackingStyle;
  mode: BackingMode;
  pattern: BackingPattern;
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
  instrument?: BackingEvent["instrument"];
  note: number;
  string?: number;
  release: boolean;
  articulation?: BackingEvent["articulation"];
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
  readonly balance = createViewState(
    backingMixerLevels(
      persistence.read(backingMixerKey(this.model.getSnapshot().style)),
    ),
  );
  private mixer?: BackingMixer;
  private metroAnchor = 0;
  private metroIndex = 0;
  private metroEpoch = 0;
  private metroVoices = new Set<{ source: OscillatorNode; gain: GainNode }>();
  private context?: AudioContext;
  private output?: GainNode;
  private clickOutput?: GainNode;
  private buses = new Map<BackingPart, GainNode>();
  private setMix?: ReturnType<typeof backingAudioGraph>["setMix"];
  private organ?: TonewheelOrgan;
  private instruments?: BackingInstrumentRack;
  private retiring = new Map<
    TonewheelOrgan | BackingInstrumentRack,
    ReturnType<typeof setTimeout>
  >();
  /** Style changes stop voices with a short release. Keep their old processing
   * connected through that release instead of cutting the signal mid-wave. */
  private retire(
    processor: TonewheelOrgan | BackingInstrumentRack | undefined,
  ) {
    if (!processor) return;
    if (
      processor.context !== this.context ||
      this.context?.state !== "running"
    ) {
      processor.dispose();
      return;
    }
    const timer = setTimeout(() => {
      this.retiring.delete(processor);
      processor.dispose();
    }, 60);
    this.retiring.set(processor, timer);
  }
  /** The historical flags apply only to the original Blues/Rock reference. */
  private legacyReference(style: BackingStyle): "blues" | "rock" | undefined {
    return (style === "blues" || style === "rock") &&
      !(
        this.experimental &&
        this.drumArticulations &&
        this.guitarTransitions &&
        this.sharedPocket
      )
      ? style
      : undefined;
  }

  private unlistenVolume?: () => void;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private counter = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private epoch = 0;
  private disposed = false;
  private anchor = 0;
  private position = 0;
  private cycle = 0;
  private harmonicScale?: ScalePracticeQuality;
  private index = 0;
  private lastBeat = -1;
  private takeCache = new Map<
    number,
    ReturnType<typeof practiceBackingArrangement>
  >();
  private take() {
    let take = this.takeCache.get(this.cycle);
    if (!take) {
      const state = this.model.getSnapshot();
      const reference = this.legacyReference(state.style);
      if (!reference) {
        take = genreBackingArrangement(
          state.style,
          state.mode,
          state.quality,
          this.cycle,
          state.tempo,
          state.tonic,
          state.pattern,
          this.harmonicScale,
        );
      } else {
        take = (
          this.experimental
            ? plannedBackingArrangement
            : practiceBackingArrangement
        )(
          reference,
          state.mode,
          state.quality,
          this.cycle,
          state.tempo,
          state.tonic,
        );
        if (this.drumArticulations)
          take = articulateDrums(
            take as ReturnType<typeof plannedBackingArrangement>,
          );
        if (this.guitarTransitions)
          take = connectBackingGuitar(
            take as ReturnType<typeof plannedBackingArrangement>,
            state.tempo,
          );
        if (this.sharedPocket)
          take = sharedBackingPocket(
            take as ReturnType<typeof plannedBackingArrangement>,
            state.tempo,
          );
      }
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

  private drumPackCache?: typeof backingPack;
  private lastDrumFile = new Map<string, string>();
  private paletteCache = new Map<string, typeof backingPack>();
  private get basePack() {
    if (this.drumArticulations) {
      if (this.drumPackCache) return this.drumPackCache;
      const samples = Object.fromEntries(
        Object.entries(experimentalPack.samples).filter(
          ([, s]) => !(s.part === "drums" && s.note === 38),
        ),
      );
      return (this.drumPackCache = {
        ...experimentalPack,
        samples: { ...samples, ...drumPack.samples },
      } as unknown as typeof backingPack);
    }
    return this.experimental
      ? (experimentalPack as unknown as typeof backingPack)
      : backingPack;
  }
  private get pack() {
    const style = this.model.getSnapshot().style;
    if (this.legacyReference(style)) return this.basePack;
    if (style === "blues" || style === "rock") {
      let pack = this.paletteCache.get(style);
      if (!pack)
        this.paletteCache.set(
          style,
          (pack = rootsPalette(style, this.basePack)),
        );
      return pack;
    }
    if (style === "funk" || style === "soul") {
      let pack = this.paletteCache.get(style);
      if (!pack)
        this.paletteCache.set(
          style,
          (pack = pocketPalette(style, this.basePack)),
        );
      return pack;
    }
    if (style === "gospel" || style === "reggae") {
      let pack = this.paletteCache.get(style);
      if (!pack)
        this.paletteCache.set(
          style,
          (pack =
            style === "reggae"
              ? reggaePalette(this.basePack)
              : gospelPalette(this.basePack)),
        );
      return pack;
    }
    if (style === "folk" || style === "country") {
      let pack = this.paletteCache.get(style);
      if (!pack) this.paletteCache.set(style, (pack = acousticPalette(style)));
      return pack;
    }
    return this.basePack;
  }
  /** Approved sparse plan/sampler; false retains the previous A/B reference. */
  constructor(
    private experimental = true,
    private drumArticulations = experimental,
    private guitarTransitions = experimental,
    private sharedPocket = guitarTransitions,
    private report: (error: unknown, code: string) => void = () => {},
  ) {
    document.addEventListener("visibilitychange", this.hidden);
    window.addEventListener("pagehide", this.departing);
    this.unlistenVolume = subscribePianoVolume(this.applyVolume);
  }
  private applyVolume = () => {
    if (this.output)
      this.output.gain.setTargetAtTime(
        getPianoVolume() / 100,
        this.output.context.currentTime,
        0.015,
      );
    if (this.clickOutput)
      this.clickOutput.gain.setTargetAtTime(
        getPianoVolume() / 100,
        this.clickOutput.context.currentTime,
        0.015,
      );
  };
  private patch(patch: Partial<Snapshot>) {
    this.model.set({ ...this.model.getSnapshot(), ...patch });
  }
  private remember() {
    const { style, mode, tempo, pattern } = this.model.getSnapshot();
    persistence.write("backing-track", {
      version: 1,
      style,
      mode,
      tempo,
      pattern,
    });
  }
  setKey(
    tonic: number,
    keyLabel: string,
    quality: BackingQuality = this.model.getSnapshot().quality,
    scaleQuality?: ScalePracticeQuality,
  ) {
    const previous = this.model.getSnapshot();
    if (
      previous.tonic === tonic &&
      previous.keyLabel === keyLabel &&
      previous.quality === quality &&
      this.harmonicScale === scaleQuality
    )
      return;
    const active =
      previous.status === "playing" || previous.status === "loading";
    if (active)
      this.pause(
        backingClockActive(previous) && this.metronome.getSnapshot().enabled,
      );
    this.harmonicScale = scaleQuality;
    this.patch({ tonic, keyLabel, quality });
    this.takeCache.clear();
    if (active) void this.play();
  }
  setStyle(style: BackingStyle) {
    if (backingGenre(style).id !== style) return;
    if (style === this.model.getSnapshot().style) return;
    const previous = this.model.getSnapshot();
    const paletteChanged =
      BACKING_GENRES[style].instrumentation.preset !==
      BACKING_GENRES[previous.style].instrumentation.preset;
    const playing = previous.status === "playing",
      active = playing || previous.status === "loading";
    if (active && paletteChanged)
      this.pause(
        backingClockActive(previous) && this.metronome.getSnapshot().enabled,
      );
    if (paletteChanged) {
      this.retire(this.instruments);
      this.instruments = undefined;
      this.retire(this.organ);
      this.organ = undefined;
    }
    this.patch({ style, pattern: backingPattern(style, undefined) });
    const balance = backingMixerLevels(
      persistence.read(backingMixerKey(style)),
    );
    this.balance.set(balance);
    this.mixer?.setLevels(balance);
    this.setMix?.(
      this.pack.levels,
      this.mixProfile,
      this.model.getSnapshot().mode,
    );
    this.takeCache.clear();
    this.remember();
    this.position = 0;
    if (active && paletteChanged) void this.play();
    else if (playing) this.reschedule(0);
  }

  setPattern(value: BackingPattern) {
    const state = this.model.getSnapshot(),
      pattern = backingPattern(state.style, value);
    if (pattern === state.pattern) return;
    const beat = this.currentPosition();
    this.patch({ pattern });
    this.setMix?.(this.pack.levels, this.mixProfile, state.mode);
    this.takeCache.clear();
    this.remember();
    if (state.status === "playing") this.reschedule(beat);
  }

  setMixerLevel(channel: BackingMixerChannel, value: number) {
    if (!backingMixerChannels.includes(channel) || !Number.isFinite(value))
      return;
    const levels = backingMixerLevels({
      levels: { ...this.balance.getSnapshot(), [channel]: value },
    });
    this.balance.set(levels);
    this.mixer?.setLevels(levels);
    this.rememberMixer();
  }

  resetMixer() {
    const levels = backingMixerLevels();
    this.balance.set(levels);
    this.mixer?.setLevels(levels);
    this.rememberMixer();
  }

  private rememberMixer() {
    persistence.write(backingMixerKey(this.model.getSnapshot().style), {
      version: 1,
      levels: this.balance.getSnapshot(),
    });
  }

  private mixerInput(event: Pick<BackingEvent, "part" | "instrument">) {
    if (
      !this.mixer ||
      this.mixer.context !== this.context ||
      this.mixer.buses !== this.buses
    ) {
      this.mixer?.dispose();
      this.mixer = new BackingMixer(
        this.context!,
        this.buses,
        this.balance.getSnapshot(),
      );
    }
    return this.mixer.input(event);
  }

  get mixProfile() {
    const { style, pattern } = this.model.getSnapshot();
    if (this.legacyReference(style)) return "approved-drum-forward";
    if (style === "folk" && pattern === "strummed") return "strummed-acoustic";
    return BACKING_GENRES[style].instrumentation.mix;
  }

  setMode(mode: BackingMode) {
    if (mode !== "steady" && mode !== "active") return;
    if (mode === this.model.getSnapshot().mode) return;
    const beat = this.currentPosition();
    this.patch({ mode });
    this.setMix?.(this.pack.levels, this.mixProfile, mode);
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
    } catch (error) {
      if (token !== this.metroEpoch || this.disposed) return;
      this.report(error, "metronome.start_failed");
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
        source.connect(gain).connect(this.clickOutput!);
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
    this.takeCache.clear();
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
      const graph = backingAudioGraph(
        context,
        this.pack.levels,
        this.mixProfile,
        this.model.getSnapshot().mode,
      );
      this.output = graph.output;
      this.clickOutput = context.createGain();
      this.clickOutput.connect(context.destination);
      this.applyVolume();
      this.buses = graph.buses;
      this.setMix = graph.setMix;
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
      const shift = this.experimental ? 0 : backingSemitones(current.tonic);
      const needed = new Set<string>(
        Object.entries(this.pack.samples)
          .filter(([, sample]) => {
            if (sample.part === "drums" || sample.part === "percussion")
              return true;
            const bass = sample.part === "bass";
            const low =
                (bass
                  ? 28
                  : sample.part === "keys"
                    ? 48
                    : sample.instrument === "acoustic-steel"
                      ? 40
                      : (backingInstrumentSound(sample.instrument)
                          ?.lowestNote ?? 50)) + shift,
              high = (bass ? 55 : sample.part === "keys" ? 79 : 76) + shift;
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
      const decodedFiles = new Map<string, Promise<AudioBuffer>>();
      const nativeDecoders = this.experimental
        ? {
            bass: new OfflineAudioContext(2, 1, 16000),
            guitar: new OfflineAudioContext(2, 1, 24000),
            keys: new OfflineAudioContext(2, 1, 24000),
          }
        : undefined;
      const queue = [...needed].filter((id) => !this.buffers.has(id));
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (queue.length && token === this.epoch && !this.disposed) {
            const id = queue.shift()!,
              sample = this.pack.samples[id],
              url = urls.get(sample.file);
            if (!url) throw Error("Missing backing sample");
            const cacheKey = `${sample.file}:${sample.instrument ?? sample.part}:${sample.gain}:${sample.release}`;
            let pending = decodedFiles.get(cacheKey);
            if (!pending) {
              pending = (async () => {
                const response = await fetch(url, {
                  signal: AbortSignal.timeout(15000),
                });
                if (!response.ok)
                  throw Error(
                    `Backing sample request failed (${response.status})`,
                  );
                const decoder =
                  nativeDecoders &&
                  (sample.part === "bass" ||
                    sample.part === "guitar" ||
                    sample.part === "keys")
                    ? nativeDecoders[sample.part]
                    : context;
                const decoded = await decoder.decodeAudioData(
                  await response.arrayBuffer(),
                );
                // Each retained tail covers the instrument's longest supported
                // gate and release at 50 BPM. Palette-specific IDs isolate it.
                const limit = backingInstrumentSound(
                  sample.instrument,
                )?.maxSeconds;
                if (limit && decoded.duration > limit) {
                  const clipped = decoder.createBuffer(
                    decoded.numberOfChannels,
                    Math.ceil(limit * decoded.sampleRate),
                    decoded.sampleRate,
                  );
                  for (let ch = 0; ch < decoded.numberOfChannels; ch++)
                    clipped.copyToChannel(
                      decoded.getChannelData(ch).subarray(0, clipped.length),
                      ch,
                    );
                  return this.legacyReference(current.style)
                    ? clipped
                    : compressBackingSample(clipped, sample);
                }
                const prepared = this.experimental
                  ? decoded
                  : await compactBackingBuffer(decoded, sample.part);
                return this.legacyReference(current.style)
                  ? prepared
                  : compressBackingSample(prepared, sample);
              })();
              decodedFiles.set(cacheKey, pending);
            }
            const buffer = await pending;
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
      this.report(error, "backing_track.play_failed");
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
    this.organ?.dispose();
    this.organ = undefined;
    this.instruments?.dispose();
    this.instruments = undefined;
    for (const [processor, timer] of this.retiring) {
      clearTimeout(timer);
      processor.dispose();
    }
    this.retiring.clear();
    this.mixer?.dispose();
    this.mixer = undefined;
    this.unlistenVolume?.();
    this.unlistenVolume = undefined;
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
    this.organ?.stop(now);
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
    const genre = BACKING_GENRES[state.style];
    const beats = (genre.form.bars * genre.meter[0] * 4) / genre.meter[1];
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
        (event.part === "bass" ||
          event.part === "guitar" ||
          event.part === "keys") &&
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
  ): [string, BackingSample] | undefined {
    const layer = backingSampleChoices(
      event,
      this.model.getSnapshot().tonic,
      release,
      this.buffers,
      this.pack,
    );
    if (!layer.length) return undefined;
    const key = `${event.instrument ?? event.part}-${event.note}-${event.articulation ?? "normal"}-${release}`;
    const index = this.counter.get(key) ?? 0;
    this.counter.set(key, index + 1);
    if (this.drumArticulations && event.part === "drums") {
      const alternates =
        event.note === 38 && event.instrument !== "brush-drums"
          ? snareAlternates(event, this.pack.samples).filter(([id]) =>
              this.buffers.has(id),
            )
          : [];
      const choices = alternates.length > 1 ? alternates : layer;
      let chosen = drumRoundRobin(index, choices.length, event.note);
      if (
        choices.length > 1 &&
        choices[chosen][1].file === this.lastDrumFile.get(key)
      )
        chosen = (chosen + 1) % choices.length;
      this.lastDrumFile.set(key, choices[chosen][1].file);
      return choices[chosen];
    }
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
    const style = this.model.getSnapshot().style;
    if (!release && (style === "gospel" || style === "reggae")) {
      if (
        this.organ?.context !== context ||
        this.organ.destination !==
          this.mixerInput({ part: "keys", instrument: "tonewheel-organ" }) ||
        this.organ.profile !== style
      ) {
        this.organ?.dispose();
        this.organ = new TonewheelOrgan(
          context,
          this.mixerInput({ part: "keys", instrument: "tonewheel-organ" }),
          style,
        );
      }
      const take = this.take();
      this.organ.setScene(
        style === "reggae"
          ? { registration: 0, expression: 0.75, rotary: "slow" }
          : gospelOrganScene(
              take as ReturnType<typeof genreBackingArrangement>,
              event.beat + offsetBeats,
            ),
        when,
      );
    }
    if (event.instrument === "tonewheel-organ") {
      if (!release)
        this.organ!.play(
          event.note,
          when,
          ((event.duration - offsetBeats) * 60) /
            this.model.getSnapshot().tempo,
          event.level,
          offsetBeats > 0,
        );
      return;
    }
    if (!release) this.choke(event, when);
    const chosen = this.choose(event, release);
    if (!chosen) {
      if (release) return; // some native banks contain attacks only
      throw Error(
        `Missing ${event.instrument ?? event.part} attack for ${event.note}`,
      );
    }
    const [id, sample] = chosen;
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const state = this.model.getSnapshot();
    const pitched =
      event.part === "bass" || event.part === "guitar" || event.part === "keys";
    const source = context.createBufferSource();
    source.buffer = buffer;
    const rate = pitched
      ? 2 **
        ((event.note +
          (event.absolute ? 0 : backingSemitones(state.tonic)) -
          sample.note) /
          12)
      : 1;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    const strength = release
      ? this.experimental
        ? Math.min(1, event.velocity / 65) ** 0.8 *
          Math.exp((-event.duration * 60) / state.tempo / 2.8)
        : 1
      : Math.min(1.25, event.velocity / sample.velocity) ** 0.8;
    gain.gain.value = 0;
    source.connect(gain);
    const instrument = event.instrument ?? sample.instrument;
    if (backingInstrumentSound(instrument)) {
      if (this.instruments?.context !== context) {
        this.instruments?.dispose();
        this.instruments = new BackingInstrumentRack(context);
      }
      gain.connect(
        this.instruments.input(
          instrument!,
          this.mixerInput({ part: event.part, instrument }),
        ),
      );
    } else gain.connect(this.mixerInput({ part: event.part, instrument }));
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
    const level =
      sample.gain *
      strength *
      (event.level ?? 1) *
      (release && event.part === "guitar"
        ? (event.guitarReleaseScale ?? 1)
        : 1);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(
      level,
      when +
        (event.part === "guitar" && !release
          ? (event.guitarAttackSeconds ?? 0.002)
          : 0.002),
    );
    gain.gain.setValueAtTime(level, when + Math.max(0.003, duration - 0.003));
    gain.gain.linearRampToValueAtTime(
      0,
      when +
        duration +
        (pitched && !release
          ? event.part === "guitar"
            ? (event.guitarReleaseSeconds ?? 0.08)
            : event.part === "keys"
              ? (event.noteReleaseSeconds ?? 0.18)
              : 0.08
          : 0.005),
    );
    const voice: Voice = {
      source,
      gain,
      start: when,
      end: when + duration,
      part: event.part,
      instrument: event.instrument ?? sample.instrument,
      note: event.note,
      string: event.string,
      articulation: event.articulation,
      release,
    };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    source.start(when, offset * rate);
    source.stop(
      when +
        duration +
        (event.part === "keys"
          ? (event.noteReleaseSeconds ?? 0.18) + 0.015
          : 0.1),
    );
    if (
      pitched &&
      event.part !== "keys" &&
      !event.naturalReleaseOnly &&
      !release &&
      event.articulation !== "muted" &&
      event.articulation !== "ghost"
    )
      this.sound(
        event.part === "guitar" && event.guitarReleaseScale !== undefined
          ? { ...event, duration: (duration * state.tempo) / 60 }
          : event,
        when + duration,
        true,
      );
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
