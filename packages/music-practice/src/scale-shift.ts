import type { patternPositions } from './guitar-scale-patterns';
export type ShiftNote = ReturnType<typeof patternPositions>[number];
export type ShiftDirection = 'ascending' | 'descending';
export const positionKey = (n: {string:number;fret:number}) => `${n.string}:${n.fret}`;
export function shiftRoutes(a: ShiftNote[], b: ShiftNote[], direction: ShiftDirection, allowEndpoint = false, primaryFirst = false) {
  // Pitch classes distinguish both the blue note and its unaltered degree.
  const pitches = [...new Set([...a,...b].map(n=>n.pitchClass))].sort((x,y)=>x-y);
  const nextPitch = (pitch: number) => pitches[(pitches.indexOf(pitch)+1)%pitches.length];
  const maxGap = Math.max(...pitches.map((pitch,i)=>(pitches[(i+1)%pitches.length]-pitch+12)%12));
  const routes = new Map<string, {notes: ShiftNote[]; previous: ShiftNote; arrival: ShiftNote}>();
  if (!a.some(n => b.some(m => positionKey(n) === positionKey(m)))) return routes;
  const lowerFirst = Math.min(...a.map(n=>n.fret)) < Math.min(...b.map(n=>n.fret));
  const lower = lowerFirst ? a : b, upper = lowerFirst ? b : a;
  const source = primaryFirst ? a : direction === 'ascending' ? lower : upper;
  const destination = primaryFirst ? b : direction === 'ascending' ? upper : lower;
  const sign = direction === 'ascending' ? 1 : -1;
  const ordered = (notes: ShiftNote[]) => [...notes].sort((x,y)=>sign*(x.midi-y.midi) || sign*(y.string-x.string));
  // A scale run plays each sounding pitch once, even where a shape offers duplicates.
  const unique = (notes: ShiftNote[]) => ordered(notes).filter((n,i,all)=>!i || n.midi!==all[i-1].midi);
  for(const arrival of destination) {
    const before = unique(source.filter(n=>sign*(n.midi-arrival.midi)<0));
    const after = unique(destination.filter(n=>sign*(n.midi-arrival.midi)>0));
    const previous = before.at(-1);
    if(!previous || (!after.length && !allowEndpoint)) continue;
    if (primaryFirst && previous.string !== arrival.string) continue;
    const gap = sign*(arrival.midi-previous.midi);
    const stringChange = sign*(previous.string-arrival.string);
    if(gap<1 || gap>maxGap || stringChange<0 || stringChange>1) continue;
    if(sign===1 ? nextPitch(previous.pitchClass)!==arrival.pitchClass : nextPitch(arrival.pitchClass)!==previous.pitchClass) continue;
    const notes = [...before, arrival, ...after];
    if (notes.some((n,i) => {
      if (!i) return false;
      const previous = notes[i-1];
      const gap = sign*(n.midi-previous.midi);
      return gap<1 || gap>maxGap || (sign===1 ? nextPitch(previous.pitchClass)!==n.pitchClass : nextPitch(n.pitchClass)!==previous.pitchClass);
    })) continue;
    routes.set(positionKey(arrival), {notes,previous,arrival});
  }
  return routes;
}

export type ShiftRoute = ReturnType<typeof shiftRoutes> extends Map<string, infer R> ? R : never;
export type ScaleLoop = { out: ShiftRoute; back: ShiftRoute; returns: Map<string, ShiftRoute> };
/** Close the chosen run without changing position at either turnaround.
 * Each leg has one shift. Endpoint shifts are valid because the next leg
 * continues the scale, instead of requiring another note on the same leg.
 */
export function scaleLoopRoutes(a: ShiftNote[], b: ShiftNote[], direction: ShiftDirection, returnKey?: string) {
  const forward = shiftRoutes(a, b, direction, true);
  const reverse = shiftRoutes(a, b, direction === 'ascending' ? 'descending' : 'ascending', true);
  const loops = new Map<string, ScaleLoop>();
  for (const [key, out] of forward) {
    const returns = new Map([...reverse].filter(([,back]) =>
      positionKey(out.notes[0]) === positionKey(back.notes.at(-1)!) &&
      positionKey(out.notes.at(-1)!) === positionKey(back.notes[0]),
    ));
    if (!returns.size) continue;
    // Prefer the opposite outer string, but keep every valid return selectable.
    const preferred = out.arrival.string <= 3 ? 6 : 1;
    const rank = (r: ShiftRoute) => Math.abs(r.arrival.string-preferred)*1000 +
      (r.notes.length-1-r.notes.indexOf(r.arrival))*10 +
      Math.abs(r.arrival.fret-r.previous.fret);
    const suggested = [...returns.values()].sort((x,y)=>rank(x)-rank(y))[0];
    loops.set(key, { out, back: returns.get(returnKey || '') || suggested, returns });
  }
  return loops;
}
