// Compare execution ownership, not npm alias spelling or assertion counts.
// This detects repeat files; it cannot establish that two different tests prove
// the same behavior. Review assertions and fixtures before retiring either.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function executions(app, tier, browser = 'chromium', directory = root) {
  const { plan } = require(path.join(directory, 'scripts/ci/test-strategy.cjs'));
  const { leaves } = require(path.join(directory, 'scripts/ci/inventory.cjs'));
  const { browserSuites } = require(path.join(directory, 'scripts/ci/task-graph.cjs'));
  const selected = plan(app, tier, browser).flatMap(([command, args]) => app === 'dorego' && args.includes('test:browsers')
    ? browserSuites.map(suite => ['npm', ['exec', '--workspace=dorego', '--', 'tsx', `tests/${suite}.e2e.ts`]]) : [[command, args]]);
  return selected.flatMap(([command, args]) => leaves(command, args)).flatMap(entry => {
    let { command, args, cwd } = entry;
    if (command === 'npm' && args[0] === 'exec') {
      const workspace = args.find(arg => arg.startsWith('--workspace='))?.split('=')[1];
      if (workspace) cwd = 'apps/' + workspace;
      [command, ...args] = args.slice(args.indexOf('--') + 1);
    }
    // Setup/build/syntax verification remains in the resource inventory, not
    // the test-file duplicate report. Multi-file Node invocations are expanded.
    if (!['node', 'tsx'].includes(command) || args.includes('--check')) return [];
    return args.filter(arg => /\.(?:cjs|mjs|mts|ts|js)$/.test(arg) && !arg.startsWith('-') && !/\/(?:prepare-tests|prepare-replay)\.cjs$/.test('/' + arg))
      .map(arg => path.posix.normalize(path.posix.join(cwd, arg)));
  });
}
function duplicates(files) {
  const counts = new Map();
  for (const file of files) counts.set(file, (counts.get(file) || 0) + 1);
  return Object.fromEntries([...counts].filter(([, count]) => count > 1));
}
module.exports = { executions, duplicates };
if (require.main === module) {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : root;
  const rows = [];
  for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) for (const browser of ['chromium', 'webkit']) {
    const files = executions(app, 'nightly', browser, directory);
    rows.push({ app, browser, executions: files.length, distinctFiles: new Set(files).size, duplicates: duplicates(files) });
  }
  console.log(JSON.stringify(rows, null, 2));
}
