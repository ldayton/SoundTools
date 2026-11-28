import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {launchBrowser,newPage,waitForApp,captureFailure,closeBrowser} from "../../../scripts/ci/browser-harness.cjs";
import {preview} from "../../../packages/music-practice/browser-tests/server";
const server=await preview("tagaluya",4762),browser=await launchBrowser();
try{
  const page=await newPage(browser,{viewport:{width:1440,height:1000},serviceWorkers:"allow"});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(server.base);await waitForApp(page,".tagaluya-reader");
  await page.getByRole("link",{name:"Salamat Panginoon",exact:true}).click();
  await page.getByRole("link",{name:"Settings",exact:true}).click();
  await expect(page.getByText("Available offline",{exact:true})).toBeVisible();
  await page.context().setOffline(true);
  await page.goto(server.base+"/services/2026-11-28/salamat-panginoon");await waitForApp(page,".tagaluya-reader");
  await expect(page.locator("#song-title")).toHaveText("Salamat Panginoon");
  await expect(page.getByText("You are good at every moment",{exact:true}).first()).toBeVisible();
  await page.reload();await waitForApp(page,".tagaluya-reader");await expect(page.locator("#song-title")).toHaveText("Salamat Panginoon");
  assert.deepEqual(errors,[]);console.log("PASS Tagalujah offline: verified shell, deep-linked service/song and translated lyrics after reload");
}catch(error){await captureFailure(browser,error);throw error;}finally{await closeBrowser(browser);server.stop();}
