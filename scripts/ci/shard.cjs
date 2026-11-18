function partition(items, shard = process.env.TEST_SHARD || '1/1') {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  if (!match) throw Error('Use TEST_SHARD=index/total');
  const index = Number(match[1]), total = Number(match[2]);
  if (index > total || total > 512) throw Error('Invalid test shard bounds');
  return items.filter((_, i) => i % total === index - 1);
}
module.exports = { partition };
