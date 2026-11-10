/** Connected ink components and shortest pixel paths, shared by both recognizers. */
export function connectedComponents(mask, width, height) {
  const labels = new Int32Array(mask.length),
    queue = new Int32Array(mask.length);
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || labels[i]) continue;
    let head = 0,
      tail = 0;
    queue[tail++] = i;
    labels[i] = ++count;
    while (head < tail) {
      const p = queue[head++],
        x = p % width,
        y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (dx === 0 && dy === 0) ||
            x + dx < 0 ||
            x + dx >= width ||
            y + dy < 0 ||
            y + dy >= height
          )
            continue;
          const next = p + dy * width + dx;
          if (mask[next] && !labels[next]) {
            labels[next] = count;
            queue[tail++] = next;
          }
        }
    }
  }
  return labels;
}

export function traceWirePath(labels, width, height, start, end) {
  const parents = new Int32Array(labels.length);
  parents.fill(-1);
  const queue = new Int32Array(labels.length);
  let head = 0,
    tail = 1;
  queue[0] = start;
  parents[start] = start;
  while (head < tail && parents[end] === -1) {
    const p = queue[head++],
      x = p % width,
      y = Math.floor(p / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        const n = p + dy * width + dx;
        if (labels[n] === labels[start] && parents[n] === -1) {
          parents[n] = p;
          queue[tail++] = n;
        }
      }
  }
  if (parents[end] === -1) return [];
  const reversed = [];
  let p = end,
    limit = labels.length;
  while (p !== start && limit--) {
    reversed.push({ x: p % width, y: Math.floor(p / width) });
    p = parents[p];
  }
  reversed.push({ x: start % width, y: Math.floor(start / width) });
  reversed.reverse();
  return reversed
    .filter((_, i) => i === 0 || i === reversed.length - 1 || i % 5 === 0)
    .slice(0, 300);
}
