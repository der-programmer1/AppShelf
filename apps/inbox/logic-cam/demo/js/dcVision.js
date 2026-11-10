import { connectedComponents, traceWirePath } from "./pixelGraph.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (p, u, s) => ({ x: p.x + u.x * s, y: p.y + u.y * s });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const unit = (a, b) => {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};
const angleGap = (a, b) => Math.acos(Math.min(1, Math.abs(dot(a, b))));
const inside = (p, node, padding = 0) =>
  distance(p, node) < Math.max(node.width, node.height) / 2 + padding;
const bounds = (points) => ({
  width:
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)),
  height:
    Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)),
});

function polygonAround(a, b, width, padding = 7) {
  const u = unit(a, b),
    v = { x: -u.y, y: u.x },
    start = add(a, u, -padding),
    end = add(b, u, padding);
  return [
    add(start, v, width / 2 + padding),
    add(end, v, width / 2 + padding),
    add(end, v, -width / 2 - padding),
    add(start, v, -width / 2 - padding),
  ];
}
function inkNear(data, width, height, p, radius = 2) {
  const x = Math.round(p.x),
    y = Math.round(p.y);
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++)
      if (
        x + dx >= 0 &&
        y + dy >= 0 &&
        x + dx < width &&
        y + dy < height &&
        data[(y + dy) * width + x + dx]
      )
        return true;
  return false;
}

function mergeSegments(lines) {
  const result = [];
  for (const next of lines.sort((a, b) => b.length - a.length)) {
    const existing = result.find((line) => {
      if (angleGap(line.u, next.u) > 0.12) return false;
      const n = { x: -line.u.y, y: line.u.x },
        delta = { x: next.a.x - line.a.x, y: next.a.y - line.a.y };
      if (Math.abs(dot(delta, n)) > 4) return false;
      const projections = [next.a, next.b].map((p) =>
        dot({ x: p.x - line.a.x, y: p.y - line.a.y }, line.u),
      );
      return (
        Math.max(...projections) >= -7 &&
        Math.min(...projections) <= line.length + 7
      );
    });
    if (!existing) {
      result.push(next);
      continue;
    }
    const points = [existing.a, existing.b, next.a, next.b],
      origin = existing.a;
    const values = points.map((p) =>
      dot({ x: p.x - origin.x, y: p.y - origin.y }, existing.u),
    );
    existing.a = add(origin, existing.u, Math.min(...values));
    existing.b = add(origin, existing.u, Math.max(...values));
    existing.length = distance(existing.a, existing.b);
  }
  return result;
}

/** Colored ink rejects gray graph paper and uneven illumination before shape analysis. */
function prepareMask(
  cv,
  source,
  owned,
  { ink = "auto", threshold = 150, adaptive = true },
) {
  const keep = (mat) => {
      owned.push(mat);
      return mat;
    },
    rgb = keep(new cv.Mat()),
    hsv = keep(new cv.Mat()),
    blue = keep(new cv.Mat());
  cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB);
  cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
  const low = keep(
      new cv.Mat(hsv.rows, hsv.cols, hsv.type(), new cv.Scalar(85, 32, 12, 0)),
    ),
    high = keep(
      new cv.Mat(
        hsv.rows,
        hsv.cols,
        hsv.type(),
        new cv.Scalar(145, 255, 255, 0),
      ),
    );
  cv.inRange(hsv, low, high, blue);
  if (
    ink === "blue" ||
    (ink === "auto" &&
      cv.countNonZero(blue) > Math.max(90, source.rows * source.cols * 0.0002))
  )
    return { mask: blue, ink: "blue" };
  const gray = keep(new cv.Mat()),
    mask = keep(new cv.Mat());
  cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
  if (adaptive)
    cv.adaptiveThreshold(
      gray,
      mask,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      35,
      12,
    );
  else cv.threshold(gray, mask, threshold, 255, cv.THRESH_BINARY_INV);
  // Long full-page ruled lines are background. Shorter circuit wires remain.
  for (const size of [
    new cv.Size(Math.max(40, Math.round(mask.cols * 0.72)), 1),
    new cv.Size(1, Math.max(40, Math.round(mask.rows * 0.78))),
  ]) {
    const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, size)),
      grid = keep(new cv.Mat());
    cv.morphologyEx(mask, grid, cv.MORPH_OPEN, kernel);
    cv.subtract(mask, grid, mask);
  }
  return { mask, ink: "dark" };
}

export class ElectricalDetector {
  constructor(cv) {
    this.cv = cv;
  }
  detect(source, options = {}) {
    const cv = this.cv,
      owned = [],
      keep = (m) => {
        owned.push(m);
        return m;
      };
    try {
      const src = source instanceof cv.Mat ? source : keep(cv.imread(source));
      const { mask, ink } = prepareMask(cv, src, owned, options),
        width = mask.cols,
        height = mask.rows;
      const blur = keep(new cv.Mat());
      cv.GaussianBlur(mask, blur, new cv.Size(3, 3), 0);
      const rawLines = keep(new cv.Mat());
      cv.HoughLinesP(mask, rawLines, 1, Math.PI / 180, 13, 16, 5);
      const segments = [];
      for (let i = 0; i < rawLines.rows; i++) {
        const data = rawLines.data32S;
        const a = { x: data[i * 4], y: data[i * 4 + 1] },
          b = { x: data[i * 4 + 2], y: data[i * 4 + 3] };
        segments.push({ a, b, u: unit(a, b), length: distance(a, b) });
      }
      const lines = mergeSegments(segments).slice(0, 160),
        nodes = [];
      const circles = keep(new cv.Mat());
      cv.HoughCircles(
        blur,
        circles,
        cv.HOUGH_GRADIENT,
        1.2,
        35,
        100,
        15,
        13,
        Math.min(95, Math.round(Math.min(width, height) * 0.19)),
      );
      const lamps = [];
      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3],
          y = circles.data32F[i * 3 + 1],
          radius = circles.data32F[i * 3 + 2],
          center = { x, y };
        let ring = 0;
        for (let j = 0; j < 60; j++) {
          const angle = (j * Math.PI) / 30;
          if (
            inkNear(
              mask.data,
              width,
              height,
              {
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius,
              },
              3,
            )
          )
            ring++;
        }
        if (ring / 60 < 0.52) continue;
        const inner = lines.filter(
          (l) =>
            distance(mid(l.a, l.b), center) < radius * 0.55 &&
            l.length > radius * 0.65 &&
            [l.a, l.b].every((p) => distance(p, center) < radius * 1.22),
        );
        if (
          !inner.some((a, i) =>
            inner.slice(i + 1).some((b) => angleGap(a.u, b.u) > 0.6),
          )
        )
          continue;
        if (lamps.some((n) => distance(n, center) < Math.max(n.radius, radius)))
          continue;
        const exits = [];
        for (let j = 0; j < 72; j++) {
          const angle = (j * Math.PI) / 36,
            u = { x: Math.cos(angle), y: Math.sin(angle) };
          if (
            [7, 10, 14].some((extra) =>
              inkNear(
                mask.data,
                width,
                height,
                add(center, u, radius + extra),
                2,
              ),
            )
          )
            exits.push({ angle, u });
        }
        let pair = null,
          best = 0;
        for (const a of exits)
          for (const b of exits) {
            const gap = 1 - dot(a.u, b.u);
            if (gap > best) {
              best = gap;
              pair = [a.u, b.u];
            }
          }
        if (best < 1.4) continue;
        // Opposite wire exits define the lamp's electrical axis; the crossed filament is internal.
        const terminals = pair.map((u) => add(center, u, radius + 10));
        lamps.push({
          id: `lamp-${lamps.length}`,
          type: "LAMP",
          label: `Lampe ${lamps.length + 1}`,
          x,
          y,
          width: radius * 2,
          height: radius * 2,
          radius,
          terminals,
          confidence: Math.min(0.95, ring / 60),
          erase: { circle: { x, y, radius: radius + 6 } },
        });
      }
      nodes.push(...lamps);
      const batteries = [];
      const attachment = (bar) => {
        let best = null;
        for (const conductor of lines) {
          if (
            conductor === bar ||
            conductor.length < 23 ||
            angleGap(bar.u, conductor.u) < 1.15
          )
            continue;
          const cross = bar.u.x * conductor.u.y - bar.u.y * conductor.u.x;
          if (Math.abs(cross) < 0.5) continue;
          const delta = {
              x: conductor.a.x - bar.a.x,
              y: conductor.a.y - bar.a.y,
            },
            t = (delta.x * conductor.u.y - delta.y * conductor.u.x) / cross;
          if (t < 0 || t > bar.length) continue;
          const point = add(bar.a, bar.u, t),
            gap = Math.min(
              distance(point, conductor.a),
              distance(point, conductor.b),
            );
          if (gap > 14) continue;
          const score = gap - conductor.length * 0.006;
          if (!best || score < best.score)
            best = {
              point,
              score,
              span: Math.max(20, 2 * Math.min(t, bar.length - t)),
            };
        }
        return best ?? { point: mid(bar.a, bar.b), span: bar.length };
      };
      for (let i = 0; i < lines.length; i++)
        for (let j = i + 1; j < lines.length; j++) {
          const a = lines[i],
            b = lines[j];
          if (
            a.length < 22 ||
            a.length > 165 ||
            b.length < 15 ||
            b.length > 150 ||
            angleGap(a.u, b.u) > 0.17
          )
            continue;
          if (
            [a, b].some((l) => lamps.some((n) => inside(mid(l.a, l.b), n, 6)))
          )
            continue;
          const ca = mid(a.a, a.b),
            cb = mid(b.a, b.b),
            delta = { x: cb.x - ca.x, y: cb.y - ca.y },
            normal = { x: -a.u.y, y: a.u.x },
            gap = Math.abs(dot(delta, normal)),
            side = Math.abs(dot(delta, a.u));
          const ratio =
            Math.max(a.length, b.length) / Math.min(a.length, b.length);
          if (
            gap < 8 ||
            gap > 70 ||
            side > Math.max(a.length, b.length) * 0.3 ||
            ratio < 1.22 ||
            ratio > 3.6 ||
            gap > Math.max(a.length, b.length) * 1.35
          )
            continue;
          const aa = attachment(a),
            bb = attachment(b),
            long = a.length >= b.length ? aa.point : bb.point,
            short = a.length >= b.length ? bb.point : aa.point,
            u = unit(long, short),
            center = mid(long, short);
          if (batteries.some((n) => distance(n, center) < 60)) continue;
          const polygon = polygonAround(
            long,
            short,
            Math.max(aa.span, bb.span),
            5,
          );
          batteries.push({
            id: `battery-${batteries.length}`,
            type: "BATTERY",
            label: "Batterie",
            ...center,
            ...bounds(polygon),
            terminals: [add(long, u, -10), add(short, u, 10)],
            confidence: 0.86,
            erase: { polygon },
          });
        }
      nodes.push(...batteries);
      const switches = [];
      for (const arm of lines) {
        if (
          arm.length < 17 ||
          arm.length > 110 ||
          nodes.some((n) => inside(mid(arm.a, arm.b), n, 12))
        )
          continue;
        for (const conductor of lines) {
          const difference = angleGap(arm.u, conductor.u);
          if (difference < 0.28 || difference > 1.34 || conductor.length < 22)
            continue;
          const combinations = [
            { pivot: arm.a, tip: arm.b, end: conductor.a, other: conductor.b },
            { pivot: arm.a, tip: arm.b, end: conductor.b, other: conductor.a },
            { pivot: arm.b, tip: arm.a, end: conductor.a, other: conductor.b },
            { pivot: arm.b, tip: arm.a, end: conductor.b, other: conductor.a },
          ];
          for (const option of combinations) {
            if (
              distance(option.pivot, option.end) >
              Math.min(26, arm.length * 0.5)
            )
              continue;
            const pivot = mid(option.pivot, option.end),
              u = unit(option.other, pivot),
              normal = { x: -u.y, y: u.x };
            for (const fixed of lines) {
              if (
                fixed === arm ||
                fixed === conductor ||
                angleGap(u, fixed.u) > 0.18
              )
                continue;
              for (const contact of [fixed.a, fixed.b]) {
                const delta = {
                    x: contact.x - pivot.x,
                    y: contact.y - pivot.y,
                  },
                  separation = dot(delta, u);
                if (
                  separation < arm.length * 0.55 ||
                  separation > arm.length * 1.85 ||
                  Math.abs(dot(delta, normal)) > 12 ||
                  distance(contact, option.tip) < 5 ||
                  distance(contact, option.tip) > arm.length
                )
                  continue;
                const center = mid(contact, pivot);
                if (
                  nodes.some((n) => inside(center, n, 12)) ||
                  switches.some((n) => distance(n, center) < 55)
                )
                  continue;
                const extent = Math.max(
                  12,
                  Math.abs(
                    dot(
                      {
                        x: option.tip.x - center.x,
                        y: option.tip.y - center.y,
                      },
                      normal,
                    ),
                  ) * 2,
                );
                switches.push({
                  id: `switch-${switches.length}`,
                  type: "SWITCH",
                  label: `Schalter ${switches.length + 1}`,
                  ...center,
                  width:
                    Math.abs(normal.x) * extent +
                    Math.abs(u.x) * separation +
                    16,
                  height:
                    Math.abs(normal.y) * extent +
                    Math.abs(u.y) * separation +
                    16,
                  closed: false,
                  terminals: [add(contact, u, 12), add(pivot, u, -12)],
                  confidence: 0.82,
                  arm: [option.tip, pivot],
                  erase: { polygon: polygonAround(contact, pivot, extent, 7) },
                });
              }
            }
          }
        }
      }
      nodes.push(...switches);
      // User-specified terminals take precedence over nearby heuristic proposals.
      for (const hint of options.hints ?? []) {
        if (
          !["LAMP", "BATTERY", "SWITCH"].includes(hint.type) ||
          hint.terminals?.length !== 2 ||
          !hint.terminals.every(
            (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
          )
        )
          continue;
        const [a, b] = hint.terminals,
          center = mid(a, b),
          span = distance(a, b);
        for (let i = nodes.length - 1; i >= 0; i--)
          if (distance(nodes[i], center) < Math.max(25, span * 0.65))
            nodes.splice(i, 1);
        nodes.push({
          id: hint.id,
          type: hint.type,
          label: { LAMP: "Lampe", BATTERY: "Batterie", SWITCH: "Schalter" }[
            hint.type
          ],
          ...center,
          width:
            hint.type === "LAMP"
              ? Math.max(25, span - 14)
              : Math.max(25, Math.abs(a.x - b.x) + 18),
          height:
            hint.type === "LAMP"
              ? Math.max(25, span - 14)
              : Math.max(25, Math.abs(a.y - b.y) + 18),
          terminals: [a, b],
          closed: hint.closed === true,
          confidence: 1,
          manual: true,
          erase:
            hint.type === "LAMP"
              ? { circle: { ...center, radius: Math.max(12, span / 2 - 6) } }
              : {
                  polygon: polygonAround(
                    add(a, unit(a, b), 7),
                    add(b, unit(a, b), -7),
                    Math.max(16, span * 0.5),
                    0,
                  ),
                },
        });
      }
      const excluded = options.excluded ?? [];
      const accepted = nodes
        .filter(
          (n) => n.manual || !excluded.some((p) => distance(n, p) < p.radius),
        )
        .slice(0, 30);
      const wire = keep(mask.clone());
      for (const node of accepted) {
        if (node.erase.circle) {
          const c = node.erase.circle;
          cv.circle(
            wire,
            new cv.Point(Math.round(c.x), Math.round(c.y)),
            Math.round(c.radius),
            new cv.Scalar(0),
            -1,
          );
        } else {
          const points = keep(
            cv.matFromArray(
              node.erase.polygon.length,
              1,
              cv.CV_32SC2,
              node.erase.polygon.flatMap((p) => [
                Math.round(p.x),
                Math.round(p.y),
              ]),
            ),
          );
          cv.fillConvexPoly(wire, points, new cv.Scalar(0));
        }
      }
      const labels = connectedComponents(wire.data, width, height),
        nets = new Map();
      for (const node of accepted)
        node.terminals.forEach((p, pin) => {
          let best = null;
          for (let dy = -11; dy <= 11; dy++)
            for (let dx = -11; dx <= 11; dx++) {
              const x = Math.round(p.x + dx),
                y = Math.round(p.y + dy),
                score = dx * dx + dy * dy;
              if (
                x < 0 ||
                y < 0 ||
                x >= width ||
                y >= height ||
                !labels[y * width + x]
              )
                continue;
              if (!best || score < best.score)
                best = {
                  score,
                  at: y * width + x,
                  label: labels[y * width + x],
                };
            }
          if (best) {
            if (!nets.has(best.label)) nets.set(best.label, []);
            nets.get(best.label).push({ node: node.id, pin, at: best.at });
          }
        });
      const edges = [];
      for (const ports of nets.values())
        for (let i = 1; i < ports.length; i++) {
          const a = ports[0],
            b = ports[i],
            points = traceWirePath(labels, width, height, a.at, b.at);
          edges.push({
            id: `dc-wire-${edges.length}`,
            from: { node: a.node, pin: a.pin },
            to: { node: b.node, pin: b.pin },
            points,
          });
        }
      const graph = {
        kind: "electrical",
        version: 1,
        nodes: accepted.map(({ erase, radius, arm, ...node }) => node),
        edges,
      };
      return {
        domain: "electrical",
        graph,
        candidates: accepted.length,
        width,
        height,
        ink,
        confidence: accepted.length
          ? accepted.reduce((sum, n) => sum + n.confidence, 0) / accepted.length
          : 0,
        ...(options.debug ? { debug: { lines, nets: [...nets] } } : {}),
      };
    } finally {
      for (let i = owned.length - 1; i >= 0; i--) owned[i].delete();
    }
  }
}
