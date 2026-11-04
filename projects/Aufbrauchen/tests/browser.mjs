import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
const root = path.resolve(fileURLToPath(new URL("../web/", import.meta.url))),
  prefix = "/AppShelf/apps/aufbrauchen/demo/";
let disconnected = false;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  if (disconnected) {
    req.socket.destroy();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    assert.ok(pathname.startsWith(prefix));
    const relative = pathname.slice(prefix.length) || "index.html",
      file = path.resolve(root, relative);
    assert.ok(file.startsWith(root + path.sep));
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`,
  checks = [];
let activePage;
async function check(name, fn) {
  try {
    await fn();
    checks.push(name);
    console.log(`ok ${checks.length} - ${name}`);
  } catch (e) {
    console.error(
      name,
      await activePage
        ?.evaluate(() => ({
          status: document.querySelector("#status")?.textContent,
          editor: document.querySelector("#editorError")?.textContent,
          consume: document.querySelector("#consumeError")?.textContent,
        }))
        .catch(() => null),
    );
    throw e;
  }
}
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await { chromium, webkit }[engine].launch();
    try {
      const context = await browser.newContext({
          viewport: { width: 390, height: 900 },
          reducedMotion: "reduce",
        }),
        page = await context.newPage(),
        errors = [],
        posts = [];
      activePage = page;
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(15000);
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (dialog) => dialog.accept());
      page.on("request", (req) => {
        if (req.method() !== "GET") posts.push(req.method() + " " + req.url());
      });
      const tab = async (name) =>
        page
          .locator("#tabs")
          .getByRole("button", { name, exact: true })
          .click();
      const date = async (days) =>
        page.evaluate(async (n) => {
          const { today, plusDays } = await import("./model.js");
          return plusDays(today(), n);
        }, days);
      const save = async () => {
        await page.locator("#saveEditor").click();
        await page.locator("#editor").waitFor({ state: "hidden" });
      };
      const card = (name) =>
        page
          .locator("article[data-item-id]")
          .filter({ has: page.getByRole("heading", { name, exact: true }) });
      const add = async (name, q = "1", unit = "piece", days = 1) => {
        await page.locator("#addItem").click();
        await page.locator("#editor").waitFor({ state: "visible" });
        await page.locator("#name").fill(name);
        await page.locator("#amount").fill(q);
        await page.locator("#unit").selectOption(unit);
        if (days !== null) await page.locator("#date").fill(await date(days));
        await save();
      };
      const exported = async () => {
        await tab("Mehr");
        const promise = page.waitForEvent("download");
        await page.locator("#export").click();
        const file = await promise;
        return JSON.parse(await readFile(await file.path(), "utf8"));
      };
      await check(
        `${engine}: empty state explains real use and contains no fake inventory`,
        async () => {
          await page.goto(base);
          await page.waitForFunction(
            () => !document.querySelector("#addItem").disabled,
          );
          assert.equal(await page.locator("article[data-item-id]").count(), 0);
          assert.match(
            await page.locator("#intro").innerText(),
            /Lebensmittel/,
          );
          await page
            .getByRole("button", { name: "Verstanden", exact: true })
            .click();
          await page.locator("#intro").waitFor({ state: "hidden" });
        },
      );
      await check(
        `${engine}: capture food, decimal quantity, date and local reload`,
        async () => {
          await add("Milch", "1,5", "l", 1);
          await card("Milch").waitFor();
          assert.match(await card("Milch").innerText(), /1,5 l/);
          await page.reload();
          await card("Milch").waitFor();
          assert.match(await card("Milch").innerText(), /Mindesthaltbarkeit/);
        },
      );
      await check(
        `${engine}: draft survives closing and reload without modifying saved food`,
        async () => {
          await card("Milch")
            .getByRole("button", { name: "Bearbeiten", exact: true })
            .click();
          await page
            .locator("#note")
            .fill(
              'Notiz bleibt erhalten <img src=x onerror="window.injected=true">',
            );
          await page.locator("#closeEditor").click();
          await page.reload();
          await page.locator("#resumeDraft").waitFor({ state: "visible" });
          await page.locator("#resumeDraft").click();
          assert.match(
            await page.locator("#note").inputValue(),
            /Notiz bleibt erhalten/,
          );
          await save();
          assert.match(await card("Milch").innerText(), /<img src=x/);
          assert.equal(await card("Milch").locator("img").count(), 0);
          assert.equal(await page.evaluate(() => window.injected), undefined);
        },
      );
      await check(
        `${engine}: exact partial consumption and over-consumption rejection`,
        async () => {
          await card("Milch")
            .getByRole("button", { name: "Verbrauchen", exact: true })
            .click();
          await page.locator("#consumeAmount").fill("0,5");
          await page.locator("#consumeForm button.primary").click();
          await page.locator("#consumeDialog").waitFor({ state: "hidden" });
          assert.match(await card("Milch").innerText(), /1 l/);
          await card("Milch")
            .getByRole("button", { name: "Verbrauchen", exact: true })
            .click();
          await page.locator("#consumeAmount").fill("99");
          await page.locator("#consumeForm button.primary").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#consumeError")
              .textContent.includes("höchstens"),
          );
          await page.locator("#closeConsume").click();
          assert.match(await card("Milch").innerText(), /1 l/);
        },
      );
      await check(
        `${engine}: Undo restores the exact quantity after a failed follow-up`,
        async () => {
          await page
            .locator("#undoBar")
            .getByRole("button", { name: "Rückgängig", exact: true })
            .click();
          await page.waitForFunction(() =>
            [...document.querySelectorAll("article[data-item-id]")].some((n) =>
              n.textContent.includes("1,5 l"),
            ),
          );
          await page.reload();
          assert.match(await card("Milch").innerText(), /1,5 l/);
        },
      );
      await check(
        `${engine}: bought purchase transfers exactly once, including rapid double submit`,
        async () => {
          await card("Milch")
            .getByRole("button", { name: "Einkaufen", exact: true })
            .click();
          await tab("Einkauf");
          const shop = page.locator("article[data-shop-id]");
          await shop.waitFor();
          await shop.getByRole("checkbox").check();
          await shop
            .getByRole("button", { name: "In Vorrat übernehmen", exact: true })
            .click();
          await page.locator("#name").fill("Milch neu");
          await page.locator("#amount").fill("2");
          await page.locator("#date").fill(await date(7));
          await page.locator("#editorForm").evaluate((form) => {
            form.dispatchEvent(new Event("submit", { cancelable: true }));
            form.dispatchEvent(new Event("submit", { cancelable: true }));
          });
          await page.locator("#editor").waitFor({ state: "hidden" });
          assert.equal(
            await page
              .getByRole("button", {
                name: "In Vorrat übernehmen",
                exact: true,
              })
              .count(),
            0,
          );
          await tab("Vorrat");
          assert.equal(await page.locator("article[data-item-id]").count(), 2);
          assert.match(await card("Milch neu").innerText(), /2 l/);
        },
      );
      await check(
        `${engine}: direct shopping entry can be checked, edited, deleted and restored`,
        async () => {
          await tab("Einkauf");
          await page
            .getByRole("button", { name: "+ Position", exact: true })
            .click();
          await page.locator("#name").fill("Äpfel");
          await page.locator("#amount").fill("1,25");
          await page.locator("#unit").selectOption("kg");
          await save();
          const row = page
            .locator("article[data-shop-id]")
            .filter({ has: page.getByText("Äpfel", { exact: true }) });
          await row.waitFor();
          await row.getByRole("checkbox").check();
          await row.getByRole("checkbox").uncheck();
          await row
            .getByRole("button", { name: "Bearbeiten", exact: true })
            .click();
          await page.locator("#note").fill("Lose einkaufen");
          await save();
          await row
            .getByRole("button", { name: "Löschen", exact: true })
            .click();
          await row.waitFor({ state: "hidden" });
          await page
            .locator("#undoBar")
            .getByRole("button", { name: "Rückgängig", exact: true })
            .click();
          await row.waitFor();
          assert.match(await row.innerText(), /1,25 kg/);
        },
      );
      await check(
        `${engine}: favorite starts a fresh batch without copying the old expiry date`,
        async () => {
          await tab("Vorrat");
          await card("Milch")
            .getByRole("button", {
              name: "Als Vorlage merken: Milch",
              exact: true,
            })
            .click();
          await tab("Heute");
          await page
            .getByRole("button", { name: "+ Milch", exact: true })
            .click();
          await page.locator("#editor").waitFor({ state: "visible" });
          assert.equal(await page.locator("#name").inputValue(), "Milch");
          assert.equal(await page.locator("#date").inputValue(), "");
          await page.locator("#discardDraft").click();
          await page.locator("#editor").waitFor({ state: "hidden" });
          await page
            .getByRole("button", { name: "Entfernen", exact: true })
            .click();
          await page
            .getByRole("button", { name: "+ Milch", exact: true })
            .waitFor({ state: "hidden" });
        },
      );
      await check(
        `${engine}: full consumption preserves archive; reopening restores food`,
        async () => {
          await card("Milch")
            .getByRole("button", { name: "Verbrauchen", exact: true })
            .click();
          await page.locator("#consumeForm button.primary").click();
          await page.locator("#consumeDialog").waitFor({ state: "hidden" });
          await card("Milch").waitFor({ state: "hidden" });
          await tab("Mehr");
          await page.locator("#archive summary").click();
          const archived = card("Milch");
          await archived.waitFor();
          assert.match(await archived.innerText(), /aufgebraucht/);
          await archived
            .getByRole("button", { name: "Wieder öffnen", exact: true })
            .click();
          await tab("Vorrat");
          await card("Milch").waitFor();
        },
      );
      await check(
        `${engine}: trash is recoverable after a new page load`,
        async () => {
          await card("Milch").locator("summary").click();
          await card("Milch")
            .getByRole("button", { name: "Löschen", exact: true })
            .click();
          await card("Milch").waitFor({ state: "hidden" });
          await page.reload();
          await tab("Mehr");
          await page.locator("#trash summary").click();
          await card("Milch")
            .getByRole("button", { name: "Wiederherstellen", exact: true })
            .click();
          await tab("Vorrat");
          await card("Milch").waitFor();
        },
      );
      let backup;
      await check(
        `${engine}: real JSON export and invalid import leave every stored field unchanged`,
        async () => {
          backup = await exported();
          assert.equal(backup.format, "aufbrauchen-backup");
          assert.equal(backup.version, 1);
          await page
            .locator("#import")
            .setInputFiles({
              name: "kaputt.json",
              mimeType: "application/json",
              buffer: Buffer.from(
                '{"format":"aufbrauchen-backup","items":[{}]}',
              ),
            });
          await page.waitForFunction(() =>
            document.querySelector("#status").textContent.includes("ungültig"),
          );
          const after = await exported();
          assert.deepEqual(after, backup);
        },
      );
      await check(
        `${engine}: valid import merges once and never overwrites local fields`,
        async () => {
          const incoming = structuredClone(backup),
            newItem = {
              ...incoming.items[0],
              id: "import-1",
              name: "Reis Import",
              place: "pantry",
              date: null,
              dateKind: "none",
              favorite: false,
              note: "Aus einer Sicherung",
            };
          incoming.items[0].name = "Nicht überschreiben";
          incoming.items.push(newItem);
          incoming.settings.soonDays = 14;
          const input = {
            name: "Sicherung.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(incoming)),
          };
          await page.locator("#import").setInputFiles(input);
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("zusammengeführt"),
          );
          await page.locator("#import").setInputFiles(input);
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("zusammengeführt"),
          );
          const result = await exported();
          assert.equal(result.items.length, backup.items.length + 1);
          assert.equal(result.items[0].name, backup.items[0].name);
          assert.equal(result.settings.soonDays, 3);
        },
      );
      await check(
        `${engine}: search and location filters use actual inventory`,
        async () => {
          await tab("Vorrat");
          await page.locator("#filter-place").selectOption("pantry");
          await page.locator("#stockSearch").fill("Reis");
          assert.equal(await page.locator("article[data-item-id]").count(), 1);
          await page.locator("#stockSearch").fill("nicht vorhanden");
          assert.equal(await page.locator("article[data-item-id]").count(), 0);
          await page.locator("#stockSearch").fill("");
          await page.locator("#filter-place").selectOption("");
        },
      );
      await check(
        `${engine}: simultaneous windows commit both writes without losing existing data`,
        async () => {
          const other = await context.newPage();
          await other.goto(base);
          await other.waitForFunction(
            () => !document.querySelector("#addItem").disabled,
          );
          const write = async (p, id, name) =>
            p.evaluate(
              async ({ id, name }) => {
                const { repository } = await import("./storage.js"),
                  { commit, addShopping } = await import("./model.js"),
                  r = repository();
                try {
                  await r.change((s) =>
                    commit(
                      s,
                      addShopping(s.data, name, 1000, "piece", "", id),
                      "Parallel gespeichert",
                    ),
                  );
                } finally {
                  r.close();
                }
              },
              { id, name },
            );
          await Promise.all([
            write(page, "parallel-a", "Zitronen"),
            write(other, "parallel-b", "Haferflocken"),
          ]);
          await other.close();
          const result = await exported();
          assert.ok(result.shopping.some((x) => x.id === "parallel-a"));
          assert.ok(result.shopping.some((x) => x.id === "parallel-b"));
          assert.ok(result.items.some((x) => x.name === "Milch"));
        },
      );
      await check(
        `${engine}: manifest, scoped service worker and complete offline reload`,
        async () => {
          await page.evaluate(() => navigator.serviceWorker.ready);
          await page.reload();
          await page.waitForFunction(() => navigator.serviceWorker.controller);
          assert.ok(
            (
              await page.evaluate(
                () => navigator.serviceWorker.controller.scriptURL,
              )
            ).endsWith(prefix + "sw.js"),
          );
          const manifest = await page.evaluate(() =>
            fetch("./manifest.webmanifest").then((r) => r.json()),
          );
          assert.equal(manifest.scope, "./");
          assert.ok(manifest.icons.some((x) => x.sizes === "192x192"));
          if (engine !== "webkit") await context.setOffline(true);
          disconnected = true;
          try {
            await page.reload();
            await page.waitForFunction(
              () => !document.querySelector("#addItem").disabled,
            );
            assert.equal(
              await page.evaluate(async () => {
                try {
                  await fetch("uncached-offline-probe");
                  return false;
                } catch {
                  return true;
                }
              }),
              true,
            );
            await add("Offline-Brot", "1", "pack", null);
            await tab("Vorrat");
            await card("Offline-Brot").waitFor();
          } finally {
            disconnected = false;
            if (engine !== "webkit") await context.setOffline(false);
          }
        },
      );
      await check(
        `${engine}: phone/tablet/desktop layouts and keyboard focus`,
        async () => {
          for (const width of [320, 390, 768, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
              ),
              true,
              `overflow at ${width}`,
            );
          }
          await page.goto(base);
          await page.keyboard.press("Tab");
          assert.equal(
            await page.evaluate(() =>
              document.activeElement.matches(":focus-visible"),
            ),
            true,
          );
        },
      );
      await check(
        `${engine}: explicit local deletion and restore from exported backup`,
        async () => {
          await page.evaluate(() =>
            localStorage.setItem("unrelated-app-sentinel", "preserve"),
          );
          await tab("Mehr");
          await page.locator("#clearAll").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("Alle lokalen"),
          );
          await page.reload();
          await page.waitForFunction(
            () => !document.querySelector("#addItem").disabled,
          );
          assert.equal(await page.locator("article[data-item-id]").count(), 0);
          assert.equal(
            await page.evaluate(() =>
              localStorage.getItem("unrelated-app-sentinel"),
            ),
            "preserve",
          );
          await tab("Mehr");
          await page
            .locator("#import")
            .setInputFiles({
              name: "Wiederherstellung.json",
              mimeType: "application/json",
              buffer: Buffer.from(JSON.stringify(backup)),
            });
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("zusammengeführt"),
          );
          const restored = await exported();
          assert.deepEqual(restored.items, backup.items);
        },
      );
      await check(
        `${engine}: no uncaught errors, script injection or data uploads`,
        async () => {
          assert.deepEqual(errors, []);
          assert.deepEqual(posts, []);
          assert.equal(await page.evaluate(() => window.injected), undefined);
        },
      );
      if (process.env.AUFBRAUCHEN_SCREENSHOTS && engine === "chromium") {
        await mkdir(process.env.AUFBRAUCHEN_SCREENSHOTS, { recursive: true });
        await tab("Vorrat");
        await card("Milch")
          .getByRole("button", { name: "Bearbeiten", exact: true })
          .click();
        await page.locator("#note").fill("Für das Frühstück");
        await save();
        if (await page.locator("#understood").isVisible())
          await page.locator("#understood").click();
        await add("Tomaten", "500", "g", 0);
        await tab("Heute");
        await page.getByRole('button',{name:'Hinweis schließen',exact:true}).click();
        await page.setViewportSize({ width: 390, height: 1000 });
        await page.screenshot({
          path: path.join(process.env.AUFBRAUCHEN_SCREENSHOTS, "01-web.png"),
          fullPage: true,
        });
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.screenshot({
          path: path.join(
            process.env.AUFBRAUCHEN_SCREENSHOTS,
            "02-desktop.png",
          ),
          fullPage: true,
        });
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  console.log(
    `PASS: ${checks.length} checks in Chromium and Linux WebKit; physical devices untested.`,
  );
  if (process.env.AUFBRAUCHEN_BROWSER_REPORT)
    await writeFile(
      process.env.AUFBRAUCHEN_BROWSER_REPORT,
      JSON.stringify(
        {
          passed: checks.length,
          checks,
          physicalAppleDevice: false,
          physicalAndroidDevice: false,
        },
        null,
        2,
      ) + "\n",
    );
} finally {
  disconnected = false;
  await new Promise((resolve) => server.close(resolve));
}
