import { verifyVoiceFeedback } from './voice-feedback.browser';
import { verifyLiveDrone } from './live-drone';
import {
  waitForServer,
  captureFailure,
  closeBrowser,
  createContext,
} from '../../../scripts/ci/browser-harness.cjs';
import { setTempo } from './ui-helpers';
import { elapsedSeconds } from './ui-helpers';
import { selectExercise, openPracticeOptions } from './ui-helpers';
import { readSpecValue, sliderValue, setSlider } from './ui-helpers';
import { createRequire } from 'node:module';
const viteCli = createRequire(import.meta.url)
  .resolve('vite/package.json')
  .replace(/package\.json$/, 'bin/vite.js');
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
  await waitForServer(base, { server });
  browser = await launchTestBrowser();
  // This suite controls network faults directly; offline/PWA is exercised separately.
  const context = await createContext(browser, {
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(createRequire(import.meta.url)('../../../packages/browser-controls/test-fixtures/media-session.cjs').mediaSessionProbe);
  await page.addInitScript(
    (spec) => {
      if (!localStorage.getItem('dorego.current'))
        localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.glideShapeVersion', '1');
      if (!('audioSession' in navigator))
        Object.defineProperty(navigator, 'audioSession', { value: { type: 'auto' } });
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
  const position = () => elapsedSeconds(page).then(Number);
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
        Number(document.querySelector('#elapsed')!.getAttribute('data-seconds')) > previous + 0.08,
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
  assert.equal(
    await page.evaluate(() => (navigator as any).audioSession.type),
    'playback',
    'The app requests media playback audio before the first Play'
  );
  assert.ok(
    await page.evaluate(() =>
      (window as any).mediaRegistrationSessionTypes.every((type: string) => type === 'playback')
    ),
    'Playback audio is configured before system media actions'
  );
  await page.locator('#play').click();
  await playing();
  await progress();
  await audible();
  assert.equal(await page.evaluate(() => navigator.mediaSession.playbackState), 'playing');
  assert.equal(
    await page.evaluate(() => navigator.mediaSession.metadata?.title),
    await page.locator('#exercise-title').textContent()
  );
  await page.evaluate(() => {
    (window as any).mediaActions.get('pause')({ action: 'pause' });
    (window as any).mediaActions.get('pause')({ action: 'pause' });
  });
  await page.getByRole('button', { name: 'Resume', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.mediaSession.playbackState), 'paused');
  const mediaPause = await position();
  await page.evaluate(() => {
    (window as any).mediaActions.get('play')({ action: 'play' });
    (window as any).mediaActions.get('play')({ action: 'play' });
  });
  await playing();
  await progress();
  assert.ok((await position()) >= mediaPause, 'System Play resumes without resetting the exercise');
  await page.evaluate(() =>
    (window as any).mediaActions.get('seekto')({ action: 'seekto', seekTime: 5 })
  );
  await page.waitForFunction(
    () => Number(document.querySelector('#elapsed')?.getAttribute('data-seconds')) >= 5
  );
  await page.evaluate(() => (window as any).mediaActions.get('nexttrack')({ action: 'nexttrack' }));
  await page.locator('[data-pattern="rossini"][aria-current="true"]').waitFor();
  assert.equal(await page.evaluate(() => navigator.mediaSession.playbackState), 'none', 'Selecting the next exercise prepares it without auto-playing');
  await page.evaluate(() => (window as any).mediaActions.get('previoustrack')({action:'previoustrack'}));
  await page.locator('[data-pattern="octaveArpeggio"][aria-current="true"]').waitFor();
  await selectExercise(page, 'breathSquares');
  await page.locator('#breath-play').waitFor();
  await page.waitForFunction(() => navigator.mediaSession.metadata?.title === 'Breath Squares');
  await page.evaluate(() => (window as any).mediaActions.get('play')({action:'play'}));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'playing');
  await page.evaluate(() => (window as any).mediaActions.get('pause')({action:'pause'}));
  await page.waitForFunction(() => navigator.mediaSession.playbackState === 'paused');
  await page.evaluate(() => (window as any).mediaActions.get('nexttrack')({action:'nexttrack'}));
  await page.locator('[data-pattern="arpeggio"][aria-current="true"]').waitFor();
  await page.waitForFunction(() => navigator.mediaSession.metadata?.title.startsWith('Arpeggio & Scale'));
  await ready();
  await page.evaluate(() => (window as any).mediaActions.get('play')({action:'play'}));
  await playing();
  await page.evaluate(() => (window as any).mediaActions.get('pause')({action:'pause'}));
  await paused();
  await selectExercise(page, 'octaveArpeggio');
  await page.locator('#play').click();
  await playing();

  const beforeSameExercise = await position();
  await page.locator('[data-pattern][aria-current="true"]').click();
  await playing();
  assert.ok(
    (await position()) >= beforeSameExercise,
    'Reselecting the current exercise keeps its playhead'
  );
  await progress();
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
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '60');
  const beatAfter = ((await position()) * 60) / 60;
  assert.ok(
    beatAfter >= beatBefore - 0.15 && beatAfter < beatBefore + 3,
    'Changing tempo must retain the musical position.'
  );
  await page.locator('#bpm').press('ArrowUp');
  await page.locator('#bpm').press('Tab');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '65');
  await setSlider(page, 'volume', 3);
  assert.match(await page.locator('#play').innerText(), /Pause/);
  await progress();
  await setTempo(page, 240);
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '240');
  await setSlider(page, 'volume', 100);
  await progress();

  const checkpoint = await position();
  await progress();
  for (const width of [900, 760, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.match(await page.locator('#play').innerText(), /Pause/);
    assert.ok((await position()) >= checkpoint);
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
    `${browserName}: live tempo/volume, elapsed display, resize/breakpoints, and tab switching retain coherent playback.`
  );

  // Changing the exercise is an intentional reset; old notes must end before new playback.
  await selectExercise(page, 'fifthGlide');
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
  await playing();
  await progress();
  assert.ok((await position()) > 0, 'Range edits retain the currently sounding round');
  assert.ok(await page.locator('#next-round').isDisabled(), 'An out-of-range continuation is removed without stopping the current round');
  await page.locator('#restart').click();
  assert.equal(await page.locator('#play').innerText(), 'Play');
  assert.equal(await position(), 0);
  await page.waitForFunction(() =>
    (window as any).desktopProbe.sources.every(
      (s: any) => !s.started || s.ended || (s.source.buffer?.duration ?? 0) < 0.1
    )
  );
  console.log(
    `${browserName}: sampled glides, uninterrupted range edits, exercise replacement and explicit restart.`
  );

  // Persistence and obsolete/failed loads: gate fresh requests, change the exercise repeatedly,
  // then release old failures. The final selection alone may determine readiness.
  await page.reload();
  await ready();
  assert.equal(await readSpecValue(page, 'pattern'), 'fifthGlide');
  assert.equal(await page.locator('#bpm').getAttribute('aria-valuenow'), '240');
  assert.equal(await sliderValue(page, 'volume'), '100');
  assert.equal(await readSpecValue(page, 'low'), '53');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/samples/**/*.flac', async (route) => {
    await gate;
    await route.abort('failed');
  });
  await selectExercise(page, 'rossini');
  await page.locator('#high-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'G5', exact: true })
    .click();
  assert.equal(await page.locator('#play').isDisabled(), true);
  await selectExercise(page, 'octaveArpeggio');
  await page.locator('#high-spin').click();
  await page
    .getByRole('dialog', { name: 'Choose highest note' })
    .getByRole('button', { name: 'F4', exact: true })
    .click();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await ready();
  assert.equal(await readSpecValue(page, 'pattern'), 'octaveArpeggio');
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
  // Repeating is a direct playback action, independent of next-round navigation.
  await page.locator('#restart').click();
  await page.getByRole('button',{name:'Next round',exact:true}).click();
  const selectedRound=await page.locator('#exercise-summary').textContent();
  assert.match(selectedRound!, /Round 2 of/);
  const selectedStart=await position();
  await page.getByRole('button',{name:'Repeat round',exact:true}).click();
  await playing();
  await progress();
  assert.equal(await page.locator('#exercise-summary').textContent(),selectedRound);
  assert.ok((await position()) >= selectedStart);
  await page.waitForFunction(start => Number(document.querySelector('#elapsed')!.getAttribute('data-seconds')) > start + 0.5, selectedStart);
  const beforeRepeat=await position();
  await page.locator('#repeat-round').click();
  await page.waitForFunction(previous => Number(document.querySelector('#elapsed')!.getAttribute('data-seconds')) < previous - 0.2, beforeRepeat);
  await progress();
  await audible();
  await page.locator('#play').click();
  await paused();
  // A completed one-round exercise has no Next, but Repeat must still play it.
  const finalPage=await context.newPage();
  finalPage.on('pageerror', error => errors.push(error.message));
  await finalPage.addInitScript(spec => localStorage.setItem('dorego.current',JSON.stringify(spec)), {...DEFAULT_SPEC,pattern:'major',direction:'up',bpm:240,countIn:8,repetitions:1,restBeats:8,low:60,high:72});
  await finalPage.goto(base);
  await finalPage.locator('#play:enabled').waitFor();
  const firstRepeatAt=performance.now();
  await finalPage.locator('#repeat-round').click();
  await finalPage.waitForFunction(()=>document.querySelector('#play')?.getAttribute('data-mode')==='playing');
  await finalPage.getByText('Rest · repeat round in',{exact:true}).waitFor();
  assert.ok(Number(await finalPage.locator('#elapsed').getAttribute('data-seconds')) <= 2.01, 'The selected round stays at its onset during the replay rest');
  await finalPage.waitForFunction(()=>Number(document.querySelector('#elapsed')?.getAttribute('data-seconds'))>2.05);
  assert.ok(performance.now()-firstRepeatAt >= 1900, 'Eight rest beats at 240 BPM precede playback');
  assert.equal(await finalPage.locator('#stage').getAttribute('data-counting'),'false','Repeating starts the round without replaying the session count-in');
  await finalPage.getByRole('button',{name:'Replay',exact:true}).waitFor();
  assert.ok(await finalPage.locator('#next-round').isDisabled());
  await finalPage.setViewportSize({width:390,height:844});
  await finalPage.waitForFunction(() => document.querySelector<HTMLElement>('.practice-options')?.dataset.layout === 'mobile' && !document.querySelector('.mantine-AppShell-navbar'));
  if (await finalPage.locator('#practice-options-reopen').getAttribute('aria-expanded') === 'true')
    await finalPage.getByRole('button',{name:'Close practice options',exact:true}).click();
  await finalPage.locator('.mantine-Drawer-content:visible').waitFor({state:'hidden'});
  const repeat=finalPage.getByRole('button',{name:'Repeat round',exact:true});
  await finalPage.waitForFunction(() => {
    const button = document.querySelector('#repeat-round')?.getBoundingClientRect();
    return button && Math.abs(button.x + button.width / 2 - innerWidth / 2) < 1;
  });
  const repeatBounds=await repeat.boundingBox();
  assert.ok(repeatBounds && repeatBounds.height >= 44 && repeatBounds.x >= 0 && repeatBounds.x+repeatBounds.width <= 390);
  await finalPage.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  await finalPage.screenshot({path:'/tmp/dorego-repeat-round-mobile.png'});
  await repeat.click();
  await finalPage.getByText('Rest · repeat round in',{exact:true}).waitFor();
  await finalPage.locator('#play').click();
  await finalPage.getByRole('button',{name:'Resume',exact:true}).waitFor();
  assert.equal(await finalPage.getByText('Rest · repeat round in',{exact:true}).count(),0,'Pause cancels the pending repeat rest');
  // The initial cold-start Repeat above owns the timed eight-beat rest check.
  // This completed-round witness also proves the latest rest setting can be zero.
  await openPracticeOptions(finalPage);
  await finalPage.locator('#rest-mobile').fill('0');
  await finalPage.locator('#rest-mobile').press('Tab');
  assert.equal(await readSpecValue(finalPage, 'restBeats'), '0');
  await finalPage.getByRole('button',{name:'Close practice options',exact:true}).click();
  await finalPage.locator('.mantine-Drawer-content:visible').waitFor({state:'hidden'});
  await repeat.click();
  await finalPage.waitForFunction(()=>document.querySelector('#play')?.getAttribute('data-mode')==='playing' && Number(document.querySelector('#elapsed')?.getAttribute('data-seconds'))>2.05);
  assert.equal(await finalPage.getByText('Rest · repeat round in',{exact:true}).count(),0, 'Repeat uses the newly selected zero rest');
  assert.equal(await finalPage.locator('#exercise-summary').textContent(),'Round 1 of 1');
  assert.ok(await finalPage.locator('#next-round').isDisabled());
  await finalPage.close();
  // A hung OS resume must release the UI; the next user action gets a fresh engine.
  await page.evaluate(() => {
    const p=(window as any).desktopProbe;
    p.failedContext=p.context;
    p.context.resume=()=>new Promise(()=>{});
  });
  await page.locator('#play').click();
  await page.getByText('Audio did not restart. Tap Resume or a piano note to try again.', {exact:true}).waitFor();
  await paused();
  await page.locator('#play').click();
  await playing();
  await progress();
  assert.ok(await page.evaluate(() => (window as any).desktopProbe.context !== (window as any).desktopProbe.failedContext));
  await audible();
  await page.locator('#play').click();
  await paused();
  assert.deepEqual(errors, []);
  await mkdir('work', { recursive: true });
  await page.screenshot({ path: `work/desktop-${browserName}.png` });
  await verifyLiveDrone(browser!, base);
  await verifyVoiceFeedback(browser!, base);
} catch (error) {
  await captureFailure(browser, error);
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
  await closeBrowser(browser);
  server.kill('SIGTERM');
}
