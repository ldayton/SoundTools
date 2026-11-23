import { launchBrowser, newPage, closeBrowser, captureFailure, waitForApp } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("notewise", Number(process.env.TEST_PORT || 4597));
const browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    server.base +
      "/guitar/scales?key=C&scale=major&set=hila&shape=1&labels=none",
  );
  await waitForApp(page, ".scale-diagram svg");
  await expect(page.locator(".scale-pattern-caption")).toHaveText("Seven-position major · Shape 1");
  await expect(page.getByText("Shapes supplied by Hila Bar.", {exact:true})).toHaveCount(1);
  await expect(page.locator(".scale-chord-tone")).toHaveCount(0);
  await expect(page.locator(".scale-chord-connection")).toHaveCount(0);
  const tones = page.locator(".scale-diagram .scale-tone");
  await expect(tones).toHaveCount(17);
  await openPracticeOptions(page);
  await expect(page.getByLabel("Shape set", { exact: true })).toHaveValue(
    "hila",
  );
  await expect(
    page.getByLabel("Shape", { exact: true }).locator("option"),
  ).toHaveCount(7);
  await expect(page.locator("#scale-linked-pattern")).toHaveCount(0);
  await expect(
    page.locator('#scale-dot-labels option[value="fingers"]'),
  ).toHaveCount(0);
  for (let shape = 1; shape <= 7; shape++) {
    await page.getByLabel("Shape", { exact: true }).selectOption(String(shape));
    await expect(tones).toHaveCount(17);
    const pitches = await tones.evaluateAll((es) =>
      es.map((e) => Number(e.getAttribute("data-midi"))),
    );
    expect(new Set(pitches).size).toBe(17);
  }
  await page.reload();
  await openPracticeOptions(page);
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("7");
  await page.locator("#scale-key").selectOption("2");
  await expect(tones).toHaveCount(17);
  expect(
    await tones.evaluateAll((es) =>
      es.every((e) => Number(e.getAttribute("data-fret")) <= 18),
    ),
  ).toBe(true);
  await page.getByLabel("Shape set", { exact: true }).selectOption("standard");
  await expect(page.locator("#scale-pattern")).toBeVisible();
  await expect(page.locator("#scale-linked-pattern")).toBeVisible();
  await expect(page.getByLabel("Shape set", {exact:true}).locator("option")).toHaveText(["CAGED · five shapes","Seven-position major"]);
  await page.locator("#scale-pattern").selectOption("4");
  for(const quality of ["major","major-pentatonic","major-blues","minor","minor-pentatonic","minor-blues"]){
    await page.locator("#scale-quality").selectOption(quality);
    await expect(page.locator(".scale-chord-tone")).toHaveCount(0);
    const trigger=page.getByRole('button',{name:'Show chord shape',exact:true});
    await expect(trigger).toHaveAttribute('aria-expanded','false');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog=page.getByRole('region',{name:'Chord shape diagram',exact:true});
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(page.locator(".scale-chord-tone")).toHaveCount(5);
    await expect(page.locator(".scale-chord-connection")).toHaveCount(1);
    expect(await dialog.locator('svg text').allTextContents()).not.toContain('e');
    await expect(dialog).toContainText(quality.startsWith('major')?'D major · A shape':'D minor · Am shape');
    expect(await dialog.locator('svg g[data-string]').evaluateAll(es=>es.filter(e=>e.getAttribute('data-fret')!=='not-played').map(e=>`${e.getAttribute('data-string')}:${e.getAttribute('data-fret')}`).sort())).toEqual(await page.locator('.scale-chord-tone').evaluateAll(es=>es.map(e=>`${e.getAttribute('data-string')}:${e.getAttribute('data-fret')}`).sort()));
    await expect(dialog.locator('svg')).toHaveAttribute('data-orientation','horizontal');
    const low=await dialog.locator('g[data-string="6"]').boundingBox();
    const high=await dialog.locator('g[data-string="1"]').boundingBox();
    expect(low!.y).toBeGreaterThan(high!.y);
    if(quality==='major'){
      await page.screenshot({path:'/tmp/notewise-inline-chord-horizontal-desktop.png',fullPage:true});
      await page.setViewportSize({width:390,height:844});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(dialog.locator('svg')).toHaveAttribute('data-orientation','horizontal');
      await expect(page.locator('.scale-diagram svg')).toBeVisible();
      await page.screenshot({path:'/tmp/notewise-inline-chord-horizontal-mobile.png',fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    }
    await dialog.getByRole('button',{name:'Rotate chord diagram',exact:true}).click();
    await expect(dialog.locator('svg')).toHaveAttribute('data-orientation','vertical');
    expect(await page.locator('.scale-chord-tone circle').first().evaluate(e=>{
      const style=getComputedStyle(e);
      return {stroke:style.stroke,width:style.strokeWidth,dashes:style.strokeDasharray.split(/[, ]+/).map(Number.parseFloat),cap:style.strokeLinecap};
    })).toEqual({stroke:'rgb(255, 255, 255)',width:'4px',dashes:[0.1,6],cap:'round'});
    await page.getByRole('button',{name:'Close chord diagram',exact:true}).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator(".scale-chord-tone")).toHaveCount(0);
    await expect(page.locator(".scale-chord-connection")).toHaveCount(0);
    const names=(quality.startsWith("major")?["C","A","G","E","D"]:["Cm","Am","Gm","Em","Dm"]).map(n=>`${n} shape`);
    await expect(page.locator("#scale-pattern option")).toHaveText(["Fret range",...names]);
    await expect(page.locator("#scale-linked-pattern option")).toHaveText(["Single shape",...names.filter(n=>!n.startsWith(quality.startsWith("major")?"A ":"Am "))]);
    await expect(page.locator(".scale-pattern-caption")).toContainText(quality.startsWith("major")?"A shape":"Am shape");
  }
  // Every popup must depict the exact chord outlined in the selected region.
  for(const quality of ['major','minor'] as const){
    await page.locator('#scale-quality').selectOption(quality);
    for(const [index,name] of ['E','D','C','A','G'].entries()){
      await page.locator('#scale-pattern').selectOption(String(index+1));
      await page.getByRole('button',{name:'Show chord shape',exact:true}).click();
      const panel=page.getByRole('region',{name:'Chord shape diagram',exact:true});
      await expect(panel).toContainText(`D ${quality} · ${name}${quality==='minor'?'m':''} shape`);
      expect(await panel.locator('g[data-string]').evaluateAll(es=>es.filter(e=>e.getAttribute('data-fret')!=='not-played').map(e=>`${e.getAttribute('data-string')}:${e.getAttribute('data-fret')}`).sort())).toEqual(await page.locator('.scale-chord-tone').evaluateAll(es=>es.map(e=>`${e.getAttribute('data-string')}:${e.getAttribute('data-fret')}`).sort()));
      const svg=panel.locator('svg');
      await expect(svg).toHaveAttribute('data-orientation','horizontal');
      await panel.getByRole('button',{name:'Rotate chord diagram',exact:true}).click();
      await expect(svg).toHaveAttribute('data-orientation','vertical');
      if(quality==='major'&&name==='C')await page.screenshot({path:'/tmp/caged-reference-vertical.png',fullPage:true});
      await panel.getByRole('button',{name:'Rotate chord diagram',exact:true}).click();
      await expect(svg).toHaveAttribute('data-orientation','horizontal');
      const textMatrices=await svg.locator('text').evaluateAll(es=>es.map(e=>{const m=(e as SVGGraphicsElement).getScreenCTM()!;return {a:m.a,b:m.b,c:m.c,d:m.d};}));
      expect(textMatrices.every(m=>m.a>0&&m.d>0&&Math.abs(m.b)<0.001&&Math.abs(m.c)<0.001)).toBe(true);
      const dots=await svg.locator('g[data-string]').evaluateAll(es=>es.flatMap(e=>{
        const circle=e.querySelector('circle');if(!circle)return [];
        const b=circle.getBoundingClientRect();return [{string:Number(e.getAttribute('data-string')),fret:Number(e.getAttribute('data-fret')),x:b.x+b.width/2,y:b.y+b.height/2}];
      }));
      for(const a of dots)for(const b of dots){
        if(a.string>b.string)expect(a.y).toBeGreaterThan(b.y);
        if(a.fret>b.fret)expect(a.x).toBeGreaterThan(b.x);
      }
      await page.setViewportSize({width:390,height:844});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const box=await panel.boundingBox();expect(box!.width).toBeLessThanOrEqual(390);
      if(quality==='major'&&name==='C')await page.screenshot({path:'/tmp/caged-reference-horizontal-mobile.png',fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await panel.getByRole('button',{name:'Rotate chord diagram',exact:true}).click();
      await expect(svg).toHaveAttribute('data-orientation','vertical');
      await panel.getByRole('button',{name:'Close chord diagram',exact:true}).click();
      await expect(panel).toBeHidden();
    }
  }
  // The six sounding strings of an E-form A chord use four fingers, one barred.
  await page.goto(server.base+'/guitar/scales?key=A&scale=major&set=standard&pattern=1');
  await waitForApp(page,'.scale-diagram svg');
  const chordTrigger=page.getByRole('button',{name:'Show chord shape',exact:true});
  const chordPanel=page.getByRole('region',{name:'Chord shape diagram',exact:true});
  async function chordState(open:boolean, target=page) {
    const toggle=target.getByRole('button',{name:open?'Hide chord shape':'Show chord shape',exact:true});
    await expect(toggle).toHaveAttribute('aria-expanded',String(open));
    await expect(target.getByRole('region',{name:'Chord shape diagram',exact:true})).toHaveCount(open?1:0);
    await expect(target.locator('.scale-chord-tone')).toHaveCount(open?6:0);
    await expect(target.locator('.scale-chord-connection')).toHaveCount(open?1:0);
    if(!open)expect(await target.locator('.scale-tone circle').evaluateAll(es=>es.every(e=>getComputedStyle(e).strokeDasharray==='none'))).toBe(true);
  }
  await chordState(false);
  await expect(page.locator('.scale-link-legend > span')).toHaveText(['Root']);
  await chordTrigger.click();
  await chordState(true);
  await expect(chordPanel.locator('svg')).toHaveAttribute('data-orientation','horizontal');
  expect(await chordPanel.locator('g[data-string]').evaluateAll(es=>es.map(e=>[Number(e.getAttribute('data-fret')),Number(e.getAttribute('data-finger'))]))).toEqual([[5,1],[7,3],[7,4],[6,2],[5,1],[5,1]]);
  await expect(chordPanel.locator('[data-finger-barre]')).toHaveCount(1);
  await expect(chordPanel.locator('[data-finger-barre]')).toHaveAttribute('data-fret','5');
  await expect(chordPanel.locator('[data-finger-barre]')).toHaveAttribute('data-from-string','6');
  await expect(chordPanel.locator('[data-finger-barre]')).toHaveAttribute('data-to-string','1');
  await expect(chordPanel.locator('.chord-finger')).toHaveText(['1','3','4','2','1','1']);
  const gripPoints=await chordPanel.locator('g[data-string]').evaluateAll(es=>es.map(e=>{
    const c=e.querySelector('circle')!;return [Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))];
  }));
  const connection=chordPanel.locator('.chord-shape-connection');
  await expect(connection).toHaveCount(1);
  expect((await connection.getAttribute('points'))!.split(' ').map(p=>p.split(',').map(Number))).toEqual(gripPoints);
  const scaleConnection=page.locator('.scale-chord-connection');
  await expect(scaleConnection).toHaveCount(1);
  const scalePoints=await page.locator('.scale-chord-tone').evaluateAll(es=>es
    .sort((a,b)=>Number(b.getAttribute('data-string'))-Number(a.getAttribute('data-string')))
    .map(e=>{const c=e.querySelector('circle')!;return [Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))];}));
  expect((await scaleConnection.getAttribute('points'))!.split(' ').map(p=>p.split(',').map(Number))).toEqual(scalePoints);

  await page.screenshot({path:'/tmp/notewise-chord-clarity-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Hide chord shape',exact:true}).click();
  await chordState(false);
  await page.screenshot({path:'/tmp/notewise-chord-collapsed-desktop.png',fullPage:true});
  await chordTrigger.click();
  await chordState(true);
  await chordPanel.getByRole('button',{name:'Rotate chord diagram',exact:true}).click();
  await expect(chordPanel.locator('svg')).toHaveAttribute('data-orientation','vertical');
  expect((await connection.getAttribute('points'))!.split(' ').map(p=>p.split(',').map(Number))).toEqual(gripPoints);
  await chordPanel.getByRole('button',{name:'Close chord diagram',exact:true}).click();
  await chordState(false);
  await chordTrigger.click();
  await expect(chordPanel.locator('svg')).toHaveAttribute('data-orientation','horizontal');
  await chordPanel.getByRole('button',{name:'Close chord diagram',exact:true}).click();
  await chordState(false);
  // A touch context verifies phone taps as well as responsive layout.
  const phone=await newPage(browser,{viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(server.base+'/guitar/scales?key=A&scale=major&set=standard&pattern=1');
  await waitForApp(phone,'.scale-diagram svg');
  await chordState(false,phone);
  await phone.getByRole('button',{name:'Show chord shape',exact:true}).tap();
  await chordState(true,phone);
  await expect(phone.getByRole('region',{name:'Chord shape diagram',exact:true}).locator('svg')).toHaveAttribute('data-orientation','horizontal');
  await expect.poll(()=>phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await phone.screenshot({path:'/tmp/notewise-chord-clarity-mobile.png',fullPage:true});
  await phone.getByRole('button',{name:'Hide chord shape',exact:true}).tap();
  await chordState(false,phone);
  await phone.screenshot({path:'/tmp/notewise-chord-collapsed-mobile.png',fullPage:true});
  await phone.getByRole('button',{name:'Show chord shape',exact:true}).tap();
  await chordState(true,phone);
  await phone.getByRole('button',{name:'Close chord diagram',exact:true}).tap();
  await chordState(false,phone);
  await phone.close();
  await openPracticeOptions(page);
  await page.locator('#scale-pattern').selectOption('4');
  await page.locator('#scale-quality').selectOption('minor-blues');
  await page.reload();
  await openPracticeOptions(page);
  await expect(page.locator("#scale-pattern")).toHaveValue("4");
  await expect(page.locator("#scale-quality")).toHaveValue("minor-blues");
  await page.locator("#scale-quality").selectOption("major");
  await page.getByLabel("Shape set", { exact: true }).selectOption("hila");
  await page.locator("#scale-key").selectOption("0");
  await page.getByLabel("Shape", { exact: true }).selectOption("1");
  await page.locator("#scale-dot-labels").selectOption("none");
  await page.locator("#scale-title").click();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("2");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Shape", { exact: true })).toHaveValue("1");
  await page.keyboard.press("]");
  expect(
    await tones.evaluateAll((es) =>
      es.every((e) => Number(e.getAttribute("data-fret")) >= 13),
    ),
  ).toBe(true);
  await page.keyboard.press("[");
  await page.screenshot({
    path: "/tmp/notewise-hila-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/notewise-hila-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "PASS Hila shapes: seven diagrams, settings, reload, transposition, standard set, keyboard and mobile",
  );
} catch(error) {
  await captureFailure(browser,error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
