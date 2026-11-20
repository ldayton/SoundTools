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
    console.log("AUTHORED_UI", phone ? "phone" : "desktop", "start");
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
    const presets = [
      ["blues", "standard"],
      ["rock", "standard"],
      ["country", "two-step"],
      ["folk", "fingerpicked"],
      ["folk", "strummed"],
      ["gospel", "standard"],
      ["reggae", "standard"],
      ["funk", "standard"],
      ["soul", "standard"],
    ];
    for (const [style, pattern] of presets) {
      console.log("AUTHORED_UI", phone ? "phone" : "desktop", style, pattern);
      await panel
        .getByRole("combobox", { name: "Backing style", exact: true })
        .selectOption(style);
      if (style === "folk")
        await panel
          .getByRole("combobox", { name: "Backing pattern", exact: true })
          .selectOption(pattern);
      await panel.getByRole("button", { name: "Steady", exact: true }).click();
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
      const first = await page.evaluate(() => {
        const p = (window as any).__authoredPlayer,
          t = p.take();
        return { style: t.plan.style, ids: t.phraseIds, phrasing: t.phrasing };
      });
      assert.equal(first.style, style);
      assert.ok(
        first.ids?.length,
        `${style}/${pattern}: authored content must reach the UI player`,
      );
      assert.equal(new Set(first.ids).size, 2);
      await panel.getByRole("button", { name: "Active", exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".backing-track-settings")
            ?.getAttribute("data-status") === "playing",
      );
      const active = await page.evaluate(
        () => (window as any).__authoredPlayer.take().phraseIds,
      );
      assert.notDeepEqual(
        active,
        first.ids,
        "feel selects its own authored sentences",
      );
      await panel
        .getByRole("button", { name: "Pause backing track", exact: true })
        .click();
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
        active,
        "resume retains the sentence",
      );
      await panel
        .getByRole("button", { name: "Pause backing track", exact: true })
        .click();
      if (!phone) {
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
            const t = (window as any).__authoredPlayer.take();
            return [t.plan.tonic, t.quality, !!t.phraseIds?.length];
          }),
          [7, "minor", true],
        );
        await panel
          .getByRole("button", { name: "Pause backing track", exact: true })
          .click();
        await practiceOption(page, "#scale-key", "0");
        await practiceOption(page, "#scale-quality", "major");
      }
    }
    const { persistence } = await page.evaluate(async (source) => {
      const { persistence } = await import(
        /* @vite-ignore */ source + "persistence.ts"
      );
      await persistence.store.flush();
      return { persistence: true };
    }, source);
    assert.ok(persistence);
    await page.reload();
    await openPracticeOptions(page);
    assert.equal(
      await panel.getAttribute("data-status"),
      "ready",
      "reload must not autoplay",
    );
    assert.equal(
      await panel
        .getByRole("combobox", { name: "Backing style", exact: true })
        .inputValue(),
      "soul",
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "no horizontal overflow",
    );
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS all nine authored backing presets: playback, feel changes, transposition, resume and reload on target devices",
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.kill();
}
