import { emptyPlan, estimate, limits, restorePlan, secondsLeft, validExercise } from "./model.js";

const storageKey = "appshelf.satzfenster.v1";
const id = (name) => document.getElementById(name);
const list = id("exercises");
const minutes = id("minutes");
const editor = id("editor");
const editorForm = id("exercise-form");
const field = (name) => editorForm.elements.namedItem(name);
const formatTime = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const rows = new Map();
let editing = null;
let returnFocus = null;

function readPlan() {
  try {
    return restorePlan(JSON.parse(localStorage.getItem(storageKey)));
  } catch {
    id("storage-info").textContent = "Gespeicherte Daten sind in diesem Tab nicht verfügbar.";
    return emptyPlan();
  }
}
let plan = readPlan();

function savePlan() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(plan));
    id("storage-info").textContent = "Dein Plan bleibt in diesem Browser.";
  } catch {
    id("storage-info").textContent = "Speichern ist gesperrt. Dein Plan bleibt nur in diesem Tab.";
  }
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function updateBudget() {
  const running = plan.deadline !== null;
  const draft = !running && minutes.validity.valid ? minutes.valueAsNumber * 60 : secondsLeft(plan, Date.now());
  const { byId, scheduled, deferred, blocked, next } = estimate(plan.exercises, draft);
  const pending = scheduled + deferred + blocked;
  setText(id("clock"), Math.floor(draft / 60) + ":" + String(draft % 60).padStart(2, "0"));
  setText(id("timer-state"), running ? (draft > 0 ? "Läuft" : "Zeit abgelaufen") : "Vorschau");
  setText(id("timer-detail"), running ? "Ende um " + formatTime.format(plan.deadline) + " Uhr." : "Die Zeit läuft, sobald du startest.");
  setText(id("start-timer"), running ? "Restzeit setzen" : "Zeit starten");
  id("stop-timer").hidden = !running;
  id("summary").hidden = plan.exercises.length === 0;

  setText(id("fit-count"), scheduled + " / " + pending + " passen");
  for (const [key, count] of [["fit", scheduled], ["later", deferred], ["waiting", blocked]]) {
    setText(id("total-" + key), String(count));
    id("bar-" + key).style.flexGrow = String(count);
  }
  const nextText = next ? "Als Nächstes: " + next.name
    : pending === 0 ? "Alle Sätze sind abgehakt."
    : blocked === pending ? "Warte auf ein freies Gerät oder gib eine Übung frei."
    : "Aktuell passt kein weiterer Satz ins Zeitfenster.";
  setText(id("next"), nextText);

  for (const [exerciseId, row] of rows) {
    const { fit, later, waiting } = byId.get(exerciseId);
    const parts = [];
    if (fit) parts.push(fit + " im Zeitfenster");
    if (later) parts.push(later + " später");
    if (waiting) parts.push(waiting + " belegt");
    setText(row.querySelector("[data-fit]"), parts.join(" · ") || "Erledigt");
  }
}

function render() {
  rows.clear();
  const contents = document.createDocumentFragment();
  let completed = 0;
  let total = 0;
  for (const entry of plan.exercises) {
    completed += entry.completed;
    total += entry.sets;
    const row = id("exercise-template").content.firstElementChild.cloneNode(true);
    row.dataset.id = entry.id;
    row.dataset.blocked = String(entry.blocked);
    row.querySelector("[data-name]").textContent = entry.name;
    row.querySelector("[data-progress]").textContent = entry.completed + "/" + entry.sets + " Sätze · "
      + entry.minutes + " Min. pro Satz" + (entry.core ? " · Wichtig" : "");
    const [edit, complete, block, undo] = row.querySelectorAll("button");
    edit.setAttribute("aria-label", entry.name + " bearbeiten");
    complete.disabled = entry.blocked || entry.completed === entry.sets;
    complete.setAttribute("aria-label", "Satz fertig – " + entry.name);
    block.disabled = entry.completed === entry.sets;
    block.textContent = entry.blocked ? "Freigeben" : "Belegt";
    block.setAttribute("aria-label", entry.name + (entry.blocked ? " freigeben" : " als belegt markieren"));
    undo.hidden = entry.completed === 0;
    undo.setAttribute("aria-label", "Letzten Satz rückgängig – " + entry.name);
    rows.set(entry.id, row);
    contents.append(row);
  }
  list.replaceChildren(contents);
  id("add").disabled = plan.exercises.length >= limits.exercises;
  id("empty").hidden = plan.exercises.length > 0;
  id("plan-footer").hidden = plan.exercises.length === 0;
  id("reset").hidden = !completed && !plan.exercises.some((entry) => entry.blocked);
  setText(id("completed"), completed + " von " + total + " erledigt");
  updateBudget();
}

function announce(message) {
  id("announcement").textContent = message;
}

function saveAndRender(message) {
  savePlan();
  render();
  if (message) announce(message);
}

function focusRow(exerciseId, action) {
  const row = rows.get(exerciseId);
  const button = row?.querySelector('[data-action="' + action + '"]');
  (button && !button.disabled && !button.hidden ? button : row?.querySelector('[data-action="edit"]') ?? id("add")).focus();
}

function openEditor(entry, trigger) {
  editing = entry?.id ?? null;
  returnFocus = trigger;
  id("editor-title").textContent = entry ? "Übung bearbeiten" : "Übung hinzufügen";
  id("delete").hidden = !entry;
  field("name").value = entry?.name ?? "";
  field("name").setCustomValidity("");
  field("sets").value = entry?.sets ?? 3;
  field("setMinutes").value = entry?.minutes ?? 3;
  field("core").checked = entry?.core ?? false;
  editor.showModal();
}

id("time-form").addEventListener("submit", (event) => {
  event.preventDefault();
  plan.minutes = minutes.valueAsNumber;
  plan.deadline = Date.now() + plan.minutes * 60_000;
  savePlan();
  updateBudget();
  announce("Zeitfenster läuft ab jetzt " + plan.minutes + " Minuten.");
});
minutes.addEventListener("input", updateBudget);
minutes.addEventListener("change", () => {
  if (plan.deadline !== null || !minutes.validity.valid) return;
  plan.minutes = minutes.valueAsNumber;
  savePlan();
});
id("stop-timer").addEventListener("click", () => {
  plan.deadline = null;
  if (minutes.validity.valid) plan.minutes = minutes.valueAsNumber;
  minutes.value = plan.minutes;
  savePlan();
  updateBudget();
  id("start-timer").focus();
  announce("Zeit gestoppt. Die Sätze bleiben abgehakt.");
});

id("add").addEventListener("click", (event) => openEditor(null, event.currentTarget));
id("cancel").addEventListener("click", () => editor.close());
editor.addEventListener("close", () => {
  returnFocus?.focus();
  returnFocus = null;
});
field("name").addEventListener("input", () => field("name").setCustomValidity(""));
editorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const changes = {
    name: field("name").value.trim(),
    sets: field("sets").valueAsNumber,
    minutes: field("setMinutes").valueAsNumber,
    core: field("core").checked,
  };
  if (!validExercise(changes)) {
    field("name").setCustomValidity("Gib einen Namen für die Übung ein.");
    editorForm.reportValidity();
    return;
  }
  const existing = plan.exercises.find((entry) => entry.id === editing);
  if (editing && !existing) return;
  if (!existing && plan.exercises.length >= limits.exercises) return;
  const entry = existing ?? { id: crypto.randomUUID(), completed: 0, blocked: false };
  Object.assign(entry, changes);
  entry.completed = Math.min(entry.completed, entry.sets);
  if (entry.completed === entry.sets) entry.blocked = false;
  if (!existing) plan.exercises.push(entry);
  saveAndRender(entry.name + " gespeichert.");
  returnFocus = rows.get(entry.id).querySelector('[data-action="edit"]');
  editor.close();
});
id("delete").addEventListener("click", () => {
  const entry = plan.exercises.find((item) => item.id === editing);
  if (!entry || !window.confirm("„" + entry.name + "“ aus dem Plan entfernen?")) return;
  plan.exercises = plan.exercises.filter((item) => item !== entry);
  saveAndRender(entry.name + " entfernt.");
  returnFocus = id("add");
  editor.close();
});

id("example").addEventListener("click", () => {
  plan.exercises = [
    { name: "Bankdrücken", sets: 3, minutes: 4, core: true },
    { name: "Kurzhantelrudern", sets: 3, minutes: 3, core: true },
    { name: "Latzug", sets: 3, minutes: 2, core: false },
    { name: "Bizepscurls", sets: 2, minutes: 2, core: false },
  ].map((entry) => ({ ...entry, id: crypto.randomUUID(), completed: 0, blocked: false }));
  saveAndRender("Beispielplan mit vier Übungen geladen.");
  id("add").focus();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const entry = plan.exercises.find((item) => item.id === button.closest(".exercise").dataset.id);
  const action = button.dataset.action;
  if (!entry) return;
  if (action === "edit") {
    openEditor(entry, button);
    return;
  }
  if (action === "complete") entry.completed++;
  if (action === "undo") entry.completed--;
  if (action === "block") entry.blocked = !entry.blocked;
  saveAndRender(action === "block"
    ? entry.name + (entry.blocked ? " als belegt markiert." : " wieder verfügbar.")
    : entry.name + ". " + entry.completed + " von " + entry.sets + " Sätzen erledigt.");
  focusRow(entry.id, action);
});
id("reset").addEventListener("click", () => {
  if (!window.confirm("Erledigte Sätze und belegte Geräte zurücksetzen?")) return;
  for (const entry of plan.exercises) {
    entry.completed = 0;
    entry.blocked = false;
  }
  plan.deadline = null;
  minutes.value = plan.minutes;
  saveAndRender("Fortschritt zurückgesetzt.");
  id("start-timer").focus();
});

window.addEventListener("storage", (event) => {
  if (event.key !== storageKey && event.key !== null) return;
  plan = readPlan();
  if (editor.open) editor.close();
  minutes.value = plan.minutes;
  render();
});
minutes.value = plan.minutes;
render();
window.setInterval(updateBudget, 1000);
document.addEventListener("visibilitychange", updateBudget);
window.addEventListener("pageshow", updateBudget);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(() => { id("offline-ready").hidden = false; })
    .catch(() => { /* The current page remains usable on its first online visit. */ });
}
