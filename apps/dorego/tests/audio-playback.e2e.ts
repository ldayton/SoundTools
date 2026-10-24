import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { DEFAULT_SPEC } from '../src/music';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const probe = {
      context: null as AudioContext | null,
      created: 0,
      active: 0,
      peak: 0,
      late: 0,
      hint: '',
      durations: [] as number[],
      taps: [] as AudioNode[],
    };
    (window as any).audioProbe = probe;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (this: AudioNode, destination: any, ...args: any[]) {
      if (destination instanceof AudioDestinationNode) probe.taps.push(this);
      return (connect as any).call(this, destination, ...args);
    } as typeof connect;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        probe.context = this;
        probe.hint = String(options?.latencyHint);
        const create = this.createBufferSource.bind(this);
        this.createBufferSource = () => {
          const source = create();
          probe.created++;
          probe.active++;
          probe.peak = Math.max(probe.peak, probe.active);
          source.addEventListener('ended', () => probe.active--);
          const start = source.start.bind(source);
          source.start = (...args: [number?, number?, number?]) => {
            if (args[0] && args[0] < this.currentTime) probe.late++;
            if (source.buffer) probe.durations.push(source.buffer.duration);
            return start(...args);
          };
          return source;
        };
      }
    };
  });
  await page.goto('http://127.0.0.1:4317');
  await page.evaluate(
    (spec) => {
      localStorage.setItem('dorego.current', JSON.stringify(spec));
      localStorage.setItem('dorego.bitklavierVersion', '1');
    },
    {
      ...DEFAULT_SPEC,
      voice: 'bitklavier',
      low: 48,
      high: 84,
      bpm: 240,
      countIn: 0,
      repetitions: 1,
      metronome: true,
      volume: 0,
    }
  );
  await page.reload();
  await page.locator('#play').click();
  await page.waitForFunction(() => (window as any).audioProbe.created > 3);
  // Tap the actual live output on the audio thread. This continues through a UI stall.
  await page.evaluate(async () => {
    const probe = (window as any).audioProbe;
    const context: AudioContext = probe.context;
    const source = `class Meter extends AudioWorkletProcessor {
      process(inputs) {
        let peak=0, clipped=0, energy=0, count=0;
        for(const channel of inputs[0] || []) for(const sample of channel) {
          peak=Math.max(peak,Math.abs(sample));if(Math.abs(sample)>=0.999)clipped++;
          energy+=sample*sample;count++;
        }
        this.port.postMessage({peak,clipped,energy,count});return true;
      }
    } registerProcessor('dorego-test-meter',Meter);`;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const meter = new AudioWorkletNode(context, 'dorego-test-meter');
    probe.meter = meter;
    probe.audio = { peak: 0, clipped: 0, energy: 0, count: 0 };
    meter.port.onmessage = ({ data }) => {
      probe.audio.peak = Math.max(probe.audio.peak, data.peak);
      probe.audio.clipped += data.clipped;
      probe.audio.energy += data.energy;
      probe.audio.count += data.count;
    };
    for (const tap of probe.taps) if (tap.context === context) tap.connect(meter);
    // Worklet output is silence, so the monitoring path does not double the sound.
    meter.connect(context.destination);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const end = performance.now() + 400;
    while (performance.now() < end) {}
  });
  await page.waitForTimeout(1500);
  const result = await page.evaluate(() => {
    const p = (window as any).audioProbe;
    return {
      hint: p.hint,
      created: p.created,
      peakSources: p.peak,
      late: p.late,
      maxSampleSeconds: Math.max(...p.durations),
      audio: p.audio,
      baseLatency: p.context.baseLatency,
      sampleRate: p.context.sampleRate,
    };
  });
  assert.equal(result.hint, 'playback');
  assert.ok(result.peakSources < 40, JSON.stringify(result));
  assert.equal(result.late, 0);
  assert.ok(
    result.maxSampleSeconds <= 6,
    'Live notes retain enough audio for 60 BPM, without retaining 30-second tails'
  );
  assert.ok(result.audio.peak > 0.01);
  assert.equal(result.audio.clipped, 0);
  const loudRms = Math.sqrt(result.audio.energy / result.audio.count);
  await page.locator('#volume').fill('-24');
  assert.equal(await page.locator('#play').innerText(), 'Pause');
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const a = (window as any).audioProbe.audio;
    a.energy = 0;
    a.count = 0;
  });
  await page.waitForTimeout(300);
  const quietRms = await page.evaluate(() => {
    const a = (window as any).audioProbe.audio;
    return Math.sqrt(a.energy / a.count);
  });
  assert.ok(
    quietRms > 0 && quietRms < loudRms * 0.3,
    `Live volume did not attenuate audio: ${loudRms} -> ${quietRms}`
  );
  assert.equal(await page.locator('#metronome').count(), 0);
  await page.locator('#play').click();
  await page.waitForTimeout(300);
  const silenceStart = await page.evaluate(() => {
    const audio = (window as any).audioProbe.audio;
    audio.energy = 0;
    audio.count = 0;
    return true;
  });
  await page.waitForTimeout(300);
  assert.ok(silenceStart);
  const stopped = await page.evaluate(() => {
    const p = (window as any).audioProbe;
    return { active: p.active, rms: Math.sqrt(p.audio.energy / Math.max(1, p.audio.count)) };
  });
  assert.ok(stopped.active <= 2, JSON.stringify(stopped));
  assert.ok(stopped.rms < 0.00001, JSON.stringify(stopped));
  assert.deepEqual(errors, []);
  console.log(
    'PASS: bounded live sources, playback buffering, 400ms UI stall, full-volume stereo output without clipping, live volume attenuation without restarting, and silent cleanup.'
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
