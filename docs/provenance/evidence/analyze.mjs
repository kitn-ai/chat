// Ring metrics from a PNG frame. Usage: node analyze.mjs <png> [<png>...]
// Decodes via ffmpeg to raw RGB, prints JSON per file.
import { execFileSync } from 'node:child_process';

function metrics(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', file]).toString().trim().split(',');
  const W = +probe[0], H = +probe[1];
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 64 * 1024 * 1024 });

  // auto-detect background from the corners: dark page -> luminance,
  // light page -> deficit from white (effect strength is proportional either way)
  const corner = (x, y) => { const i = (y * W + x) * 3; return (raw[i] + raw[i + 1] + raw[i + 2]) / 3; };
  const bgBright = (corner(2, 2) + corner(W - 3, 2) + corner(2, H - 3) + corner(W - 3, H - 3)) / 4 > 128;

  const lum = new Float32Array(W * H);
  let sumL = 0, sumX = 0, sumY = 0;
  for (let i = 0; i < W * H; i++) {
    const r = raw[i * 3], g = raw[i * 3 + 1], b = raw[i * 3 + 2];
    const l = bgBright
      ? Math.max(0, 0.2126 * (250 - r) + 0.7152 * (250 - g) + 0.0722 * (250 - b)) / 250
      : Math.max(0, 0.2126 * (r - 5) + 0.7152 * (g - 5) + 0.0722 * (b - 5)) / 250;
    lum[i] = l;
    if (l > 0.04) { sumL += l; sumX += (i % W) * l; sumY += Math.floor(i / W) * l; }
  }
  const cx = sumX / sumL, cy = sumY / sumL;

  // radial luminance profile
  const maxR = Math.min(W, H) / 2;
  const bins = new Float32Array(Math.ceil(maxR));
  const counts = new Uint32Array(Math.ceil(maxR));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r < maxR) { const bi = Math.floor(r); bins[bi] += lum[y * W + x]; counts[bi]++; }
    }
  }
  const prof = Array.from(bins, (v, i) => counts[i] ? v / counts[i] : 0);
  let peakR = 0, peakL = 0;
  prof.forEach((v, i) => { if (v > peakL) { peakL = v; peakR = i; } });
  const thr = peakL * 0.1;
  let inner = 0; for (let i = peakR; i >= 0; i--) { if (prof[i] < thr) { inner = i; break; } }
  let outer = prof.length - 1; for (let i = peakR; i < prof.length; i++) { if (prof[i] < thr) { outer = i; break; } }

  // angular band stats: per 5-degree sector, radial extent above threshold + peak brightness
  const SEC = 72;
  const secMin = new Float32Array(SEC).fill(1e9);
  const secMax = new Float32Array(SEC).fill(0);
  const secPeak = new Float32Array(SEC);
  let whitePix = 0, bandPix = 0, satSum = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = lum[y * W + x];
      if (l < 0.12) continue;
      const r = Math.hypot(x - cx, y - cy);
      const a = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * SEC) % SEC;
      if (r < secMin[a]) secMin[a] = r;
      if (r > secMax[a]) secMax[a] = r;
      if (l > secPeak[a]) secPeak[a] = l;
      bandPix++;
      const i3 = (y * W + x) * 3;
      const mx = Math.max(raw[i3], raw[i3 + 1], raw[i3 + 2]);
      const mn = Math.min(raw[i3], raw[i3 + 1], raw[i3 + 2]);
      satSum += mx ? (mx - mn) / mx : 0;
      if (mn > 190) whitePix++;
    }
  }
  const thick = [];
  for (let a = 0; a < SEC; a++) if (secMax[a] > 0) thick.push(secMax[a] - secMin[a]);
  thick.sort((p, q) => p - q);
  const q = (arr, f) => arr[Math.floor(f * (arr.length - 1))];

  return {
    file: file.split('/').pop(), W, H,
    center: [cx, cy].map((v) => +v.toFixed(1)),
    peakR, inner, outer,
    peakRFrac: +(peakR / (H / 2)).toFixed(3),      // fraction of half-height
    bandWidth: outer - inner,
    peakL: +peakL.toFixed(3),
    thickMin: +q(thick, 0.1).toFixed(1),
    thickMed: +q(thick, 0.5).toFixed(1),
    thickMax: +q(thick, 0.9).toFixed(1),
    whiteFrac: +(whitePix / bandPix).toFixed(3),   // band pixels reading near-white
    meanSat: +(satSum / bandPix).toFixed(3),
  };
}

for (const f of process.argv.slice(2)) {
  console.log(JSON.stringify(metrics(f)));
}
