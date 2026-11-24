import abcjs, { type AudioTracks } from "abcjs";
import { swingBeat } from "./hymn-swing";

/** Optional sounding end, in abcjs whole-note units. Written rhythm stays intact. */
export type GuitarSustainEvent = { guitarRingUntil?: number };

/** Let available strings resonate within the harmony and each voice's phrasing.
 * abcjs supplies performed occurrences, including repeats, for rests and chord
 * changes. A rest in one voice does not silence the other guitar voices.
 */
export function guitarSustainAudio(audio: AudioTracks, abc: string, swing = false): AudioTracks {
  const tune = abcjs.parseOnly(abc)[0];
  tune.setUpAudio({ qpm: 60, chordsOff: true });
  const time = (whole: number) => swing ? swingBeat(whole * 4) / 4 : whole;
  const chords: { at: number; name: string }[] = [];
  const rests = new Map<string, number[]>();
  const detached = new Set<number>();
  const voiceIds: string[] = [];
  for (const line of tune.lines) for (const [si, staff] of (line.staff || []).entries()) {
    if (String(staff.clef?.type) === "TAB") continue;
    for (const [vi, voice] of (staff.voices || []).entries()) {
      const id = `${si}:${vi}`;
      if (!voiceIds.includes(id)) voiceIds.push(id);
      const stops = rests.get(id) || [];
      for (const item of voice) {
        if (item.el_type !== "note") continue;
        const performed = (item as typeof item & { currentTrackWholeNotes?: number | number[] }).currentTrackWholeNotes;
        const occurrences = Array.isArray(performed) ? performed : performed === undefined ? [] : [performed];
        if (item.rest && item.rest.type !== "spacer") stops.push(...occurrences.map(time));
        const chord = item.chord?.find((c: {position?: string}) => c.position === "default")?.name;
        if (chord) chords.push(...occurrences.map(at => ({ at: time(at), name: chord })));
        if (item.decoration?.some((d: string) => ["staccato", "staccatissimo", "palm-mute"].includes(d)))
          detached.add(item.startChar!);
      }
      rests.set(id, stops);
    }
  }
  const changes: number[] = [];
  // A repeated phrase starts fresh even when its first chord is unchanged.
  for (const track of audio.tracks) {
    let previousChar = -1;
    for (const event of track) if (event.cmd === "note") {
      if (event.startChar! < previousChar) changes.push(event.start);
      previousChar = event.startChar!;
    }
  }
  let previous = "";
  for (const chord of chords.sort((a, b) => a.at - b.at)) {
    if (chord.name !== previous) changes.push(chord.at);
    previous = chord.name;
  }
  return {
    ...audio,
    tracks: audio.tracks.map((track, index) => track.map(event => {
      if (event.cmd !== "note" || (event as typeof event & { playbackInstrument?: string }).playbackInstrument === "choir") return event;
      const writtenEnd = event.start + event.duration;
      const stops = [...changes, ...(rests.get(voiceIds[index]) || []), audio.totalDuration];
      const next = Math.min(...stops.filter(at => at > event.start + 1e-7));
      return { ...event, guitarRingUntil: detached.has(event.startChar!) ? writtenEnd : Math.max(writtenEnd, next) };
    })),
  };
}

/** A performance instruction, not a chord symbol or another selectable staff. */
export function markGuitarLetRing(abc: string) {
  const first = abcjs.parseOnly(abc)[0].lines.flatMap(line => line.staff || [])
    .flatMap(staff => staff.voices || []).flat()
    .find(item => item.el_type === "note" && item.pitches?.length);
  return first?.el_type === "note" ? abc.slice(0, first.startChar!) + '"^Let ring"' + abc.slice(first.startChar!) : abc;
}
