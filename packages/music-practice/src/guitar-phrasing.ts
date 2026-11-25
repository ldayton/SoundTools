import type { AudioTracks } from "abcjs";

export type PhraseTone = { start: number; duration: number; pitch: number; punctuation?: boolean };
export type GuitarPhrase = { start: number; end: number; lastStart: number };
export type GuitarExpressionEvent = { guitarExpressionGain?: number; guitarEndGain?: number };

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
    const strength = 0.6 * contrast + (harmonicChange ? 0.15 : 0) + (leap ? 0.15 : 0) + (note.punctuation ? 0.55 : 0);
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
export function guitarExpressionAudio(audio: AudioTracks, harmony: readonly number[], punctuation: ReadonlySet<number>): AudioTracks {
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
    });
  }
  const phrases = inferGuitarPhrases([...attacks.values()].sort((a, b) => a.start - b.start), harmony.map(at => at * 4));
  return {...audio, tracks: audio.tracks.map((track, index) => !guitar.includes(index) ? track : track.map(event => {
    if (event.cmd !== "note" || !isGuitar(event)) return event;
    const phrase = phrases.find(p => event.start * 4 >= p.start - 1e-7 && event.start * 4 < p.end);
    if (!phrase) return event;
    const progress = (event.start * 4 - phrase.start) / Math.max(phrase.end - phrase.start, 0.25);
    const arch = Math.sin(Math.PI * progress);
    const melody = !vocal.length && index === guide;
    return {...event,
      guitarExpressionGain: melody ? 0.94 + 0.14 * arch : 0.98 + 0.045 * arch,
      ...(melody && event.start * 4 === phrase.lastStart && event.duration * 4 >= 1
        ? {guitarEndGain: 0.84} : {}),
    };
  }))};
}
