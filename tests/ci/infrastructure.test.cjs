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

test('browser dependency source policy excludes optional vendor feeds and restores on success or failure', () => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
  const {spawnSync}=require('node:child_process');
  for(const failure of [false,true]){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'browser-apt-policy-'));
    try{
      const apt=path.join(directory,'apt'),bin=path.join(directory,'bin');
      fs.mkdirSync(path.join(apt,'sources.list.d'),{recursive:true});fs.mkdirSync(path.join(apt,'apt.conf.d'));fs.mkdirSync(bin);
      const source=path.join(apt,'sources.list.d/ubuntu.sources'),vendor=path.join(apt,'sources.list.d/microsoft.list');
      const signed='Types: deb\nURIs: https://archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
      fs.writeFileSync(source,signed);fs.writeFileSync(vendor,'deb [signed-by=/vendor-key] https://packages.microsoft.com/ubuntu/24.04/prod noble main\n');
      const vendorBefore=fs.readFileSync(vendor,'utf8'),capture=path.join(directory,'captured');
      fs.writeFileSync(path.join(bin,'sudo'),'#!/bin/sh\nexec "$@"\n',{mode:0o755});
      fs.writeFileSync(path.join(bin,'node'),'#!/bin/sh\ncat "$SOUNDTOOLS_APT_ROOT/apt.conf.d/99soundtools-ci-browser-sources" > "$APT_CAPTURE"\nexit "$INSTALL_STATUS"\n',{mode:0o755});
      const result=spawnSync('bash',['scripts/install-ci-browser.sh','webkit'],{env:{...process.env,RUNNER_OS:'Linux',SOUNDTOOLS_APT_ROOT:apt,PATH:bin+path.delimiter+process.env.PATH,APT_CAPTURE:capture,INSTALL_STATUS:failure?'9':'0'},encoding:'utf8'});
      assert.equal(result.status,failure?9:0,result.stderr);
      assert.equal(fs.readFileSync(capture,'utf8'),`Dir::Etc::sourcelist "${source}";\nDir::Etc::sourceparts "-";\n`);
      assert.equal(fs.readFileSync(source,'utf8'),signed);assert.equal(fs.readFileSync(vendor,'utf8'),vendorBefore);
      assert.equal(fs.existsSync(path.join(apt,'apt.conf.d/99soundtools-ci-browser-sources')),false);
    }finally{fs.rmSync(directory,{recursive:true,force:true});}
  }
});
