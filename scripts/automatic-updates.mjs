import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const identity = (entry) => JSON.stringify(entry);
const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 16);

function git(root, args, optional = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30000 });
  if (result.status !== 0) {
    if (optional) return null;
    throw new Error("Automatische Neuigkeiten benötigen ein Git-Checkout mit vollständiger Historie (fetch-depth: 0). Git-Historie konnte nicht gelesen werden.");
  }
  return result.stdout;
}

export function readPublicationHistory(root) {
  if (git(root, ["rev-parse", "--is-shallow-repository"]).trim() !== "false") {
    throw new Error("Automatische Neuigkeiten benötigen die vollständige Git-Historie: fetch-depth: 0 oder git fetch --unshallow.");
  }
  // A merged PR appears once. Unmerged development commits never enter the public history.
  const output = git(root, ["log", "--first-parent", "--diff-merges=first-parent", "--format=%x1e%H%x00%cI", "--name-only", "-z", "--"]);
  return output.split("\x1e").filter(Boolean).map((record) => {
    const [sha, timestamp, ...names] = record.split("\0");
    const date = new Date(timestamp);
    if (!/^[a-f0-9]{40}$/.test(sha) || !Number.isFinite(date.getTime())) throw new Error("Ungültige Veröffentlichungs-Historie.");
    return { sha, timestamp: date.toISOString(), date: date.toISOString().slice(0, 10), paths: names.map((name) => name.replace(/^\n/, "")).filter(Boolean) };
  });
}

function safeText(value, fallback, limit = 600) {
  if (typeof value !== "string" || !value.trim() || /(?:file:\/\/|\/(?:workspace|home|Users|tmp)\/|[A-Za-z]:\\)/i.test(value)) return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

const normalized = (value) => String(value).toLocaleLowerCase("de-DE").replace(/[^a-z0-9]/g, "");

export function collectAutomaticUpdates(root, apps, manualEntries, { history = readPublicationHistory(root), repository = "der-programmer1/AppShelf" } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Ungültiges GitHub-Repository für Neuigkeiten.");
  const cache = new Map();
  function snapshot(sha, file) {
    if (!sha) return null;
    const key = `${sha}:${file}`;
    if (!cache.has(key)) {
      let data = null;
      try { const raw = git(root, ["show", key], true); if (raw !== null) data = JSON.parse(raw); } catch { /* A non-JSON historical file is not a published manifest. */ }
      cache.set(key, data);
    }
    return cache.get(key);
  }
  const introductions = new Map();
  for (const commit of [...history].reverse()) {
    for (const app of apps) {
      const manifestPath = `apps/inbox/${app.slug}/app.json`;
      if (introductions.has(app.slug) || !commit.paths.includes(manifestPath)) continue;
      const data = snapshot(commit.sha, manifestPath);
      if (data && data.status !== "draft") introductions.set(app.slug, commit.sha);
    }
  }
  const currentManual = new Set(manualEntries.map(identity));
  const manualPublishedAt = new Map();
  const automatic = [];
  for (const [index, commit] of history.entries()) {
    const previous = history[index + 1]?.sha;
    const sourceUrl = `https://github.com/${repository}/commit/${commit.sha}`;
    // Editorial descriptions replace only announcements written in the same publication.
    const covered = new Set();
    if (commit.paths.includes("site/updates.json")) {
      const before = new Set((snapshot(previous, "site/updates.json")?.entries || []).map(identity));
      for (const entry of snapshot(commit.sha, "site/updates.json")?.entries || []) {
        if (currentManual.has(identity(entry)) && !before.has(identity(entry))) {
          covered.add(entry.appSlug);
          if (!manualPublishedAt.has(identity(entry))) manualPublishedAt.set(identity(entry), commit.timestamp);
        }
      }
    }
    for (const app of apps) {
      if (!slugPattern.test(app.slug) || covered.has(app.slug)) continue;
      const prefix = `apps/inbox/${app.slug}/`;
      const paths = commit.paths.filter((name) => name.startsWith(prefix) || (name.startsWith("projects/") && [normalized(app.name), normalized(app.slug)].includes(normalized(name.split("/")[1]))));
      if (!paths.length) continue;
      const current = snapshot(commit.sha, prefix + "app.json");
      if (!current || current.status === "draft") continue;
      const before = snapshot(previous, prefix + "app.json");
      if (before && paths.length === 1 && paths[0] === prefix + "app.json") {
        const presentation = new Set(["preview", "techStack", "sourcePath", "repositoryUrl"]);
        const fields = new Set([...Object.keys(current), ...Object.keys(before)]);
        if ([...fields].every((field) => presentation.has(field) || JSON.stringify(current[field]) === JSON.stringify(before[field]))) continue;
      }
      const name = safeText(current.name, app.name, 100);
      const version = safeText(current.version, "ohne Versionsangabe", 60);
      const description = safeText(current.description, "Funktionen, Downloads und Hinweise findest du auf der App-Seite.");
      const base = { id: `git-${commit.sha}-${app.slug}`, date: commit.date, publishedAt: commit.timestamp, app: name, appSlug: app.slug, version,
        href: `apps/${app.slug}/`, linkLabel: "App ansehen", sourceUrl, source: "git" };
      let category = "Verbesserung", title, summary, details;
      if (introductions.get(app.slug) === commit.sha) {
        category = "Neue App"; title = `Neu auf AppShelf: ${name}`; summary = description;
        details = safeText(current.notes, `${name} ist als Version ${version} im Katalog verfügbar. Die App-Seite erklärt die Nutzung und enthält die veröffentlichten Dateien.`, 4000);
      } else if (!before || before.status === "draft") {
        title = `${name}: Katalogeintrag erneuert`; summary = `Die App-Daten wurden erneut in den Katalog übernommen. Version: ${version}.`; details = description;
      } else if (before.version !== current.version) {
        title = `${name}: Version ${version}`; summary = `${name} wurde von Version ${safeText(before.version, "der vorherigen Version", 60)} auf Version ${version} aktualisiert.`;
        details = `${description} ${safeText(current.notes, "Die aktuelle Beschreibung und die verfügbaren Downloads stehen auf der App-Seite.", 3000)}`;
      } else if (paths.some((name) => name.startsWith(prefix + "demo/"))) {
        const existed = previous && git(root, ["cat-file", "-e", `${previous}:${prefix}demo/index.html`], true) !== null;
        category = existed ? "Verbesserung" : "Web-Version";
        title = existed ? `${name}: Web-App aktualisiert` : `${name} jetzt auch im Browser`;
        summary = existed ? "Die Browser-Version wurde überarbeitet." : "Die Web-Version ist über die App-Seite erreichbar.";
        details = description;
      } else if (paths.every((name) => /README\.md$/i.test(name))) {
        title = `${name}: Anleitung aktualisiert`; summary = "Die Beschreibung oder die Nutzungshinweise wurden überarbeitet."; details = description;
      } else if (paths.every((name) => name.startsWith(prefix + "screenshots/"))) {
        title = `${name}: neue Vorschauen`; summary = "Die Vorschauen auf der App-Seite wurden aktualisiert."; details = description;
      } else if (paths.every((name) => name.startsWith("projects/"))) {
        title = `${name}: Projekt weiterentwickelt`; summary = "Am Projekt wurden Änderungen veröffentlicht. Die bereitgestellte App-Version ist weiterhin " + version + "."; details = "Eine Änderung am Quellprojekt bedeutet nicht automatisch, dass bereits eine neue APK vorliegt. Die verfügbaren Downloads stehen auf der App-Seite.";
      } else {
        title = `${name} aktualisiert`; summary = "App-Dateien, Beschreibung oder Materialien wurden aktualisiert. Die Versionsnummer bleibt " + version + "."; details = description;
      }
      automatic.push({ ...base, category, title, summary, details });
    }
    const general = commit.paths.filter((name) => !name.startsWith("apps/inbox/") && !name.startsWith("projects/"));
    if (general.length && !covered.has("appshelf")) {
      const website = general.some((name) => name.startsWith("site/"));
      const docsOnly = general.every((name) => /\.md$/i.test(name));
      automatic.push({ id: `git-${commit.sha}-appshelf`, date: commit.date, publishedAt: commit.timestamp, category: website ? "Verbesserung" : "Wartung",
        title: docsOnly ? "AppShelf: Anleitung aktualisiert" : website ? "AppShelf: Website aktualisiert" : "AppShelf: Abläufe aktualisiert",
        summary: docsOnly ? "Die allgemeinen Anleitungen für AppShelf wurden überarbeitet." : website ? "Die Oberfläche oder der Katalog von AppShelf wurde angepasst." : "Die Projektkonfiguration, Prüfungen oder Veröffentlichungsabläufe wurden angepasst.",
        details: "Dieser Eintrag entsteht aus einer tatsächlich veröffentlichten Änderung. Die zugehörigen Änderungen lassen sich auf GitHub nachlesen.",
        app: "AppShelf", appSlug: "appshelf", version: "Website", href: "updates/", linkLabel: "Alle Neuigkeiten", sourceUrl, source: "git" });
    }
  }
  const editorial = manualEntries.map((entry) => ({ ...entry, id: "story-" + digest(identity(entry)), source: "editorial", publishedAt: manualPublishedAt.get(identity(entry)) || `${entry.date}T23:59:59.999Z` }));
  return [...editorial, ...automatic].sort((a, b) => b.date.localeCompare(a.date) || b.publishedAt.localeCompare(a.publishedAt));
}
