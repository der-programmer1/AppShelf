/** Image-aligned electrical annotations. Cyan paths show detected wires, not measured current. */
export function drawElectrical(ctx, state) {
  const { graph, result, selected, firstMark } = state,
    labels = [];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  for (const edge of graph.edges) {
    if (!edge.points?.length) continue;
    ctx.beginPath();
    edge.points.forEach((p, i) =>
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
    );
    ctx.strokeStyle = "#68cedf";
    ctx.shadowColor = "#68cedf";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  for (const node of graph.nodes) {
    const value = result.values.get(node.id),
      color =
        node.type === "BATTERY"
          ? "#82e8ee"
          : node.type === "SWITCH"
            ? node.closed
              ? "#78f9ac"
              : "#ffc878"
            : value === 1
              ? "#fff18a"
              : value === 0
                ? "#ff8792"
                : "#b5b6c3";
    const [a, b] = node.terminals,
      span = Math.hypot(b.x - a.x, b.y - a.y) || 1,
      u = { x: (b.x - a.x) / span, y: (b.y - a.y) / span },
      v = { x: -u.y, y: u.x };
    const move = (p, axis, t) => ({ x: p.x + axis.x * t, y: p.y + axis.y * t });
    const line = (p, q) => {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    };
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = value === 1 ? 18 : 6;
    if (node.type === "LAMP") {
      const radius = Math.max(14, Math.min(node.width, node.height) / 2);
      ctx.beginPath();
      ctx.ellipse(
        node.x,
        node.y,
        node.width / 2,
        node.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      if (value === 1) {
        ctx.fillStyle = "#fff08b30";
        ctx.fill();
        ctx.fillStyle = color;
      }
      const r = radius * 0.6;
      line({ x: node.x - r, y: node.y - r }, { x: node.x + r, y: node.y + r });
      line({ x: node.x - r, y: node.y + r }, { x: node.x + r, y: node.y - r });
    } else if (node.type === "BATTERY") {
      const long = move(a, u, 10),
        short = move(b, u, -10),
        extent = Math.max(
          22,
          Math.abs(v.x) * node.width + Math.abs(v.y) * node.height,
        );
      line(move(long, v, -extent / 2), move(long, v, extent / 2));
      line(move(short, v, -extent * 0.27), move(short, v, extent * 0.27));
    } else {
      const contact = move(a, u, 11),
        pivot = move(b, u, -11),
        tip = node.closed ? contact : move(contact, v, span * 0.36);
      line(pivot, tip);
      for (const p of [contact, pivot]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    if (selected === node.id) {
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#ad97ff";
      ctx.strokeRect(
        node.x - node.width / 2 - 12,
        node.y - node.height / 2 - 12,
        node.width + 24,
        node.height + 24,
      );
      ctx.setLineDash([]);
    }
    const suffix =
      node.type === "LAMP"
        ? value === 1
          ? "AN"
          : value === 0
            ? "AUS"
            : "?"
        : node.type === "SWITCH"
          ? node.closed
            ? "VIRTUELL ZU"
            : "OFFEN"
          : "ERKANNT";
    const text = `${node.label} · ${suffix}`;
    ctx.font = "600 13px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 18;
    let y = node.y - node.height / 2 - 29;
    for (
      let attempt = 0;
      attempt < 8 &&
      labels.some(
        (r) =>
          Math.abs(node.x - r.x) < (width + r.width) / 2 + 5 &&
          Math.abs(y - r.y) < 30,
      );
      attempt++
    )
      y -= 31;
    labels.push({ x: node.x, y, width });
    ctx.fillStyle = "rgba(9,17,22,.93)";
    ctx.beginPath();
    ctx.roundRect(node.x - width / 2, y - 13, width, 26, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, node.x, y);
  }
  if (firstMark) {
    ctx.strokeStyle = "#c4a5ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(firstMark.x, firstMark.y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "16px system-ui";
    ctx.fillStyle = "#fff";
    ctx.fillText("1", firstMark.x + 18, firstMark.y);
  }
  ctx.restore();
}
