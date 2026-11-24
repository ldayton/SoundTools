import abcjs from "abcjs";

/** Adapt source harmony to two hands: retain the outer melody/bass, spelling,
 * attacks and durations; octave-displace inner tones only where a hand exceeds
 * an octave. The photographed/source score itself is never rewritten. */
export function compactPianoHands(source:string, firstStaff=0) {
  const tune=abcjs.parseOnly(source)[0];
  const untied=abcjs.parseOnly(source.replace(/-/g," "))[0];
  untied.setUpAudio({chordsOff:true});
  const midiByChar=new Map<number,number[]>();
  for(const l of untied.lines)for(const st of l.staff||[])for(const v of st.voices||[])for(const n of v)if(n.el_type==="note")midiByChar.set(n.startChar!,(n as typeof n & {midiPitches?:{pitch:number}[]}).midiPitches?.map(p=>p.pitch)||[]);
  tune.setUpAudio({chordsOff:true});
  type Pitch={name:string;midi:number;tie?:boolean;endTie?:boolean};
  const staves=new Map<number,{start:number;end:number;at:number;length:number;voice:string;pitches:Pitch[]}[]>();
  const clocks=new Map<string,number>();
  for(const line of tune.lines)for(const [si,staff] of (line.staff||[]).entries())for(const [vi,voice] of (staff.voices||[]).entries()){
    const id=`${si}:${vi}`;let at=clocks.get(id)||0;
    for(const n of voice)if(n.el_type==="note"){
      if(si>=firstStaff && n.pitches?.length){
        const midi=midiByChar.get(n.startChar!);
        if(midi?.length===n.pitches.length){
          const events=staves.get(si)||[];
          events.push({start:n.startChar!,end:n.endChar!,at,length:n.duration,voice:id,pitches:n.pitches.map((p,i)=>({name:p.name,midi:midi[i],tie:!!p.startTie,endTie:!!p.endTie}))});staves.set(si,events);
        }
      }
      at+=n.duration;
    }
    clocks.set(id,at);
  }
  const edits:{start:number;end:number;text:string}[]=[];
  const shifted=(name:string,octaves:number)=>{
    const m=name.match(/^([\^_=]*)([A-Ga-g])([,']*)$/)!;
    const octave=(m[2]===m[2].toLowerCase()?1:0)+[...m[3]].reduce((v,c)=>v+(c==="'"?1:-1),0)+octaves;
    return m[1]+m[2].toUpperCase()+(octave<0?",".repeat(-octave):"'".repeat(octave));
  };
  const ties=new Map<string,number>();
  for(const [si,events] of staves)for(const event of events){
    const overlap=events.filter(e=>e.at<event.at+event.length-1e-8&&e.at+e.length>event.at+1e-8).flatMap(e=>e.pitches.map(p=>p.midi));
    const bass=si>firstStaff, anchor=bass?Math.min(...overlap):Math.max(...overlap);
    let i=0,changed=false;
    const text=source.slice(event.start,event.end).replace(/"[^"\n]*"|![^!]*!|[\^_=]*[A-Ga-g][,']*/g,name=>{
      if(name.startsWith('"')||name.startsWith("!"))return name;
      // Skip chord labels and decorations by matching only the actual pitch names below.
      const p=event.pitches[i];if(!p || name!==p.name)return name;i++;
      let octaves=bass?Math.min(0,Math.floor((anchor+12-p.midi)/12)):Math.max(0,Math.ceil((anchor-12-p.midi)/12));
      const key=`${event.voice}:${p.name}`;
      if(p.endTie)octaves=ties.get(key) ?? octaves;
      if(p.tie)ties.set(key,octaves);else ties.delete(key);
      changed ||= octaves!==0;return shifted(name,octaves);
    });
    if(changed)edits.push({start:event.start,end:event.end,text});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  return source;
}
