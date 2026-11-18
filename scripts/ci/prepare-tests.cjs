const path = require('node:path');
const { execFileSync } = require('node:child_process');
if (process.env.CI_USE_BUILD === '1') {
  require('./build.cjs').verify(process.argv[2]);
  console.log('Using verified CI build; no recompilation');
} else {
  execFileSync('npm', ['run', 'prepare:shared', '--workspace=' + process.argv[2]], { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' });
}
