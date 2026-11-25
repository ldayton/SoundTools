import test from 'node:test';
import assert from 'node:assert/strict';
import abcjs from 'abcjs';
import {correctWrappedBarNumbers} from '../src/score-markings';

test('wrapping an opening repeat does not invent a numbered measure',()=>{
  const tune=abcjs.parseOnly('X:1\nM:4/4\nL:1/4\n%%barnumbers 1\nK:C\n|: C4 | D4 | E4 :| F4 |]',{lineBreaks:[[1,2,3]] as unknown as number[]})[0];
  const staffs=tune.lines.flatMap(line=>line.staff||[]) as {barNumber?:number}[];
  assert.deepEqual(staffs.map(staff=>staff.barNumber),[undefined,3,4,5],'Actual renderer wrapping demonstrates the offset');
  correctWrappedBarNumbers(tune);
  assert.deepEqual(staffs.map(staff=>staff.barNumber),[undefined,2,3,4]);
});

test('ordinary wrapped measures retain their existing numbering',()=>{
  const tune=abcjs.parseOnly('X:1\nM:4/4\nL:1/4\n%%barnumbers 1\nK:C\nC4 | D4 | E4 | F4 |]',{lineBreaks:[[0,1,2]] as unknown as number[]})[0];
  const before=JSON.stringify(tune.lines);
  correctWrappedBarNumbers(tune);
  assert.equal(JSON.stringify(tune.lines),before);
});
