import type { InstrumentHymn } from "./instrument-hymn";

/** Hoffman/Kravchuk A-flat score: offsets are 1/64-note units.
 * The instrumental parts are compact practice adaptations of the written SATB
 * harmony. Voice + Piano retains that source, including its independent echoes.
 * Guitar sounds an octave below the singer, using open G-family shapes/capo 1.
 */
export const washedEdition: InstrumentHymn = {
  title: "Are You Washed in the Blood?",
  key: "Ab",
  guitarKey: "G",
  guitarTranspose: -1,
  capo: 1,
  tempo: 80,
  meter: "4/4",
  changes: [
    [[0,"G"]],
    [[0,"G"]],
    [[0,"G"],[16,"C"],[32,"G"],[48,"G/B"],[56,"D"]],
    [[0,"G"],[48,"D/F#"],[56,"A7/E"]],
    [[0,"D"],[48,"G"],[56,"D7"]],
    [[0,"G"],[48,"D/A"],[56,"G/B"]],
    [[0,"C"]],
    [[0,"G"],[48,"D7"]],
    [[0,"G"],[56,"D7"]],
    [[0,"G"]],
    [[0,"C"]],
    [[0,"G"],[16,"G/B"],[24,"D"],[32,"G"],[48,"D7/F#"],[56,"G"]],
    [[0,"D"],[48,"G"],[56,"D7"]],
    [[0,"G"],[48,"D/A"],[56,"G/B"]],
    [[0,"C"]],
    [[0,"G"],[48,"D7"]],
    [[0,"G"]],
  ],
  // Close LH voicings keep the complete melody separate above the accompaniment.
  // The secondary dominant retains its D-natural (Bb7's third) and A-flat seventh.
  piano: {
    G:"[A,,C,E,]", C:"[D,F,A,]", D:"[E,G,B,]", D7:"[D,E,G,]",
    "G/B":"[A,,C,E,]", "D/F#":"[E,G,B,]", "A7/E":"[A,,B,,=D,]",
    "D/A":"[E,G,B,]", "D7/F#":"[D,E,G,]",
  },
  // Root G and open A basses leave the D string free for the low melody in 7/15.
  guitar: {G:"G,",C:"C",D:"D",D7:"A,","G/B":"B,","D/F#":"^F,","A7/E":"E,","D/A":"A,","D7/F#":"^F,"},
  strum: {
    G:"[G,B,DGBg]", C:"[CEGce]", D:"[DAdf]", D7:"[DAcf]",
    "G/B":"[B,DGBg]", "D/F#":"[F,DAdf]", "A7/E":"[E,A,EG^ce]",
    "D/A":"[A,DAdf]", "D7/F#":"[F,DAcf]",
  },
  barLengths: [16,...Array(15).fill(64),48],
  groups: [[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]],
  marks: [{bar:0,label:"Verse"},{bar:8,at:48,label:"Refrain"}],
};
