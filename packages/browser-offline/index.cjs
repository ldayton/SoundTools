const { createResources } = require('./resources.cjs');
const { createRuntime } = require('./runtime.cjs');
// Inline the pinned runtime: generated workers never import a sibling checkout or CDN.
function workerSource() {
  return `const offlineResources = (${createResources.toString()})(self);\nconst offline = (${createRuntime.toString()})(self, CONFIG.base, offlineResources);\n`;
}
module.exports = { workerSource, createRuntime, createResources };
