import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");
const inboxDir = path.join(root, "apps", "inbox");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const outDir = path.resolve(root, outArg >= 0 ? args[outArg + 1] : "dist");
const allowedFiles = new Set([".apk", ".aab", ".zip", ".pdf", ".md"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const exists = async (file) => { try { await stat(file); return true; } catch { return false; } };
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const cleanText = (value) => String(value || "").replace(/^\s*#+\s*/gm, "").replace(/[`*_>#]/g, "").replace(/\r/g, "").trim();
const readDescription = async (dir) => {
  const readme = path.join(dir, "README.md");
  if (!(await exists(readme))) return "Noch keine Beschreibung hinterlegt.";
  const text = cleanText(await readFile(readme, "utf8"));
  return text.split(/\n\s*\n/).find(Boolean)?.slice(0, 420) || "Noch keine Beschreibung hinterlegt.";
};
const deriveCategory = (manifest, text) => {
  if (manifest.category) return manifest.category;
  const haystack = `${manifest.name || ""} ${text}`.toLocaleLowerCase("de-DE");
  if (/timer|fokus|zeit/.test(haystack)) return "Produktivität";
  if (/liste|tracker|haushalt|alltag|erinner/.test(haystack)) return "Alltag";
  if (/spiel|game|gameplay/.test(haystack)) return "Games";
  if (/kamera|foto|video|bild/.test(haystack)) return "Medien";
  return "Tools";
};
const kindFor = (file) => {
  const lower = file.toLocaleLowerCase();
  if (lower.endsWith(".apk")) return "apk";
  if (lower.endsWith(".aab")) return "aab";
  if (lower.endsWith(".zip")) return "source";
  if (lower.endsWith(".md")) return "readme";
  return "other";
};
const encodePath = (value) => encodeURIComponent(value).replaceAll("%2F", "/");
const releaseHref = (slug, version, filename) => {
  const repo = process.env.GITHUB_REPOSITORY;
  if (process.env.CI === "true" && repo) return `https://github.com/${repo}/releases/download/app-${slug}-v${version}/${encodeURIComponent(filename)}`;
  return `downloads/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
};

async function collectFiles(dir, relative = "") {
  const entries = await readdir(path.join(dir, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name === "app.json" || entry.name === "screenshots" || entry.name.startsWith(".")) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(dir, next));
    else if (allowedFiles.has(path.extname(entry.name).toLowerCase())) result.push(next);
  }
  return result;
}

async function readApp(dirName) {
  const dir = path.join(inboxDir, dirName);
  const manifestPath = path.join(dir, "app.json");
  const manifest = await exists(manifestPath) ? await readJson(manifestPath) : {};
  const name = String(manifest.name || dirName).trim();
  const slug = String(manifest.slug || dirName).trim();
  if (!slugPattern.test(slug)) throw new Error(`Invalid slug for ${dirName}: ${slug}`);
  const description = String(manifest.description || await readDescription(dir)).trim();
  const version = String(manifest.version || "0.1.0");
  const files = [];
  for (const relative of await collectFiles(dir)) {
    const filename = path.basename(relative);
    files.push({ filename, relative, kind: kindFor(filename), href: releaseHref(slug, version, filename) });
  }
  const screenshots = [];
  const screenshotDir = path.join(dir, "screenshots");
  if (await exists(screenshotDir)) {
    for (const file of await readdir(screenshotDir)) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(file)) continue;
      screenshots.push({ filename: file, href: `media/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`, alt: `${name} Screenshot` });
    }
  }
  const manifestStat = await stat(manifestPath).catch(() => stat(dir));
  const updatedAt = manifest.updatedAt || manifestStat.mtime.toISOString();
  return {
    id: slug,
    slug,
    name,
    version,
    description,
    category: deriveCategory(manifest, description),
    tags: Array.isArray(manifest.tags) ? manifest.tags.map(String) : [],
    platform: Array.isArray(manifest.platform) ? manifest.platform.map(String) : [],
    status: manifest.status || "published",
    updatedAt,
    notes: manifest.notes || "",
    files,
    screenshots,
  };
}

async function copyLocalAssets(apps) {
  for (const app of apps) {
    const sourceDir = path.join(inboxDir, app.slug);
    const targetDir = path.join(outDir, "downloads", app.slug);
    if (process.env.CI !== "true" || process.env.COPY_BINARIES === "1") {
      await mkdir(targetDir, { recursive: true });
      for (const file of app.files) await cp(path.join(sourceDir, file.relative), path.join(targetDir, file.filename));
    }
    const screenshotDir = path.join(sourceDir, "screenshots");
    if (await exists(screenshotDir)) {
      const targetScreens = path.join(outDir, "media", app.slug);
      await mkdir(targetScreens, { recursive: true });
      for (const shot of app.screenshots) await cp(path.join(screenshotDir, shot.filename), path.join(targetScreens, shot.filename));
    }
  }
}

const appPageTemplate = await readFile(path.join(siteDir, "app.html"), "utf8");
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(siteDir, outDir, { recursive: true });
const entries = (await readdir(inboxDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
const apps = [];
for (const entry of entries) {
  const app = await readApp(entry.name);
  if (app.status !== "draft") apps.push(app);
}
apps.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name, "de"));
await copyLocalAssets(apps);
await rm(path.join(outDir, "app.html"), { force: true });
for (const app of apps) {
  const pageDir = path.join(outDir, "apps", app.slug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), appPageTemplate.replaceAll("__APP_SLUG__", app.slug), "utf8");
}
const catalog = { schemaVersion: 1, generatedAt: new Date().toISOString(), count: apps.length, apps };
await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
await writeFile(path.join(outDir, "build-report.json"), JSON.stringify({ generatedAt: catalog.generatedAt, apps: apps.map((app) => ({ slug: app.slug, files: app.files.length, screenshots: app.screenshots.length })) }, null, 2), "utf8");
console.log(`AppShelf catalog built: ${apps.length} published app(s) -> ${outDir}`);
