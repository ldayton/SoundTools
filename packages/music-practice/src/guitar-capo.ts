import abcjs from "abcjs";
import {searchGuitarChords,findGuitarFingering,type GuitarChordVoicing} from "./guitar-chord-search";
export type CapoPosition={str:number;num:number};
type PositionFor=(pitch:number,chord:boolean,transpose?:number)=>CapoPosition|undefined;
export type CapoChoice={fret:number;shapeKey:string;chords:string[];cost:number;scoreSetting:boolean;positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>;accompaniment?:ReadonlyMap<string,{positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>}>;voicings:ReadonlyMap<string,GuitarChordVoicing>;reasons:string[]};
const tuning=[64,59,55,50,45,40]; // abcjs high-E-first order
const limits={maxFingers:4,allowBarres:true};
const keyOf=(pitch:number,chord:boolean)=>`${pitch}:${chord?1:0}`;
export function transposeCapoChord(chord:string,shift:number){
 const source=`X:1\nL:1/4\nK:C\n"${chord}"C4 |]`;
 return (shift ? abcjs.strTranspose(source,abcjs.parseOnly(source),shift) : source).match(/"([^"]+)"/)![1].replaceAll("♯","#").replaceAll("♭","b");
}
const chordCache=new Map<string,GuitarChordVoicing|undefined>();
function easiest(chord:string){
 if(!chordCache.has(chord))chordCache.set(chord,searchGuitarChords(chord,{maxFret:5,limit:1}).voicings[0]);
 return chordCache.get(chord);
}
function facts(abc:string){
 const tune=abcjs.parseOnly(abc)[0],poly=new Map<number,boolean>();
 const chords:{at:number;name:string}[]=[],clocks=new Map<string,number>();
 for(const l of tune.lines)for(const [s,staff]of(l.staff||[]).entries())for(const[v,voice]of(staff.voices||[]).entries()){
  const id=`${s}:${v}`;let at=clocks.get(id)||0;
  for(const n of voice)if(n.el_type==="note"){
   poly.set(n.startChar!,(n.pitches?.length||0)>1);
   const label=n.chord?.find((c:{position:string})=>c.position==="default")?.name;
   if(label)chords.push({at,name:label});at+=n.duration;
  }clocks.set(id,at);
 }
 const audio=tune.setUpAudio({qpm:60,chordsOff:true});
 const notes=audio.tracks.flatMap(t=>t.flatMap(n=>n.cmd==="note"?[{pitch:n.pitch,key:keyOf(n.pitch,poly.get(n.startChar!)||false),start:n.start,end:n.start+n.duration}]:[]));
 const frames=new Map<string,string[]>();
 for(const at of [...new Set(notes.flatMap(n=>[n.start,n.end]))]){
  const frame=[...new Set(notes.filter(n=>n.start<=at+1e-7&&n.end>at+1e-7).map(n=>n.key))].sort();
  if(frame.length)frames.set(frame.join("/"),frame);
 }
 return {frames:[...frames.values()],keys:[...new Set(notes.map(n=>n.key))],chords:chords.sort((a,b)=>a.at-b.at)};
}
function assess(frames:string[][],positions:ReadonlyMap<string,CapoPosition>){
 const fingers=new Map<string,Set<number>>();let effort=0,peak=0;
 for(const frame of frames){
  const frets:(number|null)[]=Array(6).fill(null);
  for(const key of frame){const p=positions.get(key);if(!p || frets[5-p.str]!==null)return;frets[5-p.str]=p.num;}
  const grip=findGuitarFingering(frets,limits);if(!grip)return;
  effort+=grip.effort;peak=Math.max(peak,grip.effort);
  for(const key of frame){const p=positions.get(key)!,f=grip.fingers[5-p.str]!;const set=fingers.get(key)||new Set<number>();set.add(f);fingers.set(key,set);}
 }
 return {cost:effort/Math.max(1,frames.length)*.5+peak*.5,fingers:new Map([...fingers].flatMap(([key,fs])=>fs.size===1?[[key,[...fs][0]] as const]:[]))};
}
/** Conservative global string assignments. Exact pitches and every held-note
 * overlap must fit; an unproven candidate is omitted rather than octaved away.
 */
function positionsFor(frames:string[][],keys:string[],offset:number,positionFor:PositionFor,maxFret:number){
 const preferred=new Map(keys.flatMap(key=>{const[p,c]=key.split(":");const original=positionFor(+p,c==="1",0);return original?[ [key,{str:original.str,num:original.num+offset}] as const ]:[];}));
 if([...preferred.values()].every(p=>p.num>=0&&p.num<=maxFret)&&preferred.size===keys.length&&assess(frames,preferred))return preferred;
 const neighbors=new Map(keys.map(k=>[k,new Set(frames.filter(f=>f.includes(k)).flat().filter(x=>x!==k))]));
 const domains=new Map(keys.map(key=>{const pitch=+key.split(":")[0]+offset;
  return [key,tuning.flatMap((open,str)=>{const num=pitch-open;return num>=0&&num<=maxFret?[{str,num}]:[]}).sort((a,b)=>a.num-b.num||a.str-b.str)] as const;
 }));
 const compatible=(a:CapoPosition,b:CapoPosition)=>a.str!==b.str&&(!a.num||!b.num||Math.abs(a.num-b.num)<=5);
 const chosen=new Map<string,CapoPosition>();
 function visit(remaining:Map<string,CapoPosition[]>):Map<string,CapoPosition>|undefined{
  if(!remaining.size)return assess(frames,chosen)?new Map(chosen):undefined;
  const [key,options]=[...remaining].sort((a,b)=>a[1].length-b[1].length||neighbors.get(b[0])!.size-neighbors.get(a[0])!.size||a[0].localeCompare(b[0]))[0];
  for(const p of options){
   chosen.set(key,p);const next=new Map(remaining);next.delete(key);let valid=true;
   for(const neighbor of neighbors.get(key)!){
    if(chosen.has(neighbor)&&!compatible(p,chosen.get(neighbor)!)){valid=false;break;}
    if(next.has(neighbor)){const d=next.get(neighbor)!.filter(q=>compatible(p,q));if(!d.length){valid=false;break;}next.set(neighbor,d);}
   }
   if(valid&&frames.filter(f=>f.includes(key)&&f.every(k=>chosen.has(k))).every(f=>!!assess([f],chosen))){const result=visit(next);if(result)return result;}
   chosen.delete(key);
  }
 }
 if([...domains.values()].some(d=>!d.length))return;
 return visit(domains);
}
/** Rank only physically proven choices. Costs are internal ordering values,
 * not a universal difficulty percentage. The authored setting stays available.
 */
export function recommendGuitarCapos(input:{abc:string;accompanimentAbc?:string;sourceCapo:number;transpose:number;shapeKey:string;positionFor:PositionFor}){
 const full=facts(input.abc),accompaniment=input.accompanimentAbc ? facts(input.accompanimentAbc) : undefined;
 const {frames,keys,chords}=full;
 const scoreCapo=input.sourceCapo+input.transpose;
 const candidates=[...new Set([0,1,2,3,4,5,6,7,scoreCapo])].filter(n=>n>=0&&n<=11),choices:CapoChoice[]=[];
 for(const fret of candidates){
  const shift=scoreCapo-fret,positions=positionsFor(frames,keys,shift,input.positionFor,Math.min(19,24-fret));if(!positions)continue;
  const mechanical=assess(frames,positions)!;
  const grips=new Map<string,{positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>}>();
  const chordVoicings=new Map<string,GuitarChordVoicing>();
  let accompanimentCost=0;
  for(const change of accompaniment?.chords || []){
    const shape=transposeCapoChord(change.name,shift),voicing=easiest(shape);if(!voicing)continue;
    chordVoicings.set(change.name.replaceAll("♯","#").replaceAll("♭","b"),voicing);
    const positions=new Map<string,CapoPosition>(),fingers=new Map<string,number>();
    for(const note of voicing.notes){const key=keyOf(note.midi-shift,true);positions.set(key,{str:note.string-1,num:note.fret});fingers.set(key,voicing.fingering.fingers[6-note.string]!);}
    grips.set(voicing.notes.map(n=>n.midi-shift).sort((a,b)=>a-b).join(","),{positions,fingers});
    accompanimentCost=Math.max(accompanimentCost,voicing.fingering.effort);
  }
  const names=chords.map(c=>transposeCapoChord(c.name,shift)),voicings=names.map(easiest);
  if(voicings.some(v=>!v))continue;
  const costs=voicings.map(v=>v!.rank.cost+(v!.rank.group==="other"?60:0));
  let movement=0;
  for(let i=1;i<voicings.length;i++){
   const a=voicings[i-1]!,b=voicings[i]!;
   movement+=Math.abs(a.rank.features.position-b.rank.features.position)/Math.max(.25,(chords[i].at-chords[i-1].at)*4);
  }
  const mean=costs.reduce((a,b)=>a+b,0)/Math.max(1,costs.length),worst=costs.length?Math.max(...costs):0;
  const cost=mean*.35+worst*.35+mechanical.cost*.2+accompanimentCost*.1+movement/Math.max(1,costs.length)*2+fret*.8;
  choices.push({fret,shapeKey:transposeCapoChord(input.shapeKey,shift),chords:[...new Set(names)],cost,scoreSetting:fret===scoreCapo,positions,fingers:mechanical.fingers,accompaniment:grips,voicings:chordVoicings,reasons:["Melody and held bass preserved",...(voicings.every(v=>!v?.fingering.barres.length)?["No chord barres"]:[])]});
 }
 choices.sort((a,b)=>a.cost-b.cost||a.fret-b.fret);
 const best=choices[0]?.cost??0;
 const shortlist=choices.filter(c=>c.cost<=best*1.25+5).slice(0,3);
 const authored=choices.find(c=>c.scoreSetting);
 if(authored&&!shortlist.includes(authored)){if(shortlist.length===3)shortlist.pop();shortlist.push(authored);}
 return shortlist.sort((a,b)=>a.cost-b.cost||a.fret-b.fret);
}
export function capoPosition(choice:CapoChoice,pitch:number,chord:boolean,transpose=0,group?:readonly number[]){
 const grip=group ? choice.accompaniment?.get(group.map(p=>p-transpose).sort((a,b)=>a-b).join(",")) : undefined;
 const positions=grip?.positions || choice.positions;
 return positions.get(keyOf(pitch-transpose,chord)) || positions.get(keyOf(pitch-transpose,!chord));
}

/** Alternative accompaniment uses ranked chord voicings. Melody/bass editions
 * retain every written pitch; accompaniment may redistribute chord octaves.
 */
export function capoAccompanimentAbc(source:string,choice:CapoChoice,shapeTranspose:number){
 if(choice.scoreSetting)return source;
 const tune=abcjs.parseOnly(source)[0],edits:{start:number;end:number;text:string}[]=[];
 const token=(midi:number)=>{
  // These dedicated guitar voices use the conventional octave treble clef.
  const written=midi+12,octave=Math.floor(written/12)-1;
  const names=["=C","^C","=D","^D","=E","=F","^F","=G","^G","=A","^A","=B"];
  return names[(written%12+12)%12]+(octave<4?",".repeat(4-octave):"'".repeat(octave-4));
 };
 const active=new Map<string,string>();
 for(const line of tune.lines)for(const[si,staff]of(line.staff||[]).entries())for(const[vi,voice]of(staff.voices||[]).entries()){
  const id=`${si}:${vi}`;
  for(const note of voice)if(note.el_type === "note"){
   const chord=note.chord?.find((c:{position:string})=>c.position==="default")?.name;
   if(chord)active.set(id,chord.replaceAll("♯","#").replaceAll("♭","b"));
   if(!note.pitches?.length)continue;
   const voicing=choice.voicings.get(active.get(id)||"");if(!voicing)throw Error("Missing capo accompaniment voicing");
   const before=source.slice(note.startChar!,note.endChar!);
   if(!/\[[^\]]+\]/.test(before))continue; // Retain instrumental fills between sung phrases.
   edits.push({start:note.startChar!,end:note.endChar!,text:before.replace(/\[[^\]]+\]/,`[${voicing.notes.map(n=>token(n.midi-shapeTranspose)).join("")}]`)});
  }
 }
 for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
 return source;
}
