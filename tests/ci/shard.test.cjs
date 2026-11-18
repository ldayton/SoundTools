const { test } = require('node:test');
const assert = require('node:assert/strict');
const { partition } = require('../../scripts/ci/shard.cjs');
test('catalog shards cover every case exactly once, including the remainder', () => {
  const all = Array.from({ length: 176 }, (_, i) => i), groups = [1, 2, 3].map(i => partition(all, `${i}/3`));
  assert.deepEqual(groups.flat().sort((a,b)=>a-b), all);
  assert.equal(new Set(groups.flat()).size, all.length);
  assert(Math.max(...groups.map(g=>g.length))-Math.min(...groups.map(g=>g.length)) <= 1);
});
test('rejects malformed, zero and out-of-bounds shard selections', () => { for (const s of ['0/3', '4/3', '1/0', '2', '1/513']) assert.throws(() => partition([], s)); });
