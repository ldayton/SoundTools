import assert from "node:assert/strict";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const {newPage}=require("../ci/browser-harness.cjs");

/** Manual comparison-page witness; called inside the renderer's declared task. */
export async function checkComparison(browser:any, url:string, output:string, engine:string) {
  for(const width of [1400,390,320]) {
    const page=await newPage(browser,{viewport:{width,height:900}}),errors:string[]=[],requests:string[]=[];
    page.on("pageerror",(e:Error)=>errors.push(e.message));
    page.on("request",(r:any)=>{if(/\.wav$/.test(r.url()))requests.push(r.url());});
    await page.goto(url);
    await page.waitForFunction(()=>!!(window as any).__comparison);
    const cards=page.locator(".card");
    assert.equal(await cards.count(),3);
    assert.equal(await page.locator("a").count(),0,"no history navigation");
    assert.equal(await page.locator('[data-side="C"]').count(),0);
    assert.equal(requests.length,0,"no audio downloads before listening");
    assert.equal((await cards.nth(0).locator(".play").textContent())!.trim(),"","play control uses an icon");
    assert.equal(await cards.nth(0).locator(".play svg").count(),1);
    await cards.nth(0).locator(".seek").evaluate((input:HTMLInputElement)=>{input.value="8";input.dispatchEvent(new Event("input"));});
    await cards.nth(0).locator(".restart").click();
    assert.equal(await cards.nth(0).locator(".seek").inputValue(),"0");
    assert.equal(requests.length,0,"returning to start while paused does not begin playback or downloads");
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.evaluate(()=>(window as any).__comparison.baseline),"03ba1ed2affe9f88db72dbfea354bbae928c1414");
    for(let i=0;i<3;i++) {
      const card=cards.nth(i);
      await card.locator(".play").click();
      await page.waitForFunction(i=>{
        const s=(window as any).__comparison.states[i];return !!s.node&&s.card.dataset.ready==="true";
      },i);
      if(i>0)assert(await page.evaluate(i=>{
        const previous=(window as any).__comparison.states[i-1];return !previous.node&&!previous.playing&&previous.buffers.size===0;
      },i),"only one active pair, other decoded audio is released");
      await card.locator(".seek").evaluate((input:HTMLInputElement)=>{input.value="8";input.dispatchEvent(new Event("input"));});
      await page.waitForFunction(i=>!!(window as any).__comparison.states[i].node,i);
      const before=await page.evaluate(i=>{const c=(window as any).__comparison;return c.position(c.states[i]);},i);
      const cached=requests.length;
      await card.locator('[data-side="B"]').click();
      await page.waitForFunction(i=>{const s=(window as any).__comparison.states[i];return s.side==="B"&&!!s.node;},i);
      const after=await page.evaluate(i=>{const c=(window as any).__comparison;return c.position(c.states[i]);},i);
      assert(Math.abs(before-after)<.5,"A/B switching preserves position");
      assert.equal(requests.length,cached,"switches use the warmed pair");
      assert.equal(await card.locator('[data-side="B"]').getAttribute("aria-pressed"),"true");
      await card.locator(".restart").click();
      await page.waitForFunction(i=>{
        const c=(window as any).__comparison,s=c.states[i];return !!s.node&&s.playing&&c.position(s)<.5;
      },i);
      assert.equal(await card.locator('[data-side="B"]').getAttribute("aria-pressed"),"true","return to start retains the selected version");
      assert.equal(await card.locator(".play").getAttribute("data-icon"),"true","playing uses the pause icon");
    }
    await cards.nth(2).locator(".play").click();
    await cards.nth(2).locator(".seek").evaluate((input:HTMLInputElement)=>{input.value="8";input.dispatchEvent(new Event("input"));});
    await cards.nth(2).locator(".restart").click();
    assert.equal(await cards.nth(2).locator(".seek").inputValue(),"0");
    assert.equal(await cards.nth(2).locator(".play").getAttribute("data-icon"),"false","paused uses the play icon");
    await cards.nth(2).locator('[data-side="A"]').click();
    assert.equal(await cards.nth(2).getAttribute("data-playing"),"false");
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator(".status.error").count(),0);
    await page.screenshot({path:path.join(output,`${engine}-${width}.png`),fullPage:true});
    await page.close();
  }
}
