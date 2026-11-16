export type PianoVoice = { pitch: number; start: number };
/** Ending one voice of a unison is a release, not another strike of the remaining voice. */
export function newPianoAttacks(
  previous: readonly PianoVoice[],
  next: readonly PianoVoice[],
): number[] {
  const sounding = new Set(
    previous.map((note) => `${note.pitch}:${note.start}`),
  );
  return [
    ...new Set(
      next
        .filter((note) => !sounding.has(`${note.pitch}:${note.start}`))
        .map((note) => note.pitch),
    ),
  ];
}
