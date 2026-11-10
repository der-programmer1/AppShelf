import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ElectricalDetector } from "../js/dcVision.js";
import { DCEngine } from "../js/dcEngine.js";
const path = fileURLToPath(new URL("../vendor/opencv.js", import.meta.url)),
  module = { exports: {} };
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
await new Promise((resolve) => {
  const ready = (api) => {
    delete api.then;
    cv = api;
    resolve();
  };
  if (module.exports.Mat) ready(module.exports);
  else module.exports.then(ready);
});

/** Reconstructed fixture matching the supplied drawing's geometry, ink and grid.
 * This is a synthetic regression fixture, not the user's original photograph.
 */
export function circuitFixture({
  closed = false,
  blue = true,
  grid = true,
} = {}) {
  const scale = 0.75,
    mat = new cv.Mat(723, 960, cv.CV_8UC4, new cv.Scalar(188, 181, 165, 255));
  if (grid)
    for (let x = 0; x < 960; x += 34)
      cv.line(
        mat,
        new cv.Point(x, 0),
        new cv.Point(x, 722),
        new cv.Scalar(112, 111, 102, 255),
        1,
      );
  if (grid)
    for (let y = 0; y < 723; y += 35)
      cv.line(
        mat,
        new cv.Point(0, y),
        new cv.Point(959, y),
        new cv.Scalar(112, 111, 102, 255),
        1,
      );
  const color = blue
      ? new cv.Scalar(31, 38, 96, 255)
      : new cv.Scalar(12, 12, 12, 255),
    pt = ([x, y]) => new cv.Point(Math.round(x * scale), Math.round(y * scale));
  const line = (a, b) => cv.line(mat, pt(a), pt(b), color, 3, cv.LINE_AA);
  line([248, 559], [245, 270]);
  line([245, 270], [661, 258]);
  line([661, 258], [667, 384]);
  cv.circle(mat, pt([250, 610]), Math.round(49 * scale), color, 3, cv.LINE_AA);
  line([211, 584], [290, 638]);
  line([285, 578], [216, 645]);
  line([249, 659], [255, 813]);
  line([255, 813], [677, 811]);
  line([677, 811], [672, 665]);
  line([625, 612], [712, 612]);
  line([651, 662], [697, 662]);
  line([664, 461], [671, 609]);
  line(closed ? [667, 384] : [625, 398], [664, 461]);
  line([593, 612], [610, 612]);
  line([601, 604], [601, 621]);
  line([625, 654], [625, 670]);
  return mat;
}
test("Blue lamp/battery/open-switch drawing is recognized on gray graph paper", () => {
  const mat = circuitFixture(),
    detector = new ElectricalDetector(cv);
  try {
    const result = detector.detect(mat, { ink: "auto" });
    assert.equal(result.ink, "blue");
    assert.deepEqual(result.graph.nodes.map((n) => n.type).sort(), [
      "BATTERY",
      "LAMP",
      "SWITCH",
    ]);
    assert.equal(result.graph.edges.length, 3);
    const engine = new DCEngine(result.graph);
    const lamp = result.graph.nodes.find((n) => n.type === "LAMP"),
      sw = result.graph.nodes.find((n) => n.type === "SWITCH");
    assert.equal(engine.result.values.get(lamp.id), 0);
    assert.equal(engine.toggle(sw.id).values.get(lamp.id), 1);
  } finally {
    mat.delete();
  }
});
test("A plain closed wire with battery and lamp lights the lamp", () => {
  const mat = circuitFixture({ closed: true }),
    detector = new ElectricalDetector(cv);
  try {
    const result = detector.detect(mat, { ink: "blue" });
    const lamp = result.graph.nodes.find((n) => n.type === "LAMP");
    assert.ok(lamp);
    assert.equal(new DCEngine(result.graph).result.values.get(lamp.id), 1);
  } finally {
    mat.delete();
  }
});
test("Bare graph paper is never reported as a solved circuit", () => {
  const mat = new cv.Mat(
    400,
    600,
    cv.CV_8UC4,
    new cv.Scalar(220, 214, 202, 255),
  );
  try {
    const result = new ElectricalDetector(cv).detect(mat);
    assert.equal(result.graph.nodes.length, 0);
  } finally {
    mat.delete();
  }
});
test("Manual lamp terminals take precedence over an excluded automatic proposal", () => {
  const mat = circuitFixture(),
    detector = new ElectricalDetector(cv);
  try {
    const result = detector.detect(mat, {
      excluded: [{ x: 187, y: 457, radius: 50 }],
      hints: [
        {
          id: "manual-lamp",
          type: "LAMP",
          terminals: [
            { x: 186, y: 411 },
            { x: 187, y: 505 },
          ],
        },
      ],
    });
    const engine = new DCEngine(result.graph),
      sw = result.graph.nodes.find((n) => n.type === "SWITCH");
    assert.ok(
      result.graph.nodes.find((n) => n.id === "manual-lamp" && n.manual),
    );
    assert.equal(engine.toggle(sw.id).values.get("manual-lamp"), 1);
  } finally {
    mat.delete();
  }
});
test("Quarter-turn phone photographs retain the same circuit topology", () => {
  const mat = circuitFixture(),
    rotated = new cv.Mat();
  try {
    cv.rotate(mat, rotated, cv.ROTATE_90_CLOCKWISE);
    const result = new ElectricalDetector(cv).detect(rotated, { ink: "auto" });
    assert.deepEqual(result.graph.nodes.map((n) => n.type).sort(), [
      "BATTERY",
      "LAMP",
      "SWITCH",
    ]);
    assert.equal(result.graph.edges.length, 3);
    const engine = new DCEngine(result.graph),
      sw = result.graph.nodes.find((n) => n.type === "SWITCH"),
      lamp = result.graph.nodes.find((n) => n.type === "LAMP");
    assert.equal(engine.toggle(sw.id).values.get(lamp.id), 1);
  } finally {
    mat.delete();
    rotated.delete();
  }
});
