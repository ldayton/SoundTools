import type { AbsoluteElement, TuneObject, VoiceItem } from "abcjs";
import { scoreSpellings, pitchLabel } from "./sight-feedback";
import {
  planPianoPhrase,
  pianoSameTime,
  unsupportedPianoHand,
  assemblePianoPhrase,
  type PianoPhraseNote,
  type PianoPhraseProfile,
  type PianoHand,
  type PianoDiagnostic,
  type PlannedPianoNote,
} from "./piano-phrase-fingering";
type Note = Extract<VoiceItem, { el_type: "note" }> & {
  abselem?: AbsoluteElement;
};
export type PianoScoreEntry = {
  id: string;
  hand: PianoHand;
  note: Note;
  pitchIndex: number;
  midi: number;
  start: number;
  absolute?: AbsoluteElement;
  label: string;
  fixedFinger?: number;
  authoredFinger?: boolean;
  tieFrom?: string;
};
export type PianoScoreOptions = {
  planningTune?: TuneObject;
  profile?: PianoPhraseProfile;
  hands?: ReadonlyMap<number, PianoHand>;
  fixedFinger?: (entry: PianoScoreEntry) => number | undefined;
};
/** Establish ownership once from the full source's declared staves; later clef
 * changes and hidden/reindexed visible staves do not change the player's hand. */
export function pianoScoreHands(
  tune: TuneObject,
  explicit?: ReadonlyMap<number, PianoHand>,
) {
  const result = new Map<number, PianoHand>(explicit);
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries()) {
      if (String(staff.clef?.type) === "TAB") continue;
      const index =
        (staff as typeof staff & { originalStaffIndex?: number })
          .originalStaffIndex ?? si;
      if (!result.has(index))
        result.set(index, staff.clef?.type === "bass" ? "left" : "right");
    }
  return result;
}
export function collectPianoScore(
  tune: TuneObject,
  hands = pianoScoreHands(tune),
  fixedFinger?: PianoScoreOptions["fixedFinger"],
) {
  const notes: PianoPhraseNote[] = [],
    entries: PianoScoreEntry[] = [],
    diagnostics: PianoDiagnostic[] = [],
    spellings = scoreSpellings(tune);
  const clocks = new Map<
    string,
    {
      at: number;
      previous: Map<number, { id: string; midi: number; end: number }>;
    }
  >();
  for (const line of tune.lines)
    for (const [si, staff] of (line.staff || []).entries()) {
      if (String(staff.clef?.type) === "TAB") continue;
      const staffIndex =
          (staff as typeof staff & { originalStaffIndex?: number })
            .originalStaffIndex ?? si,
        hand = hands.get(staffIndex)!;
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const key = `${staffIndex}:${vi}`,
          clock = clocks.get(key) ?? { at: 0, previous: new Map() };
        clocks.set(key, clock);
        for (const item of voice) {
          if (item.el_type !== "note") continue;
          const note = item as Note,
            duration = item.duration * 4,
            attacks = [...(item.midiPitches || [])];
          const allPitchesAtStart =
            clock.at === 0 && attacks.length === (item.pitches?.length || 0);
          const editorial = (item.decoration || []).filter((d: string) =>
            /^\d+$/.test(d),
          );
          if (
            editorial.length &&
            (item.pitches?.length !== 1 ||
              editorial.length !== 1 ||
              +editorial[0] < 1 ||
              +editorial[0] > 5)
          )
            diagnostics.push({
              hand,
              code: "ambiguous_fingering",
              at: clock.at,
            });
          for (const [pitchIndex, pitch] of (item.pitches || []).entries()) {
            const id = `${key}:${clock.at}:${pitchIndex}`,
              prior = clock.previous.get(pitch.pitch);
            let midi: number | undefined, tieFrom: string | undefined;
            if (pitch.endTie && prior && pianoSameTime(prior.end, clock.at)) {
              midi = prior.midi;
              tieFrom = prior.id;
            } else if (pitch.endTie) {
              // A cropped phrase can start on a continuation. Only establish a fresh
              // contact when its actual MIDI pitch is available; never guess a pitch.
              if (allPitchesAtStart) midi = attacks.shift()?.pitch;
            } else midi = attacks.shift()?.pitch;
            if (midi === undefined) {
              diagnostics.push({ hand, code: "unknown_pitch", at: clock.at });
              continue;
            }
            if (!(duration > 0)) {
              diagnostics.push({
                hand,
                code: "unsupported_notation",
                at: clock.at,
              });
              continue;
            }
            const entry: PianoScoreEntry = {
              id,
              hand,
              note,
              pitchIndex,
              midi,
              start: clock.at,
              absolute: note.abselem,
              label: pitchLabel(midi, spellings.get(item.startChar)),
              tieFrom,
            };
            const fixed =
              fixedFinger?.(entry) ??
              (editorial.length === 1 && item.pitches?.length === 1
                ? +editorial[0]
                : undefined);
            entry.fixedFinger = fixed;
            entry.authoredFinger =
              editorial.length === 1 && item.pitches?.length === 1;
            entries.push(entry);
            notes.push({
              id,
              hand,
              midi,
              start: clock.at,
              duration:
                !pitch.endTie &&
                !pitch.startTie &&
                (item.decoration || []).some(
                  (d: string) => d === "staccato" || d === "staccatissimo",
                )
                  ? duration * 0.5
                  : duration,
              notatedDuration: duration,
              voice: key,
              ...(tieFrom ? { tieFrom } : {}),
              ...(fixed !== undefined ? { finger: fixed } : {}),
            });
            clock.previous.set(pitch.pitch, {
              id,
              midi,
              end: clock.at + duration,
            });
          }
          clock.at += duration;
        }
      }
    }
  return { notes, entries, diagnostics };
}
export function planPianoScore(
  tune: TuneObject,
  options: PianoScoreOptions = {},
) {
  const source = options.planningTune ?? tune,
    hands = pianoScoreHands(source, options.hands),
    full = collectPianoScore(source, hands, options.fixedFinger);
  const tempo = source.metaText?.tempo,
    bpm = tempo?.bpm
      ? (tempo.bpm * (tempo.duration?.reduce((a, b) => a + b, 0) ?? 0.25)) /
        0.25
      : 120;
  const result = planPianoPhrase(full.notes, {
    ...options.profile,
    bpm: options.profile?.bpm ?? bpm,
  });
  for (const diagnostic of full.diagnostics)
    result.hands[diagnostic.hand] = unsupportedPianoHand(diagnostic);
  const plan = assemblePianoPhrase(
      result.hands,
      full.notes.map((n) => n.id),
    ),
    visible =
      source === tune
        ? full
        : collectPianoScore(tune, hands, options.fixedFinger);
  const planned = new Map<string, PlannedPianoNote>(
    plan.notes.map((n) => [n.id, n]),
  );
  return { plan, entries: visible.entries, planned, hands };
}
