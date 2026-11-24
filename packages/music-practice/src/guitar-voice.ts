import abcjs from "abcjs";
import {capoAccompanimentAbc,transposeCapoChord,type CapoChoice} from "./guitar-capo";
/** Singing owns the melody; the guitar plays its separate chord accompaniment.
 * The voice is at concert pitch; guitar notation and chord symbols are capo-relative.
 * A per-staff MIDI transpose keeps the singer independent of the capo.
 */
export function guitarVoiceAbc(melody:string,accompaniment:string,sourceCapo:number,transpose=0,choice?:CapoChoice){
 const capo=choice?.fret ?? sourceCapo+transpose,shapeShift=sourceCapo+transpose-capo;
 let guitar=(choice?capoAccompanimentAbc(accompaniment,choice,shapeShift):accompaniment).replace(/"\^[^"\n]*"/g,"");
 const quoted=[...guitar.slice(guitar.search(/^K:/m)).matchAll(/"([^"\n]+)"/g)].map(m=>transposeCapoChord(m[1],shapeShift));
 guitar=abcjs.strTranspose(guitar,abcjs.parseOnly(guitar),shapeShift);
 const guitarKey=guitar.match(/^K:(.*)$/m)![1];
 let i=0;
 const body=(abc:string,id:string,lyrics:boolean)=>abc.slice(abc.match(/^K:.*\n/m)!.index!+abc.match(/^K:.*\n/m)![0].length)
  .replace(/\[V:[^\]]+\]/g,`[V:${id}]`).split("\n").filter(l=>l.trim()&&(lyrics||!/^w:/.test(l))).join("\n");
 let sung=transpose?abcjs.strTranspose(melody,abcjs.parseOnly(melody),transpose):melody;
 // Source vocal scores use several ABC unit lengths. Normalize the vocal
 // tokens rather than interpreting guitar's 1/64 durations as quarter notes.
 const end=sung.match(/^K:.*\n/m)!;
 sung=sung.slice(0,end.index!+end[0].length)+sung.slice(end.index!+end[0].length).replace(/"[^"\n]*"/g,"");
 const edits:{start:number;end:number;text:string}[]=[];
 for(const line of abcjs.parseOnly(sung)[0].lines)for(const staff of line.staff||[])for(const voice of staff.voices||[])for(const note of voice)if(note.el_type==="note"){
  const token=sung.slice(note.startChar!,note.endChar!);if(/[ZX]/.test(token))continue;
  const text=token.replace(/([\^_=]*[A-Ga-g][,']*|[zx])(?:\d+(?:\/\d*)?|\/+\d*)?([-\s)]*)$/,`$1${Math.round(note.duration*64)}$2`);
  edits.push({start:note.startChar!,end:note.endChar!,text});
 }
 for(const e of edits.sort((a,b)=>b.start-a.start))sung=sung.slice(0,e.start)+e.text+sung.slice(e.end);
 sung=sung.replace(/^L:.*$/m,"L:1/64");
 const key=sung.match(/^K:(.*)$/m)![1],meter=sung.match(/^M:(.*)$/m)![1],unit="1/64";
 const tempo=(sung.match(/^Q:.*$/m)?.[0] || guitar.match(/^Q:.*$/m)?.[0] || "").replace(/^(Q:)"Capo \d+"\s*/,"$1");
 const voiceBody=body(sung,"Voice",true);
 const guitarBody=body(guitar,"Guitar",false).replace(/\[V:Guitar\]/g,"").replace(/\n/g," ").replace(/"([^"\n]+)"/g,()=>`"${quoted[i++]}"`);
 // All accompaniment builders produce a single part when asked for chords.
 if(abcjs.parseOnly(accompaniment)[0].lines.find(l=>l.staff)?.staff?.flatMap(s=>s.voices||[]).length!==1)throw Error("Expected one guitar accompaniment voice");
 return `X:1\nM:${meter}\nL:${unit}\n${tempo ? `${tempo}\n` : ""}%%score Voice | Guitar\nV:Voice clef=treble name="Voice"\nV:Guitar clef=treble transpose=${capo-12} name="Guitar"\nK:${key}\n[V:Voice] ${voiceBody}\n[V:Guitar] [K:${guitarKey} clef=treble transpose=${capo-12}] ${guitarBody}\n`;
}
