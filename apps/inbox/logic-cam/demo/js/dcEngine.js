/** Ideal continuity model: wires/switches have zero resistance; lamps have equal,
 * positive resistance. Normalized potentials determine on/off, never real volts/amps.
 * This deliberately supports one battery, rather than guessing conflicting sources.
 */
export const DC_TYPES = Object.freeze(["BATTERY", "SWITCH", "LAMP"]);
const endpoint = (port) => `${port.node}:${port.pin}`;
const isPoint = (p) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) < 10000 &&
  Math.abs(p.y) < 10000;

export function validateDCGraph(graph) {
  if (
    !graph ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    graph.nodes.length > 80 ||
    graph.edges.length > 250
  )
    throw new Error("Ungültiger oder zu großer Stromkreis.");
  const ids = new Set();
  const nodes = graph.nodes.map((node) => {
    if (
      typeof node.id !== "string" ||
      ids.has(node.id) ||
      !DC_TYPES.includes(node.type) ||
      !isPoint(node) ||
      node.terminals?.length !== 2 ||
      !node.terminals.every(isPoint)
    )
      throw new Error("Ein Bauteil hat ungültige Anschlüsse.");
    ids.add(node.id);
    return {
      ...node,
      label: String(node.label ?? node.type).slice(0, 40),
      closed: node.type === "SWITCH" ? node.closed === true : undefined,
      terminals: node.terminals.map((p) => ({ x: p.x, y: p.y })),
    };
  });
  const edges = graph.edges.map((edge, i) => {
    if (
      ![edge.from, edge.to].every(
        (p) => p && ids.has(p.node) && (p.pin === 0 || p.pin === 1),
      )
    )
      throw new Error("Eine Leitung hat einen ungültigen Anschluss.");
    if (
      edge.points &&
      (!Array.isArray(edge.points) ||
        edge.points.length > 1200 ||
        !edge.points.every(isPoint))
    )
      throw new Error("Ungültiger Leitungsverlauf.");
    return { ...edge, id: String(edge.id ?? `wire-${i}`) };
  });
  return { kind: "electrical", version: 1, nodes, edges };
}

function solveLinear(matrix, rhs) {
  const n = rhs.length,
    a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-10)
      throw new Error("Das Netz ist nicht eindeutig bestimmbar.");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / a[col][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  const result = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let value = a[row][n];
    for (let col = row + 1; col < n; col++) value -= a[row][col] * result[col];
    result[row] = value / a[row][row];
  }
  return result;
}

export class DCEngine {
  constructor(graph = { nodes: [], edges: [] }) {
    this.setGraph(graph);
  }
  setGraph(graph) {
    this.graph = validateDCGraph(graph);
    this.byId = new Map(this.graph.nodes.map((n) => [n.id, n]));
    return this.solve();
  }
  solve() {
    const start = performance.now(),
      { nodes, edges } = this.graph,
      diagnostics = [],
      values = new Map(),
      parent = new Map();
    for (const node of nodes)
      for (let pin = 0; pin < 2; pin++)
        parent.set(`${node.id}:${pin}`, `${node.id}:${pin}`);
    const find = (id) => {
      if (parent.get(id) !== id) parent.set(id, find(parent.get(id)));
      return parent.get(id);
    };
    const union = (a, b) => parent.set(find(a), find(b));
    edges.forEach((e) => union(endpoint(e.from), endpoint(e.to)));
    nodes
      .filter((n) => n.type === "SWITCH" && n.closed)
      .forEach((n) => union(`${n.id}:0`, `${n.id}:1`));
    const batteries = nodes.filter((n) => n.type === "BATTERY"),
      lamps = nodes.filter((n) => n.type === "LAMP");
    const terminals = new Map(
      nodes.map((n) => [
        n.id,
        n.terminals.map((_, pin) => find(`${n.id}:${pin}`)),
      ]),
    );
    if (batteries.length !== 1)
      diagnostics.push({
        code: "SOURCE",
        message: batteries.length
          ? "Mehrere Batterien: Dieses Modell unterstützt eine Batterie."
          : "Keine Batterie erkannt. Bitte Erkennung prüfen oder Batterie markieren.",
      });
    const battery = batteries[0],
      source = battery && terminals.get(battery.id);
    const short = batteries.length === 1 && source[0] === source[1];
    if (short)
      diagnostics.push({
        code: "SHORT",
        message:
          "Kurzschluss: Die Batteriepole sind ohne Lampe miteinander verbunden.",
      });
    const potentials = new Map(),
      adjacent = new Map(
        [...new Set([...parent.keys()].map(find))].map((id) => [id, []]),
      );
    for (const lamp of lamps) {
      const [a, b] = terminals.get(lamp.id);
      if (a !== b) {
        adjacent.get(a).push(b);
        adjacent.get(b).push(a);
      }
    }
    if (batteries.length === 1 && !short) {
      const visited = new Set();
      for (const root of adjacent.keys()) {
        if (visited.has(root)) continue;
        const component = [root];
        visited.add(root);
        for (let i = 0; i < component.length; i++)
          for (const next of adjacent.get(component[i]))
            if (!visited.has(next)) {
              visited.add(next);
              component.push(next);
            }
        const fixed = new Map();
        if (component.includes(source[0])) fixed.set(source[0], 1);
        if (component.includes(source[1])) fixed.set(source[1], 0);
        if (fixed.size < 2) {
          const potential = fixed.size ? [...fixed.values()][0] : 0;
          component.forEach((id) => potentials.set(id, potential));
          continue;
        }
        for (const [id, value] of fixed) potentials.set(id, value);
        const unknown = component.filter((id) => !fixed.has(id)),
          index = new Map(unknown.map((id, i) => [id, i]));
        const matrix = unknown.map(() => Array(unknown.length).fill(0)),
          rhs = unknown.map(() => 0);
        unknown.forEach((id, i) => {
          matrix[i][i] = adjacent.get(id).length;
          for (const next of adjacent.get(id)) {
            if (fixed.has(next)) rhs[i] += fixed.get(next);
            else matrix[i][index.get(next)]--;
          }
        });
        const solved = solveLinear(matrix, rhs);
        unknown.forEach((id, i) => potentials.set(id, solved[i]));
      }
    }
    for (const lamp of lamps) {
      const [a, b] = terminals.get(lamp.id);
      values.set(
        lamp.id,
        batteries.length !== 1 || short
          ? null
          : Math.abs(potentials.get(a) - potentials.get(b)) > 1e-6
            ? 1
            : 0,
      );
    }
    for (const node of nodes)
      if (node.type === "SWITCH") values.set(node.id, node.closed ? 1 : 0);
    const lit = lamps.filter((n) => values.get(n.id) === 1).length;
    if (!lamps.length)
      diagnostics.push({
        code: "LAMP",
        message:
          "Keine Lampe erkannt. Kreis mit Kreuz zeichnen oder die Lampe markieren.",
      });
    const connected = new Set(
      edges.flatMap((e) => [endpoint(e.from), endpoint(e.to)]),
    );
    for (const node of nodes)
      for (let pin = 0; pin < 2; pin++)
        if (!connected.has(`${node.id}:${pin}`))
          diagnostics.push({
            code: "OPEN_PIN",
            node: node.id,
            pin,
            message: `${node.label}: Anschluss ${pin + 1} ist keiner Leitung zugeordnet. Erkennung prüfen.`,
          });
    this.result = {
      values,
      potentials,
      terminals,
      diagnostics,
      lit,
      short,
      elapsed: performance.now() - start,
    };
    return this.result;
  }
  toggle(id) {
    const node = this.byId.get(id);
    if (node?.type === "SWITCH") node.closed = !node.closed;
    return this.solve();
  }
}
