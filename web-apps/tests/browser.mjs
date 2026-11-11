import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";
const root = path.resolve(
  fileURLToPath(new URL("../../dist/", import.meta.url)),
);
const localApps = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8")).apps
  .filter((app) => app.demoHref && !app.demoHref.startsWith("https://"));
let disconnect = false;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".mp4": "video/mp4",
};
const server = createServer(async (req, res) => {
  if (disconnect) {
    req.socket.destroy();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    assert.ok(pathname.startsWith("/AppShelf/"));
    const relative = pathname.slice("/AppShelf/".length);
    const file = path.resolve(
      root,
      relative + (relative.endsWith("/") || !relative ? "index.html" : ""),
    );
    assert.ok(file.startsWith(root + path.sep));
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/AppShelf/`,
  checks = [];
let activePage;
const engines = process.env.APPSHELF_WEB_ENGINES?.split(",") || [
  "chromium",
  "webkit",
];
async function check(name, action) {
  try {
    await action();
  } catch (error) {
    console.error(
      name,
      await activePage
        ?.evaluate(() => ({
          status: document.querySelector("#status")?.textContent,
          recorder: typeof MediaRecorder,
          mediaDevices: typeof navigator.mediaDevices,
          url: location.pathname,
        }))
        .catch(() => null),
    );
    throw error;
  }
  checks.push(name);
  console.log(`ok ${checks.length} - ${name}`);
}
function wav(seconds = 12) {
  const rate = 44100,
    samples = rate * seconds,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.round(Math.sin((i / rate) * 440 * Math.PI * 2) * 1000),
      44 + i * 2,
    );
  return buffer;
}
async function stored(page, app, change) {
  return page.evaluate(
    async ({ app, source }) => {
      const req = indexedDB.open("appshelf-" + app, 1),
        db = await new Promise((ok, no) => {
          req.onsuccess = () => ok(req.result);
          req.onerror = no;
        });
      const tx = db.transaction("data", "readwrite"),
        store = tx.objectStore("data"),
        get = store.get("state");
      get.onsuccess = () => {
        const value = get.result;
        const mutate = new Function("state", source);
        mutate(value);
        store.put(value, "state");
      };
      await new Promise((ok, no) => {
        tx.oncomplete = ok;
        tx.onerror = no;
      });
      db.close();
    },
    { app, source: change },
  );
}
try {
  for (const engine of engines) {
    const browser = await { chromium, webkit }[engine].launch();
    try {
      const context = await browser.newContext({
          viewport: { width: 390, height: 900 },
          reducedMotion: "reduce",
        }),
        page = await context.newPage(),
        errors = [];
      activePage = page;
      page.setDefaultTimeout(12000);
      page.setDefaultNavigationTimeout(12000);
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("dialog", (dialog) =>
        dialog.type() === "prompt"
          ? dialog.accept("Gemerkte Testfarbe <img src=x onerror=alert(1)>")
          : dialog.accept(),
      );
      const open = async (slug) => {
        await page.goto(base + `apps/${slug}/demo/`);
      };
      const image = async () =>
        Buffer.from(
          await page.evaluate(() => {
            const c = document.createElement("canvas");
            c.width = 400;
            c.height = 300;
            const g = c.getContext("2d");
            g.fillStyle = "rgb(197,160,121)";
            g.fillRect(0, 0, 200, 300);
            g.fillStyle = "rgb(124,139,153)";
            g.fillRect(200, 0, 200, 300);
            return c.toDataURL("image/png").split(",")[1];
          }),
          "base64",
        );
      await check(
        `${engine}: every current app has a Web-App link on its detail page`,
        async () => {
          for (const { slug } of localApps) {
            await page.goto(base + `apps/${slug}/`);
            const link = page.getByRole("link", {
              name: "Web-App öffnen",
              exact: true,
            });
            await link.waitFor();
            assert.equal(
              new URL(await link.getAttribute("href"), page.url()).pathname,
              `/AppShelf/apps/${slug}/demo/`,
            );
            assert.equal(
              await page.getByText("Web-Demo", { exact: true }).count(),
              0,
            );
          }
        },
      );
      await check(
        `${engine}: Weiter captures thoughts, retains draft and clarifies into Today`,
        async () => {
          await open("weiter");
          await page.locator("#captureButton").waitFor({ state: "visible" });
          await page.waitForFunction(
            () => document.querySelector("#tabs").children.length === 5,
          );
          await page.locator("#thought").fill("Paket morgen zurückschicken");
          await page.reload();
          await page.waitForFunction(
            () =>
              document.querySelector("#thought").value ===
              "Paket morgen zurückschicken",
          );
          await page.locator("#captureButton").click();
          await page
            .getByRole("heading", {
              name: "Paket morgen zurückschicken",
              exact: true,
            })
            .waitFor();
          await page
            .getByRole("button", { name: "Öffnen / bearbeiten", exact: true })
            .click();
          await page.locator("#nextStep").fill("Etikett im Kundenkonto öffnen");
          await page
            .locator("#notes")
            .fill("Notiz bleibt beim Zurückgehen erhalten.");
          await page.locator("#closeEditor").click();
          await page.locator("#resumeEditor").click();
          assert.equal(
            await page.locator("#notes").inputValue(),
            "Notiz bleibt beim Zurückgehen erhalten.",
          );
          await page.locator("#clarify").click();
          await page.locator("#editor").waitFor({ state: "hidden" });
          await page
            .getByRole("heading", {
              name: "Etikett im Kundenkonto öffnen",
              exact: true,
            })
            .waitFor();
          assert.match(
            await page.locator("#view").innerText(),
            /1 offen heute/,
          );
        },
      );
      await check(
        `${engine}: Weiter parking, complete/reopen and delete/Undo are persistent`,
        async () => {
          await page.locator(".entry select").selectOption("tomorrow");
          await page.getByRole("button", { name: /^Parkplatz/ }).click();
          await page
            .getByRole("heading", {
              name: "Etikett im Kundenkonto öffnen",
              exact: true,
            })
            .waitFor();
          await page.locator(".entry select").selectOption("today");
          await page.getByRole("button", { name: /^Heute/ }).click();
          await page
            .getByRole("button", { name: "Erledigt", exact: true })
            .click();
          await page.getByRole("button", { name: /^Erledigt \(/ }).click();
          await page
            .getByRole("button", { name: "Wieder öffnen", exact: true })
            .click();
          await page.getByRole("button", { name: /^Heute/ }).click();
          await page
            .getByRole("button", { name: "Löschen", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Rückgängig", exact: true })
            .click();
          await page
            .getByRole("heading", {
              name: "Etikett im Kundenkonto öffnen",
              exact: true,
            })
            .waitFor();
          await page.reload();
          await page
            .getByRole("heading", {
              name: "Etikett im Kundenkonto öffnen",
              exact: true,
            })
            .waitFor();
        },
      );
      await check(
        `${engine}: Weiter photo and microphone denial or unsupported recording keep text usable`,
        async () => {
          await page
            .getByRole("button", { name: "Öffnen / bearbeiten", exact: true })
            .click();
          const png = await image();
          await page.locator("#attachmentInput").setInputFiles({
            name: "Foto.png",
            mimeType: "image/png",
            buffer: png,
          });
          await page.locator("#attachments img").waitFor();
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = async () => {
              throw new DOMException(
                "Test: permission denied",
                "NotAllowedError",
              );
            };
          });
          await page.locator("#record").click();
          await page.waitForFunction(() => {
            const message = document.querySelector("#status").textContent;
            return typeof MediaRecorder === "undefined"
              ? message.includes("Aufnahme wird hier nicht unterstützt")
              : message.includes("Mikrofon nicht freigegeben");
          });
          await page.locator("#saveEdit").click();
          await page.locator("#editor").waitFor({ state: "hidden" });
          assert.match(await page.locator(".entry").innerText(), /1 Anhänge/);
        },
      );
      let backup;
      await check(
        `${engine}: Weiter real voice-file attachment and compatible recording format`,
        async () => {
          await page
            .getByRole("button", { name: "Öffnen / bearbeiten", exact: true })
            .click();
          await page
            .locator("#attachmentInput")
            .setInputFiles({
              name: "Sprachnotiz.wav",
              mimeType: "audio/wav",
              buffer: wav(1),
            });
          await page.locator("#attachments audio").waitFor();
          assert.equal(
            await page
              .locator("#attachments audio")
              .evaluate((a) => a.controls),
            true,
          );
          await page.locator("#saveEdit").click();
          await page.locator("#editor").waitFor({ state: "hidden" });
          if (engine === "chromium") {
            const encoded = (
              await readFile(
                fileURLToPath(
                  new URL("./fixtures/voice.webm", import.meta.url),
                ),
              )
            ).toString("base64");
            const result = await page.evaluate(async (base64) => {
              const { prepareRecording } = await import("./audio.js"),
                blob = await prepareRecording(
                  [Uint8Array.from(atob(base64), (x) => x.charCodeAt(0))],
                  "audio/webm;codecs=opus",
                ),
                bytes = new Uint8Array(await blob.arrayBuffer());
              return {
                type: blob.type,
                header: new TextDecoder().decode(bytes.slice(0, 4)),
                size: bytes.length,
              };
            }, encoded);
            assert.equal(result.type, "audio/wav");
            assert.equal(result.header, "RIFF");
            assert.ok(result.size > 16000 && result.size < 100000);
          }
        },
      );
      await check(
        `${engine}: Weiter exports real JSON; invalid import changes no data; merge is idempotent`,
        async () => {
          await page
            .locator("#export")
            .evaluate((e) => (e.closest("details").open = true));
          const downloaded = page.waitForEvent("download");
          await page.locator("#export").click();
          const file = await downloaded;
          backup = await readFile(await file.path(), "utf8");
          const doc = JSON.parse(backup);
          assert.equal(doc.format, "weiter-backup");
          assert.equal(doc.entries[0].attachments[0].mime, "image/png");
          const before = await page.locator("#view").innerText();
          await page.locator("#import").setInputFiles({
            name: "kaputt.json",
            mimeType: "application/json",
            buffer: Buffer.from('{"format":"weiter-backup","entries":[{}]}'),
          });
          await page.waitForFunction(() =>
            document.querySelector("#status").textContent.includes("ungültig"),
          );
          assert.equal(await page.locator("#view").innerText(), before);
          await page
            .locator("#import")
            .evaluate((e) => (e.closest("details").open = true));
          await page.locator("#import").setInputFiles({
            name: "Weiter.json",
            mimeType: "application/json",
            buffer: Buffer.from(backup),
          });
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("zusammengeführt"),
          );
          assert.equal(await page.locator(".entry").count(), 1);
        },
      );
      await check(
        `${engine}: Weiter focus timer survives reload; never auto-completes a task`,
        async () => {
          await page
            .getByRole("button", { name: "Fokus", exact: true })
            .click();
          await page.locator("#timerForm button.primary").click();
          await page.locator("#focus").waitFor({ state: "visible" });
          await page.reload();
          await page.locator("#focus").waitFor({ state: "visible" });
          await stored(page, "weiter", "state.timer.endsAt=Date.now()-1000");
          await page.reload();
          await page.waitForFunction(
            () => document.querySelector("#focusClock").textContent === "0:00",
          );
          assert.match(
            await page.locator("#focusState").innerText(),
            /Du entscheidest/,
          );
          assert.equal(await page.locator(".entry").count(), 1);
          await page.locator("#focusCancel").click();
          await page.locator("#focus").waitFor({ state: "hidden" });
        },
      );
      await check(
        `${engine}: Weiter shared text is captured once and rendered as plain text`,
        async () => {
          await page.goto(
            base +
              "apps/weiter/demo/?text=" +
              encodeURIComponent(
                '<img src=x onerror="window.injected=true"> Formular',
              ),
          );
          await page
            .getByRole("heading", {
              name: '<img src=x onerror="window.injected=true"> Formular',
              exact: true,
            })
            .waitFor();
          assert.equal(await page.locator(".entry img").count(), 0);
          assert.equal(await page.evaluate(() => window.injected), undefined);
          assert.equal(new URL(page.url()).search, "");
          await page.reload();
          await page.getByRole("button", { name: /^Inbox/ }).click();
          assert.equal(await page.locator(".entry").count(), 1);
        },
      );
      await check(
        `${engine}: Weiter due reminder appears after reopening; local deletion really clears data`,
        async () => {
          await stored(
            page,
            "weiter",
            "state.entries[0].reminderAt=Date.now()-1000",
          );
          await page.reload();
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.startsWith("Erinnerung:"),
          );
          await page
            .locator("#clearAll")
            .evaluate((e) => (e.closest("details").open = true));
          await page.locator("#clearAll").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("Alle lokalen"),
          );
          await page.reload();
          await page.waitForFunction(
            () => document.querySelector("#tabs").children.length === 5,
          );
          assert.equal(await page.locator(".entry").count(), 0);
          await page
            .locator("#import")
            .evaluate((e) => (e.closest("details").open = true));
          await page.locator("#import").setInputFiles({
            name: "Weiter.json",
            mimeType: "application/json",
            buffer: Buffer.from(backup),
          });
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("zusammengeführt"),
          );
        },
      );
      await check(
        `${engine}: SehPlus offline test laboratory, real filters and original-pixel pipette`,
        async () => {
          await open("sehplus");
          await page.locator("#welcomeLater").click();
          await page
            .getByRole("button", { name: "TESTLABOR", exact: true })
            .click();
          assert.equal(await page.locator("#labSamples button").count(), 6);
          await page
            .getByRole("button", { name: "Beiger Stoff", exact: true })
            .click();
          await page.locator("#pipetteButton").click();
          await page.locator("#viewCanvas").focus();
          await page.keyboard.press("ArrowRight");
          assert.match(
            await page.locator("#pipetteResult").innerText(),
            /Grundfarbe: (Beige|Sand|Orange)/,
          );
          const filtered = await page
            .locator("#viewCanvas")
            .evaluate((c) => c.toDataURL());
          await page.locator("#normalButton").click();
          const original = await page
            .locator("#viewCanvas")
            .evaluate((c) => c.toDataURL());
          assert.notEqual(filtered, original);
          await page.locator("#compare").click();
          await page.keyboard.press("Tab");
          await page.locator("#viewCanvas").focus();
          await page.keyboard.press("ArrowRight");
          await page.keyboard.press("ArrowLeft");
          assert.match(
            await page.locator("#comparison").innerText(),
            /Farbabstand:/,
          );
        },
      );
      await check(
        `${engine}: SehPlus image picker, colour memo, XSS safety, reload and deletion`,
        async () => {
          const png = await image();
          await page.locator("#imageInput").setInputFiles({
            name: "stoff.png",
            mimeType: "image/png",
            buffer: png,
          });
          await page.waitForFunction(() =>
            document
              .querySelector("#statusText")
              .textContent.includes("Bild lokal"),
          );
          await page.locator("#viewCanvas").focus();
          await page.keyboard.press("ArrowLeft");
          await page.locator("#saveNoteButton").click();
          await page
            .getByRole("button", { name: "MEMOS", exact: true })
            .click();
          await page.locator(".memo").waitFor();
          assert.match(await page.locator(".memo").innerText(), /<img src=x/);
          assert.equal(await page.locator(".memo img").count(), 0);
          await page.reload();
          await page
            .getByRole("button", { name: "MEMOS", exact: true })
            .click();
          await page.locator(".memo").waitFor();
          await page
            .getByRole("button", { name: "Memo löschen", exact: true })
            .click();
          assert.equal(await page.locator(".memo").count(), 0);
        },
      );
      await check(
        `${engine}: SehPlus neutral light calibration, reset and reading mode`,
        async () => {
          await page
            .getByRole("button", { name: "KAMERA", exact: true })
            .click();
          const png = Buffer.from(
            await page.evaluate(() => {
              const c = document.createElement("canvas");
              c.width = c.height = 128;
              const g = c.getContext("2d");
              g.fillStyle = "rgb(190,185,180)";
              g.fillRect(0, 0, 128, 128);
              return c.toDataURL("image/png").split(",")[1];
            }),
            "base64",
          );
          await page
            .locator("#imageInput")
            .setInputFiles({
              name: "neutrale-referenz.png",
              mimeType: "image/png",
              buffer: png,
            });
          await page.waitForFunction(() =>
            document
              .querySelector("#statusText")
              .textContent.includes("Bild lokal"),
          );
          await page.locator("#viewCanvas").focus();
          await page.keyboard.press("ArrowRight");
          await page.locator("#calibrate").click();
          assert.match(
            await page.locator("#calibrationStatus").innerText(),
            /Lichtkalibrierung aktiv/,
          );
          await page.locator("#calibrate").click();
          assert.match(
            await page.locator("#calibrationStatus").innerText(),
            /Keine Lichtkalibrierung/,
          );
          await page.locator("#recognitionDetails summary").click();
          await page.locator("#recognitionSelect").selectOption("whiteboard");
          assert.match(
            await page.locator("#statusText").innerText(),
            /Whiteboard/,
          );
        },
      );
      await check(
        `${engine}: SehPlus camera refusal leaves laboratory available; video supports seeking and saving`,
        async () => {
          await page
            .getByRole("button", { name: "KAMERA", exact: true })
            .click();
          await page.evaluate(() => {
            navigator.mediaDevices.getUserMedia = async () => {
              throw new DOMException("Test: denied", "NotAllowedError");
            };
          });
          await page.locator("#cameraButton").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#statusText")
              .textContent.includes("nicht erlaubt"),
          );
          await page
            .locator("#imageInput")
            .setInputFiles(
              fileURLToPath(
                new URL(
                  "../../projects/OriginCheck/tests/fixtures/video.mp4",
                  import.meta.url,
                ),
              ),
            );
          await page.locator("#videoControls").waitFor({ state: "visible" });
          await page.waitForFunction(
            () => Number(document.querySelector("#videoSeek").max) > 0,
          );
          await page.locator("#videoSeek").evaluate((input) => {
            input.value = Number(input.max) / 2;
            input.dispatchEvent(new Event("input"));
          });
          await page.waitForFunction(() =>
            document.querySelector("#videoTime").textContent.includes("/"),
          );
          const downloadPromise = page.waitForEvent("download");
          await page.locator("#saveImage").click();
          const d = await downloadPromise;
          const bytes = await readFile(await d.path());
          assert.equal(bytes.subarray(1, 4).toString(), "PNG");
          await page.locator("#clearMedia").click();
          await page.locator("#stageEmpty").waitFor({ state: "visible" });
        },
      );
      await check(
        `${engine}: GymDelay local audio, same-track pause/countdown/resume and real cancellation`,
        async () => {
          await open("gymdelay");
          await page.locator("#audioFile").setInputFiles({
            name: "Trainingssong.wav",
            mimeType: "audio/wav",
            buffer: wav(),
          });
          await page.waitForFunction(
            () => !document.querySelector("#start").disabled,
          );
          await page.getByRole("button", { name: "5 s", exact: true }).click();
          await page.locator("#start").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#countdownState")
              .textContent.includes("pausiert"),
          );
          assert.equal(
            await page.locator("#player").evaluate((a) => a.paused),
            true,
          );
          await page.waitForFunction(
            () =>
              !document.querySelector("#resume").hidden ||
              !document.querySelector("#player").paused,
            {},
            { timeout: 12000 },
          );
          if (await page.locator("#resume").isVisible())
            await page.locator("#resume").click();
          await page.waitForFunction(
            () => !document.querySelector("#player").paused,
          );
          await page.locator("#start").click();
          await page.locator("#cancel").click();
          await page.waitForFunction(() =>
            document
              .querySelector("#status")
              .textContent.includes("Abgebrochen"),
          );
          assert.equal(
            await page.locator("#player").evaluate((a) => a.paused),
            true,
          );
          assert.match(
            await page.locator("#status").innerText(),
            /Abgebrochen/,
          );
        },
      );
      await check(
        `${engine}: GymDelay persists preset, selected audio and countdown; changing source cancels safely`,
        async () => {
          await page.getByRole("button", { name: "15 s", exact: true }).click();
          await page.locator("#start").click();
          await page.waitForFunction(
            () => !document.querySelector("#cancel").disabled,
          );
          await page.reload();
          await page.waitForFunction(
            () =>
              document.querySelector("#trackName").textContent ===
              "Trainingssong.wav",
          );
          await page.waitForFunction(
            () => !document.querySelector("#cancel").disabled,
          );
          await page.locator("#audioFile").setInputFiles({
            name: "Anderer-Song.wav",
            mimeType: "audio/wav",
            buffer: wav(2),
          });
          await page.waitForFunction(
            () =>
              document.querySelector("#trackName").textContent ===
              "Anderer-Song.wav",
          );
          assert.equal(await page.locator("#cancel").isDisabled(), true);
          assert.equal(
            await page.locator("#player").evaluate((a) => a.paused),
            true,
          );
          await page.reload();
          await page.waitForFunction(
            () => document.querySelector("#countdown").textContent === "15",
          );
          await page
            .locator("#deleteAudio")
            .evaluate((e) => (e.closest("details").open = true));
          await page.locator("#deleteAudio").click();
          await page.waitForFunction(
            () =>
              document.querySelector("#trackName").textContent ===
              "Noch keine Datei ausgewählt",
          );
          await page.reload();
          await page.waitForFunction(
            () =>
              document.querySelector("#trackName").textContent ===
              "Noch keine Datei ausgewählt",
          );
          assert.equal(await page.locator("#start").isDisabled(), true);
        },
      );
      for (const slug of ["weiter", "sehplus", "gymdelay"])
        await check(
          `${engine}: ${slug} isolated PWA scope, phone/tablet layout and real offline reload`,
          async () => {
            await open(slug);
            await page.evaluate(() => navigator.serviceWorker.ready);
            await page.reload();
            await page.waitForFunction(
              () => navigator.serviceWorker.controller !== null,
            );
            assert.ok(
              (
                await page.evaluate(
                  () => navigator.serviceWorker.controller.scriptURL,
                )
              ).endsWith(`/apps/${slug}/demo/sw.js`),
            );
            const manifest = await page.evaluate(async () =>
              fetch("manifest.webmanifest").then((r) => r.json()),
            );
            assert.equal(manifest.scope, "./");
            assert.ok(manifest.icons.some((x) => x.sizes === "192x192"));
            for (const width of [320, 390, 768, 1280]) {
              await page.setViewportSize({ width, height: 900 });
              assert.equal(
                await page.evaluate(
                  () => document.documentElement.scrollWidth <= innerWidth + 1,
                ),
                true,
                `${slug} at ${width}px`,
              );
            }
            // Playwright's Linux WebKit offline switch blocks even service-worker
            // navigations. Cut off the actual HTTP origin for both engines instead;
            // Chromium additionally exercises its browser network switch.
            if (engine !== "webkit") await context.setOffline(true);
            disconnect = true;
            try {
              await page.reload();
              await page.waitForFunction(
                () => !!document.querySelector("main"),
              );
              assert.equal(
                await page.evaluate(async () => {
                  try {
                    await fetch("uncached-offline-probe");
                    return false;
                  } catch {
                    return true;
                  }
                }),
                true,
              );
              if (slug === "weiter") {
                await page.waitForFunction(
                  () => document.querySelector("#tabs").children.length === 5,
                );
                await page.locator("#thought").fill("Ohne Netz festgehalten");
                await page.locator("#captureButton").click();
                await page
                  .getByRole("heading", {
                    name: "Ohne Netz festgehalten",
                    exact: true,
                  })
                  .waitFor();
              } else if (slug === "sehplus") {
                await page
                  .getByRole("button", { name: "TESTLABOR", exact: true })
                  .click();
                await page
                  .getByRole("button", { name: "Whiteboard", exact: true })
                  .click();
                await page.waitForFunction(() =>
                  document
                    .querySelector("#statusText")
                    .textContent.includes("Offline-Testlabor"),
                );
              } else
                assert.equal(
                  await page
                    .getByRole("heading", { name: /Bereit machen/ })
                    .count(),
                  1,
                );
            } finally {
              disconnect = false;
              await context.setOffline(false);
            }
          },
        );
      await check(
        `${engine}: no uncaught errors or executed user HTML`,
        async () => {
          assert.deepEqual(errors, []);
          assert.equal(await page.evaluate(() => window.injected), undefined);
        },
      );
      if (process.env.APPSHELF_WEB_SCREENSHOTS && engine === "chromium") {
        await mkdir(process.env.APPSHELF_WEB_SCREENSHOTS, { recursive: true });
        for (const slug of ["weiter", "sehplus", "gymdelay"]) {
          await open(slug);
          await page.setViewportSize({ width: 390, height: 1000 });
          if (slug === "sehplus") {
            await page
              .getByRole("button", { name: "TESTLABOR", exact: true })
              .click();
            await page
              .getByRole("button", { name: "Farbkante", exact: true })
              .click();
          }
          await page.screenshot({
            path: path.join(
              process.env.APPSHELF_WEB_SCREENSHOTS,
              `${slug}-web.png`,
            ),
            fullPage: true,
          });
        }
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  console.log(
    `PASS: ${checks.length} checks in ${engines.join(" and ")}; physical Apple devices untested.`,
  );
  if (process.env.APPSHELF_WEB_REPORT)
    await writeFile(
      process.env.APPSHELF_WEB_REPORT,
      JSON.stringify(
        { passed: checks.length, checks, engines, physicalSafari: false },
        null,
        2,
      ) + "\n",
    );
} finally {
  disconnect = false;
  await new Promise((resolve) => server.close(resolve));
}
