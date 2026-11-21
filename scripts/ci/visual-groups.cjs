const fs = require('node:fs');
const path = require('node:path');
// These existing shell/settings cases assert UI behavior, not realtime health.
// Everything new defaults to the exclusive timing group until reviewed.
const ui = Object.freeze(['application-shell.spec.cjs', 'migration-acceptance.spec.cjs', 'preset-dialogs.spec.cjs', 'library-actions.spec.cjs', 'pitch-controls.spec.cjs', 'diagnostics.spec.cjs']);
function groups(directory = path.resolve(__dirname, '../../apps/soundglow/tests/visual')) {
  const all = fs.readdirSync(directory).filter(file => file.endsWith('.spec.cjs')).sort();
  if (ui.some(file => !all.includes(file))) throw Error('Missing reviewed Soundglow UI case');
  return { ui: [...ui], timing: all.filter(file => !ui.includes(file)) };
}
module.exports = { groups };
