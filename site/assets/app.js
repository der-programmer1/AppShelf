const state = { apps: [], query: "", projectType: "all", category: "all", sort: "recent" };
const projectTypeLabels = { app: "App", "web-app": "Web-App", game: "Spiel", tool: "Tool" };

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => {
  if (!value) return "ohne Datum";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
};

const matches = (app) => {
  const haystack = [app.name, app.description, app.category, ...(app.tags || []), ...(app.platform || [])].join(" ").toLocaleLowerCase("de-DE");
  return (state.projectType === "all" || (app.projectType || "app") === state.projectType)
    && (state.category === "all" || app.category === state.category)
    && haystack.includes(state.query.toLocaleLowerCase("de-DE"));
};

const sortedApps = () => [...state.apps].filter(matches).sort((a, b) => {
  if (state.sort === "name") return a.name.localeCompare(b.name, "de");
  if (state.sort === "category") return `${a.category}${a.name}`.localeCompare(`${b.category}${b.name}`, "de");
  return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
});

const renderCard = (app) => {
  const firstImage = app.screenshots?.[0]?.href;
  const visual = firstImage
    ? `<img src="${escapeHtml(firstImage)}" alt="" loading="lazy">`
    : `<span class="app-card-mark">${escapeHtml((app.name || "A").slice(0, 1).toUpperCase())}</span>`;
  const tags = (app.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const projectType = projectTypeLabels[app.projectType || "app"] || "Projekt";
  const demo = app.demoHref ? `<span class="card-action">Demo ↗</span>` : "";
  return `<a class="app-card" href="apps/${encodeURIComponent(app.slug)}/">
    <div class="app-card-visual">${visual}<span class="app-card-category">${escapeHtml(app.category || "App")}</span></div>
    <div class="app-card-body">
      <h3 class="app-card-title">${escapeHtml(app.name)}</h3>
      <p class="app-card-description">${escapeHtml(app.description || "Noch keine Beschreibung hinterlegt.")}</p>
      <div class="tag-row"><span class="tag tag-type">${escapeHtml(projectType)}</span>${tags}</div>
      <div class="app-card-meta"><span>v${escapeHtml(app.version || "—")}</span><span>${escapeHtml(formatDate(app.updatedAt))} · Öffnen →</span>${demo}</div>
    </div>
  </a>`;
};

const render = () => {
  const apps = sortedApps();
  document.querySelector("#app-grid").innerHTML = apps.map(renderCard).join("");
  document.querySelector("#catalog-count").textContent = `${apps.length} von ${state.apps.length} Projekten`;
  document.querySelector("#empty-state").hidden = apps.length !== 0;
};

const setup = (catalog) => {
  state.apps = catalog.apps || [];
  const typeSelect = document.querySelector("#project-type-select");
  const types = [...new Set(state.apps.map((app) => app.projectType || "app"))].sort();
  types.forEach((type) => typeSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(type)}">${escapeHtml(projectTypeLabels[type] || type)}</option>`));
  const categories = [...new Set(state.apps.map((app) => app.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
  const select = document.querySelector("#category-select");
  categories.forEach((category) => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`));
  document.querySelector("#stat-projects").textContent = state.apps.length;
  document.querySelector("#stat-categories").textContent = categories.length;
  document.querySelector("#stat-updated").textContent = state.apps.length ? formatDate(state.apps[0].updatedAt) : "—";
  document.querySelector("#search-input").addEventListener("input", (event) => { state.query = event.target.value.trim(); render(); });
  typeSelect.addEventListener("change", (event) => { state.projectType = event.target.value; render(); });
  select.addEventListener("change", (event) => { state.category = event.target.value; render(); });
  document.querySelector("#sort-select").addEventListener("change", (event) => { state.sort = event.target.value; render(); });
  document.querySelector("#reset-filters").addEventListener("click", () => {
    state.query = "";
    state.projectType = "all";
    state.category = "all";
    document.querySelector("#search-input").value = "";
    typeSelect.value = "all";
    select.value = "all";
    render();
  });
  render();
};

fetch("catalog.json", { cache: "no-store" }).then((response) => {
  if (!response.ok) throw new Error(`catalog ${response.status}`);
  return response.json();
}).then(setup).catch(() => { document.querySelector("#load-error").hidden = false; document.querySelector("#catalog-count").textContent = "Nicht verfügbar"; });
