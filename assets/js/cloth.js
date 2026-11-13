// Verlet cloth with breakable yarns + procedural denim textures (three.js).
import * as THREE from '../vendor/three.module.min.js';
export { THREE };

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * 3/1 twill denim drawn yarn by yarn: indigo warp floats over three ecru wefts, giving the diagonal rib.
 * Returns a colour map and a normal map derived from the yarn height field. back = pale reverse side.
 */
export function denim(back = false) {
  const S = 1024, N = 64, cs = S / N;
  const img = new ImageData(S, S), nrm = new ImageData(S, S), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = Math.floor(x / cs), j = Math.floor(y / cs), u = x / cs - i, v = y / cs - j;
    let warpUp = ((i + j) & 3) !== 0;
    if (back) warpUp = ((i - j) & 3) === 0;
    const pw = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), pf = Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2));
    const fuzz = (hash(x, y) - 0.5) * 0.09;
    let h, r, g, b;
    if (warpUp) {
      const tone = 0.8 + 0.4 * hash(i, 7) + 0.12 * Math.sin(y * 0.021 + hash(i, 3) * 40); // uneven ring-dyed yarn
      const twist = 0.88 + 0.12 * Math.sin((u * 2 + v * 5) * 6.283);
      const sh = (0.3 + 0.7 * pw) * twist * tone + fuzz;
      h = 0.5 + 0.5 * pw;
      r = 36 * sh; g = 48 * sh; b = 104 * sh;
    } else {
      const tone = 0.9 + 0.2 * hash(j, 11), twist = 0.92 + 0.08 * Math.sin((v * 2 + u * 5) * 6.283);
      const sh = (0.4 + 0.6 * pf) * tone * twist + fuzz;
      h = 0.2 + 0.4 * pf;
      r = 168 * sh; g = 172 * sh; b = 186 * sh;
    }
    const o = (y * S + x) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    hgt[y * S + x] = h;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xm = (x + S - 1) % S, xp = (x + 1) % S, ym = (y + S - 1) % S, yp = (y + 1) % S;
    const dx = (hgt[y * S + xp] - hgt[y * S + xm]) * 2.6, dy = (hgt[yp * S + x] - hgt[ym * S + x]) * 2.6;
    const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    nrm.data[o] = (-dx / l * 0.5 + 0.5) * 255; nrm.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; nrm.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; nrm.data[o + 3] = 255;
  }
  const tex = (data, srgb) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.getContext('2d').putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(img, true), normalMap: tex(nrm, false) };
}

export class Cloth {
  /** cols × rows particles over width × height world units; pin(i, j) marks clamped particles. */
  constructor({ cols, rows, width, height, pin, yarn = 0.0115 }) {
    Object.assign(this, { cols, rows, width, height });
    const N = cols * rows;
    this.pos = new Float32Array(N * 3); this.prev = new Float32Array(N * 3); this.home = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    const uv = new Float32Array(N * 2);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      this.home.set([(i / (cols - 1) - 0.5) * width, (0.5 - j / (rows - 1)) * height, 0], k * 3);
      // warp yarns run along the pull direction (world x), so texture v follows x
      uv[k * 2] = j / (rows - 1) * height / (yarn * 64); uv[k * 2 + 1] = i / (cols - 1) * width / (yarn * 64);
      if (pin(i, j)) this.pinned[k] = 1;
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
    this.quadAlive = new Uint8Array((cols - 1) * (rows - 1));
    for (let c = 0; c < A.length; c++) {
      const a = A[c] * 3, b = B[c] * 3;
      this.rest[c] = Math.hypot(this.home[a] - this.home[b], this.home[a + 1] - this.home[b + 1]);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.reset();
  }

  reset() {
    this.pos.set(this.home); this.prev.set(this.home);
    // a whisper of unevenness so slack fabric buckles into folds instead of staying perfectly flat
    for (let k = 0; k < this.pos.length / 3; k++) {
      const z = (hash(k, 1) - 0.5) * 0.012 + Math.sin(this.home[k * 3] * 5) * 0.02;
      this.pos[k * 3 + 2] = z; this.prev[k * 3 + 2] = z;
    }
    this.alive.fill(1); this.quadAlive.fill(1); this.broken = 0; this.time = 0; this.dirty = true;
  }

  breakYarn(c) {
    if (c < 0 || !this.alive[c]) return;
    this.alive[c] = 0; this.broken++;
    for (const q of [this.q1[c], this.q2[c]]) {
      if (q < 0 || !this.quadAlive[q]) continue;
      this.quadAlive[q] = 0; this.alive[this.quadShear[q * 2]] = 0; this.alive[this.quadShear[q * 2 + 1]] = 0;
    }
    this.dirty = true;
  }

  /** Stretch or relax the whole sheet along x at once, so strain is shared by every yarn. */
  scaleX(f) {
    for (let k = 0; k < this.pos.length; k += 3) { this.pos[k] *= f; this.prev[k] *= f; }
  }

  step(dt, gravity, wind) {
    const { pos, prev, pinned, a, b, rest, alive, nStruct } = this;
    this.time += dt;
    const g = gravity * dt * dt, w = wind * dt * dt, t = this.time, n = pos.length / 3;
    for (let k = 0; k < n; k++) {
      if (pinned[k]) continue;
      const o = k * 3, x = pos[o], y = pos[o + 1], z = pos[o + 2];
      const gust = w * (Math.sin(t * 1.1 + x * 1.7 + y * 2.3) + 0.6 * Math.sin(t * 2.3 - x * 3.1));
      pos[o] = x + (x - prev[o]) * 0.985;
      pos[o + 1] = y + (y - prev[o + 1]) * 0.985 + g;
      pos[o + 2] = z + (z - prev[o + 2]) * 0.985 + gust;
      prev[o] = x; prev[o + 1] = y; prev[o + 2] = z;
    }
    for (let it = 0; it < 8; it++) {
      for (let c = 0; c < a.length; c++) {
        if (!alive[c]) continue;
        const ia = a[c], ib = b[c], ao = ia * 3, bo = ib * 3;
        const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const pa = pinned[ia], pb = pinned[ib];
        if (pa && pb) continue;
        const f = (d - rest[c]) / d * (c < nStruct ? 1 : 0.3);
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        pos[ao] += dx * f * wa; pos[ao + 1] += dy * f * wa; pos[ao + 2] += dz * f * wa;
        pos[bo] -= dx * f * wb; pos[bo + 1] -= dy * f * wb; pos[bo + 2] -= dz * f * wb;
      }
    }
  }

  update() {
    if (this.dirty) {
      const idx = [], c = this.cols;
      for (let q = 0; q < this.quadAlive.length; q++) {
        if (!this.quadAlive[q]) continue;
        const i = q % (c - 1), j = (q - i) / (c - 1), k = j * c + i;
        idx.push(k, k + c, k + 1, k + 1, k + c, k + c + 1);
      }
      this.geometry.setIndex(idx); this.dirty = false;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
