import type { Page } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export const config = JSON.parse(
  await readFile(
    new URL("../work/account-local.json", import.meta.url),
    "utf8",
  ),
);
async function openNavigation(page: Page) {
  const navigation = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  const files = page.getByRole("button", {
    name: "Open files library",
    exact: true,
  });
  if (await navigation.isVisible()) {
    if (await navigation.getAttribute("aria-expanded") !== "true")
      await navigation.click();
    await page.getByRole("button", { name: "Close navigation", exact: true }).waitFor();
  } else if (await files.isVisible()) await files.click();
  else if (await page.locator("#settings").isVisible())
    await page.locator("#settings").click();
}
async function menuButton(page: Page, name: "Account" | "Log in") {
  await page.locator("#practice-content, .soundglow-header").first().waitFor();
  if (await page.locator("#practice-content").count())
    await page.waitForFunction(() => (window as any).__soundtoolsStartup?.ready);
  const nav = page.getByRole("button", { name, exact: true });
  // A transitioning off-canvas drawer can be visible to accessibility APIs
  // while its buttons are still outside the viewport.
  const onScreen = await nav.isVisible() && await nav.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > 0 && box.left < innerWidth;
  }).catch(() => false);
  if (!onScreen) await openNavigation(page);
  const drawer = page.getByRole("dialog").filter({ has: nav });
  if (await drawer.isVisible()) {
    await drawer.evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map(animation =>
        animation.finished.catch(() => {}),
      ));
    });
  }
  return nav;
}
export async function account(page: Page) {
  const nav = await menuButton(page, "Account");
  await nav.click();
  await page.getByRole("dialog", { name: "Account", exact: true }).waitFor();
}
async function latestEmail() {
  const listing = await (
    await fetch(config.MAILPIT_URL + "/api/v1/messages")
  ).json();
  assert(listing.messages.length);
  return await (
    await fetch(
      config.MAILPIT_URL + "/api/v1/message/" + listing.messages[0].ID,
    )
  ).json();
}
let checkedLinkRetry = false;
export async function login(page: Page, link = false) {
  const nav = await menuButton(page, "Log in");
  await nav.click();
  const emailInput = page.getByRole("textbox", { name: "Email address", exact: true });
  assert(await emailInput.evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), "email input avoids iOS focus zoom");
  await emailInput.fill("nobody@soundtools.test");
  await page
    .getByRole("button", { name: "Send sign-in email", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Not on approved list." })
    .waitFor();
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill(config.ACCOUNT_APPROVED_EMAIL);
  await page.waitForTimeout(1100);
  const sentResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/account/login") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send sign-in email", exact: true })
    .click();
  const response = await sentResponse;
  assert.equal(response.status(), 200, await response.text());
  await page
    .getByRole("textbox", { name: "Sign-in code", exact: true })
    .waitFor();
  assert(await page.getByRole("textbox", {name:"Sign-in code", exact:true}).evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), "code input avoids iOS focus zoom");
  const email = await latestEmail();
  const html = email.HTML;
  const app = ({ "4391": "DoReGo", "4392": "SongAlong", "4393": "NoteWise", "4394": "Soundglow" } as Record<string, string>)[new URL(page.url()).port];
  assert(app, "known app preview");
  assert(email.Subject.includes(`Sign in to ${app}`), "app-specific subject");
  assert(!/sound\s*tools/i.test(email.Subject + html), "email contains only the individual app brand");
  assert(html.includes(`alt="${app} logo"`), "email has the app logo");
  const code = (email.Text || html).match(/\b\d{6}\b/)![0];
  assert(email.Subject.includes(code), "per-request code makes the subject different for Gmail");
  assert(
    html.includes("#token_hash="),
    "same email contains the alternate link",
  );
  if (link) {
    const href = html.match(/href="([^"]+)"/)![1].replace(/&amp;/g, "&");
    await page.goto(href);
    assert(
      !page.url().includes("token_hash"),
      "credentials removed before app initialization",
    );
    if (!checkedLinkRetry) {
      checkedLinkRetry = true;
      await page.route(config.SUPABASE_URL + "/auth/v1/verify", (route) =>
        route.abort(),
      );
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Check your connection and try again." })
        .waitFor();
      await page.unroute(config.SUPABASE_URL + "/auth/v1/verify");
    }
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    if (app !== "Soundglow") {
      await page.getByRole("link", { name: `Continue to ${app}`, exact: true }).click();
      // Continue loads the application from the standalone confirmation page.
      // Wait for the new shell before deciding whether its menu needs opening.
      await (await menuButton(page, "Account")).waitFor();
    }
  } else {
    const wrong = String((Number(code) + 1) % 1000000).padStart(6, "0");
    await page
      .getByRole("textbox", { name: "Sign-in code", exact: true })
      .fill(wrong);
    const verifyRequest = page.waitForRequest((r) =>
      r.url().includes("/auth/v1/verify"),
    );
    await page
      .getByRole("button", { name: "Log in", exact: true })
      .last()
      .click();
    assert.equal(
      new URL((await verifyRequest).url()).origin,
      new URL(config.SUPABASE_URL).origin,
      "Browser must use the local test backend, never a build from another environment",
    );
    await page
      .getByRole("alert")
      .filter({ hasText: "expired or is invalid" })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Sign-in code", exact: true })
      .fill(code);
    await page
      .getByRole("button", { name: "Log in", exact: true })
      .last()
      .click();
  }
  await page
    .getByRole("dialog", { name: /^(Account|Log in|Confirm sign-in)$/ })
    .waitFor({ state: "hidden" });
  if (
    !(await page
      .getByRole("button", { name: "Account", exact: true })
      .isVisible())
  )
    await openNavigation(page);
  await page.getByRole("button", { name: /^Account/ }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (el) => el.textContent === "AccountSynced",
    ),
  );
}
export async function pull(page: Page) {
  await account(page);
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await page
    .getByRole("button", { name: "Sync now", exact: true })
    .and(page.locator(":not([data-loading])"))
    .waitFor();
  await page.getByRole("status").filter({ hasText: "Synced" }).waitFor();
  const apply = page.getByRole("button", {
    name: "Apply cloud changes",
    exact: true,
  });

  if (await apply.isVisible()) {
    await apply.click();
    await apply.waitFor({ state: "hidden" });
  }
  await closeModal(page);
}
export async function closeModal(page: Page) {
  const close = page.getByRole("button", {
    name: "Close account",
    exact: true,
  });
  if (await close.isVisible()) {
    await close.click();
    await page
      .getByRole("dialog", { name: /^(Account|Log in|Confirm sign-in)$/ })
      .waitFor({ state: "hidden" });
  }
}
