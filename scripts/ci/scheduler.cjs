// Shared dependency/resource scheduler. A task is attempted once; independent
// work finishes after a failure, while its dependants are reported blocked.
const os = require('node:os');
function workerCount(value = process.env.CI_WORKERS) {
  const count = value === undefined ? Math.min(process.env.CI ? 2 : 6, Math.max(1, Math.floor(os.availableParallelism() / 2))) : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 32) throw Error('CI_WORKERS must be an integer from 1 to 32');
  return count;
}
function validate(tasks) {
  const nodes = new Map(tasks.map(task => [task.id, task]));
  if (nodes.size !== tasks.length) throw Error('Duplicate task id');
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (!nodes.has(id)) throw Error(`Unknown dependency: ${id}`);
    if (visiting.has(id)) throw Error(`Dependency cycle: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of nodes.get(id).needs || []) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const task of tasks) {
    if (!task.id || !Array.isArray(task.locks) || task.locks.some(lock => typeof lock !== 'string') || !Number.isInteger(task.slots ?? 1) || (task.slots ?? 1) < 1) throw Error('Invalid task resource declaration');
    visit(task.id);
  }
}
async function schedule(tasks, { workers = workerCount(), execute, onEvent = () => {}, signal } = {}) {
  validate(tasks); workerCount(workers);
  const pending = new Map(tasks.map(task => [task.id, task])), results = new Map(), running = new Map(), held = new Set();
  let used = 0; const graphStarted = Date.now();
  while (pending.size || running.size) {
    let progressed = false;
    for (const [id, task] of [...pending].sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0))) {
      const dependencies = task.needs || [];
      if (signal?.aborted || dependencies.some(dep => results.has(dep) && results.get(dep).status !== 'success')) {
        const result = { id, status: signal?.aborted ? 'cancelled' : 'blocked' };
        pending.delete(id); progressed = true; results.set(id, result); onEvent(result); continue;
      }
      const slots = Math.min(workers, task.slots ?? 1);
      if (dependencies.some(dep => !results.has(dep)) || task.locks.some(lock => held.has(lock))) continue;
      // Reserve capacity for an eligible critical prerequisite rather than
      // indefinitely filling its free slots with lower-priority leaf work.
      if (used + slots > workers) { if ((task.priority || 0) > 0) break; continue; }
      pending.delete(id); used += slots; task.locks.forEach(lock => held.add(lock));
      const startedAt = new Date().toISOString(), started = performance.now();
      const readyAt = Math.max(graphStarted, ...dependencies.map(dep => Date.parse(results.get(dep).finishedAt)));
      const queuedMs = Math.max(0, Date.now() - readyAt);
      onEvent({ id, status: 'running', startedAt, queuedMs });
      const promise = Promise.resolve().then(() => execute(task, signal)).then(
        data => ({ ...data, status: signal?.aborted ? 'cancelled' : data?.exitCode === 0 && !data?.timedOut ? 'success' : 'failure' }),
        error => ({ status: signal?.aborted ? 'cancelled' : 'failure', error: error.message, exitCode: null }),
      ).then(data => {
        const result = { ...data, id, startedAt, queuedMs, finishedAt: new Date().toISOString(), elapsedMs: Math.round(performance.now() - started) };
        results.set(id, result); running.delete(id); used -= slots; task.locks.forEach(lock => held.delete(lock)); onEvent(result);
      });
      running.set(id, promise);
    }
    if (running.size) await Promise.race(running.values());
    else if (pending.size && !progressed) throw Error('Unschedulable graph');
  }
  return tasks.map(task => results.get(task.id));
}
module.exports = { schedule, validate, workerCount };
