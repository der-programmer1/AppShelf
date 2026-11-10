import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  VisionDetector,
  templatePolygon,
  connectedComponents,
  buildWireGraph,
} from "../js/vision.js";

const path = fileURLToPath(new URL("../vendor/opencv.js", import.meta.url));
const module = { exports: {} };
new vm.Script(
  `(function(module,exports,require,__dirname,__filename){${fs.readFileSync(path, "utf8")}\n})`,
  { filename: path },
).runInThisContext()(
  module,
  module.exports,
  createRequire(import.meta.url),
  fileURLToPath(new URL("../vendor/", import.meta.url)),
  path,
);
let cv;
await new Promise((resolve, reject) => {
  const api = module.exports;
  const ready = (loaded) => {
    if (Object.hasOwn(loaded, "then")) delete loaded.then;
    cv = loaded;
    resolve();
  };
  if (api.Mat) ready(api);
  else if (api.then) api.then(ready);
  else {
    const timeout = setTimeout(
      () => reject(new Error("OpenCV init timed out")),
      20000,
    );
    api.onRuntimeInitialized = () => {
      clearTimeout(timeout);
      ready(api);
    };
  }
});

function fixture(type) {
  const mat = new cv.Mat(
      340,
      640,
      cv.CV_8UC4,
      new cv.Scalar(255, 255, 255, 255),
    ),
    black = new cv.Scalar(0, 0, 0, 255);
  const line = (a, b) =>
    cv.line(mat, new cv.Point(...a), new cv.Point(...b), black, 3);
  const base =
    type === "NAND" ? "AND" : type === "NOR" || type === "XOR" ? "OR" : type;
  const points = templatePolygon(base).map((p) => ({
    x: Math.round(p.x + 300),
    y: Math.round(p.y + 160),
  }));
  const polygon = cv.matFromArray(
      points.length,
      1,
      cv.CV_32SC2,
      points.flatMap((p) => [p.x, p.y]),
    ),
    vector = new cv.MatVector();
  vector.push_back(polygon);
  cv.polylines(mat, vector, true, black, 3);
  polygon.delete();
  vector.delete();
  for (const y of type === "NOT" ? [160] : [100, 220]) {
    cv.circle(mat, new cv.Point(90, y), 27, black, 3);
    cv.putText(
      mat,
      "1",
      new cv.Point(84, y + 9),
      cv.FONT_HERSHEY_SIMPLEX,
      0.75,
      black,
      2,
    );
  }
  if (type === "NOT") {
    line([117, 160], [254, 160]);
    cv.circle(mat, new cv.Point(345, 160), 6, black, 2);
    line([351, 160], [493, 160]);
  } else {
    const inputX = base === "AND" ? 254 : 270;
    line([117, 100], [190, 100]);
    line([190, 100], [190, 141]);
    line([190, 141], [inputX, 141]);
    line([117, 220], [215, 220]);
    line([215, 220], [215, 179]);
    line([215, 179], [inputX, 179]);
    if (type === "NAND" || type === "NOR")
      cv.circle(mat, new cv.Point(354, 160), 6, black, 2);
    line([type === "NAND" || type === "NOR" ? 360 : 345, 160], [493, 160]);
  }
  if (type === "XOR") {
    const curve = templatePolygon("OR").slice(41);
    let previous = { x: 243, y: 121 };
    for (const p of curve) {
      const next = { x: Math.round(p.x + 290), y: Math.round(p.y + 160) };
      cv.line(
        mat,
        new cv.Point(previous.x, previous.y),
        new cv.Point(next.x, next.y),
        black,
        3,
      );
      previous = next;
    }
  }
  cv.circle(mat, new cv.Point(520, 160), 27, black, 3);
  return mat;
}
test("OpenCV WASM is bundled and initializes locally", () => {
  assert.equal(typeof cv.findContours, "function");
  console.log(
    "OpenCV version:",
    cv
      .getBuildInformation()
      .split("\n")
      .find((l) => l.includes("General configuration"))
      ?.trim(),
  );
});
test("Binary components preserve gaps and connect real junctions", () => {
  const labels = connectedComponents(
    new Uint8Array([1, 0, 0, 1, 0, 0, 0, 0, 1]),
    3,
    3,
  );
  assert.equal(labels[0], labels[3]);
  assert.notEqual(labels[0], labels[8]);
});
test("Wire builder follows image pixels rather than nearest gate distance", () => {
  const width = 130,
    height = 80,
    binary = new Uint8Array(width * height);
  for (let x = 32; x < 88; x++) binary[40 * width + x] = 255;
  const nodes = [
    {
      id: "a",
      type: "INPUT",
      x: 20,
      y: 40,
      rect: { x: 10, y: 30, width: 20, height: 20 },
    },
    {
      id: "out",
      type: "OUTPUT",
      x: 100,
      y: 40,
      rect: { x: 90, y: 30, width: 20, height: 20 },
    },
  ];
  const graph = buildWireGraph(nodes, binary, width, height);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].from, "a");
  assert.ok(graph.edges[0].points.length > 1);
  binary.fill(0, 40 * width + 55, 40 * width + 64);
  assert.equal(buildWireGraph(nodes, binary, width, height).edges.length, 0);
});
for (const type of ["AND", "OR", "NOT", "XOR", "NAND", "NOR"])
  test(`Printed ${type} contour is recognized with real OpenCV`, () => {
    const detector = new VisionDetector(cv),
      mat = fixture(type);
    try {
      const result = detector.detect(mat, { adaptive: false, threshold: 150 });
      console.log(
        type,
        JSON.stringify(
          result.graph.nodes.map((n) => [
            n.type,
            Math.round(n.x),
            Math.round(n.y),
          ]),
        ),
        result.graph.edges.map((e) => `${e.from}>${e.to}:${e.pin}`).join(","),
      );
      assert.ok(
        result.graph.nodes.some((n) => n.type === type),
        `${type} missing: ${result.graph.nodes.map((n) => n.type).join(", ")}`,
      );
      assert.ok(result.graph.nodes.some((n) => n.type === "INPUT"));
      assert.ok(result.graph.nodes.some((n) => n.type === "OUTPUT"));
      assert.equal(result.graph.edges.length, type === "NOT" ? 2 : 3);
    } finally {
      mat.delete();
      detector.destroy();
    }
  });
for (const type of ["AND", "OR", "NOT", "XOR", "NAND", "NOR"])
  test(`Default adaptive threshold recognizes ${type}`, () => {
    const detector = new VisionDetector(cv),
      mat = fixture(type);
    try {
      const result = detector.detect(mat, { adaptive: true });
      assert.ok(result.graph.nodes.some((n) => n.type === type));
      assert.equal(result.graph.edges.length, type === "NOT" ? 2 : 3);
      assert.ok(
        result.graph.nodes
          .filter((n) => n.type === "INPUT")
          .every((n) => n.value === 1),
      );
    } finally {
      mat.delete();
      detector.destroy();
    }
  });
for (const scale of [0.65, 1.25])
  test(`AND circuit and wires at ${scale}x image scale`, () => {
    const detector = new VisionDetector(cv),
      mat = fixture("AND"),
      scaled = new cv.Mat();
    try {
      cv.resize(
        mat,
        scaled,
        new cv.Size(Math.round(mat.cols * scale), Math.round(mat.rows * scale)),
        0,
        0,
        cv.INTER_AREA,
      );
      const result = detector.detect(scaled, { adaptive: true });
      assert.equal(result.graph.nodes.length, 4);
      assert.ok(result.graph.nodes.some((n) => n.type === "AND"));
      assert.equal(result.graph.edges.length, 3);
    } finally {
      mat.delete();
      scaled.delete();
      detector.destroy();
    }
  });
test("Blank paper produces no simulated circuit", () => {
  const detector = new VisionDetector(cv),
    mat = new cv.Mat(340, 640, cv.CV_8UC4, new cv.Scalar(255, 255, 255, 255));
  try {
    const result = detector.detect(mat);
    assert.equal(result.graph.nodes.length, 0);
    assert.equal(result.graph.edges.length, 0);
  } finally {
    mat.delete();
    detector.destroy();
  }
});
