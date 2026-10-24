const { createRuntime } = require('./runtime.cjs');
// Inline the pinned runtime: generated workers never import a sibling checkout or CDN.
function workerSource() {
  return `const offline = (${createRuntime.toString()})(self, CONFIG.base);\n`;
}
module.exports = { workerSource, createRuntime };
