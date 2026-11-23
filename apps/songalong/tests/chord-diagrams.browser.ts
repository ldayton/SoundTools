import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../scripts/ci/browser-harness.cjs";
import { macBookAir13, iphone14Pro } from "../../../scripts/test-devices.cjs";
import { preview } from "../../../packages/music-practice/browser-tests/server";
const server = await preview(
  "songalong",
  Number(process.env.TEST_PORT || 4696),
);
const browser = await launchBrowser();
try {
  await mkdir("work/chord-popup", { recursive: true });
  for (const [deviceName, device] of [
    ["macbook-air", macBookAir13],
    ["iphone-14-pro", iphone14Pro],
  ] as const) {
    const page = await newPage(browser, { ...device, reducedMotion: "reduce" });
    await page.addInitScript(() => {
      (window as any).chordSamples=[];
      const voices=new WeakMap<AudioBufferSourceNode,any>();
      const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof start>){
        if(this.context instanceof AudioContext && !this.loop){
          const voice={when:args[0]||0,stop:0};voices.set(this,voice);(window as any).chordSamples.push(voice);
        }
        return start.apply(this,args);
      };
      AudioBufferSourceNode.prototype.stop=function(...args:Parameters<typeof stop>){
        const voice=voices.get(this);if(voice)voice.stop=args[0]||0;return stop.apply(this,args);
      };
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    async function visit(id: string, query: string) {
      await page.goto(
        `${server.base}/piano/hymns/${id}?mode=playback&low=none&high=none&octave=0&${query}`,
      );
      await expect(page.locator(".sequence-title")).toBeVisible();
    }
    async function shape(expected: (number | null)[]) {
      await expect
        .poll(() =>
          page
            .getByRole("dialog")
            .locator("[data-string]")
            .evaluateAll((nodes) =>
              nodes.map((n) =>
                n.getAttribute("data-fret") === "not-played"
                  ? null
                  : Number(n.getAttribute("data-fret")),
              ),
            ),
        )
        .toEqual(expected);
    }
    async function open(chord: string, index = 0) {
      const trigger = page
        .getByRole("button", {
          name: `Show ${chord} chord diagram`,
          exact: true,
        })
        .nth(index);
      if (device.isMobile) await trigger.tap();
      else await trigger.click();
      await expect(
        page.getByRole("dialog", { name: `${chord} chord`, exact: true }),
      ).toBeVisible();
      return trigger;
    }
    async function close() {
      await page
        .getByRole("button", { name: "Close chord diagram", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeHidden();
    }
    // Legacy links migrate to the reviewed edition in C; diagrams follow its engraved voicing.
    await visit("ill-fly-away", "arrangement=guitar-chords&key=D");
    const d = await open("C");
    await shape([null, 3, 2, null, null, 0]);
    await page.evaluate(()=>{(window as any).chordSamples=[];});
    await page.getByRole("dialog").getByRole("button",{name:"Play C chord and breakdown",exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).chordSamples.length)).toBe(6);
    const played=await page.evaluate(()=>(window as any).chordSamples.map((voice:any)=>({start:voice.when-(window as any).chordSamples[0].when,duration:voice.stop-voice.when})));
    expect(played.slice(0,3).map((note:any)=>note.start)).toEqual([0,0,0]);
    expect(played.slice(3).map((note:any)=>Math.round(note.start*100)/100)).toEqual([1,1.5,2]);
    expect(played.slice(0,3).every((note:any)=>Math.abs(note.duration-1.01)<.01)).toBe(true);
    expect(played.slice(3).every((note:any)=>Math.abs(note.duration-.51)<.01)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(d).toBeFocused();
    const a7 = page
      .getByRole("button", { name: "Show G7 chord diagram", exact: true })
      .first();
    await a7.focus();
    await page.keyboard.press("Enter");
    await shape([null, 2, 3, null, 3, null]);
    await close();
    await visit("ill-fly-away", "arrangement=guitar-chords&key=G");
    await open("C");
    await shape([null, 3, 2, null, null, 0]);
    await close();
    // The former melody-tab link now opens the same complete fingerstyle edition.
    await visit("ill-fly-away", "arrangement=guitar&key=D");
    await open("C");
    expect(
      await page
        .getByRole("dialog")
        .locator('[data-string]:not([data-fret="not-played"])')
        .count(),
    ).toBe(3);
    await close();
    for (const display of ["both", "tab", "notation", "chords"]) {
      await visit(
        "amazing-grace",
        `arrangement=guitar-edition&key=original&display=${display}`,
      );
      await open("G");
      await shape([3, 2, 0, null, null, null]);
      await close();
      // G bass and B remain held while the melody moves G–B–G.
      const second = await open("G", 1);
      await shape([3, 2, null, 0, null, null]);
      const next = page.getByRole("button", {
        name: "Next fingering",
        exact: true,
      });
      await next.click();
      await shape([3, 2, null, null, 0, null]);
      await next.click();
      await shape([3, 2, null, 0, null, null]);
      await expect(next).toBeDisabled();
      await page
        .getByRole("button", { name: "Previous fingering", exact: true })
        .click();
      await shape([3, 2, null, null, 0, null]);
      if (display === "both")
        await page.screenshot({
          path: `work/chord-popup/grace-${deviceName}-${process.env.TEST_BROWSER || "chromium"}.png`,
        });
      await close();
      await expect(second).toBeFocused();
      // Minor chord names are supported without relying on a chord-name parser.
      await open("Em");
      await shape([0, 2, null, 0, null, null]);
      await close();
      await visit(
        "in-christ-alone",
        `arrangement=guitar-edition&key=original&display=${display}`,
      );
      await open("F");
      await shape([null, null, 3, 0, null, null]);
      await expect(page.getByRole("dialog")).toContainText(
        "Capo 2; frets are relative to the capo.",
      );
      await page
        .getByRole("button", { name: "Next fingering", exact: true })
        .click();
      await shape([null, null, 3, 2, null, null]);
      await page
        .getByRole("button", { name: "Next fingering", exact: true })
        .click();
      await shape([null, null, 3, null, 1, null]);
      await close();
      await open("Am");
      await shape([null, 0, 2, null, null, 0]);
      await close();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    console.log(
      `PASS ${deviceName}: actual chord/tab positions, held bass and melody steps, capo, minor chords, four display modes, transposition, keyboard and focus`,
    );
    await page.close();
  }
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
  server.stop();
}
