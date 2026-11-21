const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execute } = require('../../scripts/ci/execute.cjs');

test('cancellation reaps a detached server even after its parent exits and it ignores SIGTERM', { skip: process.platform === 'win32' }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-detached-'));
  const fixture = path.join(directory, 'server.cjs'), ready = path.join(directory, 'ready.json');
  fs.writeFileSync(fixture, `
    if (process.argv[2] === 'child') {
      process.on('SIGTERM', () => {});
      const server = require('node:net').createServer();
      server.listen(0, '127.0.0.1', () => require('node:fs').writeFileSync(process.argv[3], JSON.stringify({pid:process.pid,port:server.address().port})));
    } else {
      require('node:child_process').spawn(process.execPath, [__filename, 'child', process.argv[2]], {detached:true,stdio:'ignore'});
      setInterval(() => {}, 1000);
    }
  `);
  const controller = new AbortController();
  const result = execute({ id: 'detached-server', command: process.execPath, args: [fixture, ready], cwd: directory }, { directory, signal: controller.signal });
  let child, owned;
  try {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(ready) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert(fs.existsSync(ready), 'Detached server did not start');
    child = JSON.parse(fs.readFileSync(ready));
    owned = require('../../scripts/ci/process-tree.cjs').ownedTree(child.pid);
    controller.abort();
    await result;
    const reachable = await new Promise(resolve => {
      const socket = net.connect(child.port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    assert.equal(reachable, false, 'Cancelled task leaked its detached listener');
  } finally {
    controller.abort();
    await result;
    if (owned) require('../../scripts/ci/process-tree.cjs').signalOwned(owned, 'SIGKILL');
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
