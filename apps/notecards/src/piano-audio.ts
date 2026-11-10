import { persistence } from "./persistence";
import { diagnostics } from "./diagnostics";
import creditsUrl from "../../dorego/public/samples/bitklavier-web-v1/NOTICE.txt?url";
export { creditsUrl as pianoCreditsUrl };
// Reuse DoReGo's recorded Steinway samples. Vite fingerprints these assets and
// includes them in Note by Note's verified offline pack; no external sound CDN.
const files = import.meta.glob<string>(
  "../../dorego/public/samples/bitklavier-web-v1/{36,39,42,45,48,51,54,57,60,63,66,69,72,75,78,81,84,87,90,93,96}-v11-2s.flac",
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

export function getPianoVolume() {
  const saved = persistence.read<{ volume?: number }>("audio")?.volume;
  return typeof saved === "number" && Number.isFinite(saved)
    ? Math.max(0, Math.min(100, saved))
    : 100;
}

export function setPianoVolume(value: number) {
  if (!Number.isFinite(value)) return;
  const volume = Math.max(0, Math.min(100, value));
  persistence.write("audio", { version: 1, volume });
  if (context && master) {
    master.gain.setTargetAtTime(volume / 100, context.currentTime, 0.015);
  }
}
let epoch = 0;
let warming = false;
let departing = false;
let reportedFailure = false;
const voices = new Set<() => void>();
function load(root: number) {
  let pending = bytes.get(root);
  if (!pending) {
    pending = fetch(urls.get(root)!, { signal: AbortSignal.timeout(10000) })
      .then((response) => {
        if (!response.ok)
          throw Error(`Piano sample request failed (${response.status})`);
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
    master.gain.value = getPianoVolume() / 100;
    output.connect(master).connect(context.destination);
  }
  return context;
}
export async function playPianoNote(midi: number) {
  if (!Number.isInteger(midi) || midi < 36 || midi > 95 || document.hidden)
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
    if (request !== epoch || document.hidden || ctx.state !== "running") return;
    if (voices.size >= 8) voices.values().next().value?.();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    source.buffer = sample;
    source.playbackRate.value = 2 ** ((midi - root) / 12);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.005);
    gain.gain.setValueAtTime(0.22, now + 0.65);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
    source.connect(gain).connect(output!);
    const stop = () => {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.006);
      source.stop(ctx.currentTime + 0.03);
      voices.delete(stop);
    };
    voices.add(stop);
    source.onended = () => {
      voices.delete(stop);
      source.disconnect();
      gain.disconnect();
    };
    source.start(now);
    source.stop(now + 1.5);
  } catch (error) {
    // A failed sound must never stop grading or create an unhandled rejection.
    if (!reportedFailure) diagnostics.capture(error, "piano_audio.play_failed");
    reportedFailure = true;
  }
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
