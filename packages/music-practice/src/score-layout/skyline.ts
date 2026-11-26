/** Renderer-independent vertical layout, in engraving units (never CSS pixels).
 * Interval endpoints are exact: neighbouring objects do not collide merely
 * because they fall in the same raster sample. Curves may use conservative boxes.
 */
export type InkBox = {left:number;right:number;top:number;bottom:number;id?:string};
export type SkylineSegment = {left:number;right:number;edge:number;id?:string};
export type Skyline = readonly SkylineSegment[];
export function skyline(boxes:readonly InkBox[],side:'top'|'bottom'):Skyline {
  for(const box of boxes)if(![box.left,box.right,box.top,box.bottom].every(Number.isFinite)||box.right<box.left||box.bottom<box.top)
    throw new RangeError('Invalid skyline ink bounds');
  const valid=boxes.filter(b=>b.right>b.left);
  const events=valid.flatMap((box,index)=>[{x:box.left,index,start:true},{x:box.right,index,start:false}])
    .sort((a,b)=>a.x-b.x||Number(a.start)-Number(b.start)||a.index-b.index);
  const active=new Set<number>(),result:SkylineSegment[]=[];
  for(let i=0;i<events.length;) {
    const x=events[i].x;
    do {const e=events[i++];if(e.start)active.add(e.index);else active.delete(e.index);}while(i<events.length&&events[i].x===x);
    if(i===events.length||!active.size)continue;
    let chosen:InkBox|undefined;
    for(const index of active){const box=valid[index];if(!chosen||(side==='top'?box.top<chosen.top:box.bottom>chosen.bottom))chosen=box;}
    const edge=chosen![side],previous=result.at(-1),right=events[i].x;
    if(previous&&previous.right===x&&previous.edge===edge&&previous.id===chosen!.id)previous.right=right;
    else result.push({left:x,right,edge,id:chosen!.id});
  }
  return result;
}
export type SkylineClearance={distance:number;upper?:string;lower?:string;at?:number};
/** Minimum downward displacement of lower relative to upper, including ink pad. */
export function skylineClearance(upper:Skyline,lower:Skyline,padding:number):SkylineClearance {
  if(!Number.isFinite(padding)||padding<0)throw new RangeError('Invalid skyline padding');
  let i=0,j=0,result:SkylineClearance={distance:-Infinity};
  while(i<upper.length&&j<lower.length){
    const a=upper[i],b=lower[j],left=Math.max(a.left,b.left),right=Math.min(a.right,b.right);
    const distance=a.edge-b.edge+padding;
    if(right>left&&distance>result.distance)result={distance,upper:a.id,lower:b.id,at:(left+right)/2};
    if(a.right<=b.right)i++;else j++;
  }
  return result;
}
export type VerticalRow={top:number;bottom:number;ink:readonly InkBox[]};
export type VerticalPlacement={offsets:number[];constraints:(SkylineClearance&{from:number;to:number;minimum:number})[]};
/** All preceding rows constrain a row, including tall objects spanning a sparse
 * middle row. Adjacent staff baselines retain the requested readable minimum. */
export function placeVerticalRows(rows:readonly VerticalRow[],minimumGap:number,inkPadding:number):VerticalPlacement {
  if(![minimumGap,inkPadding].every(n=>Number.isFinite(n)&&n>=0))throw new RangeError('Invalid vertical spacing');
  const profiles=rows.map(row=>{
    if(![row.top,row.bottom].every(Number.isFinite)||row.bottom<row.top)throw new RangeError('Invalid vertical row');
    return {top:skyline(row.ink,'top'),bottom:skyline(row.ink,'bottom')};
  });
  const offsets:number[]=[],constraints:VerticalPlacement['constraints']=[];
  rows.forEach((row,to)=>{
    let offset=to?rows[to-1].bottom+offsets[to-1]+minimumGap-row.top:0;
    for(let from=0;from<to;from++){
      const contact=skylineClearance(profiles[from].bottom,profiles[to].top,inkPadding);
      offset=Math.max(offset,offsets[from]+contact.distance);
      constraints.push({...contact,distance:Number.isFinite(contact.distance)?contact.distance:0,from,to,minimum:from===to-1?minimumGap:0});
    }
    offsets.push(offset);
  });
  return {offsets,constraints};
}

export type OutsideLane={side:'top'|'bottom';ink:readonly InkBox[];compact?:boolean;padding?:number};
/** Preserve aligned rows and their x anchors. Only move a lane outward when
 * needed, or recover unused space for a compact lane. Its rows stay together;
 * individual syllables never drift independently. */
export function placeOutsideLanes(fixed:readonly InkBox[],lanes:readonly OutsideLane[],padding:number){
  const occupied=[...fixed],offsets:number[]=[];
  for(const lane of lanes){
    const clearance=lane.padding??padding;
    const contact=lane.side==='top'
      ?skylineClearance(skyline(lane.ink,'bottom'),skyline(occupied,'top'),clearance)
      :skylineClearance(skyline(occupied,'bottom'),skyline(lane.ink,'top'),clearance);
    const distance=Number.isFinite(contact.distance)?contact.distance:0;
    const magnitude=lane.compact?distance:Math.max(0,distance),dy=magnitude?(lane.side==='top'?-magnitude:magnitude):0;
    offsets.push(dy);
    occupied.push(...lane.ink.map(b=>({...b,top:b.top+dy,bottom:b.bottom+dy})));
  }
  return offsets;
}
