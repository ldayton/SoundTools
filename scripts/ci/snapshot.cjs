const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function assertRevision(root, sha) {
  if (git(root, ['rev-parse', 'HEAD']) !== sha || git(root, ['status', '--porcelain'])) throw Error('Local CI requires a clean, committed revision; commit changes before validating');
}
function snapshot(root, destination, sha) {
  assertRevision(root, sha);
  git(root, ['worktree', 'add', '--detach', '--no-checkout', destination, sha]);
  try {
    for (const file of git(root, ['ls-tree', '-r', '--name-only', sha]).split('\n')) {
      const source = path.join(root, file), target = path.join(destination, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (fs.lstatSync(source).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), target);
      else { fs.copyFileSync(source, target, fs.constants.COPYFILE_FICLONE); fs.chmodSync(target, fs.statSync(source).mode); }
    }
    git(destination, ['reset', '--mixed', sha]);
    // Private dependency files and relative workspace symlinks. Never symlink
    // node_modules to another checkout: its workspace links would escape.
    fs.cpSync(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), { recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE });
    assertRevision(destination, sha);
  } catch (error) { git(root, ['worktree', 'remove', '--force', destination]); throw error; }
}
module.exports = { git, assertRevision, snapshot };
