/** Instrument performance choices leave the written score and practice clock unchanged. */
export type PlaybackInstrument = "piano" | "guitar" | "organ" | "choir";
export type PerformanceOptions = {
  instrument: PlaybackInstrument;
  strum?: boolean;
  meter?: string;
  pickup?: number;
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
  /** Sounding end for let-ring guitar; independent of the written duration. */
  ringUntil?: number;
  volume: number;
  string?: number;
  fret?: number;
  delay?: number;
  gain?: number;
  expressionGain?: number;
  endGain?: number;
  role?: "melody" | "bass" | "inner";
  /** Inferred picking hand, not a claim of a separately recorded articulation. */
  pickingFinger?: "thumb" | "index" | "middle" | "ring";
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
  let previousPluck: {start: number; finger: "index" | "middle"} | undefined;
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    if (group.length > 1) previousPluck = undefined;
    const top = Math.max(...group.map((n) => n.pitch));
    // Phrase expression changes dynamics, never the score/practice clock.
    for (const note of group)
      note.volume = Math.min(
        1,
        note.volume * (note.pitch === top ? 0.92 : 0.72) * (options.instrument === "guitar" ? note.expressionGain ?? 1 : 1),
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
      // Respect edition positions; otherwise stay in the lowest available
      // position. Replaying a ringing string is preferable to jumping far up
      // the neck solely to preserve its previous note.
      const string =
        preferred !== undefined && candidates.includes(preferred)
          ? preferred
          : candidates.sort((a, b) => (note.pitch - guitarTuning[a]) - (note.pitch - guitarTuning[b]))[0];
      if (string === undefined) continue; // Out-of-range music still sounds at its written pitch.
      if (note.ringUntil !== undefined)
        note.duration = Math.max(note.duration, note.ringUntil - note.start);
      note.string = string;
      note.fret = note.pitch - guitarTuning[string];
      if (!options.strum) {
        // A thumb carries the bass; upper-string chords use i/m/a. Single
        // melodic attacks alternate i/m, restarting after a breath. This varies
        // the gesture's energy, never pitch/timing or the sample's identity.
        const alternate = previousPluck && note.start - previousPluck.start < 1.5;
        const finger = string < 3 ? "thumb" : group.length > 1
          ? (["index", "middle", "ring"] as const)[string - 3]
          : alternate && previousPluck?.finger === "index" ? "middle" : "index";
        note.pickingFinger = finger;
        if (group.length === 1 && (finger === "index" || finger === "middle")) previousPluck = {start: note.start, finger};
        const energy = finger === "thumb" ? 0.96 : finger === "index" ? 1 : finger === "middle" ? 0.96 : 1.02;
        note.volume = Math.min(1, note.volume * energy);
      }
      used.add(string);
      const previous = ringing.get(string);
      if (previous && previous.start + previous.duration > note.start)
        previous.duration = note.start - previous.start;
      ringing.set(string, note);
    }
    if (options.strum && group.length > 1) {
      const [beats, unit] = (options.meter || "4/4").split("/").map(Number);
      const compound = unit === 8 && beats % 3 === 0;
      const phase = group[0].start - (options.pickup || 0);
      const subdivision = Math.round(phase * 2);
      const cycle = compound ? 3 : 2;
      const part = ((subdivision % cycle) + cycle) % cycle;
      const up = compound ? part === 2 : part === 1;
      const ordered = [...group].sort(
        (a, b) => (up ? -1 : 1) * ((a.string ?? a.pitch) - (b.string ?? b.pitch)),
      );
      const strength = Math.max(...group.map(n => n.volume));
      // One gesture drives direction, travel time and strength together. Skipped
      // strings still take time to cross; stronger brushes move a little faster.
      const spread = 0.052 - 0.014 * strength;
      const first = ordered[0].string ?? 0;
      ordered.forEach((note, index) => {
        note.delay = Math.abs((note.string ?? index) - first) / 5 * spread;
        // A partial brush travels only across the authored strings; it never
        // adds missing chord tones. Upstrokes lean on the treble, downstrokes
        // on the bass, rather than treating all strings as equal impacts.
        const treble = (note.string ?? 2.5) / 5;
        note.volume *= up ? 0.86 + 0.10 * treble : 1 - 0.08 * treble;
      });
    }
  }
  return result;
}

export function pianoLayer(volume: number) {
  return volume < 0.56 ? 4 : volume < 0.72 ? 8 : 12;
}

export function guitarLayer(volume: number) {
  return volume < 0.55 ? 40 : volume < 0.8 ? 72 : 104;
}

/** Bank levels preserve existing piano/guitar balance; organ samples are sustain-normalized. */
export function playbackInstrumentGain(instrument: PlaybackInstrument) {
  return instrument === "choir" ? 1.85 : instrument === "organ" ? 0.82 : instrument === "guitar" ? 0.34 : 1.2;
}
