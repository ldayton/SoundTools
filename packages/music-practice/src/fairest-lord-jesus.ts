import type { InstrumentHymn } from "./instrument-hymn";
import { standardPosition, standardFingers } from "./standard-hymn-editions";
import { findGuitarFingering } from "./guitar-chord-search";

/** Eb concert key; C-family reference notation. Runtime capo selection is owned
 * by the engine. Piano inversions keep seventh colours inside a fifth.
 */
export const fairestEdition: InstrumentHymn = {
  title:"Fairest Lord Jesus",key:"Eb",guitarKey:"C",guitarTranspose:-3,capo:3,tempo:80,meter:"4/4",
  changes:[
    [[0,"C"],[32,"Am"]],
    [[0,"Dm/F"],[16,"G"],[32,"C"]],
    [[0,"C"],[32,"Am"],[48,"A7"]],
    [[0,"Dm/F"],[16,"G"],[32,"C"]],
    [[0,"C"],[32,"F"],[48,"F/A"]],
    [[0,"C"]],
    [[0,"G7/B"],[32,"C"]],
    [[0,"G"]],
    [[0,"C/E"],[32,"F"],[48,"C/G"]],
    [[0,"A7"],[32,"Dm"]],
    [[0,"Dm"],[32,"A7"],[48,"Dm/F"]],
    [[0,"G7"],[32,"C"]],
    [[0,"E7/B"],[16,"Am"],[32,"C7/E"],[48,"F"]],
    [[0,"C/G"],[32,"G7"]],
    [[0,"C"]],
  ],
  piano:{C:"[E,G,B,]",Am:"[C,E,G,]",F:"[A,,C,E,]",G:"[B,,D,F,]",G7:"[A,,B,,D,]",A7:"[B,,C,=E,]",Dm:"[F,,A,,C,]","Dm/F":"[F,,A,,C,]","F/A":"[A,,C,E,]","G7/B":"[A,,B,,D,]","C/E":"[E,G,B,]","C/G":"[E,G,B,]","E7/B":"[F,G,=B,]","C7/E":"[_D,E,G,]"},
  // Minor colour stays complete above an open fifth bass; its root bass
  // would collide with the low melody on the A string.
  guitar:{C:"E,",Am:"[E,Ac]",F:"F,",G:"G,",G7:"G,",A7:"A,",Dm:"F,","Dm/F":"F,","F/A":"A,","G7/B":"B,","C/E":"E,","C/G":"G,","E7/B":"B,","C7/E":"E,"},
  strum:{C:"[CEGce]",Am:"[A,EAce]",F:"[FAcf]",G:"[G,B,DGBg]",G7:"[G,B,DGBf]",A7:"[A,EG^ce]",Dm:"[DAdf]","Dm/F":"[FAdf]","F/A":"[A,FAcf]","G7/B":"[B,DGBf]","C/E":"[E,CEGce]","C/G":"[G,CEGce]","E7/B":"[B,D^GBe]","C7/E":"[E,CE_Bce]"},
  // The final low melody is the tonic; the other chord tones use upper strings.
  guitarBars:{14:[["[EGc]",64]]},
  barLengths:Array(15).fill(64),groups:[[0,1,2,3],[4,5,6,7,8,9],[10,11,12,13,14]],marks:[],
};
const referenceFingers=standardFingers(3,"fairest-lord-jesus",fairestEdition);
export function fairestPosition(pitch:number,chord:boolean,transpose=0){
  return pitch-transpose===58?{str:2,num:3+transpose}:pitch-transpose===67?{str:0,num:3+transpose}:standardPosition(pitch,chord,transpose);
}
export const fairestFingers:typeof referenceFingers=(instrument,bar,voice,pitches)=>{
  if(instrument==="guitar"&&bar===14)
    return pitches.map(p=>({48:3,52:2,55:null,60:1} as Record<number,number|null>)[p-3]??null);
  if(instrument==="guitar"&&pitches.length>1){
    const positions=pitches.map(p=>fairestPosition(p-3,true));
    const frets:(number|null)[]=Array(6).fill(null);
    for(const p of positions)if(p)frets[5-p.str]=p.num;
    const grip=findGuitarFingering(frets,{maxFingers:4,allowBarres:true});
    if(grip)return positions.map(p=>p?grip.fingers[5-p.str]||null:null);
  }
  return referenceFingers(instrument,bar,voice,pitches);
};
