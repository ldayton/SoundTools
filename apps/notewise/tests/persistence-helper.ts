import type { Page } from "playwright";
/** Read the committed record through IndexedDB, with no app test hooks. */
export async function savedProgress(page: Page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#saved")?.textContent === "Saved on this device.",
  );
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("soundtools-notewise");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction("state").objectStore("state").get("root");
          q.onsuccess = () => {
            resolve(q.result.state.progress);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
      }),
  );
}
