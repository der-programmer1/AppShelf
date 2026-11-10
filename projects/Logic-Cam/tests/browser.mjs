import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(
  process.env.LOGIC_CAM_ROOT ?? fileURLToPath(new URL("../", import.meta.url)),
);
const prefix = "/AppShelf/apps/logic-cam/demo/";
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".md": "text/plain",
  ".webmanifest": "application/manifest+json",
};
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    const relative =
      decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
    const target = path.resolve(root, relative);
    if (!target.startsWith(root + path.sep)) throw new Error("Invalid path");
    const data = await fs.readFile(target);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(target)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}${prefix}`;
const errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});

async function ready(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(
    () => document.getElementById("node-count").textContent === "6",
  );
}
async function waitCircuit(page) {
  await page.waitForFunction(
    () =>
      document.querySelectorAll("#dc-switches button").length === 1 &&
      document.getElementById("node-count").textContent === "3",
    null,
    { timeout: 45000 },
  );
}
async function tapPhoto(page, x, y, width = 1280, height = 964) {
  const box = await page.locator("#ar-canvas").boundingBox(),
    s = Math.min(box.width / width, box.height / height);
  await page
    .locator("#ar-canvas")
    .click({
      position: {
        x: (box.width - width * s) / 2 + x * s,
        y: (box.height - height * s) / 2 + y * s,
      },
    });
}
async function saveShot(page, name) {
  if (!process.env.LOGIC_CAM_SHOTS) return;
  await fs.mkdir(process.env.LOGIC_CAM_SHOTS, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.LOGIC_CAM_SHOTS, name),
    fullPage: true,
  });
}
async function stageFillsViewport(page) {
  const result = await page.evaluate(() => {
    const r = document.getElementById("camera-stage").getBoundingClientRect();
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  assert.ok(
    Math.abs(result.x) < 2 && Math.abs(result.y) < 2,
    JSON.stringify(result),
  );
  assert.ok(
    Math.abs(result.width - result.vw) < 3 &&
      Math.abs(result.height - result.vh) < 3,
    JSON.stringify(result),
  );
}

try {
  const context = await browser.newContext({
      viewport: { width: 1360, height: 1000 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  await ready(page);
  await page
    .locator("#photo-file")
    .setInputFiles(path.join(root, "assets/circuit-example.svg"));
  await waitCircuit(page);
  assert.match(await page.locator("#dc-state").textContent(), /Lampe aus/);
  await page.locator("#dc-switches button").click();
  assert.match(
    await page.locator("#dc-state").textContent(),
    /1 Lampe leuchtet/,
  );
  await tapPhoto(page, 666, 425);
  assert.match(await page.locator("#dc-state").textContent(), /Lampe aus/);
  await saveShot(page, "03-stromkreis.png");
  await page.locator("#fullscreen-toggle").click();
  await stageFillsViewport(page);
  await tapPhoto(page, 666, 425);
  assert.match(
    await page.locator("#dc-state").textContent(),
    /1 Lampe leuchtet/,
  );
  await page.locator("#stage-exit").click();
  await page.waitForFunction(
    () => !document.body.classList.contains("camera-expanded"),
  );
  assert.match(
    await page.locator("#dc-state").textContent(),
    /1 Lampe leuchtet/,
  );
  await page.locator(".dc-edit summary").click();
  await tapPhoto(page, 250, 610);
  await page.locator("#dc-remove").click();
  await page.waitForFunction(
    () => document.getElementById("node-count").textContent === "2",
  );
  await page.locator("#dc-add-kind").selectOption("LAMP");
  await page.locator("#dc-mark").click();
  await tapPhoto(page, 248, 548);
  await tapPhoto(page, 249, 673);
  await page.waitForFunction(
    () => document.getElementById("node-count").textContent === "3",
  );
  assert.equal(await page.locator("#dc-switches button").count(), 1);
  assert.match(
    await page.locator("#dc-state").textContent(),
    /1 Lampe leuchtet/,
  );
  await page.locator("#mode-sandbox").click();
  assert.equal(await page.locator("#node-count").textContent(), "6");
  await page.locator("#camera-start").click();
  await page.waitForFunction(
    () =>
      document.getElementById("camera-video").srcObject?.getVideoTracks()[0]
        ?.readyState === "live",
  );
  await page.locator("#fullscreen-toggle").click();
  await stageFillsViewport(page);
  assert.equal(
    await page.evaluate(
      () =>
        document.getElementById("camera-video").srcObject.getVideoTracks()[0]
          .readyState,
    ),
    "live",
  );
  await page.locator("#stage-exit").click();
  await page.locator("#mode-sandbox").click();
  await page.waitForFunction(
    () => !document.getElementById("camera-video").srcObject,
  );
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await mobile.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
  });
  const phone = await mobile.newPage();
  await ready(phone);
  // Clockwise-rotated photo checks portrait projection and rotated symbol detection.
  await phone.evaluate(async () => {
    const image = new Image();
    image.src = "assets/circuit-example.svg";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 964;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d");
    ctx.translate(964, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "portrait.png", { type: "image/png" }));
    const input = document.getElementById("photo-file");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitCircuit(phone);
  await phone.locator("#fullscreen-toggle").click();
  await stageFillsViewport(phone);
  assert.equal(await phone.evaluate(() => !!document.fullscreenElement), false);
  await tapPhoto(phone, 964 - 425, 666, 964, 1280);
  assert.match(
    await phone.locator("#dc-state").textContent(),
    /1 Lampe leuchtet/,
  );
  assert.ok(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await saveShot(phone, "04-vollbild.png");
  await phone.setViewportSize({ width: 844, height: 390 });
  await stageFillsViewport(phone);
  await tapPhoto(phone, 964 - 425, 666, 964, 1280);
  assert.match(await phone.locator("#dc-state").textContent(), /Lampe aus/);
  await phone.locator("#stage-exit").click();
  await phone.waitForFunction(
    () => !document.body.classList.contains("camera-expanded"),
  );
  await phone.evaluate("navigator.serviceWorker.ready");
  await phone.reload();
  await phone.waitForFunction(() => !!navigator.serviceWorker.controller);
  await mobile.setOffline(true);
  await phone.reload({ waitUntil: "domcontentloaded" });
  await phone.locator("#input-switches button").nth(2).waitFor();
  assert.equal(await phone.locator("#node-count").textContent(), "6");
  assert.deepEqual(errors, []);
  console.log(
    "Passed: photo recognition, switch simulation, manual corrections, native fullscreen, Safari-style fallback, portrait/rotation alignment, camera stream lifecycle, mobile layout and offline reload.",
  );
  await mobile.close();
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
