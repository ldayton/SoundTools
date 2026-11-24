import { EXERCISE_PATTERNS, isPentatonicPattern, isGlidePattern, type Pattern } from './music';
/** Match the sidebar's exercise families, followed by Breath Squares. */
export function adjacentExercise(
  pattern: Pattern,
  selected: 'warmup' | 'breathSquares',
  step: -1 | 1
) {
  const family = isPentatonicPattern(pattern)
    ? 'pentatonic6'
    : isGlidePattern(pattern)
      ? 'fifthGlide'
      : pattern === 'fiveNote'
        ? 'major'
        : pattern;
  const order = [...EXERCISE_PATTERNS, 'breathSquares'] as const;
  const index = selected === 'breathSquares' ? order.length - 1 : order.indexOf(family);
  const next = order[(index + step + order.length) % order.length];
  return next === 'breathSquares'
    ? { selected: 'breathSquares' as const }
    : { selected: 'warmup' as const, pattern: next };
}
