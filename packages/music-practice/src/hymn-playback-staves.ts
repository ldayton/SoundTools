import abcjs, { type AudioTracks, type TuneObject } from "abcjs";
export type PlaybackStaff = {
  index: number;
  label: string;
  clef: string;
  tracks: number[];
};
/** Audio tracks follow real voices, not clefs: one printed staff can own many tracks. */
export function playbackStaves(tune: TuneObject): PlaybackStaff[] {
  type Staff = {
    voices?: unknown[][];
    clef?: { type?: string };
    title?: string[];
    brace?: unknown;
  };
  const system = (tune.lines.find((line) => line.staff?.length)?.staff ||
    []) as Staff[];
  let track = 0;
  let instrument = "";
  return system
    .filter((staff) => String(staff.clef?.type) !== "TAB")
    .map((staff, index) => {
      const title = (staff.title || []).find(Boolean) || "";
      if (title) instrument = title;
      const clef = String(staff.clef?.type || "treble").replace(/[-+].*/, "");
      const sameInstrument = title === "" && instrument && !!staff.brace;
      const name = title || (sameInstrument ? instrument : "");
      const shared = !!staff.brace;
      const label = name
        ? `${name}${shared ? ` · ${clef}` : ""}`
        : clef[0].toUpperCase() + clef.slice(1);
      const tracks = (staff.voices || []).map(() => track++);
      return { index, label, clef, tracks };
    });
}
/** abcjs can drop a staff title when its first token changes the local key.
 * Recover declared voice names before layout and before exposing staff controls.
 */
export function restoreDeclaredStaffTitles(tune:TuneObject,abc:string){
 const names=[...abc.matchAll(/^V:.*$/gm)].map(m=>m[0].match(/\bname="([^"]*)"/)?.[1]);
 let track=0;
 for(const staff of tune.lines.find(line=>line.staff?.length)?.staff||[]){
  const declared=(staff.voices||[]).map(()=>names[track++]).find(Boolean);
  const named=staff as typeof staff & {title?:string[]};
  if(declared&&!named.title?.some(Boolean))named.title=[declared];
 }
}
export function abcPlaybackStaves(abc: string) {
  const tune=abcjs.parseOnly(abc)[0];restoreDeclaredStaffTitles(tune,abc);
  return playbackStaves(tune);
}
/** Muting removes attacks only; voice indexes, rests and the full score clock survive. */
export function mutePlaybackStaves(
  audio: AudioTracks,
  staves: readonly PlaybackStaff[],
  muted: readonly number[],
) {
  const tracks = new Set(
    staves
      .filter((staff) => muted.includes(staff.index))
      .flatMap((staff) => staff.tracks),
  );
  return {
    ...audio,
    tracks: audio.tracks.map((track, index) =>
      tracks.has(index) ? track.filter((event) => event.cmd !== "note") : track,
    ),
  };
}

export function legacyHiddenStaves(
  staves: readonly PlaybackStaff[],
  hands: "both" | "left" | "right",
) {
  return hands === "both"
    ? []
    : staves
        .filter(
          (staff) => staff.clef !== (hands === "left" ? "bass" : "treble"),
        )
        .map((staff) => staff.index);
}
/** Let the engraver compact hidden staves; the complete source still owns audio. */
export function hidePlaybackStaves(
  tune: TuneObject,
  hidden: readonly number[],
) {
  for (const line of tune.lines) {
    if (!line.staff) continue;
    line.staff.forEach((staff,index) => {
      (staff as typeof staff & {originalStaffIndex?:number}).originalStaffIndex=index;
    });
    const remaining = line.staff.filter((_, index) => !hidden.includes(index));
    if (!remaining.length) continue; // all-hidden scores are suppressed after layout
    if (
      remaining.filter(
        (staff) => !!(staff as typeof staff & { brace?: unknown }).brace,
      ).length < 2
    )
      for (const staff of remaining) {
        delete (staff as typeof staff & { brace?: unknown }).brace;
        delete (staff as typeof staff & { bracket?: unknown }).bracket;
      }
    line.staff = remaining;
  }
}

type GuitarDisplay = "notation" | "tab" | "both" | "chords";
export function guitarStaffShown(display: GuitarDisplay, hidden: readonly number[], staff: "notation" | "tab") {
  return !hidden.includes(0) && (display === "both" || display === staff);
}
/** Tab is another view of the same music, so visibility reuses the existing display setting. */
export function toggleGuitarStaff(display: GuitarDisplay, hidden: readonly number[], staff: "notation" | "tab", shown: boolean, hasChords = true) {
  const notation = staff === "notation" ? shown : guitarStaffShown(display, hidden, "notation");
  const tab = staff === "tab" ? shown : guitarStaffShown(display, hidden, "tab");
  if(!notation && !tab && !hasChords)return {scoreDisplay:display,hiddenStaves:[0]};
  return {
    scoreDisplay: notation && tab ? "both" as const : notation ? "notation" as const : tab ? "tab" as const : "chords" as const,
    hiddenStaves: [],
  };
}
export function abcHasChordSymbols(abc: string) {
  return abcjs.parseOnly(abc)[0].lines.some(line => line.staff?.some(staff => staff.voices?.some(voice => voice.some(item => item.el_type === "note" && item.chord?.some((chord:{position?:string}) => chord.position === "default")))));
}
