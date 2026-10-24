const fs = require('node:fs'), path = require('node:path');
const source = path.dirname(require.resolve('@ldayton/browser-diagnostics/package.json'));
const output = path.resolve(__dirname, '../dist/vendor/diagnostics');
fs.mkdirSync(output, { recursive: true });
for (const file of ['core.js', 'sentry.js', 'LICENSE', 'SENTRY-LICENSE', 'sentry.js.LEGAL.txt'])
  fs.copyFileSync(path.join(source, file), path.join(output, file));
