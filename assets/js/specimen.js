// Hero: a denim specimen in a tensile rig. Scrolling loads it; past the limit it tears and sheds fibres.
import { THREE, Cloth, denim } from './cloth.js';

const $ = (id) => document.getElementById(id);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);

const COLS = 132, ROWS = 62, W = 3.2, H = 1.5;
const SLACK = 0.968, STRAIN = 0.085;                 // clamp distance: slack start, extra stretch at rupture
const P_TAUT = 0.36, P_TEAR = 0.6, P_BREAK = 0.78;  // scroll milestones
const F_MAX = 912, E_MAX = 18.6;                    // readout at rupture (representative denim strip)

/** Airborne fibres: every fibre follows a closed-form drag + drift path in the vertex shader. */
function fibreSystem(count, points) {
  const per = points ? 1 : 6, n = count * per;
  const geo = new THREE.BufferGeometry();
  const attr = (name, size) => { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const origin = attr('position', 3), vel = attr('aVel', 3), seed = attr('aSeed', 4), local = attr('aLocal', 3), t0 = attr('aT0', 1), col = attr('aCol', 3);
  t0.array.fill(-1e3);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSize: { value: 1 } },
    vertexShader: `
      attribute vec3 aVel, aLocal, aCol; attribute vec4 aSeed; attribute float aT0;
      uniform float uTime, uSize; varying float vA; varying vec3 vC;
      void main() {
        float age = uTime - aT0, life = 5.0 + 5.0 * aSeed.x;
        vec3 p = position + aVel * (1.0 - exp(-1.5 * age)) / 1.5;             // launch, slowed by air drag
        p += vec3(sin(age * 0.6 + aSeed.y * 6.28) * 0.07, -0.05 * age - 0.012 * age * age * aSeed.w, cos(age * 0.5 + aSeed.z * 6.28) * 0.07) * min(age, 3.0);
        float ang = aSeed.y * 6.28 + (3.0 + 7.0 * aSeed.w) * (1.0 - exp(-0.6 * age)) + age * (aSeed.z - 0.5);
        vec3 ax = normalize(aSeed.xyz - 0.5 + 0.001);
        vec3 l = aLocal * cos(ang) + cross(ax, aLocal) * sin(ang) + ax * dot(ax, aLocal) * (1.0 - cos(ang));
        vec4 mv = modelViewMatrix * vec4(p + l, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + aSeed.w) / -mv.z;
        vA = age < 0.0 ? 0.0 : smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(life * 0.55, life, age));
        vC = aCol;
      }`,
    fragmentShader: points
      ? `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC, vA * 0.35 * smoothstep(0.5, 0.1, d)); }`
      : `varying float vA; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, vA * 0.75); }`,
  });
  const obj = points ? new THREE.Points(geo, mat) : new THREE.LineSegments(geo, mat);
  obj.frustumCulled = false;
  const tones = [[0.07, 0.1, 0.36], [0.16, 0.22, 0.55], [0.5, 0.62, 0.84], [0.5, 0.5, 0.49], [0.78, 0.76, 0.7]];
  let next = 0;
  /** Launch k fibres from (x, y, z) at time now; power scales the burst. */
  obj.emit = (k, x, y, z, now, power) => {
    for (let f = 0; f < k; f++) {
      const id = next; next = (next + 1) % count;
      const R = Math.random, th = R() * 6.283, ph = Math.acos(2 * R() - 1), sp = power * (0.1 + 1.3 * R() * R());
      const v = [Math.sin(ph) * Math.cos(th) * sp * 1.7, Math.cos(ph) * sp + 0.1 * power, Math.sin(ph) * Math.sin(th) * sp * 0.8 + 0.3 * power];
      const sd = [R(), R(), R(), R()], c = tones[Math.floor(R() * tones.length)], len = 0.004 + R() * R() * 0.026;
      const jx = (R() - 0.5) * 0.06, jy = (R() - 0.5) * 0.06;
      const bend = [(R() - 0.5) * len, (R() - 0.5) * len, (R() - 0.5) * len];
      // a fibre is a bent filament of three short segments
      const pts = [[-len, 0, 0], [-len / 3 + bend[0], bend[1], bend[2]], [len / 3 - bend[0], -bend[1], bend[0]], [len, bend[2], -bend[1]]];
      for (let s = 0; s < per; s++) {
        const o = id * per + s, pt = points ? [0, 0, 0] : pts[Math.floor((s + 1) / 2)];
        origin.setXYZ(o, x + jx, y + jy, z); vel.setXYZ(o, v[0], v[1], v[2]);
        seed.setXYZW(o, sd[0], sd[1], sd[2], sd[3]); local.setXYZ(o, pt[0], pt[1], pt[2]); t0.setX(o, now); col.setXYZ(o, c[0], c[1], c[2]);
      }
    }
    for (const a of [origin, vel, seed, local, t0, col]) a.needsUpdate = true;
  };
  return obj;
}

export function initSpecimen() {
  const stage = $('stage'), canvas = $('cloth');
  if (!stage || !canvas) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
  catch (e) { stage.classList.add('no-webgl'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);

  // A soft studio to reflect in the steel and light the fabric
  const studio = new THREE.Scene();
  studio.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ color: 0xc9cdd8, side: THREE.BackSide })));
  for (const [x, y, z, s, c] of [[0, 7, 2, 7, 0xffffff], [-8, 1, 3, 4, 0xdfe7ff], [8, 0, -2, 4, 0xfff4e6], [0, -8, 0, 6, 0x555a70]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); studio.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, 0.04).texture;
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(-2.5, 4, 6); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 14; key.shadow.blurSamples = 20; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 1, far: 16 });
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9aa0b8, 0.5));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.ShadowMaterial({ opacity: 0.1, color: 0x01064a }));
  wall.position.z = -1.6; wall.receiveShadow = true; scene.add(wall);

  // Fabric: indigo face, pale reverse
  const cloth = new Cloth({ cols: COLS, rows: ROWS, width: W, height: H, pin: (i) => i < 2 || i > COLS - 3 });
  const fabric = (tex, side) => new THREE.MeshPhysicalMaterial({ ...tex, side, roughness: 0.95, metalness: 0, envMapIntensity: 0.55, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xa9b6d6), normalScale: new THREE.Vector2(1.6, 1.6) });
  const rig = new THREE.Group(); scene.add(rig);
  for (const m of [fabric(denim(false), THREE.FrontSide), fabric(denim(true), THREE.BackSide)]) {
    const mesh = new THREE.Mesh(cloth.geometry, m);
    mesh.castShadow = true; mesh.frustumCulled = false; rig.add(mesh);
  }

  // Clamps
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bdc9, metalness: 1, roughness: 0.28 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2f52, metalness: 1, roughness: 0.35 });
  const jaws = [-1, 1].map((s) => {
    const g = new THREE.Group();
    for (const z of [-0.045, 0.045]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, H + 0.16, 0.05), steel);
      plate.position.set(s * 0.07, 0, z); plate.castShadow = true; g.add(plate);
    }
    for (const y of [-0.6, -0.2, 0.2, 0.6]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.17, 6), dark);
      bolt.rotation.x = Math.PI / 2; bolt.position.set(s * 0.07, y, 0); g.add(bolt);
    }
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.2), steel);
    yoke.position.set(s * 0.21, 0, 0); yoke.castShadow = true; g.add(yoke);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 8, 20), steel);
    rod.rotation.z = Math.PI / 2; rod.position.set(s * 4.25, 0, 0); rod.castShadow = true; g.add(rod);
    rig.add(g); return g;
  });

  // Frayed yarn ends hanging from the torn edge
  const MAXT = ROWS * 6, frayPos = new Float32Array(MAXT * 6), frayCol = new Float32Array(MAXT * 6);
  const frayGeo = new THREE.BufferGeometry();
  frayGeo.setAttribute('position', new THREE.BufferAttribute(frayPos, 3));
  frayGeo.setAttribute('color', new THREE.BufferAttribute(frayCol, 3));
  frayGeo.setDrawRange(0, 0);
  const frayLines = new THREE.LineSegments(frayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  frayLines.frustumCulled = false; rig.add(frayLines);
  let threads = [];

  const fibres = fibreSystem(9000, false), lint = fibreSystem(1400, true);
  rig.add(fibres, lint);

  // Ragged rupture line: column of the break in each row (fixed, so every visitor sees the same tear)
  const cutCol = (j) => Math.round(COLS / 2 + 5 * Math.sin(j * 0.31) + 2.5 * Math.sin(j * 1.3 + 1) + 1.5 * Math.sin(j * 2.9));
  let sep = W * SLACK, cut = 0, broken = false, p = 0, target = 0, clock = 0;
  cloth.scaleX(SLACK);

  function cutRow(j) {
    const c = cutCol(j);
    cloth.breakYarn(cloth.hIdx[j * COLS + c]);
    if (j > 0) {
      const c0 = cutCol(j - 1);
      for (let x = Math.min(c, c0) + 1; x <= Math.max(c, c0); x++) cloth.breakYarn(cloth.vIdx[(j - 1) * COLS + x]);
    }
    const o = (j * COLS + c) * 3, x = cloth.pos[o], y = cloth.pos[o + 1], z = cloth.pos[o + 2];
    for (const k of [j * COLS + c, j * COLS + c + 1]) for (let n = 0; n < 3 && threads.length < MAXT; n++) {
      const len = 0.015 + Math.random() * Math.random() * 0.16, pale = Math.random() < 0.45;
      threads.push({ k, len, x: cloth.pos[k * 3], y: cloth.pos[k * 3 + 1] - len, z: cloth.pos[k * 3 + 2], px: cloth.pos[k * 3], py: cloth.pos[k * 3 + 1], pz: cloth.pos[k * 3 + 2] });
      const t = threads.length - 1, col = pale ? [0.86, 0.84, 0.78] : [0.1, 0.15, 0.45];
      frayCol.set([...col, ...col], t * 6);
    }
    frayGeo.attributes.color.needsUpdate = true;
    return [x, y, z];
  }

  function reset() {
    cloth.reset(); cloth.scaleX(sep / W);
    cut = 0; broken = false; threads = []; frayGeo.setDrawRange(0, 0);
    stage.classList.remove('is-broken');
  }

  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(canvas); layout();

  const curve = $('gCurve'), captions = [...stage.querySelectorAll('.cap')];
  function hud(t, tension) {
    const f = broken ? 0 : F_MAX * Math.pow(tension, 1.35), e = E_MAX * tension;
    $('gForce').textContent = Math.round(f).toString().padStart(3, '0');
    $('gElong').textContent = e.toFixed(1);
    $('gState').textContent = broken ? `Rupture · ${F_MAX} N at ${E_MAX} %` : cut ? 'Yarns failing' : tension > 0 ? 'Under load' : p > 0.02 ? 'Taking up slack' : 'Specimen clamped';
    let d = 'M0 60';
    for (let s = 0; s <= 40; s++) { const q = s / 40 * (broken ? 1 : tension); d += `L${(q * 150).toFixed(1)} ${(60 - 56 * Math.pow(q, 1.35)).toFixed(1)}`; }
    curve.setAttribute('d', broken ? d + 'L150 60' : d);
    const stageNo = broken ? 3 : p > 0.52 ? 2 : p > 0.16 ? 1 : 0;
    captions.forEach((c, i) => c.classList.toggle('is-on', i === stageNo));
    stage.style.setProperty('--p', p.toFixed(3));
  }

  let visible = true, mx = 0, my = 0, first = true, lastT = performance.now();
  const goal = new THREE.Vector3();
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  const onScroll = () => {
    const r = stage.getBoundingClientRect();
    target = clamp01(-r.top / (r.height - innerHeight));
    visible = r.bottom > 0 && r.top < innerHeight;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // one fixed physics step (60 Hz), independent of display frame rate
  function tick() {
    const dt = 1 / 60; clock += dt;
    p += (target - p) * 0.1;
    if (p < 0.04 && (cut || broken)) reset();   // scrolled back to the top: mount a fresh specimen

    const tension = clamp01((p - P_TAUT) / (P_BREAK - P_TAUT));
    const want = W * (p < P_TAUT ? SLACK + (1 - SLACK) * ease(p / P_TAUT) : 1 + STRAIN * tension + (broken ? 0.16 : 0));
    if (Math.abs(want - sep) > 1e-5) {
      if (!cut) cloth.scaleX(want / sep);
      sep = want;
    }
    for (let j = 0; j < ROWS; j++) for (const [i, s] of [[0, -1], [1, -1], [COLS - 2, 1], [COLS - 1, 1]]) {
      const k = j * COLS + i, o = k * 3, x = s * sep / 2 + (cloth.home[o] - s * W / 2);
      cloth.pos[o] = cloth.prev[o] = x; cloth.pos[o + 1] = cloth.prev[o + 1] = cloth.home[o + 1]; cloth.pos[o + 2] = cloth.prev[o + 2] = 0;
    }
    jaws[0].position.x = -sep / 2 - 0.03; jaws[1].position.x = sep / 2 + 0.03;

    // tear grows from the top edge with scroll, then lets go all at once
    if (!broken && p > P_TEAR) {
      const goal = p >= P_BREAK ? ROWS : Math.floor(ROWS * 0.34 * (p - P_TEAR) / (P_BREAK - P_TEAR));
      while (cut < goal) {
        const [x, y, z] = cutRow(cut++);
        const all = goal === ROWS;
        fibres.emit(all ? 120 : 45, x, y, z, clock, all ? 2.6 : 0.8); lint.emit(all ? 18 : 6, x, y, z, clock, all ? 2 : 0.6);
      }
      if (cut >= ROWS) { broken = true; stage.classList.add('is-broken'); }
    }

    const slack = 1 - ease(clamp01(p / P_TAUT));
    cloth.step(dt, -4.2, broken ? 1.4 : 0.5 + 2.2 * slack);
    // Yarns barely stretch: no point may be further from its clamp than the yarn between them allows.
    // (Each side of the tear keeps only the clamp it is still attached to.)
    const lim = W / (COLS - 1) * Math.max(1, sep / W), P = cloth.pos;
    for (let j = 0; j < ROWS; j++) {
      const c = j < cut ? cutCol(j) : -1, L = (j * COLS + 1) * 3, R = (j * COLS + COLS - 2) * 3;
      for (let i = 2; i < COLS - 2; i++) {
        const o = (j * COLS + i) * 3;
        for (const [a, n, on] of [[L, i - 1, c < 0 || i <= c], [R, COLS - 2 - i, c < 0 || i > c]]) {
          if (!on) continue;
          const dx = P[o] - P[a], dy = P[o + 1] - P[a + 1], dz = P[o + 2] - P[a + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz), m = n * lim;
          if (d > m) { const f = m / d; P[o] = P[a] + dx * f; P[o + 1] = P[a + 1] + dy * f; P[o + 2] = P[a + 2] + dz * f; }
        }
      }
    }
    if (tension > 0.5 && !broken) { // taut yarns hum
      const amp = 0.0016 * tension;
      for (let k = 0; k < cloth.pos.length; k += 3) cloth.pos[k + 2] += (Math.random() - 0.5) * amp;
    }

    // loose yarn ends: one verlet point each, tethered to the torn edge
    threads.forEach((t, n) => {
      const o = t.k * 3, ax = cloth.pos[o], ay = cloth.pos[o + 1], az = cloth.pos[o + 2];
      const vx = (t.x - t.px) * 0.94, vy = (t.y - t.py) * 0.94, vz = (t.z - t.pz) * 0.94;
      t.px = t.x; t.py = t.y; t.pz = t.z;
      t.x += vx + Math.sin(clock * 2 + n) * 0.0004; t.y += vy - 0.0011; t.z += vz;
      const dx = t.x - ax, dy = t.y - ay, dz = t.z - az, d = Math.hypot(dx, dy, dz) || 1e-6, f = t.len / d;
      t.x = ax + dx * f; t.y = ay + dy * f; t.z = az + dz * f;
      frayPos.set([ax, ay, az, t.x, t.y, t.z], n * 6);
    });
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden || document.documentElement.classList.contains('is-intro')) return;
    const now = performance.now(), steps = Math.max(1, Math.min(4, Math.round((now - lastT) / 16.7))); lastT = now;
    for (let n = 0; n < steps; n++) tick();
    cloth.update();
    frayGeo.setDrawRange(0, threads.length * 2); frayGeo.attributes.position.needsUpdate = true;
    fibres.material.uniforms.uTime.value = lint.material.uniforms.uTime.value = clock;
    lint.material.uniforms.uSize.value = canvas.clientHeight * 0.045 * renderer.getPixelRatio();
    const tension = clamp01((p - P_TAUT) / (P_BREAK - P_TAUT));

    // frame the rig in the upper part of the screen; drift closer as the load rises
    const tan = Math.tan(camera.fov * Math.PI / 360), portrait = camera.aspect < 0.9;
    const needW = portrait ? 4.4 : 6.9, needH = portrait ? 2 : 4.3;
    const z = Math.max(needW / (2 * tan * camera.aspect), needH / (2 * tan)) * (1 - 0.16 * ease(tension) + (broken ? 0.06 : 0));
    const cy = -(portrait ? 0.27 : 0.2) * z * tan * 2;
    goal.set(mx * 0.4, cy - my * 0.25, z);
    if (first) { camera.position.copy(goal); first = false; } else camera.position.lerp(goal, 0.06);
    camera.lookAt(0, cy, 0);

    hud(p, tension);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
