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
  await expect(page.locator(".original-line")).toHaveCount(18);await expect(page.locator(".translated-line")).toHaveCount(18);
  await expect(page.getByRole("link",{name:"He Is Lord",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"He Is Lord",exact:true}).click();await expect(page.locator("#song-title")).toHaveText("He Is Lord");
  await expect(page.getByText("He is God, He is God",{exact:true})).toBeVisible();
  await page.locator("#reading-size").fill("28");await page.locator("#reading-size").press("Enter");
  await expect.poll(()=>page.locator(".original-line").first().evaluate(el=>getComputedStyle(el).fontSize)).toBe("28px");
  await page.reload();await waitForApp(page,".tagaluya-reader");await expect(page.locator("#reading-size")).toHaveValue("28 px");
  await expect(page.getByRole("radio",{name:"Melody",exact:true})).toBeDisabled();
  const swipe=async(dx:number,dy:number,cancel=false)=>{
    const track=page.locator(".swipe-pager");
    if(browser.browserType().name()==="chromium"){
      const session=await page.context().newCDPSession(page);
      const point={x:220,y:350};
      await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
      for(let step=1;step<=6;step++)await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:point.x+dx*step/6,y:point.y+dy*step/6}]});
      await session.send("Input.dispatchTouchEvent",{type:cancel?"touchCancel":"touchEnd",touchPoints:[]});
      await session.detach();
    }else{
      // WebKit's automation has no native drag injection. Exercise browser
      // snap settlement here; Chromium above owns actual touch arbitration.
      if(cancel||Math.abs(dy)>Math.abs(dx))return;
      await track.evaluate((el,dx)=>el.scrollTo({left:el.scrollLeft-Math.sign(dx)*el.clientWidth,behavior:"instant"}),dx);
    }
  };
  for(const width of [393,320]){
    await page.setViewportSize({width,height:852});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect.poll(()=>page.getByRole("banner").evaluate(el=>el.getBoundingClientRect().height)).toBe(56);
    await expect(page.getByRole("button",{name:"Text size, 28 pixels",exact:true})).toBeVisible();
    const toolbarHeights=await page.locator(".tagaluya-toolbar").evaluate(el=>[el.querySelector(".tagaluya-text-size")!.getBoundingClientRect().height,el.querySelector(".mantine-SegmentedControl-root")!.getBoundingClientRect().height]);
    assert.deepEqual(toolbarHeights,[40,40],"Mobile controls share one height");
    await page.getByRole("button",{name:"Text size, 28 pixels",exact:true}).click();
    await expect(page.getByRole("button",{name:"Increase text size",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Text size, 28 pixels",exact:true}).click();
    await expect(page.locator("#reading-size")).toBeHidden();
    await page.getByRole("button",{name:"Open navigation",exact:true}).click();
    const brand=page.getByRole("link",{name:"Tagalujah home",exact:true});
    const settingsLink=page.getByRole("link",{name:"Settings",exact:true});
    await expect(brand).toHaveCount(1);
    await expect(settingsLink).toBeVisible();
    // Visibility alone includes the drawer's off-screen opening animation.
    await expect.poll(async()=>(await brand.boundingBox())!.x).toBe(16);
    assert.equal((await brand.boundingBox())!.x,(await settingsLink.boundingBox())!.x,"Settings is a top-level row aligned with the brand");
    await settingsLink.click();
    await expect(page.getByRole("button",{name:"Close navigation",exact:true})).toBeHidden();
    await expect(page.getByRole("heading",{name:"Settings",exact:true})).toBeVisible();
    await expect(page.getByText("Your service selection and reading preferences are saved on this device.",{exact:true})).toHaveCount(0);
    await page.getByRole("button",{name:"Open navigation",exact:true}).click();
    await page.getByRole("link",{name:"November 28, 2026 Evening service",exact:true}).click();
    await expect(page.locator("#song-title")).toHaveText("O Kay Saya at Kay Ganda");
    await page.getByRole("button",{name:"Expand songs",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Songs",exact:true})).toBeVisible();
    await page.getByRole("link",{name:"He Is Lord",exact:true}).click();
    await expect(page.getByRole("dialog",{name:"Songs",exact:true})).toBeHidden();
    const frame=async()=>page.evaluate(()=>{
      const main=document.getElementById("practice-content")!,header=document.querySelector("header")!;
      return {header:header.getBoundingClientRect().bottom,reader:document.querySelector(".tagaluya-reader:not(.tagaluya-reader-preview)")!.getBoundingClientRect().top,
        main:main.getBoundingClientRect().top,windowScroll:window.scrollY,scroll:document.querySelector<HTMLElement>(".swipe-pager-page:not([inert])")!.scrollTop,
        overscroll:getComputedStyle(main).overscrollBehaviorY};
    });
    await expect.poll(async()=>{const f=await frame();return f.reader-f.header;}).toBe(0);
    assert.equal((await frame()).overscroll,"none","Reader contains boundary pulls instead of revealing standalone chrome");
    await page.mouse.move(width/2,400);await page.mouse.wheel(0,400);
    await expect.poll(async()=>(await frame()).scroll).toBeGreaterThan(0);
    assert.equal((await frame()).windowScroll,0,"Vertical reading scroll stays inside the fixed shell");
    await swipe(8,100);await expect(page.locator("#song-title")).toHaveText("He Is Lord");


    await swipe(-180,0);await expect(page.locator("#song-title")).toHaveText("You, You Are God");
    await expect.poll(async()=>(await frame()).scroll).toBe(0);
    const afterSwipe=await frame();assert.equal(afterSwipe.reader,afterSwipe.header,"Swiping retains the toolbar position without a title strip or top gap");
    assert.equal(afterSwipe.windowScroll,0);
    await swipe(180,0);await expect(page.locator("#song-title")).toHaveText("He Is Lord");
  }
  await mkdir("work/tagaluya",{recursive:true});await page.screenshot({path:"work/tagaluya/mobile-interlinear.png",fullPage:true});
  // Test the same reader and shared notation adapter with a capability fixture,
  // never a fabricated tune attached to a real service song.
  const vite=createRequire(import.meta.url).resolve("vite/package.json").replace(/package.json$/,"bin/vite.js");
  dev=spawn(process.execPath,[vite,"--host","127.0.0.1","--port","4761","--strictPort"],{cwd:new URL("../",import.meta.url),stdio:"ignore"});
  await waitForServer("http://127.0.0.1:4761",{server:dev});
  await page.goto("http://127.0.0.1:4761/tests/reader.html");await waitForApp(page,".tagaluya-reader");
  // Shared pager contract: browser-owned dragging, cancellation, boundaries,
  // resize alignment and inactive-page accessibility, using generic fixtures.
  await expect(page.locator(".swipe-pager-page:not([inert])")).toHaveCount(1);
  if(browser.browserType().name()==="chromium"){
    const session=await page.context().newCDPSession(page);
    const drag=async(x:number)=>session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y:350}]});
    await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:220,y:350}]});
    await drag(140);await drag(90);
    await expect.poll(()=>page.locator(".swipe-pager").evaluate(el=>el.scrollLeft)).toBeGreaterThan(30);
    await expect(page.locator("#song-title")).toHaveText("Bilingual reading fixture");
    // Reverse before lifting: cancellation settles on the original page.
    await drag(180);await drag(220);
    await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    await expect.poll(()=>page.locator(".swipe-pager").evaluate(el=>el.scrollLeft)).toBe(0);
    await session.detach();
  }
  await swipe(-180,0);await expect(page.locator("#song-title")).toHaveText("Next reading fixture");
  await page.setViewportSize({width:393,height:852});
  await expect.poll(()=>page.locator(".swipe-pager").evaluate(el=>el.scrollLeft===el.clientWidth)).toBe(true);
  await swipe(-180,0);await expect(page.locator("#song-title")).toHaveText("Last reading fixture");
  await swipe(-180,0);
  await expect.poll(()=>page.locator(".swipe-pager").evaluate(el=>el.scrollLeft===2*el.clientWidth)).toBe(true);
  await expect(page.locator("#song-title")).toHaveText("Last reading fixture");
  await swipe(180,0);await expect(page.locator("#song-title")).toHaveText("Next reading fixture");
  await swipe(180,0);await expect(page.locator("#song-title")).toHaveText("Bilingual reading fixture");
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.getByRole("button",{name:"Open navigation",exact:true}).click();
  const drawer=page.getByRole("dialog",{name:"Tagalujah home",exact:true});
  await expect(drawer).toBeVisible();
  await expect.poll(()=>drawer.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe("0s");
  await page.getByRole("button",{name:"Close navigation",exact:true}).click();
  await expect(drawer).toBeHidden();
  await page.getByText("Score",{exact:true}).click();
  await expect(page.getByRole("radio",{name:"Score",exact:true})).toBeChecked();
  await expect(page.locator(".bilingual-melody svg").first()).toBeVisible();
  await expect(page.locator(".swipe-pager-page:not([inert]) .abcjs-clef")).toHaveCount(1);
  await expect(page.locator(".swipe-pager-page:not([inert])").getByText("First line",{exact:true})).toBeVisible();
  await expect(page.locator(".swipe-pager-page:not([inert])").getByText("Second line",{exact:true})).toBeVisible();
  await page.screenshot({path:"work/tagaluya/mobile-melody-fixture.png",fullPage:true});
  assert.deepEqual(errors,[]);
  console.log("PASS Tagalujah: program, bilingual text, size/reload, sidebars, swipes, phone layout and shared melody signatures");
} catch(error){await captureFailure(browser,error);throw error;}
finally {dev?.kill();await closeBrowser(browser);server.stop();}
