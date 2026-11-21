const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
// One attempt only. A passing retry must not erase the first failure's evidence.
function runCommand(command, args, { execute = execFileSync, now = Date.now, record = () => {}, ...options } = {}) {
  const started = now();
  let failure;
  try { return execute(command, args, options); }
  catch (error) { failure = error; throw error; }
  finally {
    record({ command, args, elapsedMs: now() - started, status: failure ? 'failure' : 'success',
      exitCode: failure?.status ?? (failure ? null : 0), signal: failure?.signal ?? null });
  }
}
function recorder(file, identity) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return result => {
    fs.appendFileSync(file, JSON.stringify({ ...identity, ...result }) + '\n');
    console.log(`[validation] ${identity.app}/${identity.profile}/${identity.browser}: ${result.status} in ${(result.elapsedMs / 1000).toFixed(1)}s: ${result.command} ${result.args.join(' ')}`);
  };
}
module.exports = { runCommand, recorder };
