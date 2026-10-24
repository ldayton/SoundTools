import { isVocalPattern, type Exercise, type PracticeRound } from './music';

const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export function vocalPhraseNotes(exercise: Exercise, round: PracticeRound) {
  const introBeats =
    isVocalPattern(exercise.spec.pattern) && exercise.spec.startingChords
      ? 6 * exercise.spec.noteBeats
      : 0;
  return exercise.notes.filter(
    (note) => note.onsetBeat >= round.onsetBeat + introBeats && note.onsetBeat < round.endBeat
  );
}
const practiceRanges = new WeakMap<Exercise, Map<number, { low: number; high: number }>>();
export function practiceRange(exercise: Exercise, round: PracticeRound) {
  let ranges = practiceRanges.get(exercise);
  if (!ranges) {
    ranges = new Map();
    practiceRanges.set(exercise, ranges);
  }
  let range = ranges.get(round.id);
  if (!range) {
    const pitches = vocalPhraseNotes(exercise, round).flatMap((note) => [
      note.midi,
      note.midi + (note.glideSpan ?? 0),
    ]);
    range = pitches.length
      ? { low: Math.min(...pitches), high: Math.max(...pitches) }
      : { low: round.midi, high: round.midi };
    ranges.set(round.id, range);
  }
  return range;
}
export function keyboardRange(exercise: Exercise, round: PracticeRound, mobile: boolean) {
  const pitches = mobile
    ? vocalPhraseNotes(exercise, round).flatMap((note) => [
        note.midi,
        note.midi + (note.glideSpan ?? 0),
      ])
    : exercise.pitches;
  // Desktop includes accompaniment; mobile stays focused on the vocal phrase.
  let low = Math.max(
    0,
    mobile ? Math.min(...pitches) - 1 : Math.min(exercise.spec.low - 2, ...pitches)
  );
  let high = Math.min(108, mobile ? Math.max(...pitches) + 1 : exercise.spec.high + 2);
  while (isBlack(low)) low--;
  while (isBlack(high)) high++;
  return { low, high };
}

// A continuous position on the white-key axis lets the keyboard pan without
// replacing its keys at round boundaries (including across octave seams).
export function whiteKeyPosition(midi: number) {
  return Math.floor(midi / 12) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][midi % 12];
}
const mobileKeyCounts = new WeakMap<Exercise, number>();
function mobileKeyCount(exercise: Exercise) {
  let count = mobileKeyCounts.get(exercise);
  if (count === undefined) {
    count = 0;
    for (const round of exercise.rounds) {
      const range = keyboardRange(exercise, round, true);
      count = Math.max(count, whiteKeyPosition(range.high) - whiteKeyPosition(range.low) + 1);
    }
    mobileKeyCounts.set(exercise, count);
  }
  return count;
}
function whiteKeyMidi(position: number) {
  return Math.floor(position / 7) * 12 + [0, 2, 4, 5, 7, 9, 11][((position % 7) + 7) % 7];
}
export function keyboardView(
  exercise: Exercise,
  seconds: number,
  mobile: boolean,
  reducedMotion = false
) {
  const beat = (Math.max(0, seconds) * exercise.spec.bpm) / 60;
  let index = 0;
  while (index + 1 < exercise.rounds.length && exercise.rounds[index + 1].onsetBeat <= beat)
    index++;
  const current = exercise.rounds[index];
  let from = keyboardRange(exercise, current, mobile);
  let to = from;
  let amount = 1;
  if (mobile && !reducedMotion) {
    const duration = (0.45 * exercise.spec.bpm) / 60;
    const previous = exercise.rounds[index - 1];
    const next = exercise.rounds[index + 1];
    if (previous && previous.endBeat >= current.onsetBeat && beat < current.onsetBeat + duration) {
      from = keyboardRange(exercise, previous, mobile);
      amount = (beat - current.onsetBeat) / duration;
    } else if (next && next.onsetBeat > current.endBeat) {
      // Use the rest to arrive before the next starting chord sounds.
      const start = Math.max(current.endBeat, next.onsetBeat - duration);
      if (beat >= start) {
        to = keyboardRange(exercise, next, mobile);
        amount = (beat - start) / (next.onsetBeat - start);
      }
    }
  }
  const t = Math.max(0, Math.min(1, amount));
  const eased = t * t * t * (t * (t * 6 - 15) + 10);
  const mix = (a: number, b: number) => a + (b - a) * eased;
  const left = mix(whiteKeyPosition(from.low), whiteKeyPosition(to.low));
  // Size keys once for the widest round. Only their horizontal position moves.
  const count = mobile
    ? mobileKeyCount(exercise)
    : whiteKeyPosition(from.high) - whiteKeyPosition(from.low) + 1;
  return {
    low: mobile ? Math.max(0, whiteKeyMidi(Math.floor(left) - 1)) : from.low,
    high: mobile ? whiteKeyMidi(Math.ceil(left + count)) : from.high,
    left,
    count,
  };
}
