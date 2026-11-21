// Keep failure evidence and source diffs, not gigabytes of disposable builds.
const fs = require('node:fs');
const path = require('node:path');
const { git } = require('./snapshot.cjs');
function retainEvidence(snapshot, destination) {
  const apps = ['dorego', 'notewise', 'songalong', 'soundglow'];
  const reports = apps.flatMap(app => {
    const directory = path.join(snapshot, 'apps', app);
    return fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => /^playwright-report(?:-|$)/.test(name)).map(name => `apps/${app}/${name}`) : [];
  });
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const directory of ['work/ci-results', 'work/browser-results', ...['dorego', 'notewise', 'songalong', 'soundglow'].flatMap(app => [`apps/${app}/work/browser-results`, `apps/${app}/test-results`]), ...reports]) {
    const source = path.join(snapshot, directory);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(destination, directory), { recursive: true });
  }
  for (const directory of ['work', ...['dorego', 'notewise', 'songalong', 'soundglow'].map(app => `apps/${app}/work`)]) {
    const source = path.join(snapshot, directory);
    if (!fs.existsSync(source)) continue;
    for (const file of fs.readdirSync(source).filter(file => file.endsWith('.png'))) {
      const target = path.join(destination, directory, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(source, file), target);
    }
  }
  const diff = git(snapshot, ['diff', 'HEAD', '--binary']);
  if (diff) fs.writeFileSync(path.join(destination, 'source-changes.patch'), diff + '\n', { flag: 'wx', mode: 0o600 });
  for (const file of git(snapshot, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)) {
    if (/(?:^|\/)\.env|work\/ci-private\/|work\/account-local(?:-status)?\.json/.test(file)) continue;
    const source = path.join(snapshot, file), target = path.join(destination, 'untracked-source', file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(source, target, { recursive: true, verbatimSymlinks: true });
  }
}
module.exports = { retainEvidence };
