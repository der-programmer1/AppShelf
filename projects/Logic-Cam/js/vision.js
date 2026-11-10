import { pinCount } from "./logicEngine.js";

/** Small, deterministic CV pipeline for upright, standard outlined paper symbols.
 * Shape similarity is a heuristic, not a trained classifier or a probability.
 * Crossings without a visible bridge are interpreted as connected junctions.
 */
export async function loadOpenCV(onStatus = () => {}) {
  if (globalThis.cv?.Mat) return globalThis.cv;
  if (globalThis.__logicCamCV) return globalThis.__logicCamCV;
  globalThis.__logicCamCV = new Promise((resolve, reject) => {
    let settled = false;
    const complete = (api) => {
      if (!api?.Mat || settled) return;
      // Emscripten's legacy thenable resolves to itself. Remove it before native Promise resolution.
      if (Object.hasOwn(api, "then")) delete api.then;
      settled = true;
      clearTimeout(timeout);
      onStatus("OpenCV bereit");
      resolve(api);
    };
    const finish = () => {
      try {
        const api = globalThis.cv;
        if (api?.Mat) complete(api);
        else if (api?.then) api.then(complete);
        else if (api) api.onRuntimeInitialized = () => complete(api);
      } catch (error) {
        fail(error);
      }
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        error instanceof Error
          ? error
          : new Error("OpenCV konnte nicht geladen werden."),
      );
    };
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            "OpenCV lädt zu lange. Die Sandbox bleibt verfügbar; versuche die Erkennung erneut.",
          ),
        ),
      45000,
    );
    onStatus("OpenCV wird lokal geladen …");
    globalThis.Module = { onRuntimeInitialized: finish };
    const script = document.createElement("script");
    script.src = new URL("../vendor/opencv.js", import.meta.url).href;
    script.async = true;
    script.onload = () => {
      if (globalThis.cv?.then || globalThis.cv?.Mat) finish();
      else if (globalThis.cv) globalThis.cv.onRuntimeInitialized = finish;
    };
    script.onerror = () =>
      fail(new Error("Die lokale OpenCV-Datei fehlt. Prüfe vendor/opencv.js."));
    document.head.append(script);
  }).catch((error) => {
    delete globalThis.__logicCamCV;
    throw error;
  });
  return globalThis.__logicCamCV;
}

function bezier(a, b, c, d, t) {
  const s = 1 - t;
  return {
    x:
      s * s * s * a.x +
      3 * s * s * t * b.x +
      3 * s * t * t * c.x +
      t * t * t * d.x,
    y:
      s * s * s * a.y +
      3 * s * s * t * b.y +
      3 * s * t * t * c.y +
      t * t * t * d.y,
  };
}
export function templatePolygon(type) {
  const points = [],
    line = (x, y) => points.push({ x, y }),
    curve = (a, b, c, d) => {
      for (let i = 1; i <= 20; i++) points.push(bezier(a, b, c, d, i / 20));
    };
  if (type === "CIRCLE") {
    for (let i = 0; i < 80; i++)
      line(
        Math.cos((i * Math.PI) / 40) * 39,
        Math.sin((i * Math.PI) / 40) * 39,
      );
  } else if (type === "NOT") {
    line(-46, -37);
    line(38, 0);
    line(-46, 37);
  } else if (type === "AND") {
    line(-46, -39);
    line(0, -39);
    curve(
      { x: 0, y: -39 },
      { x: 60, y: -39 },
      { x: 60, y: 39 },
      { x: 0, y: 39 },
    );
    line(-46, 39);
  } else {
    line(-47, -39);
    curve(
      { x: -47, y: -39 },
      { x: -11, y: -39 },
      { x: 29, y: -37 },
      { x: 48, y: 0 },
    );
    curve(
      { x: 48, y: 0 },
      { x: 29, y: 37 },
      { x: -11, y: 39 },
      { x: -47, y: 39 },
    );
    curve(
      { x: -47, y: 39 },
      { x: -22, y: 15 },
      { x: -22, y: -15 },
      { x: -47, y: -39 },
    );
  }
  return points;
}

export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(mask.length),
    queue = new Int32Array(mask.length);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    let head = 0,
      tail = 0;
    queue[tail++] = i;
    labels[i] = ++count;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (dx === 0 && dy === 0) ||
            x + dx < 0 ||
            x + dx >= width ||
            y + dy < 0 ||
            y + dy >= height
          )
            continue;
          const next = p + dy * width + dx;
          if (mask[next] && !labels[next]) {
            labels[next] = count;
            queue[tail++] = next;
          }
        }
    }
  }
  return labels;
}

function samplePort(labels, width, height, node, pin, output) {
  const r = node.rect,
    y =
      r.y +
      r.height *
        (output || pinCount(node.type) === 1 ? 0.5 : pin === 0 ? 0.26 : 0.74);
  const x = output ? r.x + r.width : r.x - 1;
  let best = null;
  for (let distance = 1; distance <= 18; distance++)
    for (let dy = -7; dy <= 7; dy++) {
      const px = Math.round(x + (output ? distance : -distance)),
        py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const at = py * width + px,
        label = labels[at],
        score = distance + Math.abs(dy) * 2;
      if (label && (!best || score < best.score)) best = { label, at, score };
    }
  return best;
}

function wirePath(labels, width, height, start, end) {
  const parents = new Int32Array(labels.length);
  parents.fill(-1);
  const queue = new Int32Array(labels.length);
  let head = 0,
    tail = 1;
  queue[0] = start;
  parents[start] = start;
  while (head < tail && parents[end] === -1) {
    const p = queue[head++],
      x = p % width,
      y = Math.floor(p / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const n = p + dy * width + dx;
        if (labels[n] === labels[start] && parents[n] === -1) {
          parents[n] = p;
          queue[tail++] = n;
        }
      }
  }
  if (parents[end] === -1) return [];
  const reversed = [];
  let p = end,
    limit = labels.length;
  while (p !== start && limit--) {
    reversed.push({ x: p % width, y: Math.floor(p / width) });
    p = parents[p];
  }
  reversed.push({ x: start % width, y: Math.floor(start / width) });
  reversed.reverse();
  return reversed
    .filter((_, i) => i === 0 || i === reversed.length - 1 || i % 5 === 0)
    .slice(0, 300);
}

export function buildWireGraph(nodes, binary, width, height, map = (p) => p) {
  const mask = Uint8Array.from(binary, (v) => (v ? 1 : 0));
  for (const node of nodes) {
    const r = node.rect,
      left = node.type === "XOR" ? 18 : 6,
      right = ["NOT", "NAND", "NOR"].includes(node.type) ? 17 : 6;
    // Contours often describe the inside of a thick outline: erase its full ink,
    // including inversion bubbles and XOR's decorative second curve.
    for (
      let y = Math.max(0, r.y - 6);
      y < Math.min(height, r.y + r.height + 6);
      y++
    )
      for (
        let x = Math.max(0, r.x - left);
        x < Math.min(width, r.x + r.width + right);
        x++
      )
        mask[y * width + x] = 0;
  }
  const labels = connectedComponents(mask, width, height),
    edges = [];
  const outputs = nodes
    .filter((n) => n.type !== "OUTPUT")
    .map((n) => ({
      node: n,
      port: samplePort(labels, width, height, n, 0, true),
    }))
    .filter((n) => n.port);
  for (const target of nodes)
    for (let pin = 0; pin < pinCount(target.type); pin++) {
      const port = samplePort(labels, width, height, target, pin, false);
      if (!port) continue;
      for (const source of outputs)
        if (source.port.label === port.label) {
          edges.push({
            id: `${source.node.id}-${target.id}-${pin}`,
            from: source.node.id,
            to: target.id,
            pin,
            points: wirePath(
              labels,
              width,
              height,
              source.port.at,
              port.at,
            ).map(map),
          });
        }
    }
  return { version: 1, nodes: nodes.map(({ rect, ...node }) => node), edges };
}

export class VisionDetector {
  constructor(cv) {
    this.cv = cv;
    this.templates = ["AND", "OR", "NOT", "CIRCLE"].map((type) => ({
      type,
      contour: cv.matFromArray(
        templatePolygon(type).length,
        1,
        cv.CV_32SC2,
        templatePolygon(type).flatMap((p) => [
          Math.round(p.x),
          Math.round(p.y),
        ]),
      ),
    }));
  }
  /** The input may be a Canvas in browsers or a cv.Mat for deterministic tests. */
  detect(
    source,
    {
      threshold = 150,
      adaptive = true,
      map = (p) => p,
      scaleX = 1,
      scaleY = 1,
      invert = false,
    } = {},
  ) {
    const cv = this.cv,
      owned = [],
      keep = (mat) => {
        owned.push(mat);
        return mat;
      };
    try {
      const src = source instanceof cv.Mat ? source : keep(cv.imread(source));
      const gray = keep(new cv.Mat()),
        binary = keep(new cv.Mat()),
        blur = keep(new cv.Mat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      if (invert) cv.bitwise_not(gray, gray);
      cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
      if (adaptive)
        cv.adaptiveThreshold(
          blur,
          binary,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          31,
          9,
        );
      else cv.threshold(blur, binary, threshold, 255, cv.THRESH_BINARY_INV);
      const contours = keep(new cv.MatVector()),
        hierarchy = keep(new cv.Mat());
      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      const shapes = [],
        smallCircles = [];
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        try {
          const rect = cv.boundingRect(contour),
            area = cv.contourArea(contour),
            perimeter = cv.arcLength(contour, true),
            aspect = rect.width / rect.height;
          const circularity = perimeter
            ? (4 * Math.PI * area) / (perimeter * perimeter)
            : 0;
          if (
            area > 12 &&
            area < 250 &&
            rect.width >= 6 &&
            rect.width <= 20 &&
            rect.height >= 6 &&
            rect.height <= 20 &&
            circularity > 0.65 &&
            aspect > 0.65 &&
            aspect < 1.5
          )
            smallCircles.push({
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
            });
          if (
            area < 145 ||
            rect.width < 20 ||
            rect.height < 20 ||
            rect.width > binary.cols * 0.45 ||
            rect.height > 180 ||
            rect.x < 3 ||
            rect.y < 3
          )
            continue;
          if (
            aspect < 0.55 ||
            aspect > 2.2 ||
            area / (rect.width * rect.height) < 0.3
          )
            continue;
          const matches = this.templates
            .map((t) => ({
              type: t.type,
              score: cv.matchShapes(
                contour,
                t.contour,
                cv.CONTOURS_MATCH_I1,
                0,
              ),
            }))
            .sort((a, b) => a.score - b.score);
          if (matches[0].score < 0.48)
            shapes.push({
              type: matches[0].type,
              rect,
              confidence: 1 / (1 + matches[0].score * 4),
              area,
            });
        } finally {
          contour.delete();
        }
      }
      // Inner and outer boundaries describe the same symbol. Keep the outermost plausible body.
      shapes.sort((a, b) => b.area - a.area);
      const unique = [];
      for (const shape of shapes) {
        const r = shape.rect;
        if (
          unique.some(
            (s) =>
              Math.abs(s.rect.x + s.rect.width / 2 - r.x - r.width / 2) <
                Math.min(s.rect.width, r.width) * 0.45 &&
              Math.abs(s.rect.y + s.rect.height / 2 - r.y - r.height / 2) <
                Math.min(s.rect.height, r.height) * 0.45,
          )
        )
          continue;
        unique.push(shape);
        if (unique.length >= 40) break;
      }
      const gateCenters = unique
        .filter((s) => s.type !== "CIRCLE")
        .map((s) => s.rect.x + s.rect.width / 2);
      const mid = gateCenters.length
        ? gateCenters.reduce((a, b) => a + b, 0) / gateCenters.length
        : binary.cols / 2;
      unique.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
      let inputIndex = 0,
        outputIndex = 0;
      const nodes = unique.map((shape, i) => {
        const r = shape.rect,
          cx = r.x + r.width / 2,
          cy = r.y + r.height / 2;
        let type = shape.type,
          value;
        if (type === "CIRCLE") {
          type = cx < mid ? "INPUT" : "OUTPUT";
          if (type === "INPUT") {
            // A central, narrow stroke is 1; an enclosed broad glyph is 0. Blank = unknown.
            const xs = [],
              ys = [];
            for (
              let y = Math.round(r.y + r.height * 0.25);
              y < r.y + r.height * 0.75;
              y++
            )
              for (
                let x = Math.round(r.x + r.width * 0.25);
                x < r.x + r.width * 0.75;
                x++
              )
                if (binary.data[y * binary.cols + x]) {
                  xs.push(x);
                  ys.push(y);
                }
            value =
              xs.length < 4
                ? null
                : (Math.max(...xs) - Math.min(...xs)) /
                      (Math.max(...ys) - Math.min(...ys) || 1) <
                    0.42
                  ? 1
                  : 0;
          }
        } else {
          if (type === "OR") {
            let ink = 0,
              total = 0;
            for (
              let y = Math.round(r.y + r.height * 0.12);
              y < r.y + r.height * 0.88;
              y++
            )
              for (let x = Math.max(0, r.x - 10); x < r.x - 3; x++) {
                total++;
                if (binary.data[y * binary.cols + x]) ink++;
              }
            if (total && ink / total > 0.19) type = "XOR";
          }
          // Detect a small hollow inversion bubble touching the output tip.
          const bubble = smallCircles.some(
            (p) =>
              p.x > r.x + r.width - 2 &&
              p.x < r.x + r.width + 22 &&
              Math.abs(p.y - cy) < r.height * 0.18,
          );
          if (bubble && type === "AND") type = "NAND";
          else if (bubble && type === "OR") type = "NOR";
        }
        const p = map({ x: cx, y: cy });
        return {
          id: `cv-${i}`,
          type,
          label:
            type === "INPUT"
              ? String.fromCharCode(65 + inputIndex++)
              : type === "OUTPUT"
                ? `Y${++outputIndex}`
                : type,
          x: p.x,
          y: p.y,
          width: r.width * scaleX,
          height: r.height * scaleY,
          value,
          confidence: shape.confidence,
          rect: r,
        };
      });
      const graph = buildWireGraph(
        nodes,
        binary.data,
        binary.cols,
        binary.rows,
        map,
      );
      return {
        graph,
        width: binary.cols,
        height: binary.rows,
        candidates: nodes.length,
        confidence: nodes.length
          ? nodes.reduce((sum, n) => sum + n.confidence, 0) / nodes.length
          : 0,
      };
    } finally {
      for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
    }
  }
  destroy() {
    this.templates.forEach((t) => t.contour.delete());
    this.templates = [];
  }
}

/** Prefer a dedicated worker. The same pipeline remains available without Worker support. */
export class VisionService {
  static async create(onStatus = () => {}) {
    if (typeof Worker !== "undefined") {
      let worker;
      try {
        worker = new Worker(new URL("./visionWorker.js", import.meta.url), {
          name: "logic-cam-vision",
        });
        onStatus("OpenCV im lokalen Worker wird geladen …");
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Worker-Zeitlimit")),
            40000,
          );
          worker.onmessage = (event) => {
            if (event.data.type === "ready") {
              clearTimeout(timeout);
              resolve();
            } else if (event.data.type === "error") {
              clearTimeout(timeout);
              reject(new Error(event.data.message));
            }
          };
          worker.onerror = () => {
            clearTimeout(timeout);
            reject(new Error("Worker konnte nicht gestartet werden."));
          };
        });
        onStatus("OpenCV bereit · Worker aktiv");
        return new VisionService(worker, null);
      } catch {
        worker?.terminate();
        onStatus("Worker nicht verfügbar. Nutze lokale Ersatzverarbeitung.");
      }
    }
    const cv = await loadOpenCV(onStatus);
    return new VisionService(null, new VisionDetector(cv));
  }
  constructor(worker, detector) {
    this.worker = worker;
    this.detector = detector;
    this.pending = new Map();
    this.sequence = 0;
    if (worker) {
      worker.onmessage = (event) => {
        const request = this.pending.get(event.data.id);
        if (!request) return;
        clearTimeout(request.timeout);
        this.pending.delete(event.data.id);
        event.data.type === "result"
          ? request.resolve(event.data.result)
          : request.reject(new Error(event.data.message));
      };
      worker.onerror = () => {
        for (const request of this.pending.values()) {
          clearTimeout(request.timeout);
          request.reject(
            new Error("Bildanalyse unterbrochen. Lade die App neu."),
          );
        }
        this.pending.clear();
      };
    }
  }
  async detect(canvas, options = {}) {
    if (this.detector) return this.detector.detect(canvas, options);
    const image = canvas
        .getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height),
      id = ++this.sequence;
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Bildanalyse dauert zu lange. Verwende die manuelle Sandbox.",
          ),
        );
      }, 10000);
      this.pending.set(id, { resolve, reject, timeout });
      this.worker.postMessage(
        {
          type: "detect",
          id,
          width: image.width,
          height: image.height,
          buffer: image.data.buffer,
          threshold: options.threshold,
          adaptive: options.adaptive,
        },
        [image.data.buffer],
      );
    });
    const map = options.map ?? ((p) => p);
    result.graph.nodes = result.graph.nodes.map((node) => ({
      ...node,
      ...map(node),
      width: node.width * (options.scaleX ?? 1),
      height: node.height * (options.scaleY ?? 1),
    }));
    result.graph.edges.forEach((edge) => {
      edge.points = edge.points.map(map);
    });
    return result;
  }
  destroy() {
    this.worker?.terminate();
    this.detector?.destroy();
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("Erkennung beendet."));
    }
    this.pending.clear();
  }
}
