/* SehPlus PWA, based on the web sources shipped with SehPlus 1.6.2. */
import {
  analyzePixels,
  automaticGains,
  calibrationGains,
  compareColors,
} from "./color.js";
import { download, registerOffline } from "./storage.js";
function readLocal(key, fallback = null) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    setStatus(
      "Lokales Speichern ist nicht verfügbar. Bitte Browser-Speicher prüfen und wichtige Messungen als Farbkarte sichern.",
    );
    return false;
  }
}
function readNotes() {
  try {
    const notes = JSON.parse(readLocal("sehplus_color_notes", "[]"));
    return Array.isArray(notes)
      ? notes
          .filter(
            (n) =>
              typeof n.label === "string" &&
              n.result &&
              ["r", "g", "b"].every(
                (k) =>
                  Number.isInteger(n.result[k]) &&
                  n.result[k] >= 0 &&
                  n.result[k] <= 255,
              ) &&
              typeof n.result.name === "string" &&
              typeof n.result.confidence === "string",
          )
          .slice(0, 30)
      : [];
  } catch {
    return [];
  }
}
const $ = (id) => document.getElementById(id);
const viewCanvas = $("viewCanvas");
const viewContext = viewCanvas.getContext("2d", { willReadFrequently: true });
const rawCanvas = document.createElement("canvas");
const rawContext = rawCanvas.getContext("2d", { willReadFrequently: true });
rawCanvas.width = rawCanvas.height = viewCanvas.width = viewCanvas.height = 0;
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;
video.setAttribute("aria-hidden", "true");

const state = {
  stream: null,
  mode: "empty",
  frozen: false,
  image: null,
  videoUrl: "",
  filter: "red_green_plus",
  strength: 0.7,
  recognition: "off",
  normal: false,
  zoom: 1,
  pipette: false,
  area: "medium",
  point: null,
  lastResult: null,
  torchOn: false,
  torchTrack: null,
  deferredInstall: null,
  autoEnhance: readLocal("sehplus_auto_enhance") !== "false",
  haptics: readLocal("sehplus_haptics") !== "false",
  notes: readNotes(),
  calibration: null,
  compare: false,
  firstColor: null,
  media: null,
  mediaGeneration: 0,
  panning: null,
  panX: 0,
  panY: 0,
};

const PROFILES = {
  red_green: { name: "Rot-Grün" },
  red_green_plus: { name: "Rot-Grün+" },
  tritan: {
    name: "Blau-Gelb",
    matrix: [
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.475, 0.525, 0, 0, 0, 0, 0, 1, 0,
    ],
  },
  contrast: {
    name: "Kontrast",
    matrix: [
      1.24, -0.12, -0.12, 0, 0, -0.08, 1.16, -0.08, 0, 0, -0.08, -0.08, 1.16, 0,
      0, 0, 0, 0, 1, 0,
    ],
  },
  neutral: {
    name: "Neutral",
    matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
  },
};

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const value = i / 255;
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
});
const toSrgb = (value) => {
  const clipped = clamp(value, 0, 1);
  const encoded =
    clipped <= 0.0031308
      ? clipped * 12.92
      : 1.055 * Math.pow(clipped, 1 / 2.4) - 0.055;
  return Math.round(clamp(encoded, 0, 1) * 255);
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function haptic() {
  if (state.haptics && navigator.vibrate) navigator.vibrate(8);
}
function setStatus(message) {
  $("statusText").textContent = message;
}
function setButtonState() {
  const available = rawCanvas.width > 0 && rawCanvas.height > 0;
  $("stageEmpty").hidden = available;
  $("stillButton").disabled = !available;
  $("pipetteButton").disabled = !available;
  $("normalButton").disabled = !available;
  $("zoomOut").disabled = !available;
  $("zoomReset").disabled = !available;
  $("zoomIn").disabled = !available;
  $("areaButton").disabled = !available;
  $("saveNoteButton").disabled = !state.lastResult;
  $("shareButton").disabled = !state.lastResult;
  $("normalButton").textContent = state.normal
    ? "FILTERANSICHT"
    : "NORMALANSICHT";
  $("stillButton").textContent =
    state.mode === "live" && !state.frozen ? "STANDBILD" : "WEITER LIVE";
  $("pipetteButton").textContent = state.pipette ? "PIPETTE AUS" : "PIPETTE";
  $("zoomValue").textContent =
    `Zoom ${state.zoom.toFixed(1).replace(".0", "")}×`;
  viewCanvas.style.transform = `scale(${state.zoom})`;
  viewCanvas.style.translate = `${state.panX}px ${state.panY}px`;
  for (const id of ["calibrate", "compare", "saveImage", "clearMedia"])
    $(id).disabled = !available;
}

function showPage(pageId) {
  ["cameraPage", "aboutPage", "settingsPage", "labPage", "notesPage"].forEach(
    (id) => ($(id).hidden = id !== pageId),
  );
  document
    .querySelectorAll(".nav-button")
    .forEach((button) =>
      button.classList.toggle("selected", button.dataset.page === pageId),
    );
  if (pageId === "cameraPage") render();
}

function setCanvasSize(width, height) {
  if (!width || !height) return;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  if (
    rawCanvas.width === width &&
    rawCanvas.height === height &&
    viewCanvas.width === width &&
    viewCanvas.height === height
  )
    return;
  rawCanvas.width = width;
  rawCanvas.height = height;
  viewCanvas.width = width;
  viewCanvas.height = height;
  viewCanvas.style.width = "100%";
  viewCanvas.style.height = "100%";
  $("stageEmpty").hidden = true;
}

function drawVideoFrame() {
  if (!video.videoWidth || !video.videoHeight) return false;
  setCanvasSize(video.videoWidth, video.videoHeight);
  rawContext.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height);
  return true;
}

function drawImageSource() {
  if (!state.image) return false;
  const width =
    state.image.naturalWidth || state.image.videoWidth || state.image.width;
  const height =
    state.image.naturalHeight || state.image.videoHeight || state.image.height;
  if (!width || !height) return false;
  setCanvasSize(width, height);
  rawContext.drawImage(state.image, 0, 0, rawCanvas.width, rawCanvas.height);
  return true;
}

function render() {
  if (!rawCanvas.width || !rawCanvas.height) {
    setButtonState();
    return;
  }
  const source = rawContext.getImageData(
    0,
    0,
    rawCanvas.width,
    rawCanvas.height,
  );
  const output = source.data;
  if (!state.normal) {
    if (state.autoEnhance) applyAutoEnhance(output);
    if (state.recognition !== "off")
      applyRecognition(
        output,
        rawCanvas.width,
        rawCanvas.height,
        state.recognition === "whiteboard",
      );
    else if (state.filter === "red_green" || state.filter === "red_green_plus")
      applyRedGreen(output, state.filter === "red_green_plus");
    else applyMatrix(output, PROFILES[state.filter].matrix);
  }
  viewContext.putImageData(source, 0, 0);
  setButtonState();
}

function applyAutoEnhance(data) {
  let total = 0;
  let count = 0;
  for (
    let i = 0;
    i < data.length;
    i += 4 * Math.max(1, Math.floor(data.length / 24000))
  ) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    count++;
  }
  if (!count) return;
  const offset = clamp((128 - total / count) * 0.12, -12, 12);
  if (Math.abs(offset) < 1) return;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte(data[i] + offset);
    data[i + 1] = clampByte(data[i + 1] + offset);
    data[i + 2] = clampByte(data[i + 2] + offset);
  }
}

function applyMatrix(data, matrix) {
  if (!matrix) return;
  const intensity = state.strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    const values = [r, g, b, 255];
    const out = [0, 0, 0];
    for (let row = 0; row < 3; row++) {
      const offset = row * 5;
      const identity = values[row];
      const transformed =
        matrix[offset] * r +
        matrix[offset + 1] * g +
        matrix[offset + 2] * b +
        matrix[offset + 4] * 255;
      out[row] = identity + (transformed - identity) * intensity;
    }
    data[i] = clampByte(out[0]);
    data[i + 1] = clampByte(out[1]);
    data[i + 2] = clampByte(out[2]);
  }
}

function applyRedGreen(data, strong) {
  const opponentStrength = (strong ? 0.86 : 0.46) * state.strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = LINEAR[data[i]],
      g = LINEAR[data[i + 1]],
      b = LINEAR[data[i + 2]];
    const maximum = Math.max(r, g, b);
    const minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const opponent = clamp((r - g) * 2.25, -1, 1);
    const shift = opponent * Math.min(1, chroma * 3.2) * opponentStrength;
    let red = r + shift * 0.08;
    let green = g + shift * 0.23;
    let blue = b - shift * 0.2;
    if (strong && chroma > 0.035) {
      const localContrast = clamp((luminance - 0.5) * 0.1, -0.06, 0.06);
      red += localContrast;
      green += localContrast;
      blue += localContrast;
    }
    data[i] = toSrgb(red);
    data[i + 1] = toSrgb(green);
    data[i + 2] = toSrgb(blue);
  }
}

function luminanceAt(data, width, x, y) {
  const safeX = clamp(Math.round(x), 0, width - 1);
  const safeY = clamp(
    Math.round(y),
    0,
    Math.floor(data.length / 4 / width) - 1,
  );
  const offset = (safeY * width + safeX) * 4;
  return (
    0.2126 * LINEAR[data[offset]] +
    0.7152 * LINEAR[data[offset + 1]] +
    0.0722 * LINEAR[data[offset + 2]]
  );
}

function applyRecognition(data, width, height, whiteboard) {
  const source = new Uint8ClampedArray(data);
  const strength = Math.max(0.05, state.strength);
  const opponentStrength = (whiteboard ? 0.82 : 1.12) * strength;
  const contrast =
    (whiteboard ? 1.1 : 1.06) + strength * (whiteboard ? 0.12 : 0.14);
  for (let i = 0; i < data.length; i += 4) {
    const r = LINEAR[source[i]],
      g = LINEAR[source[i + 1]],
      b = LINEAR[source[i + 2]];
    const maximum = Math.max(r, g, b),
      minimum = Math.min(r, g, b);
    const chroma = maximum - minimum;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const pixel = i / 4,
      x = pixel % width,
      y = Math.floor(pixel / width);
    const local =
      (luminanceAt(source, width, x - 4, y) +
        luminanceAt(source, width, x + 4, y) +
        luminanceAt(source, width, x, y - 4) +
        luminanceAt(source, width, x, y + 4)) /
      4;
    const detail = clamp(
      (luminance - local) * (whiteboard ? 2.0 : 2.8),
      -0.22,
      0.22,
    );
    const opponent = clamp((r - g) * 2.5, -1, 1);
    const shift =
      opponent *
      Math.min(1, chroma * (whiteboard ? 2.8 : 4.0)) *
      opponentStrength;
    let red = r + shift * (whiteboard ? 0.05 : 0.1) + detail;
    let green = g + shift * (whiteboard ? 0.18 : 0.3) + detail;
    let blue = b - shift * (whiteboard ? 0.22 : 0.3) + detail;
    if (whiteboard && luminance > 0.72 && chroma < 0.18) {
      const whiteLift = Math.min(0.12, (luminance - 0.72) * 0.45 * strength);
      red += whiteLift;
      green += whiteLift;
      blue += whiteLift;
    }
    data[i] = toSrgb((red - 0.5) * contrast + 0.5);
    data[i + 1] = toSrgb((green - 0.5) * contrast + 0.5);
    data[i + 2] = toSrgb((blue - 0.5) * contrast + 0.5);
  }
}

function clampByte(value) {
  return Math.round(clamp(value, 0, 255));
}

function animationLoop() {
  if (state.mode === "live" && !state.frozen && state.stream) {
    if (drawVideoFrame()) render();
    requestAnimationFrame(animationLoop);
  }
}

async function startCamera() {
  if (!window.isSecureContext && location.hostname !== "localhost") {
    setStatus("Kamera benötigt eine HTTPS-Seite.");
    return;
  }
  stopStream();
  releaseMedia();
  const generation = ++state.mediaGeneration;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw Error("unsupported");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    if (generation !== state.mediaGeneration) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    state.stream = stream;
    video.srcObject = state.stream;
    await video.play();
    state.mode = "live";
    state.frozen = false;
    state.image = null;
    state.normal = false;
    state.zoom = 1;
    state.point = null;
    resetTools();
    state.torchTrack = state.stream.getVideoTracks()[0] || null;
    const capabilities = state.torchTrack?.getCapabilities?.() || {};
    $("torchButton").disabled = !capabilities.torch;
    $("torchButton").textContent = capabilities.torch
      ? "TASCHENLAMPE AUS"
      : "TASCHENLAMPE NICHT VERFÜGBAR";
    $("cameraButton").textContent = "KAMERA STOPPEN";
    setStatus("Live-Kamera · Filter wird lokal angewendet");
    haptic();
    animationLoop();
  } catch (error) {
    stopStream();
    setStatus(
      error?.name === "NotAllowedError"
        ? "Kamerazugriff wurde nicht erlaubt."
        : "Kamera konnte nicht gestartet werden.",
    );
  }
}

function stopStream() {
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  video.srcObject = null;
  state.torchTrack = null;
  state.torchOn = false;
  $("torchButton").disabled = true;
}

function stopCameraFromUserAction() {
  stopStream();
  state.mode = rawCanvas.width ? "still" : "empty";
  state.frozen = false;
  $("cameraButton").textContent = "KAMERA STARTEN";
  setStatus(
    rawCanvas.width
      ? "Kamera gestoppt · letztes Bild bleibt verfügbar"
      : "Kamera gestoppt",
  );
  setButtonState();
}

function freezeFrame() {
  if (state.mode !== "live" || !state.stream) return;
  drawVideoFrame();
  const track = state.stream.getVideoTracks()[0];
  // Full-resolution still capture is optional; retain the preview if unavailable.
  if (window.ImageCapture && track) {
    const generation = state.mediaGeneration;
    new ImageCapture(track)
      .takePhoto()
      .then(async (blob) => {
        const image = await createImageBitmap(blob);
        if (generation === state.mediaGeneration) {
          state.image = image;
          drawImageSource();
          render();
          setStatus(
            "Standbild · Geräteaufnahme, für Verarbeitung auf maximal 1600 Pixel begrenzt",
          );
        } else image.close();
      })
      .catch(() => {});
  }
  state.frozen = true;
  state.mode = "still";
  stopStream();
  setStatus("Standbild aktiv · Vorschauauflösung verwendet");
  render();
  haptic();
}

function continueLive() {
  if (state.mode === "still" && rawCanvas.width) {
    startCamera();
    return;
  }
  startCamera();
}

function readImage(file) {
  if (!file) return;
  if (!/^(image|video)\//.test(file.type)) {
    setStatus("Bitte eine unterstützte Bild- oder Videodatei wählen.");
    return;
  }
  if (!file.size || file.size > 200 * 1024 * 1024) {
    setStatus("Datei leer oder größer als 200 MB.");
    return;
  }
  stopStream();
  releaseMedia();
  const generation = ++state.mediaGeneration;
  state.normal = false;
  state.zoom = 1;
  state.point = null;
  resetTools();
  if (file.type.startsWith("video/")) {
    const fileVideo = document.createElement("video");
    fileVideo.muted = true;
    fileVideo.playsInline = true;
    fileVideo.src = URL.createObjectURL(file);
    state.videoUrl = fileVideo.src;
    state.media = fileVideo;
    $("videoControls").hidden = false;
    fileVideo.addEventListener("loadedmetadata", () => {
      $("videoSeek").max = Number.isFinite(fileVideo.duration)
        ? fileVideo.duration
        : 0;
      $("videoSeek").value = 0;
    });
    fileVideo.addEventListener("seeked", () => {
      if (generation !== state.mediaGeneration) return;
      drawImageSource();
      render();
      $("videoTime").textContent =
        `${fileVideo.currentTime.toFixed(1)} / ${fileVideo.duration.toFixed(1)} s`;
      $("videoSeek").value = fileVideo.currentTime;
    });
    fileVideo.addEventListener("error", () =>
      setStatus(
        "Das Videoformat wird hier nicht unterstützt. Bitte MP4/H.264 versuchen.",
      ),
    );
    fileVideo.addEventListener(
      "loadeddata",
      () => {
        if (generation !== state.mediaGeneration) return;
        state.image = fileVideo;
        state.mode = "still";
        drawImageSource();
        setStatus("Video lokal geöffnet · Zeitpunkt mit dem Regler auswählen");
        render();
      },
      { once: true },
    );
    return;
  }
  const image = new Image();
  image.onload = () => {
    if (generation !== state.mediaGeneration) return;
    state.image = image;
    state.mode = "still";
    drawImageSource();
    setStatus("Standbild aktiv · Bild lokal geöffnet");
    render();
  };
  image.onerror = () => setStatus("Bild konnte nicht geöffnet werden.");
  image.src = URL.createObjectURL(file);
  state.videoUrl = image.src;
}

function toggleNormal() {
  state.normal = !state.normal;
  setStatus(
    state.normal
      ? "Normalansicht · Filter ausgeblendet"
      : "Filteransicht · Profil aktiv",
  );
  render();
}

function setPipette(enabled) {
  state.pipette = enabled;
  $("pipetteMarker").hidden = !enabled || !state.point;
  setStatus(
    enabled
      ? "Pipette aktiv · über die Bildfläche ziehen"
      : "Pipette ausgeschaltet",
  );
  haptic();
  setButtonState();
}

function imagePointFromEvent(event) {
  if (!rawCanvas.width || !rawCanvas.height) return null;
  const rect = $("stage").getBoundingClientRect();
  const stageX = event.clientX - rect.left;
  const stageY = event.clientY - rect.top;
  const baseScale = Math.min(
    rect.width / rawCanvas.width,
    rect.height / rawCanvas.height,
  );
  const drawWidth = rawCanvas.width * baseScale;
  const drawHeight = rawCanvas.height * baseScale;
  const baseX =
    (stageX - rect.width / 2 - state.panX) / state.zoom + rect.width / 2;
  const baseY =
    (stageY - rect.height / 2 - state.panY) / state.zoom + rect.height / 2;
  const left = (rect.width - drawWidth) / 2;
  const top = (rect.height - drawHeight) / 2;
  const x = clamp(
    Math.round((baseX - left) / baseScale),
    0,
    rawCanvas.width - 1,
  );
  const y = clamp(
    Math.round((baseY - top) / baseScale),
    0,
    rawCanvas.height - 1,
  );
  return { x, y, stageX, stageY };
}

function sampleAtEvent(event) {
  const point = imagePointFromEvent(event);
  if (!point) return;
  state.point = point;
  const marker = $("pipetteMarker");
  marker.style.left = `${point.stageX}px`;
  marker.style.top = `${point.stageY}px`;
  marker.hidden = false;
  state.lastResult = analyzeColor(point.x, point.y);
  renderResult(state.lastResult);
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return [h, max ? delta / max : 0, max];
}

function hueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}
function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function analyzeColor(centerX, centerY) {
  const pixels = rawContext.getImageData(
    0,
    0,
    rawCanvas.width,
    rawCanvas.height,
  ).data;
  const radius = state.area === "small" ? 18 : state.area === "large" ? 48 : 30;
  return analyzePixels(
    pixels,
    rawCanvas.width,
    rawCanvas.height,
    centerX,
    centerY,
    radius,
    state.calibration ||
      automaticGains(pixels, rawCanvas.width, rawCanvas.height),
  );
}

function renderResult(result) {
  if (!result) return;
  const hex = [result.r, result.g, result.b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  $("pipetteResult").textContent =
    `Grundfarbe: ${result.name}\nMessqualität: ${result.quality}\nSicherheit: ${result.confidence} · ${result.reason}\nHEX #${hex} · RGB ${result.r}, ${result.g}, ${result.b}\nMessung: ${result.count} Pixel`;
  $("colorSwatch").style.background =
    `rgb(${result.r}, ${result.g}, ${result.b})`;
  if (state.compare) {
    if (!state.firstColor) {
      state.firstColor = result;
      $("comparison").textContent =
        "Punkt A: " + result.name + " gespeichert. Tippe nun Punkt B an.";
    } else
      $("comparison").textContent =
        `Punkt A: ${state.firstColor.name}\nPunkt B: ${result.name}\n${compareColors(state.firstColor, result)}`;
  }
  setButtonState();
}

function cycleArea() {
  state.area =
    state.area === "small"
      ? "medium"
      : state.area === "medium"
        ? "large"
        : "small";
  $("areaButton").textContent =
    `MESSFLÄCHE · ${state.area === "small" ? "KLEIN" : state.area === "large" ? "GROSS" : "MITTEL"}`;
  if (state.point) {
    state.lastResult = analyzeColor(state.point.x, state.point.y);
    renderResult(state.lastResult);
  }
}

async function toggleTorch() {
  if (!state.torchTrack) return;
  state.torchOn = !state.torchOn;
  try {
    await state.torchTrack.applyConstraints({
      advanced: [{ torch: state.torchOn }],
    });
    $("torchButton").textContent = state.torchOn
      ? "TASCHENLAMPE AN"
      : "TASCHENLAMPE AUS";
  } catch (_) {
    state.torchOn = false;
    setStatus("Taschenlampe wird von diesem Browser nicht unterstützt.");
  }
}

function saveNote() {
  if (!state.lastResult) return;
  const label = window.prompt("Name für diese Messung", "Meine Farbmessung");
  if (label === null) return;
  state.notes.unshift({
    label: label.trim() || "Meine Farbmessung",
    result: state.lastResult,
    date: new Date().toISOString(),
  });
  state.notes = state.notes.slice(0, 30);
  const saved = writeLocal("sehplus_color_notes", JSON.stringify(state.notes));
  renderNotes();
  if (saved) setStatus("Farbmessung lokal gespeichert · kein Foto");
}

async function shareResult() {
  if (!state.lastResult) return;
  const result = state.lastResult;
  const hex = [result.r, result.g, result.b]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const text = `SehPlus Farbkarte\nGrundfarbe: ${result.name}\nMessqualität: ${result.quality}\nSicherheit: ${result.confidence}\nHEX #${hex} · RGB ${result.r}, ${result.g}, ${result.b}`;
  await shareText("SehPlus Farbkarte", text);
}

function updateFilter() {
  state.filter = $("filterSelect").value;
  state.normal = false;
  setStatus(`Filter · ${PROFILES[state.filter].name}`);
  render();
}
function updateStrength() {
  state.strength = Number($("strengthRange").value) / 100;
  $("strengthValue").textContent = `${Math.round(state.strength * 100)} %`;
  render();
}
function updateRecognition() {
  state.recognition = $("recognitionSelect").value;
  state.normal = false;
  setStatus(
    state.recognition === "off"
      ? "Normaler Filter aktiv"
      : `${$("recognitionSelect").selectedOptions[0].textContent} · Erkennung aktiv`,
  );
  render();
}
function updateZoom(delta) {
  state.zoom = clamp(state.zoom + delta, 1, 6);
  if (state.zoom === 1) {
    state.panX = state.panY = 0;
  }
  setButtonState();
}

function showHelp() {
  window.alert(
    "1. Kamera starten und möglichst gleichmäßig beleuchten.\n\n2. Für Testbilder oder Whiteboards Standbild und Farben verschieben verwenden.\n\n3. Mit der Pipette eine matte, möglichst gleichmäßige Fläche messen. Die Farbnamen sind Näherungen; HEX/RGB und Messqualität helfen beim Einordnen.",
  );
}

function resetTools() {
  state.calibration = null;
  state.compare = false;
  state.firstColor = null;
  state.lastResult = null;
  state.point = null;
  state.panX = state.panY = 0;
  $("comparison").textContent = "";
  $("calibrationStatus").textContent = "Keine Lichtkalibrierung aktiv";
  $("calibrate").textContent = "LICHT KALIBRIEREN";
  $("compare").textContent = "ZWEI FARBEN VERGLEICHEN";
  $("pipetteMarker").hidden = true;
}
function releaseMedia() {
  if (state.media) {
    state.media.pause();
    state.media.removeAttribute("src");
    state.media.load();
  }
  state.media = null;
  if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
  state.videoUrl = "";
  state.image?.close?.();
  state.image = null;
  $("videoControls").hidden = true;
}
function closeMedia() {
  state.mediaGeneration++;
  stopStream();
  releaseMedia();
  resetTools();
  rawCanvas.width = rawCanvas.height = viewCanvas.width = viewCanvas.height = 0;
  state.mode = "empty";
  $("cameraButton").textContent = "KAMERA STARTEN";
  $("pipetteResult").textContent =
    "Pipette auswählen, dann über das Bild ziehen.";
  setStatus("Medium geschlossen. Keine Bild- oder Videodaten gespeichert.");
  render();
}
function calibrate() {
  if (state.calibration) {
    state.calibration = null;
    $("calibrationStatus").textContent = "Keine Lichtkalibrierung aktiv";
    $("calibrate").textContent = "LICHT KALIBRIEREN";
    return;
  }
  if (!state.point) {
    setStatus(
      "Miss zuerst eine matte weiße oder graue Fläche mit der Pipette.",
    );
    return;
  }
  if (
    !confirm(
      "Der aktuelle Pipettenpunkt wird als neutrale Referenz verwendet. Liegt er auf einer matten weißen oder grauen Fläche?",
    )
  )
    return;
  try {
    const pixels = rawContext.getImageData(
      0,
      0,
      rawCanvas.width,
      rawCanvas.height,
    ).data;
    const reference = analyzePixels(
      pixels,
      rawCanvas.width,
      rawCanvas.height,
      state.point.x,
      state.point.y,
      30,
    );
    state.calibration = calibrationGains(reference);
    $("calibrationStatus").textContent =
      "Lichtkalibrierung aktiv · bis Mediumwechsel oder Neustart";
    $("calibrate").textContent = "KALIBRIERUNG ZURÜCKSETZEN";
    state.lastResult = analyzeColor(state.point.x, state.point.y);
    renderResult(state.lastResult);
    setStatus("Lichtkalibrierung aktiv.");
  } catch (e) {
    setStatus(e.message);
  }
}
function renderNotes() {
  const root = $("notesList");
  root.replaceChildren();
  if (!state.notes.length) {
    root.textContent = "Noch keine Messung gespeichert.";
    return;
  }
  state.notes.forEach((note, index) => {
    const card = document.createElement("article");
    card.className = "memo";
    const heading = document.createElement("h2");
    heading.textContent = note.label;
    const copy = document.createElement("p");
    const r = note.result;
    copy.textContent = `${r.name}\nRGB ${r.r}, ${r.g}, ${r.b} · HEX #${[
      r.r,
      r.g,
      r.b,
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}\nSicherheit: ${r.confidence}\n${note.date ? new Date(note.date).toLocaleString("de-DE") : ""}`;
    const swatch = document.createElement("div");
    swatch.className = "color-swatch";
    swatch.style.background = `rgb(${r.r},${r.g},${r.b})`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-button";
    remove.textContent = "Memo löschen";
    remove.onclick = () => {
      state.notes.splice(index, 1);
      writeLocal("sehplus_color_notes", JSON.stringify(state.notes));
      renderNotes();
    };
    card.append(heading, swatch, copy, remove);
    root.append(card);
  });
}
function clearNotes() {
  if (!confirm("Alle lokalen Farbmemos löschen?")) return;
  state.notes = [];
  writeLocal("sehplus_color_notes", "[]");
  renderNotes();
  setStatus("Lokale Farbmemos gelöscht.");
}
function saveImage() {
  if (!rawCanvas.width) {
    setStatus("Öffne zuerst ein Bild oder ein Kamera-Standbild.");
    return;
  }
  viewCanvas.toBlob((blob) => {
    if (blob) {
      download(blob, "SehPlus-Farbbild.png");
      setStatus("Das sichtbare Bild wurde zum Speichern bereitgestellt.");
    } else setStatus("Bild konnte nicht gespeichert werden.");
  }, "image/png");
}
async function shareText(title, text) {
  try {
    if (navigator.share) await navigator.share({ title, text });
    else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    else download(new Blob([text], { type: "text/plain" }), title + ".txt");
  } catch (e) {
    if (e.name !== "AbortError")
      download(new Blob([text], { type: "text/plain" }), title + ".txt");
  }
}
function deviceStatus() {
  return `Browser: ${navigator.onLine ? "online" : "offline"} · Kamera: ${navigator.mediaDevices?.getUserMedia ? "unterstützt, Freigabe erst auf Anfrage" : "nicht verfügbar"} · Aufnahme: ${window.ImageCapture ? "Foto-API verfügbar" : "Vorschau-Standbild"} · Arbeitsauflösung: maximal 1600 Pixel · Taschenlampe: ${state.torchTrack?.getCapabilities?.().torch ? "verfügbar" : "nicht verfügbar"} · Kamera im Hintergrund aus.`;
}
function loadLab(type) {
  closeMedia();
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const c = canvas.getContext("2d");
  const texture = (base, dark, light, spacing) => {
    c.fillStyle = base;
    c.fillRect(0, 0, 900, 1200);
    c.lineWidth = 5;
    for (let x = -1200; x < 2100; x += spacing) {
      for (const [offset, color] of [
        [0, dark],
        [7, light],
      ]) {
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(x + offset, 0);
        c.lineTo(x + 1200 + offset, 1200);
        c.stroke();
      }
    }
  };
  if (type === "beige")
    texture("rgb(197,160,121)", "rgb(173,135,98)", "rgb(222,190,153)", 18);
  else if (type === "blue")
    texture("rgb(124,139,153)", "rgb(93,110,126)", "rgb(178,190,199)", 22);
  else if (type === "warm") {
    c.fillStyle = "rgb(211,174,131)";
    c.fillRect(0, 0, 900, 1200);
    c.fillStyle = "rgb(239,223,196)";
    c.fillRect(95, 150, 710, 900);
    c.strokeStyle = "rgb(184,145,102)";
    for (let y = 200; y < 1010; y += 70) {
      c.beginPath();
      c.moveTo(130, y);
      c.lineTo(770, y + 18);
      c.stroke();
    }
  } else if (type === "edge") {
    c.fillStyle = "rgb(215,188,151)";
    c.fillRect(0, 0, 900, 1200);
    c.fillStyle = "rgb(112,132,145)";
    c.beginPath();
    c.moveTo(420, 0);
    c.lineTo(900, 0);
    c.lineTo(900, 1200);
    c.lineTo(520, 1200);
    c.fill();
    c.strokeStyle = "rgb(245,235,214)";
    c.lineWidth = 18;
    c.beginPath();
    c.moveTo(410, 0);
    c.lineTo(510, 1200);
    c.stroke();
  } else if (type === "dots") {
    c.fillStyle = "rgb(247,244,230)";
    c.fillRect(0, 0, 900, 1200);
    const colors = [
      "rgb(219,174,40)",
      "rgb(112,126,42)",
      "rgb(62,92,86)",
      "rgb(145,84,52)",
      "rgb(94,94,100)",
    ];
    for (let variant = 0; variant < 4; variant++) {
      const cx = variant % 2 ? 660 : 300,
        cy = variant < 2 ? 380 : 850;
      c.fillStyle = "rgb(237,235,222)";
      c.beginPath();
      c.arc(cx, cy, 235, 0, Math.PI * 2);
      c.fill();
      for (let row = -7; row <= 7; row++)
        for (let column = -7; column <= 7; column++) {
          const d = Math.hypot(row, column);
          if (d > 7.1) continue;
          const pattern = Math.abs(row * 17 + column * 31 + variant * 13);
          c.fillStyle =
            colors[(pattern + (d < 3.8 ? variant + 1 : 0)) % colors.length];
          c.beginPath();
          c.arc(
            cx + column * 27 + (row % 2 === 0 ? 7 : 0),
            cy + row * 27,
            8 + (pattern % 6),
            0,
            Math.PI * 2,
          );
          c.fill();
        }
      c.fillStyle = variant % 2 ? "rgb(63,83,101)" : "rgb(215,175,39)";
      c.font = "bold 112px system-ui";
      c.fillText(variant % 2 ? "8" : "16", cx - 62, cy + 42);
    }
  } else {
    c.fillStyle = "rgb(247,247,239)";
    c.fillRect(0, 0, 900, 1200);
    c.strokeStyle = "rgb(203,208,202)";
    c.lineWidth = 4;
    for (let x = 50; x < 900; x += 90) {
      c.beginPath();
      c.moveTo(x, 80);
      c.lineTo(x, 1130);
      c.stroke();
    }
    for (let y = 120; y < 1200; y += 90) {
      c.beginPath();
      c.moveTo(40, y);
      c.lineTo(860, y);
      c.stroke();
    }
    c.fillStyle = "rgb(40,54,68)";
    c.font = "64px system-ui";
    c.fillText("Farbtest 16", 90, 260);
    c.lineWidth = 18;
    for (const [color, x1, y1, x2, y2] of [
      ["rgb(151,60,71)", 110, 430, 780, 530],
      ["rgb(55,106,146)", 110, 650, 780, 600],
    ]) {
      c.strokeStyle = color;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }
    for (const [x, color] of [
      [260, "rgb(60,133,92)"],
      [590, "rgb(215,150,55)"],
    ]) {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x, 880, 74, 0, Math.PI * 2);
      c.fill();
    }
  }
  state.image = canvas;
  state.mode = "still";
  state.normal = false;
  state.recognition = "off";
  $("recognitionSelect").value = "off";
  state.zoom = 1;
  drawImageSource();
  render();
  showPage("cameraPage");
  setStatus("Offline-Testlabor · " + labNames[type]);
  window.scrollTo(0, 0);
}
const labNames = {
  beige: "Beiger Stoff",
  blue: "Blau-grauer Stoff",
  warm: "Warmes Innenlicht",
  edge: "Farbkante",
  dots: "Testpunkte",
  board: "Whiteboard",
};
function extraEvents() {
  for (const [type, name] of Object.entries(labNames)) {
    const b = document.createElement("button");
    b.className = "secondary-button";
    b.textContent = name;
    b.type = "button";
    b.onclick = () => loadLab(type);
    $("labSamples").append(b);
  }
  $("calibrate").onclick = calibrate;
  $("compare").onclick = () => {
    state.compare = !state.compare;
    state.firstColor = null;
    $("comparison").textContent = state.compare
      ? "Pipette: Wähle Punkt A und danach Punkt B."
      : "";
    $("compare").textContent = state.compare
      ? "VERGLEICH BEENDEN"
      : "ZWEI FARBEN VERGLEICHEN";
    if (state.compare) setPipette(true);
  };
  $("saveImage").onclick = saveImage;
  $("saveStill").onclick = saveImage;
  $("clearMedia").onclick = closeMedia;
  $("deleteNotes").onclick = clearNotes;
  $("videoSeek").oninput = () => {
    if (state.media) {
      state.media.pause();
      state.media.currentTime = Number($("videoSeek").value);
      $("videoPlay").textContent = "VIDEO ABSPIELEN";
    }
  };
  $("videoPlay").onclick = async () => {
    const media = state.media;
    if (!media) return;
    if (!media.paused) {
      media.pause();
      $("videoPlay").textContent = "VIDEO ABSPIELEN";
      return;
    }
    try {
      await media.play();
      $("videoPlay").textContent = "VIDEO PAUSIEREN";
      const step = () => {
        if (media !== state.media || media.paused) return;
        drawImageSource();
        render();
        $("videoSeek").value = media.currentTime;
        $("videoTime").textContent =
          `${media.currentTime.toFixed(1)} / ${media.duration.toFixed(1)} s`;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } catch {
      setStatus(
        "Video konnte nicht abgespielt werden. Bitte Zeitpunkt mit dem Regler wählen.",
      );
    }
  };
  $("stage").addEventListener("pointerdown", (e) => {
    if (!state.pipette && state.zoom > 1) {
      state.panning = {
        x: e.clientX,
        y: e.clientY,
        panX: state.panX,
        panY: state.panY,
      };
      $("stage").setPointerCapture?.(e.pointerId);
    }
  });
  $("stage").addEventListener("pointermove", (e) => {
    if (state.panning && !state.pipette) {
      state.panX = clamp(
        state.panning.panX + e.clientX - state.panning.x,
        (-$("stage").clientWidth * (state.zoom - 1)) / 2,
        ($("stage").clientWidth * (state.zoom - 1)) / 2,
      );
      state.panY = clamp(
        state.panning.panY + e.clientY - state.panning.y,
        (-$("stage").clientHeight * (state.zoom - 1)) / 2,
        ($("stage").clientHeight * (state.zoom - 1)) / 2,
      );
      setButtonState();
    }
  });
  $("stage").addEventListener("pointerup", () => (state.panning = null));
  $("stage").addEventListener("pointercancel", () => (state.panning = null));
  viewCanvas.addEventListener("keydown", (e) => {
    if (
      !rawCanvas.width ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    )
      return;
    e.preventDefault();
    if (!state.pipette) setPipette(true);
    const point = state.point || {
      x: Math.floor(rawCanvas.width / 2),
      y: Math.floor(rawCanvas.height / 2),
    };
    point.x = clamp(
      point.x + (e.key === "ArrowRight" ? 5 : e.key === "ArrowLeft" ? -5 : 0),
      0,
      rawCanvas.width - 1,
    );
    point.y = clamp(
      point.y + (e.key === "ArrowDown" ? 5 : e.key === "ArrowUp" ? -5 : 0),
      0,
      rawCanvas.height - 1,
    );
    state.point = point;
    state.lastResult = analyzeColor(point.x, point.y);
    renderResult(state.lastResult);
  });
  $("refreshDevice").onclick = () => {
    $("deviceStatus").textContent = deviceStatus();
  };
  $("deviceStatus").textContent = deviceStatus();
  $("testReport").onclick = () =>
    shareText(
      "SehPlus Testbericht",
      `SehPlus 1.6.2 Web-App\nZeitpunkt: ${new Date().toISOString()}\n${deviceStatus()}\nFarbprofil: ${state.filter}\nLichtkalibrierung: ${state.calibration ? "aktiv" : "aus"}\nKeine Bilder oder persönlichen Inhalte im Bericht.`,
    );
  renderNotes();
}

function wireEvents() {
  $("cameraButton").addEventListener("click", () =>
    state.mode === "live" && state.stream
      ? stopCameraFromUserAction()
      : startCamera(),
  );
  $("imageInput").addEventListener("change", (event) =>
    readImage(event.target.files[0]),
  );
  $("stillButton").addEventListener("click", () =>
    state.mode === "live" && state.stream ? freezeFrame() : continueLive(),
  );
  $("pipetteButton").addEventListener("click", () =>
    setPipette(!state.pipette),
  );
  $("normalButton").addEventListener("click", toggleNormal);
  $("filterSelect").addEventListener("change", updateFilter);
  $("strengthRange").addEventListener("input", updateStrength);
  $("recognitionSelect").addEventListener("change", updateRecognition);
  $("zoomOut").addEventListener("click", () => updateZoom(-0.25));
  $("zoomReset").addEventListener("click", () => {
    state.zoom = 1;
    state.panX = state.panY = 0;
    setButtonState();
  });
  $("zoomIn").addEventListener("click", () => updateZoom(0.5));
  $("areaButton").addEventListener("click", cycleArea);
  $("torchButton").addEventListener("click", toggleTorch);
  $("saveNoteButton").addEventListener("click", saveNote);
  $("shareButton").addEventListener("click", shareResult);
  $("helpButton").addEventListener("click", showHelp);
  $("autoEnhance").checked = state.autoEnhance;
  $("haptics").checked = state.haptics;
  $("autoEnhance").addEventListener("change", (event) => {
    state.autoEnhance = event.target.checked;
    writeLocal("sehplus_auto_enhance", state.autoEnhance);
    render();
  });
  $("haptics").addEventListener("change", (event) => {
    state.haptics = event.target.checked;
    writeLocal("sehplus_haptics", state.haptics);
  });
  $("clearData").addEventListener("click", clearNotes);
  $("stage").addEventListener("pointerdown", (event) => {
    if (state.pipette) {
      $("stage").setPointerCapture?.(event.pointerId);
      sampleAtEvent(event);
    }
  });
  $("stage").addEventListener("pointermove", (event) => {
    if (state.pipette && (event.buttons || event.pointerType === "touch"))
      sampleAtEvent(event);
  });
  document
    .querySelectorAll(".nav-button")
    .forEach((button) =>
      button.addEventListener("click", () => showPage(button.dataset.page)),
    );
  const welcome = $("welcomeDialog");
  const closeWelcome = () => {
    writeLocal("sehplus_web_welcome", "true");
    welcome.close();
  };
  $("welcomeLater").addEventListener("click", closeWelcome);
  $("welcomeStart").addEventListener("click", () => {
    closeWelcome();
    startCamera();
  });
  if (
    !readLocal("sehplus_web_welcome") &&
    typeof welcome.showModal === "function"
  )
    welcome.showModal();
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstall = event;
  $("installButton").hidden = false;
});
$("installButton").addEventListener("click", async () => {
  if (!state.deferredInstall) return;
  state.deferredInstall.prompt();
  await state.deferredInstall.userChoice;
  state.deferredInstall = null;
  $("installButton").hidden = true;
});
window.addEventListener("pagehide", () => {
  state.mediaGeneration++;
  stopStream();
  state.media?.pause();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    state.mediaGeneration++;
    stopStream();
    state.mode = rawCanvas.width ? "still" : "empty";
    state.media?.pause();
    $("cameraButton").textContent = "KAMERA STARTEN";
    setButtonState();
  }
});
registerOffline($("offlineStatus"));
wireEvents();
extraEvents();
setButtonState();
fetch("sehplus_color_assist_v2.json")
  .then((response) =>
    response.ok ? response.json() : Promise.reject(new Error("profile")),
  )
  .then((profile) => {
    profile.profiles?.forEach((entry) => {
      if (!PROFILES[entry.id]) PROFILES[entry.id] = {};
      PROFILES[entry.id].name = entry.name || PROFILES[entry.id].name;
      if (entry.matrix) PROFILES[entry.id].matrix = entry.matrix;
    });
    if (profile.defaults?.strength != null) {
      state.strength = Number(profile.defaults.strength);
      $("strengthRange").value = Math.round(state.strength * 100);
      $("strengthValue").textContent = `${Math.round(state.strength * 100)} %`;
    }
    render();
  })
  .catch(() => {});
