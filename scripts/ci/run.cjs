const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { schedule, workerCount } = require('./scheduler.cjs');
const { execute } = require('./execute.cjs');
const root = path.resolve(__dirname, '../..');
async function runTasks(tasks, { directory = path.join(root, 'work/ci-results', `${Date.now()}-${randomUUID().slice(0, 8)}`), workers = workerCount(), identity = {}, signal } = {}) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sha = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const manifest = { sha, workers, platform: process.platform, arch: process.arch, cpus: os.availableParallelism(), memoryBytes: os.totalmem(), node: process.version, ...identity,
    tasks: tasks.map(({ env, ...task }) => task) };
  fs.writeFileSync(path.join(directory, 'inventory.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const events = path.join(directory, 'events.jsonl'); fs.writeFileSync(events, '', { flag: 'wx' });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  const start = performance.now(); let recordingError;
  try {
    const results = await schedule(tasks, { workers, signal: controller.signal,
      execute: task => execute(task, { directory: task.privateLogDirectory || path.join(directory, 'logs'), signal: controller.signal }),
      onEvent(event) { try { fs.appendFileSync(events, JSON.stringify(event) + '\n'); } catch (error) { recordingError ||= error; controller.abort(); } console.log(`[ci] ${event.status} ${event.id}${event.elapsedMs === undefined ? '' : ` ${(event.elapsedMs / 1000).toFixed(1)}s`}${event.status === 'failure' ? ` log=${event.log || event.error}` : ''}`); },
    });
    if (recordingError) throw recordingError;
    const summary = { sha, workers, ...identity, elapsedMs: Math.round(performance.now() - start), passed: results.every(result => result.status === 'success'), results };
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
    console.log(`CI ${summary.passed ? 'passed' : 'failed'} in ${(summary.elapsedMs / 1000).toFixed(1)}s. Evidence: ${directory}`);
    return summary;
  } finally { controller.abort(); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); signal?.removeEventListener('abort', abort); }
}
module.exports = { runTasks };
