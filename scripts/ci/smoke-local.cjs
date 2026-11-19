const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const net = require('node:net');
const fs = require('node:fs');
const { apps } = require('./apps.cjs');
const { waitForServer } = require('./browser-harness.cjs');
const { smokeBrowser } = require('./smoke-browser.cjs');
async function smokeLocal(app) {
  if (!apps[app]) throw Error('Unknown app');
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const vite = require.resolve('vite/package.json').replace(/package.json$/, 'bin/vite.js');
  const directory = path.resolve(__dirname, '../../apps', app);
  const base = app === 'soundglow' ? JSON.parse(fs.readFileSync(path.join(directory, 'site/release.json'))).base : '/';
  const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort', '--base', base, '--outDir', app === 'soundglow' ? 'site' : 'dist'], { cwd: directory, stdio: 'ignore' });
  const origin = `http://127.0.0.1:${port}${base === '/' ? '' : base}`;
  try { await waitForServer(origin, { server }); await smokeBrowser(origin, app); }
  finally { server.kill(); }
}
module.exports = { smokeLocal };
if (require.main === module) smokeLocal(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
