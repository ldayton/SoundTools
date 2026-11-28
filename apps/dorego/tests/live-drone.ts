import assert from 'node:assert/strict';
import type { Browser } from 'playwright';
import { newPage, waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import { DEFAULT_SPEC } from '../src/music';

/** Live audio belongs to the desktop suite's realtime-audio resource lock. */
export async function verifyLiveDrone(browser: Browser, base: string) {
  for (const width of [1440, 390])
    for (const pattern of ['maqamat', 'yemenite']) {
      const page = await newPage(browser, { viewport: { width, height: 1000 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(
        (spec) => {
          if (!localStorage.getItem('dorego.current'))
            localStorage.setItem('dorego.current', JSON.stringify(spec));
          const probe = { notes: [] as any[], drones: [] as any[] };
          (window as any).droneProbe = probe;
          const edges = new WeakMap<AudioNode, AudioNode>();
          (window as any).droneEdges = edges;
          const connect = AudioNode.prototype.connect;
          AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
            if (args[0] instanceof AudioNode) edges.set(this, args[0]);
            return connect.apply(this, args as any);
          } as any;
          for (const [prototype, kind] of [
            [AudioBufferSourceNode.prototype, 'notes'],
            [OscillatorNode.prototype, 'drones'],
          ] as const) {
            const start = prototype.start,
              stop = prototype.stop;
            prototype.start = function (...args: any[]) {
              const entry = { node: this, ended: false, cancellations: 0 };
              if (
                kind === 'notes' ||
                ((this as OscillatorNode).frequency.value > 20 &&
                  (this as OscillatorNode).frequency.value < 400)
              ) {
                probe[kind].push(entry);
                this.addEventListener('ended', () => (entry.ended = true));
              }
              return start.apply(this as any, args as any);
            };
            prototype.stop = function (at?: number) {
              const entry = probe[kind].find((e) => e.node === this);
              if (entry && (at === undefined || at <= this.context.currentTime + 0.001))
                entry.cancellations++;
              return stop.call(this as any, at);
            };
          }
        },
        {
          ...DEFAULT_SPEC,
          pattern,
          low: 60,
          high: 72,
          bpm: 60,
          countIn: 0,
          startingChords: false,
          noteBeats: 4,
          gate: 1,
          repetitions: 1,
          drone: false,
        }
      );
      await page.goto(base);
      await waitForApp(page, '#play:enabled');
      const choice = await page
        .locator(pattern === 'maqamat' ? '#scale-tuning' : '#yemenite-family')
        .boundingBox();
      const checkbox = await page.locator('label[for=tonic-drone]').boundingBox();
      const mixer = await page
        .getByRole('slider', { name: 'Drone strength', exact: true })
        .boundingBox();
      assert.ok(choice && checkbox && mixer);
      assert.ok(checkbox.y >= choice.y + choice.height, 'Drone occupies its own row');
      assert.ok(mixer.x > checkbox.x + checkbox.width, 'Mixer follows the drone option');

      await page.locator('#play').click();
      await page.getByRole('button', { name: 'Pause', exact: true }).waitFor();
      await page.waitForFunction(() => (window as any).droneProbe.notes.some((n: any) => !n.ended));
      const held = await page.evaluate(() => {
        const p = (window as any).droneProbe;
        const index = p.notes.findIndex((n: any) => !n.ended);
        return { index, cancellations: p.notes[index].cancellations };
      });
      for (const enabled of [true, false, true]) {
        const before = await page.locator('#elapsed').getAttribute('data-seconds');
        await page.locator('#tonic-drone').setChecked(enabled);
        assert.equal(
          await page.locator('#play').textContent(),
          'Pause',
          'Drone toggles keep playback running'
        );
        assert(
          Number(await page.locator('#elapsed').getAttribute('data-seconds')) >= Number(before),
          'The playhead never resets'
        );
        assert.equal(
          await page.evaluate((h) => {
            const n = (window as any).droneProbe.notes[h.index];
            return !n.ended && n.cancellations === h.cancellations;
          }, held),
          true,
          'The same sounding piano source continues'
        );
        if (enabled)
          await page.waitForFunction(() =>
            (window as any).droneProbe.drones.some((n: any) => !n.ended && !n.cancellations)
          );
        else
          assert.equal(
            await page.evaluate(() =>
              (window as any).droneProbe.drones.some((n: any) => !n.ended && !n.cancellations)
            ),
            false,
            'Switching off stops all active and queued drones'
          );
      }
      const slider = page.locator('#drone-strength [role="slider"]');
      assert.equal(await slider.getAttribute('aria-valuenow'), '50');
      const droneIndex = await page.evaluate(() =>
        (window as any).droneProbe.drones.findIndex((n: any) => !n.ended && !n.cancellations)
      );
      for (const key of ['End', 'Home', 'End']) {
        await slider.press(key);
        const value = key === 'Home' ? 0 : 100;
        await page.waitForFunction(
          ({ index, value }) => {
            const node = (window as any).droneProbe.drones[index].node;
            const edges = (window as any).droneEdges;
            return Math.abs(edges.get(edges.get(node)).gain.value - value / 100) < 0.001;
          },
          { index: droneIndex, value }
        );
        assert.equal(await page.locator('#play').textContent(), 'Pause');
        assert.equal(
          await page.evaluate((index) => {
            const n = (window as any).droneProbe.drones[index];
            return !n.ended && !n.cancellations;
          }, droneIndex),
          true,
          'Strength changes retain the same drone source'
        );
        assert.equal(
          await page.evaluate((h) => (window as any).droneProbe.notes[h.index].cancellations, held),
          held.cancellations
        );
      }
      await page.locator('#play').click();
      const paused = await page.locator('#elapsed').getAttribute('data-seconds');
      await page.locator('#tonic-drone').uncheck();
      assert.equal(await page.locator('#play').textContent(), 'Resume');
      assert.equal(await page.locator('#elapsed').getAttribute('data-seconds'), paused);
      await page.reload();
      await waitForApp(page, '#play:enabled');
      assert.equal(
        await page.locator('#tonic-drone').isChecked(),
        false,
        'Drone preference survives reload'
      );
      assert.equal(
        await page.locator('#drone-strength [role=slider]').getAttribute('aria-valuenow'),
        '100'
      );
      if (width === 390) {
        // Same mobile DOM and four-column pads; only CSS short-screen rules change.
        await page.setViewportSize({ width: 320, height: 568 });
        const fit = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          viewport: innerHeight,
          emptyNoticePadding: getComputedStyle(document.querySelector('.practice-notice')!).paddingBlock,
          pads: [...document.querySelectorAll('.note-pad')].map(pad => {
            const box=pad.getBoundingClientRect();return {width:box.width,height:box.height,bottom:box.bottom};
          }),
        }));
        assert.equal(fit.emptyNoticePadding, '0px', 'An empty notice reserves no extra padding');
        assert(fit.height <= fit.viewport + 1, `${pattern}: the smallest phone fits without scrolling`);
        assert(fit.pads.every(pad=>pad.width>=44 && pad.height>=44 && pad.bottom<=fit.viewport), 'Readable finger targets remain visible');
      }
      assert.deepEqual(errors, []);
      await page.close();
      console.log(
        `PASS live tonic drone ${pattern} ${width}px: continuous source, playhead, on/off audio, paused state and persistence`
      );
    }
}
