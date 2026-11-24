import {standardEditionBrowser} from "../../../packages/music-practice/test-fixtures/song-edition.browser";
import {expect} from "@playwright/test";
import {waitForApp} from "../../../scripts/ci/browser-harness.cjs";
import {dismissPracticeDrawer} from "../../../packages/music-practice/browser-tests/helpers";

await standardEditionBrowser("fairest-lord-jesus",4635,[1,2,3,4],async(page,base,width)=>{
  if(width!==1440&&width!==390)return;
  for(const arrangement of ["original","guitar-vocal","piano","guitar-edition"]){
    for(const stanza of [1,4]){
      await page.goto(`${base}/piano/hymns/fairest-lord-jesus?arrangement=${arrangement}&mode=wait&hands=right&view=right&stanzas=${stanza}&octave=0&position=0`);
      await waitForApp(page,".hymn-pause");
      await expect(page.locator(".hymn-count")).toHaveText(`1 / ${stanza===4?41:42}`);
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
