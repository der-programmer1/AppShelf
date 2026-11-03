import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const catalog = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
const updates = JSON.parse(await readFile(path.join(root, "updates.json"), "utf8"));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/AppShelf/")) throw Error();
    const name = decodeURIComponent(url.pathname.slice("/AppShelf/".length));
    const file = path.resolve(root, name + (name === "" || name.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root)) throw Error();
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/AppShelf/`;
let count = 0;
const passed = async (name, action) => { await action(); console.log(`ok ${++count} - ${name}`); };
try {
  for (const engine of ["chromium", "webkit"]) {
    const browser = await ({ chromium, webkit }[engine]).launch();
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      await passed(`${engine}: visible homepage button opens the real news page`, async () => {
        await page.goto(base); await page.waitForFunction(() => document.querySelectorAll(".app-card").length > 0);
        assert.equal(await page.locator(".app-card").count(), catalog.count);
        await page.getByRole("link", { name: "Neuigkeiten", exact: true }).click();
        await page.getByRole("heading", { name: "Alle Neuigkeiten.", exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, "/AppShelf/updates/");
      });
      await passed(`${engine}: complete, dated history and actual app links`, async () => {
        assert.equal(await page.locator(".update-card").count(), updates.entries.length);
        assert.equal(await page.locator(".updates-status time").getAttribute("datetime"), updates.generatedAt);
        for (const app of catalog.apps) assert.ok(await page.locator(`.update-card a[href="apps/${app.slug}/"]`).count() > 0, app.slug);
        assert.equal(await page.locator("input[type=email], form").count(), 0);
        const dates = await page.locator(".update-card time").evaluateAll((nodes) => nodes.map((node) => node.dateTime));
        assert.deepEqual(dates, [...dates].sort().reverse());
      });
      for (const width of [320, 390, 768, 1280]) {
        await passed(`${engine}: readable news and working navigation at ${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
          await page.getByRole("link", { name: "Zur Sammlung", exact: true }).click();
          await page.getByRole("link", { name: "Neuigkeiten", exact: true }).click();
          await page.getByRole("heading", { name: "Alle Neuigkeiten.", exact: true }).waitFor();
        });
      }
      await passed(`${engine}: app detail links back to the news page`, async () => {
        const app = catalog.apps[0];
        await page.locator(`.update-card a[href="apps/${app.slug}/"]`).first().click();
        await page.getByRole("heading", { name: app.name, exact: true }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.getByRole("link", { name: "Neuigkeiten", exact: true }).click();
        await page.getByRole("heading", { name: "Alle Neuigkeiten.", exact: true }).waitFor();
      });
      await passed(`${engine}: keyboard access and visible focus`, async () => {
        await page.goto(base);
        await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement.textContent), "Zum Inhalt");
        await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
        assert.equal(await page.evaluate(() => document.activeElement.textContent), "Neuigkeiten");
        assert.equal(await page.evaluate(() => document.activeElement.matches(":focus-visible")), true);
        await page.keyboard.press("Enter"); await page.getByRole("heading", { name: "Alle Neuigkeiten.", exact: true }).waitFor();
      });
      await passed(`${engine}: full history works with JavaScript disabled`, async () => {
        const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
        try { const view = await plain.newPage(); await view.goto(base); await view.getByRole("link", { name: "Neuigkeiten", exact: true }).click(); assert.equal(await view.locator(".update-card").count(), updates.entries.length); assert.equal(await view.locator("script").count(), 0); }
        finally { await plain.close(); }
      });
      if (process.env.APPSHELF_NEWS_SCREENSHOTS && engine === "chromium") {
        await mkdir(process.env.APPSHELF_NEWS_SCREENSHOTS, { recursive: true });
        await page.setViewportSize({ width: 390, height: 1100 }); await page.goto(base + "updates/"); await page.screenshot({ path: path.join(process.env.APPSHELF_NEWS_SCREENSHOTS, "news-phone.png") });
        await page.setViewportSize({ width: 1280, height: 1000 }); await page.goto(base); await page.screenshot({ path: path.join(process.env.APPSHELF_NEWS_SCREENSHOTS, "home-desktop.png") });
      }
      assert.deepEqual(errors, []); await context.close();
    } finally { await browser.close(); }
  }
  console.log(`PASS: ${count} AppShelf news browser checks (Chromium and Linux WebKit). Physical Safari remains untested.`);
} finally { await new Promise((resolve) => server.close(resolve)); }
