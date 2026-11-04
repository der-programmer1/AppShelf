import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  emptyData,
  emptyState,
  editor,
  saveEditor,
  action,
  addShopping,
  quantity,
  amount,
  validate,
  decode,
  encode,
  merge,
  commit,
  undo,
  dueItems,
  plusDays,
  today,
  LIMIT,
} from "../web/model.js";
const fixtures = JSON.parse(
  await readFile(new URL("./fixtures/scenarios.json", import.meta.url), "utf8"),
);
for (const c of fixtures.cases)
  test("Android/Web golden: " + c.name, () => {
    const before = structuredClone(c.input);
    const operation = () =>
      c.operation === "saveEditor"
        ? saveEditor(c.input, c.draft, c.now)
        : action(
            c.input,
            c.id,
            c.operation,
            c.now,
            c.value ?? null,
            c.newId || "generated-id",
          );
    if (c.error) assert.throws(operation);
    else assert.deepEqual(operation(), c.expected);
    assert.deepEqual(c.input, before);
  });
const now = Date.UTC(2026, 10, 4, 12);
function itemData() {
  const draft = editor("item", "item-1");
  Object.assign(draft.values, {
    name: "Äpfel",
    amount: "1,5",
    unit: "kg",
    date: "2026-11-05",
    category: "produce",
  });
  return saveEditor(emptyData(), draft, now);
}
test("quantities use exact thousandths, comma/dot and bounded input", () => {
  for (const [input, value] of [
    ["0,001", 1],
    ["1.5", 1500],
    ["0001,25", 1250],
    ["1000000", 1000000000],
  ]) {
    assert.equal(quantity(input), value);
    assert.equal(quantity(amount(value)), value);
  }
  for (const bad of [
    "0",
    "-1",
    "1,2345",
    "1e3",
    "Infinity",
    "1000000,001",
    "  ",
    "1,",
  ])
    assert.throws(() => quantity(bad));
});
test("calendar thresholds handle leap days and DST without deleting entries", () => {
  assert.equal(plusDays("2028-02-28", 1), "2028-02-29");
  assert.equal(plusDays("2026-10-24", 2), "2026-10-26");
  const data = itemData(),
    copy = structuredClone(data);
  assert.equal(dueItems(data, "2026-11-02").length, 1);
  assert.equal(dueItems(data, "2026-10-31").length, 0);
  assert.deepEqual(data, copy);
  assert.equal(today(new Date(2026, 10, 4, 12).getTime()), "2026-11-04");
});
test("export/import round-trips names, notes, status, date type and history", () => {
  let data = itemData();
  data = action(data, "item-1", "consume", now + 1, 250);
  data = action(data, "item-1", "shopping", now + 2, null, "shop-1");
  assert.deepEqual(decode(encode(data)), data);
});
test("invalid import never modifies local records", () => {
  const local = itemData(),
    copy = structuredClone(local);
  for (const patch of [
    { quantityMilli: 0 },
    { quantityMilli: 1.5 },
    { name: "" },
    { date: "2026-02-30" },
    { dateKind: "invented" },
    { status: "invented" },
    { unit: "unknown" },
    { rev: "1" },
    { note: "\uD800" },
  ]) {
    const document = structuredClone(local);
    Object.assign(document.items[0], patch);
    assert.throws(() => decode(JSON.stringify(document)));
  }
  assert.deepEqual(local, copy);
});
test("strict JSON rejects duplicate keys, extensions and hostile nesting", () => {
  for (const bad of [
    '{"format":"aufbrauchen-backup","format":"other"}',
    encode(emptyData()) + "{}",
    "/*comment*/" + encode(emptyData()),
    "[".repeat(1000) + "]".repeat(1000),
    encode(emptyData()).replace('"revision":0', '"revision":01'),
  ])
    assert.throws(() => decode(bad));
});
test("imports are idempotent; local fields and settings win", () => {
  const local = itemData(),
    incoming = structuredClone(local);
  incoming.items[0].name = "Nicht überschreiben";
  incoming.settings.soonDays = 14;
  let fresh = editor("item", "new-1");
  fresh.values.name = "Reis";
  const other = saveEditor(emptyData(), fresh, now);
  incoming.items.push(other.items[0]);
  const result = merge(local, incoming);
  assert.equal(result.items[0].name, "Äpfel");
  assert.equal(result.settings.soonDays, 3);
  assert.equal(result.items.length, 2);
  assert.deepEqual(merge(result, incoming), result);
});
test("undo retains records, quantities and shopping changes as one transaction", () => {
  const state = { ...emptyState(), data: itemData() },
    changed = commit(
      state,
      action(state.data, "item-1", "trash", now + 1),
      "Gelöscht",
    );
  const restored = undo(changed);
  assert.deepEqual(restored.data.items, state.data.items);
  assert.equal(restored.data.revision, 2);
  assert.equal(restored.undo, null);
  assert.throws(() =>
    undo({ ...changed, data: { ...changed.data, revision: 99 } }),
  );
});
test("references, schema and global ID conflicts are checked before merge", () => {
  const local = itemData();
  const foreign = emptyData();
  foreign.shopping.push({
    id: "item-1",
    name: "Einkauf",
    quantityMilli: 1000,
    unit: "piece",
    note: "",
    status: "open",
    previousStatus: null,
    stockId: null,
    createdAt: now,
    updatedAt: now,
    rev: 1,
  });
  assert.throws(() => merge(local, foreign));
  const broken = emptyData();
  broken.shopping.push({
    ...foreign.shopping[0],
    id: "shop-a",
    status: "stocked",
    stockId: "missing",
  });
  assert.throws(() => validate(broken));
});
test("empty and oversized backups fail clearly instead of replacing data", () => {
  assert.throws(() => decode(""));
  assert.throws(() => decode(" ".repeat(LIMIT.document + 1)));
  const data = itemData();
  data.items = [...data.items, ...data.items];
  assert.throws(() => validate(data));
});
test("client has no secret, external dependency, tracking or unsafe HTML insertion", async () => {
  for (const file of ["app.js", "model.js", "storage.js", "index.html"]) {
    const text = await readFile(
      new URL("../web/" + file, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      text,
      /\.innerHTML\s*=|sk-proj-[A-Za-z0-9_-]{12,}|https:\/\/(?:cdn\.|unpkg\.|fonts\.googleapis)|google-analytics|facebook\.net/,
    );
  }
  const manifest = await readFile(
    new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    manifest,
    /android.permission.INTERNET|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION/,
  );
});
