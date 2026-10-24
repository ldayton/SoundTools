import { createResources } from '@ldayton/browser-offline';
const resources = createResources();
import { holdParam, type LiveVoice } from './tempo-clock';
import * as Tone from 'tone';
import { glideOffset, type Exercise } from './music';
import { sampleLoader } from './sample-loader';

// VSCO uses a different octave naming convention; these keys come from its SFZ.
export const CELLO_KEYS = [36, 40, 43, 47, 50, 53, 57, 60, 64, 67, 71, 74, 77];
export function celloKey(midi: number, span: number) {
  const midpoint = midi + span / 2;
  return CELLO_KEYS.reduce((best, key) =>
    Math.abs(key - midpoint) < Math.abs(best - midpoint) ? key : best
  );
}
const buffers = new Map<number, AudioBuffer>();
export async function preloadCello(exercise: Exercise) {
  const keys = [
    ...new Set(
      exercise.notes.filter((n) => n.glideSpan).map((n) => celloKey(n.midi, n.glideSpan!))
    ),
  ];
  const path = (key: number) => `vsco-cello/${key}.flac`;
  sampleLoader.select('cello', keys.map(path));
  await Promise.all(
    keys.map(async (key) => {
      if (buffers.has(key)) return;
      const buffer = await sampleLoader.load(path(key), async (signal) => {
        const encoded = await resources.fetchBytes(`${import.meta.env.BASE_URL}samples/${path(key)}`, { signal, timeoutMs:15000, idleMs:5000, attempts:2 });
        signal.throwIfAborted();
        const buffer = await Tone.getContext().decodeAudioData(encoded);
        signal.throwIfAborted();
        // Transform in place before publishing: avoid a second full PCM allocation.
        let peak = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++)
          for (const value of buffer.getChannelData(ch)) peak = Math.max(peak, Math.abs(value));
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < data.length; i++) data[i] *= 0.75 / Math.max(peak, 0.001);
          // Crossfade into the loop's beginning before wrapping. The attack is
          // retained, while a slow exercise can sustain without a hard seam.
          const loopStart = Math.floor(0.8 * buffer.sampleRate);
          const loopEnd = Math.floor((buffer.duration - 0.5) * buffer.sampleRate);
          const crossfade = Math.floor(0.15 * buffer.sampleRate);
          for (let i = 0; i < crossfade; i++) {
            const blend = (1 - Math.cos((Math.PI * i) / (crossfade - 1))) / 2;
            data[loopEnd - crossfade + i] =
              data[loopEnd - crossfade + i] * (1 - blend) + data[loopStart + i] * blend;
          }
        }
        return buffer;
      });
      buffers.set(key, buffer);
    })
  );
}
export class CelloGlides {
  private sources = new Set<() => void>();
  constructor(private destination: Tone.Volume) {}
  play(
    midi: number,
    span: number,
    fullDuration: number,
    elapsed: number,
    time: number,
    velocity: number,
    returns = span >= 0
  ) {
    const key = celloKey(midi, span),
      buffer = buffers.get(key);
    if (!buffer) throw new Error('The cello recordings are not ready.');
    const duration = fullDuration - elapsed;
    if (duration <= 0) return;
    const context = this.destination.context;
    const source = context.createBufferSource(),
      gain = context.createGain(),
      soften = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0.95;
    source.loopEnd = Math.floor((buffer.duration - 0.5) * buffer.sampleRate) / buffer.sampleRate;
    const centsAt = (seconds: number) =>
      (midi - key + glideOffset(seconds / fullDuration, span, returns)) * 100;
    // One continuous source and audio-clock automation, including after seeking.
    source.playbackRate.setValueCurveAtTime(
      Float32Array.from(
        { length: 4096 },
        (_, i) => 2 ** (centsAt(elapsed + (duration * i) / 4095) / 1200)
      ),
      time,
      duration
    );
    soften.type = 'highshelf';
    soften.frequency.value = 2500;
    soften.gain.value = -4;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(
      velocity,
      time + Math.min(elapsed ? 0.02 : 0.16, duration / 3)
    );
    gain.gain.setValueAtTime(velocity, time + Math.max(duration / 3, duration - 0.18));
    gain.gain.linearRampToValueAtTime(0, time + duration);
    source.connect(soften).connect(gain);
    Tone.connect(gain, this.destination);
    // Integrate the varying playback rate to resume the original recording at
    // the same point, rather than restarting its bow attack at a new pitch.
    let offset = 0.35;
    const steps = 512;
    for (let i = 0; i < steps; i++)
      offset += (elapsed / steps) * 2 ** (centsAt((elapsed * (i + 0.5)) / steps) / 1200);
    if (offset >= source.loopEnd)
      offset =
        source.loopStart + ((offset - source.loopStart) % (source.loopEnd - source.loopStart));
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      soften.disconnect();
      gain.disconnect();
      this.sources.delete(cancel);
    };
    const cancel = () => {
      source.stop();
      cleanup();
    };
    source.onended = cleanup;
    this.sources.add(cancel);
    source.start(time, offset);
    source.stop(time + duration + 0.02);
    return {
      cancel,
      retime(at, remaining, progress) {
        // Keep the bow recording running; only replace its future pitch curve.
        holdParam(source.playbackRate, at);
        source.playbackRate.setValueCurveAtTime(
          Float32Array.from(
            { length: 4096 },
            (_, i) =>
              2 **
              ((midi - key + glideOffset(progress + ((1 - progress) * i) / 4095, span, returns)) /
                12)
          ),
          at,
          remaining
        );
        holdParam(gain.gain, at);
        if (remaining > 0.2) {
          gain.gain.linearRampToValueAtTime(velocity, at + Math.min(0.02, (remaining - 0.18) / 2));
          gain.gain.setValueAtTime(velocity, at + remaining - 0.18);
        }
        gain.gain.linearRampToValueAtTime(0, at + remaining);
        source.stop(at + remaining + 0.02);
      },
    } satisfies LiveVoice;
  }
  dispose() {
    for (const cancel of this.sources) cancel();
    this.sources.clear();
  }
}
