const estimates = require('./durations.json');
function key(app, browser, command, args) {
  return `${app}/${browser}/${command === process.execPath ? 'node' : command} ${args.join(' ')}`;
}
function estimate(app, browser, command, args) {
  return estimates.seconds[key(app, browser, command, args)] ?? estimates.fallbackSeconds;
}
// Longest-processing-time assignment, with stable ties and bounded shard size.
// Unknown commands remain required and use an explicit conservative fallback.
function balanced(items, total, cost) {
  if (!Number.isInteger(total) || total < 1 || total > items.length) throw Error('Invalid shard count');
  const bins = Array.from({length:total}, () => ({cost:0, items:[]}));
  const limit = Math.ceil(items.length / total);
  items.map((item,index) => ({item,index,cost:cost(item)})).sort((a,b) => b.cost-a.cost || a.index-b.index).forEach(entry => {
    if (!Number.isFinite(entry.cost) || entry.cost <= 0) throw Error('Invalid duration estimate');
    const bin = bins.map((bin,index) => ({bin,index})).filter(({bin})=>bin.items.length<limit)
      .sort((a,b)=>a.bin.cost-b.bin.cost || a.index-b.index)[0].bin;
    bin.items.push(entry); bin.cost += entry.cost;
  });
  return bins.map(bin => bin.items.sort((a,b)=>a.index-b.index).map(entry=>entry.item));
}
module.exports = {key, estimate, balanced};
