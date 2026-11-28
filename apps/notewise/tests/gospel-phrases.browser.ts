import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer, type AddressInfo } from "node:net";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
  waitForServer,
} from "../../../scripts/ci/browser-harness.cjs";
import {
  openPracticeOptions,
  practiceOption,
} from "../../../packages/music-practice/browser-tests/helpers";

const reservation = createServer();
await new Promise<void>((r) => reservation.listen(0, "127.0.0.1", r));
const port = (reservation.address() as AddressInfo).port;
await new Promise<void>((r, j) => reservation.close((e) => (e ? j(e) : r())));
const vite = createRequire(import.meta.url)
  .resolve("vite/package.json")
  .replace(/package.json$/, "bin/vite.js");
const server = spawn(
  process.execPath,
  [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: new URL("..", import.meta.url), stdio: "ignore" },
);
const base = `http://127.0.0.1:${port}`;
const source =
  "/@fs" +
  new URL("../../../packages/music-practice/src/", import.meta.url).pathname;
let browser;
try {
  await waitForServer(base, { server });
  browser = await launchBrowser();
  const errors: string[] = [];
  for (const phone of [false, true]) {
    console.log("PHRASE_UI", phone ? "phone" : "desktop", "start");
    const page = await newPage(
      browser,
      phone
        ? {
            viewport: { width: 393, height: 852 },
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
          }
        : { viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 },
    );
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const connect: Function = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (this: AudioNode, ...args: any[]) {
        if (
          !(this.context instanceof OfflineAudioContext) &&
          args[0] === this.context.destination
        ) {
          const mute = this.context.createGain();
          mute.gain.value = 0;
          connect.call(mute, this.context.destination);
          return connect.call(this, mute);
        }
        return connect.apply(this, args);
      } as typeof AudioNode.prototype.connect;
    });
    await page.goto(base + "/guitar/scales?key=C&scale=major");
    await page.evaluate(async (source) => {
      const { BackingTrackPlayer } = await import(
        /* @vite-ignore */ source + "backing-track-audio.ts"
      );
      const original = BackingTrackPlayer.prototype.take;
      BackingTrackPlayer.prototype.take = function () {
        const take = original.call(this);
        if (this.harmonicScale) (window as any).__authoredPlayer = this;
        return take;
      };
    }, source);
    await openPracticeOptions(page);
    const panel = page.getByRole("region", {
      name: "Backing track",
      exact: true,
    });
    await panel
      .getByRole("combobox", { name: "Backing style", exact: true })
      .selectOption("gospel");
    for (const mode of ["Steady", "Active"]) {
      console.log("PHRASE_UI", phone, mode);
      await panel.getByRole("button", { name: mode, exact: true }).click();
      await panel
        .getByRole("button", { name: "Play backing track", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".backing-track-settings")
            ?.getAttribute("data-status") === "playing",
        undefined,
        { timeout: 60000 },
      );
      const before = await page.evaluate(() => {
        const p = (window as any).__authoredPlayer;
        return {
          phrasing: p.take().phrasing,
          ids: p.take().phraseIds,
          scale: p.harmonicScale,
          position: p.position,
          cycle: p.cycle,
        };
      });
      assert.equal(before.phrasing, "approved-ensemble-v1");
      assert.equal(before.ids.length, 8);
      assert.equal(new Set(before.ids).size, 2);
      assert.ok(
        before.ids.every((id: string) => id.includes(mode.toLowerCase())),
      );
      await panel
        .getByRole("button", { name: "Pause backing track", exact: true })
        .click();
      const paused = await page.evaluate(
        () => (window as any).__authoredPlayer.position,
      );
      await panel
        .getByRole("button", { name: "Play backing track", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".backing-track-settings")
            ?.getAttribute("data-status") === "playing",
      );
      assert.deepEqual(
        await page.evaluate(
          () => (window as any).__authoredPlayer.take().phraseIds,
        ),
        before.ids,
      );
      assert.ok(
        await page.evaluate(
          (position) => (window as any).__authoredPlayer.position >= position,
          paused,
        ),
      );
      await panel
        .getByRole("button", { name: "Pause backing track", exact: true })
        .click();
    }
    console.log("PHRASE_UI", phone, "transposition");
    await practiceOption(page, "#scale-key", "7");
    await practiceOption(page, "#scale-quality", "minor-pentatonic");
    await openPracticeOptions(page);
    await panel
      .getByRole("button", { name: "Play backing track", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document
          .querySelector(".backing-track-settings")
          ?.getAttribute("data-status") === "playing",
      undefined,
      { timeout: 60000 },
    );
    assert.deepEqual(
      await page.evaluate(() => {
        const p = (window as any).__authoredPlayer,
          t = p.take();
        return [
          t.plan.tonic,
          t.quality,
          t.phrasing,
          t.phraseIds[0],
          [...new Set(t.events.filter((e: any) => ["guitar", "bass", "keys"].includes(e.part))
            .map((e: any) => e.note % 12))].sort((a: any, b: any) => a - b),
        ];
      }),
      [7, "minor", "approved-ensemble-v1", "approved-gospel-active-0", [2, 5, 7, 10]],
    );
    await panel
      .getByRole("button", { name: "Pause backing track", exact: true })
      .click();
    console.log("PHRASE_UI", phone, "mixer");
    await panel.getByRole("button", { name: "Mixer", exact: true }).click();
    const organ = panel.getByRole("slider", {
      name: "Hammond organ balance",
      exact: true,
    });
    if (phone) {
      const root = panel
        .locator(".mantine-Slider-root")
        .filter({
          has: page.getByRole("slider", {
            name: "Hammond organ balance",
            exact: true,
          }),
        })
        .locator(".mantine-Slider-track");
      await root.scrollIntoViewIfNeeded();
      const box = await root.boundingBox();
      assert.ok(box);
      await root.tap({ position: { x: box.width / 4, y: box.height / 2 } });
    } else await organ.press("Home");
    await page.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Hammond organ balance"]')
          ?.getAttribute("aria-valuenow") !== "100",
    );
    const savedOrgan = await organ.getAttribute("aria-valuenow");
    assert.ok(savedOrgan !== null && Number(savedOrgan) < 80);
    await page.evaluate(async (source) => {
      const { persistence } = await import(
        /* @vite-ignore */ source + "persistence.ts"
      );
      await persistence.store.flush();
    }, source);
    await page.reload();
    await openPracticeOptions(page);
    assert.equal(await panel.getAttribute("data-status"), "ready");
    console.log("PHRASE_UI", phone, "mixer");
    await panel.getByRole("button", { name: "Mixer", exact: true }).click();
    assert.equal(await organ.getAttribute("aria-valuenow"), savedOrgan);
    await panel
      .getByRole("button", { name: "Reset to genre default", exact: true })
      .click();
    assert.equal(await organ.getAttribute("aria-valuenow"), "100");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no horizontal overflow",
    );
    await mkdir(
      new URL("../../../work/gospel-phrases/screenshots", import.meta.url),
      { recursive: true },
    );
    await page.screenshot({
      path: new URL(
        `../../../work/gospel-phrases/screenshots/${process.env.TEST_BROWSER || "chromium"}-${phone ? "iphone14pro" : "macbookair"}.png`,
        import.meta.url,
      ).pathname,
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS authored Gospel playback, transposition, resume and saved mixer on MacBook Air and iPhone 14 Pro",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
