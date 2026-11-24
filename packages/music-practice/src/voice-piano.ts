import abcjs from "abcjs";

/** Retain every source harmony voice and give the sung melody its own staff. */
export function voicePianoAbc(source: string, guitar: string, capo: number) {
  const ids = [...source.matchAll(/^V:\s*([^\s]+).*$/gm)].map(match => match[1]);
  const tune = abcjs.parseOnly(source)[0];
  const sopranoEdits: {start:number;end:number;text:string}[]=[];
  for(const line of tune.lines)for(const n of line.staff?.[0]?.voices?.[0]||[]){
    if(n.el_type!=="note" || (n.pitches?.length||0)<2)continue;
    const token=source.slice(n.startChar!,n.endChar!);
    const chord=token.match(/\[([^\]]+)\]/);
    if(!chord)throw Error("Unrecognized source chord");
    const notes=chord[1].match(/[\^_=]*[A-Ga-g][,']*(?:\d+(?:\/\d*)?|\/+\d*)?-?/g)!;
    const highest=n.pitches!.reduce((best,p,i,all)=>p.pitch>all[best].pitch?i:best,0);
    sopranoEdits.push({start:n.startChar!,end:n.endChar!,text:token.replace(chord[0],notes[highest])});
  }
  const sourceLines=source.split("\n");let offset=0;
  const vocalLines=new Map<string,string>();
  for(const line of sourceLines){
    let melody=line;
    for(const edit of sopranoEdits.filter(edit=>edit.start>=offset&&edit.start<offset+line.length).sort((a,b)=>b.start-a.start))
      melody=melody.slice(0,edit.start-offset)+edit.text+melody.slice(edit.end-offset);
    vocalLines.set(line,melody);offset+=line.length+1;
  }
  const system = tune.lines.find(line => line.staff?.length)!.staff!;
  let index = 0;
  const groups = system.map(staff => {
    const voices = (staff.voices || []).map(() => ids[index++]);
    return voices.length > 1 ? `(${voices.join(" ")})` : voices[0];
  });
  const primary = ids[0];
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lead = new RegExp(`^\\[V:\\s*${escape(primary)}\\]\\s*(.*)$`);
  if (!source.split("\n").some(line=>lead.test(line)) || index !== ids.length)
    throw Error("Voice + Piano requires explicit source voices");
  const headerEnd = source.match(/^K:.*\n/m)!;
  const header = source.slice(0, headerEnd.index! + headerEnd[0].length)
    .replace(/^%%(?:staves|score).*\n/gm, "")
    .replace(/^V:.*$/m, line => `%%score Voice | {${groups.join(" | ")}}\nV:Voice clef=treble name="Voice"\n${line} name="Piano"`);
  const accompaniment = source.slice(headerEnd.index! + headerEnd[0].length)
    .replace(/^w:.*$/gm, "").replace(/"[^"\n]*"/g, "")
    .split("\n").filter(line=>line.trim()).flatMap(line=>{const match=lead.exec(line);return match?[`[V:Voice] ${lead.exec(vocalLines.get(line) || line)![1]}`,line]:[line];}).join("\n");
  let result = `${header}${accompaniment}`;
  // A change can fall under a held vocal note. Attach it to the first actual
  // source attack at that instant instead of moving the chord or changing notes.
  const changes = new Map<number, string>();
  const times = new Map<string, number>();
  for (const line of abcjs.parseOnly(guitar)[0].lines)
    for (const [si, staff] of (line.staff || []).entries())
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const id = `${si}:${vi}`;
        let time = times.get(id) || 0;
        for (const note of voice) if (note.el_type === "note") {
          const chord = note.chord?.find((item: {position?: string}) => item.position === "default");
          if (chord) {
            const sample = `X:1\nM:4/4\nK:C\n"${chord.name}"C4 |]`;
            const shifted = capo ? abcjs.strTranspose(sample, abcjs.parseOnly(sample), capo) : sample;
            changes.set(Math.round(time * 4096), shifted.match(/"([^"]+)"/)![1]);
          }
          time += note.duration;
        }
        times.set(id, time);
      }
  const edits: {at:number; text:string}[] = [];
  times.clear();
  for (const line of abcjs.parseOnly(result)[0].lines)
    for (const [si, staff] of (line.staff || []).entries())
      for (const [vi, voice] of (staff.voices || []).entries()) {
        const id = `${si}:${vi}`;
        let time = times.get(id) || 0;
        for (const note of voice) if (note.el_type === "note") {
          const key = Math.round(time * 4096), name = changes.get(key);
          if (name) { edits.push({at:note.startChar!,text:`"${name}"`}); changes.delete(key); }
          time += note.duration;
        }
        times.set(id,time);
      }
  if (changes.size) throw Error(`Chord changes have no source attack: ${JSON.stringify([...changes])}`);
  for (const edit of edits.sort((a,b)=>b.at-a.at)) result=result.slice(0,edit.at)+edit.text+result.slice(edit.at);
  return result;
}
