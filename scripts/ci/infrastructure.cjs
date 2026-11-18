const { spawnSync } = require('node:child_process');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function provision(command, args, { run = spawnSync, wait = sleep, attempts = 2, timeout = 180000, log = console.log } = {}) {
  if (!((command === 'npx' && args[0] === 'playwright' && args[1] === 'install') || (command === 'supabase' && args[0] === 'start'))) throw Error('Only browser installation and local backend startup may be retried');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    log(`Provisioning ${command} (${attempt}/${attempts})`);
    const r = run(command, args, { stdio: 'inherit', timeout, killSignal: 'SIGKILL' });
    if (!r.error && r.status === 0) return;
    if (attempt === attempts) throw Error(`${command} provisioning failed after ${attempts} attempts`);
    await wait(2000);
  }
}
module.exports = { provision };
if (require.main === module) provision(process.argv[2], process.argv.slice(3)).catch(e => { console.error(e.message); process.exitCode = 1; });
