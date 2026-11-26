import test from 'node:test';
import assert from 'node:assert/strict';
import {skyline,skylineClearance,placeVerticalRows,placeOutsideLanes,type InkBox} from '../src/score-layout/skyline';
import {planScoreFlow} from '../src/score-layout/flow';
const box=(left:number,right:number,top:number,bottom:number):InkBox=>({left,right,top,bottom});
const distance=(a:InkBox[],b:InkBox[],padding:number)=>Math.max(-Infinity,...a.flatMap(a=>b.filter(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)).map(b=>a.bottom-b.top+padding)));
test('exact intervals distinguish neighbouring, touching and overlapping ink',()=>{
 const upper=[box(1.5,4.2,0,8)];
 for(const [left,right,expected] of [[4.3,7,-Infinity],[4.2,7,-Infinity],[4.1,7,7]])assert.equal(skylineClearance(skyline(upper,'bottom'),skyline([box(left,right,2,4)],'top'),1).distance,expected);
 assert.deepEqual(skyline([], 'top'),[]);
 assert.deepEqual(skyline([box(0,0,1,2)],'bottom'),[]);
 assert.throws(()=>skyline([box(0,Infinity,1,2)],'top'),RangeError);
 assert.throws(()=>placeVerticalRows([],NaN,0),RangeError);
});
test('nested contours merge, preserve gaps and identify the limiting objects',()=>{
 const shape=skyline([{...box(0,10,0,2),id:'staff'},{...box(2,4,0,8),id:'stem'},box(12,14,0,3)],'bottom');
 assert.deepEqual(shape.map(s=>[s.left,s.right,s.edge]),[[0,2,2],[2,4,8],[4,10,2],[12,14,3]]);
 assert.equal(skylineClearance(shape,skyline([{...box(3,5,4,6),id:'head'}],'top'),1).upper,'stem');
});
test('seeded shapes agree with an independent all-pairs rectangle oracle',()=>{
 let state=3125;const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/2**32);
 for(let trial=0;trial<150;trial++){
  const make=()=>Array.from({length:12},()=>{const x=random()*30,y=random()*30;return box(x,x+random()*10,y,y+random()*15);});
  const a=make(),b=make(),padding=random()*3;
  const actual=skylineClearance(skyline(a,'bottom'),skyline(b,'top'),padding).distance;
  assert(Math.abs(actual-distance(a,b,padding))<1e-10);
  const shifted=(boxes:InkBox[])=>boxes.map(b=>({left:b.left*2+9,right:b.right*2+9,top:b.top*2-5,bottom:b.bottom*2-5}));
  assert(Math.abs(skylineClearance(skyline(shifted(a),'bottom'),skyline(shifted(b),'top'),padding*2).distance-actual*2)<1e-9);
 }
});
test('staff placement respects every preceding staff, including sparse intervening rows',()=>{
 const rows=[{top:0,bottom:4,ink:[box(0,3,0,30)]},{top:15,bottom:19,ink:[box(8,10,15,19)]},{top:30,bottom:34,ink:[box(0,3,30,34)]}];
 const plan=placeVerticalRows(rows,3,2);
 assert.equal(plan.offsets[2],2,'The first staff constrains the third through the empty middle region');
 rows.forEach((row,j)=>rows.slice(0,j).forEach((upper,i)=>assert(distance([...upper.ink],[...row.ink],2)<=plan.offsets[j]-plan.offsets[i])));
 assert.deepEqual(placeVerticalRows(rows,3,2),plan);
});
test('separate protrusions pack closer; matching protrusions retain real clearance',()=>{
 const upper={top:0,bottom:4,ink:[box(0,10,0,4),box(0,2,4,14)]};
 const lower=(x:number)=>({top:30,bottom:34,ink:[box(0,10,30,34),box(x,x+2,20,30)]});
 const disjoint=placeVerticalRows([upper,lower(8)],3,2),overlap=placeVerticalRows([upper,lower(0)],3,2);
 assert(disjoint.offsets[1]<overlap.offsets[1]);
 assert.equal(overlap.offsets[1],-4);
});
test('physical block flow interlocks ink without changing block sizes',()=>{
 const a={width:100,height:100,ink:[box(0,100,0,50),box(0,20,50,100)],clearance:5};
 const b={width:100,height:100,ink:[box(80,100,0,50),box(0,100,50,100)],clearance:5};
 assert.deepEqual(planScoreFlow([a,b]),{positions:[0,55],height:155});
 assert.deepEqual(planScoreFlow([{width:100,height:100},{width:100,height:100}]),{positions:[0,112],height:212});
 assert.throws(()=>planScoreFlow([{width:-1,height:100}]),RangeError);
});

test('outside lanes move together, outward only, and retain separate lyric rows',()=>{
 const fixed=[box(0,10,0,4),box(4,6,-4,0)];
 const chord=[box(0,3,-3,-1),box(4,7,-3,-1)];
 const lyrics=[box(0,3,4,6),box(0,3,8,10),box(4,8,4,6)];
 assert.deepEqual(placeOutsideLanes(fixed,[{side:'top',ink:chord},{side:'bottom',ink:lyrics}],1),[-4,1]);
 assert.deepEqual(placeOutsideLanes(fixed,[{side:'top',ink:[box(0,3,-10,-8)]}],1),[0]);
});

test('block flow retains a tall earlier extent when its last block is shorter',()=>{
 assert.deepEqual(planScoreFlow([
  {width:100,height:200,ink:[box(0,30,0,200)],clearance:5},
  {width:100,height:40,ink:[box(70,100,0,40)],clearance:5},
 ]),{positions:[0,0],height:200});
});
