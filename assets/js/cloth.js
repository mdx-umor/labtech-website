// Verlet cloth with tearable yarns, rendered with three.js.
import * as THREE from '../vendor/three.module.min.js';
export { THREE };

const shade = (hex, f) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
};

// Is the warp (vertical) yarn on top at crossing (i, j)?
const WEAVES = {
  plain: { n: 16, over: (i, j) => (i + j) % 2 === 0 },
  twill: { n: 15, over: (i, j) => ((i - j) % 3 + 3) % 3 !== 0 },
  satin: { n: 15, over: (i, j) => (i * 2 + j) % 5 !== 0 },
};

/** Draws a real interlacing diagram of the chosen weave and returns it as a texture. */
export function weaveTexture(type = 'plain', warp = '#3148e0', weft = '#efe9da') {
  const { n, over } = WEAVES[type] || WEAVES.plain;
  const size = 512, cell = size / n, gap = cell * 0.1;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#0b1026';
  g.fillRect(0, 0, size, size);
  const yarn = (x, y, w, h, vertical, col) => {
    const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, shade(col, 0.55));
    gr.addColorStop(0.45, col);
    gr.addColorStop(1, shade(col, 0.6));
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * cell, y = j * cell;
      if (over(i, j)) {
        yarn(x, y + gap, cell, cell - 2 * gap, false, shade(weft, 0.7));
        yarn(x + gap, y - 1, cell - 2 * gap, cell + 2, true, warp);
      } else {
        yarn(x + gap, y, cell - 2 * gap, cell, true, shade(warp, 0.7));
        yarn(x - 1, y + gap, cell + 2, cell - 2 * gap, false, weft);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Cloth {
  /**
   * cols/rows: particles per side. width/height: world units.
   * pin(i, j): true for clamped particles. tear: yarn breaks when stretched past rest × tear.
   */
  constructor({ cols, rows, width, height, pin, tear = Infinity, texture, repeat = [3, 3], gravity = -5 }) {
    Object.assign(this, { cols, rows, width, height, tear, gravity });
    const N = cols * rows;
    this.pos = new Float32Array(N * 3);
    this.prev = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    this.home = new Float32Array(N * 3);
    const uv = new Float32Array(N * 2);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = (i / (cols - 1) - 0.5) * width, y = (0.5 - j / (rows - 1)) * height;
      this.home.set([x, y, 0], k * 3);
      uv[k * 2] = i / (cols - 1) * repeat[0];
      uv[k * 2 + 1] = (1 - j / (rows - 1)) * repeat[1];
      if (pin && pin(i, j)) this.pinned[k] = 1;
    }

    // Constraints: structural (yarns) first, then shear.
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
    this.a = Int32Array.from(A); this.b = Int32Array.from(B);
    this.q1 = Int32Array.from(Q1); this.q2 = Int32Array.from(Q2);
    this.rest = new Float32Array(A.length);
    this.alive = new Uint8Array(A.length);
    this.over = new Uint8Array(A.length);
    this.quadAlive = new Uint8Array((cols - 1) * (rows - 1));

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.grabbed = [];
    this.reset();
  }

  reset() {
    this.pos.set(this.home); this.prev.set(this.home);
    for (let c = 0; c < this.a.length; c++) {
      const a = this.a[c] * 3, b = this.b[c] * 3;
      this.rest[c] = Math.hypot(this.home[a] - this.home[b], this.home[a + 1] - this.home[b + 1]);
    }
    this.alive.fill(1); this.quadAlive.fill(1); this.over.fill(0);
    this.broken = 0; this.strain = 0; this.time = 0; this.grabbed = [];
    this.dirty = true;
  }

  setTexture(tex) { this.material.map?.dispose(); this.material.map = tex; this.material.needsUpdate = true; }

  killQuad(q) {
    if (q < 0 || !this.quadAlive[q]) return;
    this.quadAlive[q] = 0;
    this.alive[this.quadShear[q * 2]] = 0; this.alive[this.quadShear[q * 2 + 1]] = 0;
    this.dirty = true;
  }

  breakYarn(c) {
    if (!this.alive[c]) return;
    this.alive[c] = 0; this.broken++;
    this.killQuad(this.q1[c]); this.killQuad(this.q2[c]);
  }

  /** Cut all warp yarns along a ragged line near row j (used when a specimen ruptures). */
  rupture(j) {
    // deterministic zig-zag so the same specimen always breaks the same way
    const at = (i) => Math.max(2, Math.min(this.rows - 4, j + Math.round(Math.sin(i * 1.9) * 1.6 + Math.sin(i * 0.7) * 1.2)));
    for (let i = 0; i < this.cols; i++) {
      const r = at(i);
      this.breakYarn(this.vIdx[r * this.cols + i]);
      if (i === this.cols - 1) break;
      // weft yarns that bridge the step between neighbouring columns
      const r2 = at(i + 1);
      for (let y = Math.min(r, r2) + 1; y <= Math.max(r, r2); y++) this.breakYarn(this.hIdx[y * this.cols + i]);
    }
  }

  grab(index, radius = 1) {
    this.grabbed = [];
    const ci = index % this.cols, cj = (index - ci) / this.cols;
    for (let dj = -radius; dj <= radius; dj++) for (let di = -radius; di <= radius; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
      const k = j * this.cols + i;
      if (this.pinned[k]) continue;
      this.grabbed.push({ k, dx: this.pos[k * 3] - this.pos[index * 3], dy: this.pos[k * 3 + 1] - this.pos[index * 3 + 1] });
    }
    this.target = new THREE.Vector3(this.pos[index * 3], this.pos[index * 3 + 1], this.pos[index * 3 + 2]);
  }
  release() { this.grabbed = []; }

  movePinned(k, x, y, z) { this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z; this.prev.set([x, y, z], k * 3); }

  step(dt = 1 / 60, wind = 0) {
    const { pos, prev, pinned } = this;
    this.time += dt;
    const g = this.gravity * dt * dt, damp = 0.985;
    const n = pos.length / 3;
    for (let k = 0; k < n; k++) {
      if (pinned[k]) continue;
      const o = k * 3;
      for (let d = 0; d < 3; d++) {
        const p = pos[o + d];
        let acc = d === 1 ? g : 0;
        if (d === 2 && wind) acc = wind * dt * dt * Math.sin(this.time * 1.3 + pos[o] * 2.1 + pos[o + 1] * 1.4);
        pos[o + d] = p + (p - prev[o + d]) * damp + acc;
        prev[o + d] = p;
      }
    }
    let maxS = 0;
    for (let it = 0; it < 6; it++) {
      for (const gr of this.grabbed) {
        const o = gr.k * 3;
        pos[o] = this.target.x + gr.dx; pos[o + 1] = this.target.y + gr.dy; pos[o + 2] = this.target.z;
      }
      for (let c = 0; c < this.a.length; c++) {
        if (!this.alive[c]) continue;
        const a = this.a[c], b = this.b[c], ao = a * 3, bo = b * 3;
        const dx = pos[bo] - pos[ao], dy = pos[bo + 1] - pos[ao + 1], dz = pos[bo + 2] - pos[ao + 2];
        const dist = Math.hypot(dx, dy, dz) || 1e-6, r = this.rest[c];
        if (it === 5 && c < this.nStruct) {
          const s = dist / r - 1;
          if (s > maxS) maxS = s;
          // a yarn breaks only under sustained overload, not from a one-frame jolt
          if (dist > r * this.tear) { if (++this.over[c] > 8) { this.breakYarn(c); continue; } }
          else this.over[c] = 0;
        }
        const pa = pinned[a] || this.isGrabbed(a), pb = pinned[b] || this.isGrabbed(b);
        if (pa && pb) continue;
        const f = (dist - r) / dist * (c < this.nStruct ? 1 : 0.35);
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        pos[ao] += dx * f * wa; pos[ao + 1] += dy * f * wa; pos[ao + 2] += dz * f * wa;
        pos[bo] -= dx * f * wb; pos[bo + 1] -= dy * f * wb; pos[bo + 2] -= dz * f * wb;
      }
    }
    this.strain = maxS;
  }

  isGrabbed(k) {
    for (const gr of this.grabbed) if (gr.k === k) return true;
    return false;
  }

  /** Push simulation state to the GPU. */
  update() {
    if (this.dirty) {
      const idx = [], c = this.cols;
      for (let q = 0; q < this.quadAlive.length; q++) {
        if (!this.quadAlive[q]) continue;
        const i = q % (c - 1), j = (q - i) / (c - 1), k = j * c + i;
        idx.push(k, k + c, k + 1, k + 1, k + c, k + c + 1);
      }
      this.geometry.setIndex(idx);
      this.dirty = false;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}

/** Shared renderer boilerplate: sizes to the canvas, runs only while visible. */
export function stage(canvas, { fov = 32, z = 6, y = 0 } = {}, onFrame) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 50);
  camera.position.set(0, y, z);
  camera.lookAt(0, y, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 3, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8f9bff, 1.2);
  rim.position.set(-3, -1, -4);
  scene.add(rim);

  const fit = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  let visible = false, raf = 0;
  const loop = () => {
    raf = 0;
    if (!visible) return;
    onFrame();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && canvas.clientWidth > 0;
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }).observe(canvas);
  return { renderer, scene, camera };
}
