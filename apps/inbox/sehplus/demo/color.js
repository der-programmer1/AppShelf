// Port of SehPlus 1.6.2 ColorAnalyzer.java: centre-weighted hue groups and neutral areas.
export const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
export const median = (values) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    : 0;
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[
    Math.round((values.length - 1) * fraction)
  ] || 0;
export const hueDistance = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
export function hsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}
export function baseName(h, s, v) {
  if (v < 0.16) return "Schwarz";
  if (s < 0.14) return v > 0.92 ? "Weiß" : "Grau";
  if (h < 15 || h >= 345) return "Rot";
  if (h < 42) {
    if (v < 0.48) return "Braun";
    if (s < 0.28 && v > 0.78) return "Creme";
    if (s < 0.45 && v > 0.7) return "Sand";
    if (s < 0.58) return "Beige";
    if (s < 0.72 && v < 0.82) return "Ocker";
    return "Orange";
  }
  if (h < 58 && v > 0.48 && s < 0.52) return "Khaki";
  if (h < 72) return "Gelb";
  if (h < 165) return "Grün";
  if (h < 195) return "Türkis";
  if (h < 255) return "Blau";
  if (h < 300) return "Violett";
  return "Pink";
}
const luminance = (s) => 0.2126 * s.r + 0.7152 * s.g + 0.0722 * s.b;
function undertone(h, spread, name) {
  if (spread > 25) return "";
  if (name === "Beige") return h < 30 ? "leicht rötlich" : "leicht gelblich";
  if (name === "Khaki") return "leicht grünlich";
  if (name === "Grün" && h < 95) return "leicht gelblich";
  if (name === "Blau" && h > 220) return "leicht violett";
  if (name === "Orange" && h < 30) return "leicht rötlich";
  if (name === "Violett" && h > 275) return "leicht pink";
  return "";
}
export function automaticGains(pixels, width, height) {
  const sums = [0, 0, 0];
  let count = 0;
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 32)))
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
      const i = (y * width + x) * 4,
        r = pixels[i],
        g = pixels[i + 1],
        b = pixels[i + 2],
        [, s] = hsv(r, g, b),
        l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (
        s < 0.14 &&
        l > 36 &&
        l < 238 &&
        !(
          Math.max(r, g, b) >= 244 && Math.max(r, g, b) - Math.min(r, g, b) < 48
        )
      ) {
        sums[0] += r;
        sums[1] += g;
        sums[2] += b;
        count++;
      }
    }
  if (count < 12) return [1, 1, 1];
  const avg = sums.reduce((a, b) => a + b, 0) / 3 / count,
    gains = sums.map((s) => clamp(avg / Math.max(1, s / count), 0.88, 1.16));
  return Math.max(...gains) - Math.min(...gains) < 0.035 ? [1, 1, 1] : gains;
}
export function calibrationGains(result) {
  const { r, g, b, saturation, value, count, mixed } = result;
  if (
    count < 12 ||
    mixed ||
    saturation > 0.24 ||
    value < 0.35 ||
    Math.max(r, g, b) - Math.min(r, g, b) > 68
  )
    throw Error(
      "Die Referenz ist nicht neutral oder zu dunkel. Nutze eine matte weiße oder graue Fläche.",
    );
  const target = value > 0.78 ? 232 : 170;
  return [r, g, b].map((c) => clamp(target / Math.max(1, c), 0.7, 1.4));
}
export function analyzePixels(
  pixels,
  width,
  height,
  cx,
  cy,
  radius,
  gains = [1, 1, 1],
) {
  const safeRadius = Math.max(
      2,
      Math.min(radius, Math.max(2, Math.floor(Math.min(width, height) / 3))),
    ),
    samples = [];
  for (
    let y = Math.max(0, cy - safeRadius);
    y <= Math.min(height - 1, cy + safeRadius);
    y++
  )
    for (
      let x = Math.max(0, cx - safeRadius);
      x <= Math.min(width - 1, cx + safeRadius);
      x++
    ) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > safeRadius) continue;
      const i = (y * width + x) * 4,
        [r, g, b] = [0, 1, 2].map((c) =>
          clamp(Math.round(pixels[i + c] * clamp(gains[c], 0.7, 1.4)), 0, 255),
        ),
        [h, s, v] = hsv(r, g, b);
      samples.push({
        r,
        g,
        b,
        h,
        s,
        v,
        distance,
        weight:
          0.55 + (1 - Math.min(1, distance / Math.max(1, safeRadius))) * 0.45,
      });
    }
  if (!samples.length) return null;
  const neutralRatio = samples.filter((s) => s.s < 0.2).length / samples.length,
    center = samples.filter(
      (s) => s.distance <= Math.max(2, Math.round(safeRadius * 0.18)),
    ),
    cn = center.filter((s) => s.s < 0.2).length / center.length;
  const centerHue =
    ((Math.atan2(
      center.reduce(
        (a, s) => a + Math.sin((s.h * Math.PI) / 180) * Math.max(0.2, s.s),
        0,
      ),
      center.reduce(
        (a, s) => a + Math.cos((s.h * Math.PI) / 180) * Math.max(0.2, s.s),
        0,
      ),
    ) *
      180) /
      Math.PI +
      360) %
    360;
  const centerSat = center.reduce((a, s) => a + s.s, 0) / center.length,
    medianLum = median(samples.map(luminance));
  let usable = samples.filter(
    (s) =>
      !(
        Math.max(s.r, s.g, s.b) >= 242 &&
        Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b) < 52 &&
        luminance(s) > medianLum + 26
      ),
  );
  if (usable.length < Math.max(5, samples.length / 2)) usable = samples;
  let dominant,
    confidence,
    reason,
    mixed = false,
    ratio,
    hueSpread = 0,
    name,
    tone = "";
  if (cn >= 0.68 && neutralRatio >= 0.3) {
    dominant = center;
    ratio = cn;
    confidence = cn >= 0.78 ? "hoch" : "mittel";
    reason =
      percentile(
        center.map((s) => s.v),
        0.9,
      ) -
        percentile(
          center.map((s) => s.v),
          0.1,
        ) >
      0.2
        ? "Struktur erkannt"
        : "Fläche überwiegend einheitlich";
  } else {
    const bins = Array(36).fill(0);
    let weight = 0;
    usable.forEach((s) => {
      const w = s.weight * Math.max(0.18, s.s),
        bin = clamp(Math.floor(s.h / 10), 0, 35);
      weight += w;
      bins[bin] += w;
      bins[(bin + 35) % 36] += w * 0.45;
      bins[(bin + 1) % 36] += w * 0.45;
    });
    let best = bins.indexOf(Math.max(...bins)),
      centerBin = clamp(Math.floor(centerHue / 10), 0, 35);
    if (centerSat >= 0.2 && bins[centerBin] >= bins[best] * 0.22)
      best = centerBin;
    let second = best === 0 ? 1 : 0;
    bins.forEach((n, i) => {
      if (i !== best && n > bins[second]) second = i;
    });
    const hue = best * 10 + 5;
    ratio = bins[best] / Math.max(0.01, weight * 1.9);
    dominant = usable.filter((s) => {
      const difference = hueDistance(s.h, hue);
      if (difference <= 38) {
        hueSpread = Math.max(hueSpread, difference);
        return true;
      }
      return false;
    });
    if (dominant.length < Math.max(5, usable.length / 4)) dominant = usable;
    mixed =
      bins[second] > bins[best] * 0.48 &&
      hueDistance(hue, second * 10 + 5) > 42;
    confidence =
      mixed || ratio < 0.46
        ? "niedrig"
        : ratio < 0.64 || hueSpread > 32
          ? "mittel"
          : "hoch";
    reason = mixed
      ? "Mehrere Farben oder Kante erkannt"
      : hueSpread > 28 ||
          percentile(
            dominant.map((s) => s.v),
            0.9,
          ) -
            percentile(
              dominant.map((s) => s.v),
              0.1,
            ) >
            0.22
        ? "Struktur erkannt"
        : "dominante Farbgruppe erkannt";
  }
  const [r, g, b] = ["r", "g", "b"].map((k) =>
      median(dominant.map((s) => s[k])),
    ),
    [h, s, v] = hsv(r, g, b);
  if (cn >= 0.68 && neutralRatio >= 0.3) {
    const sat = Math.max(s, median(dominant.map((s) => s.s)));
    name = v < 0.18 ? "Schwarz" : v > 0.92 && sat < 0.12 ? "Weiß" : "Grau";
    if (name === "Grau" && median(dominant.map((s) => s.s)) >= 0.1) {
      const hues = dominant.filter((s) => s.s >= 0.06).map((s) => s.h);
      if (hues.length) {
        const relevant = [...new Set(hues)],
          hue = relevant.reduce(
            (best, x) =>
              hues.reduce((n, h) => n + hueDistance(x, h), 0) <
              hues.reduce((n, h) => n + hueDistance(best, h), 0)
                ? x
                : best,
            relevant[0],
          );
        tone =
          hue >= 175 && hue <= 275
            ? "leicht bläulich"
            : hue >= 18 && hue <= 78
              ? "leicht warm"
              : "";
      }
    }
  } else {
    name = baseName(h, s, v);
    tone = undertone(h, hueSpread, name);
  }
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    quality =
      max < 32
        ? "eingeschränkt · zu dunkel"
        : max > 248 && max - min < 18
          ? "eingeschränkt · sehr hell oder Spiegelung"
          : mixed || confidence === "niedrig"
            ? "eingeschränkt · Fläche uneinheitlich"
            : confidence === "mittel"
              ? "brauchbar · möglichst gleichmäßig beleuchten"
              : "gut · Fläche überwiegend einheitlich";
  return {
    r,
    g,
    b,
    name: name + (tone ? " · " + tone : ""),
    confidence,
    reason,
    quality,
    count: samples.length,
    mixed,
    saturation: median(dominant.map((s) => s.s)),
    value: v,
    dominantRatio: clamp(ratio, 0, 1),
  };
}
export function compareColors(a, b) {
  const brightness =
      Math.abs(luminance(a) - luminance(b)) < 12
        ? "ähnlich hell"
        : luminance(b) > luminance(a)
          ? "Punkt B ist heller"
          : "Punkt B ist dunkler",
    diff = hueDistance(hsv(a.r, a.g, a.b)[0], hsv(b.r, b.g, b.b)[0]),
    hue =
      diff < 18
        ? "ähnlicher Farbton"
        : diff < 58
          ? "leicht anderer Farbton"
          : "deutlich anderer Farbton",
    distance = Math.round(Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b));
  return `${brightness} · ${hue}\nFarbabstand: ${distance} · Sicherheit B: ${b.confidence}`;
}
