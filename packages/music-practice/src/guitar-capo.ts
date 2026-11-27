import abcjs from "abcjs";
import {planGuitarPhrase} from "./guitar-phrase-fingering";
import {guitarSustainAudio} from "./guitar-sustain";
import {playbackNotes} from "./hymn-playback";
import {performNotes} from "./playback-performance";
import {searchGuitarChords,findGuitarFingering,type GuitarChordVoicing} from "./guitar-chord-search";
export type CapoPosition={str:number;num:number};
type PositionFor=(pitch:number,chord:boolean,transpose?:number)=>CapoPosition|undefined;
/** scoreSetting only means reuse exact reference voicings; it grants no ranking preference. */
export type CapoChoice={fret:number;shapeKey:string;chords:string[];cost:number;scoreSetting:boolean;positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>;accompaniment?:ReadonlyMap<string,{positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>}>;voicings:ReadonlyMap<string,GuitarChordVoicing>;reasons:string[]};
const tuning=[64,59,55,50,45,40]; // abcjs high-E-first order
const limits={maxFingers:4,allowBarres:true};
const keyOf=(pitch:number,chord:boolean)=>`${pitch}:${chord?1:0}`;
const transposedChords=new Map<string,string>();
export function transposeCapoChord(chord:string,shift:number){
 const key=JSON.stringify([chord,shift]),cached=transposedChords.get(key);if(cached!==undefined)return cached;
 const source=`X:1\nL:1/4\nK:C\n"${chord}"C4 |]`;
 const result=(shift ? abcjs.strTranspose(source,abcjs.parseOnly(source),shift) : source).match(/"([^"]+)"/)![1].replaceAll("♯","#").replaceAll("♭","b");
 if(transposedChords.size>=512)transposedChords.delete(transposedChords.keys().next().value!);transposedChords.set(key,result);return result;
}
const factsCache=new Map<string,ReturnType<typeof scoreFacts>>();
function facts(abc:string,accompanimentOnly=false){
 const key=JSON.stringify([abc,accompanimentOnly]);let value=factsCache.get(key);
 if(!value){value=scoreFacts(abc,accompanimentOnly);if(factsCache.size>=64)factsCache.delete(factsCache.keys().next().value!);factsCache.set(key,value);}return value;
}
function scoreFacts(abc:string,accompanimentOnly=false){
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
 // A chord-only part may be revoiced; single-note instrumental fills stay exact.
 // Its proven chord grips are evaluated separately below, at their written rhythm.
 const notes=audio.tracks.flatMap(t=>t.flatMap(n=>n.cmd==="note"&&(!accompanimentOnly||!poly.get(n.startChar!))?[{pitch:n.pitch,key:keyOf(n.pitch,poly.get(n.startChar!)||false),start:n.start,end:n.start+n.duration}]:[]));
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
function positionsFor(frames:string[][],keys:string[],offset:number,positionFor:PositionFor,maxFret:number,fixed=false){
 const results:Map<string,CapoPosition>[]=[],seen=new Set<string>();
 const add=(positions:Map<string,CapoPosition>)=>{
  const signature=[...positions].sort(([a],[b])=>a.localeCompare(b)).map(([key,p])=>`${key}:${p.str}:${p.num}`).join("/");
  if(!seen.has(signature)&&assess(frames,positions)){seen.add(signature);results.push(new Map(positions));}
 };
 const preferred=new Map(keys.flatMap(key=>{const[p,c]=key.split(":");const original=positionFor(+p,c==="1",0);return original?[[key,{str:original.str,num:original.num+offset}] as const]:[];}));
 if(preferred.size===keys.length&&[...preferred].every(([key,p])=>p.num>=0&&p.num<=maxFret&&tuning[p.str]+p.num===Number(key.split(":")[0])+offset))add(preferred);
 if(fixed)return results;
 const neighbors=new Map(keys.map(k=>[k,new Set(frames.filter(f=>f.includes(k)).flat().filter(x=>x!==k))]));
 const domains=new Map(keys.map(key=>{const pitch=+key.split(":")[0]+offset;return [key,tuning.flatMap((open,str)=>{const num=pitch-open;return num>=0&&num<=maxFret?[{str,num}]:[]}).sort((a,b)=>a.num-b.num||a.str-b.str)] as const;}));
 const compatible=(a:CapoPosition,b:CapoPosition)=>a.str!==b.str&&(!a.num||!b.num||Math.abs(a.num-b.num)<=5);
 const chosen=new Map<string,CapoPosition>();let visited=0;
 // Bounded alternatives keep interactive selection responsive; every returned layout is proved.
 function visit(remaining:Map<string,CapoPosition[]>):void{
  if(++visited>512||results.length>=2)return;
  if(!remaining.size){add(chosen);return;}
  const [key,options]=[...remaining].sort((a,b)=>a[1].length-b[1].length||neighbors.get(b[0])!.size-neighbors.get(a[0])!.size||a[0].localeCompare(b[0]))[0];
  for(const p of options){
   chosen.set(key,p);const next=new Map(remaining);next.delete(key);let valid=true;
   for(const neighbor of neighbors.get(key)!){
    if(chosen.has(neighbor)&&!compatible(p,chosen.get(neighbor)!)){valid=false;break;}
    if(next.has(neighbor)){const d=next.get(neighbor)!.filter(q=>compatible(p,q));if(!d.length){valid=false;break;}next.set(neighbor,d);}
   }
   if(valid&&frames.filter(f=>f.includes(key)&&f.every(k=>chosen.has(k))).every(f=>!!assess([f],chosen)))visit(next);
   chosen.delete(key);if(visited>512||results.length>=2)break;
  }
 }
 if(![...domains.values()].some(d=>!d.length))visit(domains);
 return results;
}
type CapoInput={abc:string;accompanimentAbc?:string;sourceCapo:number;transpose:number;shapeKey:string;positionFor:PositionFor;requestedCapo?:number|null;bpm?:number;referencePerformanceAbc?:string;accompanimentOnly?:boolean};
const adviceCache=new Map<string,CapoChoice[]>();
const audioCache=new Map<string,ReturnType<typeof playbackNotes>>();
const positionIds=new WeakMap<PositionFor,number>();let nextPositionId=0;
const alternativeChords=new Map<string,GuitarChordVoicing[]>();
function chordAlternatives(name:string){
 if(!alternativeChords.has(name))alternativeChords.set(name,searchGuitarChords(name,{maxFret:5,limit:3,voicingPolicy:"complete"}).voicings);
 return alternativeChords.get(name)!;
}
/** Assess exactly the notes/string releases that playback will use, including let-ring. */
function phraseCost(input:CapoInput,choice:CapoChoice,shift:number,bpm:number){
 const abc=input.accompanimentOnly?capoAccompanimentAbc(input.abc,choice,shift):input.abc;
 let playback=audioCache.get(abc);
 if(!playback){const tune=abcjs.parseOnly(abc)[0];playback=playbackNotes(guitarSustainAudio(tune.setUpAudio({qpm:60,chordsOff:true}),abc));if(audioCache.size>=128)audioCache.delete(audioCache.keys().next().value!);audioCache.set(abc,playback);}
 const base=input.sourceCapo+input.transpose;
 let valid=true;
 // Coincident unisons in separate written voices are one physical contact.
 const attacks=new Map<string,ReturnType<typeof playbackNotes>[number]>();
 for(const n of playback){
  const key=`${n.start}:${n.pitch}`,previous=attacks.get(key);
  if(previous){previous.duration=Math.max(previous.duration,n.duration);previous.ringUntil=Math.max(previous.ringUntil??0,n.ringUntil??0);}
  else attacks.set(key,{...n});
 }
 const notes=performNotes([...attacks.values()].map(n=>({...n,pitch:n.pitch+base})),{instrument:"guitar",strum:input.accompanimentOnly,positionFor:(pitch,chord,group)=>{
  const p=capoPosition(choice,pitch-base,chord,0,group?.map(p=>p-base));
  if(!p){valid=false;return;}
  return {str:p.str,num:p.num+choice.fret};
 }});
 if(!valid||notes.some(n=>n.string===undefined||n.fret===undefined||n.fret<choice.fret||n.fret>24))return;
 const contacts=notes.map((n,i)=>({id:String(i),start:n.start,duration:n.duration,string:6-n.string!,fret:n.fret!-choice.fret})).filter(n=>n.duration>1e-7);
 const plan=planGuitarPhrase(contacts,{bpm,capo:choice.fret});if(!plan)return;
 // Normalize by musical duration, retaining the contribution of every repeated passage.
 const beats=Math.max(1,...contacts.map(n=>n.start+n.duration));
 const fingers=new Map<string,number>();
 for(const [key,p] of choice.positions){
  const pitch=Number(key.split(":")[0])+base;
  const fs=new Set(plan.notes.flatMap(n=>{const source=notes[Number(n.id)];return source?.pitch===pitch&&n.string===p.str+1?[n.finger]:[];}));
  if(fs.size===1)fingers.set(key,[...fs][0]);
 }
 return {cost:plan.cost/beats,fingers};
}
/** Rank the performed part; chord labels alone never stand in for a solo passage.
 * Lower capo height is a small secondary cost (0.01 per fret). Search is bounded,
 * so recommendations are proved playable alternatives rather than a global optimum.
 */
export function recommendGuitarCapos(input:CapoInput){
 const bpm=input.bpm??abcjs.parseOnly(input.abc)[0].metaText.tempo?.bpm??80;
 if(!positionIds.has(input.positionFor))positionIds.set(input.positionFor,++nextPositionId);
 const cacheKey=JSON.stringify([positionIds.get(input.positionFor),input.abc,input.accompanimentAbc,input.referencePerformanceAbc,input.sourceCapo,input.transpose,input.shapeKey,input.accompanimentOnly,bpm]);
 let choices=adviceCache.get(cacheKey);
 if(!choices){
  const {frames,keys,chords}=facts(input.abc,input.accompanimentOnly),accompaniment=input.accompanimentAbc?facts(input.accompanimentAbc):undefined;
  const scoreCapo=input.sourceCapo+input.transpose;choices=[];
  for(let fret=0;fret<12;fret++){
   const shift=scoreCapo-fret;
   // An authored reference pattern can differ from the revoiced alternatives.
   // Its fixed tab must be assessed exactly as performed, including picked notes.
   const reference=input.accompanimentOnly&&fret===scoreCapo&&input.referencePerformanceAbc;
   const performed=reference?{...input,abc:reference,accompanimentOnly:false}:input;
   const layoutFacts=reference?facts(reference):{frames,keys};
   const layouts=positionsFor(layoutFacts.frames,layoutFacts.keys,shift,input.positionFor,Math.min(19,24-fret),!!reference);
   let best:CapoChoice|undefined;
   for(let variant=0;variant<(input.accompanimentOnly?2:1);variant++){
    const grips=new Map<string,{positions:ReadonlyMap<string,CapoPosition>;fingers:ReadonlyMap<string,number>}>(),voicings=new Map<string,GuitarChordVoicing>();
    for(const name of new Set((accompaniment?.chords||chords).map(c=>c.name))){
     const alternatives=chordAlternatives(transposeCapoChord(name,shift)),v=alternatives[Math.min(variant,alternatives.length-1)];if(!v)continue;
     voicings.set(name.replaceAll("♯","#").replaceAll("♭","b"),v);
     const positions=new Map<string,CapoPosition>(),fingers=new Map<string,number>();
     for(const n of v.notes){const key=keyOf(n.midi-shift,true);positions.set(key,{str:n.string-1,num:n.fret});fingers.set(key,v.fingering.fingers[6-n.string]!);}
     grips.set(v.notes.map(n=>n.midi-shift).sort((a,b)=>a-b).join(","),{positions,fingers});
    }
    for(const positions of layouts){
     const choice:CapoChoice={fret,shapeKey:transposeCapoChord(input.shapeKey,shift),chords:[...new Set(chords.map(c=>transposeCapoChord(c.name,shift)))],cost:0,scoreSetting:(!input.accompanimentOnly||!!reference)&&fret===scoreCapo&&(!accompaniment||accompaniment.keys.every(key=>Number(key.split(":")[0])+shift>=40)),positions,fingers:new Map(),accompaniment:grips,voicings,reasons:[input.accompanimentOnly?"Chord accompaniment and fills assessed":"Melody and held bass assessed","Whole-phrase fingering and movement assessed"]};
     const result=phraseCost(performed,choice,shift,bpm);if(!result)continue;
     // A novice must learn each unfamiliar performed chord grip once; this is
     // separate from physical movement and never uses hypothetical solo chords.
     const performedGrips=new Set(chords.flatMap(c=>{const v=voicings.get(c.name.replaceAll("♯","#").replaceAll("♭","b"));return v&&v.rank.group!=="familiar-beginner"?[v.notes.map(n=>`${n.string}:${n.fret}`).join(",")]:[];}));
     const learning=input.accompanimentOnly?performedGrips.size:0;
     choice.cost=result.cost+learning+fret*.01;choice.fingers=result.fingers;
     if(!best||choice.cost<best.cost)best=choice;
    }
   }
   if(best)choices.push(best);
  }
  choices.sort((a,b)=>a.cost-b.cost||a.fret-b.fret);
  if(adviceCache.size>=32)adviceCache.delete(adviceCache.keys().next().value!);
  adviceCache.set(cacheKey,choices);
 }
 const best=choices[0]?.cost??0,shortlist=choices.filter(c=>c.cost<=best*1.25+.1).slice(0,3),requested=choices.find(c=>c.fret===input.requestedCapo);
 if(requested&&!shortlist.includes(requested))shortlist.push(requested);
 return shortlist.sort((a,b)=>a.cost-b.cost||a.fret-b.fret);
}
export function capoPosition(choice:CapoChoice,pitch:number,chord:boolean,transpose=0,group?:readonly number[]){
 const grip=group ? choice.accompaniment?.get(group.map(p=>p-transpose).sort((a,b)=>a-b).join(",")) : undefined;
 const positions=grip?.positions || choice.positions;
 return positions.get(keyOf(pitch-transpose,chord)) || positions.get(keyOf(pitch-transpose,!chord));
}

/** Generated pitches are explicit for safety. Engraving only needs an accidental
 * when it differs from the key or an earlier accidental in that voice/bar.
 */
function simplifyAccidentals(source:string){
 const tune=abcjs.parseOnly(source)[0],states=new Map<string,Map<string,number>>(),edits:{start:number;end:number;text:string}[]=[];
 const offsets:Record<string,number>={natural:0,sharp:1,flat:-1,dblsharp:2,dblflat:-2};
 for(const line of tune.lines)for(const[si,staff]of(line.staff||[]).entries())for(const[vi,voice]of(staff.voices||[]).entries()){
  const id=`${si}:${vi}`,state=states.get(id)||new Map<string,number>();states.set(id,state);
  const defaults=new Map((staff.key?.accidentals||[]).map(a=>[a.note.toUpperCase(),offsets[a.acc]]));
  for(const note of voice){
   if(note.el_type==="bar")state.clear();
   if(note.el_type!=="note")continue;
   const before=source.slice(note.startChar!,note.endChar!);
   const after=before.replace(/"[^"\n]*"|([_=^]+)([A-Ga-g])([,']*)/g,(all,acc:string,letter:string,tail:string)=>{
    if(!acc)return all;
    const octave=Number(letter===letter.toLowerCase())+[...tail].reduce((sum,c)=>sum+(c==="'"?1:-1),0),id=`${letter.toUpperCase()}:${octave}`;
    const value=acc==="="?0:acc[0]==="^"?acc.length:-acc.length,prior=state.get(id)??defaults.get(letter.toUpperCase())??0;
    state.set(id,value);return value===prior?letter+tail:all;
   });
   if(after!==before)edits.push({start:note.startChar!,end:note.endChar!,text:after});
  }
 }
 for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.end);
 return source;
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
 return simplifyAccidentals(source);
}
