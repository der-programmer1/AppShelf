import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const mount = "/AppShelf/";
const mime = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};
const live = process.env.APPSHELF_TEST_URL;
const server = live ? null : createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (!pathname.startsWith(mount)) throw new Error("outside mount");
    const file = path.resolve(root, pathname.slice(mount.length) + (pathname.endsWith("/") ? "index.html" : ""));
    if (!file.startsWith(root)) throw new Error("outside build");
    const content = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404).end();
  }
});
if (server) await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = live || `http://127.0.0.1:${server.address().port}${mount}`;
const url = (relative) => new URL(relative, base).href;
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");

try {
  const catalogue = live
    ? await (await fetch(url("catalog.json"), { cache: "no-store" })).json()
    : JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
  const { apps } = catalogue;
  const first = apps[0];
  assert.ok(first?.demoHref);

  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 850 } });
      const page = await plain.newPage();
      await page.goto(base);
      assert.deepEqual(await page.locator("main > *").evaluateAll((nodes) => nodes.map((node) => node.className)), ["hero", "app-grid"]);
      assert.equal(await page.getByRole("heading", { name: "AppShelf", level: 1 }).count(), 1);
      assert.equal(await page.locator(".app-card").count(), apps.length);
      assert.equal(await page.locator("nav, footer, script, form").count(), 0);
      assert.equal((await plain.request.get(url("updates/"))).status(), 404);
      assert.equal((await plain.request.get(url("updates.json"))).status(), 404);
      for (const app of apps) {
        const card = page.getByRole("article", { name: app.name, exact: true });
        const description = card.locator(".card-description");
        assert.equal(await description.textContent(), app.cardDescription);
        if (app.iconHref) {
          const image = card.locator(".card-title img");
          await image.evaluate((node) => node.decode());
          assert.equal(await image.getAttribute("src"), app.iconHref);
        }
        assert.equal(await card.getByRole("link", { name: /Quellcode auf GitHub/ }).getAttribute("href"), app.sourceUrl);
        assert.deepEqual(await card.locator(".badges li").allTextContents(), app.techStack.slice(0, 3));
        const apk = app.files.find((file) => file.kind === "apk" && !file.filename.toLowerCase().endsWith("-unsigned.apk"));
        if (apk) {
          assert.equal(await card.getByRole("link", { name: "APK laden", exact: true }).getAttribute("href"), apk.href);
          assert.equal(await card.locator(".qr-targets a").first().getAttribute("href"), apk.href);
        }
        if (app.demoHref) assert.equal(await card.locator(`a[href="${app.demoHref}"]:visible`).count(), 1);
      }
      const card = page.getByRole("article", { name: first.name, exact: true });
      const box = (node) => [node.offsetTop, node.offsetLeft, node.offsetWidth, node.offsetHeight];
      const cardBox = await card.evaluate(box);
      await card.locator("summary").press("Space");
      const qr = card.locator(".qr-panel");
      assert.equal(await qr.isVisible(), true);
      assert.deepEqual(await card.evaluate(box), cardBox);
      for (const image of await qr.locator("img").all()) await image.evaluate((node) => node.decode());
      assert.ok(await qr.getByRole("link", { name: /Web-App öffnen/ }).isVisible());
      await noOverflow(page);
      await card.locator("summary").press("Space");
      await card.getByRole("link", { name: first.name, exact: true }).click();
      await page.getByRole("heading", { name: first.name, exact: true }).waitFor();
      assert.equal(await page.locator("script").count(), 0);
      assert.equal(await page.getByRole("link", { name: "Quellcode auf GitHub" }).getAttribute("href"), first.sourceUrl);
      const apks = first.files.filter((file) => file.kind === "apk");
      assert.equal(await page.locator(".checksum").count(), apks.length);
      for (const [index, file] of apks.entries()) {
        const row = page.locator(".download-row").filter({ hasText: file.filename });
        await row.locator(".checksum summary").click();
        assert.equal(await page.locator(".checksum code").nth(index).textContent(), file.sha256);
        await row.locator(".qr summary").click();
        const target = row.locator(".qr-targets a");
        assert.equal(await target.evaluate((node) => node.href), url(file.href));
        await target.locator("img").evaluate((node) => node.decode());
        await noOverflow(page);
        await row.locator(".qr summary").click();
      }
      await plain.close();

      const context = await browser.newContext({ serviceWorkers: "block" });
      await context.addInitScript(() => {
        window.catalogLayoutShift = 0;
        if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.catalogLayoutShift += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const view = await context.newPage();
      const dataRequests = [];
      const errors = [];
      view.on("request", (request) => {
        if (["fetch", "xhr", "script"].includes(request.resourceType())) dataRequests.push(request.url());
      });
      view.on("pageerror", (error) => errors.push(error.message));
      const screenshots = process.env.APPSHELF_SITE_SCREENSHOTS;
      if (screenshots && engine === "chromium") await mkdir(screenshots, { recursive: true });
      for (const width of [320, 390, 768, 1280]) {
        await view.setViewportSize({ width, height: 900 });
        await view.goto(base);
        await noOverflow(view);
        await view.locator(".app-card").last().scrollIntoViewIfNeeded();
        for (const image of await view.locator(".card-title img").all()) await image.evaluate((node) => node.decode());
        assert.ok(await view.locator(".card-description").evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)));
        assert.equal(await view.evaluate(() => window.catalogLayoutShift), 0);
        if (screenshots && engine === "chromium" && [390, 1280].includes(width)) {
          await view.screenshot({ path: path.join(screenshots, `catalogue-${width}.png`), fullPage: true });
        }
      }
      assert.deepEqual(dataRequests, []);
      assert.deepEqual(errors, []);
      for (const app of apps.filter((project) => project.demoHref)) {
        await view.goto(base);
        const response = view.waitForResponse(url(app.demoHref));
        await view.getByRole("article", { name: app.name, exact: true }).locator(`a[href="${app.demoHref}"]:visible`).click();
        assert.equal((await response).status(), 200);
      }
      await context.close();
      console.log(`PASS ${engine}: two-section catalogue, direct downloads, QR, checksums and layout at four widths`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
