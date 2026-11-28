const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { launchBrowser, newPage, captureFailure, closeBrowser } = require("./ci/browser-harness.cjs");
(async () => {
  const { createServer } = await import("vite"),
    { default: react } = await import("@vitejs/plugin-react");
  const server = await createServer({
    configFile: false,
    cacheDir: process.env.CI_VITE_CACHE_DIR ? path.join(process.env.CI_VITE_CACHE_DIR, "ui-controls") : undefined,
    root: path.resolve(__dirname, "../packages/ui/tests"),
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 4970,
      strictPort: true,
      hmr: false,
      fs: { allow: [path.resolve(__dirname, "..")] },
    },
  });
  const home = await mkdtemp(path.join(tmpdir(), "soundtools-ui-"));
  let browser;
  try {
    await server.listen();
    const engine = process.env.TEST_BROWSER || "chromium";
    browser = await launchBrowser({
      env: { ...process.env, CFFIXED_USER_HOME: home },
    });
    const page = await newPage(browser);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4970");
    const integer = page.locator("#integer"),
      decimal = page.locator("#decimal"),
      canonical = page.locator("#canonical");
    await integer.fill("137");
    assert.equal(await canonical.textContent(), "120:1.5:0");
    await integer.press("Escape");
    await integer.blur();
    assert.equal(await integer.inputValue(), "120");
    assert.equal(await canonical.textContent(), "120:1.5:0");
    await integer.fill("138");
    await integer.press("Enter");
    assert.equal(await canonical.textContent(), "138:1.5:1");
    await integer.fill("");
    await integer.blur();
    assert.equal(await integer.inputValue(), "138");
    await integer.fill("999");
    await integer.blur();
    assert.equal(await integer.inputValue(), "240");
    await decimal.fill("2.7");
    await decimal.blur();
    assert.equal(await decimal.inputValue(), "2.7");
    await decimal.fill("7");
    await decimal.blur();
    assert.equal(await decimal.inputValue(), "2.7");
    await decimal.fill("3.4");
    await page.locator("#reset").click();
    assert.equal(await decimal.inputValue(), "2.7");
    await integer.fill("150");
    await page.locator("#external").click();
    assert.equal(await integer.inputValue(), "140");
    await integer.press("ArrowUp");
    assert.equal(await integer.inputValue(), "141");
    const reads = await page.evaluate(() => window.clockTest.reads());
    for (let tick = 1; tick <= 10; tick++) {
      await page.evaluate(() => window.clockTest.advance());
      await page.waitForFunction(
        (tick) =>
          document.getElementById("elapsed").textContent ===
          `0:${String(tick).padStart(2, "0")} / 1:40`,
        tick,
      );
    }
    assert.equal(
      await page.evaluate(() => window.clockTest.reads()),
      reads,
      "Clock updates must not invalidate practice, title or volume subscriptions",
    );
    // Both the compact toolbar and inline volume control use the same mute behavior.
    await page.getByRole("button", { name: "Toolbar volume", exact: true }).click();
    await page.getByRole("button", { name: "Mute toolbar volume", exact: true }).click();
    assert.equal(await page.locator("#toolbar-volume-value").textContent(), "0");
    await page.keyboard.press("Escape");
    await page.locator("#test-toolbar-volume").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Toolbar volume", exact: true }).click();
    await page.getByRole("button", { name: "Unmute toolbar volume", exact: true }).click();
    assert.equal(await page.locator("#toolbar-volume-value").textContent(), "37", "Closing the popover retains the pre-mute level");
    await page.keyboard.press("Escape");
    await page.locator("#external-volume").click();
    await page.getByRole("button", { name: "Toolbar volume", exact: true }).click();
    await page.getByRole("button", { name: "Mute toolbar volume", exact: true }).click();
    await page.getByRole("button", { name: "Unmute toolbar volume", exact: true }).click();
    assert.equal(await page.locator("#toolbar-volume-value").textContent(), "65", "Mute follows externally restored levels");
    await page.locator("#test-toolbar-volume").press("Home");
    await page.getByRole("button", { name: "Unmute toolbar volume", exact: true }).click();
    assert.equal(await page.locator("#toolbar-volume-value").textContent(), "65", "Manual zero does not erase the last audible level");
    await page.keyboard.press("Escape");
    const inline = page.locator("#inline-volume-fixture");
    await inline.getByRole("button", { name: "Mute", exact: true }).click();
    assert.equal(await inline.getByRole("slider").getAttribute("aria-valuenow"), "0");
    await inline.getByRole("button", { name: "Unmute", exact: true }).click();
    assert.equal(await inline.getByRole("slider").getAttribute("aria-valuenow"), "68");
    await inline.getByRole("button", { name: "Mute", exact: true }).click();
    await inline.getByRole("slider").press("ArrowRight");
    assert.equal(await inline.getByRole("button", { name: "Mute", exact: true }).getAttribute("aria-pressed"), "false", "Raising the slider restores sound");
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => {
      const root = document.createElement('div');
      root.innerHTML = '<div id="closing"><button id="old">Old</button></div><button id="trigger">Trigger</button><button id="new">New</button><button id="fallback">Fallback</button>';
      document.body.append(root);
      const get = id => root.querySelector('#' + id);
      const close = get('closing'), trigger = get('trigger'), next = get('new'), fallback = get('fallback');
      const restore = () => window.restoreFocusTest([trigger, fallback], close);
      const focused = target => document.activeElement === target;
      get('old').focus();
      const normal = restore() && focused(trigger);
      next.focus();
      const preserve = !restore() && focused(next);
      get('old').focus(); trigger.hidden = true;
      const hidden = restore() && focused(fallback);
      trigger.hidden = false; trigger.disabled = true; get('old').focus();
      const disabled = restore() && focused(fallback);
      trigger.disabled = false; trigger.inert = true; get('old').focus();
      const inert = restore() && focused(fallback);
      trigger.inert = false; trigger.style.visibility = 'hidden'; get('old').focus();
      const invisible = restore() && focused(fallback);
      trigger.style.visibility = ''; trigger.remove(); get('old').focus();
      const removed = restore() && focused(fallback);
      close.remove();
      document.activeElement.blur();
      const body = restore() && focused(fallback);
      root.remove();
      return { normal, preserve, hidden, disabled, inert, invisible, removed, body };
    }), { normal:true, preserve:true, hidden:true, disabled:true, inert:true, invisible:true, removed:true, body:true });
    // Delay the focus trap's activation until after arrow navigation. Its
    // deferred focus must follow the roving cell, not the originally selected one.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(0);
    await page.locator("#test-pitch").press("Enter");
    await page
      .locator("#test-pitch-picker")
      .getByRole("button", { name: "C3", exact: true })
      .waitFor();
    await page.keyboard.press("ArrowDown");
    await page.clock.runFor(25);
    assert.equal(
      await page
        .locator("#test-pitch-picker")
        .getByRole("button", { name: "C4", exact: true })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#test-pitch").inputValue(), "C4");
    await page.clock.resume();
    const fieldPolicy = async target => {
      assert.deepEqual(await target.locator('#zoom-text,#zoom-textarea,#zoom-native-select,#zoom-select,#zoom-native,#zoom-editable,#zoom-tempo').evaluateAll(fields =>
        fields.filter(field => parseFloat(getComputedStyle(field).fontSize) < 16).map(field => field.id)), [],
        'All mobile fields must stay above the Safari focus-zoom threshold');
      assert.equal(await target.locator('#zoom-large').evaluate(el => parseFloat(getComputedStyle(el).fontSize)), largeSize,
        'The mobile floor must preserve larger text sizes');
      const readout = await target.locator('#zoom-tempo').evaluate(el => {
        const style = getComputedStyle(el), canvas = document.createElement('canvas');
        const context = canvas.getContext('2d'); context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return { available: el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), needed: context.measureText(el.value).width };
      });
      assert(readout.available >= readout.needed, 'The three-digit BPM readout must fit at the mobile font size');
      await target.locator('#zoom-dialog-open').click();
      const dialog = target.getByRole('dialog', { name: 'Mobile fields', exact: true });
      await dialog.waitFor();
      assert(await target.locator('#zoom-dialog-input').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16),
        'Portaled dialog fields follow the same mobile policy');
      await dialog.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      assert.equal(await target.locator('#zoom-dialog-open').evaluate(el => getComputedStyle(el).touchAction), 'manipulation',
        'Repeated button taps do not trigger double-tap zoom');
      const viewport = await target.locator('meta[name="viewport"]').getAttribute('content');
      assert(!/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(?:[\s,]|$)/i.test(viewport), 'Manual pinch zoom stays available');
    };
    const largeSize = await page.locator('#zoom-large').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const desktopSize = await integer.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator('#zoom-tempo-down').waitFor();
    await fieldPolicy(page);
    if (engine !== 'firefox') {
      const { iphone14ProLandscape } = require('./test-devices.cjs');
      const phone = await newPage(browser, iphone14ProLandscape);
      try {
        await phone.goto('http://127.0.0.1:4970');
        await phone.locator('#zoom-tempo-down').waitFor();
        await fieldPolicy(phone);
      } finally { await phone.close(); }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.locator('#zoom-tempo-down').waitFor({ state: 'hidden' });
    assert.equal(await integer.evaluate(el => parseFloat(getComputedStyle(el).fontSize)), desktopSize,
      'Desktop field sizes remain unchanged');
    for (const options of ["", "&dark&stopFails&reportFails"]) {
      await page.goto("http://127.0.0.1:4970/?recovery" + options);
      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.setItem("saved-preference", "preserved");
      });
      await page
        .getByRole("button", { name: "Trigger render failure" })
        .click();
      const recovery = page.getByRole("main", { name: "Test app recovery" });
      await recovery.waitFor();
      await page.waitForFunction(
        () => sessionStorage.getItem("shutdowns") === "1",
      );
      assert.equal(
        await recovery
          .getByRole("heading")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        (await recovery.textContent()).includes("private technical detail"),
        false,
      );
      assert.equal(
        await page.locator("html").getAttribute("data-mantine-color-scheme"),
        options ? "dark" : "light",
      );
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem("reports")),
        options ? "2" : "1",
      );
      await page
        .getByRole("button", { name: "Reload app", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Trigger render failure" })
        .waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem("saved-preference")),
        "preserved",
      );
    }
    for (const app of ['notewise', 'songalong', 'dorego', 'soundglow']) {
      for (const width of [320, 390, 767, 768, 1280, 1680]) {
        await page.setViewportSize({width, height:844});
        await page.goto(`http://127.0.0.1:4970/?updateBar=${app}`);
        const button = page.getByRole('button', {name:'Complete update', exact:true});
        await button.waitFor().catch(async error => { console.error(app, width, await page.locator('body').innerText(), errors); throw error; });
        if (app !== 'soundglow') await page.waitForFunction(() => (innerWidth >= 768) === Boolean(document.querySelector('.mantine-AppShell-navbar')));
        const bar = page.locator('.application-update-bar');
        assert.equal(await page.locator('header .application-update-bar button').count(), 1);
        assert.equal(await page.locator('nav #offline-update').count(), 0);
        const b = await button.boundingBox(), row = await bar.boundingBox();
        assert.ok(Math.abs(b.x + b.width / 2 - width / 2) <= 1, `${app}/${width} centered`);
        assert.equal(row.height,48);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (app !== 'soundglow') {
          const toolbar = await page.locator('.application-toolbar').boundingBox();
          assert.ok(row.y >= toolbar.y + toolbar.height - 1, `${app} dedicated row`);
          const main = await page.locator('#practice-content > .workspace-content').boundingBox();
          assert.ok(main.y >= row.y + row.height - 1, `${app} content clears header`);
        }
        const primary = app === 'soundglow' ? undefined : await page.locator('.application-toolbar').boundingBox();
        if (app === 'soundglow') {
          const controls = await page.locator('header > span, header > button').evaluateAll(es => es.map(e => e.getBoundingClientRect().bottom));
          assert.ok(row.y >= Math.max(...controls), 'Soundglow update has a dedicated row');
        } else if (width >= 768) {
          await page.getByRole('button', {name:'Collapse navigation',exact:true}).click();
          assert.ok(await button.isVisible(), `${app} update remains available with navigation collapsed`);
          const centered = await button.boundingBox();
          assert.ok(Math.abs(centered.x + centered.width / 2 - width / 2) <= 1);
        }
        if (width === 1280) {
          await require('node:fs/promises').mkdir('work/update-toolbars',{recursive:true});
          await page.screenshot({path:`work/update-toolbars/${app}-${engine}-desktop.png`,fullPage:true});
        }
        await button.click();
        await bar.waitFor({state:'detached'});
        if (primary) assert.deepEqual(await page.locator('.application-toolbar').boundingBox(),primary,'Update removal preserves primary toolbar geometry');
      }
    }
    assert.deepEqual(errors, []);
    console.log(
      `PASS shared UI/${engine}: drafts, Escape, Enter once, blur, bounds, decimals, rejection, reset, external changes, step controls isolated playback subscriptions, and render recovery (shutdown, reporting failures, focus, dark theme and reload)`,
    );
  } catch (error) {
    await captureFailure(browser, error);
    throw error;
  } finally {
    await closeBrowser(browser);
    await server.close();
    await rm(home, { recursive: true, force: true }).catch((error) => {
      if (process.platform !== "darwin" || error.code !== "EACCES") throw error;
    });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
