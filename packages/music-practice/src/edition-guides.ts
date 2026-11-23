import type { ChordEditionKey } from "./instrument-editions";
export type EditionGuide = {
  meter: string;
  piano: string;
  guitar: string;
  strum: string;
};
export const editionGuides: Record<ChordEditionKey, EditionGuide> = {
  "in-christ-alone": {
    meter: "Teacher arrangement in D major, 3/4. The pickup and final bar each last one and a half beats. Each written pass has 60 beats, including the printed organ interlude; all four verses share this ending.",
    piano: "Keep the teacher’s melody and rests. Shift for high D and C♯, then follow the upper organ line through the interlude. Left-hand chords stay below the melody.",
    guitar: "Capo 2. Positions I, III and VII match the existing edition. An open E bass under C/E frees the high C–B leap. During the interlude, keep the C bass light while the melody moves on the D string.",
    strum: "Small F uses strings 4–1. C/E adds the open low E. Dm is xx0231; G7 is 320001. Chord accompaniment follows the teacher’s changes and ending.",
  },
  "amazing-grace": {
    meter:
      "G major, 3/4. The pickup lasts one beat; the final bar has two beats. Each verse uses the same melody and ending.",
    piano:
      "Shift your right hand for high D, then return to the opening position. The compact D7 voicing omits the root; every left-hand chord fits within a fifth.",
    guitar:
      "The melody sounds one octave below Piano and stays in first position. On D7, F♯ bass and C support the melody’s A; the root is omitted. A dash in Chords only means hold the previous chord.",
    strum:
      "For C, strum strings 5–1; for D7, strings 4–1. G and Em use all six strings.",
  },
  "ill-fly-away": {
    meter:
      "C major, 4/4, straight rhythm. There is no pickup. Verse: bars 1–8; chorus: 9–16. The final fermata invites a longer hold in performance; playback follows the written four beats.",
    piano:
      "The melody spans G3–G4. Reposition for the upper ornaments and chorus. C–E dyads and compact F and rootless G7 chords fit within a fifth.",
    guitar:
      "The melody stays in first position, reaching fret 4 for D♯. G7 uses a B–F shell. A dash means keep the chord. The optional strum pattern is for accompaniment; practice checks chord changes.",
    strum:
      "C uses strings 5–1; small F uses 4–1; G7 uses all six. Fingerstyle uses lighter voicings.",
  },
  "jesus-loves-me": {
    meter:
      "E♭ major, 4/4. There is no pickup. Verse: bars 1–8; refrain: 9–16. Each selected verse uses the same melody and refrain.",
    piano:
      "Keep the source E♭ melody in the right hand. Shift for the high E♭ in the refrain and upper phrases. Left-hand E♭, A♭ and rootless B♭7 chords fit within a fifth.",
    guitar:
      "Capo 3 with C-family shapes sounds in E♭. The complete melody sounds one octave below Piano, within frets 0–3. Use the low G bass when the melody occupies the C string position; this avoids playing two notes on one string. G7 uses the F–B shell.",
    strum:
      "C uses strings 5–1; small F uses 4–1; G7 uses all six. The strummed shapes are fuller than the fingerstyle voicings.",
  },
  "o-come-all-ye-faithful": {
    meter:
      "G major, 4/4. Begin with a one-beat pickup; the final bar has three beats. The refrain starts with ‘O’ on the last beat of bar 12. Count through the quarter rest in bar 8.",
    piano:
      "The melody spans D4–D5. Reposition between the lower D–A and upper G–D ranges; finger numbers suggest starting points. Compact left-hand chords fit within a fifth. A7 retains the source’s C♯ leading into D.",
    guitar:
      "The complete melody sounds one octave below Piano and stays in first position, reaching fret 4. Let the bass ring while the melody moves. D uses F♯ bass; D7 adds C, and A7 uses a G–C♯ shell. Use finger 4 for the high D and finger 1 for E or A so the held bass stays free.",
    strum:
      "G and Em use all six strings; A7, C and Am use strings 5–1; D and D7 use 4–1. Small Bm is xx4432, a four-string shape without a barre. Fingerstyle uses lighter voicings.",
  },
};
