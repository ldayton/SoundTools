import { instrumentHymnAbc, type InstrumentHymn } from "./instrument-hymn";
import type { BeginnerInstrument } from "./beginner-score";
import abcjs from "abcjs";
import hymns from "./hymns.json";
import { planPianoFingering } from "./piano-fingering";

// These changes follow the checked-in Open Hymnal melody and cadences. Units
// are 1/64 of a whole note, including pickups and incomplete final measures.
export const blessedEdition: InstrumentHymn = {
  title:"Blessed Assurance",key:"D",guitarKey:"C",guitarTranspose:-2,capo:2,tempo:80,meter:"9/8",
  changes:[[[0,"C"]],[[0,"C"]],[[0,"C"]],[[0,"C"],[24,"D7"]],[[0,"G7"],[48,"C"]],
    [[0,"C"]],[[0,"C"]],[[0,"F"],[24,"G7"]],[[0,"C"]],
    [[0,"C"],[48,"F"]],[[0,"C"]],[[0,"F"],[24,"C/E"],[48,"D7"]],[[0,"Am"],[48,"G7"]],
    [[0,"C"],[48,"F"]],[[0,"C"]],[[0,"F"],[24,"G7"]],[[0,"C"]]],
  piano:{C:"[D,F,A,]",F:"[G,,B,,D,]",G7:"[C,E,G,]",D7:"[^G,B,D]","C/E":"[F,A,]",Am:"[B,,D,F,]"},
  guitar:{C:"C",F:"F,",G7:"G,",D7:"^F,","C/E":"E,",Am:"A,"},
  strum:{C:"[CEGce]",F:"[FAcf]",G7:"[G,B,DGBf]",D7:"[D^FAc]","C/E":"[E,CEGce]",Am:"[A,EAce]"},
  guitarBars:{0:[["E,",24]],6:[["E,",72]],14:[["E,",72]],4:[["G,",48],["E,",24]],8:[["E,",48],["C",24]],16:[["G,",48]]},
  barLengths:[24,...Array(15).fill(72),48],
  groups:[[0,1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16]],
  marks:[{bar:0,label:"Verse"},{bar:8,at:48,label:"Refrain"}],
};
export const silentEdition: InstrumentHymn = {
  title:"Silent Night",key:"Bb",guitarKey:"A",guitarTranspose:-1,capo:1,tempo:80,meter:"3/4",
  changes:[[[0,"A"]],[[0,"A"]],[[0,"E7"]],[[0,"A"]],[[0,"D"]],[[0,"A"]],[[0,"D"]],[[0,"A"]],[[0,"E7"]],[[0,"A"]],[[0,"A"],[24,"E7"]],[[0,"A"]]],
  piano:{A:"[B,,D,F,]",D:"[E,G,B,]",E7:"[A,,C,E,]"},
  guitar:{A:"E,",D:"F,",E7:"E,"},
  strum:{A:"[A,EAce]",D:"[DAdf]",E7:"[E,B,DGBe]"},
  // The melody supplies the low A; place the remaining tonic tones above it.
  guitarBars:{10:[["E,",24],["E,",24]],11:[["[EAc]",48]]},
  barLengths:Array(12).fill(48),groups:[[0,1,2,3],[4,5,6,7],[8,9,10,11]],marks:[],
};
export const joyEdition: InstrumentHymn = {
  title:"Joy to the World",key:"D",guitarKey:"C",guitarTranspose:-2,capo:2,tempo:80,meter:"2/4",
  changes:[[[0,"C"]],[[0,"C"],[24,"F"]],[[0,"G7"]],[[0,"C"]],[[0,"F"]],[[0,"G7"]],[[0,"C"]],
    [[0,"C"]],[[0,"C"]],[[0,"C"]],[[0,"C"]],[[0,"C"]],[[0,"C"]],[[0,"G7"]],[[0,"G7"]],
    [[0,"C"],[24,"F"]],[[0,"C"],[24,"F"]],[[0,"G7"]],[[0,"C"]]],
  piano:{C:"[D,F,A,]",F:"[G,,B,,D,]",G7:"[C,E,G,]"},
  guitar:{C:"C",F:"F,",G7:"G,"},strum:{C:"[CEGce]",F:"[FAcf]",G7:"[G,B,DGBf]"},
  // Final melody C is the root bass, with E and G on separate upper strings.
  guitarBars:{3:[["E,",32]],15:[["E,",24],["F,",8]],18:[["[EG]",32]]},
  barLengths:Array(19).fill(32),groups:[[0,1,2,3],[4,5,6],[7,8,9,10],[11,12,13,14],[15,16,17,18]],marks:[],
};
const positions: Record<number,[number,number]>={40:[5,0],41:[5,1],42:[5,2],43:[5,3],45:[4,0],47:[4,2],48:[4,3],49:[4,4],50:[3,0],52:[3,2],53:[3,3],54:[3,4],55:[2,0],56:[2,1],57:[2,2],59:[1,0],60:[1,1],61:[1,2],62:[1,3],64:[0,0],65:[0,1]};
export function standardPosition(pitch:number,_chord:boolean,transpose=0){const p=positions[pitch-transpose];return p?{str:p[0],num:p[1]+transpose}:undefined;}
export function standardFingers(capo:number, slug:string){
  const hymn=hymns.find(h=>h.slug===slug)!;
  const tune=abcjs.parseOnly(hymn.melody)[0]; tune.setUpAudio({chordsOff:true});
  let bar=0, seen=false;
  const notes:{bar:number;midi:number;duration:number}[]=[];
  for(const line of tune.lines)for(const n of line.staff?.[0]?.voices?.[0]||[]){
    if(n.el_type==="bar" && seen){bar++;seen=false;}
    if(n.el_type==="note"){if(n.midiPitches?.length)notes.push({bar,midi:n.midiPitches[0].pitch,duration:n.duration});seen=true;}
  }
  const planned=planPianoFingering(notes,"right");
  const melody=new Map(notes.map((n,i)=>[`${n.bar}:${n.midi}`,planned[i].finger]));
  const config=slug === "blessed-assurance" ? blessedEdition : slug === "silent-night" ? silentEdition : joyEdition;
  const guitarTune=abcjs.parseOnly(instrumentHymnAbc(hymn.melody.split("\n").filter(line=>line.trim()&&!/^w:/.test(line)).join("\n")+"\n",config,"guitar"))[0];
  const guitarAudio=guitarTune.setUpAudio({chordsOff:true}).tracks.map(t=>t.filter(n=>n.cmd==="note"));
  const bassFingers=new Map<number,Set<number>>();let elapsed=0;
  for(const [bar,length]of config.barLengths!.entries()){
    const sounding=guitarAudio[1].filter(n=>n.start<elapsed+length/64&&n.start+n.duration>elapsed);
    bassFingers.set(bar,new Set(sounding.flatMap(n=>{const fret=positions[n.pitch]?.[1];return fret?[Math.min(4,fret)]:[];})));elapsed+=length/64;
  }
  return (instrument:BeginnerInstrument,bar:number,voice:number,pitches:number[]):(number|null)[]=>{
    if(instrument==="piano") return pitches.map((pitch,i)=>voice===1?[5,3,1][i]??null:melody.get(`${bar}:${pitch}`)??null);
    return pitches.map(p=>{
      if(slug === "silent-night" && bar === 11 && voice === 1)
        return ({52:1,57:2,61:3} as Record<number,number>)[p-capo] ?? null;
      const pos=positions[p-capo];if(!pos?.[1])return null;
      const preferred=voice===0 && [48,62].includes(p-capo)?4:Math.min(4,pos[1]);
      if(voice===1 || !bassFingers.get(bar)?.has(preferred))return preferred;
      return [1,2,3,4].find(finger=>!bassFingers.get(bar)?.has(finger))??null;
    });
  };
}
