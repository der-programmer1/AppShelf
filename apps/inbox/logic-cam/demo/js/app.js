import {
  LogicEngine,
  GATES,
  TYPES,
  WORLD,
  demoCircuit,
  truthTable,
  portPosition,
  pinCount,
} from "./logicEngine.js";
import { Camera, ARRenderer, videoRect } from "./camera.js";
import { VisionService } from "./vision.js";
import { AICoach } from "./aiCoach.js";
import { ElectricalMode } from "./dcMode.js";
import { FullscreenStage } from "./fullscreen.js";

const $ = (id) => document.getElementById(id);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const engine = new LogicEngine(readSaved()),
  coach = new AICoach(),
  camera = new Camera($("camera-video"));
const state = {
  mode: "sandbox",
  graph: engine.graph,
  result: engine.result,
  selected: engine.graph.nodes.find((n) => GATES[n.type])?.id ?? null,
  selectedEdge: null,
  tool: "select",
  placing: null,
  manual: true,
  strokes: [],
  wireStart: null,
  pointer: null,
  photo: null,
  frameEpoch: 0,
};
let detector = null,
  visionLoading = null,
  scanTimer = null,
  scanBusy = false,
  trackingSignature = "",
  trackingFrames = 0,
  misses = 0;
let toastTimer = null,
  saveTimer = null,
  pointerSession = null,
  questionSignature = "",
  cameraBusy = false,
  coachEnabled = true;
let rescanAfter = false,
  photoLoadEpoch = 0;
const history = [],
  overrides = new Map();
const scanCanvas = document.createElement("canvas"),
  scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
const renderer = new ARRenderer(
  $("camera-canvas"),
  $("ar-canvas"),
  $("camera-video"),
  () => state,
  (fps) => {
    $("fps").textContent = `${fps} FPS`;
  },
);
const physical = new ElectricalMode({
  state,
  renderer,
  onRescan: () => {
    if (state.mode === "photo" || state.mode === "camera") scanCamera(true);
  },
  onRender: () => renderUI(),
  onExample: () =>
    openPhoto(new URL("../assets/circuit-example.svg", import.meta.url).href),
  pauseLive: pauseLiveForEdit,
  toast,
});
const fullscreen = new FullscreenStage(
  $("camera-stage"),
  $("fullscreen-toggle"),
  () => renderer.resize(),
);

function readSaved() {
  try {
    const raw = localStorage.getItem("logic-cam-circuit");
    if (raw) return new LogicEngine(JSON.parse(raw)).export();
  } catch {
    /* Invalid or blocked storage never prevents starting. */
  }
  return demoCircuit();
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  $("toast").classList.toggle("error", error);
  toastTimer = setTimeout(
    () => $("toast").classList.add("hidden"),
    error ? 8000 : 4200,
  );
}
function remember() {
  history.push({
    graph: engine.export(),
    strokes: structuredClone(state.strokes),
    selected: state.selected,
    selectedEdge: state.selectedEdge,
  });
  if (history.length > 35) history.shift();
  $("undo-button").disabled = false;
}
function save() {
  clearTimeout(saveTimer);
  if (state.mode !== "sandbox") return;
  const snapshot = JSON.stringify(engine.export());
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem("logic-cam-circuit", snapshot);
    } catch {
      /* Storage quota and private-mode restrictions are nonfatal. */
    }
  }, 400);
}
function refresh({ persist = true, question = true } = {}) {
  try {
    state.result = engine.setGraph(state.graph);
    state.graph = engine.graph;
  } catch (error) {
    toast(error.message, true);
    return false;
  }
  if (!engine.byId.has(state.selected))
    state.selected = state.graph.nodes.find((n) => GATES[n.type])?.id ?? null;
  if (!state.graph.edges.some((e) => e.id === state.selectedEdge))
    state.selectedEdge = null;
  renderUI(question);
  if (persist) save();
  return true;
}
function renderUI(question = true) {
  if (physical.active) {
    physical.renderUI();
    return;
  }
  $("node-count").textContent = state.graph.nodes.length;
  $("edge-count").textContent = state.graph.edges.length;
  $("solve-time").textContent = state.result.elapsed.toFixed(2);
  $("undo-button").disabled = !history.length;
  const errors = state.result.diagnostics.filter(
    (d) => d.code !== "UNCONNECTED",
  );
  $("engine-status").textContent = errors.length
    ? `${errors.length} HINWEIS${errors.length > 1 ? "E" : ""}`
    : "ENGINE BEREIT";
  $("engine-dot").style.background = errors.length ? "#ffc878" : "";
  $("engine-status").title = state.result.diagnostics
    .map((d) => d.message)
    .join("\n");
  $("diagnostics").classList.toggle("hidden", !errors.length);
  $("diagnostics").textContent =
    errors
      .slice(0, 3)
      .map((d) => d.message)
      .join(" ") +
    (errors.length > 3 ? ` +${errors.length - 3} weitere Hinweise.` : "");
  const empty =
    state.graph.nodes.length === 0 &&
    state.strokes.length === 0 &&
    !state.placing &&
    state.tool !== "draw";
  $("board-empty").classList.toggle("hidden", !empty);
  $("empty-title").textContent =
    state.mode !== "sandbox"
      ? "Papier wird zur Schaltung."
      : "Dein nächster Aha-Moment.";
  $("empty-description").textContent =
    state.mode !== "sandbox"
      ? "Erkenne Logikgatter oder einen einfachen Stromkreis mit Batterie, Schalter und Lampe. Unsichere Treffer bitte prüfen."
      : "Platziere links ein Gatter, zeichne mit dem Stift oder lade die Beispielschaltung.";
  $("empty-camera").textContent =
    state.mode === "camera"
      ? camera.stream
        ? "Jetzt erkennen"
        : "Kamera aktivieren"
      : state.mode === "photo"
        ? "Foto erneut erkennen"
        : "Beispiel laden";
  const inputs = $("input-switches");
  inputs.replaceChildren();
  for (const node of state.graph.nodes.filter((n) => n.type === "INPUT")) {
    const button = document.createElement("button"),
      value = state.result.values.get(node.id);
    button.className = `input-chip ${value === 0 ? "low" : value === null ? "unknown" : ""}`;
    button.type = "button";
    button.setAttribute(
      "aria-label",
      `Eingang ${node.label}: ${value ?? "unbekannt"}. Umschalten`,
    );
    button.setAttribute("aria-pressed", String(value === 1));
    const name = document.createElement("span");
    name.textContent = node.label;
    const bit = document.createElement("b");
    bit.textContent = String(value ?? "?");
    button.append(name, bit);
    button.addEventListener("click", () => toggleInput(node.id));
    inputs.append(button);
  }
  if (!inputs.children.length) {
    const text = document.createElement("span");
    text.className = "small-label";
    text.textContent = "Noch keine Eingänge";
    inputs.append(text);
  }
  const selected = engine.byId.get(state.selected);
  $("selection-panel").classList.toggle(
    "hidden",
    !selected && !state.selectedEdge,
  );
  $("gate-type").classList.toggle("hidden", Boolean(state.selectedEdge));
  if (state.selectedEdge)
    $("selection-label").textContent = "LEITUNG AUSGEWÄHLT";
  else if (selected) {
    $("selection-label").textContent = selected.label;
    $("gate-type").value = selected.type;
  }
  renderTruth(selected);
  renderCoach(question);
}
function renderTruth(selected) {
  const gate =
    selected && GATES[selected.type]
      ? selected
      : state.graph.nodes.find((n) => GATES[n.type]);
  const table = $("truth-table"),
    head = table.querySelector("thead"),
    body = table.querySelector("tbody");
  head.replaceChildren();
  body.replaceChildren();
  $("truth-gate").textContent = gate?.type ?? "–";
  if (!gate) {
    const tr = document.createElement("tr"),
      td = document.createElement("td");
    td.textContent = "Platziere ein Gatter.";
    tr.append(td);
    body.append(tr);
    return;
  }
  const header = document.createElement("tr");
  for (const title of [
    ...Array.from({ length: pinCount(gate.type) }, (_, i) =>
      String.fromCharCode(65 + i),
    ),
    "OUT",
  ]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = title;
    header.append(th);
  }
  head.append(header);
  const active = state.result.pins.get(gate.id) ?? [];
  for (const row of truthTable(gate.type)) {
    const tr = document.createElement("tr");
    tr.classList.toggle(
      "active",
      row.inputs.length === active.length &&
        row.inputs.every((v, i) => v === active[i]),
    );
    for (const value of [...row.inputs, row.output]) {
      const td = document.createElement("td");
      td.textContent = String(value);
      tr.append(td);
    }
    body.append(tr);
  }
}
function renderCoach(force = false) {
  const signature = JSON.stringify([
    state.selected,
    state.graph.nodes.map((n) => [n.id, n.type, n.value]),
    state.graph.edges.map((e) => [e.from, e.to, e.pin]),
  ]);
  if ((force && signature !== questionSignature) || !coach.current) {
    coach.next(engine, state.selected);
    questionSignature = signature;
  }
  const question = coach.current;
  $("question-title").textContent = question.title;
  $("question-text").textContent = question.text;
  $("question-kind").textContent = {
    debug: "FEHLERDETEKTIV",
    learn: "LOGIK-BASICS",
    predict: "GEDANKENEXPERIMENT",
    gate: "GATTER-CHALLENGE",
  }[question.kind];
  $("score").textContent = coach.score.toLocaleString("de-DE");
  $("score-level").textContent =
    coach.score >= 2000
      ? "LOGIC MASTER"
      : coach.score >= 500
        ? "BUILDER"
        : "EXPLORER";
  const answers = $("answer-options");
  answers.replaceChildren();
  question.choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "answer-option";
    button.type = "button";
    button.disabled = question.answered;
    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.textContent = String.fromCharCode(65 + index);
    const text = document.createElement("span");
    text.textContent = choice;
    button.append(letter, text);
    if (question.answered) {
      button.classList.toggle("correct", index === question.correct);
      button.classList.toggle(
        "wrong",
        index === question.selected && index !== question.correct,
      );
    }
    button.addEventListener("click", () => {
      const result = coach.answer(index);
      if (!result) return;
      renderCoach(false);
      $("answer-feedback").classList.remove("hidden");
      $("answer-feedback").classList.toggle("wrong", !result.correct);
      $("answer-feedback").textContent =
        (result.correct ? "Richtig! +100 XP. " : "Fast! ") + result.explanation;
    });
    answers.append(button);
  });
  if (!question.answered) $("answer-feedback").classList.add("hidden");
  $("coach-context").textContent = state.graph.nodes.length
    ? "MIT DEINER SCHALTUNG VERBUNDEN"
    : "DEIN ERSTER SCHRITT";
}
function nextQuestion() {
  coach.next(engine, state.selected);
  renderCoach(false);
}
function toggleInput(id) {
  remember();
  state.result = engine.toggle(id);
  state.graph = engine.graph;
  if (state.mode === "camera") overrides.set(id, engine.byId.get(id).value);
  renderUI();
  save();
}
function pauseLiveForEdit() {
  if (state.mode === "camera" && $("live-detection").checked) {
    $("live-detection").checked = false;
    toast("Live-Erkennung pausiert, damit deine Korrekturen erhalten bleiben.");
  }
}
function setTool(tool, placing = null) {
  state.tool = tool;
  state.placing = placing;
  state.wireStart = null;
  document.querySelectorAll("[data-tool]").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document
    .querySelectorAll("[data-gate]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.gate === placing),
    );
  $("canvas-wrap").classList.remove("tool-draw", "tool-wire", "tool-place");
  $("canvas-wrap").classList.add(`tool-${tool}`);
  $("tool-hint").textContent = placing
    ? `${placing} platzieren: Tippe auf eine freie Stelle.`
    : tool === "wire"
      ? "Ausgang rechts antippen → Eingang links antippen."
      : tool === "draw"
        ? "Zeichne Gatter und Leitungen. Danach „Zeichnung erkennen“."
        : "Tippe auf 0 oder 1, um ein Signal umzuschalten.";
  renderUI(false);
}
function setMode(mode) {
  state.frameEpoch++;
  if (mode !== "camera") {
    camera.stop();
    clearTimeout(scanTimer);
    cameraBusy = false;
    $("camera-start").disabled = false;
    $("camera-start").querySelector("span").textContent = "Kamera starten";
  }
  if (mode !== "photo") state.photo = null;
  if (mode === "sandbox") {
    photoLoadEpoch++;
    $("scan-kind").value = "auto";
    physical.newSource();
  }
  state.mode = mode;
  renderer.setZoom(1);
  $("zoom-value").textContent = "100%";
  $("mode-sandbox").classList.toggle("active", mode === "sandbox");
  $("mode-camera").classList.toggle("active", mode !== "sandbox");
  $("mode-sandbox").setAttribute("aria-pressed", String(mode === "sandbox"));
  $("mode-camera").setAttribute("aria-pressed", String(mode !== "sandbox"));
  $("canvas-wrap").classList.toggle("camera-active", mode !== "sandbox");
  $("board-label").textContent =
    mode === "camera"
      ? "LOCAL VISION · LIVE"
      : mode === "photo"
        ? "FOTO · LOKALE ERKENNUNG"
        : "LIVE SIMULATION";
  $("camera-switch").disabled = mode !== "camera" || !camera.stream;
  document.body.classList.toggle("scan-pulse", mode === "camera");
  renderUI();
}
async function startCamera() {
  if (cameraBusy) return;
  photoLoadEpoch++;
  physical.newSource();
  cameraBusy = true;
  $("camera-start").disabled = true;
  $("camera-start").querySelector("span").textContent =
    "Kamera wird geöffnet …";
  // Never paint the sample circuit on a camera frame and suggest it was detected.
  remember();
  state.graph = { nodes: [], edges: [] };
  state.strokes = [];
  state.selected = null;
  overrides.clear();
  refresh({ persist: false });
  setMode("camera");
  try {
    const started = await camera.start();
    if (!started || state.mode !== "camera") return;
    $("camera-switch").disabled = false;
    $("camera-start").querySelector("span").textContent = "Kamera aktiv";
    $("vision-status").textContent = "Kamera bereit. Lokale Erkennung startet.";
    await ensureVision();
    if (state.mode === "camera" && camera.stream) scheduleScan();
  } catch (error) {
    $("vision-status").textContent = error.message;
    toast(error.message, true);
    $("camera-start").querySelector("span").textContent = "Erneut versuchen";
  } finally {
    cameraBusy = false;
    $("camera-start").disabled = false;
    renderUI(false);
  }
}
async function openPhoto(source) {
  const epoch = ++photoLoadEpoch;
  let objectURL = null;
  try {
    if (source instanceof File) {
      if (source.size > 20 * 1024 * 1024)
        throw new Error("Das Foto darf höchstens 20 MB groß sein.");
      if (!source.type.startsWith("image/"))
        throw new Error("Bitte ein Bild auswählen.");
      objectURL = URL.createObjectURL(source);
    }
    const image = new Image();
    image.decoding = "async";
    image.src = objectURL ?? source;
    await image.decode();
    if (epoch !== photoLoadEpoch) return;
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Das Bild konnte nicht gelesen werden.");
    const scale = Math.min(
        1,
        1800 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      photo = document.createElement("canvas");
    photo.width = Math.round(image.naturalWidth * scale);
    photo.height = Math.round(image.naturalHeight * scale);
    photo.getContext("2d").drawImage(image, 0, 0, photo.width, photo.height);
    physical.newSource();
    state.photo = photo;
    state.graph = { nodes: [], edges: [] };
    state.strokes = [];
    state.selected = null;
    overrides.clear();
    refresh({ persist: false });
    setMode("photo");
    renderer.resize();
    await scanCamera(true);
  } catch (error) {
    toast(`Foto konnte nicht geöffnet werden: ${error.message}`, true);
  } finally {
    if (objectURL) URL.revokeObjectURL(objectURL);
  }
}
async function ensureVision() {
  if (detector) return detector;
  if (!visionLoading)
    visionLoading = VisionService.create((message) => {
      $("vision-status").textContent = message;
    })
      .then((service) => {
        detector = service;
        return detector;
      })
      .finally(() => {
        visionLoading = null;
      });
  return visionLoading;
}
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(async () => {
    if (state.mode !== "camera" || !camera.stream) return;
    if ($("live-detection").checked && !document.hidden)
      await scanCamera(false);
    scheduleScan();
  }, 300);
}
function mergeDetections(graph) {
  const previous = state.graph.nodes,
    used = new Set(),
    mapping = new Map();
  for (const node of graph.nodes) {
    let closest = null,
      distance = 90;
    for (const old of previous) {
      const d = Math.hypot(old.x - node.x, old.y - node.y);
      if (!used.has(old.id) && d < distance) {
        closest = old;
        distance = d;
      }
    }
    const original = node.id;
    node.id = closest?.id ?? uid();
    used.add(node.id);
    mapping.set(original, node.id);
    if (closest) {
      node.x = closest.x * 0.3 + node.x * 0.7;
      node.y = closest.y * 0.3 + node.y * 0.7;
    }
    if (node.type === "INPUT" && overrides.has(node.id))
      node.value = overrides.get(node.id);
  }
  graph.edges = graph.edges.map((edge) => ({
    ...edge,
    from: mapping.get(edge.from),
    to: mapping.get(edge.to),
    id: uid(),
  }));
  return graph;
}
async function scanCamera(force = false) {
  const photoMode = state.mode === "photo";
  if (scanBusy) {
    if (force) rescanAfter = true;
    return;
  }
  if (
    (!photoMode && state.mode !== "camera") ||
    (photoMode
      ? !state.photo
      : !camera.stream || $("camera-video").readyState < 2)
  )
    return;
  scanBusy = true;
  try {
    const vision = await ensureVision();
    if (state.mode !== "camera" && state.mode !== "photo") return;
    const generation = camera.generation,
      frameEpoch = state.frameEpoch,
      physicalEpoch = physical.epoch,
      video = state.mode === "photo" ? state.photo : $("camera-video"),
      sourceWidth = video.videoWidth || video.width,
      sourceHeight = video.videoHeight || video.height,
      maximum = $("scan-kind").value === "logic" ? 640 : 960,
      ratio = Math.min(1, maximum / Math.max(sourceWidth, sourceHeight)),
      width = Math.max(1, Math.round(sourceWidth * ratio)),
      height = Math.max(1, Math.round(sourceHeight * ratio)),
      r = videoRect(video);
    scanCanvas.width = width;
    scanCanvas.height = height;
    scanContext.drawImage(video, 0, 0, width, height);
    const started = performance.now(),
      detection = await vision.detect(scanCanvas, {
        threshold: Number($("threshold").value),
        adaptive: $("adaptive-threshold").checked,
        ...physical.options(r, width, height),
        map: (p) => ({
          x: r.x + (p.x * r.width) / width,
          y: r.y + (p.y * r.height) / height,
        }),
        scaleX: r.width / width,
        scaleY: r.height / height,
      });
    if (
      state.frameEpoch !== frameEpoch ||
      physical.epoch !== physicalEpoch ||
      (state.mode === "camera" &&
        (!camera.stream || camera.generation !== generation))
    )
      return;
    const elapsed = performance.now() - started;
    if (detection.domain === "electrical") {
      physical.accept(detection);
      $("board-label").textContent =
        `${state.mode === "photo" ? "FOTO" : "KAMERA"} · STROMKREIS PRÜFEN`;
      $("vision-status").textContent =
        `${detection.candidates} Bauteile · ${Math.round(elapsed)} ms · ${detection.ink === "blue" ? "blaue Tinte, Raster unterdrückt" : "dunkle Tinte"}`;
      return;
    }
    physical.leave();
    $("vision-status").textContent =
      `${detection.candidates} Symbole · ${Math.round(elapsed)} ms Analyse · Formähnlichkeit ${Math.round(detection.confidence * 100)} %`;
    if (!detection.candidates) {
      misses++;
      trackingFrames = 0;
      if (misses >= 5 && state.graph.nodes.length) {
        state.graph = { nodes: [], edges: [] };
        refresh({ persist: false });
      }
      $("board-label").textContent = "KEINE SYMBOLE · DRUCKVORLAGE NUTZEN";
      return;
    }
    misses = 0;
    const signature = JSON.stringify([
      detection.graph.nodes.map((n) => [
        n.type,
        Math.round(n.x / 70),
        Math.round(n.y / 70),
      ]),
      detection.graph.edges.map((e) => [e.from, e.to, e.pin]),
    ]);
    trackingFrames = signature === trackingSignature ? trackingFrames + 1 : 1;
    trackingSignature = signature;
    if (force || trackingFrames >= 2) {
      state.graph = mergeDetections(detection.graph);
      refresh({ persist: false });
      $("board-label").textContent =
        state.mode === "photo"
          ? "FOTO · LOGIK PRÜFEN"
          : "AR AKTIV · ERKENNUNG PRÜFEN";
    }
  } catch (error) {
    $("vision-status").textContent = error.message;
    if (force) toast(error.message, true);
  } finally {
    scanBusy = false;
    if (rescanAfter) {
      rescanAfter = false;
      queueMicrotask(() => scanCamera(true));
    }
  }
}
async function scanDrawing() {
  if (state.mode === "camera" || state.mode === "photo")
    return scanCamera(true);
  if (physical.active) {
    toast(
      "Öffne ein Foto, starte die Kamera oder lade das Stromkreis-Beispiel.",
    );
    return;
  }
  if (!state.strokes.length) {
    toast(
      "Zeichne zuerst ein Gatter mit dem Stift oder platziere es über die Werkzeugleiste.",
    );
    return;
  }
  if (scanBusy) return;
  scanBusy = true;
  $("scan-button").disabled = true;
  try {
    const vision = await ensureVision();
    scanCanvas.width = 640;
    scanCanvas.height = Math.round((640 * WORLD.height) / WORLD.width);
    scanContext.fillStyle = "#fff";
    scanContext.fillRect(0, 0, scanCanvas.width, scanCanvas.height);
    scanContext.strokeStyle = "#000";
    scanContext.lineWidth = 2.4;
    scanContext.lineCap = "round";
    scanContext.lineJoin = "round";
    for (const stroke of state.strokes) {
      scanContext.beginPath();
      stroke.forEach((p, i) =>
        i
          ? scanContext.lineTo(
              (p.x * 640) / WORLD.width,
              (p.y * scanCanvas.height) / WORLD.height,
            )
          : scanContext.moveTo(
              (p.x * 640) / WORLD.width,
              (p.y * scanCanvas.height) / WORLD.height,
            ),
      );
      scanContext.stroke();
    }
    const detection = await vision.detect(scanCanvas, {
      threshold: Number($("threshold").value),
      adaptive: $("adaptive-threshold").checked,
      map: (p) => ({
        x: (p.x * WORLD.width) / 640,
        y: (p.y * WORLD.height) / scanCanvas.height,
      }),
      scaleX: WORLD.width / 640,
      scaleY: WORLD.height / scanCanvas.height,
    });
    if (state.mode !== "sandbox") return;
    if (!detection.candidates) {
      toast(
        "Keine geschlossenen Symbole erkannt. Zeichne größer, schließe die Konturen oder platziere ein Gatter manuell.",
        true,
      );
      return;
    }
    remember();
    state.graph = mergeDetections(detection.graph);
    state.selected = null;
    refresh();
    setTool("select");
    toast(
      `${detection.candidates} Symbole erkannt. Prüfe Typen und Verbindungen.`,
    );
  } catch (error) {
    toast(error.message, true);
  } finally {
    scanBusy = false;
    $("scan-button").disabled = false;
  }
}
function nodeAt(p) {
  return [...state.graph.nodes]
    .reverse()
    .find(
      (n) =>
        Math.abs(n.x - p.x) <
          Math.max((n.width ?? 90) / 2 + 10, 16 / renderer.scale) &&
        Math.abs(n.y - p.y) <
          Math.max((n.height ?? 76) / 2, 16 / renderer.scale),
    );
}
function edgeAt(p) {
  let closest = null,
    distance = Math.max(9, 8 / renderer.scale);
  for (const edge of state.graph.edges) {
    const from = engine.byId.get(edge.from),
      to = engine.byId.get(edge.to);
    if (!from || !to) continue;
    const start = portPosition(from, 0, true),
      end = portPosition(to, edge.pin);
    const points =
      edge.points?.length > 1
        ? edge.points
        : [
            start,
            { x: (start.x + end.x) / 2, y: start.y },
            { x: (start.x + end.x) / 2, y: end.y },
            end,
          ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1),
          ),
        ),
        d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
      if (d < distance) {
        distance = d;
        closest = edge;
      }
    }
  }
  return closest;
}
function portAt(p, output) {
  const radius = Math.max(14, 11 / renderer.scale);
  let match = null,
    closest = radius;
  for (const node of state.graph.nodes) {
    if (output && node.type === "OUTPUT") continue;
    for (let pin = 0; pin < (output ? 1 : pinCount(node.type)); pin++) {
      const port = portPosition(node, pin, output),
        d = Math.hypot(port.x - p.x, port.y - p.y);
      if (d < closest) {
        closest = d;
        match = { node, pin };
      }
    }
  }
  return match;
}
function addNode(type, p) {
  if (state.graph.nodes.length >= 160) {
    toast("Maximal 160 Knoten pro Schaltung.", true);
    return;
  }
  pauseLiveForEdit();
  remember();
  const inputs = state.graph.nodes.filter((n) => n.type === "INPUT").length;
  const node = {
    id: uid(),
    type,
    label:
      type === "INPUT"
        ? String.fromCharCode(65 + (inputs % 26))
        : type === "OUTPUT"
          ? "Y"
          : type,
    x: Math.max(85, Math.min(WORLD.width - 85, p.x)),
    y: Math.max(90, Math.min(WORLD.height - 90, p.y)),
  };
  if (type === "INPUT") node.value = 0;
  state.graph.nodes.push(node);
  state.selected = node.id;
  state.selectedEdge = null;
  refresh();
  setTool("select");
}
function connectAt(p) {
  if (!state.wireStart) {
    const source =
      portAt(p, true) ??
      (nodeAt(p)?.type !== "OUTPUT" ? { node: nodeAt(p) } : null);
    if (source?.node) {
      state.wireStart = source.node.id;
      $("tool-hint").textContent =
        "Jetzt den gewünschten Eingang links am Zielgatter antippen.";
    }
    return;
  }
  let target = portAt(p, false);
  if (!target) {
    const node = nodeAt(p);
    if (node && pinCount(node.type))
      target = {
        node,
        pin:
          Array.from({ length: pinCount(node.type) }, (_, i) => i).find(
            (pin) =>
              !state.graph.edges.some((e) => e.to === node.id && e.pin === pin),
          ) ?? 0,
      };
  }
  if (!target) return;
  if (state.graph.edges.length >= 500) {
    toast("Maximal 500 Leitungen pro Schaltung.", true);
    return;
  }
  if (
    state.graph.edges.some(
      (e) =>
        e.from === state.wireStart &&
        e.to === target.node.id &&
        e.pin === target.pin,
    )
  ) {
    toast("Diese Verbindung besteht bereits.");
    state.wireStart = null;
    return;
  }
  pauseLiveForEdit();
  remember();
  state.graph.edges.push({
    id: uid(),
    from: state.wireStart,
    to: target.node.id,
    pin: target.pin,
  });
  state.wireStart = null;
  refresh();
  $("tool-hint").textContent =
    "Verbunden. Nächsten Ausgang wählen oder mit Escape beenden.";
}
const canvas = $("ar-canvas");
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (physical.active) {
    physical.pointerDown(event);
    return;
  }
  canvas.focus({ preventScroll: true });
  const p = renderer.point(event);
  state.pointer = p;
  if (p.x < 0 || p.x > WORLD.width || p.y < 0 || p.y > WORLD.height) return;
  if (state.tool === "place") {
    addNode(state.placing, p);
    return;
  }
  if (state.tool === "wire") {
    connectAt(p);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  if (state.tool === "draw") {
    if (state.strokes.length >= 150) {
      toast(
        "Maximal 150 Striche. Lösche oder setze die Zeichnung zurück.",
        true,
      );
      return;
    }
    remember();
    pauseLiveForEdit();
    state.strokes.push([p]);
    pointerSession = { id: event.pointerId, kind: "draw" };
    renderUI(false);
    return;
  }
  const node = nodeAt(p);
  state.selected = node?.id ?? null;
  state.selectedEdge = node ? null : (edgeAt(p)?.id ?? null);
  renderUI();
  pointerSession = {
    id: event.pointerId,
    kind: "select",
    node: node?.id,
    start: p,
    offset: node ? { x: p.x - node.x, y: p.y - node.y } : null,
    moved: false,
  };
});
canvas.addEventListener("pointermove", (event) => {
  if (physical.active) return;
  const p = renderer.point(event);
  state.pointer = p;
  if (!pointerSession || pointerSession.id !== event.pointerId) return;
  if (pointerSession.kind === "draw") {
    const stroke = state.strokes.at(-1);
    if (
      stroke.length < 1200 &&
      Math.hypot(stroke.at(-1).x - p.x, stroke.at(-1).y - p.y) > 2
    )
      stroke.push({
        x: Math.max(0, Math.min(WORLD.width, p.x)),
        y: Math.max(0, Math.min(WORLD.height, p.y)),
      });
    return;
  }
  const node = engine.byId.get(pointerSession.node);
  if (!node) return;
  if (
    !pointerSession.moved &&
    Math.hypot(p.x - pointerSession.start.x, p.y - pointerSession.start.y) *
      renderer.scale >
      5
  ) {
    remember();
    pauseLiveForEdit();
    pointerSession.moved = true;
  }
  if (pointerSession.moved) {
    node.x = Math.max(85, Math.min(1115, p.x - pointerSession.offset.x));
    node.y = Math.max(90, Math.min(670, p.y - pointerSession.offset.y));
    state.graph.edges
      .filter((e) => e.from === node.id || e.to === node.id)
      .forEach((e) => delete e.points);
  }
});
function finishPointer(event, cancelled = false) {
  if (physical.active) {
    if (!cancelled) physical.pointerUp(event);
    return;
  }
  if (!pointerSession || pointerSession.id !== event.pointerId) return;
  const session = pointerSession;
  pointerSession = null;
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
  if (
    session.kind === "select" &&
    !session.moved &&
    !cancelled &&
    state.manual &&
    engine.byId.get(session.node)?.type === "INPUT"
  )
    toggleInput(session.node);
  else if (session.kind === "draw" || session.moved) refresh();
}
canvas.addEventListener("pointerup", (event) => finishPointer(event));
canvas.addEventListener("pointercancel", (event) => finishPointer(event, true));
function deleteSelected() {
  if (!state.selected && !state.selectedEdge) return;
  pauseLiveForEdit();
  remember();
  if (state.selectedEdge) {
    state.graph.edges = state.graph.edges.filter(
      (e) => e.id !== state.selectedEdge,
    );
    state.selectedEdge = null;
  } else {
    state.graph.nodes = state.graph.nodes.filter(
      (n) => n.id !== state.selected,
    );
    state.graph.edges = state.graph.edges.filter(
      (e) => e.from !== state.selected && e.to !== state.selected,
    );
    state.selected = null;
  }
  refresh();
}
function undo() {
  const item = history.pop();
  if (!item) return;
  pauseLiveForEdit();
  state.graph = item.graph;
  state.strokes = item.strokes;
  state.selected = item.selected;
  state.selectedEdge = item.selectedEdge;
  refresh();
}
function reset() {
  remember();
  setMode("sandbox");
  state.graph = demoCircuit();
  state.strokes = [];
  overrides.clear();
  state.selected = "xor";
  refresh();
  setTool("select");
  toast("Die Beispielschaltung ist bereit.");
}

for (const type of TYPES) {
  const option = document.createElement("option");
  option.value = type;
  option.textContent = type;
  $("gate-type").append(option);
}
document
  .querySelectorAll("[data-tool]")
  .forEach((button) =>
    button.addEventListener("click", () => setTool(button.dataset.tool)),
  );
document
  .querySelectorAll("[data-gate]")
  .forEach((button) =>
    button.addEventListener("click", () =>
      setTool("place", button.dataset.gate),
    ),
  );
$("gate-type").addEventListener("change", () => {
  const node = engine.byId.get(state.selected);
  if (!node) return;
  pauseLiveForEdit();
  remember();
  node.type = $("gate-type").value;
  node.label = node.type;
  if (node.type === "INPUT") node.value = 0;
  state.graph.edges = state.graph.edges
    .filter((e) => e.to !== node.id || e.pin < pinCount(node.type))
    .filter((e) => e.from !== node.id || node.type !== "OUTPUT");
  refresh();
});
$("delete-node").addEventListener("click", deleteSelected);
$("undo-button").addEventListener("click", undo);
$("reset-button").addEventListener("click", reset);
$("clear-button").addEventListener("click", () => {
  pauseLiveForEdit();
  remember();
  state.graph = { nodes: [], edges: [] };
  state.strokes = [];
  overrides.clear();
  state.selected = null;
  refresh();
  setTool("select");
});
$("camera-start").addEventListener("click", startCamera);
$("photo-open").addEventListener("click", () => $("photo-file").click());
$("open-photo-control").addEventListener("click", () =>
  $("photo-file").click(),
);
$("photo-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (file) await openPhoto(file);
  event.target.value = "";
});
$("stage-scan").addEventListener("click", scanDrawing);
$("stage-camera").addEventListener("click", () => {
  if (camera.stream) $("camera-switch").click();
  else startCamera();
});
$("stage-exit").addEventListener("click", () => fullscreen.exit());
$("mode-camera").addEventListener("click", () => {
  if (state.mode !== "camera" || !camera.stream) startCamera();
});
$("mode-sandbox").addEventListener("click", () => {
  if (state.mode === "sandbox") return;
  setMode("sandbox");
  if (!state.graph.nodes.length) state.graph = readSaved();
  refresh();
});
$("empty-camera").addEventListener("click", () => {
  if (state.mode === "sandbox") reset();
  else if (camera.stream || state.mode === "photo") scanCamera(true);
  else startCamera();
});
$("camera-switch").addEventListener("click", async () => {
  if (!camera.stream || cameraBusy) return;
  cameraBusy = true;
  $("camera-switch").disabled = true;
  try {
    physical.newSource();
    state.graph = { nodes: [], edges: [] };
    refresh({ persist: false });
    await camera.switch();
    trackingFrames = 0;
    misses = 0;
    scheduleScan();
  } catch (error) {
    toast(error.message, true);
  } finally {
    cameraBusy = false;
    $("camera-switch").disabled = !camera.stream;
  }
});
$("scan-button").addEventListener("click", scanDrawing);
$("live-detection").addEventListener("change", () => {
  trackingFrames = 0;
  if (state.mode === "camera" && camera.stream) scheduleScan();
});
$("threshold").addEventListener("input", () => {
  $("threshold-value").textContent = $("threshold").value;
  $("adaptive-threshold").checked = false;
  trackingFrames = 0;
});
$("threshold-toggle").addEventListener("click", () => {
  const hidden = $("vision-settings").classList.toggle("hidden");
  $("threshold-toggle").setAttribute("aria-expanded", String(!hidden));
});
$("settings-close").addEventListener("click", () => {
  $("vision-settings").classList.add("hidden");
  $("threshold-toggle").setAttribute("aria-expanded", "false");
});
$("manual-toggle").addEventListener("click", () => {
  state.manual = !state.manual;
  $("manual-toggle").setAttribute("aria-pressed", String(state.manual));
  toast(
    state.manual
      ? "Eingänge auf der Fläche sind antippbar."
      : "Eingänge auf der Fläche gesperrt. Die Schalter darunter bleiben bedienbar.",
  );
});
function setCoach(open) {
  coachEnabled = open;
  document.body.classList.toggle("coach-off", !open);
  $("coach-toggle").setAttribute("aria-pressed", String(open));
  $("coach-panel").classList.toggle("mobile-open", open && innerWidth <= 900);
  renderer.resize();
}
$("coach-toggle").addEventListener("click", () => {
  if (innerWidth <= 900)
    setCoach(!$("coach-panel").classList.contains("mobile-open"));
  else setCoach(!coachEnabled);
});
$("coach-close").addEventListener("click", () => setCoach(false));
$("next-question").addEventListener("click", nextQuestion);
function zoom(delta) {
  renderer.setZoom(renderer.zoom + delta);
  $("zoom-value").textContent = `${Math.round(renderer.zoom * 100)}%`;
}
$("zoom-in").addEventListener("click", () => zoom(0.15));
$("zoom-out").addEventListener("click", () => zoom(-0.15));
$("zoom-fit").addEventListener("click", () => {
  renderer.setZoom(1);
  $("zoom-value").textContent = "100%";
});
$("help-button").addEventListener("click", () => $("help-dialog").showModal());
for (const id of ["help-close", "help-done"])
  $(id).addEventListener("click", () => $("help-dialog").close());
function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
$("export-button").addEventListener("click", () => {
  download(
    new Blob([JSON.stringify(engine.export(), null, 2)], {
      type: "application/json",
    }),
    "logic-cam-circuit.json",
  );
  toast("Schaltung als JSON gespeichert.");
});
$("import-button").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 250000)
      throw new Error("Die Schaltungsdatei darf höchstens 250 KB groß sein.");
    const parsed = new LogicEngine(JSON.parse(await file.text())).export();
    remember();
    setMode("sandbox");
    state.graph = parsed;
    state.strokes = [];
    state.selected = null;
    refresh();
    toast("Schaltung geladen.");
  } catch (error) {
    toast(`Import fehlgeschlagen: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
});
$("print-button").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = "assets/print-template.svg";
  a.download = "logic-cam-druckvorlage.svg";
  document.body.append(a);
  a.click();
  a.remove();
  toast(
    "Druckvorlage heruntergeladen. Öffne die SVG im Browser und drucke sie im Querformat.",
  );
});
document.addEventListener("keydown", (event) => {
  if (physical.active) return;
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName) ||
    $("help-dialog").open
  )
    return;
  if (event.key === "Escape") {
    setTool("select");
    if (innerWidth <= 900 && $("coach-panel").classList.contains("mobile-open"))
      setCoach(false);
  } else if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === "z"
  ) {
    event.preventDefault();
    undo();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelected();
  } else if (
    !event.ctrlKey &&
    !event.metaKey &&
    ["v", "w", "d"].includes(event.key.toLowerCase())
  )
    setTool({ v: "select", w: "wire", d: "draw" }[event.key.toLowerCase()]);
});
window.addEventListener("pagehide", () => {
  camera.stop();
  renderer.stop();
  clearTimeout(scanTimer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    renderer.start();
    if (state.mode === "camera") {
      $("camera-start").querySelector("span").textContent = "Kamera starten";
      renderUI(false);
    }
  }
});
if ("serviceWorker" in navigator && isSecureContext)
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* Static simulation still works when storage is unavailable. */
  });
$("camera-switch").disabled = true;
if (innerWidth <= 900) {
  coachEnabled = false;
  $("coach-toggle").setAttribute("aria-pressed", "false");
}
renderUI();
renderer.start();
