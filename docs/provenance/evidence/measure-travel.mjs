// Estimates how fast the fold pattern travels around the ring and how fast it
// decorrelates, from a burst of frames with known timestamps.
// Usage: node measure-travel.mjs <framesDir> <prefix> <count> <meanIntervalMs>
import { execFileSync } from 'node:child_process';

const [dir, prefix, countS, dtS] = process.argv.slice(2);
const N = +countS, DT = +dtS / 1000;
const SEC = 90;

function angularProfile(file) {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',');
  const W = +probe[0], H = +probe[1];
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64e6 });
  const corner = (x, y) => { const i = (y * W + x) * 3; return (raw[i] + raw[i + 1] + raw[i + 2]) / 3; };
  const bright = (corner(2, 2) + corner(W - 3, 2) + corner(2, H - 3) + corner(W - 3, H - 3)) / 4 > 128;
  const cx = W / 2, cy = H / 2;
  const prof = new Float32Array(SEC);
  const cnt = new Uint32Array(SEC);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i3 = (y * W + x) * 3;
      const l = bright
        ? (750 - raw[i3] - raw[i3 + 1] - raw[i3 + 2]) / 750
        : (raw[i3] + raw[i3 + 1] + raw[i3 + 2] - 15) / 750;
      if (l < 0.06) continue;
      const a = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * SEC) % SEC;
      prof[a] += l; cnt[a]++;
    }
  }
  for (let a = 0; a < SEC; a++) prof[a] = cnt[a] ? prof[a] / cnt[a] : 0;
  const mean = prof.reduce((s, v) => s + v, 0) / SEC;
  return Array.from(prof, (v) => v - mean);
}

const profs = [];
for (let i = 0; i < N; i++) {
  profs.push(angularProfile(`${dir}/${prefix}${String(i).padStart(3, '0')}.png`));
}

function corrAtShift(a, b, s) {
  let num = 0, da = 0, db = 0;
  for (let k = 0; k < SEC; k++) {
    const va = a[k], vb = b[(k + s + SEC) % SEC];
    num += va * vb; da += va * va; db += vb * vb;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

// best angular shift between frames LAG apart, averaged over the burst
for (const LAG of [3, 6, 12]) {
  let shifts = [], corrs = [];
  for (let i = 0; i + LAG < N; i += 2) {
    let best = 0, bestC = -2;
    for (let s = -SEC / 2; s < SEC / 2; s++) {
      const c = corrAtShift(profs[i], profs[i + LAG], s);
      if (c > bestC) { bestC = c; best = s; }
    }
    shifts.push(best); corrs.push(bestC);
  }
  const medShift = shifts.sort((x, y) => x - y)[Math.floor(shifts.length / 2)];
  const meanCorr = corrs.reduce((s, v) => s + v, 0) / corrs.length;
  const degPerSec = (medShift * (360 / SEC)) / (LAG * DT);
  console.log(`lag ${(LAG * DT * 1000).toFixed(0)}ms: median shift ${medShift} sectors (${degPerSec.toFixed(1)} deg/s), mean peak corr ${meanCorr.toFixed(2)}`);
}

// decorrelation time: zero-shift correlation vs lag
let line = 'zero-shift corr by lag(ms):';
for (const LAG of [1, 2, 4, 6, 9, 12, 18, 24]) {
  if (LAG >= N) break;
  let cs = [];
  for (let i = 0; i + LAG < N; i += 3) cs.push(corrAtShift(profs[i], profs[i + LAG], 0));
  line += ` ${(LAG * DT * 1000).toFixed(0)}:${(cs.reduce((s, v) => s + v, 0) / cs.length).toFixed(2)}`;
}
console.log(line);
