const { createResources } = require('./resources.cjs');
const { createUpdatePolicy, createWorkerSession, applyUpdate } = require('./client.cjs');
const { startupHTML } = require('./bootstrap.cjs');
const { createRuntime } = require('./runtime.cjs');
// Inline the pinned runtime: generated workers never import a sibling checkout or CDN.
function workerSource() {
  return `const offlineResources = (${createResources.toString()})(self);\nconst offline = (${createRuntime.toString()})(self, CONFIG.base, offlineResources);\n`;
}
module.exports = { startupHTML, workerSource, createRuntime, createResources, createUpdatePolicy, createWorkerSession, applyUpdate };
