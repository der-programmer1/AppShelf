export const UNITS = {
  piece: "Stück",
  pack: "Packung",
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "l",
};
export const PLACES = {
  fridge: "Kühlschrank",
  freezer: "Gefrierfach",
  pantry: "Vorratsschrank",
  other: "Anderer Ort",
};
export const CATEGORIES = {
  produce: "Obst & Gemüse",
  dairy: "Milchprodukte & Eier",
  dry: "Brot & Trockenwaren",
  frozen: "Tiefgekühltes",
  drinks: "Getränke",
  other: "Sonstiges",
};
export const DATE_KINDS = {
  best_before: "Mindesthaltbarkeit",
  use_by: "Verbrauchsdatum",
  none: "Ohne Datum",
};
export const LIMIT = {
  items: 5000,
  shopping: 2000,
  document: 8 * 1024 * 1024,
  storage: 24 * 1024 * 1024,
  quantity: 1000000000,
};
const itemKeys = [
  "id",
  "name",
  "quantityMilli",
  "unit",
  "place",
  "category",
  "date",
  "dateKind",
  "openedOn",
  "note",
  "favorite",
  "status",
  "previousStatus",
  "createdAt",
  "updatedAt",
  "closedAt",
  "rev",
];
const shopKeys = [
  "id",
  "name",
  "quantityMilli",
  "unit",
  "note",
  "status",
  "previousStatus",
  "stockId",
  "createdAt",
  "updatedAt",
  "rev",
];
const valuesKeys = [
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
];
export const emptyData = () => ({
  format: "aufbrauchen-backup",
  version: 1,
  revision: 0,
  settings: { soonDays: 3, onboarded: false },
  items: [],
  shopping: [],
});
export const emptyState = () => ({
  data: emptyData(),
  editor: null,
  undo: null,
});
export const today = (now = Date.now()) => {
  const d = new Date(now);
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const plusDays = (day, count) => {
  dateValue(day);
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
};
export function quantity(text) {
  if (
    typeof text !== "string" ||
    !/^\d{1,7}(?:[.,]\d{1,3})?$/.test(text.trim())
  )
    throw Error(
      "Bitte eine Menge mit höchstens drei Nachkommastellen eingeben.",
    );
  const [a, b = ""] = text.trim().replace(",", ".").split("."),
    value = Number(a) * 1000 + Number(b.padEnd(3, "0"));
  if (value < 1 || value > LIMIT.quantity)
    throw Error("Die Menge muss zwischen 0,001 und 1000000 liegen.");
  return value;
}
export function amount(value) {
  const whole = Math.floor(value / 1000),
    fraction = String(value % 1000)
      .padStart(3, "0")
      .replace(/0+$/, "");
  return String(whole) + (fraction ? "," + fraction : "");
}
function requireValue(
  ok,
  message = "Die Datei ist ungültig oder unvollständig.",
) {
  if (!ok) throw Error(message);
}
function keys(obj, expected) {
  requireValue(
    obj &&
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      Object.keys(obj).sort().join("|") === [...expected].sort().join("|"),
  );
}
function text(value, max) {
  requireValue(
    typeof value === "string" &&
      value.length <= max &&
      !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value,
      ),
  );
}
function id(value) {
  requireValue(
    typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value),
  );
}
function integer(value, min, max) {
  requireValue(Number.isSafeInteger(value) && value >= min && value <= max);
}
export function dateValue(value) {
  requireValue(
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value.slice(0, 4) !== "0000",
    "Bitte ein gültiges Datum wählen.",
  );
  const d = new Date(value + "T12:00:00Z");
  requireValue(
    Number.isFinite(+d) && d.toISOString().slice(0, 10) === value,
    "Bitte ein gültiges Datum wählen.",
  );
}
function record(row, ids) {
  id(row.id);
  requireValue(!ids.has(row.id), "Die Datei enthält doppelte Kennungen.");
  ids.add(row.id);
  text(row.name, 120);
  requireValue(row.name.trim().length > 0, "Bitte einen Namen eingeben.");
  text(row.note, 2000);
  integer(row.quantityMilli, 1, LIMIT.quantity);
  requireValue(Object.hasOwn(UNITS, row.unit));
  integer(row.createdAt, 0, 253402300799999);
  integer(row.updatedAt, row.createdAt, 253402300799999);
  integer(row.rev, 1, 1000000000000);
}
export function validate(data) {
  keys(data, [
    "format",
    "version",
    "revision",
    "settings",
    "items",
    "shopping",
  ]);
  requireValue(
    data.format === "aufbrauchen-backup" && data.version === 1,
    "Das ist keine Aufbrauchen-Sicherung der Version 1.",
  );
  integer(data.revision, 0, 1000000000000);
  keys(data.settings, ["soonDays", "onboarded"]);
  requireValue(
    [1, 3, 7, 14].includes(data.settings.soonDays) &&
      typeof data.settings.onboarded === "boolean",
  );
  requireValue(
    Array.isArray(data.items) &&
      data.items.length <= LIMIT.items &&
      Array.isArray(data.shopping) &&
      data.shopping.length <= LIMIT.shopping,
    "Zu viele Einträge: maximal 5000 Vorräte und 2000 Einkaufspositionen.",
  );
  const ids = new Set();
  for (const row of data.items) {
    keys(row, itemKeys);
    record(row, ids);
    requireValue(
      Object.hasOwn(PLACES, row.place) &&
        Object.hasOwn(CATEGORIES, row.category) &&
        Object.hasOwn(DATE_KINDS, row.dateKind) &&
        typeof row.favorite === "boolean",
    );
    if (row.date !== null) dateValue(row.date);
    if (row.openedOn !== null) dateValue(row.openedOn);
    requireValue(row.dateKind !== "none" || row.date === null);
    requireValue(["stock", "used", "discarded", "trash"].includes(row.status));
    requireValue(
      row.previousStatus === null ||
        ["stock", "used", "discarded"].includes(row.previousStatus),
    );
    if (row.closedAt !== null) integer(row.closedAt, 0, 253402300799999);
    requireValue(row.status !== "stock" || row.closedAt === null);
    requireValue(
      !["used", "discarded"].includes(row.status) || row.closedAt !== null,
    );
    requireValue(row.status !== "trash" || row.previousStatus !== null);
  }
  const itemIds = new Set(data.items.map((x) => x.id));
  for (const row of data.shopping) {
    keys(row, shopKeys);
    record(row, ids);
    requireValue(["open", "checked", "stocked", "trash"].includes(row.status));
    requireValue(
      row.previousStatus === null ||
        ["open", "checked", "stocked"].includes(row.previousStatus),
    );
    requireValue(row.status !== "trash" || row.previousStatus !== null);
    if (row.stockId !== null) {
      id(row.stockId);
      requireValue(
        itemIds.has(row.stockId),
        "Ein Einkauf verweist auf einen fehlenden Vorrat.",
      );
    }
    requireValue(
      (row.status === "stocked" ||
        (row.status === "trash" && row.previousStatus === "stocked")) ===
        !!row.stockId,
    );
  }
  requireValue(
    new TextEncoder().encode(JSON.stringify(data)).length <= LIMIT.document,
    "Die Daten sind größer als 8 MB. Bitte vor weiteren Einträgen eine Sicherung exportieren.",
  );
  return data;
}
export function validateEditor(draft) {
  if (draft === null) return;
  keys(draft, [
    "kind",
    "id",
    "baseRev",
    "sourceShopId",
    "sourceShopRev",
    "values",
  ]);
  requireValue(["item", "shop"].includes(draft.kind));
  id(draft.id);
  integer(draft.baseRev, 0, 1000000000000);
  if (draft.sourceShopId !== null) id(draft.sourceShopId);
  integer(draft.sourceShopRev, 0, 1000000000000);
  keys(draft.values, valuesKeys);
  for (const key of valuesKeys)
    text(draft.values[key], key === "note" ? 2000 : key === "name" ? 120 : 80);
}
export function validateState(state) {
  keys(state, ["data", "editor", "undo"]);
  validate(state.data);
  validateEditor(state.editor);
  if (state.undo !== null) {
    keys(state.undo, ["before", "afterRevision", "label"]);
    validate(state.undo.before);
    integer(state.undo.afterRevision, 0, 1000000000000);
    text(state.undo.label, 200);
  }
  return state;
}
export function parseStrict(source, max = LIMIT.document) {
  requireValue(
    typeof source === "string" &&
      new TextEncoder().encode(source).length <= max,
    "Die Sicherungsdatei ist zu groß.",
  );
  let p = 0;
  const ws = () => {
    while (/[\t\r\n ]/.test(source[p] || "x")) p++;
  };
  const string = () => {
    const start = p++;
    while (p < source.length) {
      const c = source[p++];
      if (c === '"') return JSON.parse(source.slice(start, p));
      if (c === "\\") p++;
    }
    throw Error("Ungültiges JSON.");
  };
  function value(depth = 0) {
    requireValue(depth <= 20, "Die Datei ist zu tief verschachtelt.");
    ws();
    const c = source[p];
    if (c === "{") {
      p++;
      ws();
      const seen = new Set();
      if (source[p] === "}") {
        p++;
        return;
      }
      while (true) {
        ws();
        requireValue(source[p] === '"');
        const key = string();
        requireValue(!seen.has(key), "Die Datei enthält doppelte Feldnamen.");
        seen.add(key);
        ws();
        requireValue(source[p++] === ":");
        value(depth + 1);
        ws();
        const delimiter = source[p++];
        if (delimiter === "}") return;
        requireValue(delimiter === ",");
      }
    } else if (c === "[") {
      p++;
      ws();
      if (source[p] === "]") {
        p++;
        return;
      }
      while (true) {
        value(depth + 1);
        ws();
        const delimiter = source[p++];
        if (delimiter === "]") return;
        requireValue(delimiter === ",");
      }
    } else if (c === '"') string();
    else {
      const m =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          source.slice(p),
        );
      requireValue(m);
      p += m[0].length;
    }
  }
  value();
  ws();
  requireValue(p === source.length);
  return JSON.parse(source);
}
export const decode = (source) => validate(parseStrict(source));
export const encode = (data) => JSON.stringify(validate(data));
export function merge(local, incoming) {
  validate(local);
  validate(incoming);
  const ids = new Map([
    ...local.items.map((x) => [x.id, "item"]),
    ...local.shopping.map((x) => [x.id, "shop"]),
  ]);
  for (const [rows, kind] of [
    [incoming.items, "item"],
    [incoming.shopping, "shop"],
  ])
    for (const row of rows)
      requireValue(
        !ids.has(row.id) || ids.get(row.id) === kind,
        "Eine Kennung gehört bereits zu einem anderen Eintrag.",
      );
  return validate({
    ...structuredClone(local),
    items: [...local.items, ...incoming.items.filter((x) => !ids.has(x.id))],
    shopping: [
      ...local.shopping,
      ...incoming.shopping.filter((x) => !ids.has(x.id)),
    ],
  });
}
export function editor(
  kind,
  id = crypto.randomUUID(),
  row = null,
  source = null,
) {
  return {
    kind,
    id: row?.id || id,
    baseRev: row?.rev || 0,
    sourceShopId: source?.id || null,
    sourceShopRev: source?.rev || 0,
    values: {
      name: row?.name || source?.name || "",
      amount: amount(row?.quantityMilli || source?.quantityMilli || 1000),
      unit: row?.unit || source?.unit || "piece",
      place: row?.place || "fridge",
      category: row?.category || "other",
      date: row?.date || "",
      dateKind: row?.dateKind || "best_before",
      openedOn: row?.openedOn || "",
      note: row?.note || source?.note || "",
      favorite: String(row?.favorite || false),
    },
  };
}
const updated = (row, now) => ({
  ...row,
  updatedAt: Math.max(now, row.updatedAt + 1),
  rev: row.rev + 1,
});
const rowById = (rows, id) => {
  const row = rows.find((x) => x.id === id);
  if (!row) throw Error("Dieser Eintrag ist nicht mehr vorhanden.");
  return row;
};
export function saveEditor(data, draft, now = Date.now()) {
  validateEditor(draft);
  const v = draft.values,
    rows = draft.kind === "item" ? data.items : data.shopping,
    old = rows.find((x) => x.id === draft.id);
  requireValue(
    (old?.rev || 0) === draft.baseRev,
    "Der Eintrag wurde zwischenzeitlich geändert. Dein Entwurf bleibt erhalten. Öffne den aktuellen Eintrag neu.",
  );
  if (old)
    requireValue(
      draft.kind === "item"
        ? old.status === "stock"
        : ["open", "checked"].includes(old.status),
      "Diesen Eintrag zuerst wiederherstellen.",
    );
  const base = {
    id: draft.id,
    name: v.name.trim(),
    quantityMilli: quantity(v.amount),
    unit: v.unit,
    note: v.note.trim(),
    createdAt: old?.createdAt || now,
    updatedAt: old ? Math.max(now, old.updatedAt + 1) : now,
    rev: (old?.rev || 0) + 1,
  };
  let row;
  if (draft.kind === "item")
    row = {
      ...base,
      place: v.place,
      category: v.category,
      date: v.dateKind === "none" ? null : v.date || null,
      dateKind: v.dateKind,
      openedOn: v.openedOn || null,
      favorite: v.favorite === "true",
      status: "stock",
      previousStatus: null,
      closedAt: null,
    };
  else
    row = {
      ...base,
      status: old?.status || "open",
      previousStatus: null,
      stockId: null,
    };
  const next = structuredClone(data);
  next[draft.kind === "item" ? "items" : "shopping"] = old
    ? rows.map((x) => (x.id === row.id ? row : x))
    : [...rows, row];
  if (draft.sourceShopId !== null) {
    requireValue(draft.kind === "item" && !old);
    const shop = rowById(next.shopping, draft.sourceShopId);
    requireValue(
      shop.status === "checked" && shop.rev === draft.sourceShopRev,
      "Dieser Einkauf wurde bereits übernommen oder geändert. Dein Entwurf bleibt erhalten.",
    );
    next.shopping = next.shopping.map((x) =>
      x.id === shop.id
        ? { ...updated(x, now), status: "stocked", stockId: row.id }
        : x,
    );
  }
  return validate(next);
}
export function action(
  data,
  id,
  operation,
  now = Date.now(),
  value = null,
  newId = crypto.randomUUID(),
) {
  const next = structuredClone(data),
    item = next.items.find((x) => x.id === id),
    shop = next.shopping.find((x) => x.id === id),
    row = item || shop;
  requireValue(row, "Eintrag nicht gefunden.");
  let changed = updated(row, now);
  if (operation === "trash") {
    if (row.status === "trash") return next;
    changed = { ...changed, status: "trash", previousStatus: row.status };
  } else if (operation === "restore") {
    requireValue(row.status === "trash");
    changed = { ...changed, status: row.previousStatus, previousStatus: null };
  } else if (item) {
    if (operation === "consume") {
      requireValue(row.status === "stock");
      integer(value, 1, row.quantityMilli);
      changed =
        value === row.quantityMilli
          ? { ...changed, status: "used", closedAt: now }
          : { ...changed, quantityMilli: row.quantityMilli - value };
    } else if (operation === "discard") {
      requireValue(row.status === "stock");
      changed = { ...changed, status: "discarded", closedAt: now };
    } else if (operation === "reopen") {
      requireValue(["used", "discarded"].includes(row.status));
      changed = { ...changed, status: "stock", closedAt: null };
    } else if (operation === "favorite") {
      requireValue(row.status !== "trash");
      changed.favorite = !row.favorite;
    } else if (operation === "shopping") {
      requireValue(row.status === "stock");
      return addShopping(
        next,
        row.name,
        row.quantityMilli,
        row.unit,
        row.note,
        newId,
        now,
      );
    } else throw Error("Unbekannte Aktion.");
  } else {
    requireValue(
      operation === "check" && ["open", "checked"].includes(row.status),
    );
    changed.status = row.status === "checked" ? "open" : "checked";
  }
  next[item ? "items" : "shopping"] = next[item ? "items" : "shopping"].map(
    (x) => (x.id === id ? changed : x),
  );
  return validate(next);
}
export function addShopping(
  data,
  name,
  quantityMilli,
  unit,
  note,
  id = crypto.randomUUID(),
  now = Date.now(),
) {
  integer(quantityMilli, 1, LIMIT.quantity);
  const next = structuredClone(data),
    match = next.shopping.find(
      (x) =>
        x.status === "open" &&
        x.unit === unit &&
        x.name.trim().toLowerCase() === name.trim().toLowerCase(),
    );
  if (match) {
    const total = match.quantityMilli + quantityMilli;
    integer(total, 1, LIMIT.quantity);
    next.shopping = next.shopping.map((x) =>
      x.id === match.id ? { ...updated(x, now), quantityMilli: total } : x,
    );
  } else
    next.shopping.push({
      id,
      name: name.trim(),
      quantityMilli,
      unit,
      note,
      status: "open",
      previousStatus: null,
      stockId: null,
      createdAt: now,
      updatedAt: now,
      rev: 1,
    });
  return validate(next);
}
export function commit(state, next, label) {
  validate(next);
  const data = { ...next, revision: state.data.revision + 1 };
  return validateState({
    ...state,
    data,
    undo: {
      before: structuredClone(state.data),
      afterRevision: data.revision,
      label,
    },
  });
}
export function undo(state) {
  requireValue(
    state.undo && state.undo.afterRevision === state.data.revision,
    "Dieser Schritt kann nicht mehr rückgängig gemacht werden.",
  );
  return validateState({
    ...state,
    data: {
      ...structuredClone(state.undo.before),
      revision: state.data.revision + 1,
    },
    undo: null,
  });
}
export const stock = (data) => data.items.filter((x) => x.status === "stock");
export const ordered = (rows) =>
  [...rows].sort(
    (a, b) =>
      (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31") ||
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
      a.id.localeCompare(b.id),
  );
export const dueItems = (data, day = today()) =>
  ordered(
    stock(data).filter(
      (x) => x.date && x.date <= plusDays(day, data.settings.soonDays),
    ),
  );
export const favorites = (data) => {
  const seen = new Set();
  return [...data.items]
    .filter((x) => x.favorite && x.status !== "trash")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((x) => {
      const key = x.name.toLowerCase() + "|" + x.unit;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};
