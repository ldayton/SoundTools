import {skyline,skylineClearance,type InkBox} from './skyline';
/** Physical CSS-pixel block geometry shared by screen, print and PDF. A header
 * or unknown/clipped block supplies its full rectangle as ink. */
export type ScoreFlowBlock={width:number;height:number;ink?:readonly InkBox[];clearance?:number};
export function planScoreFlow(blocks:readonly ScoreFlowBlock[]) {
  const rows=blocks.map(block=>{
    if(![block.width,block.height].every(n=>Number.isFinite(n)&&n>0)||!Number.isFinite(block.clearance??12)||(block.clearance??12)<0)throw new RangeError('Invalid score flow geometry');
    const ink=block.ink?.length?block.ink:[{left:0,right:block.width,top:0,bottom:block.height}];
    return {top:skyline(ink,'top'),bottom:skyline(ink,'bottom')};
  });
  const y:number[]=[];
  blocks.forEach((block,to)=>{
    let top=to?y[to-1]:0;
    for(let from=0;from<to;from++)top=Math.max(top,y[from]+skylineClearance(rows[from].bottom,rows[to].top,Math.max(block.clearance??12,blocks[from].clearance??12)).distance);
    y.push(top);
  });
  return {positions:y,height:Math.max(0,...blocks.map((b,i)=>y[i]+b.height))};
}
