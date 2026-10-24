export type PlaybackInterruption =
  'audio-interrupted' | 'clock-stalled' | 'scheduling-gap' | 'page-hidden';

// Detect loss of scheduling coverage separately from visibility. A sustained
// voice or a rest can safely span a long timer delay without missing any notes.
export class PlaybackHealth {
  private progressWall: number;
  constructor(
    private audio: number,
    wall: number
  ) {
    this.progressWall = wall;
  }
  check(audio: number, wall: number, nextUnscheduled = Infinity) {
    const previousAudio = this.audio;
    if (audio > previousAudio + 0.005) this.progressWall = wall;
    const missed = audio - previousAudio > 1 && nextUnscheduled < audio - 0.04;
    const stalled = wall - this.progressWall >= 1500;
    this.audio = audio;
    if (missed || stalled)
      return {
        reason: missed ? ('scheduling-gap' as const) : ('clock-stalled' as const),
        audioTime: previousAudio,
      };
  }
}
