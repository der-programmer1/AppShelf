import { readFile } from "node:fs/promises";

const categories = new Set(["Neue App", "Verbesserung", "Web-Version", "Qualität", "Wartung"]);
const fields = ["date", "category", "title", "summary", "details", "app", "appSlug", "version", "href", "linkLabel"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const fail = (message) => { throw new Error(`Updates validation failed: ${message}`); };

export function validateUpdates(data) {
  if (!data || Array.isArray(data) || data.schemaVersion !== 1 || !Array.isArray(data.entries)) fail("expected schemaVersion 1 and an entries array");
  if (Object.keys(data).some((key) => !["schemaVersion", "entries"].includes(key))) fail("source contains unknown fields; generatedAt is build-owned");
  let previousDate = "9999-12-31";
  const seen = new Set();
  for (const [index, entry] of data.entries.entries()) {
    if (!entry || Array.isArray(entry) || typeof entry !== "object") fail(`entry ${index} must be an object`);
    if (Object.keys(entry).some((key) => !fields.includes(key))) fail(`entry ${index} contains unknown fields`);
    for (const field of fields) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) fail(`entry ${index} needs ${field}`);
      if (entry[field].length > (field === "details" ? 4000 : 600)) fail(`entry ${index}: ${field} is too long`);
      if (/[\u0000-\u001f\u007f]/.test(entry[field]) || /(?:file:\/\/|\/(?:workspace|home|Users|tmp)\/|[A-Za-z]:\\)/i.test(entry[field])) fail(`entry ${index}: ${field} contains an internal path or control character`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) fail(`entry ${index} needs an ISO date`);
    const date = new Date(`${entry.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) fail(`entry ${index} has an invalid calendar date`);
    if (entry.date > previousDate) fail("entries must be sorted newest first");
    previousDate = entry.date;
    if (!categories.has(entry.category)) fail(`entry ${index} has an invalid category`);
    if (!slugPattern.test(entry.appSlug)) fail(`entry ${index} has an invalid appSlug`);
    if (entry.href !== "updates/" && entry.href !== `apps/${entry.appSlug}/`) fail(`entry ${index} needs a local app detail or updates link`);
    const identity = JSON.stringify([entry.date, entry.title, entry.appSlug, entry.version]);
    if (seen.has(identity)) fail(`entry ${index} duplicates an update`);
    seen.add(identity);
  }
  return data;
}

export async function loadUpdates(file) {
  let data;
  try { data = JSON.parse(await readFile(file, "utf8")); }
  catch (error) { fail(`cannot read valid JSON: ${error.message}`); }
  return validateUpdates(data);
}

export const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

export function renderUpdate(entry, { details = false } = {}) {
  const text = escapeHtml;
  const date = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${entry.date}T00:00:00Z`));
  const source = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{40}$/.test(entry.sourceUrl || "")
    ? `<a class="update-source" href="${text(entry.sourceUrl)}" target="_blank" rel="noopener">Änderung auf GitHub <span aria-hidden="true">↗</span></a>` : "";
  return `<article class="update-card"${entry.id ? ` id="${text(entry.id)}"` : ""}>
    <div class="update-meta"><span class="update-category">${text(entry.category)}</span><time datetime="${text(entry.date)}">${text(date)}</time></div>
    <h3>${text(entry.title)}</h3>
    <p>${text(entry.summary)}</p>
    ${details ? `<p class="update-details">${text(entry.details)}</p>` : ""}
    <p class="update-project">${text(entry.app)}${entry.appSlug === "appshelf" ? "" : ` · Version ${text(entry.version)}`}</p>
    <div class="update-actions"><a class="update-link" href="${text(entry.href)}">${text(entry.linkLabel)} <span aria-hidden="true">→</span></a>${details ? source : ""}</div>
  </article>`;
}

export function renderUpdates(entries, { latest = false } = {}) {
  if (!entries.length) return '<p class="updates-empty">Noch keine veröffentlichten Änderungen. Neue Fortschritte erscheinen hier nach ihrer Veröffentlichung.</p>';
  if (latest) return renderUpdate(entries[0]);
  const days = new Map();
  for (const entry of entries) { if (!days.has(entry.date)) days.set(entry.date, []); days.get(entry.date).push(entry); }
  return [...days].map(([day, items]) => {
    const label = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
    return `<section class="updates-day" aria-labelledby="day-${escapeHtml(day)}"><h2 id="day-${escapeHtml(day)}">${escapeHtml(label)}</h2><div class="updates-day-list">${items.map((entry) => renderUpdate(entry, { details: true })).join("\n")}</div></section>`;
  }).join("\n");
}
