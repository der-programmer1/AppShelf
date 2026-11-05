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
const themeKey = "appshelf-theme";
const themeColour = { light: "rgb(244, 241, 232)", dark: "rgb(16, 26, 21)" };
const assertTheme = async (page, theme) => {
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), themeColour[theme]);
  assert.equal(await page.getByRole("button", { name: "Dunkelmodus" }).getAttribute("aria-pressed"), String(theme === "dark"));
};
const assertContrast = async (page) => {
  const results = await page.evaluate(() => {
    const luminance = (colour) => {
      const rgb = colour.match(/[\d.]+/g).slice(0, 3).map((value) => {
        const c = Number(value) / 255;
        return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const root = getComputedStyle(document.documentElement);
    const pairs = [["body", root.color, root.backgroundColor]];
    for (const selector of [".card-description", ".badges li", ".card-category", ".button", ".eyebrow", ".back-link"]) {
      for (const node of document.querySelectorAll(selector)) {
        const style = getComputedStyle(node);
        const card = node.closest(".app-card");
        const background = style.backgroundColor === "rgba(0, 0, 0, 0)"
          ? card ? getComputedStyle(card).backgroundColor : root.backgroundColor
          : style.backgroundColor;
        pairs.push([selector, style.color, background]);
      }
    }
    return pairs.map(([selector, colour, background]) => {
      const a = luminance(colour), b = luminance(background);
      return [selector, (Math.max(a, b) + .05) / (Math.min(a, b) + .05)];
    });
  });
  for (const [selector, ratio] of results) assert.ok(ratio >= 4.5, `${selector} contrast ${ratio.toFixed(2)} below 4.5`);
};

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
      const plain = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light", viewport: { width: 320, height: 850 } });
      const page = await plain.newPage();
      await page.goto(base);
      assert.deepEqual(await page.locator("main > *").evaluateAll((nodes) => nodes.map((node) => node.className)), ["hero", "catalog-section"]);
      assert.equal(await page.getByRole("link", { name: "AppShelf Startseite" }).count(), 1);
      assert.equal(await page.locator(".hero-orbit").getAttribute("aria-hidden"), "true");
      assert.match(await page.locator(".hero-lede").textContent(), /persönliches Archiv für eigene Android-Apps, Web-Tools und Software-Projekte/);
      await page.getByRole("link", { name: "Apps entdecken" }).click();
      await page.waitForURL(url("#catalog-title"));
      assert.equal(await page.locator(".app-card").count(), apps.length);
      assert.equal(await page.locator("nav, footer, form").count(), 0);
      assert.equal(await page.locator("script").count(), 1);
      assert.equal(await page.locator("#theme-toggle").isVisible(), false);
      assert.equal((await plain.request.get(url("updates/"))).status(), 404);
      assert.equal((await plain.request.get(url("updates.json"))).status(), 404);
      for (const app of apps) {
        const card = page.getByRole("article", { name: app.name, exact: true });
        const description = card.locator(".card-description");
        assert.equal(await description.textContent(), app.cardDescription);
        const image = card.locator(".card-cover img");
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((node) => node.decode());
        assert.equal(await image.getAttribute("src"), app.preview.href);
        assert.equal(await card.locator(".card-cover").getAttribute("href"), `apps/${app.slug}/`);
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
      assert.equal(await page.locator("script").getAttribute("src"), "../../assets/theme.js");
      assert.equal(await page.locator("#theme-toggle").isVisible(), false);
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
      await page.emulateMedia({ colorScheme: "dark" });
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), themeColour.dark);
      await noOverflow(page);
      await page.goto(base);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), themeColour.dark);
      await noOverflow(page);
      await plain.close();

      const context = await browser.newContext({ serviceWorkers: "block", colorScheme: "light" });
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
        await assertTheme(view, "light");
        await assertContrast(view);
        if (width === 1280) {
          assert.match(await view.locator(".hero").evaluate((node) => getComputedStyle(node).gridTemplateColumns), / 390px$/);
        }
        assert.ok(await view.locator(".card-description").evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)));
        assert.equal(await view.evaluate(() => window.catalogLayoutShift), 0);
        if (screenshots && engine === "chromium" && [390, 1280].includes(width)) {
          await view.screenshot({ path: path.join(screenshots, `catalogue-${width}.png`), fullPage: true });
        }
        await view.emulateMedia({ colorScheme: "dark" });
        await assertTheme(view, "dark");
        await assertContrast(view);
        await noOverflow(view);
        if (screenshots && engine === "chromium" && [390, 1280].includes(width)) {
          await view.screenshot({ path: path.join(screenshots, `catalogue-dark-${width}.png`), fullPage: true });
        }
        await view.emulateMedia({ colorScheme: "light" });
        await assertTheme(view, "light");
      }
      assert.ok(dataRequests.length > 0);
      assert.ok(dataRequests.every((request) => request === url("assets/theme.js")), "unexpected script or data request");
      assert.deepEqual(errors, []);

      // Keyboard selection persists across reloads, detail navigation and new tabs.
      await view.goto(base);
      const themeToggle = view.getByRole("button", { name: "Dunkelmodus" });
      await themeToggle.focus();
      assert.notEqual(await themeToggle.evaluate((node) => getComputedStyle(node).outlineStyle), "none");
      await themeToggle.press("Space");
      await assertTheme(view, "dark");
      assert.equal(await view.evaluate((key) => localStorage.getItem(key), themeKey), "dark");
      await view.reload();
      await assertTheme(view, "dark");
      await view.getByRole("article", { name: first.name, exact: true }).locator(".card-cover").click();
      await view.getByRole("heading", { name: first.name, exact: true }).waitFor();
      await assertTheme(view, "dark");
      await assertContrast(view);
      await noOverflow(view);
      const other = await context.newPage();
      await other.goto(base);
      await assertTheme(other, "dark");
      await view.emulateMedia({ colorScheme: "dark" });
      await view.getByRole("button", { name: "Dunkelmodus" }).press("Enter");
      await assertTheme(view, "light");
      await assertTheme(other, "light");
      await view.reload();
      await assertTheme(view, "light");
      await view.getByRole("link", { name: "← Alle Projekte" }).click();
      await assertTheme(view, "light");
      await other.close();

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

      // Restricted storage cannot prevent rendering or switching appearances.
      const restricted = await browser.newContext({ colorScheme: "dark", viewport: { width: 320, height: 850 } });
      await restricted.addInitScript(() => {
        Object.defineProperty(Storage.prototype, "getItem", { value() { throw new DOMException("Blocked", "SecurityError"); } });
        Object.defineProperty(Storage.prototype, "setItem", { value() { throw new DOMException("Blocked", "SecurityError"); } });
      });
      const fallback = await restricted.newPage();
      fallback.on("pageerror", (error) => errors.push(error.message));
      await fallback.goto(base);
      await assertTheme(fallback, "dark");
      await fallback.getByRole("button", { name: "Dunkelmodus" }).click();
      await assertTheme(fallback, "light");
      await noOverflow(fallback);
      await fallback.reload();
      await assertTheme(fallback, "dark");
      assert.deepEqual(errors, []);
      await restricted.close();
      console.log(`PASS ${engine}: screenshot previews, light/dark contrast at four widths, keyboard, persistence, cross-tab sync, restricted storage and no-JS fallback`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}

