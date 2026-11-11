const html = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const fileTypes = { apk: "Android-APK", aab: "Android App Bundle", source: "Quellarchiv", readme: "README", other: "Datei" };
const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const arrow = '<span aria-hidden="true">↗</span>';
const detailPrefix = "../../";
const projectHref = (app) => `apps/${encodeURIComponent(app.slug)}/`;
const localHref = (href, prefix) => href.startsWith("https://") ? href : prefix + href;
const isUnsigned = (file) => file.filename.toLowerCase().endsWith("-unsigned.apk");
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
const apkTarget = (file) => ({ code: file.qrCode, label: isUnsigned(file) ? "Unsignierte APK" : "APK laden", href: file.href });

function cardOptions(app, webIsSecondary, qr) {
  const links = [
    webIsSecondary && `<a href="${html(app.demoHref)}">Web-App öffnen</a>`,
    app.githubUrl && `<a href="${html(app.githubUrl)}">Quellcode auf GitHub ${arrow}</a>`,
  ].filter(Boolean);
  if (!links.length && !qr) return "";
  return `<details class="card-options" name="card-options">
    <summary aria-label="Weitere Optionen für ${html(app.name)}">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="16" cy="10" r="1.6"/></svg>
    </summary>
    <div class="card-option-panel">
      ${links.length ? `<div class="card-option-links">${links.join("")}</div>` : ""}
      ${qr ? `<figure>
        <img src="${html(qr.code.href)}" alt="QR-Code: ${html(qr.label)}" width="112" height="112" loading="lazy">
        <figcaption>Am Smartphone scannen</figcaption>
      </figure>` : ""}
    </div>
  </details>`;
}

function renderCard(app) {
  const name = html(app.name);
  const href = projectHref(app);
  const apk = app.files.find((file) => file.kind === "apk" && !isUnsigned(file));
  const file = apk ?? (app.demoHref ? undefined : app.files.find((entry) => entry.kind !== "readme"));
  const primaryHref = file?.href || app.demoHref || href;
  const primaryLabel = file?.kind === "apk" ? (isUnsigned(file) ? "APK (unsigniert)" : "APK laden")
    : app.demoHref ? "Web-App öffnen" : file ? "Datei laden" : "Projektdetails";
  const qr = file?.qrCode ? apkTarget(file) : !file && app.demoQrCode ? webTarget(app) : null;
  return `<article class="app-card" aria-labelledby="title-${app.slug}">
    <a class="card-cover" href="${href}" aria-label="${name}: Vorschau und Details">
      <img src="${html(app.preview.href)}" alt="${html(app.preview.alt)}" width="640" height="400" loading="lazy" decoding="async">
      <span class="card-category">${html(app.category)}</span>
    </a>
    <div class="card-content">
      <h3 id="title-${app.slug}" class="card-title"><a href="${href}">${name}</a></h3>
      <p class="card-description">${html(app.cardDescription)}</p>
      ${badges(app.techStack.slice(0, 3), "Technologien")}
      <div class="card-actions">
        <a class="button primary" href="${html(primaryHref)}"${file ? " download" : ""}>${primaryLabel}</a>
        ${cardOptions(app, Boolean(apk && app.demoHref), qr)}
      </div>
    </div>
  </article>`;
}

export function renderHome(template, apps) {
  return fill(template, {
    PROJECT_CARDS: apps.length ? apps.map(renderCard).join("\n") : "<p>Hier erscheinen die veröffentlichten Projekte.</p>",
  });
}

function downloadRow(file) {
  const unsigned = file.kind === "apk" && isUnsigned(file);
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
      <a class="button primary" href="${html(localHref(app.demoHref, detailPrefix))}">Web-App öffnen ${arrow}</a>
      ${qrDisclosure([webTarget(app)], detailPrefix)}
    </div>
  </li>` : "";
  return fill(template, {
    PROJECT_NAME: name,
    PROJECT_DESCRIPTION: html(app.description),
    PROJECT_DETAIL: `<header class="detail-heading">
      <h1>${name}</h1>
      <div class="detail-meta"><span class="version">v${html(app.version)}</span>${dateLabel(app.updatedAt)}<span>${html(app.platform.join(" · "))}</span></div>
      <p class="intro">${html(app.description)}</p>
      ${badges(app.techStack, "Technologien")}
      ${app.githubUrl ? `<a class="source-link" href="${html(app.githubUrl)}">Quellcode auf GitHub ${arrow}</a>` : ""}
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
