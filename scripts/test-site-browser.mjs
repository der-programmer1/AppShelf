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
      assert.equal(await page.locator("#stat-projects").textContent(), String(apps.length));
      assert.equal(await page.locator("#stat-categories").textContent(), String(new Set(apps.map((app) => app.category)).size));
      assert.equal(await page.locator("#stat-updated time").getAttribute("datetime"), first.updatedAt.slice(0, 10));
      assert.equal(await page.locator(".app-card").count(), apps.length);
      assert.equal(await page.locator(".catalog-controls").isVisible(), false);
      assert.ok(await page.locator(".activity-item").count() <= 3);
      assert.match(await page.getByRole("link", { name: "Commit-Historie" }).getAttribute("href"), /github\.com\/.+\/commits\//);
      for (const app of apps) {
        const card = page.getByRole("article", { name: app.name, exact: true });
        const image = card.locator(".screen-frame img");
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((node) => node.decode());
        assert.equal(await image.getAttribute("src"), app.preview.href);
        assert.equal(await card.getByRole("link", { name: "Quellcode auf GitHub" }).getAttribute("href"), app.sourceUrl);
        assert.deepEqual(await card.locator(".badges li").allTextContents(), app.techStack);
        if (app.demoHref) assert.equal(await card.getByRole("link", { name: "Web-App öffnen" }).getAttribute("href"), app.demoHref);
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
      await page.goto(url("updates/"));
      await page.waitForURL(url("#aktivitaet"));
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
        if (["fetch", "xhr"].includes(request.resourceType())) dataRequests.push(request.url());
      });
      view.on("pageerror", (error) => errors.push(error.message));
      const screenshots = process.env.APPSHELF_SITE_SCREENSHOTS;
      if (screenshots && engine === "chromium") await mkdir(screenshots, { recursive: true });
      for (const width of [320, 390, 768, 1280]) {
        await view.setViewportSize({ width, height: 900 });
        await view.goto(base);
        await noOverflow(view);
        await view.locator(".app-card").last().scrollIntoViewIfNeeded();
        for (const image of await view.locator(".screen-frame img").all()) await image.evaluate((node) => node.decode());
        assert.equal(await view.evaluate(() => window.catalogLayoutShift), 0);
        if (screenshots && engine === "chromium" && [390, 1280].includes(width)) {
          await view.screenshot({ path: path.join(screenshots, `catalogue-${width}.png`), fullPage: true });
        }
      }
      const search = view.getByRole("searchbox", { name: "Suchen" });
      await search.fill(first.name);
      assert.equal(await view.locator(".app-card:visible").count(), 1);
      await search.fill("absichtlich-kein-projekt");
      assert.equal(await view.locator(".app-card:visible").count(), 0);
      await view.getByRole("button", { name: "Filter zurücksetzen" }).click();
      assert.equal(await view.locator(".app-card:visible").count(), apps.length);
      assert.equal(await search.evaluate((node) => node === document.activeElement), true);
      await view.getByLabel("Kategorie").selectOption(first.category);
      assert.equal(await view.locator(".app-card:visible").count(), apps.filter((app) => app.category === first.category).length);
      await view.getByLabel("Kategorie").selectOption("");
      await view.getByLabel("Sortieren").selectOption("name");
      assert.deepEqual(await view.locator(".card-title h3").allTextContents(), apps.map((app) => app.name).sort((a, b) => a.localeCompare(b, "de")));
      assert.deepEqual(dataRequests, []);
      assert.deepEqual(errors, []);
      for (const app of apps.filter((project) => project.demoHref)) {
        await view.goto(base);
        const response = view.waitForResponse(url(app.demoHref));
        await view.getByRole("article", { name: app.name, exact: true }).getByRole("link", { name: "Web-App öffnen", exact: true }).click();
        assert.equal((await response).status(), 200);
      }
      await context.close();
      console.log(`PASS ${engine}: static HTML, QR, checksums, source, filters, links and layout at four widths`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
