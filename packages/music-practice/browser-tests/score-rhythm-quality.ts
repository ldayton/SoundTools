/** Independent geometry oracle: all distances are physical staff spaces. */
export type RhythmAnchor = {time:number;x:number};
export function rhythmQuality(anchors: readonly RhythmAnchor[], staffSpace:number) {
  const columns:{time:number;xs:number[]}[]=[];
  for(const anchor of [...anchors].sort((a,b)=>a.time-b.time)) {
    const last=columns.at(-1);
    if(last && Math.abs(last.time-anchor.time)<1e-7)last.xs.push(anchor.x);
    else columns.push({time:anchor.time,xs:[anchor.x]});
  }
  const positions=columns.map(column=>column.xs.reduce((a,b)=>a+b,0)/column.xs.length);
  const gaps=positions.slice(1).map((x,index)=>(x-positions[index])/staffSpace);
  const normalized=gaps.map((gap,index)=>gap/Math.sqrt((columns[index+1].time-columns[index].time)/.25));
  return {
    rhythmicColumns:columns.length,
    minColumnGap:gaps.length?Math.min(...gaps):0,
    alignmentError:columns.length?Math.max(...columns.map(column=>(Math.max(...column.xs)-Math.min(...column.xs))/staffSpace)):0,
    maxRhythmicGap:normalized.length?Math.max(...normalized):0,
  };
}
