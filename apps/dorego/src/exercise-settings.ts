import {
  DEFAULT_SPEC,
  isVocalPattern,
  isGlidePattern,
  vocalSpan,
  generateExercise as generateBoundedExercise,
  type ExerciseSpec,
} from './music';
// UI pitch choices cover C2 through B6; audio/export can still use their wider range.
export const MIN_NOTE = 36;
export const MAX_NOTE = 95;
const generateExercise = (input: unknown) => generateBoundedExercise(input, Infinity);
export function restoreSpec(input: unknown, glideShapeVersion: string | null): ExerciseSpec {
  if (!input || typeof input !== 'object') throw new Error('Invalid saved exercise.');
  const saved = {
    ...input,
    voice: 'bitklavier',
    metronome: false,
    gate: DEFAULT_SPEC.gate,
    noteBeats: DEFAULT_SPEC.noteBeats,
    solfege: false,
    transition: null,
  } as Record<string, unknown>;
  if (typeof saved.bpm === 'number' && Number.isFinite(saved.bpm) && saved.bpm < 60) saved.bpm = 60;
  if (saved.pattern === 'strawDescending') {
    saved.pattern = 'arpeggio';
    saved.direction = 'down';
  } else if (saved.pattern === 'vocalArpeggios' || saved.pattern === 'minorArpeggio')
    saved.pattern = 'arpeggio';
  else if (['minor', 'pentatonic', 'fiveTone', 'chromatic'].includes(String(saved.pattern)))
    saved.pattern = 'major';
  if (saved.direction === 'updown') saved.direction = 'up';
  if (saved.pattern === 'major') {
    const down = saved.direction === 'down';
    const start = Math.max(
      down ? MIN_NOTE + 12 : MIN_NOTE,
      Math.min(down ? MAX_NOTE : MAX_NOTE - 12, Number(down ? saved.high : saved.low))
    );
    saved.key = start % 12;
    saved.low = down ? start - 12 : start;
    saved.high = down ? start : start + 12;
  }
  if (saved.progression === undefined) {
    saved.progression =
      saved.pattern === 'rossini' || saved.pattern === 'major' ? 'up' : saved.direction;
    if (saved.direction === 'both' && saved.pattern !== 'major') saved.direction = 'up';
  }
  if (
    isGlidePattern(saved.pattern as ExerciseSpec['pattern']) &&
    saved.direction === 'up' &&
    glideShapeVersion !== '1'
  )
    saved.direction = 'both';
  const spec = generateExercise(saved).spec;
  const high = Math.min(MAX_NOTE, Math.max(MIN_NOTE + vocalSpan(spec.pattern), spec.high));
  const low = Math.max(MIN_NOTE, Math.min(spec.low, high - vocalSpan(spec.pattern)));
  return generateExercise({ ...spec, low, high }).spec;
}

export function editSpec(
  spec: ExerciseSpec,
  patch: Partial<ExerciseSpec> & { startingNote?: number }
): ExerciseSpec {
  const result = {
    ...spec,
    ...patch,
    startingNote: patch.startingNote ?? (spec.direction === 'down' ? spec.high : spec.low),
  } as Record<string, unknown>;
  if (
    result.pattern !== spec.pattern &&
    result.pattern !== 'major' &&
    !isGlidePattern(result.pattern as ExerciseSpec['pattern']) &&
    result.direction === 'both'
  )
    result.direction = 'up';
  result.progression = result.progression ?? 'up';
  if (
    isVocalPattern(result.pattern as ExerciseSpec['pattern']) &&
    result.pattern !== spec.pattern &&
    Number(result.high) - Number(result.low) < vocalSpan(result.pattern as ExerciseSpec['pattern'])
  ) {
    const span = vocalSpan(result.pattern as ExerciseSpec['pattern']);
    result.high = Math.min(MAX_NOTE, Number(result.low) + span);
    result.low = Math.min(Number(result.low), Number(result.high) - span);
  }
  if (result.pattern === 'major') {
    const down = result.direction === 'down';
    const startingNote = Math.max(
      down ? MIN_NOTE + 12 : MIN_NOTE,
      Math.min(
        down ? MAX_NOTE : MAX_NOTE - 12,
        Number(result.startingNote ?? (down ? result.high : result.low))
      )
    );
    result.key = startingNote % 12;
    result.low = down ? startingNote - 12 : startingNote;
    result.high = down ? startingNote : startingNote + 12;
  }
  result.gate = DEFAULT_SPEC.gate;
  result.noteBeats = DEFAULT_SPEC.noteBeats;
  result.transition = null;
  result.metronome = false;
  result.solfege = false;
  return result as unknown as ExerciseSpec;
}
