import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const { runTasks } = await import("./ci/run.cjs");
const bootstrap = await runTasks([
  { id: 'account-database', command: 'node', args: ['scripts/test-account-database.mjs'], needs: [], locks: ['database'] },
  { id: 'file-database', command: 'node', args: ['scripts/test-file-storage-database.mjs'], needs: ['account-database'], locks: ['database'] },
  { id: 'account-protocol', command: 'npx', args: ['tsx', 'tests/account-protocol.browser.mts'], needs: ['file-database'], locks: ['database'] },
  { id: 'account-build', command: 'node', args: ['scripts/build-accounts-local.mjs'], needs: [], locks: [] },
], { workers: 2, identity: { group: 'account-bootstrap' } });
if (!bootstrap.passed) throw Error('Account bootstrap failed; see retained task logs');
const servers = spawn("node", ["scripts/dev-accounts.mjs", "--preview"], {
  stdio: "inherit",
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (
        await Promise.all(
          [4391, 4392, 4393, 4394].map((port) =>
            fetch(`http://127.0.0.1:${port}/`),
          ),
        )
      ).every((r) => r.ok);
    } catch {}
    if (ready) break;
    await setTimeout(100);
  }
  if (!ready) throw Error("Local account previews did not start.");
  // These files deliberately share an owner, DB mutations and inbox. Keep their
  // order until each fixture has an isolated namespace and recipient lookup.
  const files = ['accounts.browser.mts', 'accounts-extra.browser.mts', 'accounts-reliability.browser.mts', 'account-link-window.browser.mts', 'native-files.browser.mts'];
  const result = await runTasks(files.map((file, index) => ({
    id: file, command: 'npx', args: ['tsx', 'tests/' + file],
    needs: index ? [files[index - 1]] : [], locks: ['account-fixtures'],
  })), { identity: { group: 'account-browser', browser: process.env.TEST_BROWSER || 'chromium' } });
  if (!result.passed) throw Error('Account integration failed; see retained task logs');
} finally {
  servers.kill("SIGTERM");
}
