import { config } from "./config.js";
import { validateResult, renderResult, exportText } from "./render.js";

const byId = (id) => document.getElementById(id);
const form = byId("planner"), status = byId("status"), endpoint = byId("endpoint");
const files = [], previewUrls = new Set();
let controller = null, result = null, generation = 0, busy = false;
const maxBytes = 8 * 1024 * 1024;
const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const message = (text, error = false) => {
  status.textContent = text;
  status.classList.toggle("error", error);
};
const localHost = (name) => ["localhost", "127.0.0.1", "[::1]"].includes(name);

export function apiOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Bitte zuerst eine gültige Server-Adresse eintragen."); }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("Bitte nur die Server-Adresse ohne Pfad, Passwort oder Zusatzparameter eintragen.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost(url.hostname) && localHost(location.hostname))) {
    throw new Error("Für den Server ist HTTPS erforderlich. HTTP ist nur beim lokalen Test auf demselben Rechner erlaubt.");
  }
  return url.origin;
}

const standalone = ["/", "/index.html"].includes(location.pathname);
endpoint.value = config.apiBaseUrl || (standalone ? location.origin : "");
byId("connection").open = true;

function refreshFiles() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls.clear();
  byId("file-list").replaceChildren();
  for (const [index, file] of files.entries()) {
    const row = document.createElement("li");
    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = URL.createObjectURL(file);
      previewUrls.add(image.src);
      image.alt = "Vorschau: " + file.name;
      row.append(image);
    }
    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name + " · " + (file.size / 1024 / 1024).toFixed(1) + " MB";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", file.name + " entfernen");
    remove.disabled = busy;
    remove.addEventListener("click", () => { files.splice(index, 1); refreshFiles(); });
    row.append(name, remove);
    byId("file-list").append(row);
  }
}

function addFiles(incoming) {
  if (busy) return;
  const selected = [...incoming];
  if (files.length + selected.length > 3) return message("Bitte höchstens drei Dateien auswählen.", true);
  if (selected.some((file) => !allowed.includes(file.type) || file.size === 0)) return message("Bitte JPEG, PNG, WebP oder PDF auswählen.", true);
  if ([...files, ...selected].reduce((sum, file) => sum + file.size, 0) > maxBytes) return message("Die Dateien dürfen zusammen höchstens 8 MB groß sein.", true);
  files.push(...selected);
  refreshFiles();
  message(files.length + " Datei(en) vorbereitet. Es wurde noch nichts hochgeladen.");
}
for (const id of ["files", "camera"]) byId(id).addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});
const dropzone = byId("dropzone");
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); if (!busy) dropzone.classList.add("dragging"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragging"));
dropzone.addEventListener("drop", (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); addFiles(event.dataTransfer.files); });

function setBusy(value) {
  busy = value;
  for (const input of form.querySelectorAll("input, textarea, button")) input.disabled = value;
  for (const button of byId("file-list").querySelectorAll("button")) button.disabled = value;
  byId("cancel").hidden = !value;
  document.querySelector(".output-panel").setAttribute("aria-busy", String(value));
  byId("generate").textContent = value ? "Aufgaben werden ausgewertet…" : "Plan & Lösungen erstellen ↗";
}

byId("check-connection").addEventListener("click", async () => {
  const target = byId("connection-status");
  target.textContent = "Verbindung wird geprüft…";
  try {
    const response = await fetch(apiOrigin(endpoint.value) + "/health", { cache: "no-store", signal: AbortSignal.timeout(8000), credentials: "omit" });
    const value = await response.json();
    if (!response.ok || value.provider !== "codex-agents") throw new Error("Unter dieser Adresse ist kein AufgabenPilot-Dienst erreichbar.");
    target.textContent = value.status === "ready" ? "Server konfiguriert. Modellzugriff wird bei der ersten Auswertung geprüft." : "Server erreichbar. Der Betreiber muss API-Schlüssel und App-Zugangscode eintragen.";
  } catch (error) { target.textContent = error.name === "TimeoutError" ? "Der Server antwortet nicht rechtzeitig." : error.message || "Verbindung fehlgeschlagen."; }
});

const fileData = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, mime: file.type, data: String(reader.result).split(",")[1] });
  reader.onerror = () => reject(new Error("Eine Datei konnte nicht gelesen werden."));
  reader.readAsDataURL(file);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const attempt = ++generation;
  let timer;
  let timedOut = false;
  try {
    const base = apiOrigin(endpoint.value);
    const text = byId("task-text").value.trim();
    if (!text && !files.length) throw new Error("Bitte zuerst eine Aufgabe eingeben oder ein Aufgabenblatt auswählen.");
    if (!byId("consent").checked) throw new Error("Bitte der KI-Auswertung ausdrücklich zustimmen.");
    controller = new AbortController();
    const signal = controller.signal;
    timer = setTimeout(() => { timedOut = true; controller?.abort(); }, 150000);
    const accessCode = byId("access-code").value;
    setBusy(true);
    result = null;
    byId("result").hidden = true;
    byId("empty").hidden = false;
    message("Deine Aufgaben werden gelesen, geordnet und mit Lösungen vorbereitet. Das kann etwas dauern.");
    const payload = {
      consent: true, text, subject: byId("subject").value.trim(), grade: byId("grade").value.trim(),
      minutes: Number(byId("minutes").value), files: await Promise.all(files.map(fileData)),
    };
    if (signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
    const response = await fetch(base + "/api/plan", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessCode },
      body: JSON.stringify(payload), signal, credentials: "omit", cache: "no-store",
    });
    const raw = await response.text();
    if (raw.length > 500000) throw new Error("Die Serverantwort ist zu groß.");
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error("Der Server hat keine lesbare Antwort geliefert."); }
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error.slice(0, 2000) : "Die Auswertung ist fehlgeschlagen.");
    if (generation !== attempt) return;
    result = validateResult(value);
    renderResult(byId("plan-content"), result);
    byId("empty").hidden = true;
    byId("result").hidden = false;
    message(result.tasks.length ? "Dein Plan ist bereit. Starte mit dem ersten Zeitblock." : "Es wurden keine lesbaren Aufgaben erkannt. Bitte die Rückfrage im Ergebnis beachten.");
    byId("output-title").tabIndex = -1;
    byId("output-title").focus({ preventScroll: true });
    byId("output-title").scrollIntoView({ behavior: "auto", block: "start" });
  } catch (error) {
    if (generation === attempt) message(error.name === "AbortError" ? timedOut ? "Die Auswertung hat zu lange gedauert. Bitte weniger Aufgaben auf einmal senden." : "Auswertung abgebrochen." : error.message || "Verbindung zum Server fehlgeschlagen.", error.name !== "AbortError" || timedOut);
  } finally {
    clearTimeout(timer);
    if (generation === attempt) { setBusy(false); controller = null; }
  }
});
byId("cancel").addEventListener("click", () => controller?.abort());
byId("clear").addEventListener("click", () => {
  generation++;
  controller?.abort();
  controller = null;
  result = null;
  files.length = 0;
  byId("task-text").value = "";
  byId("access-code").value = "";
  byId("consent").checked = false;
  byId("plan-content").replaceChildren();
  byId("result").hidden = true;
  byId("empty").hidden = false;
  setBusy(false);
  refreshFiles();
  message("Aufgaben, Zugangscode und Ergebnis wurden aus dieser Ansicht entfernt.");
});
byId("download").addEventListener("click", () => {
  if (!result) return;
  const url = URL.createObjectURL(new Blob([exportText(result)], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "AufgabenPilot-FA2-Plan.txt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
let printState = [];
window.addEventListener("beforeprint", () => {
  printState = [...document.querySelectorAll("#plan-content details")].map((details) => [details, details.open]);
  for (const [details] of printState) details.open = true;
});
window.addEventListener("afterprint", () => { for (const [details, open] of printState) details.open = open; printState = []; });
byId("print").addEventListener("click", () => { if (result) window.print(); });
window.addEventListener("pagehide", () => { controller?.abort(); for (const url of previewUrls) URL.revokeObjectURL(url); });
