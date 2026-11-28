const { execFileSync } = require('node:child_process');
const path = require('node:path');
const target = process.argv[2];
if (target && !['diagnostics', 'tagaluya', 'dorego', 'notewise', 'songalong', 'soundglow'].includes(target)) throw Error('Unknown shared build target');
const cwd = path.resolve(__dirname, '..');
execFileSync('npm', ['run', 'build', '--workspace=@ldayton/browser-diagnostics'], { cwd, stdio: 'inherit' });
if (!target || target === 'soundglow') execFileSync('npm', ['run', 'prepare:shared', '--workspace=soundglow'], { cwd, stdio: 'inherit' });
