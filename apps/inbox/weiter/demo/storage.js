// A separate IndexedDB database per app. A single transaction commits a complete state.
export function database(name) {
  let opened;
  function open() {
    if (!opened)
      opened = new Promise((resolve, reject) => {
        const request = indexedDB.open(`appshelf-${name}`, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("data");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          opened = null;
          reject(
            new Error(
              "Lokaler Speicher ist nicht verfügbar. Bitte den privaten Modus oder die Speicherfreigabe prüfen.",
            ),
          );
        };
      });
    return opened;
  }
  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("data", mode);
      const request = operation(tx.objectStore("data"));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "Speichern fehlgeschlagen. Vorhandene Daten bleiben erhalten. Bitte freien Speicher prüfen.",
          ),
        );
    });
  }
  return {
    get: (key) => transact("readonly", (store) => store.get(key)),
    set: (key, value) =>
      transact("readwrite", (store) => store.put(value, key)),
    setMany: (entries) =>
      transact("readwrite", (store) => {
        for (const [key, value] of entries) store.put(value, key);
      }),
    clear: () => transact("readwrite", (store) => store.clear()),
  };
}

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text, action, className = "") {
  const node = element("button", text, className);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export function registerOffline(status) {
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js")
      .then(async (registration) => {
        await navigator.serviceWorker.ready;
        if (status)
          status.textContent =
            "Offline bereit · Daten bleiben auf diesem Gerät";
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller &&
              status
            )
              status.textContent =
                "Neue Version bereit. Nach dem Schließen aller App-Fenster wird sie aktiviert.";
          });
        });
      })
      .catch(() => {
        if (status)
          status.textContent =
            "Offline-Installation fehlgeschlagen. Erneut online öffnen.";
      });
}
export async function persistentStorage() {
  try {
    return await navigator.storage?.persist?.();
  } catch {
    return false;
  }
}
