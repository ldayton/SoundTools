import workletURL from './voice-capture.js?url';
import { createViewState } from '@ldayton/ui/view-state';
import { guideAt, RibbonTracker } from './voice-ribbon-model';
import { practiceAt, type Exercise } from './music';

type Client = { init(): Promise<unknown>; dispose(): void };
type Stream = { push(pcm: Float32Array, time: number): Promise<void>; dispose(): void };
type EngineGlobals = typeof globalThis & {
  PraatClient: new (options: { workerURL: string }) => Client;
  PraatStream: new (options: Record<string, unknown>) => Stream;
};
let scripts: Promise<void> | undefined;
function loadEngine() {
  return (scripts ||= (async () => {
    for (const file of ['client.js', 'praat-stream.js'])
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = import.meta.env.BASE_URL + 'pitch-engine/' + file;
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          reject(Error('Could not load voice feedback. Turn it off and on to retry.'));
        };
        document.head.append(script);
      });
  })().catch((error) => {
    scripts = undefined;
    throw error;
  }));
}
let saved = false;
try {
  saved = localStorage.getItem('dorego.voiceFeedback') === 'true';
} catch {}
export const voiceFeedbackState = createViewState({ enabled: saved, error: '', revision: 0 });
const tracker = new RibbonTracker();
export const voiceFeedbackPoints = () => tracker.points;
let sessionOwner = 0;
function audioSession(type: string) {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = type;
  } catch {}
}
let active: { close(): void } | undefined,
  generation = 0,
  starting = false,
  failed = false;
let exercise: Exercise | undefined,
  round = -1,
  running = false;
let anchors: { time: number; beat: number }[] = [];

function publish(error = voiceFeedbackState.getSnapshot().error) {
  const state = voiceFeedbackState.getSnapshot();
  voiceFeedbackState.set({ ...state, error, revision: state.revision + 1 });
}
function stop() {
  generation++;
  starting = false;
  active?.close();
  active = undefined;
  anchors = [];
  tracker.gap();
}
export function setVoiceFeedback(enabled: boolean) {
  try {
    localStorage.setItem('dorego.voiceFeedback', String(enabled));
  } catch {}
  stop();
  failed = false;
  tracker.reset();
  voiceFeedbackState.set({
    enabled,
    error: '',
    revision: voiceFeedbackState.getSnapshot().revision + 1,
  });
}
export function resetVoiceFeedback() {
  stop();
  tracker.reset();
  publish();
}
export function shutdownVoiceFeedback() {
  running = false;
  stop();
}

/** Anchors use the player's audible beat, not worker arrival time or scheduled audio. */
export function syncVoiceFeedback(next: Exercise, position: number, playing: boolean) {
  const beat = (position * next.spec.bpm) / 60;
  const nextRound = practiceAt(next, position).current.id;
  const previous = anchors.at(-1);
  if (
    (exercise &&
      exercise !== next &&
      (exercise.notes !== next.notes || exercise.rounds !== next.rounds)) ||
    (previous && (beat < previous.beat - 0.02 || beat - previous.beat > 1))
  ) {
    stop();
    tracker.reset();
    round = -1;
    failed = false;
  }
  exercise = next;
  if (round !== nextRound) {
    round = nextRound;
    tracker.reset();
    publish();
  }
  running = playing && voiceFeedbackState.getSnapshot().enabled;
  if (!running) {
    if (active || starting) stop();
    return;
  }
  anchors.push({ time: performance.now(), beat });
  while (anchors.length > 1 && anchors[0].time < performance.now() - 3000) anchors.shift();
  if (!active && !starting && !failed) void start();
}
async function start() {
  const token = ++generation;
  starting = true;
  let mic: MediaStream | undefined,
    context: AudioContext | undefined,
    stream: Stream | undefined,
    client: Client | undefined;
  let node: AudioWorkletNode | undefined, source: MediaStreamAudioSourceNode | undefined;
  const close = () => {
    if (node) node.port.onmessage = null;
    source?.disconnect();
    node?.disconnect();
    mic?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (sessionOwner === token) {
      sessionOwner = 0;
      audioSession('playback');
    }
    stream?.dispose();
    client?.dispose();
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  };
  // Install teardown before any async permission/load boundary.
  active = { close };
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error('Voice feedback needs microphone access in a secure browser.');
    sessionOwner = token;
    audioSession('play-and-record');
    mic = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (token !== generation) {
      close();
      return;
    }
    context = new AudioContext({ latencyHint: 'interactive' });
    await Promise.all([loadEngine(), context.audioWorklet.addModule(workletURL), context.resume()]);
    if (token !== generation) {
      close();
      return;
    }
    const engine = globalThis as EngineGlobals;
    client = new engine.PraatClient({
      workerURL: import.meta.env.BASE_URL + 'pitch-engine/worker.js?profile=release',
    });
    await client.init();
    if (token !== generation) {
      close();
      return;
    }
    const ctx = context;
    stream = new engine.PraatStream({
      client,
      sampleRate: ctx.sampleRate,
      retain: false,
      settings: () => ({
        analysisFlags: 2,
        pitchFloor: 50,
        pitchCeiling: 1200,
        pitchMethod: 'corroborated',
        maximumFrequency: 1000,
      }),
      onFrames: (
        _: unknown,
        result: { features: { time: number; pitch: number; strength: number }[] }
      ) => {
        if (token !== generation || !running || !exercise) return;
        const now = performance.now();
        for (const frame of result.features) {
          const time = now - (ctx.currentTime - frame.time) * 1000;
          const index = anchors.findIndex((anchor) => anchor.time >= time);
          if (index < 1) {
            tracker.gap();
            continue;
          }
          const a = anchors[index - 1],
            b = anchors[index];
          if (b.time - a.time > 150) {
            tracker.gap();
            continue;
          }
          const beat = a.beat + ((b.beat - a.beat) * (time - a.time)) / (b.time - a.time);
          const range = exercise.rounds[round];
          if (
            !range ||
            beat < range.onsetBeat ||
            beat >= range.endBeat ||
            !guideAt(exercise, beat)
          ) {
            tracker.gap();
            continue;
          }
          tracker.push(frame.time, beat, frame.pitch, frame.strength);
        }
        publish();
      },
      onError: (error: Error) => fail(error),
    });
    source = ctx.createMediaStreamSource(mic);
    node = new AudioWorkletNode(ctx, 'dorego-voice-capture');
    node.port.onmessage = ({ data }) => {
      if (token === generation) void stream?.push(data.pcm, data.start)?.catch(fail);
    };
    ctx.onstatechange = () => {
      if (ctx.state !== 'running' && token === generation)
        fail(Error('Microphone paused. Turn voice feedback off and on to retry.'));
    };
    node.onprocessorerror = () =>
      fail(Error('Microphone processing stopped. Turn voice feedback off and on to retry.'));
    for (const track of mic.getTracks())
      track.onended = () =>
        fail(Error('Microphone disconnected. Turn voice feedback off and on to retry.'));
    source.connect(node);
    node.connect(ctx.destination);
    starting = false;
    publish('');
  } catch (error) {
    if (token === generation) fail(error);
    else close();
  }
  function fail(error: unknown) {
    if (token !== generation) return;
    stop();
    failed = true;
    publish(
      error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser, then turn voice feedback off and on.'
        : error instanceof Error
          ? error.message
          : 'Voice feedback is unavailable.'
    );
  }
}
window.addEventListener('pagehide', shutdownVoiceFeedback);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) shutdownVoiceFeedback();
});
