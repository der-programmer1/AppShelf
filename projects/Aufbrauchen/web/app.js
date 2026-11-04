import {
  UNITS,
  PLACES,
  CATEGORIES,
  DATE_KINDS,
  LIMIT,
  today,
  plusDays,
  quantity,
  amount,
  emptyState,
  editor,
  saveEditor,
  action,
  addShopping,
  commit,
  undo,
  stock,
  ordered,
  dueItems,
  favorites,
  encode,
  decode,
  merge,
} from "./model.js";
import { repository, element as el, button, download } from "./storage.js";
const $ = (id) => document.getElementById(id),
  repo = repository();
let state = emptyState(),
  tab = "today",
  search = "",
  place = "",
  category = "",
  formDraft = null,
  consumeId = null,
  savePending = false,
  ready = false,
  undoHidden = false;
const tabs = {
  today: "Heute",
  stock: "Vorrat",
  shopping: "Einkauf",
  more: "Mehr",
};
const dateText = (day) =>
  new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
function status(message) {
  $("status").textContent = message;
}
async function run(fn) {
  try {
    return await fn();
  } catch (e) {
    status(e.message || "Diese Aktion konnte nicht abgeschlossen werden.");
    if ($("editor").open) $("editorError").textContent = e.message;
    if ($("consumeDialog").open) $("consumeError").textContent = e.message;
  }
}
async function change(fn) {
  state = await repo.change(fn);
  render();
  return state;
}
async function mutate(label, fn, clearEditor = false) {
  undoHidden = false;
  return change((current) => ({
    ...commit(current, fn(current.data), label),
    editor: clearEditor ? null : current.editor,
  }));
}
function render() {
  $("addItem").disabled = !ready;
  $("intro").hidden = !ready || state.data.settings.onboarded;
  $("resumeDraft").hidden = !state.editor || $("editor").open;
  $("tabs").replaceChildren(
    ...Object.entries(tabs).map(([id, label]) => {
      const b = button(label, () => {
        tab = id;
        render();
      });
      if (tab === id) b.setAttribute("aria-current", "page");
      return b;
    }),
  );
  const root = $("content");
  root.replaceChildren();
  if (!ready) {
    root.append(el("p", "Lokaler Speicher wird geöffnet …", "muted"));
    return;
  }
  if (tab === "today") renderToday(root);
  if (tab === "stock") renderStock(root);
  if (tab === "shopping") renderShopping(root);
  if (tab === "more") renderMore(root);
  const bar = $("undoBar");
  bar.hidden = !state.undo || undoHidden;
  if (state.undo) {
    bar.replaceChildren(
      el("span", state.undo.label),
      button("Rückgängig", () => run(() => change(undo))),
      button(
        "×",
        () => {
          undoHidden = true;
          bar.hidden = true;
        },
        "quiet",
      ),
    );
    bar.lastElementChild.setAttribute('aria-label','Hinweis schließen');
  }
}
function empty(root, title, text) {
  const n = el("div", undefined, "empty");
  n.append(el("strong", title), el("span", text));
  root.append(n);
}
function renderToday(root) {
  const active = stock(state.data),
    due = dueItems(state.data),
    open = state.data.shopping.filter((x) => x.status === "open"),
    stats = el("div", undefined, "stats");
  for (const [n, label] of [
    [active.length, "Vorräte"],
    [due.length, "bald dran"],
    [open.length, "auf der Liste"],
  ]) {
    const card = el("div", undefined, "stat");
    card.append(el("strong", String(n)), el("span", label));
    stats.append(card);
  }
  root.append(stats);
  root.append(
    el("h2", "Das kommt zuerst"),
    el(
      "p",
      `Datumsübersicht für heute und die nächsten ${state.data.settings.soonDays} Tage.`,
      "muted",
    ),
  );
  if (!due.length)
    empty(
      root,
      active.length
        ? "Alles im Blick"
        : "Dein Vorrat beginnt mit einem Eintrag",
      active.length
        ? "Im gewählten Zeitraum ist kein eingetragenes Datum fällig. Lebensmittel ohne Datum findest du unter Vorrat."
        : "Füge zum Beispiel einen Joghurt, dein Brot oder eine Packung Reis hinzu. Es werden keine Beispielvorräte angelegt.",
    );
  const list = el("div", undefined, "list");
  due.forEach((item) => list.append(itemCard(item)));
  root.append(list);
  const templates = favorites(state.data);
  if (templates.length) {
    root.append(el("h2", "Deine Vorlagen", "group-title"));
    const chips = el("div", undefined, "chips");
    for (const row of templates) {
      const wrap = el("div", undefined, "row");
      wrap.append(
        button("+ " + row.name, () => startTemplate(row)),
        button(
          "Entfernen",
          () =>
            run(() =>
              mutate("Vorlage entfernt.", (data) =>
                data.items
                  .filter(
                    (x) =>
                      x.favorite &&
                      x.unit === row.unit &&
                      x.name.toLowerCase() === row.name.toLowerCase(),
                  )
                  .reduce(
                    (next, item) => action(next, item.id, "favorite"),
                    data,
                  ),
              ),
            ),
          "quiet",
        ),
      );
      chips.append(wrap);
    }
    root.append(chips);
  }
  const info = el("details", undefined, "settings-card");
  info.append(
    el("summary", "Was bedeuten die Datumsangaben?"),
    el(
      "p",
      "Mindesthaltbarkeit ist kein automatisches Wegwerfdatum. Das Verbrauchsdatum („zu verbrauchen bis“) ist eine Sicherheitsgrenze. Aufbrauchen zeigt nur deine Eingaben und prüft keine Lebensmittel auf Frische.",
    ),
  );
  root.append(info);
}
function itemCard(row, archive = false) {
  const card = el("article", undefined, "item");
  card.dataset.itemId = row.id;
  const head = el("div", undefined, "item-head");
  head.append(el("h3", row.name));
  if (!archive) {
    const star = button(
      row.favorite ? "★" : "☆",
      () => act(row.id, "favorite", "Vorlage aktualisiert."),
      "favorite",
    );
    star.setAttribute(
      "aria-label",
      row.favorite
        ? `Vorlage entfernen: ${row.name}`
        : `Als Vorlage merken: ${row.name}`,
    );
    star.setAttribute("aria-pressed", String(row.favorite));
    head.append(star);
  }
  card.append(
    head,
    el("p", `${amount(row.quantityMilli)} ${UNITS[row.unit]}`, "quantity"),
    el("p", `${PLACES[row.place]} · ${CATEGORIES[row.category]}`, "meta"),
  );
  if (row.date)
    card.append(
      el(
        "p",
        `${DATE_KINDS[row.dateKind]} · ${dateText(row.date)}${row.date < today() ? " · Datum überschritten" : row.date === today() ? " · Heute" : ""}`,
        "date-tag",
      ),
    );
  if (row.openedOn)
    card.append(el("p", "Geöffnet am " + dateText(row.openedOn), "meta"));
  if (row.note) card.append(el("p", row.note, "note meta"));
  const actions = el("div", undefined, "actions");
  if (row.status === "trash")
    actions.append(
      button("Wiederherstellen", () =>
        act(row.id, "restore", "Vorrat wiederhergestellt."),
      ),
    );
  else if (archive) {
    card.append(
      el(
        "p",
        row.status === "used"
          ? "Als aufgebraucht markiert"
          : "Als entsorgt markiert",
        "meta",
      ),
    );
    actions.append(
      button("Wieder öffnen", () =>
        act(row.id, "reopen", "Vorrat wieder geöffnet."),
      ),
      button("Erneut erfassen", () => startTemplate(row)),
      button(
        "Löschen",
        () => act(row.id, "trash", "In den Papierkorb verschoben."),
        "danger",
      ),
    );
  } else {
    actions.append(
      button("Verbrauchen", () => startConsume(row), "primary"),
      button("Einkaufen", () =>
        act(row.id, "shopping", "Menge auf die Einkaufsliste übernommen."),
      ),
      button("Bearbeiten", () => openEditor(editor("item", undefined, row))),
    );
    const more = el("details");
    more.append(
      el("summary", "Weitere Aktionen"),
      button("Als entsorgt markieren", () =>
        act(row.id, "discard", "Als entsorgt markiert."),
      ),
      button(
        "Löschen",
        () => act(row.id, "trash", "In den Papierkorb verschoben."),
        "danger",
      ),
    );
    card.append(more);
  }
  card.append(actions);
  return card;
}
function act(id, operation, label) {
  return run(() => mutate(label, (data) => action(data, id, operation)));
}
function renderStock(root) {
  root.append(el("h2", "Dein Vorrat"));
  const controls = el("div", undefined, "filters"),
    nameLabel = el("label", "Suchen"),
    input = el("input");
  input.type = "search";
  input.value = search;
  input.placeholder = "Name oder Notiz";
  input.id = "stockSearch";
  nameLabel.append(input);
  controls.append(nameLabel);
  for (const [key, label, options, current] of [
    ["place", "Lagerort", PLACES, place],
    ["category", "Gruppe", CATEGORIES, category],
  ]) {
    const l = el("label", label),
      select = el("select");
    select.id = "filter-" + key;
    const all = el("option", "Alle");
    all.value = "";
    select.append(all);
    for (const [value, text] of Object.entries(options)) {
      const o = el("option", text);
      o.value = value;
      select.append(o);
    }
    select.value = current;
    select.onchange = () => {
      if (key === "place") place = select.value;
      else category = select.value;
      renderRows();
    };
    l.append(select);
    controls.append(l);
  }
  root.append(controls);
  const list = el("div", undefined, "list");
  list.id = "stockList";
  root.append(list);
  input.oninput = () => {
    search = input.value;
    renderRows();
  };
  function renderRows() {
    list.replaceChildren();
    const q = search.trim().toLowerCase(),
      rows = ordered(
        stock(state.data).filter(
          (x) =>
            (!place || x.place === place) &&
            (!category || x.category === category) &&
            (!q || (x.name + " " + x.note).toLowerCase().includes(q)),
        ),
      );
    if (!rows.length)
      empty(
        list,
        "Keine passenden Vorräte",
        stock(state.data).length
          ? "Ändere deine Suche oder die Filter."
          : "Füge deinen ersten Vorrat hinzu.",
      );
    rows.forEach((row) => list.append(itemCard(row)));
  }
  renderRows();
}
function renderShopping(root) {
  const heading = el("div", undefined, "section-head");
  heading.append(
    el("h2", "Dein nächster Einkauf"),
    button("+ Position", () => openEditor(editor("shop")), "primary"),
  );
  root.append(
    heading,
    el(
      "p",
      "Gekauft abhaken, danach mit Menge und optionalem Datum in den Vorrat übernehmen.",
      "muted",
    ),
  );
  const rows = state.data.shopping
    .filter((x) => ["open", "checked"].includes(x.status))
    .sort((a, b) => a.createdAt - b.createdAt);
  if (!rows.length)
    empty(
      root,
      "Alles auf der Liste erledigt",
      "Trage einen Einkauf ein oder nutze „Einkaufen“ direkt an einem Vorrat.",
    );
  for (const row of rows) root.append(shopCard(row));
  const bought = state.data.shopping.filter((x) => x.status === "stocked");
  if (bought.length) {
    const details = el("details", undefined, "settings-card");
    details.append(el("summary", `Bereits eingelagert (${bought.length})`));
    for (const row of [...bought].reverse()) {
      const card = el("div", undefined, "item");
      card.append(
        el("h3", row.name),
        el(
          "p",
          `${amount(row.quantityMilli)} ${UNITS[row.unit]} · In den Vorrat übernommen`,
          "meta",
        ),
        button("Erneut einkaufen", () => {
          const d = editor("shop");
          d.values.name = row.name;
          d.values.amount = amount(row.quantityMilli);
          d.values.unit = row.unit;
          openEditor(d);
        }),
      );
      details.append(card);
    }
    root.append(details);
  }
}
function shopCard(row) {
  const card = el("article", undefined, "item");
  card.dataset.shopId = row.id;
  const label = el("label", undefined, "check"),
    check = el("input");
  check.type = "checkbox";
  check.checked = row.status === "checked";
  check.disabled = row.status === "trash";
  check.setAttribute("aria-label", `${row.name} gekauft`);
  check.onchange = () =>
    act(
      row.id,
      "check",
      row.status === "checked"
        ? "Einkauf wieder offen."
        : "Als gekauft markiert.",
    );
  label.append(check, el("strong", row.name));
  card.append(
    label,
    el("p", `${amount(row.quantityMilli)} ${UNITS[row.unit]}`, "quantity"),
  );
  if (row.note) card.append(el("p", row.note, "meta note"));
  const actions = el("div", undefined, "actions");
  if (row.status === "trash")
    actions.append(
      button("Wiederherstellen", () =>
        act(row.id, "restore", "Einkauf wiederhergestellt."),
      ),
    );
  else {
    if (row.status === "checked")
      actions.append(
        button(
          "In Vorrat übernehmen",
          () => openEditor(editor("item", undefined, null, row)),
          "primary",
        ),
      );
    actions.append(
      button("Bearbeiten", () => openEditor(editor("shop", undefined, row))),
      button(
        "Löschen",
        () => act(row.id, "trash", "Einkauf in den Papierkorb verschoben."),
        "danger",
      ),
    );
  }
  card.append(actions);
  return card;
}
function renderMore(root) {
  if(state.undo)root.append(button('Letzten Schritt rückgängig machen',()=>run(()=>change(undo))));
  root.append(el("h2", "Deine Daten, dein Überblick"));
  const settings = el("div", undefined, "settings-card");
  settings.append(el("h2", "Wie früh möchtest du planen?"));
  const label = el("label", "Unter „Heute“ anzeigen"),
    select = el("select");
  for (const day of [1, 3, 7, 14]) {
    const o = el("option", `${day} Tage im Voraus`);
    o.value = day;
    select.append(o);
  }
  select.value = state.data.settings.soonDays;
  select.id = "soonDays";
  select.onchange = () =>
    run(() =>
      mutate("Zeitraum angepasst.", (d) => ({
        ...d,
        settings: { ...d.settings, soonDays: Number(select.value) },
      })),
    );
  label.append(select);
  settings.append(label);
  root.append(settings);
  const backup = el("div", undefined, "settings-card");
  backup.append(
    el("h2", "Lokale Sicherung"),
    el(
      "p",
      "JSON-Sicherungen sind zwischen Android und Web austauschbar. Vorhandene Kennungen werden beim Import beibehalten. Ungültige Dateien verändern keine Daten. Sicherungen sind nicht verschlüsselt.",
    ),
  );
  const row = el("div", undefined, "row"),
    exportButton = button("JSON exportieren", () =>
      run(async () =>
        download(
          new Blob([encode(state.data)], { type: "application/json" }),
          `Aufbrauchen-${today()}.json`,
        ),
      ),
    );
  exportButton.id = "export";
  const importLabel = el("label", "JSON importieren", "file-button"),
    file = el("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.id = "import";
  file.onchange = () => {
    const picked = file.files[0];
    file.value = "";
    if (picked)
      run(async () => {
        if (picked.size > LIMIT.document)
          throw Error("Die Sicherung ist größer als 8 MB.");
        const incoming = decode(await picked.text());
        await mutate("Sicherung zusammengeführt.", (d) => merge(d, incoming));
        status(
          "Sicherung geprüft und zusammengeführt. Vorhandene Einträge wurden beibehalten.",
        );
      });
  };
  importLabel.append(file);
  row.append(exportButton, importLabel);
  backup.append(
    row,
    el(
      "p",
      "Browserdaten können bei Speicherknappheit oder im privaten Modus verschwinden. Bitte regelmäßig eine Sicherung exportieren. Bearbeitungsentwürfe bleiben lokal und sind nicht Teil der exportierten Sicherung.",
      "muted",
    ),
  );
  root.append(backup);
  const archive = el("details", undefined, "settings-card"),
    closed = state.data.items
      .filter((x) => ["used", "discarded"].includes(x.status))
      .sort((a, b) => b.closedAt - a.closedAt);
  archive.id = "archive";
  archive.append(el("summary", `Aufgebraucht & entsorgt (${closed.length})`));
  if (!closed.length)
    empty(
      archive,
      "Noch keine abgeschlossenen Vorräte",
      "Verbrauch und Entsorgen markierst du selbst.",
    );
  for (const item of closed) archive.append(itemCard(item, true));
  root.append(archive);
  const trash = el("details", undefined, "settings-card"),
    items = state.data.items.filter((x) => x.status === "trash"),
    shops = state.data.shopping.filter((x) => x.status === "trash");
  trash.id = "trash";
  trash.append(el("summary", `Papierkorb (${items.length + shops.length})`));
  if (!items.length && !shops.length)
    empty(
      trash,
      "Papierkorb ist leer",
      "Gelöschte Einträge bleiben hier, bis du sie wiederherstellst. Es gibt keine automatische Bereinigung.",
    );
  items.forEach((x) => trash.append(itemCard(x, true)));
  shops.forEach((x) => trash.append(shopCard(x)));
  root.append(trash);
  const privacy = el("details", undefined, "settings-card");
  privacy.append(
    el("summary", "Datenschutz & Nutzung auf Apple-Geräten"),
    el(
      "p",
      "Keine Konten, keine Medien-Uploads, kein Tracking und keine Werbung. Deine Eingaben bleiben in dieser Web-App. Android und Browser synchronisieren sich nicht automatisch; nutze dafür bewusst den JSON-Export und Import.",
    ),
    el(
      "p",
      "iPhone/iPad: Safari → Teilen → Zum Home-Bildschirm. Mac ab Safari 17: Ablage → Zum Dock hinzufügen. Nach dem ersten vollständigen Laden kannst du die App offline nutzen. Die Datumsübersicht aktualisiert sich beim Öffnen; es gibt keine Hintergrundalarme oder behaupteten Frischeprüfungen.",
    ),
  );
  root.append(privacy);
  const clear = button(
    "Alle lokalen Aufbrauchen-Daten löschen",
    () =>
      run(async () => {
        if (
          !confirm(
            "Alle Vorräte, Einkaufspositionen, Entwürfe und den Rückgängig-Schritt in diesem Browser löschen? Exportiere vorher eine Sicherung.",
          )
        )
          return;
        await change(() => emptyState());
        status("Alle lokalen Aufbrauchen-Daten gelöscht.");
      }),
    "danger",
  );
  clear.id = "clearAll";
  root.append(clear);
}
async function openEditor(draft) {
  return run(async () => {
    if (state.editor && state.editor.id !== draft.id) {
      status(
        "Es gibt einen offenen Entwurf. Speichere oder verwirf ihn zuerst.",
      );
      return resumeEditor();
    }
    await change((s) => {
      if (s.editor && s.editor.id !== draft.id)
        throw Error(
          "In einem anderen Fenster ist bereits ein Entwurf geöffnet.",
        );
      return { ...s, editor: s.editor || draft };
    });
    resumeEditor();
  });
}
function resumeEditor() {
  if (!state.editor) return;
  formDraft = structuredClone(state.editor);
  for (const [key, value] of Object.entries(formDraft.values)) {
    if (key === "favorite") $(key).checked = value === "true";
    else $(key).value = value;
  }
  $("editorTitle").textContent =
    formDraft.kind === "shop"
      ? "Einkauf eintragen"
      : formDraft.sourceShopId
        ? "Einkauf einlagern"
        : formDraft.baseRev
          ? "Vorrat bearbeiten"
          : "Vorrat hinzufügen";
  $("itemFields").hidden = formDraft.kind === "shop";
  $("dateLabel").hidden = $("dateKind").value === "none";
  $("dateShortcuts").hidden = $("dateKind").value === "none";
  $("editorError").textContent = "";
  if (!$("editor").open) $("editor").showModal();
  $("resumeDraft").hidden = true;
}
function captureEditor() {
  if (!formDraft) return;
  for (const key of Object.keys(formDraft.values))
    formDraft.values[key] =
      key === "favorite" ? String($(key).checked) : $(key).value;
  $("dateLabel").hidden = formDraft.values.dateKind === "none";
  $("dateShortcuts").hidden = formDraft.values.dateKind === "none";
}
async function persistEditor() {
  captureEditor();
  const snapshot = structuredClone(formDraft);
  if (!snapshot) return;
  return change((s) => {
    if (!s.editor || s.editor.id !== snapshot.id)
      throw Error(
        "Der Entwurf wurde in einem anderen Fenster abgeschlossen. Dein Text bleibt im Formular sichtbar.",
      );
    return { ...s, editor: snapshot };
  });
}
async function closeEditor() {
  await persistEditor();
  $("editor").close();
  formDraft = null;
  render();
}
function startTemplate(row) {
  const draft = editor("item");
  Object.assign(draft.values, {
    name: row.name,
    amount: amount(row.quantityMilli),
    unit: row.unit,
    place: row.place,
    category: row.category,
    note: row.note,
    favorite: String(row.favorite),
  });
  openEditor(draft);
}
function startConsume(row) {
  consumeId = row.id;
  $("consumeTitle").textContent = row.name + " verbrauchen";
  $("available").textContent =
    `Vorhanden: ${amount(row.quantityMilli)} ${UNITS[row.unit]}`;
  $("consumeAmount").value = amount(row.quantityMilli);
  $("consumeShopping").checked = false;
  $("consumeError").textContent = "";
  $("consumeDialog").showModal();
}
for (const [id, values] of [
  ["unit", UNITS],
  ["place", PLACES],
  ["category", CATEGORIES],
  ["dateKind", DATE_KINDS],
])
  for (const [value, text] of Object.entries(values)) {
    const o = el("option", text);
    o.value = value;
    $(id).append(o);
  }
for (const [days, label] of [
  [0, "Heute"],
  [1, "Morgen"],
  [7, "In einer Woche"],
])
  $("dateShortcuts").append(
    button(label, () => {
      $("date").value = plusDays(today(), days);
      run(persistEditor);
    }),
  );
for (const key of [
  "name",
  "amount",
  "unit",
  "place",
  "category",
  "date",
  "dateKind",
  "openedOn",
  "note",
  "favorite",
])
  $(key).addEventListener("input", () => run(persistEditor));
$("addItem").onclick = () => openEditor(editor("item"));
$("resumeDraft").onclick = resumeEditor;
$("closeEditor").onclick = () => run(closeEditor);
$("editor").addEventListener("cancel", (e) => {
  e.preventDefault();
  run(closeEditor);
});
$("discardDraft").onclick = () =>
  run(async () => {
    if (
      !confirm(
        "Diesen Bearbeitungsentwurf verwerfen? Gespeicherte Einträge bleiben erhalten.",
      )
    )
      return;
    await change((s) => ({ ...s, editor: null }));
    $("editor").close();
    formDraft = null;
    render();
  });
$("editorForm").onsubmit = (e) => {
  e.preventDefault();
  if (savePending) return;
  savePending = true;
  $("saveEditor").disabled = true;
  run(async () => {
    try {
      await persistEditor();
      const draft = structuredClone(formDraft);
      await mutate(
        draft.kind === "item" ? "Vorrat gespeichert." : "Einkauf gespeichert.",
        (d) => saveEditor(d, draft),
        true,
      );
      $("editor").close();
      formDraft = null;
      status(
        draft.sourceShopId
          ? "Einkauf genau einmal in den Vorrat übernommen."
          : "Eintrag gespeichert.",
      );
      render();
    } finally {
      savePending = false;
      $("saveEditor").disabled = false;
    }
  });
};
$("consumeAll").onclick = () => {
  $("consumeAmount").value = amount(
    state.data.items.find((x) => x.id === consumeId).quantityMilli,
  );
};
$("consumeHalf").onclick = () => {
  $("consumeAmount").value = amount(
    Math.max(
      1,
      Math.floor(
        state.data.items.find((x) => x.id === consumeId).quantityMilli / 2,
      ),
    ),
  );
};
$("closeConsume").onclick = () => $("consumeDialog").close();
$("consumeForm").onsubmit = (e) => {
  e.preventDefault();
  if (savePending) return;
  savePending = true;
  run(async () => {
    try {
      const q = quantity($("consumeAmount").value),
        id = consumeId,
        reorder = $("consumeShopping").checked;
      await mutate("Verbrauch gespeichert.", (data) => {
        const row = data.items.find((x) => x.id === id);
        if (!row || q > row.quantityMilli)
          throw Error("Bitte höchstens die vorhandene Menge verbrauchen.");
        let next = action(data, id, "consume", Date.now(), q);
        if (reorder) next = addShopping(next, row.name, q, row.unit, row.note);
        return next;
      });
      $("consumeDialog").close();
      status("Verbrauch gespeichert.");
    } finally {
      savePending = false;
    }
  });
};
$("understood").onclick = () =>
  run(() =>
    change((s) => ({
      ...s,
      data: {
        ...s.data,
        revision: s.data.revision + 1,
        settings: { ...s.data.settings, onboarded: true },
      },
      undo: null,
    })),
  );
repo.subscribe(() =>
  run(async () => {
    state = await repo.read();
    render();
  }),
);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden)
    run(async () => {
      state = await repo.read();
      render();
    });
});
async function init() {
  try {
    state = await repo.read();
    ready = true;
    render();
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("./sw.js");
      await navigator.serviceWorker.ready;
      $("offlineStatus").textContent =
        "Offline bereit · Daten bleiben auf diesem Gerät";
    }
  } catch (e) {
    status(e.message);
    $("offlineStatus").textContent =
      "Offline-Speicher noch nicht bereit. Bitte online erneut öffnen.";
  }
}
let lastDay = today();
setInterval(() => {
  const day = today();
  if (!document.hidden && day !== lastDay) {
    lastDay = day;
    render();
  }
}, 60000);
render();
init();
