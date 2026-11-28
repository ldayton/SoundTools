import {playbackHymn,selectPracticeHymn} from "../../../packages/music-practice/test-fixtures/hymns";
import {expect} from "@playwright/test";
import {launchBrowser,newPage,closeBrowser,captureFailure} from "../../../scripts/ci/browser-harness.cjs";
import {preview} from "../../../packages/music-practice/browser-tests/server";
import {practiceOption,openHymnControls} from "../../../packages/music-practice/browser-tests/helpers";
const other=selectPracticeHymn(undefined,{exclude:playbackHymn.id});
const server=await preview("songalong",Number(process.env.TEST_PORT||4561)),browser=await launchBrowser();
try{
 const page=await newPage(browser,{viewport:{width:1440,height:1000},serviceWorkers:"block"}),errors:string[]=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.goto(server.base+`/piano/hymns/${playbackHymn.slug}?arrangement=piano`);await openHymnControls(page);
 const toggle=page.getByRole("checkbox",{name:"Show fingerings",exact:true});
 await expect(toggle).toBeEnabled();await expect(page.locator("#hymn-arrangement")).toHaveCount(0);
 await expect(page.locator(".practice-options").getByRole("checkbox",{name:"Show fingerings",exact:true})).toHaveCount(0);
 const geometry=()=>page.locator(".hymn-paper svg").evaluateAll(es=>es.map(e=>({height:e.getBoundingClientRect().height,viewBox:e.getAttribute("viewBox")?.split(/\s+/).map(n=>Math.round(Number(n)*1e6)/1e6)})));
 await toggle.uncheck();const initial=await geometry();await toggle.check();
 await expect(page.locator(".beginner-fingering").first()).toBeVisible();expect(await geometry()).toEqual(initial);
 await expect(page.locator('.beginner-fingering[data-voice="0"]').first()).toBeVisible();
 await expect(page.locator('.beginner-fingering[data-voice="1"]').first()).toBeVisible();
 await practiceOption(page,"#hymn-key","G");await expect(toggle).toBeEnabled();await expect(page.locator(".hymn-fingering").first()).toBeVisible();await expect(page.locator(".beginner-fingering")).toHaveCount(0);
 await practiceOption(page,"#hymn-key","original");await expect(toggle).toBeEnabled();await expect(page.locator(".beginner-fingering").first()).toBeVisible();
 for(const hand of ["right","left","both"]){await practiceOption(page,"#hymn-hands",hand);expect(await geometry()).toEqual(initial);}
 await page.reload();await openHymnControls(page);await expect(toggle).toBeChecked();await expect(page.locator(".beginner-fingering").first()).toBeVisible();
 await page.goto(server.base+`/piano/hymns/${other.slug}?arrangement=piano`);await openHymnControls(page);await expect(toggle).toBeChecked();
 await page.setViewportSize({width:390,height:844});await openHymnControls(page);await expect(toggle).toBeVisible();await toggle.uncheck();await expect(page.locator(".beginner-fingering")).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 console.log("PASS: dedicated Piano fingerings stay stable, support both hands, fingerings recalculated for changed keys and durable desktop/phone controls");
}catch(error){await captureFailure(browser,error);throw error;}finally{await closeBrowser(browser);server.stop();}
