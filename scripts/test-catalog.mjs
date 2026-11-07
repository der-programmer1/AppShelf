import { access, readFile, rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { publicGithubUrl } from "./github-url.mjs";
import { renderHome, renderDetail } from "./render-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "scripts", "build-catalog.mjs"), "--out", "dist-test"], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...process.env,
    CI: "true",
    CF_PAGES: "1",
    CF_PAGES_URL: "https://preview.example.test",
    GITHUB_REPOSITORY: "example/private-catalog",
    PAGES_BASE_URL: "",
  },
});
if (result.status !== 0) throw new Error(result.stderr || result.stdout);
const catalog = JSON.parse(await readFile(path.join(root, "dist-test", "catalog.json"), "utf8"));
if (!catalog.apps.length) throw new Error("Expected at least one catalogue entry");
if (catalog.schemaVersion !== 2) throw new Error("Catalogue schema version is not current");
if (catalog.apps.some((app) => !["app", "web-app", "game", "tool"].includes(app.projectType))) throw new Error("Catalogue contains an invalid project type");
if (catalog.apps.some((app) => Object.hasOwn(app, "demoSourceDir"))) throw new Error("Catalogue leaked a local demo source path");
const first = catalog.apps[0];
if (!first.slug || !first.name || !first.description) throw new Error("Catalogue entry is incomplete");
if (!first.screenshots.length) throw new Error("Screenshot asset was not indexed");
if (!first.screenshots[0].href.startsWith("media/")) throw new Error("Screenshot URL is not rooted at the catalogue output");
await access(path.join(root, "dist-test", "404.html"));
if (!first.qrCode?.href.startsWith("media/") || !first.qrCode.target.startsWith("http")) throw new Error("QR metadata is incomplete");
const page = await readFile(path.join(root, "dist-test", "apps", first.slug, "index.html"), "utf8");
if (!page.includes(first.slug)) throw new Error("Detail page did not receive its slug");
const screenshot = await readFile(path.join(root, "dist-test", "media", first.slug, first.screenshots[0].filename));
const isScreenshot = screenshot.toString("utf8").includes("<svg")
  || screenshot.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  || screenshot.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  || (screenshot.toString("ascii", 0, 4) === "RIFF" && screenshot.toString("ascii", 8, 12) === "WEBP");
if (!isScreenshot) throw new Error("Screenshot asset was not copied into the build");
const qr = await readFile(path.join(root, "dist-test", "media", first.slug, "qr-app-page.svg"), "utf8");
if (!qr.includes("<svg") || !qr.includes("viewBox")) throw new Error("QR asset was not generated into the build");

const out = path.join(root, "dist-test");
const home = await readFile(path.join(out, "index.html"), "utf8");
assert.equal((home.match(/<article class="app-card"/g) || []).length, catalog.count);
assert.doesNotMatch(home, /Katalog wird geladen|<nav|<footer|updates\/|<!-- [A-Z_]+ -->/);
assert.equal((home.match(/<script\b/g) || []).length, 1);
assert.ok(home.includes('<script src="assets/theme.js"></script>'));
assert.ok(home.indexOf('src="assets/theme.js"') < home.indexOf('href="assets/style.css"'));
await access(path.join(out, "assets/theme.js"));
for (const removed of ["updates", "updates.json", "assets/filters.js"]) {
  await assert.rejects(access(path.join(out, removed)), { code: "ENOENT" });
}
for (const app of catalog.apps) {
  assert.equal(app.qrCode.target, `https://preview.example.test/apps/${app.slug}/`);
  for (const file of app.files) {
    assert.ok(file.href.startsWith(`downloads/${app.slug}/`));
    await access(path.join(out, decodeURIComponent(file.href)));
    if (file.qrCode) assert.equal(file.qrCode.target, `https://preview.example.test/${file.href}`);
  }
  if (app.iconHref) await access(path.join(out, decodeURIComponent(app.iconHref)));
  const manifest = JSON.parse(await readFile(path.join(root, "apps", "inbox", app.slug, "app.json"), "utf8"));
  const githubUrl = publicGithubUrl(manifest, app.slug);
  assert.equal(app.githubUrl, githubUrl || undefined);
  assert.ok(!Object.hasOwn(app, "sourceUrl"));
  assert.ok(home.includes(`src="${app.preview.href}"`));
  await access(path.join(out, app.preview.href));
  if (githubUrl) assert.ok(home.includes(`href="${githubUrl}">Quellcode auf GitHub`));
  const preferredApk = app.files.find((file) => file.kind === "apk" && !file.filename.toLowerCase().endsWith("-unsigned.apk"));
  if (preferredApk) assert.ok(home.includes(`href="${preferredApk.href}" download>APK laden`));
  const detail = await readFile(path.join(out, "apps", app.slug, "index.html"), "utf8");
  assert.ok(detail.includes(`<h1>${app.name}</h1>`));
  assert.equal(detail.includes("Quellcode auf GitHub"), Boolean(githubUrl));
  assert.doesNotMatch(detail, /<!-- [A-Z_]+ -->/);
  assert.equal((detail.match(/<script\b/g) || []).length, 1);
  assert.ok(detail.includes('<script src="../../assets/theme.js"></script>'));
  for (const file of app.files.filter((file) => file.kind === "apk")) {
    const bytes = await readFile(path.join(root, "apps", "inbox", app.slug, file.relative));
    assert.equal(file.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.ok(detail.includes(`<code>${file.sha256}</code>`));
    assert.ok(file.qrCode.target.endsWith("/" + encodeURIComponent(file.filename)));
    assert.ok(detail.includes(file.qrCode.href));
  }
  const codes = [app.demoQrCode, ...app.files.map((file) => file.qrCode)].filter(Boolean);
  for (const code of codes) {
    const svg = await readFile(path.join(out, code.href), "utf8");
    assert.equal(svg, await QRCode.toString(code.target, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 320 }));
  }
  if (app.demoHref) {
    assert.ok(app.demoQrCode.target.endsWith("/" + app.demoHref));
    assert.ok(detail.includes(app.demoHref));
  }
}

const publicRepo = "https://github.com/example/public-project";
const privateRepo = "https://github.com/example/private-project";
const homeTemplate = await readFile(path.join(root, "site", "index.html"), "utf8");
const detailTemplate = await readFile(path.join(root, "site", "app.html"), "utf8");
for (const [manifest, expected] of [
  [{}, ""],
  [{ sourcePath: "projects/Legacy", repositoryUrl: publicRepo }, ""],
  [{ githubUrl: privateRepo, githubPrivate: true }, ""],
  [{ githubUrl: publicRepo }, publicRepo],
]) {
  const githubUrl = publicGithubUrl(manifest, first.slug);
  assert.equal(githubUrl, expected);
  const app = { ...first, githubUrl };
  for (const markup of [renderHome(homeTemplate, [app]), renderDetail(detailTemplate, app)]) {
    assert.equal(markup.includes("Quellcode auf GitHub"), Boolean(expected));
    assert.equal(markup.includes(`href="${publicRepo}"`), Boolean(expected));
    assert.ok(!markup.includes(privateRepo));
  }
}
for (const bad of ["javascript:alert(1)", "https://github.com.evil.invalid/a/b", "https://github.com/example/.."]) {
  assert.throws(() => publicGithubUrl({ githubUrl: bad }, first.slug), /githubUrl/);
}
assert.throws(() => publicGithubUrl({ githubPrivate: "true", githubUrl: privateRepo }, first.slug), /githubPrivate/);

await rm(path.join(root, "dist-test"), { recursive: true, force: true });
console.log(`AppShelf tests passed: ${catalog.count} static projects, repository visibility, QR targets and APK checksums verified.`);
