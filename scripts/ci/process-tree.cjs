const { execFileSync } = require('node:child_process');
function processes() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,stat=,lstart='], { encoding: 'utf8' }).trim().split('\n').map(line => {
    const [, pid, parent, state, born] = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
    return { pid: +pid, parent: +parent, state, born: born.trim() };
  });
}
function ownedTree(pid) {
  const all = processes(), owned = new Set([pid]);
  let previous;
  do { previous = owned.size; for (const process of all) if (owned.has(process.parent)) owned.add(process.pid); } while (previous !== owned.size);
  return all.filter(process => owned.has(process.pid));
}
function signalOwned(owned, signal) {
  // A process can exit during the grace period. Never signal a reused PID.
  const current = new Map(processes().map(process => [process.pid, process.born]));
  for (const record of owned) if (current.get(record.pid) === record.born) {
    try { process.kill(record.pid, signal); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
async function waitExited(owned) {
  const expected = new Map(owned.map(process => [process.pid, process.born]));
  const deadline = Date.now() + 2000;
  while (processes().some(process => expected.get(process.pid) === process.born && !process.state.startsWith('Z'))) {
    if (Date.now() >= deadline) throw Error('Owned task descendants survived SIGKILL');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
module.exports = { ownedTree, signalOwned, waitExited };
