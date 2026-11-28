import assert from "node:assert/strict";
import {expect} from "@playwright/test";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdir} from "node:fs/promises";
import {launchBrowser,newPage,waitForApp,waitForServer,captureFailure,closeBrowser} from "../../../scripts/ci/browser-harness.cjs";
import {preview} from "../../../packages/music-practice/browser-tests/server";
const server=await preview("tagaluya",4760),browser=await launchBrowser();
let dev:ReturnType<typeof spawn>|undefined;
try {
  const page=await newPage(browser,{viewport:{width:1440,height:1000},hasTouch:true});
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(server.base);await waitForApp(page,".tagaluya-reader");
  await expect(page.locator("#song-title")).toHaveText("O Kay Saya at Kay Ganda");
  await expect(page.locator(".original-line")).toHaveCount(4);await expect(page.locator(".translated-line")).toHaveCount(4);
  await expect(page.getByRole("link",{name:"He Is Lord",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"He Is Lord",exact:true}).click();await expect(page.locator("#song-title")).toHaveText("He Is Lord");
  await expect(page.getByText("He is God, He is God",{exact:true})).toBeVisible();
  await page.locator("#reading-size").fill("28");await page.locator("#reading-size").press("Enter");
  await expect.poll(()=>page.locator(".original-line").first().evaluate(el=>getComputedStyle(el).fontSize)).toBe("28px");
  await page.reload();await waitForApp(page,".tagaluya-reader");await expect(page.locator("#reading-size")).toHaveValue("28 px");
  await expect(page.getByRole("radio",{name:"Melody",exact:true})).toBeDisabled();
  const swipe=async(dx:number,dy:number,cancel=false)=>{
    await page.locator(".tagaluya-reader").evaluate((el,{dx,dy,cancel})=>{
      const start={clientX:220,clientY:350},end={clientX:220+dx,clientY:350+dy};
      for(const[type,touches,changedTouches]of [["touchstart",[start],[]],[cancel?"touchcancel":"touchmove",[end],[end]],["touchend",[],[end]]] as const){
        const e=new Event(type,{bubbles:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changedTouches}});el.dispatchEvent(e);
      }
    },{dx,dy,cancel});
  };
  for(const width of [393,320]){
    await page.setViewportSize({width,height:852});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect.poll(()=>page.getByRole("banner").evaluate(el=>el.getBoundingClientRect().height)).toBe(56);
    const toolbarHeights=await page.locator(".tagaluya-toolbar").evaluate(el=>[el.querySelector(".tagaluya-text-size")!.getBoundingClientRect().height,el.querySelector(".mantine-SegmentedControl-root")!.getBoundingClientRect().height]);
    assert.deepEqual(toolbarHeights,[40,40],"Mobile controls share one height");
    await page.getByRole("button",{name:"Text size, 28 pixels",exact:true}).click();
    await expect(page.getByRole("button",{name:"Increase text size",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Text size, 28 pixels",exact:true}).click();
    await expect(page.locator("#reading-size")).toBeHidden();
    await page.getByRole("button",{name:"Open navigation",exact:true}).click();
    const brand=page.getByRole("link",{name:"Tagaluya home",exact:true});
    const settingsLink=page.getByRole("link",{name:"Settings",exact:true});
    await expect(brand).toHaveCount(1);
    await expect(settingsLink).toBeVisible();
    assert.equal((await brand.boundingBox())!.x,(await settingsLink.boundingBox())!.x,"Settings is a top-level row aligned with the brand");
    await settingsLink.click();
    await expect(page.getByRole("button",{name:"Close navigation",exact:true})).toBeHidden();
    await expect(page.getByRole("heading",{name:"Settings",exact:true})).toBeVisible();
    const note=page.locator(".tagaluya-settings-note");
    await expect(note).toBeVisible();
    const noteBox=(await note.boundingBox())!;
    assert(noteBox.x>=16&&noteBox.x+noteBox.width<=width-16,`Settings uses standard shell gutters: ${JSON.stringify(noteBox)}, viewport ${width}`);
    await page.getByRole("button",{name:"Open navigation",exact:true}).click();
    await page.getByRole("link",{name:"November 28, 2026 Evening service",exact:true}).click();
    await expect(page.locator("#song-title")).toHaveText("O Kay Saya at Kay Ganda");
    await page.getByRole("button",{name:"Expand songs",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Songs",exact:true})).toBeVisible();
    await page.getByRole("link",{name:"He Is Lord",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Songs",exact:true})).toBeHidden();
    await swipe(8,100);await expect(page.locator("#song-title")).toHaveText("He Is Lord");
    await swipe(-80,70);await expect(page.locator("#song-title")).toHaveText("He Is Lord");
    await swipe(-80,0,true);await expect(page.locator("#song-title")).toHaveText("He Is Lord");
    await swipe(-80,0);await expect(page.locator("#song-title")).toHaveText("You, You Are God");
    await swipe(80,0);await expect(page.locator("#song-title")).toHaveText("He Is Lord");
  }
  await mkdir("work/tagaluya",{recursive:true});await page.screenshot({path:"work/tagaluya/mobile-interlinear.png",fullPage:true});
  // Test the same reader and shared notation adapter with a capability fixture,
  // never a fabricated tune attached to a real service song.
  const vite=createRequire(import.meta.url).resolve("vite/package.json").replace(/package.json$/,"bin/vite.js");
  dev=spawn(process.execPath,[vite,"--host","127.0.0.1","--port","4761","--strictPort"],{cwd:new URL("../",import.meta.url),stdio:"ignore"});
  await waitForServer("http://127.0.0.1:4761",{server:dev});
  await page.goto("http://127.0.0.1:4761/tests/reader.html");await waitForApp(page,".tagaluya-reader");
  await page.getByText("Score",{exact:true}).click();
  await expect(page.getByRole("radio",{name:"Score",exact:true})).toBeChecked();
  await expect(page.locator(".bilingual-melody svg").first()).toBeVisible();
  await expect(page.locator(".abcjs-clef")).toHaveCount(1);
  await expect(page.getByText("First line",{exact:true})).toBeVisible();
  await expect(page.getByText("Second line",{exact:true})).toBeVisible();
  await page.screenshot({path:"work/tagaluya/mobile-melody-fixture.png",fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("PASS Tagaluya: program, bilingual text, size/reload, sidebars, swipes, phone layout and shared melody signatures");
} catch(error){await captureFailure(browser,error);throw error;}
finally {dev?.kill();await closeBrowser(browser);server.stop();}
