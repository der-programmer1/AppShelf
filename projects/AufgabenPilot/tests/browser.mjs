import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = "http://127.0.0.1:" + port;
const child = spawn(process.env.PYTHON || "python3", [path.join(root, "tests/browser_server.py"), String(port)], { stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
child.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });
const token = "test-access-code-with-at-least-32-characters";
const screenshots = path.join(root, "test-results");
await mkdir(screenshots, { recursive: true });
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(base + "/health")).ok; } catch {}
    if (ready) break;
    if (child.exitCode !== null) throw new Error("Test server failed: " + serverLog);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Test HTTP server did not start: " + serverLog);
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, colorScheme: "light" });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let analyses = 0;
      page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/plan") analyses++; });
      await page.goto(base);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
        if (engine === "chromium" && [390, 1280].includes(width)) await page.screenshot({ path: path.join(screenshots, "initial-" + width + ".png"), fullPage: true });
      }
      await page.getByRole("button", { name: "Dunkelmodus", exact: true }).press("Space");
      assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
      await page.reload();
      assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await noOverflow(page);
      }
      assert.equal(analyses, 0);
      assert.equal(await page.locator("#camera").getAttribute("capture"), "environment");
      await page.setViewportSize({ width: 390, height: 900 });
      await page.locator("#access-code").fill(token);
      const image = Buffer.from(await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 500; canvas.height = 600;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, 500, 600);
        ctx.fillStyle = "black"; ctx.font = "28px sans-serif"; ctx.fillText("Aufgabe: 3x + 5 = 20", 20, 60);
        return canvas.toDataURL("image/png").split(",")[1];
      }), "base64");
      await page.locator("#files").setInputFiles({ name: "Hausaufgaben.png", mimeType: "image/png", buffer: image });
      assert.equal(await page.locator("#file-list li").count(), 1);
      await page.getByRole("button", { name: /Plan & Lösungen erstellen/ }).click();
      assert.equal(analyses, 0, "no network without explicit consent");
      await page.locator("#consent").check();
      await page.getByRole("button", { name: /Plan & Lösungen erstellen/ }).click();
      await page.getByRole("heading", { name: "Vertragstest: Lineare Gleichung", exact: true }).waitFor();
      assert.equal(analyses, 1);
      assert.equal(await page.locator(".task-card").count(), 1);
      assert.equal(await page.locator(".schedule li").count(), 3);
      const solution = page.locator(".solution");
      assert.equal(await solution.getAttribute("open"), null);
      await solution.locator("summary").press("Enter");
      assert.equal(await solution.locator("p.answer").first().textContent(), "x = 5");
      await page.locator(".task-done input").check();
      assert.match(await page.locator(".task-card").getAttribute("class"), /done/);
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Plan herunterladen", exact: true }).click();
      assert.equal((await download).suggestedFilename(), "AufgabenPilot-FA2-Plan.txt");
      await solution.locator("summary").click();
      await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
      assert.equal(await solution.getAttribute("open"), "");
      await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
      assert.equal(await solution.getAttribute("open"), null);
      await noOverflow(page);
      await page.reload();
      assert.equal(await page.locator("#file-list li").count(), 0);
      assert.equal(await page.locator("#access-code").inputValue(), "");
      assert.equal(await page.locator("#result").isVisible(), false);
      await page.route("**/api/plan", async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        data.title = "<img src=x onerror=alert(1)>";
        data.tasks[0].question = "<script>window.injection=true</script>";
        await route.fulfill({ response, json: data });
      });
      await page.locator("#access-code").fill(token);
      await page.locator("#task-text").fill("3x + 5 = 20");
      await page.locator("#consent").check();
      await page.getByRole("button", { name: /Plan & Lösungen erstellen/ }).click();
      await page.locator("#result").waitFor({ state: "visible" });
      assert.equal(await page.locator("#plan-content img, #plan-content script").count(), 0);
      assert.equal(await page.evaluate(() => window.injection), undefined);
      assert.equal(await page.locator(".result-header h3").textContent(), "<img src=x onerror=alert(1)>");
      await page.unroute("**/api/plan");
      await page.getByRole("button", { name: "Alles leeren", exact: true }).click();
      assert.equal(await page.locator("#access-code").inputValue(), "");
      assert.equal(await page.locator("#task-text").inputValue(), "");
      assert.equal(await page.locator("#plan-content").textContent(), "");
      await page.route("**/api/plan", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "API-Schlüssel auf dem Server fehlt." }) }));
      await page.locator("#access-code").fill(token);
      await page.locator("#task-text").fill("3x + 5 = 20");
      await page.locator("#consent").check();
      await page.getByRole("button", { name: /Plan & Lösungen erstellen/ }).click();
      await page.locator("#status").filter({ hasText: "API-Schlüssel auf dem Server fehlt." }).waitFor();
      assert.equal(await page.locator("#result").isVisible(), false);
      assert.equal(await page.locator("#generate").isEnabled(), true);
      assert.deepEqual(errors, []);
      console.log("PASS " + engine + ": upload through real test API, consent, time blocks, solutions, export, print, clearing, errors, XSS, dark mode and four viewport widths");
      await context.close();
    } finally { await browser.close(); }
  }
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); });
}
