// Wave-tile pixel metrics shared by the wave audit follow-ups. Extracted
// verbatim from scripts/wave-audit.mjs (which stays self-contained).

import { PNG } from 'pngjs';

const LIT = 60;

/** Envelope + cycle metrics for one wave-tile PNG (see wave-audit.mjs). */
export function analyzeWave(buffer) {
  const png = PNG.sync.read(buffer);
  const { width: W, height: H, data } = png;
  const x0 = Math.floor(W * 0.25);
  const x1 = Math.ceil(W * 0.75); // stay inside their 20%-80% edge fade mask
  const envelope = [];
  const centroid = [];
  let litCount = 0;
  let lumSum = 0;
  for (let x = x0; x < x1; x++) {
    let minY = -1;
    let maxY = -1;
    let cSum = 0;
    let cW = 0;
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      lumSum += v;
      if (v > LIT) {
        litCount++;
        if (minY < 0) minY = y;
        maxY = y;
        cSum += y * v;
        cW += v;
      }
    }
    envelope.push(minY < 0 ? 0 : maxY - minY + 1);
    centroid.push(cW > 0 ? cSum / cW : NaN);
  }
  const defined = centroid.filter((c) => !Number.isNaN(c));
  const mid = defined.length ? defined.reduce((a, b) => a + b, 0) / defined.length : H / 2;
  let crossings = 0;
  let prev = 0;
  for (const c of centroid) {
    if (Number.isNaN(c)) continue;
    const s = Math.sign(c - mid);
    if (s !== 0 && prev !== 0 && s !== prev) crossings++;
    if (s !== 0) prev = s;
  }
  return {
    W,
    H,
    ampFrac: Math.max(...envelope) / H,
    meanAmpFrac: envelope.reduce((a, b) => a + b, 0) / envelope.length / H,
    cycles: crossings / 2,
    litFrac: litCount / ((x1 - x0) * H),
    meanLum: lumSum / ((x1 - x0) * H),
    centroid,
  };
}

/** Horizontal shift (px) of profile b vs a, by best cross-correlation. */
export function bestShift(a, b, maxShift = 60) {
  let best = { shift: NaN, score: -Infinity };
  for (let s = -maxShift; s <= maxShift; s++) {
    let score = 0;
    let n = 0;
    for (let x = 0; x < a.length; x++) {
      const xb = x + s;
      if (xb < 0 || xb >= b.length) continue;
      const va = a[x];
      const vb = b[xb];
      if (Number.isNaN(va) || Number.isNaN(vb)) continue;
      score -= (va - vb) * (va - vb);
      n++;
    }
    if (n > a.length / 2 && score / n > best.score) best = { shift: s, score: score / n };
  }
  return best.shift;
}
