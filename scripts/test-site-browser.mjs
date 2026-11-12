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
const decodeImage = async (image) => {
  // Lazy images must enter the viewport before WebKit starts their download.
  await image.scrollIntoViewIfNeeded();
  await image.evaluate(node => node.decode());
};

try {
  const catalogue = live
    ? await (await fetch(url("catalog.json"), { cache: "no-store" })).json()
    : JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
  const { apps } = catalogue;
  const first = apps.find((app) => app.demoHref && app.files.some((file) => file.kind === "apk" && !file.filename.endsWith("-unsigned.apk")));
  assert.ok(first?.demoHref);

  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      const plain = await browser.newContext({ javaScriptEnabled: false, colorScheme: "dark", viewport: { width: 320, height: 850 } });
      const page = await plain.newPage();
      page.setDefaultTimeout(20000);
      await page.goto(base);
      assert.deepEqual(await page.locator("main > *").evaluateAll((nodes) => nodes.map((node) => node.className)), ["hero", "offer-promo", "catalog-section"]);
      assert.equal(await page.getByRole("link", { name: "AppShelf Startseite" }).count(), 1);
      assert.equal(await page.locator(".hero-orbit").getAttribute("aria-hidden"), "true");
      assert.match(await page.locator(".hero-lede").textContent(), /persönliches Archiv für eigene Android-Apps, Web-Tools und Software-Projekte/);
      await page.getByRole("link", { name: "Apps entdecken" }).click();
      await page.waitForURL(url("#catalog-title"));
      assert.equal(await page.locator(".app-card").count(), apps.length);
      assert.equal(await page.locator("nav, footer, form").count(), 0);
      assert.equal(await page.locator("script").count(), 1);
      assert.equal(await page.locator("script").getAttribute("src"), "assets/theme.js");
      assert.equal(await page.getByRole("combobox", { name: "Farbschema" }).count(), 0);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), "rgb(16, 20, 16)");
      assert.equal((await plain.request.get(url("updates/"))).status(), 404);
      assert.equal((await plain.request.get(url("updates.json"))).status(), 404);
      for (const app of apps) {
        const card = page.getByRole("article", { name: app.name, exact: true });
        const description = card.locator(".card-description");
        assert.equal(await description.textContent(), app.cardDescription);
        const image = card.locator(".card-cover img");
        await decodeImage(image);
        assert.equal(await image.getAttribute("src"), app.preview.href);
        assert.equal(await card.locator(".card-cover").getAttribute("href"), `apps/${app.slug}/`);
        const cover = await card.locator(".card-cover").boundingBox();
        assert.ok(Math.abs(cover.width / cover.height - 1.6) < .02);
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
      for (const image of await options.locator("img").all()) await decodeImage(image);
      assert.ok(await options.getByRole("link", { name: "Web-App öffnen" }).isVisible());
      await noOverflow(page);
      await toggle.press("Space");
      assert.equal(await options.isVisible(), false);
      await card.getByRole("link", { name: first.name, exact: true }).click();
      await page.getByRole("heading", { name: first.name, exact: true }).waitFor();
      assert.equal(await page.locator("script").getAttribute("src"), "../../assets/theme.js");
      assert.equal((await plain.request.get(url("apps/gymdelay/"))).status(), 404);
      assert.equal((await plain.request.get(url("apps/gymdelay/demo/"))).status(), 404);
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
        await decodeImage(target.locator("img"));
        await noOverflow(page);
        await row.locator(".qr summary").click();
      }
      await plain.close();
      console.log(`PASS ${engine}: static catalogue and project navigation`);

      const context = await browser.newContext({ serviceWorkers: "block", colorScheme: "light" });
      await context.addInitScript(() => {
        window.catalogLayoutShift = 0;
        if (!PerformanceObserver.supportedEntryTypes.includes("layout-shift")) return;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.catalogLayoutShift += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      });
      const view = await context.newPage();
      view.setDefaultTimeout(20000);
      const dataRequests = [];
      const errors = [];
      view.on("request", (request) => {
        if (["fetch", "xhr", "script"].includes(request.resourceType())) dataRequests.push(request.url());
      });
      view.on("pageerror", (error) => errors.push(error.message));
      const screenshots = process.env.APPSHELF_SITE_SCREENSHOTS;
      if (screenshots && engine === "chromium") await mkdir(screenshots, { recursive: true });
      for (const width of [320, 390, 768, 1280]) {
        console.log(`CHECK ${engine}: catalogue at ${width}px`);
        await view.setViewportSize({ width, height: 900 });
        await view.goto(base);
        await noOverflow(view);
        await view.locator(".app-card").last().scrollIntoViewIfNeeded();
        for (const image of await view.locator(".card-cover img").all()) await decodeImage(image);
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
      assert.ok(dataRequests.length > 0);
      assert.ok(dataRequests.every((request) => request === url("assets/theme.js")));
      const select = view.getByRole("combobox", { name: "Farbschema" });
      await select.selectOption("dark");
      const dark = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
      assert.equal(await dark(view), "rgb(16, 20, 16)");
      const detailView = await context.newPage();
      detailView.setDefaultTimeout(20000);
      await detailView.goto(url("apps/satzfenster/"));
      const detailSelect = detailView.getByRole("combobox", { name: "Farbschema" });
      assert.equal(await detailSelect.inputValue(), "dark");
      assert.equal(await dark(detailView), "rgb(16, 20, 16)");
      await detailSelect.selectOption("light");
      await view.waitForFunction(() => document.documentElement.dataset.theme === "light");
      assert.equal(await dark(view), "rgb(244, 241, 232)");
      await select.selectOption("system");
      await view.emulateMedia({ colorScheme: "dark" });
      assert.equal(await dark(view), "rgb(16, 20, 16)");
      await noOverflow(view);
      await detailView.close();
      console.log(`PASS ${engine}: catalogue themes and layout`);
      assert.deepEqual(errors, []);
      for (const app of apps.filter((project) => project.demoHref && !project.demoHref.startsWith("https://"))) {
        await view.goto(base);
        const project = view.getByRole("article", { name: app.name, exact: true });
        const link = project.locator(`a[href="${app.demoHref}"]`);
        if (!(await link.isVisible())) await project.locator(".card-options summary").click();
        const response = view.waitForResponse(url(app.demoHref));
        await link.click();
        assert.equal((await response).status(), 200);
      }
      // Check external navigation in a real browser without relying on the remote
      // site being online during CI. The public target is separately smoke-checked.
      const external = apps.find((app) => app.slug === "bananenblick");
      assert.ok(external?.demoHref.startsWith("https://"));
      await view.route(external.demoHref, (route) => route.fulfill({ contentType: "text/html", body: "<h1>External web app</h1>" }));
      for (const relative of ["", `apps/${external.slug}/`]) {
        await view.goto(url(relative));
        const link = view.locator(`a.button.primary[href="${external.demoHref}"]`);
        await link.click();
        await view.waitForURL(external.demoHref);
      }
      await context.close();
      console.log(`PASS ${engine}: app entry points`);
      const inquiryContext = await browser.newContext({ colorScheme: "light" });
      const inquiryPage = await inquiryContext.newPage();
      inquiryPage.setDefaultTimeout(20000);
      const inquiryErrors = [];
      const submissions = [];
      inquiryPage.on("pageerror", error => inquiryErrors.push(error.message));
      inquiryPage.on("request", request => {
        if (request.method() !== "GET" || ["fetch", "xhr"].includes(request.resourceType())) submissions.push(request.url());
      });
      for (const width of [320, 390, 768, 1280]) {
        console.log(`CHECK ${engine}: website offer at ${width}px`);
        await inquiryPage.setViewportSize({ width, height: 900 });
        await inquiryPage.goto(url("angebot.html"));
        await inquiryPage.getByRole("form", { name: "Website-Anfrage vorbereiten" }).waitFor();
        for (const scheme of ["light", "dark"]) {
          await inquiryPage.getByRole("combobox", { name: "Farbschema" }).selectOption(scheme);
          await noOverflow(inquiryPage);
        }
        if (screenshots && engine === "chromium" && [390, 1280].includes(width)) {
          await inquiryPage.screenshot({ path: path.join(screenshots, `website-offer-${width}.png`), fullPage: true });
        }
      }
      await inquiryPage.getByLabel("Dein Name", { exact: true }).fill("Mia Müller");
      await inquiryPage.getByLabel("Wofür ist deine Website?", { exact: true }).selectOption("hobby");
      await inquiryPage.getByLabel("Was möchtest du zeigen?", { exact: true }).fill("Ich möchte meine Zeichnungen & Bilder auf einer persönlichen Website zeigen.");
      await inquiryPage.getByRole("button", { name: "Anfrage vorbereiten" }).click();
      console.log(`CHECK ${engine}: prepared inquiry and clipboard`);
      const draft = inquiryPage.locator("[data-request-preview]");
      await draft.waitFor();
      const emailLink = new URL(await inquiryPage.locator("[data-prepared-mail]").getAttribute("href"));
      assert.equal(emailLink.pathname, "ich.der.programmer@gmail.com");
      assert.match(emailLink.searchParams.get("body"), /Mia Müller/);
      assert.match(emailLink.searchParams.get("subject"), /350 € einmalig/);
      assert.match(await inquiryPage.getByRole("status").textContent(), /Versendet wird erst/);
      await inquiryPage.getByRole("button", { name: "Anfragetext kopieren" }).click();
      await inquiryPage.waitForFunction(() => /kopiert|markiert/.test(document.querySelector("[data-inquiry-status]").textContent));
      await inquiryPage.getByLabel("Dein Name", { exact: true }).fill("Neuer Name");
      assert.equal(await draft.isVisible(), false);
      assert.deepEqual(submissions, []);
      assert.deepEqual(inquiryErrors, []);
      await inquiryContext.close();
      const plainOffer = await browser.newContext({ javaScriptEnabled: false, viewport: {width:320, height:850} });
      const plainOfferPage = await plainOffer.newPage();
      plainOfferPage.setDefaultTimeout(20000);
      await plainOfferPage.goto(url("angebot.html"));
      assert.equal(await plainOfferPage.getByRole("link", {name:"ich.der.programmer@gmail.com", exact:true}).count(), 1);
      assert.equal(await plainOfferPage.locator(".service-form").isVisible(), false);
      await noOverflow(plainOfferPage);
      await plainOffer.close();
      console.log(`PASS ${engine}: catalogue layout, QR, static rendering and persistent colour scheme`);
    } finally {
      await browser.close();
    }
  }
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
}
