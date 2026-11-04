import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publicGithubUrl } from "./github-url.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inboxDir = path.join(root, "apps", "inbox");
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const projectTypes = new Set(["app", "web-app", "game", "tool"]);
const statuses = new Set(["published", "draft"]);
const downloadExtensions = new Set([".apk", ".aab", ".zip", ".pdf", ".md"]);
const screenshotPattern = /\.(png|jpe?g|webp|svg)$/i;

const exists = async (file) => {
  try { await stat(file); return true; } catch { return false; }
};
const fail = (message) => { throw new Error(`Catalogue validation failed: ${message}`); };

if (!(await exists(inboxDir))) fail("apps/inbox is missing");

const folders = (await readdir(inboxDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory());
const slugs = new Set();

for (const folder of folders) {
  const dir = path.join(inboxDir, folder.name);
  const manifestPath = path.join(dir, "app.json");
  if (!(await exists(manifestPath))) fail(`${folder.name} is missing app.json`);

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    fail(`${folder.name}/app.json is not valid JSON: ${error.message}`);
  }

  const slug = String(manifest.slug || folder.name).trim();
  const projectType = String(manifest.projectType || "app").trim();
  const status = String(manifest.status || "published").trim();
  if (folder.name !== "_template" && slug !== folder.name) fail(`${folder.name} must use the same slug in app.json`);
  if (!slugPattern.test(slug)) fail(`${folder.name} has an invalid slug: ${slug}`);
  publicGithubUrl(manifest, slug);
  if (status !== "draft" && slugs.has(slug)) fail(`duplicate slug: ${slug}`);
  if (status !== "draft") slugs.add(slug);
  if (!String(manifest.name || "").trim()) fail(`${slug} is missing name`);
  if (!String(manifest.version || "").trim()) fail(`${slug} is missing version`);
  if (!String(manifest.description || "").trim()) fail(`${slug} is missing description`);
  if (!projectTypes.has(projectType)) fail(`${slug} has invalid projectType: ${projectType}`);
  if (!statuses.has(status)) fail(`${slug} has invalid status: ${status}`);
  if (!Array.isArray(manifest.tags) || !manifest.tags.length) fail(`${slug} needs at least one tag`);
  if (!Array.isArray(manifest.platform) || !manifest.platform.length) fail(`${slug} needs at least one platform`);
  if (!(await exists(path.join(dir, "README.md")))) fail(`${slug} is missing README.md`);

  const screenshotsDir = path.join(dir, "screenshots");
  const screenshots = await exists(screenshotsDir)
    ? (await readdir(screenshotsDir, { withFileTypes: true })).filter((entry) => entry.isFile() && screenshotPattern.test(entry.name))
    : [];
  if (status === "published" && !screenshots.length) fail(`${slug} needs at least one screenshot before publishing`);
  if (manifest.preview !== undefined && !screenshots.some((entry) => entry.name === manifest.preview)) fail(`${slug} has an invalid preview file`);

  const demoName = String(manifest.demoDir || "demo");
  if (projectType === "web-app" || manifest.demoDir) {
    if (manifest.demoDir && !/^[a-z0-9][a-z0-9_-]*$/i.test(manifest.demoDir)) fail(`${slug} has an invalid web-app directory`);
    const demoDir = path.join(dir, demoName);
    if (!(await exists(path.join(demoDir, "index.html")))) {
      fail(`${slug} has a demo directory but no demo/index.html`);
    }
  }

  const files = await readdir(dir, { recursive: true });
  const invalidDownloads = files.filter((relative) => {
    const file = relative.split(path.sep).join("/");
    const topLevel = file.split("/")[0];
    if (["screenshots", "demo", demoName].includes(topLevel) || file.endsWith("app.json") || file.startsWith(".")) return false;
    return !downloadExtensions.has(path.extname(file).toLowerCase());
  });
  if (invalidDownloads.length) fail(`${slug} contains unsupported downloadable file(s): ${invalidDownloads.join(", ")}`);
}

console.log(`Catalogue validation passed: ${folders.length} project folder(s), ${slugs.size} unique slug(s).`);
