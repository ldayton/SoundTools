import { breathAt, type BreathSnapshot } from './breath-squares';

/** A short audio-clock lookahead keeps second boundaries independent of rendering. */
export function upcomingSeconds(position: number, duration: number, next: number) {
  const seconds: number[] = [];
  // A delayed callback must never replay a burst of missed ticks.
  next = Math.max(next, Math.ceil(position - 0.04));
  while (next <= duration && next <= position + 0.15) seconds.push(next++);
  return { seconds, next };
}

export class BreathMetronome {
  private context?: AudioContext;
  private output?: GainNode;
  private voices = new Set<() => void>();
  private mode: BreathSnapshot['mode'] = 'ready';
  private next = 0;
  private origin = 0;
  private generation = 0;
  private resumeTimer?: ReturnType<typeof setTimeout>;
  private level?: number;
  private running = false;
  constructor(
    private volume: () => number,
    private ready: (clock: () => number) => void,
    private failed: (error: unknown) => void,
    private createContext = () => new AudioContext({ latencyHint: 'interactive' })
  ) {}
  private contextChanged = () => {
    if (this.running && this.mode === 'playing' && this.context?.state !== 'running')
      this.fail(new Error('Breathing audio interrupted'));
  };
  private fail(error: unknown) {
    this.dispose();
    this.failed(error);
  }
  private cancel() {
    ++this.generation;
    clearTimeout(this.resumeTimer);
    for (const stop of [...this.voices]) stop();
  }
  private start() {
    if (!this.context || this.context.state === 'closed') {
      const context = this.createContext();
      this.context = context;
      this.output = context.createGain();
      this.output.connect(context.destination);
      this.level = undefined;
      context.addEventListener('statechange', this.contextChanged);
    }
    const context = this.context,
      generation = ++this.generation;
    // Called synchronously by the Play button/Space gesture, including Safari.
    this.resumeTimer = setTimeout(() => {
      if (this.generation === generation) this.fail(new Error('Breathing audio start timed out'));
    }, 2500);
    void context.resume().then(
      () => {
        if (this.generation !== generation) return;
        clearTimeout(this.resumeTimer);
        if (context.state !== 'running') return this.fail(new Error('Breathing audio unavailable'));
        this.running = true;
        this.ready(() => context.currentTime * 1000);
      },
      (error) => {
        if (this.generation === generation) this.fail(error);
      }
    );
  }
  sync(state: BreathSnapshot) {
    const previous = this.mode;
    this.mode = state.mode;
    if (state.mode === 'starting') {
      if (previous !== 'starting') {
        try {
          this.cancel();
          this.start();
        } catch (error) {
          this.fail(error);
        }
      }
      return;
    }
    if (state.mode !== 'playing') {
      // Let the already-scheduled final tick finish; pause/reset cancel immediately.
      if (state.mode !== 'complete') this.cancel();
      return;
    }
    try {
      if (previous !== 'playing') {
        this.next = state.position === 0 ? 0 : Math.floor(state.position) + 1;
        this.origin = this.context!.currentTime - state.position;
      }
      const context = this.context!;
      const level = this.volume();
      if (level !== this.level) {
        const gain = this.output!.gain,
          amplitude = level <= -60 ? 0 : 10 ** (level / 20);
        if (this.level === undefined || previous !== 'playing' || amplitude === 0) {
          gain.cancelScheduledValues(context.currentTime);
          gain.setValueAtTime(amplitude, context.currentTime);
        } else gain.setTargetAtTime(amplitude, context.currentTime, 0.01);
        this.level = level;
      }
      const upcoming = upcomingSeconds(state.position, breathAt(state).duration, this.next);
      this.next = upcoming.next;
      for (const second of upcoming.seconds)
        this.click(Math.max(context.currentTime + 0.01, this.origin + second));
    } catch (error) {
      this.fail(error);
    }
  }
  private click(at: number) {
    const context = this.context!;
    const source = context.createOscillator(),
      gain = context.createGain();
    source.frequency.value = 1400;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.21, at + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.00001, at + 0.04);
    source.connect(gain).connect(this.output!);
    let stopped = false;
    const clean = () => {
      source.onended = null;
      source.disconnect();
      gain.disconnect();
      this.voices.delete(stop);
    };
    const stop = () => {
      if (!stopped) {
        stopped = true;
        try {
          source.stop();
        } catch {
          /* A failed start has no active source. */
        }
        clean();
      }
    };
    source.onended = clean;
    this.voices.add(stop);
    source.start(at);
    source.stop(at + 0.045);
  }
  dispose() {
    this.mode = 'ready';
    this.running = false;
    this.cancel();
    this.context?.removeEventListener('statechange', this.contextChanged);
    this.output?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.output = undefined;
  }
}
