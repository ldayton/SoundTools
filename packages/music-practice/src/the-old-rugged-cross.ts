import type { InstrumentHymn } from "./instrument-hymn";
import { standardPosition, standardFingers } from "./standard-hymn-editions";
import { findGuitarFingering } from "./guitar-chord-search";

/** Bb concert pitch, with a G-family reference for the automatic capo engine.
 * The short diminished chords retain Bennard's printed chromatic passing tones.
 * Each source system keeps its own pickup and complementary partial ending. */
export const ruggedEdition: InstrumentHymn = {
  title:"The Old Rugged Cross",key:"Bb",guitarKey:"G",guitarTranspose:-3,capo:3,tempo:80,meter:"6/8",
  changes:[
    [[0,"G"]],
    [[0,"G"],[12,"Gdim7"],[24,"G"]],
    [[0,"C"],[12,"Cdim"],[16,"D7/C"],[24,"C"],[40,"A"]],
    [[0,"D7"],[16,"G/D"],[24,"D7"],[32,"D"],[40,"D7"]],
    [[0,"G"]],
    [[0,"G"]],
    [[0,"G"],[12,"Gdim7"],[24,"G"]],
    [[0,"C"],[12,"Cdim"],[16,"D7/C"],[24,"C"],[40,"A"]],
    [[0,"D7"],[32,"G/D"],[40,"D7"]],
    [[0,"G"]],
    [[0,"D7"]],[[0,"D7"]],
    [[0,"G"],[8,"Gdim7"],[16,"C/G"],[24,"G"],[40,"G/B"]],
    [[0,"C"],[32,"D7/C"],[40,"C"]],
    [[0,"G"]],[[0,"G"]],
    [[0,"G"],[32,"C/G"],[40,"G"]],
    [[0,"C"]],
    [[0,"G/D"],[12,"D7"],[16,"G/D"],[24,"D7"]],
    [[0,"G"]],
  ],
  piano:{G:"[B,,D,F,]",Gdim7:"[B,,_D,=E,]",C:"[E,,G,,B,,]",Cdim:"[E,^F,A,]","D7/C":"[E,F,A,]",A:"[C,=E,G,]",D7:"[A,,C,E,]","G/D":"[B,,D,F,]",D:"[F,,A,,C,]","C/G":"[E,,G,,B,,]","G/B":"[B,,D,F,]"},
  // Low dominant thirds leave the A/D strings free for the low melody.
  guitar:{G:"G,",Gdim7:"G,",C:"C",Cdim:"C","D7/C":"C",A:"A,",D7:"^F,","G/D":"D",D:"^F,","C/G":"G,","G/B":"B,"},
  strum:{G:"[G,=B,=DG=Bg]",Gdim7:"[G,_B,_de]",C:"[C=EGc=e]",Cdim:"[C_E^f]","D7/C":"[CDAc^f]",A:"[A,=EA^c=e]",D7:"[=DAcf]","G/D":"[=DG=Bg]",D:"[=DAdf]","C/G":"[G,C=EGc=e]","G/B":"[=B,=DG=Bg]"},
  // Melody supplies G3; the other tonic tones occupy separate lower strings.
  guitarBars:{
    // Here the low melody supplies D; support it on open upper G/B strings.
    3:[["^F,",16],["[GB]",8],["^F,",8],["^F,",8],["^F,",8]],
    19:[["[G,B,DB]",40]],
  },
  barLengths:Array.from({length:4},()=>[8,48,48,48,40]).flat(),
  groups:[[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19]],
  marks:[{bar:0,label:"Verse"},{bar:10,label:"Refrain"}],
};
export function ruggedPosition(pitch:number,chord:boolean,transpose=0){
  const p:Record<number,[number,number]>={46:[4,1],51:[3,1],66:[0,2],67:[0,3]};
  const special=p[pitch-transpose];return special?{str:special[0],num:special[1]+transpose}:standardPosition(pitch,chord,transpose);
}
let planned:ReturnType<typeof standardFingers>;
export const ruggedFingers:ReturnType<typeof standardFingers>=(instrument,bar,voice,pitches)=>{
  if(instrument==="guitar"&&bar===19)return pitches.map(p=>({43:3,47:2} as Record<number,number>)[p-3]??null);
  if(instrument==="guitar"&&pitches.length>1){
    const positions=pitches.map(p=>ruggedPosition(p-3,true)),frets:(number|null)[]=Array(6).fill(null);
    for(const p of positions)if(p)frets[5-p.str]=p.num;
    const grip=findGuitarFingering(frets,{maxFingers:4,allowBarres:true});
    if(grip)return positions.map(p=>p?grip.fingers[5-p.str]||null:null);
  }
  planned ||= standardFingers(3,"the-old-rugged-cross",ruggedEdition);
  return planned(instrument,bar,voice,pitches).map((finger,i)=>instrument==="guitar"&&pitches[i]-3===51?1:finger);
};
