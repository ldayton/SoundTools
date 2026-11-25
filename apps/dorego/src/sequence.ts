import {
  generateExercise,
  validateSpec,
  exerciseFamily,
  secondsAt,
  practiceAt,
  type Exercise,
  type ExerciseSpec,
  type NoteEvent,
} from './music';

// All exercise types share this policy. Generators describe music, never edit behavior.
export const optionTiming = {
  pattern: 'round',
  countIn: 'sequence',
  bpm: 'live',
  volume: 'live',
  drone: 'live',
  droneStrength: 'live',
  scaleTuning: 'round',
  yemeniteCollection: 'round',
  startingChords: 'round',
  repeatTurn: 'round',
  repeatHome: 'round',
  repeatTurnCount: 'round',
  repeatHomeCount: 'round',
  repeatTwice: 'round',
  key: 'round',
  low: 'round',
  high: 'round',
  direction: 'round',
  progression: 'round',
  noteBeats: 'round',
  repetitions: 'round',
  restBeats: 'round',
  gate: 'round',
  voice: 'round',
  metronome: 'round',
  solfege: 'round',
  transition: 'round',
} satisfies Record<keyof ExerciseSpec, 'sequence' | 'round' | 'live'>;

export interface RoundCommitment {
  identity: number;
  anchor: number;
  pass: number;
  leg: number;
  travel: number;
  settings: ExerciseSpec;
}
export interface SequenceState {
  settings: ExerciseSpec;
  timeline: Exercise;
  nextRoundId: number;
  nextNoteId: number;
}
export type SequenceAction =
  | { type: 'restart' }
  | { type: 'repeat'; position: number }
  | { type: 'move'; position: number; step: number }
  | {
      type: 'settings';
      settings: ExerciseSpec;
      position: number;
      commitPosition?: number;
      mode: 'ready' | 'starting' | 'playing' | 'paused' | 'complete';
    };
export interface SequenceTransition {
  state: SequenceState;
  effect: 'reset' | 'replace-future' | 'live' | 'seek' | 'play';
  restBeats?: number;
  position: number;
  protectedThrough: number;
}
const compile = (settings: ExerciseSpec) => generateExercise(settings, Infinity);
// Adapt existing musical generators once. No pattern-specific branching in the planner.
function catalogue(exercise: Exercise) {
  const guideIds = new Set((exercise.guideNotes ?? exercise.notes).map((note) => note.id));
  const ordered = [...exercise.notes].sort((a, b) => a.onsetBeat - b.onsetBeat);
  let noteIndex = 0;
  const templates = exercise.rounds.map((round) => {
    const notes: NoteEvent[] = [];
    while (noteIndex < ordered.length && ordered[noteIndex].onsetBeat < round.onsetBeat - 1e-9)
      noteIndex++;
    while (noteIndex < ordered.length && ordered[noteIndex].onsetBeat < round.endBeat - 1e-9)
      notes.push(ordered[noteIndex++]);
    return {
      round,
      notes,
      phrase: notes.filter((note) => guideIds.has(note.id)),
      pass: (notes[0]?.repetition ?? 1) - 1,
    };
  });
  let leg = 0,
    previousPass = -1,
    previousTravel = 0;
  return templates.map(({ round, notes, phrase, pass }, index) => {
    const anchor = Math.min(
      ...phrase.flatMap((note) => [note.midi, note.midi + (note.glideSpan ?? 0)])
    );
    const next = exercise.rounds[index + 1];
    const previous = exercise.rounds[index - 1];
    if (pass !== previousPass) {
      leg = 0;
      previousTravel = 0;
    }
    const delta =
      next && templates[index + 1].pass === pass
        ? next.midi - round.midi
        : previous && pass === previousPass
          ? round.midi - previous.midi
          : 0;
    const travel = Math.sign(delta) || previousTravel;
    if (previousTravel && travel && travel !== previousTravel) leg++;
    // A turning point belongs to the incoming leg; the following round starts the return leg.
    const cursorLeg = travel !== previousTravel && previousTravel ? leg - 1 : leg;
    previousPass = pass;
    previousTravel = travel;
    return { round, notes, guide: phrase, cursor: { anchor, pass, leg: cursorLeg, travel } };
  });
}

function continuation(items: ReturnType<typeof catalogue>, cursor: RoundCommitment) {
  const samePass = items.filter((item) => item.cursor.pass === cursor.pass);
  const anchors = samePass.map((item) => item.cursor.anchor);
  const leg = Math.min(cursor.leg, Math.max(0, ...samePass.map((item) => item.cursor.leg)));
  const matching = samePass.find(
    (item) => item.cursor.leg === leg && Math.abs(item.cursor.anchor - cursor.anchor) < 1e-6
  );
  const matchingIndex = matching ? items.indexOf(matching) : -1;
  const future = items.filter((item, itemIndex) => {
    if (item.cursor.pass < cursor.pass) return false;
    if (item.cursor.pass > cursor.pass) return true;
    if (matching) return itemIndex > matchingIndex;
    return (
      item.cursor.leg > leg ||
      (item.cursor.leg === leg && item.cursor.travel * (item.cursor.anchor - cursor.anchor) > 1e-6)
    );
  });
  // Moving the active pitch outside the selected range terminates this traversal.
  if (
    !anchors.length ||
    cursor.anchor < Math.min(...anchors) - 1e-6 ||
    cursor.anchor > Math.max(...anchors) + 1e-6
  )
    return [];
  return future;
}

export function createSequence(settings: ExerciseSpec): SequenceState {
  const generated = compile(settings);
  let nextRoundId = 0;
  const rounds = catalogue(generated).map((item) => ({
    ...item.round,
    commitment: {
      ...item.cursor,
      identity: nextRoundId++,
      settings: { ...generated.spec },
    },
  }));
  return {
    settings: generated.spec,
    timeline: { ...generated, rounds },
    nextRoundId,
    nextNoteId: Math.max(-1, ...generated.notes.map((note) => note.id)) + 1,
  };
}

export function transitionSequence(
  state: SequenceState,
  action: SequenceAction
): SequenceTransition {
  if (action.type === 'restart')
    return {
      state: createSequence(state.settings),
      effect: 'reset',
      position: 0,
      protectedThrough: 0,
    };
  if (action.type === 'repeat') {
    const current = practiceAt(state.timeline, action.position).current;
    const generated = compile(state.settings);
    const items = catalogue(generated);
    const cursor = current.commitment!;
    const template =
      items.find(
        (item) =>
          item.cursor.pass === cursor.pass &&
          item.cursor.leg === cursor.leg &&
          Math.abs(item.cursor.anchor - cursor.anchor) < 1e-6
      ) ?? items[0];
    const shift = cursor.anchor - template.cursor.anchor;
    const repeat = {
      ...template,
      round: { ...template.round, midi: template.round.midi + shift },
      notes: template.notes.map((note) => ({
        ...note,
        midi: note.midi + shift,
        repetition: cursor.pass + 1,
      })),
      guide: template.guide,
      cursor: { ...template.cursor, anchor: cursor.anchor, pass: cursor.pass, leg: cursor.leg },
    };
    const timeline = compose(
      state,
      generated.spec,
      generated,
      current.id,
      [repeat, ...continuation(items, { ...cursor, settings: generated.spec })],
      current.onsetBeat
    );
    return {
      state: timeline,
      effect: 'play',
      position: secondsAt(current.onsetBeat, generated.spec.bpm),
      restBeats: state.settings.restBeats,
      protectedThrough: 0,
    };
  }
  if (action.type === 'move') {
    const current = practiceAt(state.timeline, action.position).current.id;
    const target = Math.max(0, Math.min(state.timeline.rounds.length - 1, current + action.step));
    return {
      state,
      effect: target === current ? 'live' : 'seek',
      position: secondsAt(state.timeline.rounds[target].onsetBeat, state.timeline.spec.bpm),
      protectedThrough: 0,
    };
  }
  let settings = validateSpec(action.settings); // Validation is atomic; callers retain state on failure.
  if (
    exerciseFamily(settings.pattern) !== exerciseFamily(state.settings.pattern) ||
    action.mode === 'ready'
  )
    return { state: createSequence(settings), effect: 'reset', position: 0, protectedThrough: 0 };
  const beat = ((action.commitPosition ?? action.position) * state.timeline.spec.bpm) / 60;
  const position = (action.position * state.timeline.spec.bpm) / settings.bpm;
  const roundChanged = (Object.keys(optionTiming) as (keyof ExerciseSpec)[]).some(
    (key) => optionTiming[key] === 'round' && settings[key] !== state.settings[key]
  );
  // Count-in is session-scoped. Completed sessions never start themselves after edits.
  if (!roundChanged || action.mode === 'complete')
    return {
      state: {
        ...state,
        settings,
        timeline: {
          ...state.timeline,
          spec: {
            ...state.timeline.spec,
            bpm: settings.bpm,
            volume: settings.volume,
            drone: settings.drone,
            droneStrength: settings.droneStrength,
          },
        },
      },
      effect: 'live',
      position,
      protectedThrough: 0,
    };
  const generated = compile(settings);
  settings = generated.spec;
  const old = state.timeline;
  let index = beat < old.rounds[0].onsetBeat ? -1 : 0;
  while (index + 1 < old.rounds.length && old.rounds[index + 1].onsetBeat <= beat + 1e-9) index++;
  // Once an inter-round rest begins, its destination and duration are committed too.
  if (index >= 0 && beat >= old.rounds[index].endBeat && old.rounds[index + 1]) index++;
  const current = old.rounds[index];
  const items = catalogue(generated);
  const future = current ? continuation(items, current.commitment!) : items;
  return {
    state: compose(
      state,
      settings,
      generated,
      index + 1,
      future,
      current ? current.endBeat + settings.restBeats : old.spec.countIn
    ),
    effect: 'replace-future',
    position,
    protectedThrough: current?.endBeat ?? old.spec.countIn,
  };
}

/** One assembler owns identities, history preservation and timing for edits and repeats. */
function compose(
  state: SequenceState,
  settings: ExerciseSpec,
  generated: Exercise,
  prefixCount: number,
  future: ReturnType<typeof catalogue>,
  firstOnset: number
): SequenceState {
  const old = state.timeline;
  const prefix = old.rounds.slice(0, prefixCount);
  const cutoff = prefix.at(-1)?.endBeat ?? 0;
  const notes = old.notes.filter((note) => note.onsetBeat < cutoff - 1e-9);
  const guideNotes = (old.guideNotes ?? old.notes).filter((note) => note.onsetBeat < cutoff - 1e-9);
  const rounds = [...prefix];
  let nextRoundId = state.nextRoundId,
    nextNoteId = state.nextNoteId;
  let onset = firstOnset,
    end = cutoff;
  for (const item of future) {
    const shift = onset - item.round.onsetBeat;
    const copies = new Map<number, NoteEvent>();
    for (const note of item.notes) {
      const copy = { ...note, id: nextNoteId++, onsetBeat: note.onsetBeat + shift };
      notes.push(copy);
      copies.set(note.id, copy);
    }
    guideNotes.push(...item.guide.map((note) => copies.get(note.id)!));
    end = item.round.endBeat + shift;
    rounds.push({
      ...item.round,
      id: rounds.length,
      onsetBeat: onset,
      endBeat: end,
      commitment: { ...item.cursor, identity: nextRoundId++, settings: { ...settings } },
    });
    onset = end + settings.restBeats;
  }
  return {
    settings,
    nextRoundId,
    nextNoteId,
    timeline: {
      ...generated,
      notes,
      guideNotes,
      rounds,
      totalBeats: end,
      spec: { ...settings, countIn: old.spec.countIn },
      pitches: [...new Set(notes.map((note) => note.midi))].sort((a, b) => a - b),
    },
  };
}
