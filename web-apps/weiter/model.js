export const STATUSES = ["INBOX", "TODAY", "PARKED", "DONE", "TRASH"];
export const PLACES = ["HOME", "OUTSIDE", "ONLINE", "WAITING"];
export const LIMITS = {
  entries: 2000,
  text: 10000,
  notes: 50000,
  attachments: 8,
  attachment: 3 * 1024 * 1024,
  total: 16 * 1024 * 1024,
  json: 24 * 1024 * 1024,
};
export const MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mp4",
  "audio/3gpp",
  "audio/m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
];
export const today = (now = Date.now()) => {
  const d = new Date(now);
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function dayAfter(days, now = Date.now()) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return today(d.getTime());
}
export const validLink = (value) => {
  try {
    const u = new URL(value);
    return (
      /^https?:$/.test(u.protocol) &&
      !!u.host &&
      !/[\s<>"\x00-\x1f]/.test(value)
    );
  } catch {
    return false;
  }
};
export const linksIn = (text) =>
  [
    ...new Set(
      (text.match(/https?:\/\/[^\s<>"]+/gi) || []).map((x) =>
        x.replace(/[.,;)!?]+$/, ""),
      ),
    ),
  ]
    .filter((x) => x.length <= 2048 && validLink(x))
    .slice(0, 64);
export function newEntry(text, now = Date.now(), id = crypto.randomUUID()) {
  const thought = text.trim();
  if (!thought || thought.length > LIMITS.text)
    throw Error("Bitte einen Gedanken mit 1 bis 10.000 Zeichen eingeben.");
  return {
    id,
    thought,
    nextStep: "",
    notes: "",
    status: "INBOX",
    place: "HOME",
    minutes: 5,
    dueDate: null,
    reminderAt: null,
    createdAt: now,
    updatedAt: now,
    completedDate: null,
    previousStatus: null,
    attachments: [],
    links: linksIn(thought),
  };
}
const openStatus = (e, now) =>
  !e.nextStep.trim()
    ? "INBOX"
    : e.dueDate && e.dueDate > today(now)
      ? "PARKED"
      : "TODAY";
export function transition(e, action, now = Date.now(), date = null) {
  const base = { ...e, updatedAt: now };
  switch (action) {
    case "complete":
      if (e.status === "TRASH") throw Error("Zuerst wiederherstellen.");
      return e.status === "DONE"
        ? e
        : {
            ...base,
            status: "DONE",
            previousStatus: e.status,
            completedDate: today(now),
          };
    case "reopen":
      if (e.status !== "DONE") throw Error("Der Eintrag ist bereits offen.");
      return {
        ...base,
        status: ["INBOX", "TODAY", "PARKED"].includes(e.previousStatus)
          ? e.previousStatus
          : openStatus(e, now),
        previousStatus: null,
        completedDate: null,
      };
    case "trash":
      return e.status === "TRASH"
        ? e
        : {
            ...base,
            status: "TRASH",
            previousStatus:
              e.status === "DONE" ? e.previousStatus || "DONE" : e.status,
            completedDate:
              e.status === "DONE" ? e.completedDate || today(now) : null,
          };
    case "restore": {
      if (e.status !== "TRASH")
        throw Error("Dieser Eintrag liegt nicht im Papierkorb.");
      const status = e.completedDate
        ? "DONE"
        : e.previousStatus && e.previousStatus !== "TRASH"
          ? e.previousStatus
          : openStatus(e, now);
      return {
        ...base,
        status,
        previousStatus:
          status === "DONE" &&
          ["INBOX", "TODAY", "PARKED"].includes(e.previousStatus)
            ? e.previousStatus
            : null,
        completedDate: status === "DONE" ? e.completedDate : null,
      };
    }
    case "park":
      if (date !== null) dateValue(date);
      return {
        ...base,
        status: "PARKED",
        dueDate: date,
        previousStatus: null,
        completedDate: null,
      };
    case "clarify":
      if (!e.nextStep.trim())
        throw Error("Formuliere einen konkreten nächsten Schritt.");
      return {
        ...base,
        nextStep: e.nextStep.trim(),
        status:
          (e.dueDate && e.dueDate > today(now)) ||
          (e.status === "PARKED" && !e.dueDate)
            ? "PARKED"
            : "TODAY",
        previousStatus: null,
        completedDate: null,
      };
    default:
      throw Error("Unbekannte Aktion.");
  }
}
export const todayEntries = (data, day = today()) =>
  data.entries
    .filter(
      (e) =>
        e.status === "TODAY" ||
        (e.status === "PARKED" && e.dueDate && e.dueDate <= day),
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
export const parkedEntries = (data, day = today()) =>
  data.entries
    .filter((e) => e.status === "PARKED" && (!e.dueDate || e.dueDate > day))
    .sort(
      (a, b) =>
        (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
function requireValue(
  ok,
  message = "Die Sicherungsdatei ist ungültig oder unvollständig.",
) {
  if (!ok) throw Error(message);
}
function keys(obj, fields) {
  requireValue(
    obj &&
      typeof obj === "object" &&
      !Array.isArray(obj) &&
      Object.keys(obj).sort().join("|") === [...fields].sort().join("|"),
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
function timestamp(value) {
  requireValue(
    Number.isSafeInteger(value) && value >= 0 && value <= 253402300799999,
  );
}
export function dateValue(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const d = new Date(value + "T12:00:00Z");
  requireValue(
    !Number.isNaN(+d) &&
      d.toISOString().slice(0, 10) === value &&
      value.slice(0, 4) !== "0000",
  );
}
export function validate(data) {
  requireValue(
    data &&
      Array.isArray(data.entries) &&
      data.entries.length <= LIMITS.entries,
  );
  text(data.draft, LIMITS.text);
  const ids = new Set(),
    attachments = new Set();
  let total = 0;
  for (const e of data.entries) {
    keys(e, [
      "id",
      "thought",
      "nextStep",
      "notes",
      "status",
      "place",
      "minutes",
      "dueDate",
      "reminderAt",
      "createdAt",
      "updatedAt",
      "completedDate",
      "previousStatus",
      "attachments",
      "links",
    ]);
    id(e.id);
    requireValue(!ids.has(e.id));
    ids.add(e.id);
    text(e.thought, LIMITS.text);
    text(e.nextStep, LIMITS.text);
    text(e.notes, LIMITS.notes);
    requireValue(
      STATUSES.includes(e.status) &&
        PLACES.includes(e.place) &&
        Number.isInteger(e.minutes) &&
        e.minutes >= 1 &&
        e.minutes <= 1440,
    );
    timestamp(e.createdAt);
    timestamp(e.updatedAt);
    if (e.reminderAt !== null) {
      timestamp(e.reminderAt);
      requireValue(e.reminderAt > 0);
    }
    if (e.dueDate !== null) dateValue(e.dueDate);
    if (e.completedDate !== null) dateValue(e.completedDate);
    requireValue(
      e.previousStatus === null || STATUSES.includes(e.previousStatus),
    );
    requireValue(
      Array.isArray(e.attachments) &&
        e.attachments.length <= LIMITS.attachments,
    );
    for (const a of e.attachments) {
      keys(a, ["id", "name", "mime", "base64"]);
      id(a.id);
      requireValue(!attachments.has(a.id));
      attachments.add(a.id);
      text(a.name, 200);
      requireValue(
        a.name.trim() &&
          a.name !== "." &&
          a.name !== ".." &&
          !/[\/\\\x00-\x1f\x7f-\x9f]/.test(a.name),
      );
      requireValue(MIME.includes(a.mime));
      requireValue(
        typeof a.base64 === "string" &&
          a.base64.length > 0 &&
          a.base64.length <= 4 * Math.ceil(LIMITS.attachment / 3) &&
          /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            a.base64,
          ),
      );
      const decoded = atob(a.base64);
      requireValue(
        btoa(decoded) === a.base64 && decoded.length <= LIMITS.attachment,
      );
      total += decoded.length;
      requireValue(
        total <= LIMITS.total,
        "Die Anhänge sind zusammen größer als 16 MB.",
      );
    }
    requireValue(Array.isArray(e.links) && e.links.length <= 64);
    for (const link of e.links) {
      text(link, 2048);
      requireValue(validLink(link));
    }
  }
  if (data.timer !== null && data.timer !== undefined) {
    keys(data.timer, ["entryId", "endsAt", "durationMinutes"]);
    requireValue(ids.has(data.timer.entryId));
    timestamp(data.timer.endsAt);
    requireValue(
      data.timer.endsAt > 0 &&
        Number.isInteger(data.timer.durationMinutes) &&
        data.timer.durationMinutes >= 1 &&
        data.timer.durationMinutes <= 1440,
    );
  }
  return data;
}
// Reject duplicate keys before JSON.parse, just like the Android backup codec.
export function parseStrict(textValue) {
  requireValue(
    new TextEncoder().encode(textValue).length <= LIMITS.json,
    "Die Sicherung ist größer als 24 MB.",
  );
  let p = 0;
  const ws = () => {
    while (/[\t\r\n ]/.test(textValue[p] || "x")) p++;
  };
  const str = () => {
    const start = p++;
    while (p < textValue.length) {
      const c = textValue[p++];
      if (c === '"') return JSON.parse(textValue.slice(start, p));
      if (c === "\\") p++;
    }
    throw Error("Ungültiges JSON.");
  };
  function value(depth = 0) {
    requireValue(depth <= 12);
    ws();
    const c = textValue[p];
    if (c === "{") {
      p++;
      ws();
      const seen = new Set();
      if (textValue[p] === "}") {
        p++;
        return;
      }
      while (true) {
        ws();
        requireValue(textValue[p] === '"');
        const key = str();
        requireValue(
          !seen.has(key),
          "Die Sicherung enthält doppelte Feldnamen.",
        );
        seen.add(key);
        ws();
        requireValue(textValue[p++] === ":");
        value(depth + 1);
        ws();
        const separator = textValue[p++];
        if (separator === "}") return;
        requireValue(separator === ",");
      }
    } else if (c === "[") {
      p++;
      ws();
      if (textValue[p] === "]") {
        p++;
        return;
      }
      while (true) {
        value(depth + 1);
        ws();
        const separator = textValue[p++];
        if (separator === "]") return;
        requireValue(separator === ",");
      }
    } else if (c === '"') str();
    else {
      const match =
        /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
          textValue.slice(p),
        );
      requireValue(match);
      p += match[0].length;
    }
  }
  value();
  ws();
  requireValue(p === textValue.length);
  return JSON.parse(textValue);
}
export function decodeBackup(source) {
  const root = parseStrict(source);
  keys(root, ["format", "version", "draft", "entries"]);
  requireValue(
    root.format === "weiter-backup" && root.version === 1,
    "Das ist keine Weiter-Sicherung der Version 1.",
  );
  return validate({ entries: root.entries, draft: root.draft, timer: null });
}
export function encodeBackup(data) {
  validate(data);
  const source = JSON.stringify(
    {
      format: "weiter-backup",
      version: 1,
      draft: data.draft,
      entries: data.entries,
    },
    null,
    2,
  );
  requireValue(
    new TextEncoder().encode(source).length <= LIMITS.json,
    "Die Sicherung ist größer als 24 MB.",
  );
  return source;
}
export function merge(local, incoming) {
  validate(local);
  validate(incoming);
  const ids = new Set(local.entries.map((e) => e.id));
  return validate({
    ...local,
    entries: [
      ...local.entries,
      ...incoming.entries.filter((e) => !ids.has(e.id)),
    ],
    draft: local.draft || incoming.draft,
  });
}
