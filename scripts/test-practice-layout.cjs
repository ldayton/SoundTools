// One layout contract exercised against each app's real production build.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdir, mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { chromium, firefox, webkit } = require("playwright");
const app = process.argv[2],
  directory = process.argv[3] || "dist";
if (!["dorego", "notewise", "songalong"].includes(app))
  throw Error("Choose a practice app");
const root = path.resolve(__dirname, ".."),
  cwd = path.join(root, "apps", app);
const engine = process.env.TEST_BROWSER || "chromium";
const port = 4960 + ["dorego", "notewise", "songalong"].indexOf(app);
const prefix = directory === "dist-pages" ? "/DoReGo/" : "/";
const origin = `http://127.0.0.1:${port}`,
  base = origin + prefix;
const vite = require
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [
    vite,
    "preview",
    "--mode",
    directory === "dist-pages" ? "pages" : "production",
    "--outDir",
    directory,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { cwd, stdio: "ignore" },
);
(async () => {
  const state = await mkdtemp(path.join(tmpdir(), "practice-layout-"));
  let browser;
  try {
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw Error("Preview exited");
      try {
        if ((await fetch(base)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await { chromium, firefox, webkit }[engine].launch({
      env: { ...process.env, CFFIXED_USER_HOME: state },
    });
    const page = await browser.newPage({
        viewport: { width: 1680, height: 1050 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base);
    const name = {
      dorego: "DoReGo",
      notewise: "NoteWise",
      songalong: "SongAlong",
    }[app];
    await page
      .getByRole("link", { name: name + " home", exact: true })
      .waitFor();
    await page
      .locator(
        ".practice-options-content :is(input,select,[role=radio],[role=spinbutton]):visible",
      )
      .first()
      .waitFor();
    await page.evaluate(() => {
      window.layoutSurface = document.querySelector(".practice-surface");
    });
    const nav = page.getByRole("navigation", {
        name: "Exercises",
        exact: true,
      }),
      options = page.getByRole("complementary", {
        name: "Practice options",
        exact: true,
      });
    const n = await nav.boundingBox(),
      o = await options.boundingBox(),
      surface = await page.locator(".practice-surface").first().boundingBox();
    assert.equal(Math.round(n.width), 244);
    assert.equal(Math.round(o.width), 300);
    assert(o.x > surface.x + surface.width - 1);
    assert(
      Math.abs(o.y - surface.y) < 2,
      "Options and practice start on the same line",
    );
    assert.equal(await nav.getByRole("slider", { name: /volume/i }).count(), 1);
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Share diagnostic information",
          exact: true,
        })
        .isVisible(),
      false,
    );
    await page
      .getByRole("button", { name: "Collapse practice options", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("aria-label") ===
        "Expand practice options",
    );
    await page
      .getByRole("button", { name: "Expand practice options", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Collapse navigation", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.activeElement?.matches(".nav-toggle"),
    );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.activeElement?.matches(".nav-close"),
    );
    assert(
      await page.evaluate(
        () => layoutSurface === document.querySelector(".practice-surface"),
      ),
      "Shell changes retain the practice surface",
    );
    if (app === "dorego")
      await page.waitForFunction(
        () => !document.getElementById("play").disabled,
      );
    const readyLabel =
      app === "dorego" ? await page.locator("#play").innerText() : null;
    await nav.getByRole("link", { name: "Settings", exact: true }).click();
    await page
      .getByRole("region", { name: "App settings", exact: true })
      .waitFor();
    await page
      .getByRole("checkbox", {
        name: "Share diagnostic information",
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page
        .getByRole("checkbox", {
          name: "Share diagnostic information",
          exact: true,
        })
        .isChecked(),
      false,
    );
    assert.equal(await page.locator(".practice-options").isVisible(), false);
    await page.goBack();
    await page.locator(".practice-surface").first().waitFor();
    if (app === "dorego")
      assert.equal(
        await page.locator("#play").innerText(),
        readyLabel,
        "Settings preserves an idle exercise as ready",
      );
    // Mobile starts with both sidebars closed, with one volume/selector instance in the drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Expand practice options", exact: true })
      .waitFor();
    assert.equal(
      await page.locator("#practice-options-content").isVisible(),
      false,
    );
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await nav.getByRole("slider", { name: /volume/i }).waitFor();
    if (app === "dorego") {
      await nav
        .getByRole("combobox", { name: "Exercise", exact: true })
        .selectOption("octaveGlide");
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      await page
        .getByRole("button", { name: "Expand practice options", exact: true })
        .click();
      await page
        .getByRole("radio", { name: "Up & back", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Collapse practice options", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Expand practice options", exact: true })
      .click();
    await page
      .locator(
        "#practice-options-content :is(input,select,[role=radio],[role=spinbutton]):visible",
      )
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Collapse practice options", exact: true })
      .click();
    for (const width of [320, 390, 900, 1120, 1680]) {
      await page.setViewportSize({ width, height: 900 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `No horizontal page overflow at ${width}px`,
      );
      assert(
        await page.evaluate(
          () => layoutSurface === document.querySelector(".practice-surface"),
        ),
      );
    }
    if (app === "notewise") {
      // Every activity uses the shell's full practice column and the same surface chrome.
      const radius = await page
        .locator(".practice-surface:visible")
        .evaluate((element) => getComputedStyle(element).borderRadius);
      for (const mode of [
        "staff",
        "patterns",
        "rhythm",
        "scales",
        "intervals",
        "guitar-scales",
        "signature",
        "piano",
      ]) {
        await nav.locator(`a[data-mode="${mode}"]`).click();
        const activity = page.locator(".practice-surface:visible");
        await activity.waitFor();
        const column = await page
          .locator(".practice-workspace-content")
          .boundingBox();
        const card = await activity.boundingBox();
        assert(
          Math.abs(column.width - card.width) < 2,
          `${mode}: practice fills its column`,
        );
        assert(
          Math.abs(column.x - card.x) < 2,
          `${mode}: practice starts at the column edge`,
        );
        assert.equal(
          await activity.evaluate(
            (element) => getComputedStyle(element).borderRadius,
          ),
          radius,
          `${mode}: shared surface corners`,
        );
      }
    }
    const out = path.join(root, "work/layout-review");
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: path.join(out, `${app}-${engine}.png`) });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${app}/${engine}: common geometry, sidebar placement, Settings, focus controls, mobile disclosures, retained practice and five screen widths`,
    );
  } finally {
    await browser?.close();
    server.kill();
    await rm(state, { recursive: true, force: true }).catch((error) => {
      if (!["EACCES", "EPERM"].includes(error.code)) throw error;
    });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
