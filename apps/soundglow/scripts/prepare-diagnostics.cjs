const fs = require('node:fs'), path = require('node:path');
const source = path.dirname(require.resolve('@ldayton/browser-diagnostics/package.json'));
const output = path.resolve(__dirname, '../dist/vendor/diagnostics');
fs.mkdirSync(output, { recursive: true });
for (const file of ['core.js', 'sentry.js', 'LICENSE', 'SENTRY-LICENSE', 'sentry.js.LEGAL.txt'])
  fs.copyFileSync(path.join(source, file), path.join(output, file));

const offline=path.dirname(require.resolve('@ldayton/browser-offline/package.json'));
const offlineOutput=path.resolve(__dirname,'../dist/vendor/offline');
fs.mkdirSync(offlineOutput,{recursive:true});
fs.copyFileSync(path.join(offline,'resources.cjs'),path.join(offlineOutput,'resources.js'));
fs.copyFileSync(path.join(offline,'LICENSE'),path.join(offlineOutput,'LICENSE'));

fs.copyFileSync(path.join(offline,'client.cjs'),path.join(offlineOutput,'client.js'));
