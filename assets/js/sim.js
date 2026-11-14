// The tensile-test simulation, free of DOM and three.js so it can run inside a Web Worker.
// Verlet cloth with breakable yarns, a scripted tear, loose yarn ends and fibre bursts.

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

export const W = 3.2, H = 1.5;
const SLACK = 0.968, STRAIN = 0.085;                 // clamp distance: slack start, extra stretch at rupture
export const P_TAUT = 0.36, P_TEAR = 0.6, P_BREAK = 0.78;  // scroll milestones
const YARN = 0.0115, DT = 1 / 60, ITER = 6;

/**
 * 3/1 twill denim drawn yarn by yarn: indigo warp floats over three ecru wefts, giving the diagonal rib.
 * Returns RGBA colour and normal-map pixels (Uint8Array, size × size). back = pale reverse side.
 */
export function denimPixels(back = false, S = 1024) {
  const N = 64, cs = S / N;
  const col = new Uint8Array(S * S * 4), nrm = new Uint8Array(S * S * 4), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(x / cs), j = Math.floor(y / cs), u = x / cs - i, v = y / cs - j;
    const warpUp = back ? ((i - j) & 3) === 0 : ((i + j) & 3) !== 0;
    const pw = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), pf = Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2));
    const fuzz = (hash(x, y) - 0.5) * 0.09;
    let h, r, g, b;
    if (warpUp) {
      const tone = 0.8 + 0.4 * hash(i, 7) + 0.12 * Math.sin(y * 0.021 + hash(i, 3) * 40); // uneven ring-dyed yarn
      const sh = (0.3 + 0.7 * pw) * (0.88 + 0.12 * Math.sin((u * 2 + v * 5) * 6.283)) * tone + fuzz;
      h = 0.5 + 0.5 * pw; r = 36 * sh; g = 48 * sh; b = 104 * sh;
    } else {
      const sh = (0.4 + 0.6 * pf) * (0.9 + 0.2 * hash(j, 11)) * (0.92 + 0.08 * Math.sin((v * 2 + u * 5) * 6.283)) + fuzz;
      h = 0.2 + 0.4 * pf; r = 168 * sh; g = 172 * sh; b = 186 * sh;
    }
    const o = (y * S + x) * 4;
    col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = 255;
    hgt[y * S + x] = h;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xm = (x + S - 1) % S, xp = (x + 1) % S, ym = (y + S - 1) % S, yp = (y + 1) % S;
    const dx = (hgt[y * S + xp] - hgt[y * S + xm]) * 2.6, dy = (hgt[yp * S + x] - hgt[ym * S + x]) * 2.6;
    const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    nrm[o] = (-dx / l * 0.5 + 0.5) * 255; nrm[o + 1] = (dy / l * 0.5 + 0.5) * 255; nrm[o + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[o + 3] = 255;
  }
  return { col, nrm, size: S };
}

export class Specimen {
  constructor(cols, rows) {
    const N = cols * rows;
    Object.assign(this, { cols, rows, N });
    this.pos = new Float32Array(N * 3); this.prev = new Float32Array(N * 3);
    this.home = new Float32Array(N * 3); this.last = new Float32Array(N * 3); // last = state one step back, for interpolation
    this.pinned = new Uint8Array(N);
    this.uv = new Float32Array(N * 2);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      this.home[k * 3] = (i / (cols - 1) - 0.5) * W; this.home[k * 3 + 1] = (0.5 - j / (rows - 1)) * H;
      // warp yarns run along the pull direction (x), so texture v follows x
      this.uv[k * 2] = j / (rows - 1) * H / (YARN * 64); this.uv[k * 2 + 1] = i / (cols - 1) * W / (YARN * 64);
      if (i < 2 || i > cols - 3) this.pinned[k] = 1;
    }
    const A = [], B = [], Q1 = [], Q2 = [];
    this.hIdx = new Int32Array(N).fill(-1); this.vIdx = new Int32Array(N).fill(-1);
    const quad = (i, j) => (i < 0 || j < 0 || i >= cols - 1 || j >= rows - 1) ? -1 : j * (cols - 1) + i;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      if (i < cols - 1) { this.hIdx[k] = A.length; A.push(k); B.push(k + 1); Q1.push(quad(i, j - 1)); Q2.push(quad(i, j)); }
      if (j < rows - 1) { this.vIdx[k] = A.length; A.push(k); B.push(k + cols); Q1.push(quad(i - 1, j)); Q2.push(quad(i, j)); }
    }
    this.nStruct = A.length;
    this.quadShear = new Int32Array((cols - 1) * (rows - 1) * 2);
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
      const k = j * cols + i, q = quad(i, j);
      this.quadShear[q * 2] = A.length; A.push(k); B.push(k + cols + 1);
      this.quadShear[q * 2 + 1] = A.length; A.push(k + 1); B.push(k + cols);
    }
    this.a = Int32Array.from(A); this.b = Int32Array.from(B); this.q1 = Int32Array.from(Q1); this.q2 = Int32Array.from(Q2);
    this.rest = new Float32Array(A.length); this.alive = new Uint8Array(A.length);
    this.stiff = new Float32Array(A.length);
    for (let c = 0; c < A.length; c++) {
      const a = A[c] * 3, b = B[c] * 3;
      this.rest[c] = Math.hypot(this.home[a] - this.home[b], this.home[a + 1] - this.home[b + 1]);
      this.stiff[c] = c < this.nStruct ? 1 : 0.3;
    }
    this.quadAlive = new Uint8Array((cols - 1) * (rows - 1));
    this.cutCols = new Int32Array(rows);
    for (let j = 0; j < rows; j++) this.cutCols[j] = Math.round(cols / 2 + 5 * Math.sin(j * 0.31 * 62 / rows) + 2.5 * Math.sin(j * 1.3 * 62 / rows + 1) + 1.5 * Math.sin(j * 2.9 * 62 / rows));
    this.maxThreads = rows * 6;
    this.threads = new Float32Array(this.maxThreads * 8); // k, len, x, y, z, px, py, pz
    this.threadCol = new Float32Array(this.maxThreads * 6);
    this.p = 0; this.clock = 0; this.acc = 0;
    this.reset();
  }

  reset() {
    const { pos, prev, home } = this;
    pos.set(home);
    // a whisper of unevenness so slack fabric buckles into folds instead of staying perfectly flat
    for (let k = 0; k < this.N; k++) pos[k * 3 + 2] = (hash(k, 1) - 0.5) * 0.012 + Math.sin(home[k * 3] * 5) * 0.02;
    this.sep = W * SLACK;
    for (let k = 0; k < pos.length; k += 3) pos[k] *= SLACK;
    prev.set(pos); this.last.set(pos);
    this.alive.fill(1); this.quadAlive.fill(1);
    this.cut = 0; this.broken = false; this.nThreads = 0;
    this.indexDirty = true; this.colorsDirty = true;
  }

  breakYarn(c) {
    if (c < 0 || !this.alive[c]) return;
    this.alive[c] = 0;
    for (const q of [this.q1[c], this.q2[c]]) {
      if (q < 0 || !this.quadAlive[q]) continue;
      this.quadAlive[q] = 0; this.alive[this.quadShear[q * 2]] = 0; this.alive[this.quadShear[q * 2 + 1]] = 0;
    }
    this.indexDirty = true;
  }

  cutRow(j, emits) {
    const { cols, pos } = this, c = this.cutCols[j];
    this.breakYarn(this.hIdx[j * cols + c]);
    if (j > 0) {
      const c0 = this.cutCols[j - 1];
      for (let x = Math.min(c, c0) + 1; x <= Math.max(c, c0); x++) this.breakYarn(this.vIdx[(j - 1) * cols + x]);
    }
    for (const k of [j * cols + c, j * cols + c + 1]) for (let n = 0; n < 3 && this.nThreads < this.maxThreads; n++) {
      const len = 0.015 + Math.random() * Math.random() * 0.16, t = this.nThreads++ * 8, o = k * 3;
      this.threads.set([k, len, pos[o], pos[o + 1] - len, pos[o + 2], pos[o], pos[o + 1], pos[o + 2]], t);
      const pale = Math.random() < 0.45, r = pale ? 0.86 : 0.1, g = pale ? 0.84 : 0.15, b = pale ? 0.78 : 0.45;
      this.threadCol.set([r, g, b, r, g, b], (this.nThreads - 1) * 6);
    }
    this.colorsDirty = true;
    const o = (j * cols + c) * 3;
    emits.push(pos[o], pos[o + 1], pos[o + 2]);
  }

  /** One fixed 60 Hz step. emits collects tear positions (x, y, z) that should shed fibres. */
  step(target, emits) {
    const { cols, rows, pos, prev, pinned, a, b, rest, alive, stiff, home } = this;
    this.last.set(pos);
    this.clock += DT;
    this.p += (target - this.p) * 0.16;
    const p = this.p;
    if (p < 0.04 && (this.cut || this.broken)) this.reset();   // scrolled back to the top: mount a fresh specimen

    const tension = clamp01((p - P_TAUT) / (P_BREAK - P_TAUT));
    const want = W * (p < P_TAUT ? SLACK + (1 - SLACK) * ease(p / P_TAUT) : 1 + STRAIN * tension + (this.broken ? 0.16 : 0));
    if (Math.abs(want - this.sep) > 1e-5) {
      if (!this.cut) { const f = want / this.sep; for (let k = 0; k < pos.length; k += 3) { pos[k] *= f; prev[k] *= f; } }
      this.sep = want;
    }
    const sep = this.sep;
    for (let j = 0; j < rows; j++) for (let n = 0; n < 4; n++) {
      const i = n < 2 ? n : cols - 4 + n, s = n < 2 ? -1 : 1, o = (j * cols + i) * 3;
      pos[o] = prev[o] = s * sep / 2 + (home[o] - s * W / 2); pos[o + 1] = prev[o + 1] = home[o + 1]; pos[o + 2] = prev[o + 2] = 0;
    }

    // tear grows from the top edge with scroll, then lets go all at once
    if (!this.broken && p > P_TEAR) {
      const goal = p >= P_BREAK ? rows : Math.floor(rows * 0.34 * (p - P_TEAR) / (P_BREAK - P_TEAR));
      const all = goal === rows;
      while (this.cut < goal) { this.cutRow(this.cut++, emits); emits.push(all ? 1 : 0); }
      if (this.cut >= rows) this.broken = true;
    }

    // integrate
    const slack = 1 - ease(clamp01(p / P_TAUT)), wind = (this.broken ? 1.4 : 0.5 + 2.2 * slack) * DT * DT, g = -4.2 * DT * DT, t = this.clock;
    for (let k = 0; k < this.N; k++) {
      if (pinned[k]) continue;
      const o = k * 3, x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const gust = wind * (Math.sin(t * 1.1 + x * 1.7 + y * 2.3) + 0.6 * Math.sin(t * 2.3 - x * 3.1));
      pos[o] = x + (x - prev[o]) * 0.985; pos[o + 1] = y + (y - prev[o + 1]) * 0.985 + g; pos[o + 2] = z + (z - prev[o + 2]) * 0.985 + gust;
      prev[o] = x; prev[o + 1] = y; prev[o + 2] = z;
    }
    // satisfy yarn lengths
    const nc = a.length;
    for (let it = 0; it < ITER; it++) {
      for (let c = 0; c < nc; c++) {
        if (!alive[c]) continue;
        const ia = a[c], ib = b[c], pa = pinned[ia], pb = pinned[ib];
        if (pa && pb) continue;
        const ao = ia * 3, bo = ib * 3;
        const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const f = (d - rest[c]) / d * stiff[c];
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        pos[ao] += dx * f * wa; pos[ao + 1] += dy * f * wa; pos[ao + 2] += dz * f * wa;
        pos[bo] -= dx * f * wb; pos[bo + 1] -= dy * f * wb; pos[bo + 2] -= dz * f * wb;
      }
    }
    // Yarns barely stretch: no point may be further from its clamp than the yarn between them allows.
    // (Each side of the tear keeps only the clamp it is still attached to.)
    const lim = W / (cols - 1) * Math.max(1, sep / W);
    for (let j = 0; j < rows; j++) {
      const c = j < this.cut ? this.cutCols[j] : -1, L = (j * cols + 1) * 3, R = (j * cols + cols - 2) * 3;
      for (let i = 2; i < cols - 2; i++) {
        const o = (j * cols + i) * 3;
        if (c < 0 || i <= c) this.leash(o, L, (i - 1) * lim);
        if (c < 0 || i > c) this.leash(o, R, (cols - 2 - i) * lim);
      }
    }
    if (tension > 0.5 && !this.broken) { // taut yarns hum
      const amp = 0.0016 * tension;
      for (let k = 2; k < pos.length; k += 3) pos[k] += (Math.random() - 0.5) * amp;
    }
    // loose yarn ends: one verlet point each, tethered to the torn edge
    const th = this.threads;
    for (let n = 0; n < this.nThreads; n++) {
      const q = n * 8, o = th[q] * 3, ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
      const vx = (th[q + 2] - th[q + 5]) * 0.94, vy = (th[q + 3] - th[q + 6]) * 0.94, vz = (th[q + 4] - th[q + 7]) * 0.94;
      th[q + 5] = th[q + 2]; th[q + 6] = th[q + 3]; th[q + 7] = th[q + 4];
      let x = th[q + 2] + vx + Math.sin(t * 2 + n) * 0.0004, y = th[q + 3] + vy - 0.0011, z = th[q + 4] + vz;
      const dx = x - ax, dy = y - ay, dz = z - az, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = th[q + 1] / d;
      th[q + 2] = ax + dx * f; th[q + 3] = ay + dy * f; th[q + 4] = az + dz * f;
    }
  }

  leash(o, a, m) {
    const P = this.pos, dx = P[o] - P[a], dy = P[o + 1] - P[a + 1], dz = P[o + 2] - P[a + 2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 <= m * m) return;
    const f = m / Math.sqrt(d2);
    P[o] = P[a] + dx * f; P[o + 1] = P[a + 1] + dy * f; P[o + 2] = P[a + 2] + dz * f;
  }

  /** Advance by a real time span with a fixed-step accumulator. Returns how far between steps we are. */
  advance(target, elapsed, emits) {
    this.acc = Math.min(this.acc + elapsed, DT * 4);
    while (this.acc >= DT) { this.step(target, emits); this.acc -= DT; }
    return this.acc / DT;
  }

  index() {
    const idx = [], c = this.cols;
    for (let q = 0; q < this.quadAlive.length; q++) {
      if (!this.quadAlive[q]) continue;
      const i = q % (c - 1), j = (q - i) / (c - 1), k = j * c + i;
      idx.push(k, k + c, k + 1, k + 1, k + c, k + c + 1);
    }
    this.indexDirty = false;
    return Uint32Array.from(idx);
  }

  /** Write positions interpolated between the last two steps, their normals and the yarn ends. */
  output(alpha, outPos, outNrm, outFray) {
    const { pos, last, cols } = this;
    for (let i = 0; i < pos.length; i++) outPos[i] = last[i] + (pos[i] - last[i]) * alpha;
    outNrm.fill(0);
    const add = (k, nx, ny, nz) => { outNrm[k * 3] += nx; outNrm[k * 3 + 1] += ny; outNrm[k * 3 + 2] += nz; };
    for (let q = 0; q < this.quadAlive.length; q++) {
      if (!this.quadAlive[q]) continue;
      const i = q % (cols - 1), j = (q - i) / (cols - 1), k0 = j * cols + i, k1 = k0 + 1, k2 = k0 + cols, k3 = k2 + 1;
      // quad normal from its diagonals, shared by both triangles
      const ax = outPos[k3 * 3] - outPos[k0 * 3], ay = outPos[k3 * 3 + 1] - outPos[k0 * 3 + 1], az = outPos[k3 * 3 + 2] - outPos[k0 * 3 + 2];
      const bx = outPos[k1 * 3] - outPos[k2 * 3], by = outPos[k1 * 3 + 1] - outPos[k2 * 3 + 1], bz = outPos[k1 * 3 + 2] - outPos[k2 * 3 + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      add(k0, nx, ny, nz); add(k1, nx, ny, nz); add(k2, nx, ny, nz); add(k3, nx, ny, nz);
    }
    for (let k = 0; k < outNrm.length; k += 3) {
      const l = Math.hypot(outNrm[k], outNrm[k + 1], outNrm[k + 2]) || 1;
      outNrm[k] /= l; outNrm[k + 1] /= l; outNrm[k + 2] /= l;
    }
    const th = this.threads;
    for (let n = 0; n < this.nThreads; n++) {
      const q = n * 8, o = th[q] * 3, f = n * 6;
      outFray[f] = outPos[o]; outFray[f + 1] = outPos[o + 1]; outFray[f + 2] = outPos[o + 2];
      outFray[f + 3] = th[q + 2]; outFray[f + 4] = th[q + 3]; outFray[f + 5] = th[q + 4];
    }
  }
}
