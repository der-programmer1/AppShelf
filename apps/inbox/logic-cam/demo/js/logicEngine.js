/** Three-valued combinational logic. null means unknown; a floating pin is never 0. */
export const GATES = Object.freeze({
  AND: 2,
  OR: 2,
  NOT: 1,
  XOR: 2,
  NAND: 2,
  NOR: 2,
});
export const TYPES = Object.freeze(["INPUT", ...Object.keys(GATES), "OUTPUT"]);
export const WORLD = Object.freeze({ width: 1200, height: 760 });
export const bit = (value) =>
  value === 1 || value === true ? 1 : value === 0 || value === false ? 0 : null;
export const pinCount = (type) => (type === "OUTPUT" ? 1 : (GATES[type] ?? 0));

export function evaluateGate(type, inputs) {
  const values = inputs.map(bit);
  if (values.length !== pinCount(type)) return null;
  switch (type) {
    case "OUTPUT":
      return values[0];
    case "NOT":
      return values[0] === null ? null : 1 - values[0];
    case "AND":
    case "NAND": {
      const result = values.includes(0) ? 0 : values.includes(null) ? null : 1;
      return type === "NAND" && result !== null ? 1 - result : result;
    }
    case "OR":
    case "NOR": {
      const result = values.includes(1) ? 1 : values.includes(null) ? null : 0;
      return type === "NOR" && result !== null ? 1 - result : result;
    }
    case "XOR":
      return values.includes(null) ? null : values.reduce((a, b) => a ^ b, 0);
    default:
      return null;
  }
}

export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges))
    throw new Error("Ungültiges Schaltungsformat.");
  if (graph.nodes.length > 160 || graph.edges.length > 500)
    throw new Error("Maximal 160 Knoten und 500 Leitungen.");
  const ids = new Set();
  const nodes = graph.nodes.map((node) => {
    if (
      typeof node.id !== "string" ||
      !node.id ||
      node.id.length > 80 ||
      ids.has(node.id)
    )
      throw new Error("Knoten-IDs müssen eindeutig sein.");
    if (!TYPES.includes(node.type)) throw new Error("Unbekannter Gattertyp.");
    if (![node.x, node.y].every(Number.isFinite))
      throw new Error("Ungültige Knotenposition.");
    ids.add(node.id);
    const clean = {
      id: node.id,
      type: node.type,
      label: String(node.label ?? node.type).slice(0, 32),
      x: Math.max(55, Math.min(1145, node.x)),
      y: Math.max(65, Math.min(695, node.y)),
    };
    if (node.type === "INPUT") clean.value = bit(node.value);
    if (Number.isFinite(node.width))
      clean.width = Math.max(30, Math.min(250, node.width));
    if (Number.isFinite(node.height))
      clean.height = Math.max(25, Math.min(220, node.height));
    if (Number.isFinite(node.confidence))
      clean.confidence = Math.min(1, Math.max(0, node.confidence));
    return clean;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edgeIds = new Set();
  const edges = graph.edges.map((edge, i) => {
    const from = byId.get(edge.from),
      to = byId.get(edge.to);
    if (
      !from ||
      !to ||
      from.type === "OUTPUT" ||
      !Number.isInteger(edge.pin) ||
      edge.pin < 0 ||
      edge.pin >= pinCount(to.type)
    )
      throw new Error("Eine Leitung hat einen ungültigen Anschluss.");
    const id = String(edge.id ?? `wire-${i}`);
    if (edgeIds.has(id)) throw new Error("Leitungs-IDs müssen eindeutig sein.");
    edgeIds.add(id);
    const clean = { id, from: from.id, to: to.id, pin: edge.pin };
    if (
      Array.isArray(edge.points) &&
      edge.points.length <= 300 &&
      edge.points.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          p.x >= 0 &&
          p.x <= WORLD.width &&
          p.y >= 0 &&
          p.y <= WORLD.height,
      )
    )
      clean.points = edge.points.map((p) => ({ x: p.x, y: p.y }));
    return clean;
  });
  return { version: 1, nodes, edges };
}

/** Tarjan SCC distinguishes actual feedback from innocent downstream nodes. */
function cycleMembers(nodes, outgoing) {
  let index = 0;
  const indices = new Map(),
    low = new Map(),
    stack = [],
    onStack = new Set(),
    cyclic = new Set();
  function visit(id) {
    indices.set(id, index);
    low.set(id, index++);
    stack.push(id);
    onStack.add(id);
    for (const edge of outgoing.get(id)) {
      if (!indices.has(edge.to)) {
        visit(edge.to);
        low.set(id, Math.min(low.get(id), low.get(edge.to)));
      } else if (onStack.has(edge.to))
        low.set(id, Math.min(low.get(id), indices.get(edge.to)));
    }
    if (low.get(id) === indices.get(id)) {
      const component = [];
      let next;
      do {
        next = stack.pop();
        onStack.delete(next);
        component.push(next);
      } while (next !== id);
      if (
        component.length > 1 ||
        outgoing.get(id).some((edge) => edge.to === id)
      )
        component.forEach((n) => cyclic.add(n));
    }
  }
  nodes.forEach((node) => {
    if (!indices.has(node.id)) visit(node.id);
  });
  return cyclic;
}

export class LogicEngine {
  constructor(graph = { nodes: [], edges: [] }) {
    this.setGraph(graph);
  }
  setGraph(graph) {
    this.graph = validateGraph(graph);
    this.byId = new Map(this.graph.nodes.map((node) => [node.id, node]));
    this.incoming = new Map(this.graph.nodes.map((node) => [node.id, []]));
    this.outgoing = new Map(this.graph.nodes.map((node) => [node.id, []]));
    for (const edge of this.graph.edges) {
      this.incoming.get(edge.to).push(edge);
      this.outgoing.get(edge.from).push(edge);
    }
    this.cyclic = cycleMembers(this.graph.nodes, this.outgoing);
    // Compile the DAG once. Cyclic outputs are unknown and do not hold up its other components.
    const degree = new Map(
      this.graph.nodes
        .filter((n) => !this.cyclic.has(n.id))
        .map((n) => [
          n.id,
          this.incoming.get(n.id).filter((e) => !this.cyclic.has(e.from))
            .length,
        ]),
    );
    const queue = [...degree].filter(([, d]) => d === 0).map(([id]) => id);
    for (let i = 0; i < queue.length; i++)
      for (const edge of this.outgoing.get(queue[i])) {
        if (!degree.has(edge.to)) continue;
        degree.set(edge.to, degree.get(edge.to) - 1);
        if (degree.get(edge.to) === 0) queue.push(edge.to);
      }
    this.order = queue;
    return this.solve();
  }
  solve(overrides = {}) {
    const start = performance.now(),
      values = new Map(),
      pins = new Map(),
      diagnostics = [];
    this.cyclic.forEach((id) => {
      values.set(id, null);
      diagnostics.push({
        code: "CYCLE",
        node: id,
        message: `${this.byId.get(id).label}: Rückkopplung erkannt. Kombinatorische Schaltungen benötigen einen gerichteten, schleifenfreien Graphen.`,
      });
    });
    for (const id of this.order) {
      const node = this.byId.get(id);
      if (node.type === "INPUT") {
        values.set(
          id,
          bit(Object.hasOwn(overrides, id) ? overrides[id] : node.value),
        );
        continue;
      }
      const inputValues = [];
      for (let pin = 0; pin < pinCount(node.type); pin++) {
        const drivers = this.incoming
          .get(id)
          .filter((edge) => edge.pin === pin);
        if (!drivers.length) {
          inputValues.push(null);
          diagnostics.push({
            code: "FLOATING",
            node: id,
            pin,
            message: `${node.label}: Pin ${pin + 1} ist offen (Floating Pin).`,
          });
        } else if (drivers.length > 1) {
          inputValues.push(null);
          diagnostics.push({
            code: "MULTIPLE_DRIVERS",
            node: id,
            pin,
            message: `${node.label}: Pin ${pin + 1} hat mehrere Treiber – widersprüchliche Verdrahtung.`,
          });
        } else inputValues.push(values.get(drivers[0].from) ?? null);
      }
      pins.set(id, inputValues);
      values.set(id, evaluateGate(node.type, inputValues));
    }
    for (const node of this.graph.nodes)
      if (node.type !== "OUTPUT" && this.outgoing.get(node.id).length === 0)
        diagnostics.push({
          code: "UNCONNECTED",
          node: node.id,
          message: `${node.label}: Ausgang ist nicht verbunden.`,
        });
    const result = {
      values,
      pins,
      diagnostics,
      elapsed: performance.now() - start,
    };
    if (Object.keys(overrides).length === 0) this.result = result;
    return result;
  }
  toggle(id) {
    const node = this.byId.get(id);
    if (node?.type !== "INPUT") return this.result;
    node.value = node.value === 1 ? 0 : 1;
    return this.solve();
  }
  export() {
    return structuredClone(this.graph);
  }
}

export function portPosition(node, pin = 0, output = false) {
  const nominal = node.type === "INPUT" || node.type === "OUTPUT" ? 72 : 112;
  const width = node.width ?? nominal,
    height = node.height ?? (nominal === 72 ? 60 : 84);
  return {
    x:
      node.x +
      (output
        ? width / 2 + (12 * width) / nominal
        : -width / 2 - (12 * width) / nominal),
    y:
      node.y +
      (!output && pinCount(node.type) === 2
        ? ((pin === 0 ? -19 : 19) * height) / 84
        : 0),
  };
}

export function truthTable(type) {
  const count = pinCount(type);
  if (!Object.hasOwn(GATES, type)) return [];
  return Array.from({ length: 2 ** count }, (_, i) => {
    const inputs = Array.from(
      { length: count },
      (_, j) => (i >> (count - j - 1)) & 1,
    );
    return { inputs, output: evaluateGate(type, inputs) };
  });
}

export function demoCircuit() {
  return {
    version: 1,
    nodes: [
      { id: "a", type: "INPUT", label: "A", value: 1, x: 165, y: 240 },
      { id: "b", type: "INPUT", label: "B", value: 0, x: 165, y: 400 },
      { id: "c", type: "INPUT", label: "C", value: 1, x: 570, y: 565 },
      { id: "xor", type: "XOR", label: "XOR", x: 480, y: 320 },
      { id: "and", type: "AND", label: "AND", x: 830, y: 340 },
      { id: "y", type: "OUTPUT", label: "Y", x: 1050, y: 340 },
    ],
    edges: [
      { id: "e1", from: "a", to: "xor", pin: 0 },
      { id: "e2", from: "b", to: "xor", pin: 1 },
      { id: "e3", from: "xor", to: "and", pin: 0 },
      { id: "e4", from: "c", to: "and", pin: 1 },
      { id: "e5", from: "and", to: "y", pin: 0 },
    ],
  };
}
