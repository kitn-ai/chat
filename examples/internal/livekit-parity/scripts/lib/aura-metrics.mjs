// Radial aura metrics shared by the aurora audit follow-ups. Extracted
// verbatim from scripts/aurora-audit.mjs (which stays self-contained).
const LIT = 40;

export function analyzeAura(png) {
  const { width: W, height: H, data } = png;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return Math.max(data[i], data[i + 1], data[i + 2]);
  };
  // Centre = lit-pixel centroid (canvas is centered in the tile; robust).
  let sx = 0;
  let sy = 0;
  let n = 0;
  let whiteClip = 0;
  let satSum = 0;
  let valSum = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const v = Math.max(r, g, b);
      if (v > LIT) {
        sx += x;
        sy += y;
        n++;
        const min = Math.min(r, g, b);
        satSum += v === 0 ? 0 : (v - min) / v;
        valSum += v / 255;
        if (min > 240) whiteClip++;
      }
    }
  if (n < 50) {
    return { lit: n, meanR: 0, outer: new Array(360).fill(0), lobes: 0 };
  }
  const cx = sx / n;
  const cy = sy / n;
  const maxR = Math.min(cx, cy, W - cx, H - cy) - 1;

  const outer = [];
  const inner = [];
  const riseIn = [];
  const riseOut = [];
  let rSum = 0;
  let rN = 0;
  for (let a = 0; a < 360; a++) {
    const th = (a * Math.PI) / 180;
    const dx = Math.cos(th);
    const dy = Math.sin(th); // y down => theta grows clockwise on screen
    let profile = [];
    for (let r = 0; r < maxR; r += 0.5) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      profile.push(x >= 0 && y >= 0 && x < W && y < H ? lum(x, y) : 0);
    }
    const peak = Math.max(...profile);
    if (peak <= LIT) {
      outer.push(0);
      inner.push(0);
      continue;
    }
    let first = -1;
    let last = -1;
    for (let i = 0; i < profile.length; i++) {
      if (profile[i] > LIT) {
        if (first < 0) first = i;
        last = i;
      }
    }
    inner.push(first * 0.5);
    outer.push(last * 0.5);
    rSum += ((first + last) / 2) * 0.5;
    rN++;
    // 10->90% rise distance, inner side (walking outward) and outer side
    // (walking inward), around the ring's brightness peak.
    const p10 = 0.1 * peak;
    const p90 = 0.9 * peak;
    let i10 = -1;
    let i90 = -1;
    for (let i = 0; i <= last; i++) {
      if (i10 < 0 && profile[i] >= p10) i10 = i;
      if (i90 < 0 && profile[i] >= p90) i90 = i;
    }
    if (i10 >= 0 && i90 >= i10) riseIn.push((i90 - i10) * 0.5);
    let o10 = -1;
    let o90 = -1;
    for (let i = profile.length - 1; i >= 0; i--) {
      if (o10 < 0 && profile[i] >= p10) o10 = i;
      if (o90 < 0 && profile[i] >= p90) o90 = i;
    }
    if (o10 >= 0 && o10 >= o90 && o90 >= 0) riseOut.push((o10 - o90) * 0.5);
  }

  // Lobe count: local maxima of the outer profile after light smoothing.
  const sm = outer.map((_, i) => {
    let s = 0;
    for (let k = -5; k <= 5; k++) s += outer[(i + k + 360) % 360];
    return s / 11;
  });
  const mean = sm.reduce((a, b) => a + b, 0) / 360;
  let lobes = 0;
  for (let i = 0; i < 360; i++) {
    const p = sm[(i - 1 + 360) % 360];
    const nx = sm[(i + 1) % 360];
    if (sm[i] > p && sm[i] >= nx && sm[i] > mean * 1.02) lobes++;
  }

  // Centre transparency: mean luminance in a small centre disc.
  let cSum = 0;
  let cN = 0;
  const cR = Math.max(3, (rSum / Math.max(1, rN)) * 0.3);
  for (let y = Math.round(cy - cR); y <= cy + cR; y++)
    for (let x = Math.round(cx - cR); x <= cx + cR; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= cR * cR && x >= 0 && y >= 0 && x < W && y < H) {
        cSum += lum(x, y);
        cN++;
      }
    }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  return {
    lit: n,
    meanR: rSum / Math.max(1, rN),
    outerMax: Math.max(...outer),
    outer,
    lobes,
    meanSat: satSum / n,
    meanVal: valSum / n,
    whiteClipFrac: whiteClip / n,
    centreLum: cN ? cSum / cN : NaN,
    riseInner: avg(riseIn),
    riseOuter: avg(riseOut),
  };
}

/** Best circular shift (degrees, positive = clockwise on screen) of b vs a. */
export function angularShift(a, b) {
  let best = { deg: NaN, score: Infinity };
  for (let s = -90; s <= 90; s++) {
    let err = 0;
    let n = 0;
    for (let i = 0; i < 360; i++) {
      const va = a[i];
      const vb = b[(i + s + 360) % 360];
      if (va === 0 || vb === 0) continue;
      err += (va - vb) ** 2;
      n++;
    }
    if (n > 180 && err / n < best.score) best = { deg: s, score: err / n };
  }
  return best.deg;
}
