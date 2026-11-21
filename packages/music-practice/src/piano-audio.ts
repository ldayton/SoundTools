import { playbackSample, playbackSamplesFor } from "./playback-samples";
import type {
  PlaybackInstrument,
  PerformanceNote,
} from "./playback-performance";
import { audiblePianoTime } from "./piano-clock";
import { persistence } from "./persistence";
import { diagnostics } from "./diagnostics";
import creditsUrl from "../../../apps/dorego/public/samples/bitklavier-web-v1/NOTICE.txt?url";
export { creditsUrl as pianoCreditsUrl };
// Reuse DoReGo's recorded Steinway samples. Vite fingerprints these assets and
// includes them in each practice app's verified offline pack; no external sound CDN.
const files = import.meta.glob<string>(
  "../../../apps/dorego/public/samples/bitklavier-web-v1/{36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96}-v11-2s.flac",
  { eager: true, query: "?url", import: "default" },
);
const urls = new Map(
  Object.entries(files).map(([path, url]) => [
    Number(path.match(/\/(\d+)-v11-/)![1]),
    url,
  ]),
);
const bytes = new Map<number, Promise<ArrayBuffer>>();
const decoded = new Map<number, Promise<AudioBuffer>>();
let context: AudioContext | undefined;
let output: DynamicsCompressorNode | undefined;
let master: GainNode | undefined;

const volumeListeners = new Set<() => void>();
export function subscribePianoVolume(listener: () => void) {
  volumeListeners.add(listener);
  window.addEventListener("soundtools:ready", listener);
  return () => {
    volumeListeners.delete(listener);
    window.removeEventListener("soundtools:ready", listener);
  };
}
export function getPianoVolume() {
  const saved = persistence.read<{ volume?: number }>("audio")?.volume;
  return typeof saved === "number" && Number.isFinite(saved)
    ? Math.max(0, Math.min(100, saved))
    : 100;
}

export type PianoChannels = "stereo" | "mono";
export function getPianoChannels(): PianoChannels {
  return persistence.read<{ channels?: string }>("audio")?.channels === "mono"
    ? "mono"
    : "stereo";
}
export function setPianoChannels(channels: PianoChannels) {
  if (channels !== "stereo" && channels !== "mono") return;
  persistence.write("audio", {
    ...persistence.read<object>("audio"),
    version: 1,
    channels,
  });
  refreshPianoVolume();
}
function configureChannels(node: GainNode) {
  // As in DoReGo: average L/R into one channel, played through both speakers.
  node.channelInterpretation = "speakers";
  node.channelCountMode = "explicit";
  node.channelCount = getPianoChannels() === "mono" ? 1 : 2;
}
export function setPianoVolume(value: number) {
  if (!Number.isFinite(value)) return;
  const volume = Math.max(0, Math.min(100, value));
  persistence.write("audio", {
    ...persistence.read<object>("audio"),
    version: 1,
    volume,
  });
  refreshPianoVolume();
}
/** Apply an account snapshot to both the controls and an already running audio graph. */
export function refreshPianoVolume() {
  const volume = getPianoVolume();
  volumeListeners.forEach((listener) => listener());
  if (context && master) {
    configureChannels(master);
    master.gain.setTargetAtTime(volume / 100, context.currentTime, 0.015);
  }
}
let epoch = 0;
let warming = false;
let departing = false;
let disabled = false;
let reportedFailure = false;
const voices = new Set<() => void>();
const auditions = new Set<() => void>();
function load(root: number) {
  let pending = bytes.get(root);
  if (!pending) {
    pending = fetch(urls.get(root)!, { signal: AbortSignal.timeout(10000) })
      .then((response) => {
        if (!response.ok)
          throw Object.assign(new Error("Piano sample request failed"), {
            status: response.status,
          });
        return response.arrayBuffer();
      })
      .catch((error) => {
        bytes.delete(root);
        throw error;
      });
    bytes.set(root, pending);
  }
  return pending;
}
/** Warm compressed samples without starting an AudioContext before a user gesture. */
export function preparePianoSound() {
  if (warming) return;
  warming = true;
  const queue = [...urls.keys()];
  for (let worker = 0; worker < 4; worker++)
    void (async () => {
      while (queue.length && !departing) {
        try {
          await load(queue.shift()!);
        } catch {
          /* Stop this worker after a failed/cancelled request, including navigation.
             A deliberate tap retries its sample. */
          return;
        }
      }
    })();
}
function audio() {
  if (!context || context.state === "closed") {
    context = new AudioContext({ latencyHint: "interactive" });
    output = context.createDynamicsCompressor();
    output.threshold.value = -6;
    output.knee.value = 6;
    output.ratio.value = 12;
    output.attack.value = 0.003;
    output.release.value = 0.2;
    master = context.createGain();
    configureChannels(master);
    master.gain.value = getPianoVolume() / 100;
    output.connect(master).connect(context.destination);
  }
  return context;
}
export function playPianoNote(midi: number) {
  return soundPianoNote(midi);
}
/** Release also cancels a press whose sample has not finished loading. */
export function holdPianoNote(midi: number): () => void {
  let released = false;
  let stop: (() => void) | undefined;
  void soundPianoNote(midi, {
    released: () => released,
    started: (release) => {
      stop = release;
    },
  });
  return () => {
    released = true;
    stop?.();
  };
}
async function soundPianoNote(
  midi: number,
  hold?: { released(): boolean; started(stop: () => void): void },
) {
  if (
    disabled ||
    !Number.isInteger(midi) ||
    midi < 36 ||
    midi > 95 ||
    document.hidden
  )
    return;
  const request = epoch;
  try {
    // Create/resume synchronously within the click/Enter gesture, before any fetch.
    const ctx = audio();
    const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    const root = [...urls.keys()].reduce((a, b) =>
      Math.abs(b - midi) < Math.abs(a - midi) ? b : a,
    );
    let buffer = decoded.get(root);
    if (!buffer) {
      buffer = load(root)
        .then((data) => ctx.decodeAudioData(data.slice(0)))
        .catch((error) => {
          decoded.delete(root);
          throw error;
        });
      decoded.set(root, buffer);
    }
    const [sample] = await Promise.all([buffer, resume]);
    if (
      request !== epoch ||
      hold?.released() ||
      document.hidden ||
      ctx.state !== "running"
    )
      return;
    if (auditions.size >= 16) auditions.values().next().value?.();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    source.buffer = sample;
    source.playbackRate.value = 2 ** ((midi - root) / 12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.005);
    if (!hold) {
      gain.gain.setValueAtTime(0.22, now + 0.65);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
    }
    source.connect(gain).connect(output!);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.006);
      source.stop(ctx.currentTime + 0.03);
      voices.delete(stop);
      auditions.delete(stop);
    };
    voices.add(stop);
    auditions.add(stop);
    source.onended = () => {
      voices.delete(stop);
      auditions.delete(stop);
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
    if (!hold) source.stop(now + 1.5);
    hold?.started(stop);
  } catch (error) {
    // A failed sound must never stop grading or create an unhandled rejection.
    if (!reportedFailure) diagnostics.capture(error, "piano_audio.play_failed");
    reportedFailure = true;
  }
}
/** A prepared, cancellable audio-clock output for score playback. */
const performanceBuffers = new Map<string, Promise<AudioBuffer>>();
export async function preparePianoPlayback(
  pitches: number[],
  instrument: PlaybackInstrument = "piano",
  notes?: readonly PerformanceNote[],
) {
  if (disabled) throw new Error("Audio stopped after a display error");
  const ctx = audio();
  const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
  const needed = notes
    ? [
        ...new Map(
          notes.map((note) => {
            const sample = playbackSample(
              instrument,
              note.pitch,
              note.volume,
              note.string,
            );
            return [sample.url, sample] as const;
          }),
        ).values(),
      ]
    : playbackSamplesFor(instrument, pitches);
  const samples = new Map<string, AudioBuffer>();
  await Promise.all([
    resume,
    ...needed.map(async (sample) => {
      let pending = performanceBuffers.get(sample.url);
      if (!pending) {
        pending = fetch(sample.url, { signal: AbortSignal.timeout(10000) })
          .then((response) => {
            if (!response.ok)
              throw new Error(
                `Instrument sample request failed: ${response.status}`,
              );
            return response.arrayBuffer();
          })
          .then((data) => ctx.decodeAudioData(data))
          .catch((error) => {
            performanceBuffers.delete(sample.url);
            throw error;
          });
        performanceBuffers.set(sample.url, pending);
      }
      samples.set(sample.url, await pending);
    }),
  ]);
  const owned = new Set<() => void>();
  return {
    get now() {
      return ctx.currentTime;
    },
    get audibleNow() {
      return audiblePianoTime(ctx, performance.now());
    },
    get running() {
      return !disabled && ctx.state === "running" && !document.hidden;
    },
    schedule(
      midi: number,
      when: number,
      duration: number,
      volume = 1,
      string = -1,
      delay = 0,
      attackGain = 1,
    ) {
      if (disabled) return;
      const sample = playbackSample(
          instrument,
          midi,
          volume,
          string < 0 ? undefined : string,
        ),
        source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = samples.get(sample.url)!;
      source.playbackRate.value = 2 ** ((midi - sample.pitch) / 12);
      // Recorded layers already carry their own dynamics; retain gentle level shaping.
      const level =
        (instrument === "guitar" ? 0.34 : 1.2) *
        Math.sqrt(Math.max(0, Math.min(1, volume))) *
        attackGain;
      // Preserve the recorded decay; release early when the written note ends.
      const writtenEnd = when + Math.max(0.02, duration);
      // A short physical release replaces the old hard gate; no automatic pedal over rests.
      const release = instrument === "piano" ? 0.12 : 0.045;
      when += Math.min(delay, Math.max(0, duration - 0.015));
      const end = Math.max(when + 0.02, writtenEnd) + release;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(level, when + 0.005);
      gain.gain.setValueAtTime(level, Math.max(when + 0.005, writtenEnd));
      gain.gain.linearRampToValueAtTime(0, end);
      source.connect(gain).connect(output!);
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.006);
        source.stop(ctx.currentTime + 0.03);
        voices.delete(stop);
        owned.delete(stop);
      };
      owned.add(stop);
      voices.add(stop);
      source.onended = () => {
        owned.delete(stop);
        voices.delete(stop);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when);
      source.stop(end + 0.01);
    },
    click(when: number, accent: boolean) {
      if (disabled) return;
      const source = ctx.createOscillator(),
        gain = ctx.createGain();
      source.frequency.value = accent ? 1200 : 850;
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(accent ? 0.22 : 0.15, when + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
      source.connect(gain).connect(output!);
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.003);
        source.stop(ctx.currentTime + 0.02);
        owned.delete(stop);
        voices.delete(stop);
      };
      owned.add(stop);
      voices.add(stop);
      source.onended = () => {
        owned.delete(stop);
        voices.delete(stop);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when);
      source.stop(when + 0.06);
    },
    stop() {
      for (const stop of [...owned]) stop();
    },
  };
}
export function shutdownPianoSound() {
  disabled = true;
  departing = true;
  stopPiano();
}
function stopPiano() {
  epoch++;
  for (const stop of [...voices]) stop();
  void context?.suspend().catch(() => {});
}
window.addEventListener("pagehide", () => {
  departing = true;
  stopPiano();
});
window.addEventListener("pageshow", () => {
  departing = false;
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPiano();
});
