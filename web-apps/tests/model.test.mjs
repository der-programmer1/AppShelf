import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeWav } from "../weiter/audio.js";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  newEntry,
  transition,
  todayEntries,
  parkedEntries,
  dayAfter,
  today,
  validate,
  encodeBackup,
  decodeBackup,
  merge,
  LIMITS,
  linksIn,
} from "../weiter/model.js";
import { emptyPlan, estimate, restorePlan, secondsLeft } from "../../apps/inbox/satzfenster/demo/model.js";
import {
  analyzePixels,
  baseName,
  automaticGains,
  calibrationGains,
  compareColors,
} from "../sehplus/color.js";

const now = new Date("2026-11-03T12:00:00").getTime();
test("Weiter: voice WAV encoding produces real PCM data, clips and mixes channels", async () => {
  const blob = encodeWav(
      [new Float32Array([-2, 0, 0.5, 2]), new Float32Array([-2, 0, 0.5, 2])],
      16000,
    ),
    bytes = await blob.arrayBuffer(),
    view = new DataView(bytes);
  assert.equal(blob.type, "audio/wav");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(50, true), 32767);
});
test("Weiter: invalid or oversized voice encoding is rejected before allocation", () => {
  assert.throws(() => encodeWav([], 16000));
  assert.throws(() => encodeWav([new Float32Array(1600000)], 16000));
  assert.throws(() => encodeWav([new Float32Array(1)], 0));
});
const entry = () => newEntry("Paket zurückschicken", now, "entry-1");
const data = (e) => ({ entries: e ? [e] : [], draft: "", timer: null });
test("Weiter: capture trims input, preserves thought and extracts only HTTP links", () => {
  const e = newEntry("  Arzt anrufen https://example.org/termin.  ", now, "a");
  assert.equal(e.status, "INBOX");
  assert.equal(e.thought, "Arzt anrufen https://example.org/termin.");
  assert.deepEqual(e.links, ["https://example.org/termin"]);
  assert.deepEqual(
    linksIn("javascript:alert(1) https://example.org/a https://example.org/a"),
    ["https://example.org/a"],
  );
  assert.throws(() => newEntry("   ", now, "a"));
});
test("Weiter: clarify -> today -> parked -> due today, without deleting data", () => {
  let e = transition(
    { ...entry(), nextStep: "Etikett öffnen" },
    "clarify",
    now,
  );
  assert.equal(e.status, "TODAY");
  assert.equal(todayEntries(data(e), today(now)).length, 1);
  e = transition(e, "park", now, dayAfter(1, now));
  assert.equal(parkedEntries(data(e), today(now)).length, 1);
  assert.equal(todayEntries(data(e), today(now)).length, 0);
  assert.equal(todayEntries(data(e), dayAfter(1, now)).length, 1);
  assert.equal(data(e).entries.length, 1);
  assert.throws(() => transition(entry(), "clarify", now));
});
test("Weiter: DONE -> TRASH -> restore -> reopen preserves the original open state", () => {
  const e = transition(
    transition(
      transition(transition(entry(), "complete", now), "trash", now),
      "restore",
      now,
    ),
    "reopen",
    now,
  );
  assert.equal(e.status, "INBOX");
  assert.equal(e.completedDate, null);
});
test("Weiter: delete and undo preserve attachments, reminders and all notes", () => {
  const e = {
    ...entry(),
    notes: "Notiz",
    reminderAt: now + 60000,
    attachments: [
      { id: "photo", name: "Foto.jpg", mime: "image/jpeg", base64: "/9j/2Q==" },
    ],
  };
  assert.deepEqual(transition(transition(e, "trash", now), "restore", now), e);
});
test("Weiter: Android backup v1 fixture round-trips every field and omits active timer", () => {
  const e = {
    ...entry(),
    thought: "Paket zurückschicken",
    nextStep: "Etikett drucken",
    notes: "Ohne Konto",
    status: "TODAY",
    place: "ONLINE",
    minutes: 15,
    dueDate: "2026-11-02",
    reminderAt: 1800000000000,
    createdAt: 1700000000000,
    updatedAt: 1700000000001,
    attachments: [
      {
        id: "photo-1",
        name: "Foto.jpg",
        mime: "image/jpeg",
        base64: "/9j/2Q==",
      },
    ],
    links: ["https://example.org/form?q=1"],
  };
  const value = {
    entries: [e],
    draft: "Noch ein Gedanke 🧭",
    timer: { entryId: e.id, endsAt: 1800000000000, durationMinutes: 5 },
  };
  assert.deepEqual(decodeBackup(encodeBackup(value)), {
    ...value,
    timer: null,
  });
  const root = JSON.parse(encodeBackup(value));
  assert.equal(root.format, "weiter-backup");
  assert.equal(root.version, 1);
  assert.equal(Object.hasOwn(root, "timer"), false);
});
test("Weiter: invalid imports cannot mutate the original state", () => {
  const original = data(entry()),
    snapshot = structuredClone(original);
  for (const change of [
    { status: "MAYBE" },
    { minutes: 0 },
    { minutes: "5" },
    { dueDate: "2026-02-30" },
    { createdAt: -1 },
    { place: "MOON" },
    { thought: null },
    { previousStatus: "INVENTED" },
  ]) {
    const doc = JSON.parse(encodeBackup(original));
    Object.assign(doc.entries[0], change);
    assert.throws(() => decodeBackup(JSON.stringify(doc)));
  }
  assert.deepEqual(original, snapshot);
});
test("Weiter: rejects duplicate keys, IDs, deep nesting, malformed JSON and isolated surrogates", () => {
  const good = encodeBackup(data(entry()));
  for (const source of [
    good + " {}",
    good.replace('"version": 1', '"version": 01'),
    good.replace('"draft": ""', '"draft":"a","draft":"b"'),
    "[".repeat(1000) + "]".repeat(1000),
    good.replace('"draft": ""', '"draft":"\\uD800"'),
    good.replace('"draft": ""', '"draft":"\\x"'),
  ])
    assert.throws(() => decodeBackup(source));
  assert.throws(() =>
    validate({ entries: [entry(), entry()], draft: "", timer: null }),
  );
});
test("Weiter: attachment MIME, canonical Base64, safe names, sizes and links are bounded", () => {
  for (const attachment of [
    { id: "a", name: "../private", mime: "image/jpeg", base64: "/9j/2Q==" },
    { id: "a", name: "x", mime: "text/html", base64: "YQ==" },
    { id: "a", name: "x", mime: "image/jpeg", base64: "YR==" },
    { id: "a", name: "x", mime: "image/jpeg", base64: "!" },
    {
      id: "a",
      name: "x",
      mime: "image/jpeg",
      base64: "A".repeat(4 * Math.ceil(LIMITS.attachment / 3) + 4),
    },
  ])
    assert.throws(() =>
      validate(data({ ...entry(), attachments: [attachment] })),
    );
  assert.throws(() =>
    validate(data({ ...entry(), links: ["javascript:alert(1)"] })),
  );
  assert.throws(() => decodeBackup(" ".repeat(LIMITS.json + 1)));
});
test("Weiter: merging never overwrites local IDs, draft, or running focus timer", () => {
  const local = {
    ...data(entry()),
    draft: "Lokal",
    timer: { entryId: "entry-1", endsAt: now + 100000, durationMinutes: 5 },
  };
  const incoming = {
    ...data({ ...entry(), thought: "Nicht überschreiben" }),
    draft: "Import",
  };
  assert.deepEqual(merge(local, incoming), local);
  const second = { ...entry(), id: "entry-2" };
  assert.equal(merge(local, data(second)).entries.length, 2);
  assert.deepEqual(
    merge(merge(local, data(second)), data(second)),
    merge(local, data(second)),
  );
});
const set = (id, values = {}) => ({ id, name: id, sets: 3, minutes: 3, completed: 0, core: false, blocked: false, ...values });

test("Satzfenster allocates whole sets to priorities before earlier optional work", () => {
  const entries = [set("optional", { minutes: 2 }), set("priority", { core: true })];
  const plan = estimate(entries, 660);
  assert.equal(plan.next.id, "priority");
  assert.deepEqual(plan.byId.get("priority"), { fit: 3, later: 0, waiting: 0 });
  assert.deepEqual(plan.byId.get("optional"), { fit: 1, later: 2, waiting: 0 });
  assert.equal(plan.scheduled, 4);
  assert.equal(plan.deferred, 2);
  assert.equal(estimate(entries, 119).scheduled, 0);
});

test("Satzfenster reallocates blocked sets and counts only incomplete sets", () => {
  const entries = [set("main", { core: true, blocked: true, completed: 1 }), set("other")];
  const plan = estimate(entries, 540);
  assert.equal(plan.blocked, 2);
  assert.equal(plan.scheduled, 3);
  assert.deepEqual(plan.byId.get("main"), { fit: 0, later: 0, waiting: 2 });
  entries[0].blocked = false;
  const freed = estimate(entries, 540);
  assert.equal(freed.next.id, "main");
  assert.equal(freed.byId.get("other").fit, 1);
});

test("Satzfenster restores a fixed deadline and validates incomplete saved data", () => {
  const saved = {
    deadline: now + 60_000, minutes: 1,
    exercises: [set("valid", { completed: 2 }), set("bad-duration", { minutes: 0 }), null, set("valid")],
  };
  const restored = restorePlan(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.exercises, [set("valid", { completed: 2 })]);
  assert.equal(secondsLeft(restored, now + 30_000), 30);
  assert.equal(secondsLeft(restored, now + 61_000), 0);
  assert.equal(secondsLeft(emptyPlan(), now), 1500);
  assert.deepEqual(restorePlan({ minutes: -5, deadline: Infinity, exercises: "bad" }), emptyPlan());
});

function solid(r, g, b) {
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([r, g, b, 255], i);
  return pixels;
}
test("SehPlus: Android colour families include fabric neutrals and undertones", () => {
  for (const [rgb, expected] of [
    [[255, 0, 0], "Rot"],
    [[0, 255, 0], "Grün"],
    [[0, 0, 255], "Blau"],
    [[0, 0, 0], "Schwarz"],
    [[255, 255, 255], "Weiß"],
    [[124, 139, 153], "Grau"],
    [[197, 160, 121], "Sand"],
  ]) {
    const result = analyzePixels(solid(...rgb), 64, 64, 32, 32, 18);
    assert.ok(result.name.startsWith(expected), `${rgb}: ${result.name}`);
    assert.deepEqual([result.r, result.g, result.b], rgb);
    assert.ok(result.count > 500);
    assert.ok(["niedrig", "mittel", "hoch"].includes(result.confidence));
  }
  assert.equal(baseName(30, 0.2, 0.95), "Creme");
  assert.equal(baseName(30, 0.8, 0.4), "Braun");
});
test("SehPlus: neutral calibration rejects saturated/dark references; gains are bounded", () => {
  assert.throws(() =>
    calibrationGains(analyzePixels(solid(240, 0, 0), 64, 64, 32, 32, 18)),
  );
  assert.throws(() =>
    calibrationGains(analyzePixels(solid(10, 10, 10), 64, 64, 32, 32, 18)),
  );
  const result = analyzePixels(solid(190, 185, 180), 64, 64, 32, 32, 18);
  const gains = calibrationGains(result);
  assert.ok(gains.every((x) => x >= 0.7 && x <= 1.4));
  assert.deepEqual(automaticGains(solid(255, 0, 0), 64, 64), [1, 1, 1]);
});
test("SehPlus: two-colour comparison communicates more than colour alone", () => {
  assert.match(
    compareColors(
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255, confidence: "hoch" },
    ),
    /Punkt B ist heller/,
  );
  assert.match(
    compareColors(
      { r: 255, g: 0, b: 0 },
      { r: 255, g: 0, b: 0, confidence: "mittel" },
    ),
    /Farbabstand: 0/,
  );
});
test("Published apps have local offline clients or explicit HTTPS web entry points", async () => {
  for (const slug of await readdir(
    new URL("../../apps/inbox/", import.meta.url),
  )) {
    if (slug === "_template") continue;
    const dir = new URL(`../../apps/inbox/${slug}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("app.json", dir)));
    if (manifest.status !== "published") continue;
    if (manifest.webUrl !== undefined) {
      const { publicWebUrl } = await import("../../scripts/web-url.mjs");
      assert.equal(manifest.projectType, "web-app");
      assert.equal(new URL(publicWebUrl(manifest, slug)).protocol, "https:");
      assert.equal(manifest.demoDir, undefined);
      continue;
    }
    assert.equal(manifest.demoDir, "demo");
    assert.ok(manifest.platform.includes("Web/PWA"));
    await readFile(new URL("demo/index.html", dir));
    for (const file of [
      "index.html",
      "app.js",
      "sw.js",
      "manifest.webmanifest",
    ]) {
      const source = await readFile(new URL("demo/" + file, dir), "utf8");
      assert.doesNotMatch(
        source,
        /sk-proj-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9]{30,}/,
      );
      assert.doesNotMatch(
        source,
        /https:\/\/(?:cdn\.|unpkg\.|fonts\.googleapis)/,
      );
    }
    if (slug !== "origincheck") {
      const source = await readFile(new URL("demo/app.js", dir), "utf8");
      assert.doesNotMatch(source, /\.innerHTML\s*=/);
    }
  }
});
test("PWA mirrors and complete source archives match canonical sources", () => {
  const result = spawnSync(
    "python3",
    ["scripts/package-web-apps.py", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
