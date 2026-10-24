export const PATTERNS = {
  arpeggio: {
    name: 'Arpeggio & Scale',
    intervals: [0, 4, 7],
    description: 'An arpeggio with a stepwise return, moving one semitone per round.',
  },
  octaveArpeggio: {
    name: 'Octave Arpeggio',
    intervals: [0, 4, 7, 12, 7, 4, 0],
    description: 'A major arpeggio through an octave and back, moving one semitone per round.',
  },
  rossini: {
    name: 'Rossini Scale',
    intervals: [0, 4, 7, 12, 16, 19, 17, 14, 11, 7, 5, 2, 0],
    description: 'The Rossini arpeggio and descending return, moving one semitone per round.',
  },
  fiveNote: {
    name: 'Five-Note Scale',
    intervals: [0, 2, 4, 5, 7, 5, 4, 2, 0],
    description: 'A five-note major scale out and back, moving one semitone per round.',
  },
  major: {
    name: 'Major Scale',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    description: 'A major scale through your selected range.',
  },
  fifthGlide: {
    name: 'Fifth Glide',
    intervals: [0, 7, 0],
    description: 'A continuous cello glide through a fifth, moving one semitone per round.',
  },
  octaveGlide: {
    name: 'Octave Glide',
    intervals: [0, 12, 0],
    description: 'A continuous cello glide through an octave, moving one semitone per round.',
  },
} as const;
export type Pattern = keyof typeof PATTERNS;
export function isGlidePattern(pattern: Pattern) {
  return pattern === 'fifthGlide' || pattern === 'octaveGlide';
}
export function isVocalPattern(pattern: Pattern) {
  return pattern !== 'major';
}
export function vocalSpan(pattern: Pattern) {
  return pattern === 'rossini'
    ? 19
    : pattern === 'octaveArpeggio' || pattern === 'octaveGlide'
      ? 12
      : 7;
}
export type Direction = 'up' | 'down' | 'both';
export function directionName(direction: Direction) {
  return direction === 'both'
    ? 'Ascending & Descending'
    : direction === 'down'
      ? 'Descending'
      : 'Ascending';
}
export type Voice = 'bitklavier';
export interface ExerciseSpec {
  startingChords?: boolean;
  repeatTurn?: boolean;
  repeatHome?: boolean;
  pattern: Pattern;
  key: number;
  low: number;
  high: number;
  direction: Direction;
  // Omitted only by legacy CLI specs that coupled phrase and sweep direction.
  progression?: Direction;
  bpm: number;
  noteBeats: number;
  repetitions: number;
  restBeats: number;
  countIn: number;
  gate: number;
  volume: number;
  voice: Voice;
  metronome: boolean;
  solfege: boolean;
  transition: number | null;
}
export interface NoteEvent {
  id: number;
  midi: number;
  onsetBeat: number;
  durationBeats: number;
  slotBeats: number;
  repetition: number;
  degree: number;
  velocity?: number;
  glideSpan?: number;
  glideReturns?: boolean;
}
export interface Exercise {
  spec: ExerciseSpec;
  notes: NoteEvent[];
  totalBeats: number;
  phraseBeats: number;
  pitches: number[];
  title?: string;
  guideNotes?: NoteEvent[];
  rounds: PracticeRound[];
}
export interface PracticeRound {
  id: number;
  midi: number;
  degree: number;
  onsetBeat: number;
  endBeat: number;
}
export function practiceAt(exercise: Exercise, seconds: number) {
  const beat = (Math.max(0, seconds) * exercise.spec.bpm) / 60;
  let index = 0;
  for (let i = 1; i < exercise.rounds.length; i++) {
    if (exercise.rounds[i].onsetBeat > beat + 1e-9) break;
    index = i;
  }
  const current = exercise.rounds[index];
  return {
    current,
    next: exercise.rounds[index + 1] ?? null,
    progress: Math.max(
      0,
      Math.min(1, (beat - current.onsetBeat) / (current.endBeat - current.onsetBeat))
    ),
  };
}
export interface Scene {
  beat: number;
  note: NoteEvent | null;
  upcoming: NoteEvent[];
  phase: 'ready' | 'countin' | 'note' | 'rest' | 'complete';
  count: number;
  repetition: number;
  progress: number;
}
export const DEFAULT_SPEC: ExerciseSpec = {
  pattern: 'arpeggio',
  repeatTurn: false,
  repeatHome: false,
  key: 4,
  low: 52,
  high: 76,
  direction: 'up',
  bpm: 150,
  noteBeats: 1,
  repetitions: 2,
  restBeats: 2,
  countIn: 8,
  gate: 0.88,
  volume: 0,
  voice: 'bitklavier',
  metronome: false,
  solfege: false,
  transition: null,
};
export const SHARPS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLATS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
export function noteName(midi: number, key = 0): string {
  return `${([1, 3, 5, 8, 10].includes(key) ? FLATS : SHARPS)[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
export function secondsAt(beat: number, bpm: number) {
  return (beat * 60) / bpm;
}
export function metronomeBeat(beat: number, countIn = 0) {
  // The exercise starts a new bar even after a short two-beat count-in.
  const number = ((Math.floor(beat) - (beat >= countIn ? countIn : 0)) % 4) + 1;
  return { number, frequency: number === 1 ? 1400 : 1000, velocity: number === 1 ? 0.6 : 0.45 };
}
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function validateSpec(input: unknown): ExerciseSpec {
  if (!input || typeof input !== 'object') throw new Error('Choose an exercise first.');
  const s = input as Record<string, unknown>;
  const num = (key: string, min: number, max: number, integer = false) => {
    const n = s[key];
    if (
      typeof n !== 'number' ||
      !Number.isFinite(n) ||
      n < min ||
      n > max ||
      (integer && !Number.isInteger(n))
    )
      throw new Error(`Invalid ${key}: choose a value from ${min} to ${max}.`);
    return n;
  };
  if (typeof s.pattern !== 'string' || !Object.hasOwn(PATTERNS, s.pattern))
    throw new Error('Choose a supported pattern.');
  if (!['up', 'down', 'both'].includes(String(s.direction))) throw new Error('Choose a direction.');
  if (s.progression !== undefined && !['up', 'down', 'both'].includes(String(s.progression)))
    throw new Error('Choose how rounds move through the range.');
  if (
    s.progression !== undefined &&
    s.direction === 'both' &&
    s.pattern !== 'major' &&
    s.pattern !== 'rossini' &&
    !isGlidePattern(s.pattern as Pattern)
  )
    throw new Error('Choose rising first or falling first within each round.');
  if (s.voice !== 'bitklavier') throw new Error('Only bitKlavier is supported.');
  for (const key of ['metronome', 'solfege'])
    if (typeof s[key] !== 'boolean') throw new Error(`Invalid ${key}.`);
  const result: ExerciseSpec = {
    pattern: s.pattern as Pattern,
    direction: s.pattern === 'rossini' ? 'up' : (s.direction as Direction),
    voice: s.voice as Voice,
    key: num('key', 0, 11, true),
    low: num('low', 24, 96, true),
    high: num('high', 24, 96, true),
    bpm: num('bpm', 60, 240),
    noteBeats: num('noteBeats', 0.25, 4),
    repetitions: num('repetitions', 1, 16, true),
    restBeats: num('restBeats', 0, 16, true),
    countIn: num('countIn', 0, 8, true),
    gate: num('gate', 0.25, 1),
    volume: num('volume', -60, 0),
    metronome: s.metronome as boolean,
    solfege: s.solfege as boolean,
    transition: s.transition === null ? null : num('transition', 24, 96, true),
  };
  for (const key of ['repeatTurn', 'repeatHome'] as const) {
    if (s[key] !== undefined && typeof s[key] !== 'boolean')
      throw new Error(`Invalid ${key} setting.`);
    result[key] = s[key] === true;
  }
  if (s.progression !== undefined) result.progression = s.progression as Direction;
  if (s.startingChords !== undefined && typeof s.startingChords !== 'boolean')
    throw new Error('Invalid starting chords setting.');
  result.startingChords = s.startingChords === undefined ? true : s.startingChords;
  if (result.low > result.high) throw new Error('The lowest note must be below the highest note.');
  return result;
}
export function generateExercise(input: unknown, maxDuration = 600): Exercise {
  const spec = validateSpec(input);
  if (spec.progression !== undefined && isVocalPattern(spec.pattern))
    return generateProgressingExercise(spec, maxDuration);
  if (spec.direction === 'both' && isVocalPattern(spec.pattern))
    return generateBidirectionalExercise(spec, maxDuration);
  if (isGlidePattern(spec.pattern)) return generateGlideExercise(spec, maxDuration);
  if (isVocalPattern(spec.pattern)) return generateVocalExercise(spec, maxDuration);
  const intervals: readonly number[] = PATTERNS[spec.pattern].intervals;
  const pitches: number[] = [];
  for (let midi = spec.low; midi <= spec.high; midi++)
    if (intervals.includes((midi - spec.key + 120) % 12)) pitches.push(midi);
  if (!pitches.length)
    throw new Error('This range has no notes in the selected key. Widen the range.');
  let phrase = [...pitches];
  if (spec.direction === 'down') phrase.reverse();
  else if (spec.direction === 'both') phrase.push(...pitches.slice(0, -1).reverse());
  const phraseBeats = phrase.length * spec.noteBeats;
  const notes: NoteEvent[] = [];
  const rounds: PracticeRound[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++) {
    const start = spec.countIn + rep * (phraseBeats + spec.restBeats);
    rounds.push({
      id: rounds.length,
      midi: phrase[0],
      degree: (phrase[0] - spec.key + 120) % 12,
      onsetBeat: start,
      endBeat: start + phraseBeats,
    });
    phrase.forEach((midi, i) =>
      notes.push({
        id: notes.length,
        midi,
        onsetBeat: start + i * spec.noteBeats,
        durationBeats: spec.noteBeats * spec.gate,
        slotBeats: spec.noteBeats,
        repetition: rep + 1,
        degree: (midi - spec.key + 120) % 12,
      })
    );
  }
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error('Keep exercises under 10 minutes. Reduce repetitions, range, or note length.');
  return { spec, notes, totalBeats, phraseBeats, pitches, rounds };
}
// Phrase orientation and movement between complete rounds are independent.
export function progressionRoots(low: number, high: number, direction: Direction) {
  const roots = Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => low + i);
  if (direction === 'down') roots.reverse();
  else if (direction === 'both') roots.push(...roots.slice(0, -1).reverse());
  return roots;
}
export function phraseLabel(pattern: Pattern, direction: Direction) {
  if (pattern === 'major')
    return direction === 'both' ? 'Up then down' : direction === 'down' ? 'Down' : 'Up';
  if (isGlidePattern(pattern))
    return direction === 'both' ? 'Up & back' : direction === 'down' ? 'Down' : 'Up';
  return direction === 'down' ? 'Falling first' : 'Rising first';
}
export function phraseContour(pattern: Pattern, direction: Direction): readonly number[] {
  if (isGlidePattern(pattern)) {
    const span = vocalSpan(pattern);
    return direction === 'down'
      ? [span, span, 0, 0]
      : direction === 'both'
        ? [0, 0, span, span, 0, 0]
        : [0, 0, span, span];
  }
  if (pattern === 'major') {
    const up = [0, 2, 4, 5, 7, 9, 11, 12];
    return direction === 'down'
      ? up.reverse()
      : direction === 'both'
        ? [...up, ...up.slice(0, -1).reverse()]
        : up;
  }
  if (pattern === 'arpeggio')
    return direction === 'down'
      ? [7, 4, 0, 2, 4, 5, 7, 4, 0, 2, 4, 5, 7]
      : [0, 4, 7, 5, 4, 2, 0, 4, 7, 5, 4, 2, 0];
  if (direction === 'down' && pattern === 'fiveNote') return [7, 5, 4, 2, 0, 2, 4, 5, 7];
  if (direction === 'down' && pattern === 'octaveArpeggio') return [12, 7, 4, 0, 4, 7, 12];
  return PATTERNS[pattern].intervals;
}
function generateProgressingExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const span = vocalSpan(spec.pattern);
  // Reuse a single complete phrase, including its original chord voicing,
  // articulation and timing; transpose it without changing its contour.
  const generate = isGlidePattern(spec.pattern) ? generateGlideExercise : generateVocalExercise;
  if (spec.high - spec.low < span)
    return generate({ ...spec, progression: undefined }, maxDuration);
  const phrase = generate(
    { ...spec, high: spec.low + span, repetitions: 1, countIn: 0, restBeats: 0 },
    Infinity
  );
  const roots = progressionRoots(spec.low, spec.high - span, spec.progression!);
  const phraseBeats = roots.length * phrase.totalBeats + (roots.length - 1) * spec.restBeats;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error(
      'Keep exercises under 10 minutes. Reduce repetitions, range, rests, or note length.'
    );
  const notes: NoteEvent[] = [],
    guideNotes: NoteEvent[] = [],
    rounds: PracticeRound[] = [];
  const guide = new Set(phrase.guideNotes!.map((note) => note.id));
  for (let rep = 0; rep < spec.repetitions; rep++)
    roots.forEach((root, index) => {
      const shift = root - spec.low;
      const start =
        spec.countIn +
        rep * (phraseBeats + spec.restBeats) +
        index * (phrase.totalBeats + spec.restBeats);
      for (const note of phrase.notes) {
        const copy = {
          ...note,
          id: notes.length,
          midi: note.midi + shift,
          onsetBeat: note.onsetBeat + start,
          repetition: rep + 1,
        };
        notes.push(copy);
        if (guide.has(note.id)) guideNotes.push(copy);
      }
      const round = phrase.rounds[0];
      rounds.push({
        ...round,
        id: rounds.length,
        midi: round.midi + shift,
        onsetBeat: start,
        endBeat: start + phrase.totalBeats,
      });
    });
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [...new Set(notes.flatMap((n) => [n.midi, n.midi + (n.glideSpan ?? 0)]))].sort(
      (a, b) => a - b
    ),
    title:
      spec.pattern === 'rossini'
        ? PATTERNS.rossini.name
        : `${PATTERNS[spec.pattern].name} (${phraseLabel(spec.pattern, spec.direction)})`,
  };
}
const GLIDE_HOLD_BEATS = 2;
const GLIDE_SLIDE_BEATS = 4;
export const GLIDE_BEATS = 3 * GLIDE_HOLD_BEATS + 2 * GLIDE_SLIDE_BEATS;
export function glideOffset(progress: number, span: number, returns = span >= 0) {
  const beat =
    Math.max(0, Math.min(1, progress)) *
    (returns ? GLIDE_BEATS : 2 * GLIDE_HOLD_BEATS + GLIDE_SLIDE_BEATS);
  const ease = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
  if (beat < 2) return 0;
  if (beat < 6) return span * ease((beat - 2) / GLIDE_SLIDE_BEATS);
  if (!returns || beat < 8) return span;
  if (beat < 12) return span * (1 - ease((beat - 8) / GLIDE_SLIDE_BEATS));
  return 0;
}
// Share the same piano voicings, timing and guide notes across vocal exercises.
function addStartingChords(
  tonic: number,
  beat: number,
  noteBeats: number,
  descending: boolean,
  add: (midi: number, onset: number, length: number) => NoteEvent,
  guideNotes: NoteEvent[]
) {
  const approach = descending ? [-13, -1, 3, 6] : [-13, -6, -1, 3];
  const target = descending ? [-12, 0, 4, 7] : [-12, 0, 4];
  const approachNotes = approach.map((offset) => add(tonic + offset, beat, 2 * noteBeats));
  guideNotes.push(approachNotes[approachNotes.length - 1]);
  beat += 2 * noteBeats;
  const targetNotes = target.map((offset) => add(tonic + offset, beat, 4 * noteBeats));
  guideNotes.push(targetNotes[targetNotes.length - 1]);
  return beat + 4 * noteBeats;
}
export function notePitchAt(note: NoteEvent, beat: number) {
  return (
    note.midi +
    (note.glideSpan
      ? glideOffset((beat - note.onsetBeat) / note.slotBeats, note.glideSpan, note.glideReturns)
      : 0)
  );
}
function generateGlideExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const span = vocalSpan(spec.pattern);
  if (spec.high - spec.low < span)
    throw new Error(
      `${PATTERNS[spec.pattern].name} needs a range of at least ${span === 12 ? 'an octave' : 'a perfect fifth'}.`
    );
  const descending = spec.direction === 'down';
  const returns =
    spec.direction === 'both' || (spec.direction === 'up' && spec.progression === undefined);
  const roots = Array.from({ length: spec.high - spec.low - span + 1 }, (_, i) =>
    descending ? spec.high - i : spec.low + i
  );
  const cueBeats = spec.startingChords ? 6 * spec.noteBeats : 0;
  const glideBeats =
    (returns ? GLIDE_BEATS : 2 * GLIDE_HOLD_BEATS + GLIDE_SLIDE_BEATS) * spec.noteBeats;
  const phraseLength = cueBeats + glideBeats;
  const phraseBeats = roots.length * phraseLength + (roots.length - 1) * spec.restBeats;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error('Keep exercises under 10 minutes. Reduce repetitions, range, or rests.');
  const notes: NoteEvent[] = [],
    rounds: PracticeRound[] = [],
    guideNotes: NoteEvent[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++)
    roots.forEach((root, index) => {
      const beat =
        spec.countIn +
        rep * (phraseBeats + spec.restBeats) +
        index * (phraseLength + spec.restBeats);
      rounds.push({
        id: rounds.length,
        midi: root,
        degree: descending ? span % 12 : 0,
        onsetBeat: beat,
        endBeat: beat + phraseLength,
      });
      if (spec.startingChords)
        addStartingChords(
          descending ? root - span : root,
          beat,
          spec.noteBeats,
          descending,
          (midi, onsetBeat, length) => {
            const note: NoteEvent = {
              id: notes.length,
              midi,
              onsetBeat,
              durationBeats: length * spec.gate,
              slotBeats: length,
              repetition: rep + 1,
              degree: (midi - (descending ? root - span : root) + 120) % 12,
              velocity: 0.65,
            };
            notes.push(note);
            return note;
          },
          guideNotes
        );
      notes.push({
        id: notes.length,
        midi: root,
        degree: descending ? span % 12 : 0,
        onsetBeat: beat + cueBeats,
        durationBeats: glideBeats,
        slotBeats: glideBeats,
        repetition: rep + 1,
        velocity: 0.8,
        glideSpan: descending ? -span : span,
        glideReturns: returns,
      });
      guideNotes.push(notes[notes.length - 1]);
    });
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [
      ...new Set(notes.flatMap((note) => [note.midi, note.midi + (note.glideSpan ?? 0)])),
    ].sort((a, b) => a - b),
    title: `${PATTERNS[spec.pattern].name} (${directionName(spec.direction)})`,
  };
}
// Compatibility for CLI JSON written before progression was independent.
function generateBidirectionalExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const generateLeg = isGlidePattern(spec.pattern) ? generateGlideExercise : generateVocalExercise;
  const up = generateLeg({ ...spec, direction: 'up', countIn: 0, repetitions: 1 }, Infinity);
  const down = generateLeg({ ...spec, direction: 'down', countIn: 0, repetitions: 1 }, Infinity);
  // The top key has just been practiced on the ascending leg. Start the
  // descending leg one key lower, except when the range permits only one key.
  const downStart = down.rounds.length > 1 ? down.rounds[1].onsetBeat : 0;
  const phraseBeats = up.totalBeats + spec.restBeats + down.totalBeats - downStart;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error(
      'Keep exercises under 10 minutes. Reduce repetitions, range, rests, or note length.'
    );
  const notes: NoteEvent[] = [],
    guideNotes: NoteEvent[] = [],
    rounds: PracticeRound[] = [];
  for (let rep = 0; rep < spec.repetitions; rep++) {
    const start = spec.countIn + rep * (phraseBeats + spec.restBeats);
    for (const [leg, trim, shift] of [
      [up, 0, start],
      [down, downStart, start + up.totalBeats + spec.restBeats - downStart],
    ] as const) {
      const guide = new Set(leg.guideNotes!.map((n) => n.id));
      for (const note of leg.notes) {
        if (note.onsetBeat < trim) continue;
        const copy = {
          ...note,
          id: notes.length,
          onsetBeat: note.onsetBeat + shift,
          repetition: rep + 1,
        };
        notes.push(copy);
        if (guide.has(note.id)) guideNotes.push(copy);
      }
      for (const round of leg.rounds)
        if (round.onsetBeat >= trim)
          rounds.push({
            ...round,
            id: rounds.length,
            onsetBeat: round.onsetBeat + shift,
            endBeat: round.endBeat + shift,
          });
    }
  }
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b),
    title: `${PATTERNS[spec.pattern].name} (${directionName('both')})`,
  };
}
function generateVocalExercise(spec: ExerciseSpec, maxDuration: number): Exercise {
  const rossini = spec.pattern === 'rossini';
  const span = vocalSpan(spec.pattern);
  const descending = !rossini && spec.direction === 'down';
  if (spec.high - spec.low < span)
    throw new Error(
      rossini
        ? 'Rossini Scale needs a range of at least an octave and a fifth (19 semitones).'
        : span === 12
          ? 'Octave Arpeggio needs a range of at least an octave (12 semitones).'
          : 'These vocal phrases need a range of at least seven semitones (a perfect fifth).'
    );
  const offsets: number[] = [
    ...(spec.pattern === 'fiveNote'
      ? descending
        ? [0, -2, -3, -5, -7, -5, -3, -2, 0]
        : PATTERNS.fiveNote.intervals
      : spec.pattern === 'octaveArpeggio'
        ? descending
          ? [0, -5, -8, -12, -8, -5, 0]
          : PATTERNS.octaveArpeggio.intervals
        : rossini
          ? PATTERNS.rossini.intervals
          : descending
            ? [0, -3, -7, -5, -3, -2, 0, -3, -7, -5, -3, -2, 0]
            : [0, 4, 7, 5, 4, 2, 0, 4, 7, 5, 4, 2, 0]),
  ];
  const lengths =
    spec.pattern === 'arpeggio'
      ? [2, 2, 1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 2]
      : offsets.map((_, index) => (index === offsets.length - 1 ? 2 : 1));
  // Add three distinct attacks; retain the original held finish on the fourth home note.
  if (['octaveArpeggio', 'rossini', 'fiveNote'].includes(spec.pattern)) {
    const turn = offsets.indexOf((descending ? Math.min : Math.max)(...offsets));
    const expanded: number[] = [],
      durations: number[] = [];
    offsets.forEach((offset, index) => {
      const repeat =
        (index === turn && spec.repeatTurn) || (index === offsets.length - 1 && spec.repeatHome);
      for (let strike = 0; strike < (repeat ? 4 : 1); strike++) {
        expanded.push(offset);
        durations.push(repeat && strike < 3 ? 1 : lengths[index]);
      }
    });
    offsets.splice(0, offsets.length, ...expanded);
    lengths.splice(0, lengths.length, ...durations);
  }
  const roots: number[] = [];
  if (descending) for (let root = spec.high; root >= spec.low + span; root--) roots.push(root);
  else for (let root = spec.low; root <= spec.high - span; root++) roots.push(root);
  const phraseLength =
    (lengths.reduce((sum, length) => sum + length, 0) + (spec.startingChords ? 6 : 0)) *
    spec.noteBeats;
  const phraseBeats = roots.length * phraseLength + (roots.length - 1) * spec.restBeats;
  const totalBeats =
    spec.countIn + spec.repetitions * phraseBeats + (spec.repetitions - 1) * spec.restBeats;
  if (secondsAt(totalBeats, spec.bpm) > maxDuration)
    throw new Error(
      'Keep exercises under 10 minutes. Reduce repetitions, range, rests, or note length.'
    );
  const notes: NoteEvent[] = [],
    guideNotes: NoteEvent[] = [];
  const rounds: PracticeRound[] = [];
  const add = (
    midi: number,
    onsetBeat: number,
    length: number,
    repetition: number,
    root: number,
    guide: boolean
  ) => {
    const n = {
      id: notes.length,
      midi,
      onsetBeat,
      durationBeats: length * spec.gate,
      slotBeats: length,
      repetition,
      degree: (midi - (descending ? root - span : root) + 120) % 12,
      velocity: guide ? 0.71 : 0.65,
    };
    notes.push(n);
    if (guide) guideNotes.push(n);
    return n;
  };
  for (let rep = 0; rep < spec.repetitions; rep++)
    roots.forEach((root, index) => {
      let beat =
        spec.countIn +
        rep * (phraseBeats + spec.restBeats) +
        index * (phraseLength + spec.restBeats);
      rounds.push({
        id: rounds.length,
        midi: root,
        degree: descending ? span % 12 : 0,
        onsetBeat: beat,
        endBeat: beat + phraseLength,
      });
      if (spec.startingChords) {
        beat = addStartingChords(
          descending ? root - span : root,
          beat,
          spec.noteBeats,
          descending,
          (midi, onset, length) => add(midi, onset, length, rep + 1, root, false),
          guideNotes
        );
      }
      offsets.forEach((offset, i) => {
        add(root + offset, beat, lengths[i] * spec.noteBeats, rep + 1, root, true);
        beat += lengths[i] * spec.noteBeats;
      });
    });
  return {
    spec,
    notes,
    guideNotes,
    rounds,
    totalBeats,
    phraseBeats,
    pitches: [...new Set(notes.map((n) => n.midi))].sort((a, b) => a - b),
    title: rossini
      ? 'Rossini Scale'
      : `${PATTERNS[spec.pattern].name} (${descending ? 'Descending' : 'Ascending'})`,
  };
}
export function stateAt(exercise: Exercise, seconds: number): Scene {
  const beat = (Math.max(0, seconds) * exercise.spec.bpm) / 60;
  const { notes, spec, totalBeats } = exercise;
  const guide = exercise.guideNotes ?? notes;
  const progress = Math.min(1, beat / totalBeats);
  if (seconds < 0)
    return {
      beat: 0,
      note: guide[0],
      upcoming: guide.slice(1, 4),
      phase: 'ready',
      count: 0,
      repetition: 1,
      progress: 0,
    };
  if (beat >= totalBeats - 1e-9)
    return {
      beat,
      note: null,
      upcoming: [],
      phase: 'complete',
      count: 0,
      repetition: spec.repetitions,
      progress: 1,
    };
  if (beat < spec.countIn)
    return {
      beat,
      note: null,
      upcoming: guide.slice(0, 3),
      phase: 'countin',
      count: metronomeBeat(beat).number,
      repetition: 1,
      progress,
    };
  // A note remains visible for its full slot, including its articulation gap.
  // Keyboard/audio activity uses durationBeats separately.
  const note =
    guide.find((n) => n.onsetBeat <= beat + 1e-9 && beat < n.onsetBeat + n.slotBeats - 1e-9) ??
    null;
  const upcoming = guide.filter((n) => n.onsetBeat > beat + 1e-9).slice(0, 3);
  const repetition =
    note?.repetition ??
    Math.min(
      spec.repetitions,
      Math.floor((beat - spec.countIn) / (exercise.phraseBeats + spec.restBeats)) + 1
    );
  const restEnd = upcoming[0]?.onsetBeat ?? totalBeats;
  return {
    beat,
    note,
    upcoming,
    phase: note ? 'note' : 'rest',
    count: note ? 0 : Math.ceil(restEnd - beat),
    repetition,
    progress,
  };
}
export function solfege(degree: number) {
  return ['Do', 'Di', 'Re', 'Me', 'Mi', 'Fa', 'Fi', 'Sol', 'Le', 'La', 'Te', 'Ti'][degree];
}
