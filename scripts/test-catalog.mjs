import { readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(process.execPath, [path.join(root, "scripts", "build-catalog.mjs"), "--out", "dist-test"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, CI: "true" },
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
const validDownloadHref = (href) => href.startsWith("downloads/") || /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\//.test(href);
if (!first.files.every((file) => validDownloadHref(file.href))) throw new Error("Download URL is neither rooted at the catalogue output nor a GitHub Release URL");
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
await rm(path.join(root, "dist-test"), { recursive: true, force: true });
console.log(`AppShelf tests passed: ${catalog.apps.length} catalogue entry(s), detail pages and screenshots verified.`);
