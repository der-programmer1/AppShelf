import { emptyState, validateState } from "./model.js";
// A read-modify-write transaction includes the fresh state, draft and undo snapshot.
// Multiple tabs cannot silently overwrite one another with stale whole-list copies.
export function repository() {
  let opening;
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("aufbrauchen-changes")
      : null;
  function open() {
    return (opening ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("appshelf-aufbrauchen", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("state");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => {
        opening = null;
        reject(
          Error(
            "Lokaler Speicher nicht verfügbar. Bitte Browser-Speicher und privaten Modus prüfen.",
          ),
        );
      };
    }));
  }
  async function transact(change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", change ? "readwrite" : "readonly"),
        store = tx.objectStore("state");
      let result, error;
      const request = store.get("current");
      request.onsuccess = () => {
        try {
          const current = validateState(
            request.result === undefined ? emptyState() : request.result,
          );
          result = change
            ? validateState(change(structuredClone(current)))
            : current;
          if (change) store.put(result, "current");
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => {
        if (change) channel?.postMessage("changed");
        resolve(result);
      };
      tx.onabort = tx.onerror = () =>
        reject(
          error ||
            Error(
              "Speichern fehlgeschlagen. Deine bisherigen Daten bleiben erhalten. Bitte freien Speicher prüfen.",
            ),
        );
    });
  }
  return {
    read: () => transact(),
    change: (fn) => transact(fn),
    subscribe: (fn) => {
      if (channel) channel.onmessage = () => fn();
    },
    close: () => channel?.close(),
  };
}
export function element(tag, text, className) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
}
export function button(text, fn, className = "") {
  const b = element("button", text, className);
  b.type = "button";
  b.onclick = fn;
  return b;
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = element("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
