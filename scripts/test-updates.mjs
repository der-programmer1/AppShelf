import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUpdates, loadUpdates, renderUpdates } from "./updates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = {
  date: "2026-11-02", category: "Verbesserung", title: "Ein klarerer Einstieg",
  summary: "Die Änderung erklärt den ersten Schritt.", details: "Das Beispiel lässt sich bewusst auswählen.",
  app: "LeistenPlan", appSlug: "leistenplan", version: "1.0.1", href: "apps/leistenplan/", linkLabel: "App ansehen",
};
const fixture = (...entries) => ({ schemaVersion: 1, entries });

test("accepts a newest-first history, same-day changes and an empty history", () => {
  for (const data of [fixture(), fixture(entry), fixture(entry, { ...entry, title: "Weiterer Schritt" }), fixture(entry, { ...entry, date: "2026-11-01" })]) assert.equal(validateUpdates(data), data);
});

test("rejects missing or unexpected fields and the wrong schema", () => {
  for (const key of Object.keys(entry)) {
    const incomplete = { ...entry }; delete incomplete[key];
    assert.throws(() => validateUpdates(fixture(incomplete)), /needs/);
  }
  for (const data of [null, [], { schemaVersion: 2, entries: [] }, { schemaVersion: 1, entries: {} }, { ...fixture(), generatedAt: "manual" }, fixture({ ...entry, unexpected: "private value" }), fixture(null)]) assert.throws(() => validateUpdates(data), /Updates validation failed/);
});

test("requires real ISO calendar dates and newest-first ordering", () => {
  for (const date of ["2026-02-29", "2026-02-30", "2026-13-01", "02.11.2026", "2026-1-02"]) assert.throws(() => validateUpdates(fixture({ ...entry, date })), /date/);
  assert.doesNotThrow(() => validateUpdates(fixture({ ...entry, date: "2024-02-29" })));
  assert.throws(() => validateUpdates(fixture({ ...entry, date: "2026-11-01" }, entry)), /newest first/);
});

test("rejects duplicate updates and invented categories", () => {
  assert.throws(() => validateUpdates(fixture(entry, { ...entry, details: "Still the same update" })), /duplicates/);
  assert.throws(() => validateUpdates(fixture({ ...entry, category: "Werbung" })), /category/);
});

test("accepts only canonical local detail and updates links", () => {
  for (const href of ["https://example.com", "//example.com", "javascript:alert(1)", "../apps/leistenplan/", "/apps/leistenplan/", "apps/other/", "apps/%2e%2e/", "apps/leistenplan/?tracking=yes", "apps/leistenplan/../../"]) assert.throws(() => validateUpdates(fixture({ ...entry, href })), /local/);
  assert.doesNotThrow(() => validateUpdates(fixture({ ...entry, app: "AppShelf", appSlug: "appshelf", href: "updates/" })));
  assert.throws(() => validateUpdates(fixture({ ...entry, appSlug: "../private" })), /appSlug/);
});

test("rejects empty values, control characters, internal paths and oversized text", () => {
  for (const title of [" ", "/workspace/private", "file:///secret", "C:\\Users\\private", "secret\nvalue", "x".repeat(601)]) assert.throws(() => validateUpdates(fixture({ ...entry, title })), /needs|internal|too long/);
});

test("renders visitor text without interpreting HTML or script attributes", () => {
  const html = renderUpdates([{ ...entry, title: '<img src=x onerror="alert(1)">', details: "<script>alert('x')</script> &" }]);
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&amp;"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
});

test("homepage shows only the newest entry and history keeps all details", () => {
  const entries = [entry, { ...entry, title: "Älteres Update", date: "2026-11-01" }];
  assert.ok(!renderUpdates(entries, { latest: true }).includes("Älteres Update"));
  assert.ok(!renderUpdates(entries, { latest: true }).includes(entry.details));
  assert.ok(renderUpdates(entries).includes(entry.details));
  assert.ok(renderUpdates(entries).includes("Älteres Update"));
  assert.match(renderUpdates([]), /Noch keine veröffentlichten Änderungen/);
});

test("malformed JSON aborts a direct Pages build before replacing previous output", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "appshelf-updates-"));
  try {
    await cp(path.join(root, "scripts"), path.join(temp, "scripts"), { recursive: true });
    await cp(path.join(root, "site"), path.join(temp, "site"), { recursive: true });
    await symlink(path.join(root, "node_modules"), path.join(temp, "node_modules"), "dir");
    await mkdir(path.join(temp, "dist"));
    await writeFile(path.join(temp, "dist", "previous.txt"), "previous build");
    await writeFile(path.join(temp, "site", "updates.json"), "{broken JSON");
    await assert.rejects(loadUpdates(path.join(temp, "site", "updates.json")), /valid JSON/);
    const run = spawnSync(process.execPath, ["scripts/build-catalog.mjs"], { cwd: temp, encoding: "utf8" });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Updates validation failed/);
    assert.equal(await readFile(path.join(temp, "dist", "previous.txt"), "utf8"), "previous build");
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test("build emits a static history, matching timestamp and working project-site links", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "appshelf-updates-build-"));
  try {
    const run = spawnSync(process.execPath, ["scripts/build-catalog.mjs", "--out", temp], { cwd: root, encoding: "utf8", env: { ...process.env, CI: "true", GITHUB_REPOSITORY: "der-programmer1/AppShelf" } });
    assert.equal(run.status, 0, run.stderr);
    const source = await loadUpdates(path.join(root, "site", "updates.json"));
    const built = JSON.parse(await readFile(path.join(temp, "updates.json"), "utf8"));
    const catalog = JSON.parse(await readFile(path.join(temp, "catalog.json"), "utf8"));
    for (const entry of source.entries) assert.ok(built.entries.some((item) => Object.keys(entry).every((key) => item[key] === entry[key])));
    assert.equal(built.automatic, true);
    assert.ok(built.entries.some((entry) => entry.source === "git"));
    assert.equal(new Set(built.entries.map((entry) => entry.id)).size, built.entries.length);
    assert.ok(Number.isFinite(Date.parse(built.generatedAt)));
    assert.equal(built.generatedAt, catalog.generatedAt);
    assert.equal(source.generatedAt, undefined);
    const home = await readFile(path.join(temp, "index.html"), "utf8");
    const history = await readFile(path.join(temp, "updates/index.html"), "utf8");
    assert.ok(home.includes('href="updates/"'));
    assert.ok(history.includes('<base href="../">'));
    assert.ok(history.includes('href="./"'));
    assert.ok(!home.includes("<!-- LATEST_UPDATE -->"));
    assert.ok(!history.includes("<!-- UPDATES_HISTORY -->"));
    assert.ok(!history.includes("<script"));
    assert.equal(new URL("assets/style.css", new URL("../", "https://example.org/AppShelf/updates/")).pathname, "/AppShelf/assets/style.css");
    for (const update of built.entries) {
      const target = path.join(temp, update.href, "index.html");
      assert.ok((await readFile(target, "utf8")).startsWith("<!doctype html>"));
    }
    const folders = await readdir(path.join(root, "apps/inbox"), { withFileTypes: true });
    const expectedSlugs = [];
    for (const folder of folders.filter((item) => item.isDirectory() && !item.name.startsWith("_") && !item.name.startsWith("."))) {
      const manifest = JSON.parse(await readFile(path.join(root, "apps/inbox", folder.name, "app.json"), "utf8"));
      if (manifest.status === "published") expectedSlugs.push(manifest.slug);
    }
    assert.deepEqual(catalog.apps.map((app) => app.slug).sort(), expectedSlugs.sort(), "building updates must preserve the published catalogue");
  } finally { await rm(temp, { recursive: true, force: true }); }
});
