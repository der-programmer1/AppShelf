import test from "node:test";
import assert from "node:assert/strict";
import { DCEngine } from "../js/dcEngine.js";

const component = (id, type, closed = false) => ({
  id,
  type,
  label: id,
  x: 100,
  y: 100,
  terminals: [
    { x: 90, y: 100 },
    { x: 110, y: 100 },
  ],
  closed,
});
const wire = (a, ap, b, bp) => ({
  id: `${a}${ap}-${b}${bp}`,
  from: { node: a, pin: ap },
  to: { node: b, pin: bp },
});
function simple(closed = false) {
  return {
    nodes: [
      component("B", "BATTERY"),
      component("S", "SWITCH", closed),
      component("L", "LAMP"),
    ],
    edges: [wire("B", 0, "S", 0), wire("S", 1, "L", 0), wire("L", 1, "B", 1)],
  };
}
test("An open switch breaks the circuit; closing it lights the lamp", () => {
  const engine = new DCEngine(simple());
  assert.equal(engine.result.values.get("L"), 0);
  assert.equal(engine.toggle("S").values.get("L"), 1);
  assert.equal(engine.toggle("S").values.get("L"), 0);
  assert.equal(engine.result.diagnostics.length, 0);
});
test("Series lamps both light", () => {
  const graph = simple(true);
  graph.nodes.push(component("L2", "LAMP"));
  graph.edges = graph.edges.filter((e) => e.from.node !== "L");
  graph.edges.push(wire("L", 1, "L2", 0), wire("L2", 1, "B", 1));
  const e = new DCEngine(graph);
  assert.equal(e.result.lit, 2);
});
test("A dangling lamp branch remains off even with another lit lamp", () => {
  const graph = simple(true);
  graph.nodes.push(component("D", "LAMP"));
  graph.edges.push(wire("D", 0, "L", 0));
  const e = new DCEngine(graph);
  assert.equal(e.result.values.get("L"), 1);
  assert.equal(e.result.values.get("D"), 0);
  assert.ok(e.result.diagnostics.some((d) => d.code === "OPEN_PIN"));
});
test("Parallel lamps and a bypassed lamp have correct normalized drops", () => {
  const graph = simple(true);
  graph.nodes.push(component("P", "LAMP"), component("X", "LAMP"));
  graph.edges.push(
    wire("P", 0, "B", 0),
    wire("P", 1, "B", 1),
    wire("X", 0, "B", 1),
    wire("X", 1, "B", 1),
  );
  const e = new DCEngine(graph);
  assert.equal(e.result.values.get("P"), 1);
  assert.equal(e.result.values.get("X"), 0);
});
test("A direct short circuit is diagnosed, rather than inventing lamp current", () => {
  const graph = simple(true);
  graph.edges.push(wire("B", 0, "B", 1));
  const e = new DCEngine(graph);
  assert.equal(e.result.short, true);
  assert.equal(e.result.values.get("L"), null);
  assert.ok(e.result.diagnostics.some((d) => d.code === "SHORT"));
});
test("Missing or multiple batteries produce unknown lamp state", () => {
  const no = { nodes: [component("L", "LAMP")], edges: [] };
  assert.equal(new DCEngine(no).result.values.get("L"), null);
  const multi = simple(true);
  multi.nodes.push(component("B2", "BATTERY"));
  assert.equal(new DCEngine(multi).result.values.get("L"), null);
});
test("Imported electrical endpoints are validated", () => {
  const graph = simple();
  graph.edges[0].to.pin = 3;
  assert.throws(() => new DCEngine(graph), /Anschluss/);
});
