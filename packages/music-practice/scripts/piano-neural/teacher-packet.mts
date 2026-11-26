import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import assert from "node:assert/strict";
import {
  launchBrowser,
  newPage,
  captureFailure,
  closeBrowser,
} from "../../../../scripts/ci/browser-harness.cjs";
const directory = resolve(process.argv[2] ?? "work/piano-teacher"),
  output = resolve(process.argv[3] ?? "output/pdf/piano-fingering-review");
await mkdir(output, { recursive: true });
const payload = JSON.parse(
    await readFile(resolve(directory, "teacher-payload.json"), "utf8"),
  ),
  organizer = JSON.parse(
    await readFile(resolve(directory, "organizer.json"), "utf8"),
  );
const bundle = await build({
  entryPoints: [new URL("./teacher-view.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "TeacherPacket",
  platform: "browser",
});
const style = `*{box-sizing:border-box}body{margin:0;font:13px/1.45 Arial,sans-serif;color:#172328;background:#eceff0}.sheet{width:210mm;height:297mm;padding:12mm 14mm 15mm;background:white;position:relative;break-after:page;overflow:hidden}.eyebrow{font-size:11px;letter-spacing:1.2px;font-weight:700;color:#56666d}h1{font-size:35px;margin:10px 0 12px;letter-spacing:-.8px}h2{font-size:23px;margin:8px 0}h3{font-size:15px;margin:12px 0 8px}.lead{font-size:19px;line-height:1.4;margin-bottom:25px}.cover{padding-top:20mm}.cover p,.cover li{max-width:650px}.cover li{margin:10px 0}.cover h2{font-size:18px;margin-top:28px}.rule{height:3px;background:#63777f;width:62px;margin:24px 0}.meta{font-size:12px;color:#54636b;margin-bottom:10px}.version{font-weight:700;font-size:16px;line-height:22px;margin:0 0 2px}.proposal{margin-bottom:4px}.score svg{width:600px;max-width:100%;display:block;height:auto}.ratings p{margin:6px 0}.ratings{margin-top:6px;font-size:12px}.ratings table{border-collapse:collapse;width:100%;font-size:12px;text-align:center}.ratings th,.ratings td{border:1px solid #bbc6ca;padding:3px 10px;height:28px}.ratings thead{background:#eef2f3}.field{display:inline-block;height:23px;border-bottom:1px solid #9eafb6;vertical-align:middle;background:#fff;max-width:100%}.multiline{display:block;height:34px;border:1px solid #bbc6ca;margin-top:4px}.preference{padding:4px 0}.preference span:not(.field){color:#52646b}.notes-label{margin-top:4px}.profile{line-height:2.7}.independent-notes{margin-top:48px}.independent-notes .multiline{height:155px}.muted{color:#56666d;font-size:12px;margin-top:30px}footer{position:absolute;bottom:9mm;left:14mm;right:14mm;border-top:1px solid #d7dfe2;padding-top:6px;font-size:10px;color:#667880}.cover footer{font-size:11px}@page{size:A4;margin:0}@media print{body{background:white}.sheet:last-child{break-after:auto}}`;
const browser = await launchBrowser();
const reports: Record<string, unknown> = {};
try {
  for (const kind of ["independent", "comparison"] as const) {
    const page = await newPage(browser, {
        viewport: { width: 900, height: 1200 },
      }),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><title>Piano fingering review ${kind}</title><style>${style}</style>`,
    );
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const metrics = await page.evaluate(
      ({ payload, kind }) =>
        (window as any).TeacherPacket.renderPacket(payload, kind),
      { payload, kind },
    );
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".sheet")).map(
        (sheet, index) => {
          const box = sheet.getBoundingClientRect();
          return {
            page: index,
            width: box.width,
            height: box.height,
            footerTop:
              sheet.querySelector("footer")!.getBoundingClientRect().top -
              box.top,
            contentBottom: Math.max(
              ...Array.from(sheet.children)
                .filter((e) => e.tagName !== "FOOTER")
                .map((e) => e.getBoundingClientRect().bottom - box.top),
            ),
            fields: Array.from(
              sheet.querySelectorAll<HTMLElement>("[data-field]"),
            ).map((el) => {
              const b = el.getBoundingClientRect();
              return {
                name: el.dataset.field!,
                multiline: el.dataset.multiline === "true",
                x: b.left - box.left + 2,
                y: b.top - box.top + 2,
                width: b.width - 4,
                height: b.height - 4,
              };
            }),
          };
        },
      ),
    );
    assert.equal(geometry.length, 9);
    assert.deepEqual(
      geometry
        .filter((g) => g.contentBottom + 8 >= g.footerTop)
        .map((g) => ({
          page: g.page,
          bottom: g.contentBottom,
          limit: g.footerTop - 8,
        })),
      [],
    );
    assert.deepEqual(errors, []);
    const clipped = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll<SVGGraphicsElement>(".review-digit"),
      ).flatMap((label) => {
        const r = label.getBoundingClientRect();
        for (
          let parent = label.parentElement;
          parent && !parent.classList.contains("sheet");
          parent = parent.parentElement
        ) {
          if (getComputedStyle(parent).overflow !== "hidden") continue;
          const p = parent.getBoundingClientRect();
          if (
            r.top < p.top - 0.5 ||
            r.bottom > p.bottom + 0.5 ||
            r.left < p.left - 0.5 ||
            r.right > p.right + 0.5
          )
            return [{ note: label.dataset.noteId, text: label.textContent }];
        }
        return [];
      }),
    );
    assert.deepEqual(clipped, [], "Fingering label clipped");
    const body = await page.locator("body").innerText();
    for (const forbidden of [
      "Lumikey",
      "classic",
      "constrained",
      "beam6",
      "neural",
    ])
      assert.ok(
        !body.toLowerCase().includes(forbidden.toLowerCase()),
        "Blind packet leaked method " + forbidden,
      );
    const raw = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    const doc = await PDFDocument.load(raw);
    assert.equal(doc.getPageCount(), 9);
    doc.setTitle(
      kind === "independent"
        ? "Independent piano fingerings"
        : "Blind piano fingering comparison",
    );
    doc.setAuthor("SongAlong");
    doc.setSubject("Teacher review PFR1");
    const form = doc.getForm(),
      font = await doc.embedFont(StandardFonts.Helvetica);
    for (const g of geometry)
      for (const item of g.fields) {
        const field = form.createTextField(item.name);
        if (item.multiline) field.enableMultiline();
        const p = doc.getPage(g.page),
          sx = p.getWidth() / g.width,
          sy = p.getHeight() / g.height;
        field.addToPage(p, {
          x: item.x * sx,
          y: p.getHeight() - (item.y + item.height) * sy,
          width: item.width * sx,
          height: item.height * sy,
          borderWidth: 0,
          textColor: rgb(0, 0, 0),
          backgroundColor: rgb(1, 1, 1),
        });
        field.setFontSize(11);
      }
    form.updateFieldAppearances(font);
    const bytes = await doc.save(),
      filename =
        kind === "independent"
          ? "piano-fingering-independent.pdf"
          : "piano-fingering-comparison.pdf";
    await writeFile(resolve(output, filename), bytes);
    const check = await PDFDocument.load(bytes);
    assert.equal(
      check.getForm().getFields().length,
      geometry.reduce((n, g) => n + g.fields.length, 0),
    );
    reports[kind] = {
      pages: check.getPageCount(),
      fields: check.getForm().getFields().length,
      metrics,
      geometry,
    };
    await page.screenshot({
      path: resolve(directory, kind + "-first-page.png"),
      fullPage: false,
    });
    await writeFile(resolve(directory, kind + ".html"), await page.content());
    await page.close();
  }
  const key = await PDFDocument.create(),
    page = key.addPage([595.28, 841.89]),
    font = await key.embedFont(StandardFonts.Helvetica),
    bold = await key.embedFont(StandardFonts.HelveticaBold);
  const draw = (text: string, y: number, size = 11, strong = false) =>
    page.drawText(text, {
      x: 42,
      y,
      size,
      font: strong ? bold : font,
      color: rgb(0.08, 0.12, 0.14),
    });
  draw("Piano fingering organizer key", 790, 23, true);
  draw("PFR1  Keep separate until teacher review is complete", 764, 11, true);
  draw(
    "A/B/C labels are reassigned for each passage. Do not share this page first.",
    737,
  );
  draw("Current = classic planner   Neural = Lumikey beam six", 715, 10);
  draw(
    "Filtered = first feasible neural shortlist candidate, with classic fallback",
    700,
    10,
  );
  let y = 665;
  for (const row of organizer.assignments) {
    draw(row.id + "  " + row.title, y, 12, true);
    y -= 18;
    draw(
      Object.entries(row.methods)
        .map(
          ([label, method]) =>
            label +
            " = " +
            (
              {
                classic: "Current",
                "lumikey-beam6": "Neural",
                "lumikey-constrained6": "Filtered",
              } as Record<string, string>
            )[method as string],
        )
        .join("      "),
      y,
      10,
    );
    y -= 15;
    draw(
      "Identical proposals: " + (row.equalPairs.join(", ") || "none"),
      y,
      10,
    );
    y -= 27;
  }
  draw("No teacher ratings or preferences have been collected.", 105, 11, true);
  draw(
    "Eight passages were frozen before proposal generation. Weights and policy unchanged.",
    87,
    9,
  );
  draw(
    "Fresh judgments are pending; pretrained training overlap remains unknown.",
    73,
    9,
  );
  draw(
    "Source selection and reproducibility records are retained with the study manifest.",
    59,
    9,
  );
  key.setTitle("Piano fingering organizer key PFR1");
  key.setAuthor("SongAlong");
  await writeFile(
    resolve(output, "piano-fingering-organizer-key.pdf"),
    await key.save(),
  );
  await writeFile(
    resolve(directory, "packet-verification.json"),
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      output,
      independent: {
        pages: (reports.independent as any).pages,
        fields: (reports.independent as any).fields,
      },
      comparison: {
        pages: (reports.comparison as any).pages,
        fields: (reports.comparison as any).fields,
      },
    }),
  );
} catch (error) {
  await captureFailure(browser, error);
  throw error;
} finally {
  await closeBrowser(browser);
}
