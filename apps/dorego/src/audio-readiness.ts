export type AudioFailure = 'resume_timeout' | 'resume_rejected' | 'not_running' | 'clock_stalled';
export class AudioReadinessError extends Error {
  constructor(
    public readonly failure: AudioFailure,
    options?: ErrorOptions
  ) {
    super('Audio did not restart. Tap Resume or a piano note to try again.', options);
    this.name = 'AudioReadinessError';
  }
}
/** Resume with a deadline. Optional clock probes require an already scheduled source. */
export async function verifyAudioReady(
  context: { readonly state: string; readonly currentTime: number },
  resume: () => Promise<void>,
  current: () => boolean,
  { timeoutMs = 1500, probeMs = 1500 } = {}
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Invoke synchronously, while the caller still owns the Play user gesture.
    await Promise.race([
      resume(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AudioReadinessError('resume_timeout')), timeoutMs);
      }),
    ]);
  } catch (cause) {
    if (!current()) return false;
    if (cause instanceof AudioReadinessError) throw cause;
    throw new AudioReadinessError('resume_rejected', { cause });
  } finally {
    clearTimeout(timer);
  }
  if (!current()) return false;
  if (context.state !== 'running') throw new AudioReadinessError('not_running');
  if (probeMs === 0) return true;
  const before = context.currentTime;
  // Explicit clock measurement; this is not a readiness sleep or an audibility test.
  await new Promise((resolve) => setTimeout(resolve, probeMs));
  if (!current()) return false;
  if (context.state !== 'running') throw new AudioReadinessError('not_running');
  if (context.currentTime - before < 0.005) throw new AudioReadinessError('clock_stalled');
  return true;
}
