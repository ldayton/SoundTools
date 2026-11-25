import type { AudioTracks } from "abcjs";

export type PhraseTone = { start: number; duration: number; pitch: number; punctuation?: boolean; cadence?: boolean };
export type GuitarPhrase = { start: number; end: number; lastStart: number };
export type GuitarExpressionEvent = { guitarExpressionGain?: number; guitarEndGain?: number; guitarRole?: "melody" | "bass" | "inner" };
export type PhraseHarmony = { at: number; root: number; dominant: boolean };
export type PhraseContext = { cadences?: readonly number[]; tonic?: number; meter?: string; pickup?: number };

/** A dominant-to-tonic arrival is supporting evidence, not a boundary by itself.
 * Chord roots (not slash basses) and the actual key keep inversions/transposition
 * from changing the result. Minor dominants are deliberately not assumed V.
 */
export function guitarCadences(chords: readonly PhraseHarmony[], tonic: number): number[] {
  return chords.flatMap((chord, i) => i > 0 && chord.root === tonic &&
    chords[i - 1].root === (tonic + 7) % 12 && chords[i - 1].dominant ? [chord.at] : []);
}

function metricalWeight(at: number, context: PhraseContext) {
  const [beats, unit] = (context.meter || "4/4").split("/").map(Number);
  const compound = unit === 8 && beats > 3 && beats % 3 === 0;
  const pulse = compound ? 1.5 : 4 / unit;
  const bar = beats * 4 / unit;
  const phase = ((at - (context.pickup || 0)) % bar + bar) % bar;
  if (Math.abs(phase) < 1e-6) return 1.035;
  return Math.abs(phase / pulse - Math.round(phase / pulse)) < 1e-6 ? 1 : 0.975;
}

/** Conservative local grouping, inspired by LBDM: duration contrast, gaps and
 * register changes reinforce each other. Harmony/underlay are supporting cues.
 * A barline alone is never a phrase boundary. Units are quarter-note beats.
 */
export function inferGuitarPhrases(tones: readonly PhraseTone[], harmony: readonly number[] = []): GuitarPhrase[] {
  if (!tones.length) return [];
  const phrases: GuitarPhrase[] = [];
  let first = 0;
  for (let i = 0; i < tones.length; i++) {
    const note = tones[i], next = tones[i + 1];
    const end = note.start + note.duration;
    const local = tones.slice(Math.max(0, i - 3), i + 4).map(n => n.duration).sort((a, b) => a - b);
    const typical = local[Math.floor(local.length / 2)];
    const contrast = Math.max(0, Math.min(1, (note.duration / Math.max(typical, 0.125) - 1) / 2));
    const gap = next ? next.start - end : 0;
    const harmonicChange = next && harmony.some(at => at > note.start && at <= next.start);
    const leap = next && Math.abs(next.pitch - note.pitch) >= 5;
    const strength = 0.6 * contrast + (harmonicChange ? 0.15 : 0) + (leap ? 0.15 : 0) + (note.punctuation ? 0.55 : 0)
      + (note.cadence && note.duration >= 2 ? 0.7 : 0);
    const supported = end - tones[first].start >= 3 && note.duration >= 1 && strength >= 0.65;
    if (!next || gap >= 0.25 || supported) {
      phrases.push({ start: tones[first].start, end, lastStart: note.start });
      first = i + 1;
    }
  }
  return phrases;
}

/** Shape a guitar performance without editing its score events. The singer may
 * guide accompaniment phrasing but is never processed as a guitar. A held final
 * melody note gently tapers; bass notes keep their own pulse and ringing policy.
 */
export function guitarExpressionAudio(audio: AudioTracks, harmony: readonly number[], punctuation: ReadonlySet<number>, context: PhraseContext = {}): AudioTracks {
  const tracks = audio.tracks.map(track => track.filter(event => event.cmd === "note"));
  const instrument = (note: object) => (note as {playbackInstrument?: string}).playbackInstrument;
  const isGuitar = (note: object) => !instrument(note) || instrument(note) === "guitar";
  const guitars = tracks.map(notes => notes.filter(isGuitar));
  const guitar = guitars.flatMap((notes, index) => notes.length ? [index] : []);
  if (!guitar.length) return audio;
  const vocals = tracks.map(notes => notes.filter(n => instrument(n) === "choir"));
  const vocal = vocals.flatMap((notes, index) => notes.length ? [index] : []);
  const candidates = vocal.length ? vocal : guitar, guides = vocal.length ? vocals : guitars;
  const mean = (index: number) => guides[index].reduce((sum, n) => sum + n.pitch, 0) / guides[index].length;
  const guide = candidates.reduce((best, index) => mean(index) > mean(best) ? index : best);
  const attacks = new Map<number, PhraseTone>();
  for (const event of guides[guide]) {
    const at = event.start * 4, previous = attacks.get(at);
    if (!previous || event.pitch > previous.pitch) attacks.set(at, {
      start: at, duration: event.duration * 4, pitch: event.pitch,
      punctuation: punctuation.has(event.startChar!),
      cadence: context.cadences?.some(t => Math.abs(t * 4 - at) < 1e-6) && context.tonic !== undefined &&
        [0, 3, 4, 7].includes((event.pitch - context.tonic + 120) % 12),
    });
  }
  const phrases = inferGuitarPhrases([...attacks.values()].sort((a, b) => a.start - b.start), harmony.map(at => at * 4));
  // Let the melodic contour move the climax within a restrained central window.
  // Repeated/transposed motifs therefore receive the same shape, without a
  // second pattern registry or boundaries invented at every barline.
  const peaks = new Map(phrases.map(phrase => {
    const tones = [...attacks.values()].filter(n => n.start >= phrase.start && n.start < phrase.end);
    const highest = Math.max(...tones.map(n => n.pitch));
    const apex = tones.filter(n => n.pitch === highest).reduce((best, n) =>
      Math.abs(n.start - (phrase.start + phrase.end) / 2) < Math.abs(best.start - (phrase.start + phrase.end) / 2) ? n : best);
    return [phrase, Math.max(0.3, Math.min(0.7, (apex.start - phrase.start) / Math.max(phrase.end - phrase.start, 0.25)))];
  }));
  const lowAt = new Map<number, number>();
  for (const event of guitars.flat()) lowAt.set(event.start, Math.min(lowAt.get(event.start) ?? Infinity, event.pitch));
  return {...audio, tracks: audio.tracks.map((track, index) => !guitar.includes(index) ? track : track.map(event => {
    if (event.cmd !== "note" || !isGuitar(event)) return event;
    const phrase = phrases.find(p => event.start * 4 >= p.start - 1e-7 && event.start * 4 < p.end);
    if (!phrase) return event;
    const progress = (event.start * 4 - phrase.start) / Math.max(phrase.end - phrase.start, 0.25);
    const peak = peaks.get(phrase)!;
    const arch = progress <= peak ? progress / peak : (1 - progress) / (1 - peak);
    const melody = !vocal.length && index === guide && event.pitch === attacks.get(event.start * 4)?.pitch;
    const bass = !melody && event.pitch === lowAt.get(event.start) && event.pitch < 60;
    const meter = metricalWeight(event.start * 4, context);
    return {...event,
      guitarRole: melody ? "melody" : bass ? "bass" : "inner",
      guitarExpressionGain: (melody ? 0.92 + 0.20 * arch : bass ? 0.98 + 0.025 * arch : 0.94 + 0.055 * arch) * meter,
      ...(melody && event.start * 4 === phrase.lastStart && event.duration * 4 >= 1
        ? {guitarEndGain: 0.84} : {}),
    };
  }))};
}
