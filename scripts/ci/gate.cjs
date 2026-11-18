function gate(needs) {
  for (const [job, state] of Object.entries(needs)) {
    if (!['success', 'skipped'].includes(state.result) || (['changes', 'shared'].includes(job) && state.result !== 'success')) throw Error(`Validation did not pass: ${job} (${state.result})`);
  }
  const selected = JSON.parse(needs.changes.outputs.apps);
  const required = selected.flatMap(app => app === 'soundglow' ? ['soundglow', 'soundglow-ui', 'soundglow-visual'] : app === 'songalong' ? ['songalong', 'songalong-catalog'] : app === 'notewise' ? ['notewise', 'notewise-backing'] : [app]);
  if (JSON.parse(needs.changes.outputs.builds).length) required.push('build');
  if (needs.changes.outputs.accounts === 'true') required.push('accounts');
  for (const job of required) if (needs[job]?.result !== 'success') throw Error(`Required validation was skipped or missing: ${job}`);
}
module.exports = { gate };
if (require.main === module) { try { gate(JSON.parse(process.env.CI_JOB_RESULTS)); console.log('All required validation passed'); } catch (e) { console.error(e.message); process.exitCode = 1; } }
