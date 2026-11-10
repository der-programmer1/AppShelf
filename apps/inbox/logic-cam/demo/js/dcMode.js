import { DCEngine } from "./dcEngine.js";

const $ = (id) => document.getElementById(id);
const id = () => crypto.randomUUID();
const names = { LAMP: "Lampe", BATTERY: "Batterie", SWITCH: "Schalter" };

export class ElectricalMode {
  constructor({
    state,
    renderer,
    onRescan,
    onRender,
    onExample,
    pauseLive,
    toast,
  }) {
    Object.assign(this, {
      state,
      renderer,
      onRescan,
      onRender,
      onExample,
      pauseLive,
      toast,
    });
    this.engine = new DCEngine();
    this.detected = false;
    this.hints = [];
    this.excluded = [];
    this.overrides = new Map();
    this.epoch = 0;
    this.selected = null;
    this.firstMark = null;
    this.marking = null;
    $("scan-kind").addEventListener("change", () => {
      this.epoch++;
      this.detected = false;
      this.firstMark = null;
      this.marking = null;
      this.sync();
      onRender();
      onRescan();
    });
    $("dc-ink").addEventListener("change", () => {
      this.epoch++;
      onRescan();
    });
    $("dc-example").addEventListener("click", () => {
      $("scan-kind").value = "circuit";
      this.detected = true;
      this.sync();
      onExample();
    });
    $("dc-mark").addEventListener("click", () => {
      pauseLive();
      this.marking = $("dc-add-kind").value;
      this.firstMark = null;
      this.sync();
      this.renderUI();
    });
    $("dc-cancel-mark").addEventListener("click", () => {
      this.marking = null;
      this.firstMark = null;
      this.sync();
      this.renderUI();
    });
    $("dc-clear").addEventListener("click", () => {
      this.newSource();
      this.renderUI();
      onRescan();
    });
    $("dc-selected-type").addEventListener("change", () => {
      const node = this.engine.byId.get(this.selected);
      if (!node) return;
      pauseLive();
      this.epoch++;
      this.hints = this.hints.filter((h) => h.id !== node.id);
      this.hints.push({
        id: node.id,
        type: $("dc-selected-type").value,
        terminals: node.terminals,
        closed: false,
      });
      onRescan();
    });
    $("dc-remove").addEventListener("click", () => {
      const node = this.engine.byId.get(this.selected);
      if (!node) return;
      pauseLive();
      this.epoch++;
      this.hints = this.hints.filter((h) => h.id !== node.id);
      this.excluded.push({
        x: node.x,
        y: node.y,
        radius: Math.max(22, Math.max(node.width, node.height) * 0.5),
      });
      this.selected = null;
      onRescan();
    });
  }
  get active() {
    return $("scan-kind").value === "circuit" || this.detected;
  }
  sync() {
    document.body.classList.toggle("dc-mode", this.active);
    $("dc-panel").classList.toggle("hidden", !this.active);
    this.state.electrical = this.active
      ? {
          graph: this.engine.graph,
          result: this.engine.result,
          selected: this.selected,
          firstMark: this.firstMark,
        }
      : null;
    this.renderer.resize();
  }
  newSource() {
    this.epoch++;
    this.engine.setGraph({ nodes: [], edges: [] });
    this.hints = [];
    this.excluded = [];
    this.overrides.clear();
    this.firstMark = null;
    this.marking = null;
    this.selected = null;
    this.detected = false;
    this.sync();
  }
  options(rect, width, height) {
    const convert = (p) => ({
      x: ((p.x - rect.x) * width) / rect.width,
      y: ((p.y - rect.y) * height) / rect.height,
    });
    return {
      model:
        this.hints.length || this.excluded.length
          ? "circuit"
          : $("scan-kind").value,
      ink: $("dc-ink").value,
      hints: this.hints.map((h) => ({
        ...h,
        terminals: h.terminals.map(convert),
      })),
      excluded: this.excluded.map((p) => ({
        ...convert(p),
        radius: (p.radius * width) / rect.width,
      })),
    };
  }
  accept(detection) {
    const used = new Set(),
      mapping = new Map(),
      old = this.engine.graph.nodes;
    for (const node of detection.graph.nodes) {
      let nearest = null,
        distance = 90;
      for (const previous of old) {
        const d = Math.hypot(previous.x - node.x, previous.y - node.y);
        if (
          !used.has(previous.id) &&
          previous.type === node.type &&
          d < distance
        ) {
          nearest = previous;
          distance = d;
        }
      }
      const original = node.id;
      node.id = node.manual ? original : (nearest?.id ?? id());
      mapping.set(original, node.id);
      used.add(node.id);
      if (node.type === "SWITCH" && this.overrides.has(node.id))
        node.closed = this.overrides.get(node.id);
    }
    detection.graph.edges = detection.graph.edges.map((edge) => ({
      ...edge,
      from: { ...edge.from, node: mapping.get(edge.from.node) },
      to: { ...edge.to, node: mapping.get(edge.to.node) },
    }));
    this.engine.setGraph(detection.graph);
    this.detected = true;
    this.sync();
    this.renderUI();
  }
  leave() {
    if (!this.detected) return;
    this.detected = false;
    this.sync();
  }
  toggle(nodeId) {
    const node = this.engine.byId.get(nodeId);
    if (node?.type !== "SWITCH") return;
    this.engine.toggle(nodeId);
    this.overrides.set(nodeId, node.closed);
    this.sync();
    this.renderUI();
  }
  pointerDown(event) {
    this.down = {
      point: this.renderer.point(event),
      x: event.clientX,
      y: event.clientY,
    };
  }
  pointerUp(event) {
    if (
      !this.down ||
      Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 9
    ) {
      this.down = null;
      return;
    }
    const p = this.renderer.point(event);
    this.down = null;
    if (this.marking) {
      if (!this.state.photo && this.state.mode !== "camera") {
        this.toast("Öffne zuerst ein Foto oder die Kamera.", true);
        return;
      }
      if (!this.firstMark) {
        this.firstMark = p;
        this.sync();
        this.renderUI();
        return;
      }
      if (Math.hypot(p.x - this.firstMark.x, p.y - this.firstMark.y) < 15) {
        this.toast("Markiere zwei verschiedene Anschlüsse.", true);
        return;
      }
      if (this.hints.length >= 30) {
        this.toast("Maximal 30 markierte Bauteile.", true);
        return;
      }
      this.hints.push({
        id: id(),
        type: this.marking,
        terminals: [this.firstMark, p],
        closed: false,
      });
      this.firstMark = null;
      this.marking = null;
      this.epoch++;
      this.sync();
      this.renderUI();
      this.onRescan();
      return;
    }
    const node = [...this.engine.graph.nodes]
      .reverse()
      .find(
        (n) =>
          Math.abs(n.x - p.x) < Math.max(20, n.width / 2 + 12) &&
          Math.abs(n.y - p.y) < Math.max(20, n.height / 2 + 12),
      );
    this.selected = node?.id ?? null;
    if (node?.type === "SWITCH") this.toggle(node.id);
    else {
      this.sync();
      this.renderUI();
    }
  }
  renderUI() {
    if (!this.active) return;
    const { graph, result } = this.engine,
      lamps = graph.nodes.filter((n) => n.type === "LAMP"),
      switches = graph.nodes.filter((n) => n.type === "SWITCH");
    $("node-count").textContent = graph.nodes.length;
    $("edge-count").textContent = graph.edges.length;
    $("solve-time").textContent = result.elapsed.toFixed(2);
    $("engine-status").textContent = "STROMKREIS";
    $("engine-dot").style.background = result.diagnostics.length
      ? "#ffc878"
      : "";
    $("engine-status").title = result.diagnostics
      .map((d) => d.message)
      .join("\n");
    $("board-empty").classList.add("hidden");
    $("selection-panel").classList.add("hidden");
    $("diagnostics").classList.add("hidden");
    $("dc-state").textContent = result.short
      ? "Kurzschluss im Modell"
      : !lamps.length
        ? "Stromkreis scannen"
        : lamps.some((n) => result.values.get(n.id) === null)
          ? "Lampenzustand unbestimmt"
          : result.lit
            ? `${result.lit} ${result.lit === 1 ? "Lampe leuchtet" : "Lampen leuchten"}`
            : "Lampe aus · kein geschlossener Stromweg";
    $("dc-state").dataset.lit = String(result.lit > 0);
    $("dc-warnings").textContent = result.diagnostics
      .slice(0, 3)
      .map((d) => d.message)
      .join(" ");
    const buttons = $("dc-switches");
    buttons.replaceChildren();
    for (const node of switches) {
      const button = document.createElement("button");
      button.className = `dc-switch ${node.closed ? "closed" : ""}`;
      button.textContent = `${node.label}: ${node.closed ? "virtuell geschlossen" : "offen"} · antippen`;
      button.setAttribute("aria-pressed", String(node.closed));
      button.addEventListener("click", () => this.toggle(node.id));
      buttons.append(button);
    }
    const selected = this.engine.byId.get(this.selected);
    $("dc-selection").classList.toggle("hidden", !selected);
    if (selected) {
      $("dc-selected-name").textContent = selected.label;
      $("dc-selected-type").value = selected.type;
    }
    $("dc-mark-status").textContent = this.marking
      ? `${names[this.marking]}: ${this.firstMark ? "jetzt den zweiten Anschluss antippen." : "ersten Anschluss direkt an der Leitung antippen."}`
      : "Erkennungsvorschlag: Bauteile und Leitungen bitte prüfen.";
    $("dc-cancel-mark").classList.toggle("hidden", !this.marking);
    $("tool-hint").textContent = this.marking
      ? $("dc-mark-status").textContent
      : "Tippe auf den Schalter: offen ↔ virtuell geschlossen.";
    this.state.electrical = {
      graph,
      result,
      selected: this.selected,
      firstMark: this.firstMark,
    };
  }
}
