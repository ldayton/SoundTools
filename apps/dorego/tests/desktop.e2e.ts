import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url).resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { DEFAULT_SPEC } from '../src/music';
import { browserName, launchTestBrowser } from './browser-harness';

const base = 'http://127.0.0.1:4327/DoReGo/';
const server = spawn(
  process.execPath,
  [
    viteCli,
    'preview',
    '--mode',
    'pages',
    '--outDir',
    'dist-pages',
    '--host',
    '127.0.0.1',
    '--port',
    '4327',
    '--strictPort',
  ],
  { stdio: 'pipe' }
);
let logs = '';
server.stdout.on('data', (data) => (logs += data));
server.stderr.on('data', (data) => (logs += data));
let browser;
try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* Starting preview. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await launchTestBrowser();
  // This suite controls network faults directly; offline/PWA is exercised separately.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(
    (spec) => {
      if (!localStorage.getItem('dorego.current'))
        localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
      const probe = {
        monitoring: false,
        context: null as AudioContext | null,
        sources: [] as any[],
        outputs: [] as AudioNode[],
        meter: null as AnalyserNode | null,
        sink: null as GainNode | null,
      };
      (window as any).desktopProbe = probe;
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (this: AudioNode, dest: any, ...args: any[]) {
        if (dest instanceof AudioDestinationNode && !probe.monitoring) probe.outputs.push(this);
        return (connect as any).call(this, dest, ...args);
      } as typeof connect;
      const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        constructor(options?: AudioContextOptions) {
          super(options);
          if (options?.latencyHint === 'playback') probe.context = this;
          const create = this.createBufferSource.bind(this);
          this.createBufferSource = () => {
            const source = create();
            const entry = { context: this, source, started: false, ended: false };
            probe.sources.push(entry);
            const start = source.start.bind(source);
            source.start = (...args: [number?, number?, number?]) => {
              entry.started = true;
              start(...args);
            };
            source.addEventListener('ended', () => (entry.ended = true));
            return source;
          };
        }
      };
    },
    {
      ...DEFAULT_SPEC,
      pattern: 'octaveArpeggio',
      low: 52,
      high: 66,
      countIn: 0,
      repetitions: process.env.NATIVE_WINDOW_TEST ? 15 : 3,
      restBeats: 0,
    }
  );
  const ready = () =>
    page.waitForFunction(
      () => document.querySelector<HTMLButtonElement>('#play')?.disabled === false
    );
  const playing = () => page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  const position = () => page.locator('#position').inputValue().then(Number);
  const paused = async () => {
    await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
    const at = await position();
    await page.waitForTimeout(180);
    assert.equal(await position(), at, 'A paused position must not drift.');
    await page.waitForFunction(() =>
      (window as any).desktopProbe.sources.every(
        (s: any) => !s.started || s.ended || (s.source.buffer?.duration ?? 0) < 0.1
      )
    );
    return at;
  };
  const progress = async () => {
    const at = await position();
    await page.waitForFunction(
      (previous) =>
        Number(document.querySelector<HTMLInputElement>('#position')!.value) > previous + 0.08,
      at
    );
  };
  const audible = async () => {
    await page.evaluate(() => {
      const p = (window as any).desktopProbe;
      p.meter?.disconnect();
      p.sink?.disconnect();
      const sources = [
        ...new Set<AudioNode>(p.outputs.filter((node: AudioNode) => node.context === p.context)),
      ];
      p.meter = p.context.createAnalyser();
      p.sink = p.context.createGain();
      p.sink.gain.value = 0;
      p.monitoring = true;
      for (const source of sources) source.connect(p.meter);
      p.meter.connect(p.sink);
      p.sink.connect(p.context.destination);
      p.monitoring = false;
    });
    await page.waitForFunction(() => {
      const p = (window as any).desktopProbe;
      const data = new Float32Array(p.meter.fftSize);
      p.meter.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length) > 0.00001;
    });
  };
  await page.goto(base);
  await ready();
  await page.locator('#play').click();
  await playing();
  await progress();
  await audible();
  if (process.env.NATIVE_WINDOW_TEST) {
    const beforeWindowChange = await position();
    console.log(
      'NATIVE WINDOW CHECKPOINT: minimize/restore/zoom the dedicated Chromium window, then send a newline.'
    );
    process.stdin.resume();
    await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
    process.stdin.pause();
    assert.match(await page.locator('#play').innerText(), /Pause/);
    assert.ok(
      (await position()) > beforeWindowChange,
      'Playback must advance through the native window changes.'
    );
    await progress();
    await mkdir('work', { recursive: true });
    await page.screenshot({ path: 'work/native-window-restored.png' });
    console.log(
      'PASS: native window minimize/restore/zoom retained playing state and advancing position.'
    );
  }
  await page.locator('#play').click();
  await paused();
  for (let i = 0; i < 8; i++) {
    await page.locator('#play').click();
    await playing();
    await page.locator('#play').click();
    await paused();
  }
  console.log(
    `${browserName}: piano produces PCM; rapid toggles stop all scheduled sources and preserve pause position.`
  );

  await page.locator('#play').click();
  await playing();
  await progress();
  const beatBefore = ((await position()) * 150) / 60;
  await page.locator('#bpm').fill('60');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#tempo-slider').inputValue(), '60');
  const beatAfter = ((await position()) * 60) / 60;
  assert.ok(
    beatAfter >= beatBefore - 0.15 && beatAfter < beatBefore + 3,
    'Changing tempo must retain the musical position.'
  );
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').inputValue(), '65');
  await page.locator('#volume').fill('-30');
  assert.match(await page.locator('#play').innerText(), /Pause/);
  await progress();
  await page.locator('#tempo-slider').fill('240');
  await page.locator('#tempo-slider').press('Tab');
  assert.equal(await page.locator('#bpm').inputValue(), '240');
  await page.locator('#volume').fill('0');
  await progress();

  // Real pointer seeking pauses at the chosen position and never leaves old voices running.
  const seek = await page.locator('#position').boundingBox();
  assert.ok(seek);
  await page.mouse.click(seek.x + seek.width * 0.45, seek.y + seek.height / 2);
  const sought = await paused();
  assert.ok(sought > 1);
  await page.locator('#play').click();
  await playing();
  await progress();
  for (const width of [900, 760, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.match(await page.locator('#play').innerText(), /Pause/);
    assert.ok((await position()) >= sought);
  }
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForTimeout(900);
  await page.bringToFront();
  await other.close();
  assert.match(await page.locator('#play').innerText(), /Pause/);
  await progress();
  console.log(
    `${browserName}: live tempo/volume, pointer seek, resize/breakpoints, and tab switching retain coherent playback.`
  );

  // Changing the exercise is an intentional reset; old notes must end before new playback.
  await page.locator('#pattern').selectOption('fifthGlide');
  await ready();
  assert.equal(await position(), 0);
  assert.equal(await page.locator('#play').innerText(), 'Play');
  await page.locator('#play').click();
  await playing();
  await progress();
  await page.waitForFunction(() =>
    (window as any).desktopProbe.sources.some(
      (s: any) => s.started && !s.ended && s.source.loop && s.source.buffer?.duration > 0.1
    )
  );
  await audible();
  await page.locator('#low-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose lowest note' })
    .getByRole('button', { name: 'F3', exact: true })
    .click();
  await ready();
  assert.equal(await position(), 0);
  await page.locator('#play').click();
  await playing();
  await progress();
  await page.locator('#restart').click();
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.equal(await position(), 0);
  await page.waitForFunction(() =>
    (window as any).desktopProbe.sources.every(
      (s: any) => !s.started || s.ended || (s.source.buffer?.duration ?? 0) < 0.1
    )
  );
  console.log(
    `${browserName}: sampled glides, note selection, exercise replacement and restart stop prior voices.`
  );

  // Persistence and obsolete/failed loads: gate fresh requests, change the exercise repeatedly,
  // then release old failures. The final selection alone may determine readiness.
  await page.reload();
  await ready();
  assert.equal(await page.locator('#pattern').inputValue(), 'fifthGlide');
  assert.equal(await page.locator('#bpm').inputValue(), '240');
  assert.equal(await page.locator('#volume').inputValue(), '0');
  assert.equal(await page.locator('#low').inputValue(), '53');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/samples/**/*.flac', async (route) => {
    await gate;
    await route.abort('failed');
  });
  await page.locator('#pattern').selectOption('rossini');
  await page.locator('#high-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'G5', exact: true })
    .click();
  assert.equal(await page.locator('#play').isDisabled(), true);
  await page.locator('#pattern').selectOption('octaveArpeggio');
  await page.locator('#high-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'F4', exact: true })
    .click();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await ready();
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveArpeggio');
  // A final selection can share a request that was deliberately failed. Its retry
  // must use fresh requests and remain immune to older loading completions.
  if ((await page.locator('#play').innerText()) === 'Retry audio') {
    await page.locator('#play').click();
    await ready();
  }
  assert.equal(await page.locator('#play').innerText(), 'Play');
  await page.locator('#play').click();
  await playing();
  await progress();
  await page.locator('#play').click();
  await paused();
  console.log(
    `${browserName}: saved controls restore; obsolete loading failures cannot override the final exercise.`
  );
  assert.deepEqual(errors, []);
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: `work/desktop-${browserName}.png` });
} catch (error) {
  await mkdir('work', { recursive: true });
  for (const context of browser?.contexts() || [])
    for (const page of context.pages()) {
      await page.screenshot({ path: `work/desktop-${browserName}-failure.png` }).catch(() => {});
      console.error(
        await page
          .evaluate(() => {
            const p = (window as any).desktopProbe;
            const d = new Float32Array(p.meter?.fftSize || 32);
            p.meter?.getFloatTimeDomainData(d);
            return {
              context: p.context?.state,
              time: p.context?.currentTime,
              outputs: p.outputs.map((n: AudioNode) => ({
                type: n.constructor.name,
                state: n.context.state,
                time: n.context.currentTime,
                live: n.context === p.context,
              })),
              sources: p.sources.filter((s: any) => s.started && !s.ended).length,
              peak: Math.max(...d),
            };
          })
          .catch(() => null)
      );
      console.error(
        await page
          .locator('body')
          .innerText()
          .catch(() => 'No document')
      );
    }
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
