import {
  database,
  element as el,
  button,
  download,
  registerOffline,
  persistentStorage,
} from "./storage.js";
import {
  newEntry,
  transition,
  todayEntries,
  parkedEntries,
  today,
  dayAfter,
  linksIn,
  validate,
  encodeBackup,
  decodeBackup,
  merge,
  MIME,
  LIMITS,
} from "./model.js";
import { prepareRecording } from "./audio.js";
const $ = (id) => document.getElementById(id),
  db = database("weiter");
let data = { entries: [], draft: "", timer: null },
  editor = null,
  tab = "TODAY",
  timerEntry = null,
  queue = Promise.resolve(),
  recorder = null,
  recordStream = null,
  recordChunks = [],
  recordLimit = null,
  recordingPending = false,
  attachmentUrls = [],
  notified = new Set(),
  loaded = false;
const places = {
  HOME: "Zuhause",
  OUTSIDE: "Unterwegs",
  ONLINE: "Online",
  WAITING: "Warten auf",
};
const tabs = {
  TODAY: "Heute",
  INBOX: "Inbox",
  PARKED: "Parkplatz",
  DONE: "Erledigt",
  TRASH: "Papierkorb",
};
function status(text) {
  $("status").textContent = text;
}
function run(task) {
  return task().catch((e) =>
    status(e.message || "Die Aktion konnte nicht abgeschlossen werden."),
  );
}
function enqueue(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function update(change) {
  return enqueue(async () => {
    const next = validate(change(structuredClone(data)));
    await db.set("state", next);
    data = next;
    render();
  });
}
function toast(text, undo) {
  const root = $("toast");
  root.replaceChildren(el("span", text));
  if (undo)
    root.append(
      button("Rückgängig", () =>
        run(async () => {
          await undo();
          root.hidden = true;
        }),
      ),
    );
  root.hidden = false;
}
function render() {
  $("tabs").replaceChildren(
    ...Object.entries(tabs).map(([key, label]) => {
      const b = button(
        `${label} (${key === "TODAY" ? todayEntries(data).length : key === "PARKED" ? parkedEntries(data).length : data.entries.filter((e) => e.status === key).length})`,
        () => {
          tab = key;
          render();
        },
      );
      if (key === tab) b.setAttribute("aria-current", "page");
      return b;
    }),
  );
  const root = $("view");
  root.replaceChildren(el("h2", tabs[tab]));
  let entries =
    tab === "TODAY"
      ? todayEntries(data)
      : tab === "PARKED"
        ? parkedEntries(data)
        : data.entries
            .filter((e) => e.status === tab)
            .sort((a, b) => b.updatedAt - a.updatedAt);
  if (tab === "TODAY") {
    const completed = data.entries.filter(
      (e) => e.status === "DONE" && e.completedDate === today(),
    ).length;
    root.append(
      el("p", `${completed} erledigt · ${entries.length} offen heute`),
    );
    const p = el("progress");
    p.max = Math.max(1, completed + entries.length);
    p.value = completed;
    p.setAttribute("aria-label", "Tagesfortschritt");
    root.append(p);
    root.append(el("p", "Deine nächsten drei Schritte", "eyebrow"));
  }
  if (!entries.length)
    root.append(
      el(
        "div",
        tab === "INBOX"
          ? "Hier landen deine Gedanken. Halte oben etwas fest."
          : tab === "TODAY"
            ? "Heute ist noch frei. Kläre einen Gedanken aus der Inbox."
            : "Hier gibt es noch keine Einträge.",
        "empty",
      ),
    );
  entries.forEach((e, index) => {
    if (tab === "TODAY" && index === 3)
      root.append(el("h3", "Weitere offene Aufgaben"));
    root.append(entryCard(e));
  });
  renderTimer();
  $("resumeEditor").hidden = !editor || $("editor").open;
}
function entryCard(e) {
  const article = el("article", undefined, "entry");
  article.dataset.entryId = e.id;
  article.append(el("h3", e.nextStep || e.thought));
  if (e.nextStep) article.append(el("p", e.thought, "muted"));
  const details = `${e.minutes} Min. · ${places[e.place]}${e.dueDate ? " · " + e.dueDate : ""}${e.reminderAt ? " · Erinnerung " + new Date(e.reminderAt).toLocaleString("de-DE") : ""}${e.attachments.length ? " · " + e.attachments.length + " Anhänge" : ""}`;
  article.append(el("p", details, "muted"));
  const actions = el("div", undefined, "row actions");
  if (e.status === "TRASH")
    actions.append(button("Wiederherstellen", () => act(e, "restore")));
  else if (e.status === "DONE")
    actions.append(
      button("Wieder öffnen", () => act(e, "reopen")),
      button("Löschen", () => act(e, "trash"), "danger"),
    );
  else {
    actions.append(
      button("Öffnen / bearbeiten", () => openEditor(e)),
      button("Erledigt", () => act(e, "complete")),
      button("Fokus", () => {
        timerEntry = e.id;
        $("timerMinutes").value = e.minutes;
        $("timerDialog").showModal();
      }),
    );
    const parking = el("select");
    parking.setAttribute(
      "aria-label",
      `Verschieben: ${e.nextStep || e.thought}`,
    );
    for (const [v, t] of [
      ["", "Verschieben …"],
      ["today", "Heute"],
      ["tomorrow", "Morgen"],
      ["week", "Nächste Woche"],
      ["none", "Ohne Datum"],
    ]) {
      const o = el("option", t);
      o.value = v;
      parking.append(o);
    }
    parking.addEventListener("change", () => {
      if (parking.value)
        run(async () => {
          const date =
            parking.value === "none"
              ? null
              : dayAfter(
                  parking.value === "tomorrow"
                    ? 1
                    : parking.value === "week"
                      ? 7
                      : 0,
                );
          await update((d) => ({
            ...d,
            entries: d.entries.map((x) =>
              x.id === e.id ? transition(x, "park", Date.now(), date) : x,
            ),
          }));
          status("Aufgabe verschoben.");
        });
    });
    actions.append(
      parking,
      button("Löschen", () => act(e, "trash"), "danger"),
    );
  }
  article.append(actions);
  return article;
}
function act(e, action) {
  return run(async () => {
    await update((d) => ({
      ...d,
      entries: d.entries.map((x) =>
        x.id === e.id ? transition(x, action) : x,
      ),
      timer:
        d.timer?.entryId === e.id && ["complete", "trash"].includes(action)
          ? null
          : d.timer,
    }));
    toast(
      action === "trash"
        ? "In den Papierkorb verschoben."
        : action === "complete"
          ? "Ein Schritt geschafft."
          : "Eintrag aktualisiert.",
      action === "trash"
        ? () =>
            update((d) => ({
              ...d,
              entries: d.entries.map((x) =>
                x.id === e.id ? transition(x, "restore") : x,
              ),
            }))
        : null,
    );
  });
}
async function saveEditorDraft() {
  if (editor) await db.set("editor", editor);
}
function localDateTime(time) {
  const d = new Date(time);
  return `${today(time)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function collectEditor() {
  if (!editor) return;
  for (const [field, id] of [
    ["thought", "editThought"],
    ["nextStep", "nextStep"],
    ["notes", "notes"],
    ["place", "place"],
  ])
    editor[field] = $(id).value;
  editor.minutes = Number($("minutes").value);
  editor.when = $("when").value;
  editor.date = $("dueDate").value;
  editor.reminder = $("reminder").value;
  editor.reminderTime = $("reminderAt").value;
  $("dateLabel").hidden = editor.when !== "date";
  $("reminderLabel").hidden = editor.reminder !== "custom";
}
function openEditor(entry) {
  if (editor && editor.id !== entry.id) {
    status(
      "Es gibt eine offene Bearbeitung. Bitte diese zuerst speichern oder verwerfen.",
    );
    return resumeEditor();
  }
  if (!editor) {
    editor = {
      ...structuredClone(entry),
      when: entry.dueDate
        ? entry.dueDate === today()
          ? "today"
          : "date"
        : entry.status === "PARKED"
          ? "later"
          : "today",
      date: entry.dueDate || today(),
      reminder: entry.reminderAt ? "custom" : "none",
      reminderTime: entry.reminderAt ? localDateTime(entry.reminderAt) : "",
    };
    run(saveEditorDraft);
  }
  resumeEditor();
}
function resumeEditor() {
  if (!editor) return;
  for (const [field, id] of [
    ["thought", "editThought"],
    ["nextStep", "nextStep"],
    ["notes", "notes"],
    ["minutes", "minutes"],
    ["place", "place"],
    ["when", "when"],
    ["date", "dueDate"],
    ["reminder", "reminder"],
    ["reminderTime", "reminderAt"],
  ])
    $(id).value = editor[field];
  $("dateLabel").hidden = editor.when !== "date";
  $("reminderLabel").hidden = editor.reminder !== "custom";
  const suggested = /\bmorgen\b/i.test(editor.thought);
  $("suggestion").hidden = !suggested;
  $("suggestion").replaceChildren(
    el("span", "„Morgen“ erkannt. Soll dieser Gedanke auf morgen? "),
    button("Morgen übernehmen", () => {
      $("when").value = "date";
      $("dueDate").value = dayAfter(1);
      collectEditor();
      run(saveEditorDraft);
    }),
  );
  showAttachments();
  if (!$("editor").open) $("editor").showModal();
  $("resumeEditor").hidden = true;
}
async function closeEditor() {
  collectEditor();
  await saveEditorDraft();
  stopRecording();
  $("editor").close();
  render();
}
async function commitEditor(clarify) {
  if (recorder?.state === "recording" || recordingPending)
    throw Error(
      "Beende zuerst die Sprachnotiz und warte, bis sie als Anhang gespeichert ist.",
    );
  collectEditor();
  if (!$("editForm").reportValidity()) return;
  const original = data.entries.find((e) => e.id === editor.id);
  if (!original) throw Error("Der Eintrag ist nicht mehr vorhanden.");
  const dueDate =
    editor.when === "today"
      ? today()
      : editor.when === "date"
        ? editor.date
        : null;
  if (editor.when === "date" && !dueDate)
    throw Error("Bitte ein Datum wählen.");
  let reminderAt = null;
  if (editor.reminder === "today") reminderAt = Date.now() + 3600000;
  else if (editor.reminder === "tomorrow")
    reminderAt = new Date(dayAfter(1) + "T09:00:00").getTime();
  else if (editor.reminder === "custom") {
    reminderAt = new Date(editor.reminderTime).getTime();
    if (!Number.isFinite(reminderAt) || reminderAt <= 0)
      throw Error("Bitte eine gültige Erinnerungszeit wählen.");
  }
  let next = {
    ...original,
    thought: editor.thought.trim(),
    nextStep: editor.nextStep,
    notes: editor.notes,
    minutes: editor.minutes,
    place: editor.place,
    dueDate,
    reminderAt,
    attachments: editor.attachments,
    links: linksIn(editor.thought + " " + editor.notes),
    updatedAt: Date.now(),
  };
  if (!next.thought) throw Error("Der Gedanke darf nicht leer sein.");
  if (clarify) {
    next = transition(
      { ...next, status: editor.when === "later" ? "PARKED" : "INBOX" },
      "clarify",
    );
  } else if (["TODAY", "PARKED"].includes(original.status)) {
    next.status =
      editor.when === "later" || dueDate > today() ? "PARKED" : "TODAY";
  }
  await update((d) => ({
    ...d,
    entries: d.entries.map((e) => (e.id === next.id ? next : e)),
  }));
  await db.set("editor", null);
  editor = null;
  stopRecording();
  $("editor").close();
  clearUrls();
  tab = clarify ? (next.status === "TODAY" ? "TODAY" : "PARKED") : tab;
  render();
  status(clarify ? "Gedanke geklärt." : "Änderungen gespeichert.");
}
function clearUrls() {
  attachmentUrls.forEach(URL.revokeObjectURL);
  attachmentUrls = [];
}
function showAttachments() {
  clearUrls();
  const root = $("attachments");
  root.replaceChildren(el("h3", "Optionale Anhänge"));
  for (const a of editor.attachments) {
    const card = el("div", undefined, "attachment");
    card.append(el("p", a.name));
    const bytes = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: a.mime }));
    attachmentUrls.push(url);
    const media = el(a.mime.startsWith("image/") ? "img" : "audio");
    media.src = url;
    if (media.tagName === "IMG") media.alt = a.name;
    else media.controls = true;
    card.append(
      media,
      button("Anhang entfernen", () =>
        run(async () => {
          editor.attachments = editor.attachments.filter((x) => x.id !== a.id);
          await saveEditorDraft();
          showAttachments();
        }),
      ),
    );
    root.append(card);
  }
}
async function addAttachment(file) {
  if (!file || !editor) return;
  if (editor.attachments.length >= LIMITS.attachments)
    throw Error("Höchstens 8 Anhänge pro Eintrag.");
  if (
    file.type.startsWith("image/") &&
    (!MIME.includes(file.type) || file.size > LIMITS.attachment)
  )
    file = await compatiblePhoto(file);
  const mime = file.type.split(";")[0].toLowerCase();
  if (!MIME.includes(mime))
    throw Error(
      "Bitte JPEG, PNG, WebP oder eine unterstützte Audiodatei wählen (z. B. M4A/MP3/WAV).",
    );
  if (!file.size || file.size > LIMITS.attachment)
    throw Error("Ein Anhang darf höchstens 3 MB groß sein.");
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(Error("Anhang konnte nicht gelesen werden."));
    r.readAsDataURL(file);
  });
  const attachment = {
    id: crypto.randomUUID(),
    name: (file.name || "Sprachnotiz.m4a")
      .replace(/[\/\\\x00-\x1f\x7f-\x9f]/g, "_")
      .slice(0, 200),
    mime,
    base64,
  };
  const proposed = {
    ...editor,
    attachments: [...editor.attachments, attachment],
  };
  validate({
    ...data,
    entries: data.entries.map((e) =>
      e.id === editor.id ? { ...e, attachments: proposed.attachments } : e,
    ),
  });
  editor = proposed;
  await saveEditorDraft();
  showAttachments();
  $("attachmentStatus").textContent =
    "Anhang im lokalen Bearbeitungsentwurf gespeichert.";
}
async function compatiblePhoto(file) {
  if (file.size > 25 * 1024 * 1024)
    throw Error("Bitte ein Foto bis 25 MB auswählen.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw Error(
        "Dieses Fotoformat kann der Browser nicht öffnen. Bitte JPEG oder PNG wählen.",
      );
    }
    const scale = Math.min(
        1,
        1920 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw Error("Das Foto konnte nicht umgewandelt werden.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
function stopRecording() {
  clearTimeout(recordLimit);
  recordLimit = null;
  if (recorder?.state === "recording") recorder.stop();
  recordStream?.getTracks().forEach((t) => t.stop());
  recordStream = null;
  $("record").textContent = "Sprachnotiz aufnehmen";
}
async function record() {
  if (recorder?.state === "recording") {
    stopRecording();
    return;
  }
  if (recordingPending)
    throw Error("Die Aufnahme wird noch gespeichert. Bitte kurz warten.");
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia)
    throw Error(
      "Aufnahme wird hier nicht unterstützt. Du kannst eine Audiodatei hinzufügen.",
    );
  const recordingEditor = editor.id;
  try {
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw Error(
      "Mikrofon nicht freigegeben. Texte und Datei-Anhänge funktionieren weiterhin.",
    );
  }
  if (editor?.id !== recordingEditor || !$("editor").open || document.hidden) {
    stopRecording();
    return;
  }
  const mime = [
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/webm;codecs=opus",
    "audio/webm",
  ].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) {
    stopRecording();
    throw Error(
      "Kein kompatibles Aufnahmeformat. Bitte eine M4A/MP3-Datei hinzufügen.",
    );
  }
  recordChunks = [];
  recorder = new MediaRecorder(recordStream, {
    mimeType: mime,
    audioBitsPerSecond: 64000,
  });
  let size = 0;
  recorder.ondataavailable = (e) => {
    if (e.data.size) {
      recordChunks.push(e.data);
      size += e.data.size;
      if (size > LIMITS.attachment) stopRecording();
    }
  };
  recorder.onstop = () => {
    recordStream?.getTracks().forEach((t) => t.stop());
    recordStream = null;
    $("record").textContent = "Sprachnotiz aufnehmen";
    clearTimeout(recordLimit);
    recordLimit = null;
    const chunks = recordChunks;
    run(async () => {
      try {
        const blob = await prepareRecording(chunks, mime);
        if (editor?.id !== recordingEditor) return;
        const extension =
          blob.type === "audio/wav"
            ? "wav"
            : mime.startsWith("audio/mp4")
              ? "m4a"
              : "ogg";
        await addAttachment(
          new File([blob], `Sprachnotiz-${Date.now()}.${extension}`, {
            type: blob.type,
          }),
        );
      } finally {
        recordingPending = false;
      }
    });
  };
  recorder.start(1000);
  recordingPending = true;
  recordLimit = setTimeout(() => {
    stopRecording();
    $("attachmentStatus").textContent =
      "Nach 60 Sekunden beendet. Aufnahme wird lokal gespeichert …";
  }, 60000);
  $("record").textContent = "Aufnahme beenden";
  $("attachmentStatus").textContent =
    "Mikrofon nimmt lokal auf (maximal 60 Sekunden). Beende die Aufnahme, bevor du den Eintrag speicherst.";
}
function renderTimer() {
  const timer = data.timer,
    entry = data.entries.find((e) => e.id === timer?.entryId);
  $("focus").hidden = !timer || !entry;
  if (!timer || !entry) return;
  const seconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
  $("focusTitle").textContent = entry.nextStep || entry.thought;
  $("focusClock").textContent =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  $("focusState").textContent = seconds
    ? "Ein kleiner Anfang genügt."
    : "Fokuszeit geschafft. Du entscheidest, ob der Schritt erledigt ist.";
}
async function checkReminders() {
  if (!loaded) return;
  renderTimer();
  for (const e of data.entries) {
    const key = e.id + ":" + e.reminderAt;
    if (
      !e.reminderAt ||
      e.reminderAt > Date.now() ||
      ["DONE", "TRASH"].includes(e.status) ||
      notified.has(key)
    )
      continue;
    notified.add(key);
    status("Erinnerung: " + (e.nextStep || e.thought));
    if ("Notification" in window && Notification.permission === "granted")
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification("Weiter · Dein nächster Schritt", {
          body: e.nextStep || e.thought,
          tag: e.id,
          icon: "icon-192.png",
        });
      } catch {}
    await db.set("notified", [...notified]);
  }
}
$("captureForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(async () => {
    const entry = newEntry($("thought").value);
    await update((d) => ({ ...d, entries: [...d.entries, entry], draft: "" }));
    $("thought").value = "";
    tab = "INBOX";
    render();
    status("Gedanke in der Inbox gespeichert.");
  });
});
$("thought").addEventListener("input", () => {
  const value = $("thought").value;
  run(() => update((d) => ({ ...d, draft: value })));
});
for (const node of $("editForm").querySelectorAll(
  "input:not([type=file]),textarea,select",
))
  node.addEventListener("input", () => {
    collectEditor();
    run(saveEditorDraft);
  });
$("editForm").addEventListener("submit", (e) => {
  e.preventDefault();
  run(() => commitEditor(false));
});
$("clarify").onclick = () => run(() => commitEditor(true));
$("closeEditor").onclick = () => run(closeEditor);
$("editor").addEventListener("cancel", (e) => {
  e.preventDefault();
  run(closeEditor);
});
$("resumeEditor").onclick = resumeEditor;
$("discardEdit").onclick = () =>
  run(async () => {
    stopRecording();
    await db.set("editor", null);
    editor = null;
    clearUrls();
    $("editor").close();
    render();
  });
$("attachmentInput").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  run(() => addAttachment(file));
};
$("record").onclick = () => run(record);
for (const minutes of [5, 15, 25])
  $("timerPresets").append(
    button(`${minutes} Minuten`, () => {
      $("timerMinutes").value = minutes;
    }),
  );
$("timerForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    if (data.timer && !confirm("Den laufenden Fokus-Timer ersetzen?")) return;
    const durationMinutes = Number($("timerMinutes").value);
    await update((d) => ({
      ...d,
      timer: {
        entryId: timerEntry,
        durationMinutes,
        endsAt: Date.now() + durationMinutes * 60000,
      },
    }));
    $("timerDialog").close();
    $("focus").scrollIntoView({ block: "center" });
  });
};
$("closeTimer").onclick = () => $("timerDialog").close();
$("focusCancel").onclick = () =>
  run(() => update((d) => ({ ...d, timer: null })));
$("focusDone").onclick = () => {
  const entry = data.entries.find((e) => e.id === data.timer?.entryId);
  if (entry) act(entry, "complete");
};
$("export").onclick = () =>
  run(async () =>
    download(
      new Blob([encodeBackup(data)], { type: "application/json" }),
      `Weiter-${today()}.json`,
    ),
  );
$("import").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  run(async () => {
    if (file.size > LIMITS.json)
      throw Error("Die Sicherung ist größer als 24 MB.");
    const incoming = decodeBackup(await file.text());
    await update((d) => merge(d, incoming));
    $("thought").value = data.draft;
    status(
      "Sicherung geprüft und zusammengeführt. Vorhandene Einträge wurden beibehalten.",
    );
  });
};
$("notificationPermission").onclick = () =>
  run(async () => {
    if (!("Notification" in window))
      throw Error(
        "Dieser Browser unterstützt keine Benachrichtigungen. Erinnerungen bleiben in der App sichtbar.",
      );
    const permission = await Notification.requestPermission();
    $("notificationState").textContent =
      permission === "granted"
        ? "Erlaubt, solange die Web-App aktiv ist."
        : "Nicht erlaubt. Die App bleibt vollständig nutzbar.";
  });
$("persist").onclick = () =>
  run(async () =>
    status(
      (await persistentStorage())
        ? "Browser hat dauerhaften lokalen Speicher gewährt. Sicherungen bleiben empfohlen."
        : "Der Browser entscheidet über die Speicherdauer. Bitte regelmäßig JSON-Sicherungen exportieren.",
    ),
  );
$("clearAll").onclick = () =>
  run(async () => {
    if (
      !confirm(
        "Alle Weiter-Daten einschließlich Anhängen und Entwürfen von diesem Browser löschen? Eine exportierte Sicherung bleibt erhalten.",
      )
    )
      return;
    stopRecording();
    await queue;
    await db.clear();
    data = { entries: [], draft: "", timer: null };
    editor = null;
    notified.clear();
    $("thought").value = "";
    $("editor").close();
    clearUrls();
    render();
    status("Alle lokalen Weiter-Daten gelöscht.");
  });
window.addEventListener("pagehide", stopRecording);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopRecording();
  else run(checkReminders);
});
async function init() {
  try {
    const saved = await db.get("state");
    if (saved) data = validate(saved);
    editor = (await db.get("editor")) || null;
    notified = new Set((await db.get("notified")) || []);
    $("thought").value = data.draft;
    loaded = true;
    render();
    const params = new URLSearchParams(location.search);
    const shared = [params.get("title"), params.get("text"), params.get("url")]
      .filter(Boolean)
      .join("\n");
    if (shared) {
      history.replaceState(null, "", location.pathname);
      const entry = newEntry(shared);
      await update((d) => ({ ...d, entries: [...d.entries, entry] }));
      tab = "INBOX";
      render();
      status("Geteilten Text lokal in der Inbox gespeichert.");
    }
    registerOffline($("offlineStatus"));
    await checkReminders();
  } catch (e) {
    status(e.message);
    $("captureButton").disabled = true;
  }
}
setInterval(() => run(checkReminders), 1000);
init();
