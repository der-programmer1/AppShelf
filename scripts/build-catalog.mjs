import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { renderHome, renderDetail } from "./render-catalog.mjs";
import { publicGithubUrl } from "./github-url.mjs";
import { loadUpdates, renderUpdates } from "./updates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteDir = path.join(root, "site");
const inboxDir = path.join(root, "apps", "inbox");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const outDir = path.resolve(root, outArg >= 0 ? args[outArg + 1] : "dist");
const allowedFiles = new Set([".apk", ".aab", ".zip", ".pdf", ".md"]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const projectTypes = new Set(["app", "web-app", "game", "tool"]);
const repository = process.env.GITHUB_REPOSITORY || "der-programmer1/AppShelf";
const repositoryUrl = `https://github.com/${repository}`;
const publishReleaseAssets = process.env.CI === "true" && Boolean(process.env.GITHUB_REPOSITORY);

const githubPagesBaseUrl = (value) => {
  const [owner, repo] = value.split("/", 2);
  if (!owner || !repo) return "";
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${repo}`
    : `https://${owner}.github.io/${repo}`;
};

const pagesBaseUrl = String(process.env.PAGES_BASE_URL || githubPagesBaseUrl(process.env.GITHUB_REPOSITORY || "") || "http://localhost:8080")
  .trim().replace(/\/+$/, "");
const makeQr = (slug, name, href) => ({
  href: `media/${encodeURIComponent(slug)}/qr-${name}.svg`,
  target: new URL(href, pagesBaseUrl + "/").href,
});

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
const releaseHref = (slug, version, filename) => {
  const tag = encodeURIComponent(`app-${slug}-v${version}`);
  if (publishReleaseAssets) return `${repositoryUrl}/releases/download/${tag}/${encodeURIComponent(filename)}`;
  return `downloads/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
};

async function collectFiles(dir, demoDirName, relative = "") {
  const entries = await readdir(path.join(dir, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.name === "app.json" || entry.name === "screenshots" || entry.name === "demo" || entry.name === demoDirName || entry.name.startsWith(".")) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await collectFiles(dir, demoDirName, next));
    else if (allowedFiles.has(path.extname(entry.name).toLowerCase())) result.push(next);
  }
  return result;
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function readApp(dirName) {
  const dir = path.join(inboxDir, dirName);
  const manifestPath = path.join(dir, "app.json");
  const manifest = await exists(manifestPath) ? await readJson(manifestPath) : {};
  if (manifest.status === "draft") return null;
  const name = String(manifest.name || dirName).trim();
  const slug = String(manifest.slug || dirName).trim();
  if (!slugPattern.test(slug)) throw new Error(`Invalid slug for ${dirName}: ${slug}`);
  const githubUrl = publicGithubUrl(manifest, slug);
  const projectType = String(manifest.projectType || "app").trim();
  if (!projectTypes.has(projectType)) throw new Error(`Invalid projectType for ${dirName}: ${projectType}`);
  const description = String(manifest.description || await readDescription(dir)).trim();
  const cardDescription = manifest.cardDescription ?? description;
  if (typeof cardDescription !== "string" || !cardDescription.trim() || /[\r\n]/.test(cardDescription)) {
    throw new Error(`${slug}: cardDescription must be a single line of text`);
  }
  const version = String(manifest.version || "0.1.0");
  const demoDirName = String(manifest.demoDir || (projectType === "web-app" ? "demo" : "")).trim();
  if (demoDirName && !/^[a-z0-9][a-z0-9_-]*$/i.test(demoDirName)) throw new Error(`${slug}: invalid demo directory`);
  const demoDir = demoDirName ? path.join(dir, demoDirName) : "";
  const hasDemo = Boolean(demoDir && await exists(path.join(demoDir, "index.html")));
  const demoHref = hasDemo ? `apps/${encodeURIComponent(slug)}/demo/` : "";
  const iconName = hasDemo && await exists(path.join(demoDir, "icon.svg")) ? "icon.svg" : "";
  const techStack = manifest.techStack ?? [];
  if (!Array.isArray(techStack) || techStack.some((tech) => typeof tech !== "string" || !tech.trim() || tech.length > 36)) {
    throw new Error(`${slug}: techStack must contain short technology names`);
  }
  const files = [];
  let apkCount = 0;
  for (const relative of (await collectFiles(dir, demoDirName)).sort()) {
    const filename = path.basename(relative);
    const kind = kindFor(filename);
    const href = releaseHref(slug, version, filename);
    const file = { filename, relative: relative.split(path.sep).join("/"), kind, href };
    if (kind === "apk") {
      file.sha256 = await sha256(path.join(dir, relative));
      file.qrCode = makeQr(slug, `apk-${++apkCount}`, href);
    }
    files.push(file);
  }
  const screenshots = [];
  const screenshotDir = path.join(dir, "screenshots");
  if (await exists(screenshotDir)) {
    for (const entry of await readdir(screenshotDir, { withFileTypes: true })) {
      const file = entry.name;
      if (!entry.isFile() || !/\.(png|jpe?g|webp|svg)$/i.test(file)) continue;
      screenshots.push({ filename: file, href: `media/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`, alt: `${name} Screenshot` });
    }
  }
  const preview = manifest.preview === undefined ? screenshots[0] : screenshots.find((shot) => shot.filename === manifest.preview);
  if (!preview) throw new Error(`${slug}: published projects require a valid screenshot preview`);
  const manifestStat = await stat(manifestPath).catch(() => stat(dir));
  const updatedAt = manifest.updatedAt || manifestStat.mtime.toISOString();
  return {
    id: slug,
    slug,
    name,
    projectType,
    version,
    description,
    cardDescription: cardDescription.trim(),
    category: deriveCategory(manifest, description),
    tags: Array.isArray(manifest.tags) ? manifest.tags.map(String) : [],
    platform: Array.isArray(manifest.platform) ? manifest.platform.map(String) : [],
    status: manifest.status || "published",
    updatedAt,
    notes: manifest.notes || "",
    webDescription: manifest.webDescription || "",
    techStack: [...new Set(techStack.map((tech) => tech.trim()))],
    ...(githubUrl ? { githubUrl } : {}),
    preview,
    qrCode: makeQr(slug, "app-page", `apps/${encodeURIComponent(slug)}/`),
    demoHref,
    iconHref: iconName ? demoHref + iconName : "",
    demoQrCode: hasDemo ? makeQr(slug, "web", demoHref) : null,
    demoSourceDir: hasDemo ? demoDir : "",
    files,
    screenshots,
  };
}

async function copyLocalAssets(apps) {
  for (const app of apps) {
    const sourceDir = path.join(inboxDir, app.slug);
    const targetDir = path.join(outDir, "downloads", app.slug);
    if (!publishReleaseAssets || process.env.COPY_BINARIES === "1") {
      await mkdir(targetDir, { recursive: true });
      for (const file of app.files) await cp(path.join(sourceDir, file.relative), path.join(targetDir, file.filename));
    }
    const screenshotDir = path.join(sourceDir, "screenshots");
    const targetScreens = path.join(outDir, "media", app.slug);
    await mkdir(targetScreens, { recursive: true });
    for (const shot of app.screenshots) await cp(path.join(screenshotDir, shot.filename), path.join(targetScreens, shot.filename));
    const qrCodes = [app.qrCode, app.demoQrCode, ...app.files.map((file) => file.qrCode)].filter(Boolean);
    for (const code of qrCodes) {
      const svg = await QRCode.toString(code.target, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 320 });
      await writeFile(path.join(outDir, code.href), svg, "utf8");
    }
    if (app.demoSourceDir) {
      await cp(app.demoSourceDir, path.join(outDir, "apps", app.slug, "demo"), { recursive: true });
    }
  }
}

const generatedAt = new Date().toISOString();
const homeTemplate = await readFile(path.join(siteDir, "index.html"), "utf8");
const appPageTemplate = await readFile(path.join(siteDir, "app.html"), "utf8");
const entries = (await readdir(inboxDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
const apps = [];
for (const entry of entries) {
  const app = await readApp(entry.name);
  if (app) apps.push(app);
}
apps.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || a.name.localeCompare(b.name, "de"));
const publicApps = apps.map(({ demoSourceDir, ...app }) => app);
const updates = await loadUpdates(path.join(siteDir, "updates.json"));
const publishedSlugs = new Set(publicApps.map((app) => app.slug));
for (const entry of updates.entries) {
  if (entry.href !== "updates/" && !publishedSlugs.has(entry.appSlug)) {
    throw new Error(`Updates link points to an unpublished app: ${entry.appSlug}`);
  }
}
const historyTemplate = await readFile(path.join(siteDir, "updates.html"), "utf8");
const home = renderHome(homeTemplate.replace("<!-- LATEST_UPDATE -->", () => renderUpdates(updates.entries, { latest: true })), publicApps);
const history = historyTemplate.replace("<!-- UPDATES_HISTORY -->", () => renderUpdates(updates.entries));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(path.join(siteDir, "assets"), path.join(outDir, "assets"), { recursive: true });
await writeFile(path.join(outDir, "index.html"), home, "utf8");
await mkdir(path.join(outDir, "updates"), { recursive: true });
await writeFile(path.join(outDir, "updates", "index.html"), history, "utf8");
await writeFile(path.join(outDir, "updates.json"), JSON.stringify({ ...updates, generatedAt }, null, 2) + "\n", "utf8");
await copyLocalAssets(apps);
for (const app of apps) {
  const pageDir = path.join(outDir, "apps", app.slug);
  await mkdir(pageDir, { recursive: true });
  await writeFile(path.join(pageDir, "index.html"), renderDetail(appPageTemplate, app), "utf8");
}
const catalog = { schemaVersion: 2, generatedAt, count: publicApps.length, apps: publicApps };
await writeFile(path.join(outDir, "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
await writeFile(path.join(outDir, "build-report.json"), JSON.stringify({ generatedAt: catalog.generatedAt, apps: publicApps.map((app) => ({ slug: app.slug, projectType: app.projectType, files: app.files.length, screenshots: app.screenshots.length, demo: Boolean(app.demoHref) })) }, null, 2), "utf8");
console.log(`AppShelf catalog built: ${publicApps.length} published project(s) -> ${outDir}`);
