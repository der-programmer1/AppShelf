import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readPublicationHistory, collectAutomaticUpdates } from "./automatic-updates.mjs";
import { renderUpdates } from "./updates.mjs";

const app = { slug: "testapp", name: "Testapp", version: "1.0.0", status: "published", description: "Eine lokale Test-App." };
const manifest = "apps/inbox/testapp/app.json";
function fixture(action) {
  const root = mkdtempSync(path.join(os.tmpdir(), "appshelf-news-git-"));
  const git = (args, env = {}) => execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (name, value) => { const file = path.join(root, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); };
  let day = 0;
  const commit = (subject = "fixture change") => { day++; git(["add", "."]); return git(["commit", "-m", subject], { GIT_AUTHOR_DATE: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`, GIT_COMMITTER_DATE: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z` }); };
  try { git(["init", "-b", "main"]); git(["config", "user.name", "AppShelf fixture"]); git(["config", "user.email", "fixture@invalid"]); return action({ root, git, write, commit, collect: (manual = [], apps = [app]) => collectAutomaticUpdates(root, apps, manual) }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test("new app and a new version appear automatically without an editorial entry", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write(manifest, { ...app, version: "1.1.0" }); commit();
  const entries = collect().filter((entry) => entry.appSlug === app.slug);
  assert.equal(entries.length, 2); assert.equal(entries[0].version, "1.1.0"); assert.equal(entries[1].category, "Neue App");
  assert.match(entries[0].summary, /1\.0\.0.*1\.1\.0/); assert.equal(entries[0].href, "apps/testapp/");
}));

test("same-version APK, guide and screenshot changes each produce real news", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write("apps/inbox/testapp/test.apk", "test bytes, not a distributed APK"); commit();
  write("apps/inbox/testapp/README.md", "Changed guide"); commit(); write("apps/inbox/testapp/screenshots/a.svg", "<svg/>"); commit();
  const entries = collect(); assert.equal(entries.length, 4); assert.match(entries[0].title, /Vorschauen/); assert.match(entries[1].title, /Anleitung/); assert.match(entries[2].summary, /Versionsnummer bleibt 1\.0\.0/);
}));

test("source-only development never claims a newly available APK", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write("projects/Testapp/app/Main.kt", "source update"); commit();
  assert.match(collect()[0].title, /Projekt weiterentwickelt/); assert.match(collect()[0].details, /nicht automatisch.*neue APK/);
}));

test("new and changed browser demos are distinguished", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write("apps/inbox/testapp/demo/index.html", "first web version"); commit(); write("apps/inbox/testapp/demo/index.html", "new web version"); commit();
  const entries = collect(); assert.equal(entries[1].category, "Web-Version"); assert.equal(entries[0].category, "Verbesserung"); assert.match(entries[0].title, /Web-App aktualisiert/);
}));

test("drafts and unmerged branch work are excluded", () => fixture(({ git, write, commit, collect }) => {
  write("README.md", "base"); commit(); git(["checkout", "-b", "draft-work"]); write(manifest, app); commit(); git(["checkout", "main"]);
  assert.ok(!collect().some((entry) => entry.appSlug === app.slug));
  write(manifest, { ...app, status: "draft" }); commit(); assert.ok(!collect([], []).some((entry) => entry.appSlug === app.slug));
}));

test("website and other repository changes update the history automatically", () => fixture(({ write, commit, collect }) => {
  write("site/index.html", "site update"); commit(); write(".github/workflows/test.yml", "workflow update"); commit(); write("README.md", "documentation"); commit();
  const entries = collect([], []); assert.equal(entries.length, 3); assert.match(entries[0].title, /Anleitung/); assert.equal(entries[1].category, "Wartung"); assert.match(entries[2].title, /Website/);
}));

test("a curated story replaces its own automatic announcement, later changes still appear", () => fixture(({ write, commit, collect }) => {
  const story = { date: "2026-10-01", category: "Neue App", title: "Eine hilfreiche neue Funktion", summary: "A story.", details: "Details.", app: app.name, appSlug: app.slug, version: app.version, href: "apps/testapp/", linkLabel: "App ansehen" };
  write(manifest, app); write("site/updates.json", { schemaVersion: 1, entries: [story] }); commit();
  assert.equal(collect([story]).filter((entry) => entry.appSlug === app.slug).length, 1);
  write("apps/inbox/testapp/README.md", "later actual change"); commit();
  assert.equal(collect([story]).filter((entry) => entry.appSlug === app.slug).length, 2);
}));

test("re-importing an app is not announced as a new app again", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write(manifest, { ...app, status: "draft" }); commit(); write(manifest, app); commit();
  assert.equal(collect().filter((entry) => entry.category === "Neue App").length, 1); assert.match(collect()[0].title, /Katalogeintrag erneuert/);
}));

test("a merged branch creates one publication event, without intermediate development entries", () => fixture(({ git, write, commit, root, collect }) => {
  write(manifest, app); commit(); git(["checkout", "-b", "feature"]); write("projects/Testapp/Main.kt", "first draft"); commit(); write("projects/Testapp/Main.kt", "finished feature"); commit(); git(["checkout", "main"]); git(["merge", "--no-ff", "feature", "-m", "Feature published"]);
  const history = readPublicationHistory(root); assert.equal(history.length, 2); assert.equal(collect().filter((entry) => entry.appSlug === app.slug).length, 2);
}));

test("rebuilding creates no duplicate stories or changed identities", () => fixture(({ write, commit, collect }) => {
  write(manifest, app); commit(); write("site/index.html", "site"); commit();
  const first = collect(); assert.deepEqual(collect(), first); assert.equal(new Set(first.map((entry) => entry.id)).size, first.length);
}));

test("a later same-day update takes precedence over the earlier editorial story", () => fixture(({ write, commit, collect, git }) => {
  const story = { date: "2026-10-01", category: "Neue App", title: "Eine neue App", summary: "A story.", details: "Details.", app: app.name, appSlug: app.slug, version: app.version, href: "apps/testapp/", linkLabel: "App ansehen" };
  write(manifest, app); write("site/updates.json", { schemaVersion: 1, entries: [story] }); commit();
  write("apps/inbox/testapp/README.md", "a later update"); commit();
  git(["commit", "--amend", "--no-edit"], { GIT_AUTHOR_DATE: "2026-10-01T18:00:00Z", GIT_COMMITTER_DATE: "2026-10-01T18:00:00Z" });
  assert.equal(collect([story])[0].source, "git"); assert.match(collect([story])[0].title, /Anleitung/);
}));

test("HTML in app metadata is escaped and raw commit subjects are never shown", () => fixture(({ write, commit, collect }) => {
  write(manifest, { ...app, name: '<img src=x onerror="alert(1)">', description: "<script>alert(1)</script>" }); commit("private internal commit subject");
  const html = renderUpdates(collect()); assert.ok(html.includes("&lt;img")); assert.ok(!html.includes("<script>")); assert.ok(!html.includes("private internal commit subject"));
}));

test("missing or shallow history fails clearly instead of inventing announcements", () => fixture(({ write, commit, root, git }) => {
  write("README.md", "base"); commit(); write("README.md", "next"); commit();
  const missing = path.join(root, "not-a-repository"); mkdirSync(missing); assert.throws(() => readPublicationHistory(os.tmpdir()), /vollständiger Historie/);
  const clone = path.join(root, "shallow-clone"); git(["clone", "--depth", "1", "file://" + root, clone]); assert.throws(() => readPublicationHistory(clone), /vollständige Git-Historie/);
}));
