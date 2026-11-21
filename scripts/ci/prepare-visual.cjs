const path = require('node:path');
const { execFileSync } = require('node:child_process');
require('./build.cjs').verify('soundglow');
execFileSync(process.execPath, ['tests/visual/prepare-replay.cjs'], { cwd: path.resolve(__dirname, '../../apps/soundglow'), stdio: 'inherit' });
