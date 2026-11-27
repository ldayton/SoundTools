import { launchBrowser, newPage, createContext, waitForApp, captureFailure, closeBrowser } from "../../../scripts/ci/browser-harness.cjs";
import { expect } from "@playwright/test";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import { closePracticeOptions, openPracticeOptions } from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("notewise", 4595),
  browser = await launchBrowser();
try {
  const page = await newPage(browser, {
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    server.base +
      "/guitar/scales?key=C&scale=major&pattern=map&from=1&to=5&labels=none",
  );
  await waitForApp(page, ".scale-diagram svg");
  await expect(page.locator(".scale-shortcuts-button")).toHaveCount(0);
  await expect(page.locator(".scale-note-list")).toBeVisible();
  const tones = page.locator(".scale-diagram .scale-tone");
  await expect(tones).toHaveCount(18);
  await expect(
    page.locator(".scale-diagram .scale-tone.scale-root"),
  ).toHaveCount(3);
  await openPracticeOptions(page);
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Last fret", { exact: true })).toHaveValue("5");
  await expect(
    page.getByLabel("Last fret", { exact: true }).locator("option").last(),
  ).toHaveAttribute("value", "18");
  await page.getByLabel("Last fret", { exact: true }).selectOption("12");
  await page.getByLabel("First fret", { exact: true }).selectOption("7");
  await expect
    .poll(() =>
      tones.evaluateAll((es) =>
        es
          .map((e) => Number(e.getAttribute("data-fret")))
          .every((f) => f >= 7 && f <= 12),
      ),
    )
    .toBe(true);
  await page.reload();
  await openPracticeOptions(page);
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("7");
  await expect(page.getByLabel("Last fret", { exact: true })).toHaveValue("12");
  await page.locator("#scale-pattern").selectOption("4");
  await expect(page.getByLabel("First fret", { exact: true })).toHaveCount(0);
  await page.locator("#scale-pattern").selectOption("map");
  await expect(page.getByLabel("First fret", { exact: true })).toHaveValue("7");
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await closePracticeOptions(page);
  await page.goto(server.base + "/guitar/scales?key=D&scale=major&shapeSet=standard&pattern=3&labels=fingers");
  await waitForApp(page, ".scale-diagram svg");
  await expect(page.locator("#scale-title")).toHaveText("D major");
  // This CAGED position needs four frets; fitting five must not pad it.
  await expect(page.locator(".scale-fret-number")).toHaveCount(4);
  await expect(page.locator(".scale-diagram svg")).toBeVisible();
  await expect(page.locator(".scale-shortcuts-button")).toHaveCount(0);
  await expect(page.locator(".scale-note-list")).toBeHidden();
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    await expect.poll(() => page.locator(".scale-diagram").evaluate(el =>
      el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth
    )).toBe(true);
  }
  await page.goto(server.base + "/guitar/scales?key=D&scale=major&shapeSet=standard&pattern=4&position=2");
  await waitForApp(page, ".scale-diagram svg");
  await expect.poll(() => page.locator('#page-title').evaluate(el => {
    const text = document.createRange();
    text.selectNodeContents(el);
    const title = document.querySelector('#scale-title')!;
    return { padded: text.getBoundingClientRect().left >= 12,
      aligned: Math.abs(text.getBoundingClientRect().left - title.getBoundingClientRect().left) < 1 };
  })).toEqual({ padded: true, aligned: true });
  const swipe = async (dx: number, dy: number, selector = ".scale-diagram") => {
    await page.locator(selector).evaluate((el, {dx, dy}) => {
      // WebKit does not expose a constructible Touch; supply the touch lists
      // on bubbling DOM events to exercise the same React gesture handlers.
      const start = {clientX: 180, clientY: 350};
      const end = {clientX: 180 + dx, clientY: 350 + dy};
      for (const [type, touches, changedTouches] of [
        ["touchstart", [start], []], ["touchend", [], [end]],
      ] as const) {
        const event = new Event(type, {bubbles: true});
        Object.defineProperties(event, {touches: {value: touches}, changedTouches: {value: changedTouches}});
        el.dispatchEvent(event);
      }
    }, {dx, dy});
  };
  for (const [key, dx, dy] of [
    ["ArrowLeft", -80, 0], ["ArrowRight", 80, 0],
    ["ArrowDown", 0, -80], ["ArrowUp", 0, 80],
  ] as const) {
    const before = page.url();
    await page.keyboard.press(key);
    await expect.poll(() => page.url()).not.toBe(before);
    const expected = page.url();
    await page.goto(before);
    await waitForApp(page, ".scale-diagram svg");
    await swipe(dx, dy);
    await expect.poll(() => page.url()).toBe(expected);
  }
  // Title, heading, instrument surface and the blank page area all navigate.
  const contentSwipeStart = page.url();
  for (const selector of ['#page-title', '.scale-heading', '.scale-card', '#practice-content']) {
    await page.goto(contentSwipeStart);
    await waitForApp(page, '.scale-diagram svg');
    const before = page.url();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.url()).not.toBe(before);
    const expected = page.url();
    await page.goto(before);
    await waitForApp(page, '.scale-diagram svg');
    await swipe(0, -80, selector);
    await expect.poll(() => page.url()).toBe(expected);
  }
  await expect.poll(() => page.locator('#practice-content').evaluate(el => getComputedStyle(el).touchAction)).toBe('pinch-zoom');
  const beforeControlSwipe = page.url();
  await swipe(0, -80, '.scale-relative-switch');
  expect(page.url()).toBe(beforeControlSwipe);
  const beforeTap = page.url();
  await swipe(8, 5);
  expect(page.url()).toBe(beforeTap);
  await page.goto(server.base + "/guitar/scales?key=D&scale=major&pattern=map&from=1&to=5&labels=fingers");
  await waitForApp(page, ".scale-diagram svg");
  await expect(page.locator(".scale-fret-number")).toHaveCount(5);
  for (const width of [320, 393, 430]) {
    await page.setViewportSize({width, height: 852});
    await expect.poll(() => page.locator(".scale-diagram").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await expect.poll(() => page.locator(".scale-diagram").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await openPracticeOptions(page);
  await expect.poll(() => page.locator(".scale-options").evaluate(el => getComputedStyle(el).userSelect)).toBe("none");
  await closePracticeOptions(page);
  await page.screenshot({ path: "/tmp/scales-mobile.png", fullPage: true });
  // The five-position route extends the existing linking control. Its visible
  // notes, arrows and instructions share one route, including on a phone.
  await page.goto(server.base + "/guitar/scales?key=G&scale=major&pattern=1");
  await waitForApp(page, ".scale-diagram svg");
  await openPracticeOptions(page);
  await page.locator('#scale-linked-pattern').selectOption('all');
  await expect(page.locator('#scale-linked-pattern')).toHaveValue('all');
  await closePracticeOptions(page);
  const routePanel=page.getByRole('region',{name:'Across fretboard route'});
  await expect(routePanel).toBeVisible();
  await expect(routePanel.locator('li')).toHaveCount(4);
  await expect(page.locator('.scale-route-order')).toContainText('E ↔ D ↔ C ↔ A ↔ G');
  await expect(page.getByRole('combobox',{name:'Route direction'})).toHaveValue('both');
  for(const arrow of await page.locator('[data-route-shift] > path').all()){await expect(arrow).toHaveAttribute('marker-start','url(#scale-link-arrow)');await expect(arrow).toHaveAttribute('marker-end','url(#scale-link-arrow)');}
  await expect(page.locator('[data-route-shift]')).toHaveCount(4);
  await expect(page.locator('.scale-whole-route-board')).toHaveCount(1);
  await expect(page.locator('.scale-diagram polyline')).toHaveCount(0);
  const routePitches=()=>page.locator('[data-route-index]').evaluateAll(nodes=>nodes.sort((a,b)=>Number(a.getAttribute('data-route-index'))-Number(b.getAttribute('data-route-index'))).map(n=>Number(n.getAttribute('data-midi'))));
  const toolbar=page.getByRole('group',{name:'Scale toolbar',exact:true});
  await expect(toolbar.getByRole('combobox',{name:'Scale route'})).toHaveValue('0');
  await expect(toolbar.getByRole('combobox',{name:'Scale route'}).locator('option')).toHaveCount(4);
  const firstShifts=await page.locator('[data-route-shift]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));
  await toolbar.getByRole('combobox',{name:'Scale route'}).selectOption('1');
  expect(await page.locator('[data-route-shift]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')))).not.toEqual(firstShifts);
  await expect(page.locator('[data-route-shift]')).toHaveCount(4);
  await page.reload();
  await waitForApp(page,'.scale-whole-route');
  await expect(toolbar.getByRole('combobox',{name:'Scale route'})).toHaveValue('1');
  expect(new URL(page.url()).searchParams.get('route')).toBe('2');
  await toolbar.getByRole('combobox',{name:'Scale route'}).selectOption('0');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog',{name:'Scale keyboard shortcuts'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Scale keyboard shortcuts'})).toHaveCount(0);
  const ascending=await routePitches();
  expect(ascending).toEqual([43,45,47,48,50,52,54,55,57,59,60,62,64,66,67,69,71,72,74,76,78,79]);
  for(const width of [320,393,1440]){
    await page.setViewportSize({width,height:1000});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width>760)await expect.poll(()=>page.locator('.scale-heading').evaluate(el=>{const nav=document.querySelector('.mantine-AppShell-navbar');return !!nav&&el.getBoundingClientRect().left>=nav.getBoundingClientRect().right;})).toBe(true);
    await expect.poll(()=>page.locator('.scale-link-legend').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.scale-toolbar')!.getBoundingClientRect().bottom)).toBe(true);
    await expect.poll(()=>page.locator('.scale-tone.scale-route circle').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(25);
  }
  await page.setViewportSize({width:393,height:852});
  await expect(page.locator('#practice-content')).toHaveCSS('touch-action','auto');
  const beforeRoutePan=page.url();
  await swipe(-80,0,'.scale-diagram');
  expect(page.url()).toBe(beforeRoutePan);
  await routePanel.locator('li button').last().click();
  await expect.poll(()=>page.locator('.scale-diagram').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.locator('[data-route-shift]').last()).toBeFocused();
  await page.getByRole('combobox',{name:'Route direction'}).selectOption('down');
  await expect(page.locator('.scale-route-order')).toContainText('G → A → C → D → E');
  await expect(page.locator('[data-route-shift] > path').first()).not.toHaveAttribute('marker-start','url(#scale-link-arrow)');
  expect(await routePitches()).toEqual([...ascending].reverse());
  await page.reload();
  await waitForApp(page,'.scale-whole-route');
  await expect(routePanel).toBeVisible();
  expect(new URL(page.url()).searchParams.get('link')).toBe('all');
  await expect(page.getByRole('combobox',{name:'Route direction'})).toHaveValue('down');
  expect(await routePitches()).toEqual([...ascending].reverse());
  await page.getByRole('combobox',{name:'Route direction'}).selectOption('up');
  await expect(page.locator('.scale-route-order')).toContainText('E → D → C → A → G');
  expect(await routePitches()).toEqual(ascending);
  await page.getByRole('combobox',{name:'Route direction'}).selectOption('both');
  await expect(page.locator('.scale-route-order')).toContainText('E ↔ D ↔ C ↔ A ↔ G');
  await expect(page.locator('[data-route-shift] > path').first()).toHaveAttribute('marker-start','url(#scale-link-arrow)');
  await openPracticeOptions(page);
  await expect(page.locator('#scale-linked-pattern')).toHaveValue('all');
  await page.locator('#scale-linked-pattern').selectOption('none');
  await closePracticeOptions(page);
  await expect(routePanel).toHaveCount(0);
  await expect(page.locator('.scale-whole-route-board')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log(
    "PASS fret range map: complete map, controls, bookmark reload, shape switching and mobile",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
