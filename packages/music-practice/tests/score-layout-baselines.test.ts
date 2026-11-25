import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {layoutVisualCases} from '../test-fixtures/score-layout';

test('all reviewed platform/browser baselines are complete and retain their approved bytes',async()=>{
  const base=new URL('../test-fixtures/score-layout-baselines/',import.meta.url);
  for(const platform of ['darwin','linux'])for(const engine of ['chromium','webkit']) {
    const directory=new URL(`${platform}/${engine}/`,base);
    const manifest=JSON.parse(await readFile(new URL('manifest.json',directory),'utf8'));
    assert.equal(manifest.platform,platform);assert.equal(manifest.engine,engine);
    assert.equal(manifest.reviewed,true);assert(manifest.review.reviewer&&manifest.review.date&&manifest.review.method);
    assert.equal(manifest.dpr,1);assert(manifest.browser);
    assert.deepEqual(manifest.records.map((record:{id:string})=>record.id),layoutVisualCases.map(fixture=>fixture.id));
    for(const [index,fixture] of layoutVisualCases.entries()) {
      const record=manifest.records[index];assert.equal(record.width,fixture.width);assert.equal(record.kind,fixture.kind);
      assert.deepEqual(record.violations,[]);
      const png=await readFile(new URL(`${fixture.id}.png`,directory));
      assert.deepEqual([...png.subarray(0,4)],[137,80,78,71]);
      assert.equal(createHash('sha256').update(png).digest('hex'),record.imageSha256,`${platform}/${engine}/${fixture.id}`);
    }
  }
});
