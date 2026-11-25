/** Renderer-independent score layout. All distances are engraving units. */
export type MeasuredBar = {
  minimumWidth: number;
  naturalWidth: number;
  duration: number;
  breakBefore?: boolean;
  phraseEnd?: boolean;
};
export type RangeMinimum = {from:number;to:number;minimumWidth:number};
export type MeasuredSection = {
  startWidth: number;
  /** Measured opening ink at each possible system start; defaults to startWidth. */
  startWidths?: readonly number[];
  /** Contextual end/header clearance measured for this exact candidate range. */
  rangeMinimums?: readonly RangeMinimum[];
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
  minimumClearance: 4,
  // ABC points: 24pt = 32 engraving units, just over four staff spaces.
  minimumStaffSeparation: 24,
  compressionPenalty: 1,
  densityChangePenalty: .5,
});

function checkWidth(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
}

/** Collision clearance is fixed ink, not a percentage of text/rhythmic width. */
export function spacingBounds(minimumWidth:number,naturalWidth:number,clearance:number=SCORE_LAYOUT.minimumClearance) {
  checkWidth(minimumWidth,"Minimum spacing");checkWidth(naturalWidth,"Natural spacing");checkWidth(clearance,"Spacing clearance");
  const minimum=minimumWidth+clearance;
  return {minimumWidth:minimum,naturalWidth:Math.max(minimum,naturalWidth)};
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
    if (section.startWidths) {
      if (section.startWidths.length !== n) throw new RangeError("System-start widths must cover every bar");
      section.startWidths.forEach(value => checkWidth(value, "System start width"));
    }
    const ranges=new Map<string,number>();
    for(const range of section.rangeMinimums||[]) {
      if(!Number.isInteger(range.from)||!Number.isInteger(range.to)||range.from<0||range.to>n||range.to<=range.from)
        throw new RangeError("Invalid measured bar range");
      checkWidth(range.minimumWidth,"Range minimum width");
      const key=`${range.from}:${range.to}`;
      ranges.set(key,Math.max(ranges.get(key)||0,range.minimumWidth));
    }
    const overhead = (from: number) => section.startWidths?.[from] ?? section.startWidth;
    const capacityAt = (from: number) => Math.max(0, width - overhead(from));
    type Candidate = {system:PlannedSystem;strain:number;cost:number;next?:Candidate};
    const candidates:Candidate[][]=Array.from({length:n+1},()=>[]);
    const boundaries = new Set<number>();
    bars.forEach((bar, i) => {
      if (!bar.breakBefore) return;
      while (i > 0 && bars[i - 1].duration === 0) i--;
      if (i > 0) boundaries.add(i);
    });
    const prefix=[0];
    bars.forEach(bar=>prefix.push(prefix.at(-1)!+bar.minimumWidth));
    const minimum = (from: number, to: number) => prefix[to]-prefix[from];
    const fits = (from:number,to:number) => Math.max(overhead(from)+minimum(from,to),ranges.get(`${from}:${to}`)||0)<=width;
    const short = (i: number) => bars[i].duration > 0 && bars[i].duration < section.barDuration - 1e-6;
    const first = bars.findIndex(b => b.duration > 0);
    const allowed = (end: number) => {
      if (end === n) return true;
      if (bars[end-1].duration === 0) return false;
      if (boundaries.has(end)) return true;
      if (end === first+1 && short(first) && fits(first,end+1)) return false;
      if (end === n-1 && short(n-1) && fits(end-1,n)) return false;
      return true;
    };
    for (let start=n-1;start>=0;start--) {
      const capacity=capacityAt(start);
      let min=0, natural=0, sounding=0;
      for (let end=start+1;end<=n;end++) {
        if (end > start+1 && boundaries.has(end-1)) break;
        min+=bars[end-1].minimumWidth; natural+=bars[end-1].naturalWidth;
        if (bars[end-1].duration > 0) sounding++;
        if (min > capacity && sounding > 1) break;
        if (!allowed(end) || (end<n && !candidates[end].length)) continue;
        const measuredMinimum=Math.max(min+overhead(start),ranges.get(`${start}:${end}`)||0);
        if(measuredMinimum>width && sounding>1)continue;
        const preferred=Math.max(natural,measuredMinimum-overhead(start));
        const final=end===n;
        const compression=Math.max(0,preferred-capacity)/Math.max(1,preferred-(measuredMinimum-overhead(start)));
        const expansion=Math.max(0,capacity-preferred)/Math.max(1,preferred);
        const strain=compression>0?-compression:expansion;
        const blank=Math.max(0,1-preferred/Math.max(1,capacity));
        const ownCost=1+compression**2*SCORE_LAYOUT.compressionPenalty+blank**2*(final?0.7:6)
          +(final && start>0 && sounding===1?1.5:0)
          +(!final && bars[end-1].phraseEnd?-0.15:0);
        let cost=ownCost, next:Candidate|undefined;
        if(!final) {
          let following=Infinity;
          for(const candidate of candidates[end]) {
            // A naturally short final line isn't justified; don't force its
            // preceding line to match a stretch that will never be applied.
            const raggedFinal=candidate.system.to===n && candidate.strain>=0;
            const transition=raggedFinal?0:SCORE_LAYOUT.densityChangePenalty*(strain-candidate.strain)**2;
            if(candidate.cost+transition<following){following=candidate.cost+transition;next=candidate;}
          }
          cost+=following;
        }
        candidates[start].push({system:{from:start,to:end,minimumWidth:measuredMinimum,
          naturalWidth:Math.max(measuredMinimum,overhead(start)+natural),overflow:Math.max(0,measuredMinimum-width)},strain,cost,next});
      }
    }
    if(n && !candidates[0].length) throw new Error("No complete score layout satisfies the musical boundaries");
    const systems: PlannedSystem[]=[];
    let chosen=candidates[0]?.reduce<Candidate|undefined>((best,candidate)=>!best||candidate.cost<best.cost?candidate:best,undefined);
    while(chosen){systems.push(chosen.system);chosen=chosen.next;}

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
