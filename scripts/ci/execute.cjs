const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
function parseUsage(text, platform = process.platform) {
  if (platform === 'darwin') {
    const cpu = /([\d.]+) real\s+([\d.]+) user\s+([\d.]+) sys/.exec(text);
    return { userSeconds: cpu ? +cpu[2] : null, systemSeconds: cpu ? +cpu[3] : null, maxRssBytes: Number(/(\d+)\s+maximum resident set size/.exec(text)?.[1]) || null };
  }
  return { userSeconds: Number(/User time \(seconds\): ([\d.]+)/.exec(text)?.[1]) || null, systemSeconds: Number(/System time \(seconds\): ([\d.]+)/.exec(text)?.[1]) || null, maxRssBytes: Number(/Maximum resident set size \(kbytes\): (\d+)/.exec(text)?.[1]) * 1024 || null };
}
function execute(task, { directory, signal } = {}) {
  const log = path.join(directory, `${task.id.replace(/[^\w.-]/g, '_')}.log`), usage = log + '.usage';
  fs.mkdirSync(directory, { recursive: true });
  const fd = fs.openSync(log, 'wx', 0o600);
  return new Promise(resolve => {
    const timed = fs.existsSync('/usr/bin/time');
    const command = timed ? '/usr/bin/time' : task.command;
    const args = timed ? [process.platform === 'darwin' ? '-l' : '-v', '-o', usage, task.command, ...task.args] : task.args;
    const child = spawn(command, args, { cwd: task.cwd, env: { ...process.env, ...task.env }, stdio: ['ignore', fd, fd], detached: process.platform !== 'win32' });
    let timedOut = false, killTimer;
    const kill = sig => { try { process.platform === 'win32' ? child.kill(sig) : process.kill(-child.pid, sig); } catch {} };
    const stop = () => { kill('SIGTERM'); killTimer = setTimeout(() => kill('SIGKILL'), 2000); killTimer.unref(); };
    const timeout = setTimeout(() => { timedOut = true; stop(); }, task.timeoutMs || 20 * 60000); timeout.unref();
    signal?.addEventListener('abort', stop, { once: true });
    child.once('error', error => finish(null, null, error.message));
    child.once('close', (code, sig) => finish(code, sig));
    let finished = false;
    function finish(exitCode, exitSignal, error) {
      if (finished) return; finished = true;
      clearTimeout(timeout); clearTimeout(killTimer); signal?.removeEventListener('abort', stop); fs.closeSync(fd);
      // Also release descendants that outlive their parent's exit (preview servers).
      kill('SIGTERM');
      resolve({ exitCode, signal: exitSignal, timedOut, ...(error ? { error } : {}), log, usage: fs.existsSync(usage) ? parseUsage(fs.readFileSync(usage, 'utf8')) : {} });
    }
  });
}
module.exports = { execute, parseUsage };
