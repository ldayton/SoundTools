import * as Tone from 'tone';
import { AudioReadinessError, verifyAudioReady } from './audio-readiness';

export const audioDiagnosticFields = {
  audioFailure: ['resume_timeout', 'resume_rejected', 'not_running', 'clock_stalled'],
  audioRecovery: ['needed', 'context_replaced', 'engine_running'],
  clockAdvanced: 'boolean',
} as const;
export let playbackContext: AudioContext | undefined;
let replaceContext = false;
let clockAdvanced = false;
let recovery: string | undefined;
let clockAnchor = 0;
let referenceProbe: Promise<void> | undefined;
export function liveAudioSnapshot() {
  return {
    audioState: playbackContext?.state || 'unavailable',
    clockAdvanced,
    audioRecovery: recovery,
  };
}
export function audioFailureDetails(error: unknown) {
  return {
    ...liveAudioSnapshot(),
    ...(error instanceof AudioReadinessError ? { audioFailure: error.failure } : {}),
  };
}
function report(code: string) {
  if (typeof window !== 'undefined') window.doregoDiagnostics?.event(code, liveAudioSnapshot());
}
export function invalidateAudioProbe() {
  clockAdvanced = false;
  clockAnchor = playbackContext?.currentTime || 0;
}
export function observeAudioClock(time: number) {
  if (time - clockAnchor < 0.005) return;
  clockAdvanced = true;
  if (recovery === 'context_replaced') {
    recovery = 'engine_running';
    report('audio.engine_running');
  }
}
/** Only probe after a source is scheduled: an idle context may not tick yet. */
export function checkReferenceClock(current: () => boolean, failed: (error: unknown) => void) {
  const context = playbackContext;
  if (!context || clockAdvanced || referenceProbe) return;
  referenceProbe = verifyAudioReady(
    context,
    async () => {},
    () => current() && playbackContext === context,
    { probeMs: 1500 }
  )
    .then((ready) => {
      if (ready) observeAudioClock(context.currentTime);
    })
    .catch((error) => {
      if (current() && playbackContext === context) {
        markAudioUnhealthy();
        failed(error);
      }
    })
    .finally(() => {
      referenceProbe = undefined;
    });
}
const stateChanged = () => {
  if (playbackContext?.state !== 'running') invalidateAudioProbe();
  report('audio.context_state');
};
export function initPlayback(recover = false) {
  if (!playbackContext || playbackContext.state === 'closed' || (recover && replaceContext)) {
    const old = playbackContext;
    old?.removeEventListener('statechange', stateChanged);
    // Rebuild from a user action after failure; never loop contexts in the background.
    const context = new Tone.Context({ latencyHint: 'playback', lookAhead: 0.15 });
    playbackContext = context.rawContext as AudioContext;
    Tone.setContext(context, true);
    replaceContext = false;
    clockAdvanced = false;
    clockAnchor = playbackContext.currentTime;
    recovery = old ? 'context_replaced' : undefined;
    playbackContext.addEventListener('statechange', stateChanged);
    if (old) report('audio.context_replaced');
  }
  return playbackContext;
}
export function markAudioUnhealthy() {
  replaceContext = true;
  clockAdvanced = false;
  recovery = 'needed';
}
export async function startLiveAudio(current: () => boolean = () => true) {
  const context = initPlayback(true);
  const ownsContext = () => current() && playbackContext === context;
  const started = performance.now();
  try {
    const ready = await verifyAudioReady(context, () => Tone.start(), ownsContext, { probeMs: 0 });
    if (!ready) return false;
    // Active playback/reference sources perform the clock check. A healthy idle
    // context may report running before its rendering clock starts advancing.
    return true;
  } catch (error) {
    if (!ownsContext()) return false;
    markAudioUnhealthy();
    throw error;
  } finally {
    if (ownsContext() && typeof window !== 'undefined')
      window.doregoDiagnostics?.metric('audio.startup_check_ms', performance.now() - started);
  }
}
