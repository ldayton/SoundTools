import { createResources } from '@ldayton/browser-offline';
const resources = createResources();
import { holdParam, type LiveVoice } from './tempo-clock';
import * as Tone from 'tone';
import { BITKLAVIER_SAMPLES } from './bitklavier-samples';
import type { Exercise } from './music';
import { sampleLoader } from './sample-loader';

const buffers = new Map<string, AudioBuffer>();
export function pianoRegion(midi: number, velocity: number) {
  const layer = Math.max(1, Math.min(16, Math.ceil(velocity * 16)));
  const samples = BITKLAVIER_SAMPLES.filter((sample) => sample.layer === layer);
  const region = samples.reduce((best, sample) =>
    Math.abs(sample.midi - midi) < Math.abs(best.midi - midi) ? sample : best
  );
  return { ...region, folder: 'bitklavier' };
}
// Versioned, lossless web variants avoid downloading and decoding unused tails.
// Custom longer CLI notes fall back to the unmodified original recordings.
export function pianoFile(midi: number, layer: number, file: string, needed: number) {
  if ((layer === 11 || layer === 12) && needed <= 5)
    return `bitklavier-web-v1/${midi}-v${layer}-${needed <= 2 ? 2 : 5}s.flac`;
  return `bitklavier/${file}`;
}
const CACHE_BYTES = 128 * 1024 * 1024;
let preloadGeneration = 0;
// Playback resolves the prepared variant by original region name.
const prepared = new Map<string, string>();
export async function preloadSteinway(exercise: Exercise) {
  const generation = ++preloadGeneration;
  const regions = new Map<string, { midi: number; layer: number; file: string; needed: number }>();
  for (const n of exercise.notes) {
    if (n.glideSpan) continue;
    const r = pianoRegion(n.midi, n.velocity ?? 0.7);
    const name = `${r.folder}/${r.file}`;
    const needed = Math.ceil(
      ((n.durationBeats * 60) / exercise.spec.bpm + 0.5) * 2 ** ((n.midi - r.midi) / 12)
    );
    if (needed > (regions.get(name)?.needed ?? 0)) regions.set(name, { ...r, needed });
  }
  const files = new Map(
    [...regions].map(([name, r]) => {
      let path = pianoFile(r.midi, r.layer, r.file, r.needed);
      // A longer prepared variant also covers short notes; reuse it when switching
      // exercises instead of downloading another representation of the same sound.
      if (r.needed <= 2 && (r.layer === 11 || r.layer === 12)) {
        const longer = pianoFile(r.midi, r.layer, r.file, 5);
        if (buffers.has(longer) || sampleLoader.has(longer)) path = longer;
      }
      return [
        name,
        {
          path,
          needed: r.needed,
          cacheKey: path.startsWith('bitklavier/') ? `${path}#${r.needed}` : path,
        },
      ];
    })
  );
  sampleLoader.select(
    'piano',
    [...files.values()].map((f) => f.cacheKey)
  );
  await Promise.all(
    [...files].map(async ([name, { path, cacheKey, needed }]) => {
      if (!buffers.has(cacheKey)) {
        const retained = await sampleLoader.load(cacheKey, async (signal) => {
          const encoded = await resources.fetchBytes(`${import.meta.env.BASE_URL}samples/${path}`, { signal, timeoutMs:15000, idleMs:5000, attempts:2 });
          signal.throwIfAborted();
          const context = Tone.getContext();
          const decoded = await context.decodeAudioData(encoded);
          signal.throwIfAborted();
          if (!path.startsWith('bitklavier/')) return decoded;
          // Long custom CLI notes still use originals, retaining only the
          // necessary prefix rather than keeping an entire long recording.
          const frames = Math.min(decoded.length, Math.ceil(needed * decoded.sampleRate));
          if (frames === decoded.length) return decoded;
          const retained = context.createBuffer(
            decoded.numberOfChannels,
            frames,
            decoded.sampleRate
          );
          for (let ch = 0; ch < decoded.numberOfChannels; ch++)
            retained.copyToChannel(decoded.getChannelData(ch).subarray(0, frames), ch);
          return retained;
        });
        buffers.set(cacheKey, retained);
      }
      if (generation !== preloadGeneration) return;
      prepared.set(name, cacheKey);
      const buffer = buffers.get(cacheKey)!;
      buffers.delete(cacheKey);
      buffers.set(cacheKey, buffer);
    })
  );
  if (generation !== preloadGeneration) return;
  const required = new Set([...files.values()].map((f) => f.cacheKey));
  let bytes = [...buffers.values()].reduce((sum, b) => sum + b.length * b.numberOfChannels * 4, 0);
  for (const [file, buffer] of buffers) {
    if (bytes <= CACHE_BYTES) break;
    if (required.has(file)) continue;
    buffers.delete(file);
    bytes -= buffer.length * buffer.numberOfChannels * 4;
  }
}
export class SteinwayGrand {
  private sources = new Set<() => void>();
  constructor(private destination: Tone.Volume) {}
  triggerAttackRelease(
    frequency: number,
    duration: number,
    time: number,
    velocity: number,
    elapsed = 0
  ) {
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    const region = pianoRegion(midi, velocity);
    const buffer = buffers.get(prepared.get(`${region.folder}/${region.file}`) ?? '');
    if (!buffer) throw new Error('The piano samples are not ready.');
    const context = this.destination.context;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const rate = 2 ** ((midi - region.midi) / 12);
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(gain);
    Tone.connect(gain, this.destination);
    // All envelope and stop events run on the audio clock, including offline.
    // Native ended fires after the actual stop, unlike Tone's early JS callback.
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(velocity, time + Math.min(0.002, duration / 2));
    gain.gain.setValueAtTime(velocity, time + duration);
    gain.gain.exponentialRampToValueAtTime(0.00001, time + duration + 0.35);
    gain.gain.linearRampToValueAtTime(0, time + duration + 0.36);
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
      this.sources.delete(cancel);
    };
    const cancel = () => {
      source.stop();
      cleanup();
    };
    source.onended = cleanup;
    this.sources.add(cancel);
    source.start(time, Math.min(elapsed * rate, buffer.duration));
    source.stop(time + duration + 0.36);
    return {
      cancel,
      retime(at, remaining) {
        holdParam(gain.gain, at);
        gain.gain.linearRampToValueAtTime(velocity, at + Math.min(0.002, remaining / 2));
        gain.gain.setValueAtTime(velocity, at + remaining);
        gain.gain.exponentialRampToValueAtTime(0.00001, at + remaining + 0.35);
        gain.gain.linearRampToValueAtTime(0, at + remaining + 0.36);
        source.stop(at + remaining + 0.36);
      },
    } satisfies LiveVoice;
  }
  dispose() {
    for (const cancel of this.sources) cancel();
    this.sources.clear();
  }
}
