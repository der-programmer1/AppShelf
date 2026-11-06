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
      assert.deepEqual(await page.locator("main > *").evaluateAll((nodes) => nodes.map((node) => node.className)), ["hero", "updates-preview", "catalog-section"]);
      assert.equal(await page.getByRole("link", { name: "AppShelf Startseite" }).count(), 1);
      assert.equal(await page.locator(".hero-orbit").getAttribute("aria-hidden"), "true");
      assert.match(await page.locator(".hero-lede").textContent(), /persönliches Archiv für eigene Android-Apps, Web-Tools und Software-Projekte/);
      await page.getByRole("link", { name: "Apps entdecken" }).click();
      await page.waitForURL(url("#catalog-title"));
      assert.equal(await page.locator(".app-card").count(), apps.length);
      assert.equal(await page.locator("nav, footer, script, form").count(), 0);
      await page.getByRole("link", { name: "Alle Neuigkeiten", exact: true }).click();
      await page.waitForURL(url("updates/"));
      assert.equal(await page.getByRole("heading", { name: "Fortschritt & Neuigkeiten", level: 1 }).count(), 1);
      const updateResponse = await plain.request.get(url("updates.json"));
      assert.equal(updateResponse.status(), 200);
      const feed = await updateResponse.json();
      assert.equal(await page.locator(".update-card").count(), feed.entries.length);
      await noOverflow(page);
      await page.getByRole("link", { name: "Zur Sammlung", exact: true }).click();
      await page.waitForURL(base);
      for (const app of apps) {
        const card = page.getByRole("article", { name: app.name, exact: true });
        const description = card.locator(".card-description");
        assert.equal(await description.textContent(), app.cardDescription);
        if (app.iconHref) {
          const image = card.locator(".card-cover img");
          await image.evaluate((node) => node.decode());
          assert.equal(await image.getAttribute("src"), app.iconHref);
        }
        assert.deepEqual(await card.locator(".badges li").allTextContents(), app.techStack.slice(0, 3));
        assert.equal(await card.locator(".card-actions a:visible").count(), 1);
        assert.equal(await card.locator(".card-actions .button.primary").count(), 1);
        assert.equal(await card.locator(".card-option-panel details").count(), 0);
        const apk = app.files.find((file) => file.kind === "apk" && !file.filename.toLowerCase().endsWith("-unsigned.apk"));
        if (apk) {
          assert.equal(await card.getByRole("link", { name: "APK laden", exact: true }).getAttribute("href"), apk.href);
          assert.equal(await card.locator(".card-option-panel img").getAttribute("src"), apk.qrCode.href);
        }
        const github = card.locator(".card-option-links a").filter({ hasText: "Quellcode auf GitHub" });
        assert.equal(await github.count(), app.githubUrl ? 1 : 0);
        if (app.githubUrl) assert.equal(await github.getAttribute("href"), app.githubUrl);
        if (apk && app.demoHref) assert.equal(await card.locator(`a[href="${app.demoHref}"]:visible`).count(), 0);
      }
      const card = page.getByRole("article", { name: first.name, exact: true });
      const box = (node) => [node.offsetTop, node.offsetLeft, node.offsetWidth, node.offsetHeight];
      const cardBox = await card.evaluate(box);
      const toggle = card.locator(".card-options summary");
      await toggle.press("Space");
      const options = card.locator(".card-option-panel");
      assert.equal(await options.isVisible(), true);
      assert.deepEqual(await card.evaluate(box), cardBox);
      for (const image of await options.locator("img").all()) await image.evaluate((node) => node.decode());
      assert.ok(await options.getByRole("link", { name: "Web-App öffnen" }).isVisible());
      await noOverflow(page);
      await toggle.press("Space");
      assert.equal(await options.isVisible(), false);
      await card.getByRole("link", { name: first.name, exact: true }).click();
      await page.getByRole("heading", { name: first.name, exact: true }).waitFor();
      assert.equal(await page.locator("script").count(), 0);
      const source = page.getByRole("link", { name: "Quellcode auf GitHub" });
      assert.equal(await source.count(), first.githubUrl ? 1 : 0);
      if (first.githubUrl) assert.equal(await source.getAttribute("href"), first.githubUrl);
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
        for (const image of await view.locator(".card-cover img").all()) await image.evaluate((node) => node.decode());
        assert.equal(await view.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgb(244, 241, 232)");
        if (width === 1280) {
          assert.match(await view.locator(".hero").evaluate((node) => getComputedStyle(node).gridTemplateColumns), / 390px$/);
        }
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
        const project = view.getByRole("article", { name: app.name, exact: true });
        const link = project.locator(`a[href="${app.demoHref}"]`);
        if (!(await link.isVisible())) await project.locator(".card-options summary").click();
        const response = view.waitForResponse(url(app.demoHref));
        await link.click();
        assert.equal((await response).status(), 200);
      }
      await context.close();
      console.log(`PASS ${engine}: workshop layout, one primary action, opt-in GitHub, QR and static rendering at four widths`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
