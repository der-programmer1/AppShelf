import test from "node:test";
import assert from "node:assert/strict";
import {
  LogicEngine,
  evaluateGate,
  truthTable,
  demoCircuit,
  validateGraph,
} from "../js/logicEngine.js";
import { AICoach } from "../js/aiCoach.js";

const expected = {
  AND: [0, 0, 0, 1],
  OR: [0, 1, 1, 1],
  XOR: [0, 1, 1, 0],
  NAND: [1, 1, 1, 0],
  NOR: [1, 0, 0, 0],
  NOT: [1, 0],
};
for (const [type, outputs] of Object.entries(expected))
  test(`${type}: every truth-table row`, () =>
    assert.deepEqual(
      truthTable(type).map((row) => row.output),
      outputs,
    ));
test("Unknown pins propagate only when the Boolean answer is undetermined", () => {
  assert.equal(evaluateGate("AND", [0, null]), 0);
  assert.equal(evaluateGate("AND", [1, null]), null);
  assert.equal(evaluateGate("OR", [1, null]), 1);
  assert.equal(evaluateGate("OR", [0, null]), null);
  assert.equal(evaluateGate("XOR", [1, null]), null);
  assert.equal(evaluateGate("NOT", [null]), null);
  assert.equal(evaluateGate("NAND", [0, null]), 1);
  assert.equal(evaluateGate("NOR", [1, null]), 0);
  assert.equal(evaluateGate("AND", [1]), null);
});
test("Sample graph, toggles and counterfactuals evaluate without mutating each other", () => {
  const engine = new LogicEngine(demoCircuit());
  assert.equal(engine.result.values.get("y"), 1);
  const old = engine.result;
  assert.equal(engine.solve({ a: 0 }).values.get("y"), 0);
  assert.equal(engine.result, old);
  assert.equal(engine.byId.get("a").value, 1);
  engine.toggle("b");
  assert.equal(engine.result.values.get("xor"), 0);
  assert.equal(engine.result.values.get("y"), 0);
  const exported = engine.export();
  exported.nodes[0].value = 0;
  assert.equal(engine.byId.get("a").value, 1);
});
test("Floating pins stay unknown and are reported", () => {
  const graph = demoCircuit();
  graph.edges = graph.edges.filter((e) => e.id !== "e1");
  const engine = new LogicEngine(graph);
  assert.equal(engine.result.values.get("xor"), null);
  assert.equal(engine.result.values.get("y"), null);
  assert.ok(
    engine.result.diagnostics.some(
      (d) => d.code === "FLOATING" && d.node === "xor" && d.pin === 0,
    ),
  );
});
test("Multiple drivers are reported even if they happen to agree", () => {
  const graph = demoCircuit();
  graph.edges.push({ id: "bad", from: "c", to: "xor", pin: 0 });
  const engine = new LogicEngine(graph);
  assert.equal(engine.result.pins.get("xor")[0], null);
  assert.ok(
    engine.result.diagnostics.some((d) => d.code === "MULTIPLE_DRIVERS"),
  );
});
test("Feedback is detected; downstream gates are not falsely marked cyclic", () => {
  const graph = demoCircuit();
  graph.edges = graph.edges.filter((e) => e.id !== "e1");
  graph.edges.push({ id: "loop", from: "xor", to: "xor", pin: 0 });
  const engine = new LogicEngine(graph);
  assert.deepEqual([...engine.cyclic], ["xor"]);
  assert.equal(engine.result.values.get("and"), null);
  assert.equal(engine.result.values.get("y"), null);
});
test("A downstream AND can resolve a cyclic unknown with controlling 0", () => {
  const graph = demoCircuit();
  graph.nodes.find((n) => n.id === "c").value = 0;
  graph.edges = graph.edges.filter((e) => e.id !== "e1");
  graph.edges.push({ id: "loop", from: "xor", to: "xor", pin: 0 });
  assert.equal(new LogicEngine(graph).result.values.get("y"), 0);
});
test("Invalid imports are rejected with actionable errors", () => {
  assert.throws(
    () =>
      validateGraph({
        nodes: [],
        edges: [{ from: "missing", to: "missing", pin: 0 }],
      }),
    /Anschluss/,
  );
  const graph = demoCircuit();
  graph.nodes.push({ ...graph.nodes[0] });
  assert.throws(() => validateGraph(graph), /eindeutig/);
  assert.throws(
    () =>
      validateGraph({
        nodes: [{ id: "a", type: "SCRIPT", x: 0, y: 0 }],
        edges: [],
      }),
    /Gattertyp/,
  );
  const invalid = demoCircuit();
  invalid.edges[0].pin = 2;
  assert.throws(() => validateGraph(invalid), /Anschluss/);
});
test("Coach counterfactual uses the active graph and awards a question only once", () => {
  const engine = new LogicEngine(demoCircuit()),
    coach = new AICoach();
  const question = coach.next(engine, "xor");
  const before = coach.score;
  assert.equal(question.kind, "predict");
  assert.equal(question.correct, 0);
  assert.equal(engine.result.values.get("y"), 1);
  assert.equal(coach.answer(question.correct).points, 100);
  assert.equal(coach.score, before + 100);
  assert.equal(coach.answer(question.correct), null);
});
test("Coach explains real floating-pin diagnostics", () => {
  const graph = demoCircuit();
  graph.edges.shift();
  const coach = new AICoach();
  assert.equal(coach.next(new LogicEngine(graph)).kind, "debug");
});
test("A 150-node DAG compiles once and propagates all 2,000 updates", () => {
  const nodes = [
      { id: "i", type: "INPUT", label: "A", value: 1, x: 80, y: 80 },
    ],
    edges = [];
  for (let i = 0; i < 149; i++) {
    nodes.push({
      id: `n${i}`,
      type: "NOT",
      x: 80 + i * 5,
      y: 200,
      label: "NOT",
    });
    edges.push({
      id: `e${i}`,
      from: i ? `n${i - 1}` : "i",
      to: `n${i}`,
      pin: 0,
    });
  }
  const engine = new LogicEngine({ nodes, edges });
  const start = performance.now();
  for (let i = 0; i < 2000; i++) engine.toggle("i");
  const average = (performance.now() - start) / 2000;
  assert.equal(engine.result.values.get("n148"), 0);
  console.log(
    `150-node logic graph: ${average.toFixed(3)} ms/update on this test host`,
  );
});
