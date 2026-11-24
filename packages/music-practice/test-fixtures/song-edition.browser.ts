import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {mkdir} from "node:fs/promises";
import type {Page} from "playwright";
import {launchBrowser,newPage,closeBrowser,captureFailure} from "../../../scripts/ci/browser-harness.cjs";
import {preview} from "../browser-tests/server";
import {openPracticeOptions,openHymnControls,dismissPracticeDrawer} from "../browser-tests/helpers";

export async function checkVocalEdition(page:Page, base:string, slug:string) {
  await page.goto(`${base}/piano/hymns/${slug}?arrangement=original&mode=playback`);
  await expect(page.getByRole("radio",{name:"Voice + Piano",exact:true})).toBeChecked();
  await expect(page.locator(".abcjs-note").first()).toBeVisible();
  await openPracticeOptions(page);
  await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
  await expect(page.getByRole("checkbox",{name:"Show Voice",exact:true})).toBeChecked();
  const play=page.getByRole("checkbox",{name:"Play Voice",exact:true});
  await expect(play).toBeChecked();await play.uncheck();await expect(play).not.toBeChecked();
  await play.check();
  const show=page.getByRole("checkbox",{name:"Show Voice",exact:true});
  await show.uncheck();await expect(play).toBeChecked();await show.check();
  await dismissPracticeDrawer(page);
  const chord=page.locator(".piano-chord-trigger").first();
  await expect(chord).toBeVisible();await chord.click();
  const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();
  await expect(dialog.locator(".piano-chord-notes")).toContainText(/[A-G].*\d.* · /);
  await expect(dialog.getByRole("button",{name:/Play .* chord and breakdown/})).toBeEnabled();
  await dialog.getByRole("button",{name:"Close chord diagram"}).click();await expect(dialog).toBeHidden();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No horizontal page overflow");
}
export async function standardEditionBrowser(slug:string,port:number) {
  const server=await preview("songalong",port),browser=await launchBrowser();
  try {
    for(const width of [1440,768,390,320]){
      const page=await newPage(browser,{viewport:{width,height:1000}}), errors:string[]=[];
      page.on("pageerror",e=>errors.push(e.message));
      for(const [instrument,arrangement]of [["Piano","piano"],["Guitar","guitar-edition"]]){
        await page.goto(`${server.base}/piano/hymns/${slug}?arrangement=${arrangement}&mode=playback&stanzas=1,2,3`);
        await expect(page.getByRole("radio",{name:instrument,exact:true})).toBeChecked();
        await expect(page.locator(".abcjs-note").first()).toBeVisible();
        await openHymnControls(page);
        await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
        await page.getByRole("checkbox",{name:"Show fingerings",exact:true}).check();
        await expect(page.locator(".beginner-fingering").first()).toBeVisible();
        if(instrument==="Guitar")await expect(page.locator(".abcjs-tabNumber").first()).toBeVisible();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        const clipped=await page.locator(".hymn-paper svg").evaluateAll(svgs=>svgs.flatMap(svg=>{
          const root=(svg as SVGSVGElement).getScreenCTM()!.inverse(),v=(svg as SVGSVGElement).viewBox.baseVal;
          return [...svg.querySelectorAll<SVGGraphicsElement>(".abcjs-lyric,.abcjs-tabNumber,.beginner-fingering")].filter(n=>getComputedStyle(n).visibility!=="hidden").flatMap(n=>{
            const b=n.getBBox();if(!b.width&&!b.height)return [];const t=root.multiply(n.getScreenCTM()!),a=new DOMPoint(b.x,b.y).matrixTransform(t),z=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(t);
            return a.x<v.x-1||z.x>v.x+v.width+1||a.y<v.y-1||z.y>v.y+v.height+1?[n.textContent]:[];
          });
        }));assert.deepEqual(clipped,[]);
        if(width===1440||width===390){await mkdir("work/song-support/screenshots",{recursive:true});await page.screenshot({path:`work/song-support/screenshots/${slug}-${arrangement}-${width}.png`});}
      }
      await checkVocalEdition(page,server.base,slug);
      if(width===1440||width===390)await page.screenshot({path:`work/song-support/screenshots/${slug}-voice-${width}.png`});
      assert.deepEqual(errors,[]);await page.close();console.log(`PASS ${slug}: Piano, Guitar, Voice + Piano ${width}px`);
    }
  }catch(error){await captureFailure(browser,error);throw error;}finally{await closeBrowser(browser);server.stop();}
}
