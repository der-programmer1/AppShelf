import { readdir, readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inboxDir = path.join(root, "apps", "inbox");

const exists = async (file) => {
  try { await stat(file); return true; } catch { return false; }
};
const fail = (message) => { throw new Error(`Project artifact validation failed: ${message}`); };

if (!(await exists(inboxDir))) fail("apps/inbox is missing");

const folders = (await readdir(inboxDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory());

for (const folder of folders) {
  const dir = path.join(inboxDir, folder.name);
  const manifestPath = path.join(dir, "app.json");
  if (!(await exists(manifestPath))) continue;

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.status !== "published" || folder.name === "_template") continue;

  const files = (await readdir(dir, { recursive: true }))
    .filter((file) => !file.includes("screenshots/") && !file.includes("demo/") && !file.endsWith("app.json"));
  const apkFiles = files.filter((file) => file.toLowerCase().endsWith(".apk"));
  const sourceArchives = files.filter((file) => file.toLowerCase().endsWith(".zip"));

  if ((manifest.platform || []).some((platform) => /android/i.test(platform))) {
    if (!apkFiles.length) fail(`${folder.name} is an Android project without an APK`);
    if (!sourceArchives.length) fail(`${folder.name} is an Android project without a source ZIP`);
  }

  for (const relative of [...apkFiles, ...sourceArchives]) {
    const file = path.join(dir, relative);
    const details = await stat(file);
    if (details.size < 1024) fail(`${folder.name}/${relative} is empty or suspiciously small`);

    const archiveCheck = spawnSync("unzip", ["-tq", file], { encoding: "utf8" });
    if (archiveCheck.status !== 0) {
      fail(`${folder.name}/${relative} is not a readable ZIP archive`);
    }
  }

  for (const relative of apkFiles) {
    const file = path.join(dir, relative);
    const listing = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" });
    if (listing.status !== 0 || !listing.stdout.split(/\r?\n/).includes("AndroidManifest.xml")) {
      fail(`${folder.name}/${relative} does not contain AndroidManifest.xml`);
    }
  }
}

console.log(`Project artifacts validated for ${folders.length} project folder(s).`);
