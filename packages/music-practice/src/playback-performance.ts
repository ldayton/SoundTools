/** Instrument performance choices leave the written score and practice clock unchanged. */
export type PlaybackInstrument = "piano" | "guitar" | "organ" | "choir";
export type PerformanceOptions = {
  instrument: PlaybackInstrument;
  strum?: boolean;
  positionFor?: (
    pitch: number,
    chord: boolean,
    group?: readonly number[],
  ) => { str: number; num: number } | undefined;
};
export type PerformanceNote = {
  instrument?: PlaybackInstrument;
  pitch: number;
  start: number;
  duration: number;
  volume: number;
  string?: number;
  fret?: number;
  delay?: number;
  gain?: number;
};
export const guitarTuning = [40, 45, 50, 55, 59, 64] as const;

export function performNotes(
  notes: PerformanceNote[],
  options: PerformanceOptions,
): PerformanceNote[] {
  // A combined score can contain choir and guitar on the same attack. Guitar
  // string damping and strum delays must never be applied to the singer.
  const parts=new Map<PlaybackInstrument,number[]>();
  notes.forEach((note,index)=>{const instrument=note.instrument||options.instrument;const indices=parts.get(instrument)||[];indices.push(index);parts.set(instrument,indices);});
  if([...parts.keys()].some(instrument=>instrument!==options.instrument)){
    const performed:PerformanceNote[]=Array(notes.length);
    for(const [instrument,indices]of parts){const result=performNotes(indices.map(i=>notes[i]),{...options,instrument});indices.forEach((index,i)=>performed[index]=result[i]);}
    return performed;
  }
  const result = notes.map((n) => ({ ...n }));
  const groups = new Map<number, PerformanceNote[]>();
  for (const note of result) {
    const group = groups.get(note.start) || [];
    group.push(note);
    groups.set(note.start, group);
  }
  const ringing = new Map<number, PerformanceNote>();
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    const top = Math.max(...group.map((n) => n.pitch));
    // Voice the melody without imposing rubato or random timing on a practice track.
    for (const note of group)
      note.volume = Math.min(
        1,
        note.volume * (note.pitch === top ? 0.92 : 0.72),
      );
    if (options.instrument !== "guitar") continue;
    // Give simultaneous chord attacks a little more presence than single-note plucks.
    if (group.length > 1) for (const note of group) note.gain = 10 ** (2 / 20);
    const used = new Set<number>();
    for (const note of [...group].sort((a, b) => b.pitch - a.pitch)) {
      const position = options.positionFor?.(
        note.pitch,
        options.strum || note.pitch !== top,
        group.map(n=>n.pitch),
      );
      const preferred = position ? 5 - position.str : undefined;
      const candidates = guitarTuning.flatMap((open, string) =>
        note.pitch >= open && note.pitch <= open + 24 && !used.has(string)
          ? [string]
          : [],
      );
      // Respect edition positions; otherwise prefer low frets and unoccupied strings.
      const string =
        preferred !== undefined && candidates.includes(preferred)
          ? preferred
          : candidates.sort((a, b) => {
              const cost = (s: number) =>
                note.pitch -
                guitarTuning[s] +
                ((ringing.get(s)?.start ?? -Infinity) +
                  (ringing.get(s)?.duration ?? 0) >
                note.start
                  ? 20
                  : 0);
              return cost(a) - cost(b);
            })[0];
      if (string === undefined) continue; // Out-of-range music still sounds at its written pitch.
      note.string = string;
      note.fret = note.pitch - guitarTuning[string];
      used.add(string);
      const previous = ringing.get(string);
      if (previous && previous.start + previous.duration > note.start)
        previous.duration = note.start - previous.start;
      ringing.set(string, note);
    }
    if (options.strum && group.length > 1) {
      const ordered = [...group].sort(
        (a, b) => (a.string ?? a.pitch) - (b.string ?? b.pitch),
      );
      ordered.forEach((note, index) => {
        note.delay = index * 0.009;
      });
    }
  }
  return result;
}

export function pianoLayer(volume: number) {
  return volume < 0.56 ? 4 : volume < 0.72 ? 8 : 12;
}

/** Bank levels preserve existing piano/guitar balance; organ samples are sustain-normalized. */
export function playbackInstrumentGain(instrument: PlaybackInstrument) {
  return instrument === "choir" ? 1.85 : instrument === "organ" ? 0.82 : instrument === "guitar" ? 0.34 : 1.2;
}
