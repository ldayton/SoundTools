import type { InstrumentHymn } from "./instrument-hymn";
import { standardPosition, standardFingers } from "./standard-hymn-editions";

/** One reference arrangement for the capo engine, not a privileged capo choice.
 * F is the printed/sounding key; D-family notation at capo 3 supplies a playable
 * starting position. The engine ranks all proven alternatives at runtime.
 */
export const sweetEdition: InstrumentHymn = {
  title:"In the Sweet By and By", key:"F", guitarKey:"D", guitarTranspose:-3,
  capo:3, tempo:80, meter:"4/4",
  changes:[
    [[0,"D"]],
    [[0,"D"],[32,"Em/G"]],
    [[0,"D"]],[[0,"D"]],[[0,"A"],[48,"D"]],
    [[0,"D"],[32,"Em/G"]],[[0,"D"]],
    [[0,"D"],[32,"Em/G"],[48,"D/A"],[56,"A"]],
    [[0,"D"]],[[0,"D"]],[[0,"A"],[56,"D/A"]],
    [[0,"A7"],[48,"D/A"],[56,"A"]],[[0,"D"]],
    [[0,"D"]],[[0,"G"]],
    [[0,"D"],[16,"D/A"],[32,"A7"],[48,"D/A"],[56,"A"]],
    [[0,"D"]],
  ],
  piano:{D:"[F,,A,,C,]",G:"[B,,D,F,]",A:"[C,E,G,]",A7:"[B,,C,E,]","Em/G":"[G,,B,,D,]","D/A":"[F,,A,,C,]"},
  // Low third/fifth basses leave the A and D strings free for the low melody.
  guitar:{D:"F,",G:"G,",A:"E,",A7:"E,","Em/G":"G,","D/A":"A,"},
  strum:{D:"[DAdf]",G:"[G,B,DGBg]",A:"[A,EAce]",A7:"[A,EGce]","Em/G":"[G,B,EGBe]","D/A":"[A,DAdf]"},
  // The final melody supplies root D; the other three chord tones sit above it.
  guitarBars:{16:[["[Adf]",48]]},
  barLengths:[16,...Array(16).fill(64)], endingRest:16,
  groups:[[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]],
  marks:[{bar:0,label:"Verse"},{bar:8,at:48,label:"Refrain"}],
};
export function sweetPosition(pitch:number,chord:boolean,transpose=0){
  return pitch-transpose===66 ? {str:0,num:2+transpose} : standardPosition(pitch,chord,transpose);
}
const fingers=()=>standardFingers(3,"in-the-sweet-by-and-by",sweetEdition);
let planned:ReturnType<typeof fingers>;
export const sweetFingers:ReturnType<typeof fingers>=(instrument,bar,voice,pitches)=>{
  if(instrument==="guitar"&&bar===16&&voice===1)return pitches.map(p=>({57:1,62:3,66:2} as Record<number,number>)[p-3]??null);
  planned ||= fingers();return planned(instrument,bar,voice,pitches);
};
