import type { patternPositions } from './guitar-scale-patterns';
export type ShiftNote = ReturnType<typeof patternPositions>[number];
export type ShiftDirection = 'ascending' | 'descending';
export const positionKey = (n: {string:number;fret:number}) => `${n.string}:${n.fret}`;
export function shiftRoutes(a: ShiftNote[], b: ShiftNote[], direction: ShiftDirection) {
  const routes = new Map<string, {notes: ShiftNote[]; previous: ShiftNote; arrival: ShiftNote}>();
  if (!a.some(n => b.some(m => positionKey(n) === positionKey(m)))) return routes;
  const lowerFirst = Math.min(...a.map(n=>n.fret)) < Math.min(...b.map(n=>n.fret));
  const lower = lowerFirst ? a : b, upper = lowerFirst ? b : a;
  const source = direction === 'ascending' ? lower : upper;
  const destination = direction === 'ascending' ? upper : lower;
  const sign = direction === 'ascending' ? 1 : -1;
  const ordered = (notes: ShiftNote[]) => [...notes].sort((x,y)=>sign*(x.midi-y.midi) || sign*(y.string-x.string));
  // A scale run plays each sounding pitch once, even where a shape offers duplicates.
  const unique = (notes: ShiftNote[]) => ordered(notes).filter((n,i,all)=>!i || n.midi!==all[i-1].midi);
  for(const arrival of destination) {
    const before = unique(source.filter(n=>sign*(n.midi-arrival.midi)<0));
    const after = unique(destination.filter(n=>sign*(n.midi-arrival.midi)>0));
    const previous = before.at(-1);
    if(!previous || !after.length) continue;
    const gap = sign*(arrival.midi-previous.midi);
    const stringChange = sign*(previous.string-arrival.string);
    if(gap<1 || gap>2 || stringChange<0 || stringChange>1) continue;
    if(sign===1 ? (previous.degree%7)+1!==arrival.degree : (arrival.degree%7)+1!==previous.degree) continue;
    const notes = [...before, arrival, ...after];
    if (notes.some((n,i) => {
      if (!i) return false;
      const previous = notes[i-1];
      const gap = sign*(n.midi-previous.midi);
      return gap<1 || gap>2 || (sign===1 ? (previous.degree%7)+1!==n.degree : (n.degree%7)+1!==previous.degree);
    })) continue;
    routes.set(positionKey(arrival), {notes,previous,arrival});
  }
  return routes;
}
