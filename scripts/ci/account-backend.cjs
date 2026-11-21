// This process owns only the stack identified by its snapshot working directory.
const { execFileSync } = require('node:child_process');
const { provision } = require('./infrastructure.cjs');
async function backend(action) {
  if (action === 'stop') { execFileSync('supabase', ['stack', 'stop'], { stdio: 'inherit' }); return; }
  if (action !== 'start') throw Error('Choose start or stop');
  await provision('supabase', ['start', '--runtime', 'docker', '--exclude', 'functions,studio,analytics,pooler', '--eager']);
  execFileSync('supabase', ['db', 'push'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/setup-account-local.mjs'], { stdio: 'inherit' });
}
module.exports = { backend };
if (require.main === module) backend(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
