import { TempoClock, type LiveVoice } from './tempo-clock';
import { PlaybackHealth, type PlaybackInterruption } from './playback-health';
import { CelloGlides, preloadCello } from './cello';
import * as Tone from 'tone';
import { secondsAt, type Exercise } from './music';
import { preloadSteinway, SteinwayGrand } from './steinway';
import { audioEvents, type AudioEvent } from './audio-timeline';

export const RELEASE_TAIL = 0.8;
let playbackContext: AudioContext | undefined;
function initPlayback() {
  if (!playbackContext || playbackContext.state === 'closed') {
    // This is a sequenced player: reliability matters more than live-key latency.
    // Let Tone create its compatible context: Firefox still exposes a legacy
    // AudioListener, which cannot be passed directly to Tone's spatial parameters.
    const context = new Tone.Context({ latencyHint: 'playback', lookAhead: 0.15 });
    playbackContext = context.rawContext as AudioContext;
    Tone.setContext(context, true);
  }
}
function makeGraph(volume: number) {
  // Catch unusually loud chord sums without changing ordinary piano dynamics.
  const limiter = new Tone.Limiter(-1).toDestination();
  const output = new Tone.Volume(volume <= -60 ? -Infinity : volume).connect(limiter);
  const synth = new SteinwayGrand(output);
  const cello = new CelloGlides(output);
  const clicks = new Set<() => void>();
  const click = (
    frequency: number,
    duration: number,
    time: number,
    velocity: number
  ): LiveVoice => {
    const context = output.context;
    const source = context.createOscillator(),
      gain = context.createGain();
    source.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity * 0.35, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + duration + 0.02);
    source.connect(gain);
    Tone.connect(gain, output);
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
      clicks.delete(cancel);
    };
    const cancel = () => {
      source.stop();
      cleanup();
    };
    source.onended = cleanup;
    clicks.add(cancel);
    source.start(time);
    source.stop(time + duration + 0.025);
    return { cancel, retime() {} };
  };
  return {
    synth,
    cello,
    click,
    output,
    dispose() {
      synth.dispose();
      cello.dispose();
      for (const cancel of clicks) cancel();
      clicks.clear();
      output.dispose();
      limiter.dispose();
    },
  };
}
function playEvent(event: AudioEvent, graph: ReturnType<typeof makeGraph>, time: number, late = 0) {
  if (event.kind === 'click') {
    if (late < 0.04) return graph.click(event.frequency, event.duration, time, event.velocity);
  } else if (event.kind === 'glide' && event.glide) {
    return graph.cello.play(
      event.glide.midi,
      event.glide.span,
      event.glide.duration,
      event.elapsed + late,
      time,
      event.velocity,
      event.glide.returns
    );
  } else if (event.duration > late) {
    return graph.synth.triggerAttackRelease(
      event.frequency,
      event.duration - late,
      time,
      event.velocity,
      event.elapsed + late
    );
  }
}
// Prepare the longest supported live tempo once, so slowing down never loads
// recordings mid-phrase. Offline exports retain their existing smaller cache.
function prepareLive(exercise: Exercise) {
  return Promise.all([
    preloadSteinway({ ...exercise, spec: { ...exercise.spec, bpm: 60 } }),
    preloadCello(exercise),
  ]);
}
export type PlaybackState = 'ready' | 'starting' | 'playing' | 'paused' | 'complete';
export class Player {
  state: PlaybackState = 'ready';
  onStateChange?: (state: PlaybackState, position: number, reason?: PlaybackInterruption) => void;
  private health: PlaybackHealth | null = null;
  private watchedContext?: AudioContext;
  private contextChanged = () => {
    if (this.state === 'playing' && playbackContext?.state !== 'running')
      this.interrupt('audio-interrupted');
  };
  private publish(state: PlaybackState, reason?: PlaybackInterruption) {
    if (typeof window !== 'undefined') window.doregoDiagnostics?.event('audio.state', { audioState: playbackContext?.state || 'unavailable' });
    this.state = state;
    this.onStateChange?.(state, this.position, reason);
  }
  private watchContext() {
    if (this.watchedContext === playbackContext) return;
    this.watchedContext?.removeEventListener('statechange', this.contextChanged);
    this.watchedContext = playbackContext;
    this.watchedContext?.addEventListener('statechange', this.contextChanged);
  }
  private graph: ReturnType<typeof makeGraph> | null = null;
  private clock: TempoClock | null = null;
  private exercise: Exercise | null = null;
  private seekBeat = 0;
  private pending = 0;
  private events: AudioEvent[] = [];
  private cursor = 0;
  private voices = new Map<string, { event: AudioEvent; voice: LiveVoice; start: number }>();
  private scheduler: ReturnType<typeof setInterval> | undefined;
  async prepare(exercise: Exercise) {
    initPlayback();
    this.watchContext();
    await prepareLive(exercise);
  }
  async play(exercise: Exercise, offset = 0) {
    this.halt();
    const token = ++this.pending;
    this.exercise = exercise;
    this.seekBeat = (offset * exercise.spec.bpm) / 60;
    initPlayback();
    this.watchContext();
    this.publish('starting');
    try {
      await Tone.start();
      if (token !== this.pending) return false;
      const prepareStarted = performance.now();
      await prepareLive(exercise);
      if (typeof window !== 'undefined') window.doregoDiagnostics?.metric('samples.prepare_ms', performance.now() - prepareStarted);
      if (token !== this.pending) return false;
      if (playbackContext?.state !== 'running')
        throw new Error('Audio is unavailable. Try Resume when the interruption ends.');
      const current = this.exercise!;
      this.graph = makeGraph(current.spec.volume);
      this.clock = new TempoClock(Tone.now() + 0.05, this.seekBeat, current.spec.bpm);
      this.events = audioEvents(current, secondsAt(this.seekBeat, current.spec.bpm));
      this.cursor = 0;
      this.health = new PlaybackHealth(this.graph.output.context.immediate(), performance.now());
      this.fill();
      if (token !== this.pending) return false;
      this.scheduler = setInterval(() => this.fill(), 100);
      this.publish('playing');
      return true;
    } catch (error) {
      // Neither success nor failure from a superseded start may affect its successor.
      if (token !== this.pending) return false;
      this.halt();
      this.publish('paused');
      throw error;
    }
  }
  pause() {
    this.halt();
    this.publish('paused');
  }
  reset() {
    this.halt();
    this.seekBeat = 0;
    this.publish('ready');
  }
  seek(exercise: Exercise, position: number) {
    this.halt();
    this.exercise = exercise;
    this.seekBeat = Math.max(0, Math.min(exercise.totalBeats, (position * exercise.spec.bpm) / 60));
    this.publish('paused');
  }
  interrupt(reason: PlaybackInterruption, audioTime?: number) {
    if (this.state !== 'playing' && this.state !== 'starting') return;
    const beat = audioTime === undefined ? undefined : this.clock?.beatAt(audioTime);
    this.halt();
    if (beat !== undefined) this.seekBeat = Math.max(0, beat);
    this.publish('paused', reason);
  }
  reconcile() {
    if (this.state !== 'playing') return;
    this.contextChanged();
    if (this.state === 'playing') this.fill();
  }
  private fill() {
    if (!this.graph || !this.clock || !this.exercise) return;
    if (playbackContext?.state !== 'running') {
      this.interrupt('audio-interrupted');
      return;
    }
    const graph = this.graph,
      clock = this.clock,
      bpm = this.exercise.spec.bpm;
    const now = graph.output.context.immediate();
    const beat = clock.beatAt(now);
    const next = this.events[this.cursor];
    const interruption = this.health?.check(
      now,
      performance.now(),
      next ? clock.timeAt(Math.max(this.seekBeat, next.onsetBeat)) : Infinity
    );
    if (interruption) {
      if (typeof window !== 'undefined') window.doregoDiagnostics?.event('audio.interruption', { reason: interruption.reason });
      this.interrupt(interruption.reason, interruption.audioTime);
      return;
    }
    if (this.position >= secondsAt(this.exercise.totalBeats, bpm) + RELEASE_TAIL) {
      const end = this.exercise.totalBeats;
      this.halt();
      this.seekBeat = end;
      this.publish('complete');
      return;
    }
    for (const [id, entry] of this.voices) if (entry.event.endBeat <= beat) this.voices.delete(id);
    // Retain one second of audio-clock scheduling through main-thread stalls.
    while (this.cursor < this.events.length) {
      const event = this.events[this.cursor];
      const planned = clock.timeAt(Math.max(this.seekBeat, event.onsetBeat));
      if (planned >= now + 1) break;
      this.cursor++;
      if (this.voices.has(event.id) || event.endBeat <= beat) continue;
      const time = Math.max(planned, now + 0.015);
      const elapsed = secondsAt(Math.max(0, clock.beatAt(time) - event.onsetBeat), bpm);
      const fullDuration = secondsAt(event.endBeat - event.onsetBeat, bpm);
      const voice = playEvent(
        {
          ...event,
          elapsed: 0,
          duration: fullDuration,
          ...(event.glide ? { glide: { ...event.glide, duration: fullDuration } } : {}),
        },
        graph,
        time,
        elapsed
      );
      if (voice) this.voices.set(event.id, { event, voice, start: time });
    }
  }
  setVolume(volume: number) {
    if (!Number.isFinite(volume) || volume < -60 || volume > 0)
      throw new Error('Choose a volume from -60 to 0 dB.');
    if (this.exercise)
      this.exercise = { ...this.exercise, spec: { ...this.exercise.spec, volume } };
    if (this.graph)
      this.graph.output.volume.rampTo(
        volume <= -60 ? -Infinity : volume,
        0.02,
        this.graph.output.context.immediate()
      );
  }
  setTempo(bpm: number) {
    this.reconcile();
    if (!Number.isFinite(bpm) || bpm < 60 || bpm > 240)
      throw new Error('Choose a tempo from 60 to 240 BPM.');
    if (!this.exercise || bpm === this.exercise.spec.bpm) return;
    this.exercise = { ...this.exercise, spec: { ...this.exercise.spec, bpm } };
    if (!this.graph || !this.clock) return;
    const now = this.graph.output.context.immediate(),
      beat = this.clock.beatAt(now);
    for (const [id, entry] of this.voices) {
      if (entry.start > now) {
        entry.voice.cancel();
        this.voices.delete(id);
      } else if (entry.event.endBeat > beat && entry.event.kind !== 'click') {
        const { onsetBeat, endBeat } = entry.event;
        entry.voice.retime(
          now,
          secondsAt(endBeat - beat, bpm),
          (beat - onsetBeat) / (endBeat - onsetBeat)
        );
      } else this.voices.delete(id);
    }
    this.clock.setTempo(now, bpm);
    this.events = audioEvents(this.exercise, secondsAt(beat, bpm));
    this.cursor = 0;
    this.fill();
  }
  get position() {
    const bpm = this.exercise?.spec.bpm ?? 60;
    if (!this.graph || !playbackContext || !this.clock) return secondsAt(this.seekBeat, bpm);
    const stamp = playbackContext.getOutputTimestamp?.();
    const contextTime = stamp?.contextTime ?? 0,
      performanceTime = stamp?.performanceTime ?? 0;
    const audibleTime =
      contextTime > 0 && performanceTime > 0
        ? Math.min(
            playbackContext.currentTime,
            contextTime + Math.max(0, performance.now() - performanceTime) / 1000
          )
        : playbackContext.currentTime -
          playbackContext.baseLatency -
          (playbackContext.outputLatency || 0);
    return secondsAt(this.clock.beatAt(audibleTime), bpm);
  }
  private halt() {
    ++this.pending;
    clearInterval(this.scheduler);
    this.scheduler = undefined;
    const graph = this.graph;
    if (graph) this.seekBeat = (this.position * (this.exercise?.spec.bpm ?? 60)) / 60;
    this.graph = null;
    this.clock = null;
    this.voices.clear();
    this.health = null;
    if (graph) {
      if (playbackContext?.state === 'running') {
        graph.output.volume.rampTo(-100, 0.02, graph.output.context.immediate());
        setTimeout(() => graph.dispose(), 50);
      } else graph.dispose();
    }
  }
}
export async function renderAudio(exercise: Exercise): Promise<Uint8Array> {
  await Promise.all([preloadSteinway(exercise), preloadCello(exercise)]);
  const duration = secondsAt(exercise.totalBeats, exercise.spec.bpm) + RELEASE_TAIL;
  let cleanup = () => {};
  const result = await Tone.Offline(
    () => {
      const graph = makeGraph(exercise.spec.volume);
      cleanup = () => graph.dispose();
      for (const event of audioEvents(exercise, 0)) playEvent(event, graph, event.time);
    },
    duration,
    2,
    44100
  ).finally(() => cleanup());
  const audio = result.get();
  if (!audio) throw new Error('Could not render the audio track.');
  const channels = audio.numberOfChannels,
    length = audio.length;
  const data = new ArrayBuffer(44 + length * channels * 2),
    view = new DataView(data);
  const str = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  str(0, 'RIFF');
  view.setUint32(4, data.byteLength - 8, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  const samples = Array.from({ length: channels }, (_, channel) => audio.getChannelData(channel));
  for (let i = 0; i < length; i++)
    for (let ch = 0; ch < channels; ch++) {
      const v = Math.max(-1, Math.min(1, samples[ch][i]));
      view.setInt16(44 + (i * channels + ch) * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    }
  result.dispose();
  return new Uint8Array(data);
}
