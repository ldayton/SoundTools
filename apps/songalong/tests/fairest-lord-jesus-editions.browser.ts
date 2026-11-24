import {standardEditionBrowser} from "../../../packages/music-practice/test-fixtures/song-edition.browser";
import {expect} from "@playwright/test";
import {waitForApp} from "../../../scripts/ci/browser-harness.cjs";
import {dismissPracticeDrawer} from "../../../packages/music-practice/browser-tests/helpers";

await standardEditionBrowser("fairest-lord-jesus",4635,[1,2,3,4],async(page,base,width)=>{
  for(const arrangement of ["piano","guitar-edition"]){
    await page.goto(`${base}/piano/hymns/fairest-lord-jesus?arrangement=${arrangement}&mode=playback&stanzas=1,5,6,7,8,9`);
    await waitForApp(page,".hymn-pause");
    await expect(page.locator(".hymn-paper .abcjs-lyric").first()).toBeVisible();
    await expect(page.locator(".hymn-paper")).toContainText("מַה");
    await expect(page.locator(".hymn-paper")).toContainText("קֶ");
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow).toBe(false);
    const clipped=await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.flatMap(svg=>{
      const rect=svg.getBoundingClientRect();
      return [...svg.querySelectorAll(".abcjs-lyric")].flatMap(n=>{
        const b=n.getBoundingClientRect();
        return b.width && (b.left<rect.left-1||b.right>rect.right+1||b.bottom>rect.bottom+1)?[n.textContent]:[];
      });
    }));
    expect(clipped).toEqual([]);
    const collisions=await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.flatMap(svg=>{
      const syllables=[...svg.querySelectorAll(".abcjs-lyric tspan")].filter(n=>n.textContent?.trim()).map(n=>n.getBoundingClientRect());
      return [...svg.querySelectorAll(".hymn-lyric-extender rect")].flatMap(n=>{
        const a=n.getBoundingClientRect();
        return syllables.some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)?[n.parentElement?.getAttribute("data-syllable")]:[];
      });
    }));
    expect(collisions,"Melismas clear Hebrew letters and niqqud").toEqual([]);
    await page.screenshot({path:`work/song-support/screenshots/fairest-hebrew-${arrangement}-${width}.png`,fullPage:true});
  }
  if(width!==1440&&width!==390)return;
  for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"]){
    for(const stanza of [1,4,5,6,7,8,9]){
      await page.goto(`${base}/piano/hymns/fairest-lord-jesus?arrangement=${arrangement}&mode=wait&hands=right&view=right&stanzas=${stanza}&octave=0&position=0`);
      await waitForApp(page,".hymn-pause");
      await expect(page.locator(".hymn-count")).toHaveText(`1 / ${stanza>=4?41:42}`);
    }
  }
  // Seek to the last written note: observe a real stanza boundary without
  // waiting through the whole song. The new verse must redraw its held G.
  await page.goto(`${base}/piano/hymns/fairest-lord-jesus?arrangement=piano&mode=playback&stanzas=1,4&tempo=200&countIn=0&octave=0`);
  await waitForApp(page,".hymn-pause");
  await dismissPracticeDrawer(page);
  await page.locator(".hymn-paper .abcjs-note.abcjs-v0").last().click();
  await page.getByRole("button",{name:"Play",exact:true}).click();
  await expect(page.locator(".hymn-stanza-indicator")).toHaveText("Stanza 2/2");
  await page.getByRole("button",{name:"Pause",exact:true}).click();
  await expect(page.locator(".hymn-count")).toHaveText(/Stanza 2\/2 · .*\/ 41/);
});
