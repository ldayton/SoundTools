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
