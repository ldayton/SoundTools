const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

// Vercel emits ES modules for these functions. Exercise the emitted JavaScript
// in Node with its production package scopes, without a TS/dev-server loader.
test('all four deployed login functions load and reject unapproved addresses', () => {
  const root = path.resolve(__dirname, '..');
  fs.mkdirSync(path.join(root, 'work'), { recursive: true });
  const temp = fs.mkdtempSync(path.join(root, 'work', 'account-functions-'));
  const copy = relative => {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) return;
    const target = path.join(temp, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  };
  const compile = relative => {
    const target = path.join(temp, relative.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  };
  try {
    copy('package.json');
    copy('packages/account/package.json');
    compile('packages/account/server.ts');
    for (const app of ['dorego', 'notewise', 'songalong', 'soundglow']) {
      copy(`apps/${app}/package.json`);
      copy(`apps/${app}/api/package.json`);
      copy(`apps/${app}/api/account/package.json`);
      const entry = `apps/${app}/api/account/login.ts`;
      compile(entry);
      const script = `
        import assert from 'node:assert/strict';
        const { default: handler } = await import(${JSON.stringify(path.join(temp, entry.replace(/\.ts$/, '.js')))});
        let body;
        const response = { setHeader() {}, end(value) { body = JSON.parse(value); } };
        await handler({ method: 'POST', headers: { origin: 'https://example.test' }, body: { email: 'not-approved@example.invalid' } }, response);
        assert.equal(response.statusCode, 403);
        assert.equal(body.error, 'Not on approved list.');
      `;
      const result = spawnSync(process.execPath, ['--no-experimental-detect-module', '--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_PUBLISHABLE_KEY: 'test-public-key', ACCOUNT_APPROVED_EMAIL: 'owner@example.test', ACCOUNT_APP_URL: 'https://example.test' },
      });
      assert.equal(result.status, 0, `${app}: ${result.stderr}`);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
