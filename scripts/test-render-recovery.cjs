const assert = require("node:assert/strict");
const path = require("node:path");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { chromium, expect } = require("@playwright/test");

// Inject a real descendant render failure in the test server only. No production
// crash switch or application internals are exposed to make this test possible.
const probe = {
  name: "render-recovery-probe",
  enforce: "pre",
  transform(source, id) {
    if (!id.endsWith("/packages/ui/provider.tsx")) return;
    return (
      source
        .replace("useMemo,", "useEffect, useState, useMemo,")
        .replace("<MantineProvider", "<RecoveryProbe><MantineProvider")
        .replace("</MantineProvider>", "</MantineProvider></RecoveryProbe>") +
      `
function RecoveryProbe({children}: PropsWithChildren) {
  const [failed, fail] = useState(false);
  useEffect(() => {
    const crash = () => fail(true);
    window.addEventListener("test-render-error", crash);
    return () => window.removeEventListener("test-render-error", crash);
  }, []);
  if (failed) throw new Error("Injected render failure");
  return children;
}`
    );
  },
};

(async () => {
  const { createServer } = await import("vite");
  const root = path.resolve(__dirname, "..");
  const originalCwd = process.cwd();
  const home = await mkdtemp(path.join(tmpdir(), "soundtools-recovery-"));
  const browser = await chromium.launch({
    env: { ...process.env, CFFIXED_USER_HOME: home },
  });
  try {
    for (const app of ["dorego", "notewise", "songalong"]) {
      const directory = path.join(root, "apps", app);
      process.chdir(directory);
      const server = await createServer({
        root: directory,
        configFile: path.join(directory, "vite.config.ts"),
        plugins: [probe],
        server: { host: "127.0.0.1", port: 4971, strictPort: true },
      });
      let context;
      try {
        await server.listen();
        context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
          serviceWorkers: "block",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript(() => {
          window.audioProbe = { starts: 0, active: new Set(), contexts: [] };
          const Context = window.AudioContext;
          window.AudioContext = new Proxy(Context, {
            construct(target, args) {
              const context = Reflect.construct(target, args);
              window.audioProbe.contexts.push(context);
              return context;
            },
          });
          for (const type of [AudioBufferSourceNode, OscillatorNode]) {
            const start = type.prototype.start;
            type.prototype.start = function (...args) {
              window.audioProbe.starts++;
              window.audioProbe.active.add(this);
              this.addEventListener(
                "ended",
                () => window.audioProbe.active.delete(this),
                { once: true },
              );
              return start.apply(this, args);
            };
          }
        });
        const route =
          app === "songalong"
            ? "/piano/hymns?mode=playback&tempo=160"
            : app === "notewise"
              ? "/piano/keys"
              : "/";
        await page.goto("http://127.0.0.1:4971" + route);
        if (app === "dorego") {
          await expect(page.locator("#play")).toBeEnabled({ timeout: 60000 });
          await page.locator("#play").click();
        } else if (app === "songalong") {
          await page.getByRole("button", { name: "Play", exact: true }).click();
        } else {
          await page.locator("#piano button:visible").first().click();
        }
        await page.waitForFunction(() => window.audioProbe.starts > 0);
        assert.ok(
          await page.evaluate(() => window.audioProbe.contexts.length > 0),
        );
        await page.evaluate(() => {
          localStorage.setItem("recovery-test-preference", "keep");
          window.dispatchEvent(new Event("test-render-error"));
        });
        const recovery = page.getByRole("main", { name: /recovery$/ });
        await expect(recovery).toBeVisible();
        await page.waitForFunction(
          () =>
            window.audioProbe.active.size === 0 ||
            window.audioProbe.contexts.every(
              (context) => context.state !== "running",
            ),
        );
        const starts = await page.evaluate(() => window.audioProbe.starts);
        await page.keyboard.press("Space");
        await page.keyboard.press("r");
        await page.waitForTimeout(350);
        assert.equal(
          await page.evaluate(() => window.audioProbe.starts),
          starts,
          "No restart behind recovery",
        );
        await page
          .getByRole("button", { name: "Reload app", exact: true })
          .click();
        await expect(recovery).toHaveCount(0);
        await page
          .locator(
            app === "dorego" ? "#play" : "#notation svg, .hymn-paper svg",
          )
          .first()
          .waitFor();
        assert.equal(
          await page.evaluate(() =>
            localStorage.getItem("recovery-test-preference"),
          ),
          "keep",
        );
        assert.deepEqual(errors, []);
        console.log(
          `PASS ${app}: render failure stops real audio, blocks restart, and reload recovers without clearing storage`,
        );
      } finally {
        await context?.close();
        await server.close();
      }
    }
  } finally {
    process.chdir(originalCwd);
    await browser.close();
    await rm(home, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
