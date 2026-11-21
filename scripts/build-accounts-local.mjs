import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runTasks } from './ci/run.cjs';
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = { ...JSON.parse(readFileSync(new URL('../work/account-local.json', import.meta.url), 'utf8')) };
// App outputs are disjoint. This configuration differs from ordinary CI builds;
// it stays in the account snapshot and never replaces another lane's artifacts.
const tasks = ['dorego', 'songalong', 'notewise', 'soundglow'].map(app => ({
  id: `account-build:${app}`, command: 'npm', args: ['run', app === 'soundglow' ? 'prepare:shared' : 'build', '--workspace=' + app], cwd, env, needs: [], locks: [],
}));
const result = await runTasks(tasks, { workers: 2, identity: { group: 'account-build', configuration: 'local-account' } });
if (!result.passed) process.exitCode = 1;
