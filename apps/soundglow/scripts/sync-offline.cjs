// Explicit offline package release. Normal app builds never access another checkout.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), source = path.join(root, 'packages/browser-offline');
const target = process.argv[2] && path.resolve(process.argv[2]);
if (!target || target === root) throw Error('Usage: node scripts/sync-offline.cjs /path/to/DoReGo');
const pkg = require(path.join(source, 'package.json'));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = Object.fromEntries(['package.json', ...pkg.files].map(file => [file, sha(fs.readFileSync(path.join(source, file)))]));
const projects = [root, ...(target ? [target] : [])];
// Refuse same-version changes before touching any consumer or artifact.
for (const project of projects) {
  const pinPath = path.join(project, 'vendor/browser-offline.json');
  if (fs.existsSync(pinPath)) {
    const pin = JSON.parse(fs.readFileSync(pinPath));
    if (pin.version === pkg.version && JSON.stringify(pin.files) !== JSON.stringify(files))
      throw Error('Offline package changed: increment its version before releasing.');
    const numbers = version => version.split('.').map(Number);
    const before = numbers(pin.version), after = numbers(pkg.version);
    const order = after.map((n, i) => n - before[i]).find(n => n !== 0) || 0;
    if (order < 0) throw Error('Offline package versions must move forward.');
  }
}
cp.execFileSync('npm', ['test'], { cwd: source, stdio: 'inherit' });
const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'browser-offline-pack-'));
try {
  cp.execFileSync('npm', ['pack', source, '--pack-destination', temp], { cwd: root, stdio: 'inherit' });
  const artifact = `ldayton-browser-offline-${pkg.version}.tgz`, bytes = fs.readFileSync(path.join(temp, artifact));
  for (const project of projects) {
    const dest = path.join(project, 'vendor', artifact);
    if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(bytes))
      throw Error('Refusing to overwrite a different offline tarball under the same version.');
  }
  for (const project of projects) {
    fs.mkdirSync(path.join(project, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(project, 'vendor', artifact), bytes);
    cp.execFileSync('npm', ['install', '--save-exact', '--ignore-scripts', './vendor/' + artifact], { cwd: project, stdio: 'inherit' });
    fs.writeFileSync(path.join(project, 'vendor/browser-offline.json'), JSON.stringify({ name: pkg.name, version: pkg.version, sha256: sha(bytes), sourceRepository: 'https://github.com/ldayton/Soundglow', sourceDirectory: 'packages/browser-offline', artifact, files }, null, 2) + '\n');
    cp.execFileSync(process.execPath, ['node_modules/@ldayton/browser-offline/verify.cjs'], { cwd: project, stdio: 'inherit' });
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
// A release is reviewable only after both consumers exercise the emitted workers.
for (const [project, checks] of [[root, ['test:offline-package', 'test:updates']], [target, ['test:offline-package', 'build:pages', 'test:offline']]])
  for (const check of checks) cp.execFileSync('npm', ['run', check], { cwd: project, stdio: 'inherit' });
