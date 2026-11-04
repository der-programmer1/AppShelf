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

export function renderUpdates(entries, commitsUrl) {
  if (!entries.length) return "<p>Noch keine veröffentlichten Änderungen.</p>";
  const text = escapeHtml;
  const date = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  const items = entries.slice(0, 3).map((entry) => {
    const source = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{40}$/.test(entry.sourceUrl || "") ? entry.sourceUrl : commitsUrl;
    const href = entry.href === "updates/" ? source : entry.href;
    return `<li class="activity-item">
      <div class="activity-date"><time datetime="${text(entry.date)}">${date.format(new Date(`${entry.date}T00:00:00Z`))}</time><br>${text(entry.category)}</div>
      <div><a href="${text(href)}">${text(entry.title)}</a><p>${text(entry.summary)}</p></div>
    </li>`;
  });
  return `<ol class="activity-list">${items.join("\n")}</ol>`;
}
