function gate(needs) {
  for (const [job, state] of Object.entries(needs)) {
    if (!['success', 'skipped'].includes(state.result) || (['changes', 'shared'].includes(job) && state.result !== 'success')) throw Error(`Validation did not pass: ${job} (${state.result})`);
  }
}
module.exports = { gate };
if (require.main === module) { try { gate(JSON.parse(process.env.CI_JOB_RESULTS)); console.log('All required validation passed'); } catch (e) { console.error(e.message); process.exitCode = 1; } }
