import * as Tone from 'tone';
import { prepareReferenceNote } from './steinway';

/** Auditioning is independent of the exercise transport and its pending loads. */
export class ReferencePiano {
  private stops = new Set<() => void>();
  private bus?: { context: AudioContext; gain: GainNode; limiter: DynamicsCompressorNode };
  constructor(
    private volume: number,
    private failed: (error: unknown) => void
  ) {}
  setVolume(volume: number) {
    this.volume = volume;
    if (this.bus)
      this.bus.gain.gain.setTargetAtTime(this.level(), this.bus.context.currentTime, 0.015);
  }
  private level() {
    return this.volume <= -60 ? 0 : 10 ** (this.volume / 20);
  }
  stopAll() {
    for (const stop of [...this.stops]) stop();
  }
  shutdown() {
    this.stopAll();
    this.bus?.gain.disconnect();
    this.bus?.limiter.disconnect();
    this.bus = undefined;
  }
  private output(context: AudioContext) {
    if (this.bus?.context !== context) {
      this.bus?.gain.disconnect();
      this.bus?.limiter.disconnect();
      const gain = context.createGain(),
        limiter = context.createDynamicsCompressor();
      gain.gain.value = this.level();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.1;
      gain.connect(limiter).connect(context.destination);
      this.bus = { context, gain, limiter };
    }
    return this.bus.gain;
  }
  press(midi: number) {
    let released = false;
    let keyUp = false;
    let release: (() => void) | undefined;
    const cancel = () => {
      if (released) return;
      released = true;
      release?.();
      this.stops.delete(cancel);
    };
    const stop = () => {
      keyUp = true;
      if (release) cancel();
    };
    this.stops.add(cancel);
    void (async () => {
      try {
        await Tone.start();
        const prepared = await prepareReferenceNote(midi);
        if (released) return;
        const context = Tone.getContext().rawContext as AudioContext;
        if (context.state !== 'running') throw Error('Audio is unavailable. Try the piano again.');
        const source = context.createBufferSource(),
          envelope = context.createGain();
        source.buffer = prepared.buffer;
        source.playbackRate.value = 2 ** ((midi - prepared.midi) / 12);
        source.connect(envelope).connect(this.output(context));
        const now = context.currentTime;
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(0.7, now + 0.004);
        // A safety release also bounds a missed key-up or an interrupted page.
        envelope.gain.setValueAtTime(0.7, now + 1.4);
        envelope.gain.linearRampToValueAtTime(0, now + 1.6);
        source.onended = () => {
          this.stops.delete(cancel);
          source.disconnect();
          envelope.disconnect();
        };
        release = () => {
          const at = context.currentTime;
          envelope.gain.cancelScheduledValues(at);
          envelope.gain.setTargetAtTime(0, at, 0.025);
          source.stop(at + 0.15);
        };
        source.start(now);
        source.stop(now + 1.6);
        if (keyUp) {
          // A cold-cache click still produces a short note once its sample is ready.
          envelope.gain.cancelScheduledValues(now + 0.1);
          envelope.gain.setTargetAtTime(0, now + 0.1, 0.025);
          source.stop(now + 0.25);
        }
      } catch (error) {
        this.stops.delete(cancel);
        if (!released) this.failed(error);
      }
    })();
    return stop;
  }
}
