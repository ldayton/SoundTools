/** Renderer-independent score layout. All distances are engraving units. */
export type MeasuredBar = {
  minimumWidth: number;
  naturalWidth: number;
  duration: number;
  breakBefore?: boolean;
  phraseEnd?: boolean;
};
export type MeasuredSection = {
  startWidth: number;
  barDuration: number;
  bars: readonly MeasuredBar[];
};
export type PlannedSystem = {
  /** Half-open bar range, within section. */
  from: number;
  to: number;
  minimumWidth: number;
  naturalWidth: number;
  overflow: number;
};
export type ScoreLayoutPlan = {
  width: number;
  sections: { breaks: number[]; systems: PlannedSystem[] }[];
};
export const SCORE_LAYOUT = Object.freeze({
  padding: 12,
  annotationAllowance: 8,
  targetExpansion: 1.5,
  minimumExpansion: 1.1,
});

function checkWidth(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
}

/** Plan the whole sequence, preserving mandatory boundaries, repeats and pickups.
 * Oversized indivisible bars remain explicit overflow; the planner never changes
 * staff size or music to make an impossible constraint appear satisfied. */
export function planScoreLayout(sections: readonly MeasuredSection[], width: number): ScoreLayoutPlan {
  checkWidth(width, "Layout width");
  if (!width) throw new RangeError("Layout width must be positive");
  return { width, sections: sections.map(section => {
    checkWidth(section.startWidth, "System start width");
    if (!(section.barDuration > 0) || !Number.isFinite(section.barDuration)) throw new RangeError("Bar duration must be positive and finite");
    const bars = section.bars, n = bars.length;
    for (const bar of bars) {
      checkWidth(bar.minimumWidth, "Minimum bar width");
      checkWidth(bar.naturalWidth, "Natural bar width");
      checkWidth(bar.duration, "Bar duration");
      if (bar.naturalWidth < bar.minimumWidth) throw new RangeError("Natural width cannot be smaller than minimum width");
    }
    const capacity = Math.max(0, width - section.startWidth);
    const costs = Array<number>(n + 1).fill(Infinity), next = Array<number>(n).fill(n);
    costs[n] = 0;
    const boundaries = new Set<number>();
    bars.forEach((bar, i) => {
      if (!bar.breakBefore) return;
      while (i > 0 && bars[i - 1].duration === 0) i--;
      if (i > 0) boundaries.add(i);
    });
    const minimum = (from: number, to: number) => bars.slice(from,to).reduce((sum,b) => sum+b.minimumWidth,0);
    const short = (i: number) => bars[i].duration > 0 && bars[i].duration < section.barDuration - 1e-6;
    const first = bars.findIndex(b => b.duration > 0);
    const allowed = (end: number) => {
      if (end === n) return true;
      if (bars[end-1].duration === 0) return false;
      if (boundaries.has(end)) return true;
      if (end === first+1 && short(first) && minimum(first,end+1) <= capacity) return false;
      if (end === n-1 && short(n-1) && minimum(end-1,n) <= capacity) return false;
      return true;
    };
    for (let start=n-1;start>=0;start--) {
      let min=0, natural=0, sounding=0;
      for (let end=start+1;end<=n;end++) {
        if (end > start+1 && boundaries.has(end-1)) break;
        min+=bars[end-1].minimumWidth; natural+=bars[end-1].naturalWidth;
        if (bars[end-1].duration > 0) sounding++;
        if (min > capacity && sounding > 1) break;
        if (!allowed(end) || !Number.isFinite(costs[end])) continue;
        const fill=natural/Math.max(1,capacity), final=end===n;
        const cost=1+Math.max(0,1-fill)**2*(final?0.7:6)+Math.max(0,fill-1)**2*8
          +(final && start>0 && sounding===1?1.5:0)
          +(!final && bars[end-1].phraseEnd?-0.15:0)+costs[end];
        if(cost<costs[start]) {costs[start]=cost;next[start]=end;}
      }
    }
    const systems: PlannedSystem[]=[];
    for(let from=0;from<n;) {
      const to=next[from];
      const min=section.startWidth+minimum(from,to);
      systems.push({from,to,minimumWidth:min,naturalWidth:section.startWidth+bars.slice(from,to).reduce((sum,b)=>sum+b.naturalWidth,0),overflow:Math.max(0,min-width)});
      from=to;
    }
    return {systems,breaks:systems.slice(0,-1).map(system=>system.to-1)};
  })};
}

/** SVG framing is independent of line planning and does not silently resize a
 * reflowed score's glyphs. Compact prompts may explicitly request fit-to-box. */
export function scoreFrame(width: number, scale: number, box: {width:number;height:number}, reflow: boolean) {
  if (!(width>0) || !(scale>0) || !(box.width>0) || !(box.height>=0) || ![width,scale,box.width,box.height].every(Number.isFinite))
    throw new RangeError("Score frame needs finite positive width/scale and valid bounds");
  const actualScale=reflow?scale:Math.min(scale,width/box.width);
  const physicalWidth=box.width*actualScale;
  return {width:physicalWidth,height:box.height*actualScale,scale:actualScale,overflow:Math.max(0,physicalWidth-width)};
}
