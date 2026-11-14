// Hero: a denim specimen in a tensile rig. Scrolling loads it; past the limit it tears and sheds fibres.
// Physics runs in a Web Worker (sim-worker.js); this file only draws what the worker reports.
import * as THREE from '../vendor/three.module.min.js';
import { Specimen, denimPixels, W, H, P_TAUT, P_BREAK } from './sim.js?v=6';

const $ = (id) => document.getElementById(id);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t * t * (3 - 2 * t);
const F_MAX = 912, E_MAX = 18.6;                    // readout at rupture (representative denim strip)

/** Airborne fibres: every fibre follows a closed-form drag + drift path in the vertex shader. */
function fibreSystem(count, points) {
  const per = points ? 1 : 6, n = count * per;
  const geo = new THREE.BufferGeometry();
  const attr = (name, size) => { const a = new THREE.BufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
  const origin = attr('position', 3), vel = attr('aVel', 3), seed = attr('aSeed', 4), local = attr('aLocal', 3), t0 = attr('aT0', 1), col = attr('aCol', 3);
  const all = [origin, vel, seed, local, t0, col];
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
  let next = 0, lo = Infinity, hi = -1;
  /** Launch k fibres from (x, y, z) at time now; power scales the burst. */
  obj.emit = (k, x, y, z, now, power) => {
    for (let f = 0; f < k; f++) {
      const id = next; next = (next + 1) % count;
      lo = Math.min(lo, id); hi = Math.max(hi, id);
      const R = Math.random, th = R() * 6.283, ph = Math.acos(2 * R() - 1), sp = power * (0.1 + 1.3 * R() * R());
      const vx = Math.sin(ph) * Math.cos(th) * sp * 1.7, vy = Math.cos(ph) * sp + 0.1 * power, vz = Math.sin(ph) * Math.sin(th) * sp * 0.8 + 0.3 * power;
      const s0 = R(), s1 = R(), s2 = R(), s3 = R(), c = tones[Math.floor(R() * tones.length)], len = 0.004 + R() * R() * 0.026;
      const jx = (R() - 0.5) * 0.06, jy = (R() - 0.5) * 0.06;
      const b0 = (R() - 0.5) * len, b1 = (R() - 0.5) * len, b2 = (R() - 0.5) * len;
      // a fibre is a bent filament of three short segments
      const pts = [-len, 0, 0, -len / 3 + b0, b1, b2, len / 3 - b0, -b1, b0, len, b2, -b1];
      for (let s = 0; s < per; s++) {
        const o = id * per + s, m = points ? -1 : Math.floor((s + 1) / 2) * 3;
        origin.setXYZ(o, x + jx, y + jy, z); vel.setXYZ(o, vx, vy, vz);
        seed.setXYZW(o, s0, s1, s2, s3); t0.setX(o, now); col.setXYZ(o, c[0], c[1], c[2]);
        local.setXYZ(o, m < 0 ? 0 : pts[m], m < 0 ? 0 : pts[m + 1], m < 0 ? 0 : pts[m + 2]);
      }
    }
  };
  /** Upload only the slots written since the last frame. */
  obj.flush = () => {
    if (hi < 0) return;
    for (const a of all) {
      a.clearUpdateRanges();
      a.addUpdateRange(lo * per * a.itemSize, (hi - lo + 1) * per * a.itemSize);
      a.needsUpdate = true;
    }
    lo = Infinity; hi = -1;
  };
  return obj;
}

function dataTexture(pixels, srgb) {
  const t = new THREE.DataTexture(pixels.col ?? pixels, pixels.size, pixels.size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

export function initSpecimen() {
  const stage = $('stage'), canvas = $('cloth');
  if (!stage || !canvas) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); }
  catch (e) { stage.classList.add('no-webgl'); return; }

  // Resolution and pixel density scale with the device; density drops further if frames run long.
  const small = innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
  const COLS = small ? 80 : 104, ROWS = small ? 38 : 48, N = COLS * ROWS;
  let dpr = Math.min(devicePixelRatio, small ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 3, bottom: -3, near: 1, far: 16 });
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9aa0b8, 0.5));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.ShadowMaterial({ opacity: 0.1, color: 0x01064a }));
  wall.position.z = -1.6; wall.receiveShadow = true; scene.add(wall);

  // Fabric geometry: positions and normals arrive from the simulation each frame
  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const nrmAttr = new THREE.BufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr); geometry.setAttribute('normal', nrmAttr);
  const rig = new THREE.Group(); scene.add(rig);
  const fabric = (side) => new THREE.MeshStandardMaterial({ side, roughness: 0.95, metalness: 0, envMapIntensity: 0.55, normalScale: new THREE.Vector2(1.6, 1.6) });
  const faceMat = fabric(THREE.FrontSide), backMat = fabric(THREE.BackSide);
  for (const m of [faceMat, backMat]) {
    const mesh = new THREE.Mesh(geometry, m);
    mesh.castShadow = true; mesh.frustumCulled = false; mesh.visible = false; rig.add(mesh);
  }
  const showFabric = (face, back) => {
    faceMat.map = dataTexture(face, true); faceMat.normalMap = dataTexture({ col: face.nrm, size: face.size }, false);
    backMat.map = dataTexture(back, true); backMat.normalMap = dataTexture({ col: back.nrm, size: back.size }, false);
    faceMat.needsUpdate = backMat.needsUpdate = true;
    rig.children.forEach((c) => { if (c.isMesh && c.geometry === geometry) c.visible = true; });
    warmUp();
  };
  // Upload textures and compile shaders before the first scroll, not during it. While the intro plays,
  // wait for the logo to dock: that slide runs on the compositor, so a busy main thread cannot stutter it.
  let warmed = false;
  function warmUp() {
    if (warmed || !faceMat.map) return;
    if (document.documentElement.classList.contains('is-intro') && !docking) { addEventListener('intro:docking', warmUp, { once: true }); return; }
    warmed = true;
    for (const t of [faceMat.map, faceMat.normalMap, backMat.map, backMat.normalMap]) renderer.initTexture(t);
    renderer.compile(scene, camera);
  }
  let docking = false;
  addEventListener('intro:docking', () => { docking = true; }, { once: true });

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
    yoke.position.set(s * 0.21, 0, 0); g.add(yoke);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 8, 20), steel);
    rod.rotation.z = Math.PI / 2; rod.position.set(s * 4.25, 0, 0); g.add(rod);
    rig.add(g); return g;
  });

  // Frayed yarn ends hanging from the torn edge
  const maxThreads = ROWS * 6;
  const frayGeo = new THREE.BufferGeometry();
  const frayAttr = new THREE.BufferAttribute(new Float32Array(maxThreads * 6), 3).setUsage(THREE.DynamicDrawUsage);
  const frayColAttr = new THREE.BufferAttribute(new Float32Array(maxThreads * 6), 3);
  frayGeo.setAttribute('position', frayAttr); frayGeo.setAttribute('color', frayColAttr); frayGeo.setDrawRange(0, 0);
  const frayLines = new THREE.LineSegments(frayGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
  frayLines.frustumCulled = false; rig.add(frayLines);

  const fibres = fibreSystem(small ? 4000 : 7000, false), lint = fibreSystem(small ? 600 : 1000, true);
  rig.add(fibres, lint);

  // ── Simulation link: worker when available, same code on this thread otherwise ──
  let state = { p: 0, sep: W * 0.968, cut: 0, broken: false, clock: 0 }, haveFrame = false;
  let spare = { pos: new Float32Array(N * 3), nrm: new Float32Array(N * 3), fray: new Float32Array(maxThreads * 6) };
  let pending = null, target = 0;

  function applyFrame(m) {
    // swap the fresh arrays in; the old ones go back to the simulation for the next frame
    const old = { pos: posAttr.array, nrm: nrmAttr.array, fray: frayAttr.array };
    posAttr.array = m.pos; nrmAttr.array = m.nrm; frayAttr.array = m.fray;
    posAttr.needsUpdate = nrmAttr.needsUpdate = frayAttr.needsUpdate = true;
    if (m.index) geometry.setIndex(new THREE.BufferAttribute(m.index, 1));
    if (m.threadCol) { frayColAttr.array.set(m.threadCol); frayColAttr.needsUpdate = true; }
    frayGeo.setDrawRange(0, m.nThreads * 2);
    for (let i = 0; i < m.emits.length; i += 4) {
      const all = m.emits[i + 3] === 1;
      fibres.emit(all ? 120 : 45, m.emits[i], m.emits[i + 1], m.emits[i + 2], m.clock, all ? 2.6 : 0.8);
      lint.emit(all ? 18 : 6, m.emits[i], m.emits[i + 1], m.emits[i + 2], m.clock, all ? 2 : 0.6);
    }
    fibres.flush(); lint.flush();
    state = m; haveFrame = true;
    return old;
  }

  let worker = null, local = null;
  try {
    worker = new Worker(new URL('./sim-worker.js?v=6', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') geometry.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
      else if (data.type === 'textures') showFabric(data.face, data.back);
      else if (data.type === 'frame') pending = data;
    };
    worker.onerror = () => { worker = null; startLocal(); };
    worker.postMessage({ type: 'init', cols: COLS, rows: ROWS, tex: small ? 512 : 1024 });
  } catch (e) { startLocal(); }

  function startLocal() {
    if (local) return;
    local = new Specimen(COLS, ROWS);
    geometry.setAttribute('uv', new THREE.BufferAttribute(local.uv, 2));
    setTimeout(() => showFabric(denimPixels(false, small ? 512 : 1024), denimPixels(true, small ? 512 : 1024)), 0);
  }

  function tickSim(dt) {
    if (local) {
      const emits = [], alpha = local.advance(target, dt, emits), b = spare;
      local.output(alpha, b.pos, b.nrm, b.fray);
      const m = { ...b, emits, nThreads: local.nThreads, p: local.p, sep: local.sep, cut: local.cut, broken: local.broken, clock: local.clock + alpha / 60 };
      if (local.indexDirty) m.index = local.index();
      if (local.colorsDirty) { m.threadCol = local.threadCol; local.colorsDirty = false; }
      spare = applyFrame(m);
    } else if (worker) {
      if (pending) { spare = applyFrame(pending); pending = null; }
      if (spare) {
        worker.postMessage({ type: 'tick', target, dt, ...spare }, [spare.pos.buffer, spare.nrm.buffer, spare.fray.buffer]);
        spare = null;
      }
    }
  }

  function layout() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(canvas); layout();

  // HUD: touch the DOM only when a shown value actually changes
  const curve = $('gCurve'), captions = [...stage.querySelectorAll('.cap')];
  const els = { force: $('gForce'), elong: $('gElong'), state: $('gState') }, shown = {};
  const put = (k, v) => { if (shown[k] !== v) { shown[k] = v; els[k].textContent = v; } };
  function hud(tension) {
    const { p, broken, cut } = state;
    put('force', Math.round(broken ? 0 : F_MAX * Math.pow(tension, 1.35)).toString().padStart(3, '0'));
    put('elong', (E_MAX * tension).toFixed(1));
    put('state', broken ? `Rupture at ${F_MAX} N, ${E_MAX} %` : cut ? 'Yarns failing' : tension > 0 ? 'Under load' : p > 0.02 ? 'Taking up slack' : 'Specimen clamped');
    const q = broken ? 1 : Math.round(tension * 200) / 200, key = q + (broken ? 'b' : '');
    if (shown.curve !== key) {
      shown.curve = key;
      let d = 'M0 60';
      for (let s = 0; s <= 40; s++) { const x = s / 40 * q; d += `L${(x * 150).toFixed(1)} ${(60 - 56 * Math.pow(x, 1.35)).toFixed(1)}`; }
      curve.setAttribute('d', broken ? d + 'L150 60' : d);
    }
    const stageNo = broken ? 3 : p > 0.52 ? 2 : p > 0.16 ? 1 : 0;
    if (shown.cap !== stageNo) { shown.cap = stageNo; captions.forEach((c, i) => c.classList.toggle('is-on', i === stageNo)); }
    stage.classList.toggle('is-broken', broken);
    const hint = p > 0.12 ? 1 : Math.round(p * 100) / 100;
    if (shown.hint !== hint) { shown.hint = hint; stage.style.setProperty('--p', hint); }
  }

  let visible = true, mx = 0, my = 0, first = true, last = 0, slow = 0;
  const goal = new THREE.Vector3();
  addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  let stageTop = 0, stageH = 1;
  const measure = () => { const r = stage.getBoundingClientRect(); stageTop = r.top + scrollY; stageH = r.height; };
  new ResizeObserver(measure).observe(stage); measure();
  const onScroll = () => {
    const top = stageTop - scrollY;
    target = clamp01(-top / (stageH - innerHeight));
    visible = top + stageH > 0 && top < innerHeight;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60; last = now;
    if (!visible || document.hidden || document.documentElement.classList.contains('is-intro')) return;
    // if frames keep running long, render fewer pixels
    slow = dt > 0.024 ? slow + 1 : Math.max(0, slow - 1);
    if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); layout(); slow = 0; }

    tickSim(dt);
    if (!haveFrame) return;
    fibres.material.uniforms.uTime.value = lint.material.uniforms.uTime.value = state.clock;
    lint.material.uniforms.uSize.value = canvas.clientHeight * 0.045 * dpr;
    jaws[0].position.x = -state.sep / 2 - 0.03; jaws[1].position.x = state.sep / 2 + 0.03;
    const tension = clamp01((state.p - P_TAUT) / (P_BREAK - P_TAUT));

    // frame the rig in the upper part of the screen; drift closer as the load rises
    const tan = Math.tan(camera.fov * Math.PI / 360), portrait = camera.aspect < 0.9;
    const needW = portrait ? 4.4 : 6.9, needH = portrait ? 2 : 4.3;
    const z = Math.max(needW / (2 * tan * camera.aspect), needH / (2 * tan)) * (1 - 0.16 * ease(tension) + (state.broken ? 0.06 : 0));
    const cy = -(portrait ? 0.27 : 0.22) * z * tan * 2;
    goal.set(mx * 0.4, cy - my * 0.25, z);
    const k = 1 - Math.pow(0.0245, dt);             // same easing at any refresh rate
    if (first) { camera.position.copy(goal); first = false; } else camera.position.lerp(goal, k);
    camera.lookAt(0, cy, 0);

    hud(tension);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
