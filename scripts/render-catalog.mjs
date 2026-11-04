import { escapeHtml as html, renderUpdates } from "./updates.mjs";

const types = { app: "App", "web-app": "Web-App", game: "Spiel", tool: "Tool" };
const fileTypes = { apk: "Android-APK", aab: "Android App Bundle", source: "Quellarchiv", readme: "README", other: "Datei" };
const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const arrow = '<span aria-hidden="true">↗</span>';
const detailPrefix = "../../";
const projectHref = (app) => `apps/${encodeURIComponent(app.slug)}/`;
const localHref = (href, prefix) => href.startsWith("https://") ? href : prefix + href;
const dateLabel = (date) => {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "Unbekannt" : `<time datetime="${parsed.toISOString().slice(0, 10)}">${dateFormat.format(parsed)}</time>`;
};

function fill(template, markers) {
  return template.replace(/<!-- ([A-Z_]+) -->/g, (marker, key) => {
    if (!Object.hasOwn(markers, key)) throw new Error(`Unknown HTML marker: ${marker}`);
    return markers[key];
  });
}

function badges(items, label) {
  return items.length
    ? `<ul class="badges" aria-label="${label}">${items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`
    : "";
}

function qrDisclosure(targets, prefix = "") {
  if (!targets.length) return "";
  return `<details class="qr" name="qr-codes">
    <summary class="button">QR-Code</summary>
    <div class="qr-panel">
      <p>Mit der Smartphone-Kamera scannen</p>
      <div class="qr-targets">${targets.map(({ code, label, href }) => `
        <a href="${html(localHref(href, prefix))}">
          <img src="${html(prefix + code.href)}" alt="QR-Code: ${html(label)}" width="144" height="144" loading="lazy">
          <span>${html(label)}</span>
        </a>`).join("")}
      </div>
    </div>
  </details>`;
}

const webTarget = (app) => ({ code: app.demoQrCode, label: "Web-App öffnen", href: app.demoHref });
const apkTarget = (file) => ({ code: file.qrCode, label: file.filename.includes("-unsigned.") ? "Unsignierte APK" : "APK laden", href: file.href });

function renderCard(app, index) {
  const name = html(app.name);
  const href = projectHref(app);
  const search = [app.name, app.description, app.category, ...app.tags, ...app.platform, ...app.techStack].join(" ").toLocaleLowerCase("de");
  const image = app.preview;
  const apk = app.files.find((file) => file.kind === "apk" && !file.filename.includes("-unsigned."));
  const qrTargets = [...(app.demoHref ? [webTarget(app)] : []), ...(apk ? [apkTarget(apk)] : [])];
  return `<article class="app-card" data-name="${name}" data-type="${html(app.projectType)}" data-category="${html(app.category)}" data-search="${html(search)}" aria-labelledby="title-${app.slug}">
    <a class="preview" href="${href}" aria-label="${name}: Projektdetails">
      <span class="preview-meta"><span aria-hidden="true">[ ${String(index + 1).padStart(2, "0")} ]</span><span>${html(app.category)}</span></span>
      <span class="screen-frame"><img src="${html(image.href)}" alt="" width="640" height="360" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></span>
    </a>
    <div class="card-content">
      <div class="card-title"><h3 id="title-${app.slug}"><a href="${href}">${name}</a></h3><span class="version">v${html(app.version)}</span></div>
      <p>${html(app.description)}</p>
      ${badges(app.techStack, "Technologien")}
      <a class="source-link" href="${html(app.sourceUrl)}">Quellcode auf GitHub ${arrow}</a>
      <div class="card-actions">
        ${app.demoHref ? `<a class="button primary" href="${html(app.demoHref)}">Web-App öffnen ${arrow}</a>` : `<a class="button primary" href="${href}">Projektdetails →</a>`}
        ${qrDisclosure(qrTargets)}
      </div>
    </div>
  </article>`;
}

function renderControls(categories, projectTypes) {
  const options = (values, label = (value) => value) => values.map((value) => `<option value="${html(value)}">${html(label(value))}</option>`).join("");
  return `<form id="catalog-filters" class="catalog-controls" role="search" aria-label="Projektkatalog">
    <div class="filter-field search-field"><label for="project-query">Suchen</label><input id="project-query" name="query" type="search" placeholder="Name, Thema, Technologie …" autocomplete="off"></div>
    ${projectTypes.length > 1 ? `<div class="filter-field"><label for="project-type">Projektart</label><select id="project-type" name="projectType"><option value="">Alle Projektarten</option>${options(projectTypes, (type) => types[type])}</select></div>` : ""}
    <div class="filter-field"><label for="project-category">Kategorie</label><select id="project-category" name="category"><option value="">Alle Kategorien</option>${options(categories)}</select></div>
    <div class="filter-field"><label for="project-order">Sortieren</label><select id="project-order" name="sort"><option value="recent">Zuletzt aktualisiert</option><option value="name">Name A–Z</option><option value="category">Kategorie</option></select></div>
  </form>`;
}

export function renderHome(template, apps, updates, repositoryUrl, branch) {
  const categories = [...new Set(apps.map((app) => app.category))].sort((a, b) => a.localeCompare(b, "de"));
  const projectTypes = [...new Set(apps.map((app) => app.projectType))].sort();
  const commits = `${repositoryUrl}/commits/${encodeURIComponent(branch)}/`;
  return fill(template, {
    REPOSITORY_URL: html(repositoryUrl),
    PROJECT_COUNT: `${apps.length} ${apps.length === 1 ? "Projekt" : "Projekte"}`,
    INVENTORY: `<dl>
      <div><dt>Projekte</dt><dd id="stat-projects">${apps.length}</dd></div>
      <div><dt>Kategorien</dt><dd id="stat-categories">${categories.length}</dd></div>
      <div><dt>Letztes Projektupdate</dt><dd id="stat-updated">${apps.length ? dateLabel(apps[0].updatedAt) : "Keine Einträge"}</dd></div>
    </dl>`,
    CATALOG_CONTROLS: apps.length ? renderControls(categories, projectTypes) : "",
    PROJECT_CARDS: apps.length ? apps.map(renderCard).join("\n") : "<p>Hier erscheinen die veröffentlichten Projekte.</p>",
    ACTIVITY: `<section id="aktivitaet" class="activity" aria-labelledby="activity-title">
      <div class="section-heading"><div><p class="eyebrow"><span aria-hidden="true">02 / </span>WERKSTATTPROTOKOLL</p><h2 id="activity-title">Letzte Änderungen</h2></div>
        <a class="source-link" href="${html(commits)}">Commit-Historie ${arrow}</a></div>
      ${renderUpdates(updates, commits)}
    </section>`,
  });
}

function downloadRow(file) {
  const unsigned = file.kind === "apk" && file.filename.includes("-unsigned.");
  return `<li class="download-row">
    <div class="download-meta"><strong>${fileTypes[file.kind]}${unsigned ? " · unsigniert" : ""}</strong><span>${html(file.filename)}</span></div>
    <div class="download-actions">
      <a class="button" href="${html(localHref(file.href, detailPrefix))}" download aria-label="Download: ${html(file.filename)}">Download ↓</a>
      ${file.qrCode ? qrDisclosure([apkTarget(file)], detailPrefix) : ""}
    </div>
    ${file.sha256 ? `<details class="checksum"><summary>SHA-256 anzeigen</summary><code>${file.sha256}</code></details>` : ""}
  </li>`;
}

export function renderDetail(template, app) {
  const name = html(app.name);
  const web = app.demoHref ? `<li class="download-row web-row">
    <div class="download-meta"><strong>Web-App</strong><span>${html(app.webDescription || "Direkt im Browser nutzen.")}</span></div>
    <div class="download-actions">
      <a class="button primary" href="${html(detailPrefix + app.demoHref)}">Web-App öffnen ${arrow}</a>
      ${qrDisclosure([webTarget(app)], detailPrefix)}
    </div>
  </li>` : "";
  return fill(template, {
    PROJECT_NAME: name,
    PROJECT_DESCRIPTION: html(app.description),
    PROJECT_DETAIL: `<header class="detail-heading">
      <p class="eyebrow">${html(types[app.projectType])} / ${html(app.category)}</p>
      <h1>${name}</h1>
      <div class="detail-meta"><span class="version">v${html(app.version)}</span>${dateLabel(app.updatedAt)}<span>${html(app.platform.join(" · "))}</span></div>
      <p class="intro">${html(app.description)}</p>
      ${badges(app.techStack, "Technologien")}
      <a class="source-link" href="${html(app.sourceUrl)}">Quellcode auf GitHub ${arrow}</a>
    </header>
    <section class="detail-section" aria-labelledby="download-title">
      <h2 id="download-title">Öffnen &amp; herunterladen</h2>
      ${web || app.files.length ? `<ul class="download-list">${web}${app.files.map(downloadRow).join("")}</ul>` : "<p>Für dieses Projekt sind noch keine Dateien veröffentlicht.</p>"}
      ${app.notes ? `<p class="project-note">${html(app.notes)}</p>` : ""}
    </section>
    <section class="detail-section" aria-labelledby="screenshots-title">
      <h2 id="screenshots-title">Vorschau</h2>
      <div class="screenshots">${app.screenshots.map((shot) => `<a href="${html(detailPrefix + shot.href)}"><img src="${html(detailPrefix + shot.href)}" alt="${html(shot.alt)}" width="640" height="400" loading="lazy" decoding="async"></a>`).join("")}</div>
    </section>`,
  });
}
