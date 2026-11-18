import assert from 'node:assert/strict';
import { launchBrowser, newPage, captureFailure, closeBrowser } from '../../../scripts/ci/browser-harness.cjs';
import { partition } from '../../../scripts/ci/shard.cjs';
import { preview } from '../../../packages/music-practice/browser-tests/server';
import hymns from '../../../packages/music-practice/src/hymns.json';

const server = await preview('songalong', Number(process.env.TEST_PORT || 4492));
const browser = await launchBrowser();
const cases = partition([2048, 1100, 390, 320].flatMap(width => ['melody', 'original'].flatMap(arrangement => hymns.map(hymn => ({ width, arrangement, hymn })))));
try {
  const page = await newPage(browser, { viewport: { width: 1680, height: 1050 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [index, { width, arrangement, hymn }] of cases.entries()) {
    console.log(`Catalog ${index + 1}/${cases.length}: ${hymn.id}, ${arrangement}, ${width}px`);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${server.base}/piano/hymns/${hymn.id}?arrangement=${arrangement}&mode=wait`);
    await page.locator('.sequence-title').filter({ hasText: hymn.title }).waitFor();
    await page.locator('.hymn-paper .abcjs-lyric').first().waitFor();
    assert.match((await page.locator('.hymn-count').textContent())!, /^1 \/ [1-9]\d*$/);
    assert.ok(await page.locator('.sight-current').count(), hymn.title);
    assert.equal(await page.locator('.sequence-score').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, hymn.title);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, hymn.title);
    assert.equal(await page.locator('.sequence-feedback.error').count(), 0);
    if (hymn.id === 'praise-god-from-whom-all-blessings-flow') {
      const collisions = await page.locator('.abcjs-lyric').evaluateAll(elements => {
        const words = elements.filter(e => e.textContent?.trim()).map(e => ({ text: e.textContent!, box: e.getBoundingClientRect() }));
        return words.slice(1).flatMap((current, i) => Math.abs(words[i].box.y - current.box.y) < 2 && current.box.x - words[i].box.right < 4 ? [`${words[i].text} / ${current.text}`] : []);
      });
      assert.deepEqual(collisions, [], `Lyric spacing at ${width}px, ${arrangement}`);
    }
    assert.deepEqual(errors, []);
  }
  console.log(`PASS ${cases.length} catalog cases (${process.env.TEST_SHARD || 'all'})`);
} catch (error) { await captureFailure(browser, error); throw error; }
finally { await closeBrowser(browser); server.stop(); }
