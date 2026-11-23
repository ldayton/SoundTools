import assert from 'node:assert/strict';
import { launchBrowser, newPage, captureFailure, closeBrowser } from '../../../scripts/ci/browser-harness.cjs';
import { partition } from '../../../scripts/ci/shard.cjs';
import { preview } from '../../../packages/music-practice/browser-tests/server';
import { hymnAvailableArrangements } from '../../../packages/music-practice/src/hymn-instruments';
import { waitForApp } from '../../../scripts/ci/browser-harness.cjs';
import hymns from '../../../packages/music-practice/src/hymns.json';

const server = await preview('songalong', Number(process.env.TEST_PORT || 4492));
const browser = await launchBrowser();
const cases = partition([2048, 1100, 390, 320].flatMap(width => hymns.flatMap(hymn => hymnAvailableArrangements(hymn).map(arrangement => ({width, arrangement:arrangement.id, hymn})))));
try {
  const page = await newPage(browser, { viewport: { width: 1680, height: 1050 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [index, { width, arrangement, hymn }] of cases.entries()) {
    console.log(`Catalog ${index + 1}/${cases.length}: ${hymn.id}, ${arrangement}, ${width}px`);
    await page.setViewportSize({ width, height: 1000 });
    const stanzas = width === 1100 || width === 320 ? hymn.stanzas.map(stanza=>stanza.number).join(',') : '1';
    await page.goto(`${server.base}/piano/hymns/${hymn.slug}?arrangement=${arrangement}&mode=wait&stanzas=${stanzas}`);
    await waitForApp(page);
    await page.locator('.sequence-title').filter({ hasText: hymn.title }).waitFor();
    if (arrangement !== 'bass' && hymn.stanzas.some(stanza => stanza.syllables.some(syllable => syllable !== '*')))
      await page.locator('.hymn-paper .abcjs-lyric').first().waitFor();
    else
      await page.locator('.hymn-paper .abcjs-note').first().waitFor();
    assert.match((await page.locator('.hymn-count').textContent())!, /^(?:Stanza 1\/\d+ · )?1 \/ [1-9]\d*$/);
    assert.ok(await page.locator('.sight-current').count(), hymn.title);
    assert.equal(await page.locator('.sequence-score').evaluate(e => e.scrollWidth <= e.clientWidth + 1), true, hymn.title);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, hymn.title);
    assert.equal(await page.locator('.sequence-feedback.error').count(), 0);
    if (hymn.slug === 'praise-god-from-whom-all-blessings-flow') {
      const collisions = await page.locator('.abcjs-lyric').evaluateAll(elements => {
        const words = elements.filter(e => e.textContent?.trim()).map(e => ({ text: e.textContent!, box: e.getBoundingClientRect() }));
        return words.slice(1).flatMap((current, i) => Math.abs(words[i].box.y - current.box.y) < 2 && current.box.x - words[i].box.right < 4 ? [`${words[i].text} / ${current.text}`] : []);
      });
      assert.deepEqual(collisions, [], `Lyric spacing at ${width}px, ${arrangement}`);
    }
    if (arrangement === 'guitar-edition' || arrangement === 'guitar-fingerstyle')
      assert.ok(await page.locator('[data-name=tabNumber]').count(), `${hymn.title}: reflow retains tablature`);
    const lyricOverlaps = await page.locator('.hymn-paper svg').evaluateAll(svgs => svgs.flatMap(svg => {
      const rows = new Map<number, DOMRect[]>();
      for(const lyric of svg.querySelectorAll('.abcjs-lyric')) {
        if(!lyric.textContent?.trim()) continue;
        const box=lyric.getBoundingClientRect(), key=Math.round(box.y);
        rows.set(key,[...(rows.get(key)||[]),box]);
      }
      return [...rows.values()].flatMap(row=>row.sort((a,b)=>a.x-b.x).slice(1).flatMap((box,index)=>
        row[index].right-box.left>1 ? [row[index].right-box.left] : []));
    }));
    assert.deepEqual(lyricOverlaps,[],`${hymn.title}: lyrics must not overlap after shared reflow at ${width}px (${arrangement})`);
    assert.deepEqual(errors, []);
  }
  console.log(`PASS ${cases.length} catalog cases (${process.env.TEST_SHARD || 'all'})`);
} catch (error) { await captureFailure(browser, error); throw error; }
finally { await closeBrowser(browser); server.stop(); }
