import abcjs from "abcjs";
import type { HymnLyricData } from "./hymn-lyrics";
import type { BeginnerInstrument } from './beginner-score';
export const isChristAlone = (hymn: {id:string}) => hymn.id === 'in-christ-alone';

// Capo-relative C/F/G/Am accompaniment from scores/in-christ-alone-music.ily
// in ldayton/tab-music. Written pitches use the conventional guitar octave clef.
const chords = {
 C: '[CEGce]', F: '[FAcf]', G: '[G,B,DGBg]', Am: '[A,EAce]',
};
const bars: [keyof typeof chords, number][][] = [
 [['F',3]], [['C',4],['F',2]], [['G',4],['C',2]], [['F',2],['G',4]],
 [['C',4],['F',2]], [['C',4],['F',2]], [['G',4],['C',2]], [['F',2],['G',4]],
 [['C',4],['C',2]], [['F',4],['C',2]], [['G',4],['C',2]], [['F',4],['C',2]],
 [['G',4],['F',2]], [['C',4],['F',2]], [['G',4],['C',2]], [['F',2],['G',4]],
 [['C',6]], [['C',6]], [['F',6]], [['Am',6]], [['C',6]],
];
export const christGuitarAbc = 'X:1\nT:In Christ Alone\nM:3/4\nL:1/8\nQ:1/4=70\nV:S1 clef=treble-8\nK:C\n' +
 [[0],[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]].map(group=>
  `[V:S1] ${group.map(index=>bars[index].map(([chord,duration])=>`"${chord}"${chords[chord]}${duration}`).join(' ')+` ${index===20?'|]':'|'}`).join(' ')}\n`).join('');

/** Printed fingering/tablature positions are relative to capo 2. */
export function christGuitarPosition(pitch:number, chord:boolean, transpose=0) {
 const p = pitch-transpose;
 const position: Record<number,[number,number]> = {
  43:[5,3],47:[4,2],50:[3,0],55:[2,0],59:[1,0],67:[0,3],
  48:[4,3],52:[3,2],60:[1,1],64:[0,0],
  53:[3,3],57:[2,2],65:[0,1],45:[4,0],
 };
 const entry=position[p];return entry ? {str:entry[0],num:entry[1]+transpose} : undefined;
}
export function christFingers(instrument:BeginnerInstrument,bar:number,voice:number,pitches:number[],force=false):(number|null)[] {
 if(instrument==='guitar') {
  pitches=pitches.map(p=>p-2);
  const set:Record<number,number|undefined>=pitches.includes(53) ? {53:3,57:2,60:1,65:1} : pitches.includes(43) ? {43:3,47:2,67:4}
   : pitches.includes(45) ? {52:2,57:3,60:1} : {48:3,52:2,60:1};
  return pitches.map(p=>set[p]??null);
 }
 if(voice===1) return pitches.map((_,i)=>[5,3,1][i]??null);
 const fingers:Record<number,number> = bar<8 || bar>=12 && bar<17 ? {57:1,59:2,62:3,64:4,66:5}
  : bar===8 ? {62:1,66:2,69:4} : bar===9 ? {71:5,69:4,66:2}
  : bar===10 ? {64:2,62:1,74:5,73:4} : bar===11 ? {71:3,69:2,66:1} : {62:1,66:3};
 // Repeated figures need no second set of annotations.
 const show = force || [0,2,8,9,10,11,12,17,19].includes(bar);
 return pitches.map(p=>show ? fingers[p]??null : null);
}
export function christLandmarks(abc:string,from=0,guitar=false) {
 if (!/^Q:/m.test(abc)) abc=abc.replace(/^K:/m,"Q:1/4=70\nK:");
 let bar=from;
 return '%%barnumbers 1\n%%barnumberfont serif 10\n%%partsfont serif 12\n%%partsbox 1\n'+abc.split('\n').map(line=>{
  if(!/^\[V:(?:S1|v0)\]/.test(line))return line;
  return line.replace(/(\[V:[^\]]+\]|\|\]?)\s*([^|]*)/g,(all,delimiter:string,music:string)=>{
   if(!music.trim())return all;
   const label=bar===0 ? guitar?'Capo 2':'Verse' : bar===17?'Ending':undefined;
   bar++;
   return `${delimiter} ${label?`[P:${label}] `:''}${music}`;
  });
 }).join('\n');
}

export function christGuitarChordOffset(bar:number) {
 return bars.slice(0,bar).reduce((sum,bar)=>sum+bar.length,0);
}

/** Align every selected verse to chord changes using the melody's actual rhythm. */
export function christGuitarLyricData(hymn:HymnLyricData & {harmony:string}):HymnLyricData {
 let elapsed=0;
 const changes=bars.flatMap(bar=>bar.map(([,duration])=>{const start=elapsed;elapsed+=duration/8;return start;}));
 let time=0;
 const melody=abcjs.parseOnly(hymn.harmony)[0].lines.flatMap(line=>line.staff?.[0]?.voices?.[0]||[])
  .flatMap(note=>{
   if(note.el_type!=="note")return [];
   const start=time;time+=note.duration;
   return note.pitches?.length ? [start] : [];
  });
 const groupFor=(start:number)=>Math.max(0,changes.reduce((last,change,index)=>change<=start+1e-7?index:last,-1));
 return {
  stanzas:hymn.stanzas.map(stanza=>{
   const chunks=changes.map(()=>[] as string[]);
   melody.forEach((start,index)=>{
    const syllable=stanza.syllables[index];
    if(syllable && syllable!=="*")chunks[groupFor(start)].push(syllable);
   });
   return {...stanza,syllables:chunks.map(tokens=>tokens.reduce((text,token)=>
    text.endsWith('-') ? text.slice(0,-1)+token : text ? text+'~'+token : token,'')||'*')};
  }),
  lyricSections:[{start:christGuitarChordOffset(17),end:changes.length}],
 };
}

/** abcjs octave-clef voices override its global MIDI transpose; apply the capo explicitly. */
export function christCapoAudio(audio:import('abcjs').AudioTracks):import('abcjs').AudioTracks {
 return {...audio,tracks:audio.tracks.map(track=>track.map(event=>event.cmd==='note'?{...event,pitch:event.pitch+2}:event))};
}
