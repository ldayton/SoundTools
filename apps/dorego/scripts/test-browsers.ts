import { createRequire } from 'node:module';
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const names = (process.env.TEST_BROWSERS || 'chromium,firefox,webkit').split(',');
const suites = ['desktop', 'pages', 'lifecycle', 'offline'];
const results: { browser: string; suite: string; passed: boolean; seconds: number }[] = [];
// Sequential execution avoids audio underruns caused by competing test engines.
for (const browser of names) {
  for (const suite of suites) {
    console.log(`\n[${browser}] ${suite}`);
    const started = performance.now();
    const passed = await new Promise<boolean>((resolve) => {
      const child = spawn(
        process.execPath,
        [tsxCli, `tests/${suite}.e2e.ts`],
        {
          stdio: 'inherit',
          env: { ...process.env, TEST_BROWSER: browser },
        }
      );
      child.on('error', (error) => {
        console.error(error);
        resolve(false);
      });
      child.on('exit', (code) => resolve(code === 0));
    });
    results.push({
      browser,
      suite,
      passed,
      seconds: Math.round((performance.now() - started) / 1000),
    });
  }
}
await mkdir('work', { recursive: true });
await writeFile(
  'work/browser-results.json',
  JSON.stringify({ date: new Date().toISOString(), results }, null, 2)
);
console.table(results);
if (results.some((result) => !result.passed)) process.exitCode = 1;
