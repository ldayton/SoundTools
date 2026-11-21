// Account engines own disjoint stacks, snapshots and logs. Stop both even if
// one fails; retain each result so its snapshot ownership cannot be discarded.
async function stopOwnedBackends({ created, backends, starts, directories, execute }) {
  const names = created.filter(name => name.startsWith('accounts-') && backends[name] && starts.has(`${name}:backend`));
  const results = await Promise.allSettled(names.map(name => execute({
    id: `stop-${name}`, command: process.execPath,
    args: ['scripts/ci/account-backend.cjs', 'stop'], cwd: directories[name], env: backends[name],
  }, { directory: require('node:path').join(directories[name], 'work/ci-private') })));
  return results.map((result, index) => result.status === 'fulfilled'
    ? { name: names[index], exitCode: result.value.exitCode, timedOut: result.value.timedOut }
    : { name: names[index], exitCode: null, timedOut: false, error: result.reason?.message || String(result.reason) });
}
module.exports = { stopOwnedBackends };
