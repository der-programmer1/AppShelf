import { WORLD, portPosition, pinCount } from "./logicEngine.js";

export const COLORS = {
  high: "#78f9ac",
  low: "#ff6f80",
  unknown: "#a6a8b7",
  accent: "#ad97ff",
};
export const signalColor = (value) =>
  value === 1 ? COLORS.high : value === 0 ? COLORS.low : COLORS.unknown;

export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = "environment";
    this.generation = 0;
  }
  async start(facing = this.facing) {
    this.stop();
    const generation = this.generation;
    this.facing = facing;
    if (!globalThis.isSecureContext)
      throw new Error(
        "Die Kamera benötigt HTTPS oder localhost. Öffne die GitHub-Pages-Adresse über HTTPS.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "Dieser Browser unterstützt keinen Kamerazugriff. Nutze die Sandbox oder einen aktuellen Safari/Chrome.",
      );
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      const track = stream.getVideoTracks()[0],
        capabilities = track.getCapabilities?.() ?? {};
      if (capabilities.focusMode?.includes("continuous"))
        await track
          .applyConstraints({ advanced: [{ focusMode: "continuous" }] })
          .catch(() => {});
      return true;
    } catch (error) {
      stream?.getTracks().forEach((t) => t.stop());
      if (generation !== this.generation) return false;
      this.stop();
      const messages = {
        NotAllowedError:
          "Kein Kamerazugriff. Erlaube die Kamera in den Browser-Einstellungen oder nutze die Sandbox.",
        NotFoundError:
          "Keine Kamera gefunden. Die Touch-Sandbox funktioniert auch ohne Kamera.",
        NotReadableError:
          "Die Kamera wird bereits verwendet. Schließe andere Kamera-Apps und versuche es erneut.",
        OverconstrainedError:
          "Diese Kamera unterstützt die gewünschten Einstellungen nicht.",
      };
      throw new Error(
        messages[error.name] ??
          error.message ??
          "Kamera konnte nicht gestartet werden.",
      );
    }
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
  async switch() {
    return this.start(this.facing === "environment" ? "user" : "environment");
  }
}

export function videoRect(video) {
  const width = video.videoWidth || WORLD.width,
    height = video.videoHeight || WORLD.height;
  const scale = Math.min(WORLD.width / width, WORLD.height / height);
  return {
    x: (WORLD.width - width * scale) / 2,
    y: (WORLD.height - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}

function gatePath(ctx, type) {
  ctx.beginPath();
  if (type === "NOT") {
    ctx.moveTo(-46, -37);
    ctx.lineTo(38, 0);
    ctx.lineTo(-46, 37);
    ctx.closePath();
  } else if (type === "AND" || type === "NAND") {
    ctx.moveTo(-46, -39);
    ctx.lineTo(0, -39);
    ctx.bezierCurveTo(60, -39, 60, 39, 0, 39);
    ctx.lineTo(-46, 39);
    ctx.closePath();
  } else {
    ctx.moveTo(-47, -39);
    ctx.bezierCurveTo(-11, -39, 29, -37, 48, 0);
    ctx.bezierCurveTo(29, 37, -11, 39, -47, 39);
    ctx.bezierCurveTo(-22, 15, -22, -15, -47, -39);
    ctx.closePath();
  }
}

export class ARRenderer {
  constructor(base, overlay, video, getState, onMetrics = () => {}) {
    this.base = base;
    this.overlay = overlay;
    this.video = video;
    this.getState = getState;
    this.onMetrics = onMetrics;
    this.ctx = base.getContext("2d", { alpha: false });
    this.ar = overlay.getContext("2d");
    this.zoom = 1;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.frames = 0;
    this.lastMetric = performance.now();
    this.running = false;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(base.parentElement);
    this.resize();
  }
  resize() {
    const rect = this.base.getBoundingClientRect(),
      dpr = Math.min(devicePixelRatio || 1, 2);
    this.pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    this.pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    for (const canvas of [this.base, this.overlay]) {
      canvas.width = this.pixelWidth;
      canvas.height = this.pixelHeight;
    }
    this.scale =
      Math.min(this.pixelWidth / WORLD.width, this.pixelHeight / WORLD.height) *
      this.zoom;
    this.offset = {
      x: (this.pixelWidth - WORLD.width * this.scale) / 2,
      y: (this.pixelHeight - WORLD.height * this.scale) / 2,
    };
  }
  setZoom(value) {
    this.zoom = Math.max(0.65, Math.min(1.6, value));
    this.resize();
  }
  point(event) {
    const rect = this.overlay.getBoundingClientRect();
    return {
      x:
        (((event.clientX - rect.left) * this.pixelWidth) / rect.width -
          this.offset.x) /
        this.scale,
      y:
        (((event.clientY - rect.top) * this.pixelHeight) / rect.height -
          this.offset.y) /
        this.scale,
    };
  }
  transform(ctx) {
    ctx.setTransform(
      this.scale,
      0,
      0,
      this.scale,
      this.offset.x,
      this.offset.y,
    );
  }
  start() {
    if (this.running) return;
    this.running = true;
    const tick = (time) => {
      if (!this.running) return;
      if (!document.hidden) this.render(time);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  render(time) {
    const state = this.getState(),
      { ctx, ar } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#11151a";
    ctx.fillRect(0, 0, this.pixelWidth, this.pixelHeight);
    ar.setTransform(1, 0, 0, 1, 0, 0);
    ar.clearRect(0, 0, this.pixelWidth, this.pixelHeight);
    this.transform(ctx);
    this.transform(ar);
    if (state.mode === "camera" && this.video.readyState >= 2) {
      const r = videoRect(this.video);
      ctx.drawImage(this.video, r.x, r.y, r.width, r.height);
      ctx.fillStyle = "rgba(5,12,15,.12)";
      ctx.fillRect(r.x, r.y, r.width, r.height);
    } else {
      ctx.fillStyle = "#2c333b";
      for (let x = 0; x <= WORLD.width; x += 24)
        for (let y = 0; y <= WORLD.height; y += 24) {
          ctx.beginPath();
          ctx.arc(x, y, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      ctx.strokeStyle = "rgba(155,170,185,.04)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD.width; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD.height);
        ctx.stroke();
      }
      for (let y = 0; y <= WORLD.height; y += 120) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD.width, y);
        ctx.stroke();
      }
    }
    // User ink remains on the bottom layer; the AR layer never destroys the source image.
    ctx.strokeStyle = state.mode === "camera" ? "#17191d" : "#e0e3e9";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of state.strokes ?? []) {
      ctx.beginPath();
      stroke.forEach((p, i) =>
        i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
      );
      ctx.stroke();
    }
    const byId = new Map(state.graph.nodes.map((n) => [n.id, n]));
    for (const edge of state.graph.edges) {
      const from = byId.get(edge.from),
        to = byId.get(edge.to);
      if (!from || !to) continue;
      const start = portPosition(from, 0, true),
        end = portPosition(to, edge.pin),
        color = signalColor(state.result.values.get(edge.from));
      const points =
        edge.points?.length > 1
          ? edge.points
          : [
              start,
              { x: (start.x + end.x) / 2, y: start.y },
              { x: (start.x + end.x) / 2, y: end.y },
              end,
            ];
      const path = () => {
        ar.beginPath();
        points.forEach((p, i) =>
          i ? ar.lineTo(p.x, p.y) : ar.moveTo(p.x, p.y),
        );
      };
      if (state.selectedEdge === edge.id) {
        path();
        ar.strokeStyle = COLORS.accent;
        ar.lineWidth = 9;
        ar.globalAlpha = 0.4;
        ar.stroke();
        ar.globalAlpha = 1;
      }
      ar.lineJoin = "round";
      ar.lineCap = "round";
      ar.setLineDash(state.result.values.get(edge.from) == null ? [7, 6] : []);
      path();
      ar.strokeStyle = color;
      ar.lineWidth = 3;
      ar.shadowColor = color;
      ar.shadowBlur = state.mode === "camera" ? 12 : 8;
      ar.stroke();
      ar.shadowBlur = 0;
      if (state.result.values.get(edge.from) === 1 && !this.reduced) {
        path();
        ar.setLineDash([3, 37]);
        ar.lineDashOffset = -time * 0.035;
        ar.strokeStyle = "#eafff2";
        ar.lineWidth = 3;
        ar.stroke();
        ar.lineDashOffset = 0;
      }
      ar.setLineDash([]);
      // Direction marker makes static screenshots readable as well.
      ar.fillStyle = color;
      ar.beginPath();
      ar.moveTo(end.x - 12, end.y - 4);
      ar.lineTo(end.x - 6, end.y);
      ar.lineTo(end.x - 12, end.y + 4);
      ar.fill();
    }
    for (const node of state.graph.nodes) this.drawNode(ar, node, state);
    if (state.wireStart) {
      const node = byId.get(state.wireStart),
        p = node && portPosition(node, 0, true);
      if (p && state.pointer) {
        ar.beginPath();
        ar.moveTo(p.x, p.y);
        ar.lineTo(state.pointer.x, state.pointer.y);
        ar.strokeStyle = COLORS.accent;
        ar.lineWidth = 2;
        ar.setLineDash([7, 6]);
        ar.stroke();
        ar.setLineDash([]);
      }
    }
    this.frames++;
    if (time - this.lastMetric >= 1000) {
      this.onMetrics(
        Math.round((this.frames * 1000) / (time - this.lastMetric)),
      );
      this.frames = 0;
      this.lastMetric = time;
    }
  }
  drawNode(ctx, node, state) {
    const value = state.result.values.get(node.id),
      color = signalColor(value),
      selected = node.id === state.selected;
    ctx.save();
    ctx.translate(node.x, node.y);
    const nominal = node.type === "INPUT" || node.type === "OUTPUT" ? 72 : 112;
    ctx.scale(
      (node.width ?? nominal) / nominal,
      (node.height ?? (nominal === 72 ? 60 : 84)) / (nominal === 72 ? 60 : 84),
    );
    if (selected) {
      ctx.strokeStyle = "rgba(173,151,255,.8)";
      ctx.fillStyle = "rgba(173,151,255,.055)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.roundRect(-86, -76, 172, 153, 15);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (node.type === "INPUT" || node.type === "OUTPUT") {
      ctx.fillStyle = state.mode === "camera" ? "rgba(13,20,24,.9)" : "#1c252b";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(-36, -30, 72, 60, 15);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "600 28px ui-monospace, monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value ?? "?"), 0, 1);
    } else {
      gatePath(ctx, node.type);
      ctx.fillStyle = state.mode === "camera" ? "rgba(14,20,27,.8)" : "#1c252c";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (node.type === "XOR") {
        ctx.beginPath();
        ctx.moveTo(-57, -39);
        ctx.bezierCurveTo(-32, -15, -32, 15, -57, 39);
        ctx.stroke();
      }
      if (["NOT", "NAND", "NOR"].includes(node.type)) {
        ctx.beginPath();
        ctx.arc(node.type === "NOT" ? 45 : 53, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#11151a";
        ctx.fill();
        ctx.stroke();
      }
      ctx.font = "500 15px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#edf2ee";
      ctx.fillText(node.type, -6, 0);
      ctx.font = "600 13px ui-monospace, monospace";
      ctx.fillStyle = color;
      ctx.fillText(String(value ?? "?"), 76, 0);
    }
    ctx.textAlign = "center";
    ctx.font = "500 12px ui-monospace, monospace";
    ctx.fillStyle = state.mode === "camera" ? "#ffffff" : "#8b989f";
    ctx.fillText(
      node.type === "INPUT"
        ? `INPUT ${node.label}`
        : node.type === "OUTPUT"
          ? `OUTPUT ${node.label}`
          : node.label === node.type
            ? ""
            : node.label,
      0,
      -54,
    );
    if (node.type === "INPUT") {
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillStyle = "#6c7b83";
      ctx.fillText("tippen zum Umschalten", 0, 55);
    }
    ctx.restore();
    for (let pin = 0; pin < pinCount(node.type); pin++)
      this.drawPort(
        ctx,
        portPosition(node, pin),
        signalColor(state.result.pins.get(node.id)?.[pin]),
        state.tool === "wire",
      );
    if (node.type !== "OUTPUT")
      this.drawPort(
        ctx,
        portPosition(node, 0, true),
        color,
        state.tool === "wire",
      );
    if (node.confidence !== undefined && node.confidence < 0.82) {
      ctx.font = "11px ui-monospace,monospace";
      ctx.fillStyle = "#ffc878";
      ctx.textAlign = "center";
      ctx.fillText(
        `PRÜFEN · ${Math.round(node.confidence * 100)} %`,
        node.x,
        node.y + 79,
      );
    }
  }
  drawPort(ctx, p, color, large) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, large ? 7 : 4, 0, Math.PI * 2);
    ctx.fillStyle = "#11151a";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  destroy() {
    this.stop();
    this.observer.disconnect();
  }
}
