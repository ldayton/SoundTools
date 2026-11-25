/** Independent acceptance limits, in staff spaces, for small regression
 * fixtures. These are readable-space budgets, not the planner's own cost. */
export type LayoutQuality = {
  staffSpace: number;
  scrollHeight: number;
  viewportOverflow:number;
  systems: {height:number;topBlank:number;bottomBlank:number;maxNoteGap:number;maxRhythmicGap:number;lyricCollisions:number;lyricCrowding:number;overflows:number}[];
};
export type QualityLimits = {maxBlank:number;maxRhythmicGap:number;maxSystemHeight:number;maxScrollOverhead:number};
export const componentQualityLimits: Readonly<QualityLimits> = Object.freeze({
  maxBlank:3,maxRhythmicGap:20,maxSystemHeight:50,maxScrollOverhead:3,
});
export function qualityViolations(quality: LayoutQuality, limits: QualityLimits=componentQualityLimits): string[] {
  const errors:string[]=[];
  if(!Number.isFinite(quality.staffSpace)||quality.staffSpace<=0) errors.push('Invalid physical staff size');
  if(!Number.isFinite(quality.scrollHeight)||quality.scrollHeight-quality.systems.reduce((sum,system)=>sum+system.height,0)>limits.maxScrollOverhead) errors.push('Excessive scroll height');
  if(!Number.isFinite(quality.viewportOverflow)||quality.viewportOverflow>.15) errors.push('Unexpected horizontal scrolling');
  if(!quality.systems.length) errors.push('Missing music systems');
  quality.systems.forEach((system,i)=>{
    if(Object.values(system).some(value=>!Number.isFinite(value))) errors.push(`System ${i}: invalid geometry`);
    if(system.topBlank>limits.maxBlank||system.bottomBlank>limits.maxBlank) errors.push(`System ${i}: blank vertical band`);
    if(system.maxRhythmicGap>limits.maxRhythmicGap) errors.push(`System ${i}: excessive note spacing`);
    if(system.height>limits.maxSystemHeight) errors.push(`System ${i}: excessive system height`);
    if(system.lyricCrowding) errors.push(`System ${i}: insufficient lyric separation`);
    if(system.lyricCollisions) errors.push(`System ${i}: lyric collision`);
    if(system.overflows) errors.push(`System ${i}: clipped ink`);
  });
  return errors;
}
