const { test: base, expect } = require('@playwright/test');
const { silenceAudioOutput } = require('../../../../scripts/ci/silent-audio.cjs');
const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(silenceAudioOutput);
    await use(context);
  },
});
module.exports = { test, expect };
