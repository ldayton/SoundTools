import { create, attachPanel, type Client } from '@ldayton/browser-diagnostics';
import reporterUrl from '@ldayton/browser-diagnostics/sentry.js?url';
import { PATTERNS, type ExerciseSpec } from './music';

let context: Record<string, unknown> = { view: 'practice' };
export const diagnostics = create({
  app: 'dorego',
  release: __DOREGO_BUILD__,
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  sdkUrl: reporterUrl,
  enabled: import.meta.env.VITE_DEPLOY_ENV === 'production',
  environment: import.meta.env.PROD ? 'production' : 'development',
  fields: {
    mode: ['ready', 'starting', 'playing', 'paused', 'complete'],
    reason: ['audio-interrupted', 'clock-stalled', 'scheduling-gap', 'page-hidden'],
    pattern: Object.keys(PATTERNS),
    bpm: 'number', low: 'number', high: 'number', repetitions: 'number',
    warming: 'boolean', soundFailed: 'boolean',
  },
  snapshot: () => context,
});
export function diagnosticsContext(spec: ExerciseSpec, mode: string, warming: boolean, soundFailed: boolean) {
  context = { view: 'practice', pattern: spec.pattern, bpm: spec.bpm, low: spec.low,
    high: spec.high, repetitions: spec.repetitions, mode, warming, soundFailed };
}
export function mountDiagnostics(parent: HTMLElement) { return attachPanel(diagnostics, parent); }
if (typeof window !== 'undefined') window.doregoDiagnostics = diagnostics;
declare global {
  const __DOREGO_BUILD__: string;
  interface Window { doregoDiagnostics?: Client }
}
