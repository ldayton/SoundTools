const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function assertRevision(root, sha) {
  if (git(root, ['rev-parse', 'HEAD']) !== sha || git(root, ['status', '--porcelain'])) throw Error('Local CI requires a clean, committed revision; commit changes before validating');
}
function snapshot(root, destination, sha, { clone = process.platform === 'darwin' } = {}) {
  assertRevision(root, sha);
  git(root, ['worktree', 'add', '--detach', '--no-checkout', destination, sha]);
  try {
    const groups = new Map();
    for (const file of git(root, ['ls-tree', '-r', '-z', '--name-only', sha]).split('\0').filter(Boolean)) {
      const source = path.join(root, file), target = path.join(destination, file), parent = path.dirname(target);
      fs.mkdirSync(parent, { recursive: true });
      if (fs.lstatSync(source).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), target);
      else if (clone && process.platform === 'darwin') {
        if (!groups.has(parent)) groups.set(parent, []); groups.get(parent).push(source);
      } else {
        fs.copyFileSync(source, target, clone ? fs.constants.COPYFILE_FICLONE_FORCE : 0); fs.chmodSync(target, fs.statSync(source).mode);
      }
    }
    // Node's FICLONE flag silently falls back on macOS. Native cp -c uses
    // clonefile(2) and fails explicitly if the filesystem cannot clone.
    for (const [parent, files] of groups) for (let index = 0; index < files.length; index += 100)
      execFileSync('/bin/cp', ['-c', '-p', ...files.slice(index, index + 100), parent]);
    git(destination, ['reset', '--mixed', sha]);
    // Private dependency files and relative workspace symlinks. Never symlink
    // node_modules to another checkout: its workspace links would escape.
    if (clone && process.platform === 'darwin') execFileSync('/bin/cp', ['-c', '-R', '-P', path.join(root, 'node_modules'), path.join(destination, 'node_modules')]);
    else fs.cpSync(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), { recursive: true, verbatimSymlinks: true, mode: clone ? fs.constants.COPYFILE_FICLONE_FORCE : 0 });
    assertRevision(destination, sha);
  } catch (error) { git(root, ['worktree', 'remove', '--force', destination]); throw error; }
}
function cloneSupported(root) {
  const directory = fs.mkdtempSync(path.join(root, 'work/ci-clone-probe-'));
  try {
    if (process.platform === 'darwin') execFileSync('/bin/cp', ['-c', path.join(root, 'package.json'), path.join(directory, 'probe')], { stdio: 'ignore' });
    else fs.copyFileSync(path.join(root, 'package.json'), path.join(directory, 'probe'), fs.constants.COPYFILE_FICLONE_FORCE);
    return true;
  } catch { return false; } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
module.exports = { git, assertRevision, snapshot, cloneSupported };
