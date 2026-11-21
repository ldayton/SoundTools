// This process owns only the stack identified by its snapshot working directory.
const { execFileSync } = require('node:child_process');
const { provision } = require('./infrastructure.cjs');
const path = require('node:path');
function destroyOwnedStack(cwd = process.cwd(), run = execFileSync) {
  cwd = path.resolve(cwd);
  if (!/[\\/]work[\\/]ci-snapshots[\\/][^\\/]+[\\/]accounts-(chromium|webkit)$/.test(cwd))
    throw Error('Refusing backend destruction outside an owned account snapshot');
  const { stacks } = JSON.parse(run('supabase', ['stack', 'list', '--output-format', 'json'], { encoding: 'utf8' }));
  const owned = stacks.filter(stack => path.resolve(stack.project_root) === cwd && stack.name === 'default');
  for (const stack of owned) {
    if (!/^[a-f0-9]{64}$/.test(stack.id)) throw Error('Invalid owned stack id');
    run('supabase', ['stack', 'destroy', '--stack-id', stack.id, '--yes'], { stdio: 'inherit' });
  }
}
async function backend(action) {
  if (action === 'stop') { destroyOwnedStack(); return; }
  if (action !== 'start') throw Error('Choose start or stop');
  await provision('supabase', ['start', '--runtime', 'docker', '--exclude', 'functions,studio,analytics,pooler', '--eager']);
  execFileSync('supabase', ['db', 'push'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/setup-account-local.mjs'], { stdio: 'inherit' });
}
module.exports = { backend, destroyOwnedStack };
if (require.main === module) backend(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
