import {standardEditionBrowser} from "../../../packages/music-practice/test-fixtures/song-edition.browser";
import {expect} from "@playwright/test";
import {waitForApp} from "../../../scripts/ci/browser-harness.cjs";
import {dismissPracticeDrawer} from "../../../packages/music-practice/browser-tests/helpers";
await standardEditionBrowser("the-old-rugged-cross",4636,[1,2,3,4],async(page,base,width)=>{
 if(width!==1440&&width!==390)return;
 for(const arrangement of ["piano","guitar-vocal"])for(const stanza of [1,2,3,4]){
  await page.goto(`${base}/piano/hymns/the-old-rugged-cross?arrangement=${arrangement}&mode=wait&hands=right&view=right&stanzas=${stanza}&octave=0`);
  await waitForApp(page,".hymn-pause");
  // Phones use playback with both parts: the held refrain melody has three
  // additional accompaniment onsets. Desktop right-hand practice grades lead only.
  await expect(page.locator(".hymn-count")).toHaveText(`1 / ${width===390?(stanza===3?79:80):(stanza===3?76:77)}`);
 }
 await page.goto(`${base}/piano/hymns/the-old-rugged-cross?arrangement=original&mode=playback&stanzas=1,2,3,4`);
 await waitForApp(page,".hymn-pause");await dismissPracticeDrawer(page);
 await page.locator(".piano-chord-trigger").filter({hasText:/C[♯#]dim7\/B[♭b]/}).first().click();
 const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
 await expect(dialog.locator(".piano-chord-notes")).toHaveText("B♭3 · C♯4 · E4 · G4");
 await expect(dialog.getByRole("button",{name:/Play .* chord and breakdown/})).toBeEnabled();
 await dialog.getByRole("button",{name:"Close chord diagram",exact:true}).click();await expect(dialog).toBeHidden();
});
