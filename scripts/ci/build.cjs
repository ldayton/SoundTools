const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { apps } = require('./apps.cjs');
const root = path.resolve(__dirname, '../..');
const sha = () => process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(directory, prefix) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e => {
    const name = `${prefix}/${e.name}`;
    if (e.isSymbolicLink()) throw Error('Build outputs must not contain symbolic links');
    return e.isDirectory() ? files(path.join(directory, e.name), name) : [name];
  });
}
function outputPaths(app) {
  if (!apps[app]) throw Error('Unknown build app');
  const output = app === 'soundglow'
    ? ['site', 'dist/ui', 'dist/vendor/diagnostics', 'dist/vendor/offline', 'dist/vendor/file-audio']
    : app === 'dorego' ? ['dist', 'dist-pages'] : ['dist'];
  return [...output.map(p => `apps/${app}/${p}`), 'packages/browser-diagnostics/sentry.js', 'packages/browser-diagnostics/sentry.js.LEGAL.txt'];
}
function manifest(app, directory = root, revision = sha()) {
  const all = outputPaths(app).flatMap(p => fs.statSync(path.join(directory, p)).isDirectory() ? files(path.join(directory, p), p) : [p]);
  return { app, sha: revision, profile: 'ci', files: Object.fromEntries(all.map(p => [p, digest(path.join(directory, p))])) };
}
function verifyBuild(data, { app = data.app, revision = sha(), directory = root } = {}) {
  if (!apps[app] || data.app !== app || data.sha !== revision || data.profile !== 'ci') throw Error('Build artifact app, commit or configuration does not match this job');
  const allowed = outputPaths(app);
  if (!data.files || !Object.keys(data.files).length) throw Error('Build artifact inventory is empty');
  for (const [file, hash] of Object.entries(data.files)) {
    if (file.includes('..') || file.includes('\\') || !allowed.some(p => file === p || file.startsWith(p + '/')) || !/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid build artifact path or digest');
    if (digest(path.join(directory, file)) !== hash) throw Error(`Build artifact changed: ${file}`);
  }
  return true;
}
const manifestPath = app => path.join(root, 'work/ci-provenance', `${app}.json`);
function verify(app) { return verifyBuild(JSON.parse(fs.readFileSync(manifestPath(app))), { app }); }
function build(app, { prepared = false } = {}) {
  if (!apps[app]) throw Error('Unknown build app');
  const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });
  if (!prepared) run('npm', ['run', 'build:shared', '--', app]);
  if (app === 'soundglow') {
    run(process.execPath, ['scripts/verify-assets.cjs'], path.join(root, 'apps/soundglow'));
    run(process.execPath, ['scripts/build-site.cjs'], path.join(root, 'apps/soundglow'));
  } else {
    run('npm', ['run', 'build', '--workspace=' + app]);
    // The preceding build owns the identical TypeScript project check. Both
    // Vite configurations still build fresh outputs at this exact revision.
    if (app === 'dorego') run('npm', ['run', 'build:pages:bundle', '--workspace=dorego']);
  }
  if (app === 'dorego') for (const out of ['dist', 'dist-pages']) {
    const originals = path.join(root, 'apps/dorego', out, 'samples/bitklavier');
    for (const f of fs.readdirSync(originals)) if (f !== 'NOTICE.txt') fs.rmSync(path.join(originals, f), { recursive: true });
  }
  const { preflight, buildInfo } = require('./preflight.cjs');
  for (const out of app === 'dorego' ? ['dist', 'dist-pages'] : [app === 'soundglow' ? 'site' : 'dist']) {
    const output = path.join(root, 'apps', app, out);
    preflight(app, output);
    buildInfo(app, output, 'ci');
  }
  fs.mkdirSync(path.dirname(manifestPath(app)), { recursive: true });
  const data = manifest(app);
  fs.writeFileSync(manifestPath(app), JSON.stringify(data));
  verifyBuild(data);
  console.log(`Verified ${app} CI build: ${Object.keys(data.files).length} files, commit ${data.sha}`);
}
module.exports = { manifest, verifyBuild, verify, build, outputPaths };
if (require.main === module) { try { if (process.argv[2] === 'verify') verify(process.argv[3]); else build(process.argv[2], { prepared: process.argv[3] === '--prepared' }); } catch (e) { console.error(e.message); process.exitCode = 1; } }
