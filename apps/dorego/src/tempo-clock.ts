// Keep musical position separate from elapsed wall time. Retain past segments
// so the audible-output timestamp still maps correctly across a tempo change.
export class TempoClock {
  private segments: { time: number; beat: number; bpm: number }[];
  constructor(time: number, beat: number, bpm: number) {
    this.segments = [{ time, beat, bpm }];
  }
  beatAt(time: number) {
    let index = this.segments.length - 1;
    while (index > 0 && this.segments[index].time > time) index--;
    const segment = this.segments[index];
    return segment.beat + (Math.max(0, time - segment.time) * segment.bpm) / 60;
  }
  timeAt(beat: number) {
    const segment = this.segments.at(-1)!;
    return segment.time + ((beat - segment.beat) * 60) / segment.bpm;
  }
  setTempo(time: number, bpm: number) {
    const first = this.segments[0];
    if (time <= first.time) {
      first.bpm = bpm;
      return;
    }
    const beat = this.beatAt(time);
    this.segments.push({ time, beat, bpm });
  }
}
export interface LiveVoice {
  cancel(): void;
  retime(time: number, remaining: number, progress: number): void;
}
export function holdParam(param: AudioParam, time: number) {
  const value = param.value;
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time);
  else {
    param.cancelScheduledValues(0);
    param.setValueAtTime(value, time);
  }
}
