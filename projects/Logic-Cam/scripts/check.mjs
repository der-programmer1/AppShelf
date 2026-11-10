import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const errors = [];
function exists(file) {
  if (!fs.existsSync(path.join(root, file)))
    errors.push(`Missing local file: ${file}`);
}
function files(dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
for (const file of [
  ...files("js"),
  ...files("tests"),
  "sw.js",
  "scripts/check.mjs",
]) {
  const checked = spawnSync(
    process.execPath,
    ["--check", path.join(root, file)],
    { encoding: "utf8" },
  );
  if (checked.status !== 0) errors.push(`${file}: ${checked.stderr}`);
  if (file.startsWith("js"))
    for (const match of fs
      .readFileSync(path.join(root, file), "utf8")
      .matchAll(/(?:from\s*|import\()\s*['"](\.[^'"]+)['"]/g))
      exists(path.normalize(path.join(path.dirname(file), match[1])));
}
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
  idSet = new Set(ids);
if (ids.length !== idSet.size) errors.push("Duplicate HTML ids");
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (!/^(https?:|data:|\.\/$)/.test(match[1])) exists(match[1]);
}
for (const match of html.matchAll(/<use href="#([^"]+)"/g))
  if (!idSet.has(match[1])) errors.push(`Missing SVG symbol: ${match[1]}`);
for (const match of fs
  .readFileSync(path.join(root, "js/app.js"), "utf8")
  .matchAll(/\$\(['"]([^'"]+)['"]\)/g))
  if (!idSet.has(match[1])) errors.push(`Missing HTML control: ${match[1]}`);
const sandbox = { self: { addEventListener() {} } };
vm.runInNewContext(
  fs.readFileSync(path.join(root, "sw.js"), "utf8") +
    "\nglobalThis.assets=ASSETS;",
  sandbox,
);
for (const asset of sandbox.assets)
  exists(asset === "./" ? "index.html" : asset);
for (const json of ["package.json", "manifest.webmanifest"]) {
  try {
    JSON.parse(fs.readFileSync(path.join(root, json), "utf8"));
  } catch (error) {
    errors.push(`${json}: ${error.message}`);
  }
}
exists("vendor/OPENCV-LICENSE.txt");
exists("LICENSE");
exists(".nojekyll");
if (fs.statSync(path.join(root, "vendor/opencv.js")).size < 1000000)
  errors.push("OpenCV bundle is unexpectedly small");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Checked ${ids.length} HTML ids, all module imports, local links, bundled OpenCV, JSON, and ${sandbox.assets.length} offline assets. JavaScript syntax valid.`,
);
