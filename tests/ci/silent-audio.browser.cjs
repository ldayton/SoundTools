const assert = require('node:assert/strict');
const http = require('node:http');
const { launchBrowser, createContext, closeBrowser, captureFailure } = require('../../scripts/ci/browser-harness.cjs');
(async () => {
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<button>Enable audio</button>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    // CI checks both engines; Nightly already has one required job per engine.
    for (const engine of process.env.CI_TIER === 'ci' ? ['chromium', 'webkit'] : [process.env.TEST_BROWSER || 'chromium']) {
      process.env.TEST_BROWSER = engine;
      const browser = await launchBrowser();
      try {
        const context = await createContext(browser);
        await context.addInitScript(() => {
          window.policyGains = [];
          const create = AudioContext.prototype.createGain;
          AudioContext.prototype.createGain = function () {
            const gain = create.call(this); window.policyGains.push(gain); return gain;
          };
        });
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.locator('button').click();
        const result = await page.evaluate(async () => {
          const context = new AudioContext(), source = context.createConstantSource(), analyser = context.createAnalyser();
          try {
            source.offset.value = 0.75; source.connect(analyser); analyser.connect(context.destination); source.start(); await context.resume();
            const samples = new Float32Array(analyser.fftSize);
            const deadline = performance.now() + 5000;
            let peak = 0;
            while (peak < 0.5 && performance.now() < deadline) {
              analyser.getFloatTimeDomainData(samples); peak = Math.max(...samples);
              if (peak < 0.5) await new Promise(resolve => setTimeout(resolve, 10));
            }
            const offline = new OfflineAudioContext(1, 128, 44100), tone = offline.createConstantSource();
            tone.offset.value = 0.75; tone.connect(offline.destination); tone.start();
            const rendered = await offline.startRendering();
            analyser.disconnect(context.destination);
            return { peak, gains: window.policyGains.map(gain => gain.gain.value), offline: rendered.getChannelData(0)[64], progressed: context.currentTime > 0 };
          } finally { source.stop(); await context.close(); }
        });
        assert(result.peak > 0.5, 'Muting must preserve real upstream PCM');
        assert(result.progressed, 'The live audio graph must keep processing');
        assert.deepEqual(result.gains, [0], 'Only the hardware-output sink is silent');
        assert.equal(result.offline, 0.75, 'Offline numerical renders must remain unchanged');
        console.log(`PASS ${engine}: silent hardware sink, live PCM and offline rendering`);
      } catch (error) { await captureFailure(browser, error); throw error; }
      finally { await closeBrowser(browser); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
