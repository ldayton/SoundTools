import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateScore,scorePapers} from '../src/score-export';
test('page planning preserves every complete system, in order, inside page margins',()=>{
 for(const paper of ['mobile','desktop'] as const){
  const blocks=[{width:300,height:70},...Array.from({length:20},()=>({width:700,height:180}))];
  const pages=paginateScore(blocks,paper),sheet=scorePapers[paper];
  assert.deepEqual(pages.flat().map(p=>p.index),blocks.map((_,i)=>i));
  assert(pages.length>1);
  for(const page of pages){assert(page.reduce((sum,p)=>sum+p.height,0)+12*(page.length-1)<=sheet.height-2*sheet.margin+.001);assert(page.every(p=>p.width<=sheet.width-2*sheet.margin+.001));}
 }
});
test('an oversized indivisible system fits the page without clipping or dropping notes',()=>{
 const placed=paginateScore([{width:1400,height:2400}],'desktop')[0][0];
 assert(placed.height<=scorePapers.desktop.height-72);assert.equal(placed.width/placed.height,1400/2400);
 assert.throws(()=>paginateScore([{width:NaN,height:1}],'mobile'));
});

test('contour pagination uses explicit positions and resets placement at a page boundary',()=>{
 const box=(left:number,right:number,top:number,bottom:number)=>({left,right,top,bottom});
 const blocks=[{width:300,height:500,ink:[box(0,300,0,200),box(0,50,200,500)],clearance:12},
  {width:300,height:500,ink:[box(250,300,0,200),box(0,300,200,500)],clearance:12},
  {width:300,height:500,clearance:12}];
 const pages=paginateScore(blocks,'mobile');
 assert.equal(pages.length,2);
 assert.equal(pages[0][1].y,312,'Opposite protrusions interlock without a full-box gap');
 assert.equal(pages[1][0].y,0,'The next page starts at its margin, without a carried negative offset');
 for(const page of pages)for(let j=0;j<page.length;j++)for(let i=0;i<j;i++){
  const a=page[i],b=page[j],upper=blocks[a.index].ink!,lower=blocks[b.index].ink!;
  for(const x of upper)for(const y of lower)if(Math.min(x.right,y.right)>Math.max(x.left,y.left))assert(x.bottom+a.y+12<=y.top+b.y);
 }
});
