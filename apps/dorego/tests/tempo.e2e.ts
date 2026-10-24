import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const probe = { sources: [] as any[], context: null as AudioContext | null };
    (window as any).tempoProbe = probe;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.context = this;
        const create = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = create();
          const entry = { source, start: Infinity, ended: false, curves: [] as any[] };
          probe.sources.push(entry);
          const start = source.start.bind(source);
          source.start = (...args: [number?, number?, number?]) => {
            entry.start = args[0] ?? this.currentTime;
            start(...args);
          };
          source.addEventListener('ended', () => (entry.ended = true));
          const curve = source.playbackRate.setValueCurveAtTime.bind(source.playbackRate);
          source.playbackRate.setValueCurveAtTime = (values, time, duration) => {
            entry.curves.push({
              first: Array.from(values)[0],
              time,
              duration,
              count: Array.from(values).length,
            });
            return curve(values, time, duration);
          };
          return source;
        };
      }
    };
  });
  await page.goto('http://127.0.0.1:4317/');
  async function load(patch: Record<string, unknown>) {
    await page.evaluate((spec) => localStorage.setItem('dorego.current', JSON.stringify(spec)), {
      ...DEFAULT_SPEC,
      ...patch,
    });
    await page.reload();
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#play')?.disabled);
  }
  async function beat() {
    return page.evaluate(
      () =>
        (Number((document.querySelector('#position') as HTMLInputElement).value) *
          Number((document.querySelector('#bpm') as HTMLInputElement).value)) /
        60
    );
  }
  async function tempo(value: number) {
    const before = await beat();
    await page.locator('#bpm').fill(String(value));
    await page.locator('#bpm').blur();
    const after = await beat();
    assert.ok(Math.abs(after - before) < 0.35, `Beat jumped from ${before} to ${after}`);
  }
  await load({ pattern: 'arpeggio', countIn: 8, bpm: 120, repetitions: 1 });
  await page.locator('#play').click();
  await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
  await page.waitForTimeout(750);
  await tempo(60);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.waitForTimeout(250);
  await page.locator('#tempo-up').click();
  assert.equal(await page.locator('#bpm').inputValue(), '65');
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.locator('#play').click();
  const paused = await beat();
  await tempo(240);
  assert.equal(await page.locator('#play').textContent(), 'Resume');
  assert.ok(Math.abs((await beat()) - paused) < 0.03);

  await load({ pattern: 'major', low: 52, high: 64, bpm: 120, countIn: 0, repetitions: 1 });
  await page.locator('#play').click();
  await page.waitForFunction(() =>
    (window as any).tempoProbe.sources.some(
      (e: any) =>
        !e.ended && !e.source.loop && e.source.buffer && e.start < e.source.context.currentTime
    )
  );
  const piano = await page.evaluate(() => {
    const p = (window as any).tempoProbe;
    const index = p.sources.findIndex(
      (e: any) =>
        !e.ended && !e.source.loop && e.start < e.source.context.currentTime && e.source.buffer
    );
    return index;
  });
  assert.ok(piano >= 0);
  await tempo(60);
  assert.ok(
    await page.evaluate((index) => !(window as any).tempoProbe.sources[index].ended, piano),
    'The sounding piano note must continue'
  );
  assert.equal(await page.locator('#play').textContent(), 'Pause');

  await load({
    pattern: 'major',
    low: 52,
    high: 64,
    bpm: 240,
    countIn: 0,
    repetitions: 2,
    restBeats: 4,
  });
  await page.locator('#play').click();
  await page.waitForTimeout(2700);
  const restBeat = await beat();
  assert.ok(restBeat > 8 && restBeat < 12, `Expected rest, got beat ${restBeat}`);
  await tempo(60);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.waitForTimeout(400);
  assert.ok((await beat()) > restBeat && (await beat()) < 12);

  await page.setViewportSize({ width: 390, height: 844 });
  await load({
    pattern: 'octaveGlide',
    low: 52,
    high: 64,
    startingChords: false,
    countIn: 0,
    bpm: 150,
    repetitions: 1,
  });
  await page.locator('#play').click();
  await page.waitForTimeout(1500);
  const cello = await page.evaluate(() => {
    const p = (window as any).tempoProbe;
    return p.sources.findIndex(
      (e: any) => e.source.loop && !e.ended && e.start < e.source.context.currentTime
    );
  });
  assert.ok(cello >= 0);
  for (const bpm of [60, 240, 90, 180]) {
    await tempo(bpm);
    await page.waitForTimeout(80);
    assert.equal(await page.locator('#play').textContent(), 'Pause');
    assert.ok(
      await page.evaluate((index) => !(window as any).tempoProbe.sources[index].ended, cello),
      'A tempo change must keep the original cello source running'
    );
  }
  const retimed = await page.evaluate(
    (index) => (window as any).tempoProbe.sources[index].curves.length,
    cello
  );
  assert.equal(retimed, 5);
  const beforeSlider = await beat();
  await page.locator('#tempo-slider').fill('60');
  assert.ok(Math.abs((await beat()) - beforeSlider) < 0.35);
  assert.equal(await page.locator('#play').textContent(), 'Pause');
  await page.locator('#play').click();
  assert.deepEqual(errors, []);
  await page.reload();
  assert.equal(await page.locator('#bpm').inputValue(), '60');
  assert.equal(await page.locator('#pattern').inputValue(), 'octaveGlide');
  console.log(
    'PASS: live tempo during count-in, rests, sounding piano and cello on desktop/mobile; preserved beats, continuous sources, paused tempo, slider/buttons/typing, and persistence.'
  );
} finally {
  await browser.close();
}
