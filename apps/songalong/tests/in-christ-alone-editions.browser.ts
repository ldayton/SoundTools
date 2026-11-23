import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  closeBrowser,
  captureFailure,
  waitForApp,
} from "../../../scripts/ci/browser-harness.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
import {
  selectHymnInstrument,
  openPracticeOptions,
  openHymnControls,
  dismissPracticeDrawer,
} from "../../../packages/music-practice/browser-tests/helpers";
const server = await preview("songalong", 4615),
  browser = await launchBrowser();
const output = "/tmp/songalong-teacher-editions";
await mkdir(output, { recursive: true });
try {
  for (const width of [1960, 1440, 768, 390, 320]) {
    const page = await newPage(browser, { viewport: { width, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
      server.base + "/piano/hymns/in-christ-alone?mode=playback",
    );
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(
      page.getByRole("radio", { name: "Voice + Piano", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    for (const label of ["Guitar", "Piano", "Voice + Piano"])
      await expect(
        page.getByRole("radio", { name: label, exact: true }),
      ).toBeEnabled();
    for (const instrument of ["piano", "guitar", "sung"] as const) {
      await selectHymnInstrument(page, instrument);
      await expect(page.locator(".abcjs-note").first()).toBeVisible();
      if (width === 1960) {
        const size = page.getByRole("spinbutton", {
          name: "Staff size in pixels",
          exact: true,
        });
        await size.fill("27");
        await size.press("Enter");
        await expect(size).toHaveValue("27 px");
      }
      if (instrument !== "sung") {
        await openHymnControls(page);
        await page
          .getByRole("checkbox", { name: "Show fingerings", exact: true })
          .check();
        await expect(page.locator(".beginner-fingering").first()).toBeVisible();
        assert(
          await page
            .locator(".beginner-fingering")
            .evaluateAll((nodes) =>
              nodes.every((node) => node.getBoundingClientRect().height >= 12),
            ),
        );
        await openPracticeOptions(page);
        for (const stanza of await page
          .locator(".hymn-stanza-checkbox input")
          .all())
          await stanza.check();
        await dismissPracticeDrawer(page);
        if (width >= 1440)
          assert(
            (await page.locator(".hymn-paper svg").count()) < 21,
            "Desktop combines bars instead of stretching one bar per system",
          );
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await expect(page.locator(".score-playhead")).toHaveCount(0);
        await expect(
          page.locator(".score-playback-position .sight-current").first(),
        ).toBeVisible();
        await page.getByRole("button", { name: "Pause", exact: true }).click();
        await expect(page.locator(".score-playhead")).toBeVisible();
        assert(await page.locator(".score-playhead").evaluate(node => getComputedStyle(node.closest("svg")!.parentElement!).overflow === "visible"), "Paused glow extends beyond the per-system clipping wrapper");
        assert(
          await page
            .locator(".score-playhead > rect")
            .evaluateAll(
              (nodes) =>
                nodes.length === 1 &&
                nodes.every((node) => node.getBoundingClientRect().width >= 47 && getComputedStyle(node).stroke === "none"),
            ),
        );
        await expect(page.locator(".score-playhead linearGradient stop").last()).toHaveAttribute("stop-opacity","0");
        assert(
          await page
            .locator(".sight-current .abcjs-notehead")
            .evaluateAll(
              (nodes) =>
                nodes.length > 0 &&
                nodes.every(
                  (node) => getComputedStyle(node).fill === "rgb(4, 120, 87)",
                ),
            ),
        );
        await page.screenshot({
          path: `${output}/${instrument}-legibility-${width}.png`,
          fullPage: true,
        });
        await openPracticeOptions(page);
        const allStanzas = page.locator(".hymn-stanza-checkbox input");
        for (let index = 1; index < 4; index++)
          await allStanzas.nth(index).uncheck();
        await dismissPracticeDrawer(page);
      }
      if (instrument === "guitar") {
        if (width >= 1440) {
          const bars = await page
            .locator(".hymn-paper svg")
            .first()
            .locator(".abcjs-note.abcjs-v0")
            .evaluateAll(
              (nodes) =>
                new Set(
                  nodes.flatMap((node) =>
                    [...node.classList].filter((name) =>
                      /^abcjs-m\d+$/.test(name),
                    ),
                  ),
                ).size,
            );
          assert.equal(bars, 3, "Desktop guitar uses three bars per system");
        }
        await expect(page.locator(".hymn-score-setup")).toHaveText(
          "Capo 2 · Sounding key: D major",
        );
        await expect(
          page.getByText("Guitar setup", { exact: true }),
        ).toHaveCount(0);
        assert(
          await page
            .locator(".abcjs-rest.abcjs-v1")
            .evaluateAll((nodes) =>
              nodes.every(
                (node) => getComputedStyle(node).visibility === "hidden",
              ),
            ),
          "The bass pickup rest cannot overlap the melody",
        );
        await expect(
          page.locator("[data-name=tabNumber]").first(),
        ).toBeVisible();
        assert(
          !(await page.locator("[data-name=tabNumber]").allTextContents())
            .join("")
            .includes("?"),
        );
        await expect(page.locator("g.abcjs-part")).toHaveText([
          "Verse",
          "Interlude",
        ]);
        await openPracticeOptions(page);
        await page.locator("#hymn-score-display").selectOption("tab");
        await expect(page.locator(".guitar-position")).toHaveText([
          "III",
          "I",
          "VII",
          "III",
          "I",
        ]);
        await expect(
          page.locator(".tab-rhythm-rest.abcjs-v0").first(),
        ).toBeVisible();
      }
      if (instrument === "piano")
        await expect(page.locator("g.abcjs-part")).toHaveText([
          "Verse",
          "Interlude",
        ]);
      await openPracticeOptions(page);
      const rows = page
        .getByRole("table", { name: "Playback staves" })
        .getByRole("row");
      await expect(rows).toHaveCount(
        instrument === "sung" ? 5 : instrument === "guitar" ? 4 : 3,
      );
      if (instrument === "guitar") {
        await expect(page.getByRole("checkbox",{name:"Play Tablature",exact:true})).toBeDisabled();
        await page.getByRole("checkbox",{name:"Show Treble",exact:true}).check();
        await page.getByRole("checkbox",{name:"Show Tablature",exact:true}).uncheck();
        await expect(page.locator("[data-name=tabNumber]")).toHaveCount(0);
        await page.getByRole("checkbox",{name:"Show Tablature",exact:true}).check();
        await expect(page.locator("[data-name=tabNumber]").first()).toBeVisible();
        await page.getByRole("checkbox",{name:"Show Treble",exact:true}).uncheck();
        await expect(page.locator("#hymn-score-display")).toHaveValue("tab");
        await page.getByRole("checkbox",{name:"Show Treble",exact:true}).check();
      }
      if (instrument !== "piano") {
        await expect(page.getByRole("checkbox",{name:"Play Chords",exact:true})).toBeDisabled();
        await page.getByRole("checkbox",{name:"Show Chords",exact:true}).uncheck();
        await expect(page.locator(".abcjs-chord")).toHaveCount(0);
        if (instrument === "guitar" && width === 1960) {
          await page.reload();await waitForApp(page,".hymn-toolbar-instruments");
          await openPracticeOptions(page);
          await expect(page.getByRole("checkbox",{name:"Show Chords",exact:true})).not.toBeChecked();
          await expect(page.locator(".abcjs-chord")).toHaveCount(0);
        }
        await page.getByRole("checkbox",{name:"Show Chords",exact:true}).check();
        await expect(page.locator(".abcjs-chord").first()).toBeVisible();
      }
      await expect(page.locator(".hymn-stanza-checkbox input")).toHaveCount(4);
      const stanzas = page.locator(".hymn-stanza-checkbox input");
      await stanzas.nth(0).uncheck();
      await stanzas.nth(3).check();
      await dismissPracticeDrawer(page);
      assert(
        (await page.locator(".abcjs-lyric").allTextContents())
          .join(" ")
          .includes("guilt"),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${output}/${instrument}-${width}.png`,
        fullPage: true,
      });
      await openPracticeOptions(page);
      await stanzas.nth(0).check();
      await stanzas.nth(3).uncheck();
      await dismissPracticeDrawer(page);
    }
    await selectHymnInstrument(page, "guitar");
    await page.reload();
    await waitForApp(page, ".hymn-toolbar-instruments");
    await expect(
      page.getByRole("radio", { name: "Guitar", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS teacher editions ${width}px`);
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
