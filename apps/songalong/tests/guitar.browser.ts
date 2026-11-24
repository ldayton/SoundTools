import {practiceHymn,selectSingleCapoPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import { selectHymnInstrument } from '../../../packages/music-practice/browser-tests/helpers';
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  openPracticeOptions,
  dismissPracticeDrawer,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4574),
  browser = await launchBrowser();
try {
  const singleCapo=await selectSingleCapoPracticeHymn();
  for (const width of [1440, 393]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const legacy of ["guitar", "guitar-chords"]) {
      await page.goto(
        server.base +
          `/piano/hymns/ill-fly-away?arrangement=${legacy}&key=D&display=both&mode=playback`,
      );
      await page.locator(".abcjs-tabNumber").first().waitFor();
      await openPracticeOptions(page);
      await expect(page.getByRole('radio', { name: 'Guitar', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator("#hymn-key")).toHaveValue(/D major/);
      await expect(page.locator(".hymn-score-setup")).toHaveText("Capo 2 · Sounding key: D major");
      if(width===1440){
        await expect(page.locator("#hymn-capo")).toHaveValue("2");
        await practiceOption(page,"#hymn-capo","0");
        await expect(page.locator(".hymn-score-setup")).toHaveText("No capo · Sounding key: D major");
        await expect(page.locator("#hymn-key")).toHaveValue(/D major/);
        await practiceOption(page,"#hymn-capo","2");
      }
      assert(
        (await page.locator(".abcjs-chord").allTextContents()).includes("G7"),
      );
      assert(
        !(await page.locator(".abcjs-chord").allTextContents()).includes("A7"),
      );
      await page.locator("#hymn-score-display").selectOption("chords");
      await expect(page.locator(".hymn-strum-pattern")).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Instrument', exact: true }).getByRole('radio')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Voice', exact: true })).toBeEnabled();
      await selectHymnInstrument(page, 'piano');
      await expect(page.locator(".abcjs-tabNumber")).toHaveCount(0);
      await selectHymnInstrument(page, 'guitar');
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
      await page.reload();
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-score-display")).toHaveValue("chords");
      await dismissPracticeDrawer(page);
    }
    // Shared four-score control contract, independent of a named edition.
    await page.goto(`${server.base}/piano/hymns/${practiceHymn.slug}?arrangement=piano&mode=playback`);
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();await dismissPracticeDrawer(page);
    const voice=page.getByRole("button",{name:"Voice",exact:true}),guitar=page.getByRole("radio",{name:"Guitar",exact:true}),piano=page.getByRole("radio",{name:"Piano",exact:true});
    await voice.click();await expect(piano).toHaveAttribute("data-arrangement","original");
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await expect(voice).toHaveAttribute("aria-pressed","true");await expect(piano).toHaveAttribute("aria-checked","false");
    await expect(page.locator(".hymn-paper svg").first().locator(".abcjs-clef")).toHaveCount(2);
    await openPracticeOptions(page);
    await expect(page.getByRole("checkbox",{name:"Show Voice",exact:true})).toBeChecked();
    await expect(page.getByRole("checkbox",{name:"Show Guitar",exact:true})).toBeChecked();
    await expect(page.locator("#hymn-octave-down")).toBeEnabled();
    const capoBefore=await page.locator(".hymn-score-setup").textContent();
    await page.locator("#hymn-octave-down").click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("-1");
    await expect(page.locator(".hymn-score-setup")).toHaveText(capoBefore!);
    await expect(page.locator(".hymn-paper svg").first()).toBeVisible();
    await page.locator("#hymn-octave-up").click();
    await expect.poll(()=>new URL(page.url()).searchParams.get("octave")).toBe("0");
    await dismissPracticeDrawer(page);
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await page.reload();await expect(guitar).toHaveAttribute("data-arrangement","guitar-vocal");
    await expect(voice).toHaveAttribute("aria-pressed","true");
    await piano.click();await expect(piano).toHaveAttribute("data-arrangement","original");
    await voice.click();await expect(piano).toHaveAttribute("data-arrangement","piano");
    await guitar.click();await expect(guitar).toHaveAttribute("data-arrangement","guitar-edition");
    for(const arrangement of ["guitar-edition","guitar-vocal"]){
      await page.goto(`${server.base}/piano/hymns/${singleCapo.hymn.slug}?arrangement=${arrangement}&mode=playback&key=original&octave=0`);
      await openPracticeOptions(page);
      await expect(page.locator("#hymn-capo")).toHaveCount(0);
      await dismissPracticeDrawer(page);
      await expect(page.locator(".hymn-score-setup")).toHaveText(`Capo ${singleCapo.capo} · Sounding key: ${singleCapo.hymn.key} major`);
      await expect(page.locator(".abcjs-note").first()).toBeVisible();
    }
    assert.deepEqual(errors, []);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.close();
    console.log(
      `PASS Guitar legacy-link migration and independent display ${width}px`,
    );
  }
} catch (e) {
  await captureFailure(browser, e);
  throw e;
} finally {
  await closeBrowser(browser);
  server.stop();
}
