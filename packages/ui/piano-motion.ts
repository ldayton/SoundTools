export type PianoVoice = { pitch: number; start: number };

/** Releases and tied continuations must not animate as fresh attacks. */
export function newPianoAttacks(
  previous: readonly PianoVoice[],
  next: readonly PianoVoice[],
) {
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

export function strikePianoKey(key: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  return key.animate(
    [{ filter: "brightness(0.75)" }, { filter: "brightness(1)" }],
    { duration: 120 },
  );
}
