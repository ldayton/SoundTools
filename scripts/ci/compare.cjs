const fs = require('node:fs');
const path = require('node:path');
function read(directory) { return { inventory: JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json'))), results: JSON.parse(fs.readFileSync(path.join(directory, 'results.json'))), local: fs.existsSync(path.join(directory, 'local.json')) ? JSON.parse(fs.readFileSync(path.join(directory, 'local.json'))) : null }; }
function coverage(inventory) {
  return inventory.tasks.map(task => ({ id: task.id, coverage: task.coverage || [{ command: path.basename(task.command), args: task.args }], needs: task.needs })).sort((a, b) => a.id.localeCompare(b.id));
}
function compare(before, after) {
  if (before.inventory.sha !== after.inventory.sha) throw Error('Benchmark commits differ');
  if (!before.results.passed || !after.results.passed) throw Error('Failed/incomplete runs are not performance wins');
  if (JSON.stringify(coverage(before.inventory)) !== JSON.stringify(coverage(after.inventory))) throw Error('Coverage or dependency graph differs');
  const beforeMs = before.local?.elapsedMs || before.results.elapsedMs, afterMs = after.local?.elapsedMs || after.results.elapsedMs;
  if ((before.local && !before.local.passed) || (after.local && !after.local.passed)) throw Error('Local lifecycle failed');
  return { sha: after.inventory.sha, tasks: after.inventory.tasks.length, beforeWorkers: before.inventory.workers, afterWorkers: after.inventory.workers,
    beforeSeconds: beforeMs / 1000, afterSeconds: afterMs / 1000,
    speedup: +(beforeMs / afterMs).toFixed(2), coverage: 'identical' };
}
module.exports = { compare, coverage };
if (require.main === module) { try { console.log(JSON.stringify(compare(...process.argv.slice(2).map(read)), null, 2)); } catch (error) { console.error(error.message); process.exitCode = 1; } }
