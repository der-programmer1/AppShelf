const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value || "ohne Datum") : new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(date);
};

const fileLabel = (file) => ({ apk: "APK", aab: "AAB", source: "Quellprojekt", readme: "README", other: "Datei" }[file.kind] || "Download");
const detailHref = (href) => /^https?:\/\//i.test(href) ? href : `../../${href}`;
const imageMarkup = (src, alt, className = "") => `<img class="${className}" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" data-fallback>`;

const render = (app) => {
  const root = document.querySelector("#app-page");
  const tags = (app.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const files = app.files || [];
  const downloads = files.length ? files.map((file) => `<a class="download-link" href="${escapeHtml(detailHref(file.href))}" download><span>${escapeHtml(fileLabel(file))}<br><small>${escapeHtml(file.filename)}</small></span><span>↓</span></a>`).join("") : `<div class="no-downloads">Noch keine Dateien hinterlegt.</div>`;
  const table = files.length ? `<table class="file-table"><thead><tr><th>Datei</th><th>Typ</th><th>Aktion</th></tr></thead><tbody>${files.map((file) => `<tr><td>${escapeHtml(file.filename)}</td><td>${escapeHtml(fileLabel(file))}</td><td><a href="${escapeHtml(detailHref(file.href))}" download>Download →</a></td></tr>`).join("")}</tbody></table>` : `<p class="muted-copy">Für diese App sind noch keine Dateien veröffentlicht.</p>`;
  const screenshots = (app.screenshots || []).length ? `<div class="screenshot-grid">${app.screenshots.map((shot) => `<figure>${imageMarkup(detailHref(shot.href), shot.alt || `${app.name} Screenshot`)}<div class="image-fallback" hidden>Vorschau nicht verfügbar</div></figure>`).join("")}</div>` : `<p class="muted-copy">Keine Screenshots hinterlegt.</p>`;
  const heroImage = app.screenshots?.[0] ? detailHref(app.screenshots[0].href) : "";
  const heroPreview = heroImage
    ? `<div class="feature-image">${imageMarkup(heroImage, `${app.name} Vorschau`)}<div class="image-fallback" hidden>Vorschau nicht verfügbar. Der Build muss die Preview-Datei noch veröffentlichen.</div></div>`
    : screenshots;
  const qr = app.qrCode?.href ? `<section class="qr-section"><div class="qr-card"><div><p class="eyebrow">MOBIL ÖFFNEN</p><h2>AppShelf auf dem Handy</h2><p>Scanne den QR-Code mit deinem Smartphone, um diese App-Seite direkt zu öffnen.</p><a class="text-link" href="${escapeHtml(app.qrCode.target || "#")}" target="_blank" rel="noopener">Zielseite öffnen →</a></div><img class="qr-image" src="${escapeHtml(detailHref(app.qrCode.href))}" alt="QR-Code für ${escapeHtml(app.name)}" data-fallback><div class="image-fallback" hidden>QR-Code nicht verfügbar.</div></div></section>` : "";
  root.innerHTML = `<div class="detail-layout">
    <section>
      <div class="detail-kicker"><span>${escapeHtml(app.category || "App")}</span><span>·</span><span>v${escapeHtml(app.version || "—")}</span><span>·</span><span>${escapeHtml(formatDate(app.updatedAt))}</span></div>
      <h1 class="detail-title">${escapeHtml(app.name)}</h1>
      <p class="detail-description">${escapeHtml(app.description || "Noch keine Beschreibung hinterlegt.")}</p>
      <div class="tag-row">${tags}</div>
      ${app.notes ? `<p class="detail-notes">${escapeHtml(app.notes)}</p>` : ""}
    </section>
    <aside class="download-panel">
      <h2>App files</h2>
      <p>Alle verfügbaren Dateien zu diesem Beitrag.</p>
      <div class="download-list">${downloads}</div>
    </aside>
  </div>
  <section class="detail-section"><h2>Vorschau</h2>${heroPreview}</section>
  ${qr}
  <section class="detail-section"><h2>Dateien</h2>${table}</section>
  <section class="detail-section"><h2>Plattform</h2><p class="muted-copy">${escapeHtml((app.platform || []).join(" · ") || "Nicht angegeben")}</p></section>`;
  root.querySelectorAll("img[data-fallback]").forEach((image) => image.addEventListener("error", () => {
    image.hidden = true;
    const fallback = image.parentElement?.querySelector(".image-fallback");
    if (fallback) fallback.hidden = false;
  }, { once: true }));
};

const slug = document.body.dataset.appSlug;
fetch("../../catalog.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error("catalog unavailable");
  return response.json();
}).then((catalog) => {
  const app = (catalog.apps || []).find((entry) => entry.slug === slug);
  if (!app) throw new Error("app not found");
  document.title = `${app.name} · AppShelf`;
  render(app);
}).catch(() => {
  document.querySelector("#app-page").innerHTML = `<div class="empty-state"><span class="empty-icon">?</span><h3>App nicht gefunden</h3><p>Dieser Beitrag ist nicht mehr im öffentlichen Katalog.</p><a class="button button-secondary" href="../../">Zur Sammlung</a></div>`;
});
