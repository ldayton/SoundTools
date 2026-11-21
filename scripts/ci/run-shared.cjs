const { sharedTasks } = require('./task-graph.cjs');
const { runTasks } = require('./run.cjs');
runTasks(sharedTasks(), { identity: { group: 'shared' } }).then(result => { if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.stack); process.exitCode = 1; });
