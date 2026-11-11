import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inbox = path.join(root, "apps", "inbox");
const allowed = /\.(apk|aab|zip|pdf|md)$/i;

const run = (args, allowFailure = false) => {
  const result = spawnSync("gh", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr.trim() || `gh ${args.join(" ")} failed`);
  return result;
};

const folders = (await readdir(inbox, { withFileTypes: true })).filter((entry) => entry.isDirectory());
for (const folder of folders) {
  const dir = path.join(inbox, folder.name);
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(dir, "app.json"), "utf8")); } catch { continue; }
  if (manifest.status === "draft") continue;
  const slug = manifest.slug || folder.name;
  const version = manifest.version || "0.1.0";
  const files = (await readdir(dir, { recursive: true })).filter((file) => allowed.test(file) && !file.includes("screenshots/")).map((file) => path.join(dir, file));
  if (!files.length) continue;
  const tag = `app-${slug}-v${version}`;
  const title = `${manifest.name || slug} ${version}`;
  const existing = run(["release", "view", tag], true).status === 0;
  if (!existing) {
    run(["release", "create", tag, ...files, "--title", title, "--notes", `Automatisch veröffentlichte Dateien für ${manifest.name || slug}.`, "--target", process.env.GITHUB_SHA || "main"]);
    console.log(`Created release ${tag}`);
  } else {
    for (const file of files) run(["release", "upload", tag, file, "--clobber"]);
    console.log(`Updated release ${tag}`);
  }
}

// Remove the specific public distribution for the retired app after deploying from main.
if (!folders.some((folder) => folder.name === "gymdelay")) {
  const tag = "app-gymdelay-v1.0.0";
  const existing = run(["release", "view", tag, "--json", "tagName"], true);
  if (existing.status === 0) {
    run(["release", "delete", tag, "--yes", "--cleanup-tag"]);
    console.log(`Retired release ${tag}`);
  } else if (!/release not found/i.test(existing.stderr)) {
    throw new Error(existing.stderr.trim() || `Could not check release ${tag}`);
  }
}
