import { secondsAt, metronomeBeat, type Exercise } from './music';

export type AudioEvent = {
  kind: 'note' | 'click' | 'glide';
  id: string;
  onsetBeat: number;
  endBeat: number;
  glide?: { midi: number; span: number; duration: number; returns?: boolean };
  time: number;
  duration: number;
  elapsed: number;
  frequency: number;
  velocity: number;
};
// Relative to the seek position, with an offset into an already-sounding note.
export function audioEvents(exercise: Exercise, offset: number): AudioEvent[] {
  const { bpm, countIn, metronome } = exercise.spec;
  const events: AudioEvent[] = [];
  for (const note of exercise.notes) {
    const start = secondsAt(note.onsetBeat, bpm);
    const end = secondsAt(note.onsetBeat + note.durationBeats, bpm);
    if (end <= offset) continue;
    events.push({
      kind: note.glideSpan ? 'glide' : 'note',
      id: `note:${note.id}`,
      onsetBeat: note.onsetBeat,
      endBeat: note.onsetBeat + note.durationBeats,
      ...(note.glideSpan
        ? {
            glide: {
              midi: note.midi,
              span: note.glideSpan,
              duration: end - start,
              returns: note.glideReturns,
            },
          }
        : {}),
      time: Math.max(0, start - offset),
      duration: end - Math.max(start, offset),
      elapsed: Math.max(0, offset - start),
      frequency: 440 * 2 ** ((note.midi - 69) / 12),
      velocity: note.velocity ?? 0.7,
    });
  }
  for (let beat = 0; beat < exercise.totalBeats; beat++) {
    const time = secondsAt(beat, bpm);
    if (time < offset || (beat >= countIn && !metronome)) continue;
    const click = metronomeBeat(beat, countIn);
    events.push({
      kind: 'click',
      id: `click:${beat}`,
      onsetBeat: beat,
      endBeat: beat + (0.025 * bpm) / 60,
      time: time - offset,
      duration: 0.025,
      elapsed: 0,
      frequency: click.frequency,
      velocity: click.velocity,
    });
  }
  return events.sort((a, b) => a.time - b.time);
}
