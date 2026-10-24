import * as MidiModule from '@tonejs/midi';
import { glideOffset, metronomeBeat, type Exercise } from './music';

// The package exposes a UMD default in Node and named ESM exports in bundlers.
export const { Midi } = (Reflect.get(MidiModule, 'default') ?? MidiModule) as typeof MidiModule;

export function exportMidi(exercise: Exercise): Uint8Array {
  const midi = new Midi();
  midi.header.name = exercise.title ?? 'DoReGo vocal exercise';
  midi.header.setTempo(exercise.spec.bpm);
  const ppq = midi.header.ppq;
  const track = midi.addTrack();
  track.name = 'Guide notes';
  track.instrument.number = 0;
  const glides = exercise.notes.filter((n) => n.glideSpan);
  const cello = glides.length ? midi.addTrack() : null;
  if (cello) {
    cello.name = 'Cello glides';
    cello.channel = 1;
    cello.instrument.number = 42;
    // RPN 0: a 12-semitone bend range, followed by a null RPN selection.
    for (const [number, value] of [
      [101, 0],
      [100, 0],
      [6, 12 / 127],
      [38, 0],
      [101, 1],
      [100, 1],
    ])
      cello.addCC({ number, value, ticks: 0 });
  }
  for (const n of exercise.notes) {
    const target = n.glideSpan ? cello! : track;
    target.addNote({
      midi: n.midi,
      ticks: Math.round(n.onsetBeat * ppq),
      durationTicks: Math.round(n.durationBeats * ppq),
      velocity: n.velocity ?? 0.78,
    });
    if (n.glideSpan) {
      // This library encoder takes raw signed bend units; its parser returns a fraction.
      const steps = Math.ceil(((n.durationBeats * 60) / exercise.spec.bpm) * 100);
      for (let i = 0; i <= steps; i++)
        cello!.addPitchBend({
          ticks: Math.round((n.onsetBeat + (n.durationBeats * i) / steps) * ppq),
          value: Math.round((glideOffset(i / steps, n.glideSpan, n.glideReturns) / 12) * 8191),
        });
      // Reset after note-off, so a one-way glide never audibly bends back.
      if (n.glideSpan < 0 || n.glideReturns === false)
        cello!.addPitchBend({
          ticks: Math.round((n.onsetBeat + n.durationBeats) * ppq) + 1,
          value: 0,
        });
    }
  }
  // A timed all-notes-off preserves the full final slot in MIDI players, even
  // when articulation makes the final sounding note shorter than that slot.
  track.addCC({ number: 123, ticks: Math.round(exercise.totalBeats * ppq), value: 0 });
  if (exercise.spec.countIn || exercise.spec.metronome) {
    const click = midi.addTrack();
    click.name = 'Count-in & metronome';
    click.channel = 9;
    for (let beat = 0; beat < exercise.totalBeats; beat++)
      if (beat < exercise.spec.countIn || exercise.spec.metronome)
        click.addNote({
          midi: metronomeBeat(beat, exercise.spec.countIn).number === 1 ? 76 : 77,
          ticks: beat * ppq,
          durationTicks: Math.round(ppq * 0.06),
          velocity: metronomeBeat(beat, exercise.spec.countIn).velocity,
        });
  }
  return midi.toArray();
}
