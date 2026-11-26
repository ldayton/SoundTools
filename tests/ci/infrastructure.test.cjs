const { test } = require('node:test');
const assert = require('node:assert/strict');
const { provision } = require('../../scripts/ci/infrastructure.cjs');
test('retries a transient backend failure once and stops on success', async () => { let calls = 0; await provision('supabase', ['start'], { run: () => ({ status: ++calls === 1 ? 1 : 0 }), wait: async () => {}, log: () => {} }); assert.equal(calls, 2); });
test('bounds repeated infrastructure failures and process timeouts', async () => { let calls = 0; await assert.rejects(provision('npx', ['playwright', 'install', 'webkit'], { run: (_cmd, _args, options) => { calls++; assert.equal(options.timeout, 180000); return { error: Error('timeout') }; }, wait: async () => {}, log: () => {} }), /after 2 attempts/); assert.equal(calls, 2); });
test('does not retry test failures or build commands', async () => { for (const [command, args] of [['npm', ['test']], ['supabase', ['db', 'push']], ['npx', ['playwright', 'test']]]) await assert.rejects(provision(command, args), /Only/); });

test('Linux browser provisioning waits for the existing apt lock within its deadline', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-install-lock-'));
  try {
    const sudo = path.join(directory, 'sudo'), npx = path.join(directory, 'npx');
    fs.writeFileSync(sudo, '#!/bin/sh\nif [ "$1" = "tee" ]; then cat > "$LOCK_CAPTURE"; else exit 0; fi\n', {mode:0o755});
    fs.writeFileSync(npx, '#!/bin/sh\nprintf "%s\\n" "$@" > "$INSTALL_CAPTURE"\n', {mode:0o755});
    const lock = path.join(directory, 'lock'), install = path.join(directory, 'install');
    execFileSync('bash', ['scripts/install-ci-browser.sh', 'chromium'], {env:{...process.env, RUNNER_OS:'Linux', PATH:directory+path.delimiter+process.env.PATH, LOCK_CAPTURE:lock, INSTALL_CAPTURE:install}, stdio:'pipe'});
    assert.equal(fs.readFileSync(lock,'utf8'), 'DPkg::Lock::Timeout "120";\n');
    assert.equal(fs.readFileSync(install,'utf8'), 'playwright\ninstall\n--with-deps\nchromium\n');
  } finally { fs.rmSync(directory, {recursive:true,force:true}); }
});
