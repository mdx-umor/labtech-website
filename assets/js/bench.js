// Lab bench: tensile tester (three.js cloth), Martindale abrasion, wash fastness.
import { THREE, Cloth, weaveTexture, stage } from './cloth.js';

const $ = (id) => document.getElementById(id);
const C = { ink: '#eef0f8', dim: '#a9b1d1', line: '#2a3566', signal: '#ff7a45', indigo: '#8f9bff', bg: '#0c1330' };

function chips(host, items, onPick) {
  items.forEach((it, n) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip' + (n === 0 ? ' is-on' : ''); b.textContent = it.name;
    b.addEventListener('click', () => {
      host.querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x === b));
      onPick(it);
    });
    host.append(b);
  });
}

/* ───────── Tensile ───────── */
function initTensile() {
  // Simplified, representative behaviour: breaking force (N), elongation at break (%), curve shape.
  const MATS = [
    { name: 'Cotton poplin', F: 420, e: 14, p: 1.25, warp: '#e9e2d0', weft: '#cfc6ad', weave: 'plain' },
    { name: 'Denim', F: 900, e: 20, p: 1.4, warp: '#3148e0', weft: '#efe9da', weave: 'twill' },
    { name: 'Polyester woven', F: 760, e: 30, p: 0.8, warp: '#16a37f', weft: '#0f7a60', weave: 'plain' },
    { name: 'Stretch jersey', F: 260, e: 85, p: 2.6, warp: '#e0486c', weft: '#b8324f', weave: 'satin' },
  ];
  const canvas = $('tensileRig'), chart = $('tensileChart'), g = chart.getContext('2d');
  const COLS = 13, ROWS = 34, W = 0.52, L = 1.0;
  let mat = MATS[0], elong = 0, state = 'ready', curve = [];

  let cloth, ctx;
  try {
    cloth = new Cloth({ cols: COLS, rows: ROWS, width: W, height: L, pin: (i, j) => j === 0 || j === ROWS - 1, texture: weaveTexture(mat.weave, mat.warp, mat.weft), repeat: [0.6, 1.2], gravity: -3 });
    ctx = stage(canvas, { fov: 30, z: 4.5, y: -0.42 }, frame);
  } catch (e) { canvas.replaceWith(Object.assign(document.createElement('p'), { textContent: '3D view needs WebGL', className: 'std' })); }

  let jawB;
  if (ctx) {
    ctx.scene.add(cloth.mesh);
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3c7, metalness: 0.7, roughness: 0.35 });
    const jawT = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.2), steel);
    jawT.position.y = L / 2 + 0.09;
    jawB = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.2), steel);
    const rail = new THREE.MeshStandardMaterial({ color: 0x2a3566, metalness: 0.4, roughness: 0.6 });
    for (const x of [-0.62, 0.62]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 12), rail);
      r.position.set(x, -0.45, -0.1);
      ctx.scene.add(r);
    }
    ctx.scene.add(jawT, jawB);
  }

  const force = (e) => mat.F * Math.pow(Math.min(e / mat.e, 1), mat.p);

  function frame() {
    if (state === 'pulling') {
      elong += mat.e / 240; // ≈4 s to break at 60 fps
      if (elong >= mat.e) {
        elong = mat.e; state = 'broken';
        cloth.rupture(Math.round(ROWS * 0.45));
        $('tStatus').textContent = 'Rupture'; $('tStatus').className = 'is-fail';
        $('tRun').disabled = true; $('tRun').textContent = 'Specimen broken';
      }
      curve.push([elong, force(elong)]);
      readouts();
      drawChart();
    }
    const yB = -L / 2 - (elong / 100) * L;
    for (let i = 0; i < COLS; i++) {
      const k = (ROWS - 1) * COLS + i;
      cloth.movePinned(k, cloth.home[k * 3], yB, 0);
    }
    jawB.position.y = yB - 0.09;
    cloth.step(1 / 60, 0);
    cloth.update();
  }

  function readouts() {
    const f = state === 'broken' ? mat.F : force(elong);
    $('tForce').textContent = Math.round(f) + ' N' + (state === 'broken' ? ' max' : '');
    $('tElong').textContent = elong.toFixed(1) + ' %';
  }

  function drawChart() {
    const w = chart.width, h = chart.height, m = { l: 52, r: 16, t: 16, b: 34 };
    const xMax = Math.ceil(mat.e * 1.25 / 5) * 5, yMax = Math.ceil(mat.F * 1.2 / 100) * 100;
    const X = (v) => m.l + v / xMax * (w - m.l - m.r), Y = (v) => h - m.b - v / yMax * (h - m.t - m.b);
    g.clearRect(0, 0, w, h);
    g.font = '11px JetBrains Mono, monospace'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const yv = yMax * i / 4, xv = xMax * i / 4;
      g.strokeStyle = C.line; g.beginPath(); g.moveTo(m.l, Y(yv)); g.lineTo(w - m.r, Y(yv)); g.stroke();
      g.fillStyle = C.dim; g.textAlign = 'right'; g.fillText(Math.round(yv), m.l - 8, Y(yv) + 4);
      g.textAlign = 'center'; g.fillText(Math.round(xv), X(xv), h - m.b + 16);
    }
    g.textAlign = 'left'; g.fillText('Force (N)', m.l + 6, m.t + 10);
    g.textAlign = 'right'; g.fillText('Elongation (%)', w - m.r, h - 4);
    if (curve.length) {
      g.strokeStyle = C.signal; g.lineWidth = 2.5; g.lineJoin = 'round'; g.beginPath();
      g.moveTo(X(0), Y(0));
      curve.forEach(([e, f]) => g.lineTo(X(e), Y(f)));
      if (state === 'broken') g.lineTo(X(mat.e), Y(0));
      g.stroke();
      const [e, f] = curve[curve.length - 1];
      g.fillStyle = C.ink; g.beginPath(); g.arc(X(e), Y(f), 4.5, 0, 7); g.fill();
      if (state === 'broken') {
        g.fillStyle = C.ink; g.textAlign = 'right';
        g.fillText(`break: ${mat.F} N at ${mat.e} %`, X(e) - 10, Y(f) + 4);
      }
    }
  }

  function reset() {
    elong = 0; state = 'ready'; curve = [];
    cloth?.reset();
    $('tRun').disabled = false; $('tRun').textContent = 'Start pulling';
    $('tStatus').textContent = 'Ready'; $('tStatus').className = '';
    readouts(); drawChart();
  }

  chips($('tensileMats'), MATS, (m) => { mat = m; cloth?.setTexture(weaveTexture(m.weave, m.warp, m.weft)); reset(); });
  $('tRun').addEventListener('click', () => {
    if (state === 'broken' || !ctx) return;
    state = state === 'pulling' ? 'paused' : 'pulling';
    $('tRun').textContent = state === 'pulling' ? 'Pause' : 'Continue';
    $('tStatus').textContent = state === 'pulling' ? 'Pulling…' : 'Paused'; $('tStatus').className = 'is-warn';
  });
  $('tReset').addEventListener('click', reset);
  reset();
}

/* ───────── Martindale ───────── */
function initAbrasion() {
  const MATS = [
    { name: 'Fine knit', end: 8000, col: '#e0486c' },
    { name: 'Cotton shirting', end: 15000, col: '#6d83ff' },
    { name: 'Wool-blend suiting', end: 30000, col: '#7c8a6b' },
    { name: 'Upholstery', end: 50000, col: '#c98a2b' },
  ];
  const cv = $('abrasionRig'), g = cv.getContext('2d'), S = cv.width, c = S / 2, R = S * 0.42;
  let mat = MATS[0], rubs = 0, running = false, last = 0;
  // Fixed pill positions so wear always develops the same way
  const pills = Array.from({ length: 140 }, (_, i) => {
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 140) * R * 0.86;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r, 1.2 + (i * 7 % 5) * 0.45];
  });
  // One Lissajous figure takes 16 rubs
  const path = (t) => [c + Math.sin(2 * Math.PI * t) * R * 0.5, c + Math.sin(2 * Math.PI * t * 15 / 16) * R * 0.5];

  function draw() {
    const wear = Math.min(rubs / mat.end, 1);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(c, c, R, 0, 7); g.clip();
    g.fillStyle = mat.col; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 1;
    for (let i = 0; i < S; i += 5) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
    // worn zone: lighter, fuzzier, then a hole
    const grd = g.createRadialGradient(c, c, 0, c, c, R * 0.75);
    grd.addColorStop(0, `rgba(255,255,255,${0.55 * wear})`); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,.75)';
    const nP = Math.floor(Math.min(wear / 0.7, 1) * pills.length);
    for (let i = 0; i < nP; i++) { g.beginPath(); g.arc(pills[i][0], pills[i][1], pills[i][2], 0, 7); g.fill(); }
    if (wear >= 1) {
      g.fillStyle = C.bg; g.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, r = 20 + Math.sin(i * 2.7) * 6; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
      g.fill();
    }
    g.restore();
    g.strokeStyle = C.line; g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke();
    // trace of the last full figure
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.2; g.beginPath();
    const span = Math.min(rubs, 16);
    for (let i = 0; i <= 320; i++) { const [x, y] = path(rubs - span + span * i / 320); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const [hx, hy] = path(rubs);
    g.fillStyle = C.signal; g.beginPath(); g.arc(hx, hy, 6, 0, 7); g.fill();

    $('aRubs').textContent = Math.floor(rubs).toLocaleString('en');
    $('aSurface').textContent = wear >= 1 ? 'Threads broken' : wear > 0.7 ? 'Thinning' : wear > 0.35 ? 'Pilling' : wear > 0.08 ? 'Light fuzz' : 'Unworn';
    $('aEnd').textContent = wear >= 1 ? mat.end.toLocaleString('en') + ' rubs' : '—';
    $('aEnd').className = wear >= 1 ? 'is-fail' : '';
  }

  function tick(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    rubs = Math.min(rubs + dt * +$('aSpeed').value, mat.end);
    if (rubs >= mat.end) { running = false; $('aRun').disabled = true; $('aRun').textContent = 'End point reached'; }
    draw();
    if (running) requestAnimationFrame(tick);
  }
  function reset() { rubs = 0; running = false; $('aRun').disabled = false; $('aRun').textContent = 'Start rubbing'; draw(); }

  chips($('abrasionMats'), MATS, (m) => { mat = m; reset(); });
  $('aRun').addEventListener('click', () => {
    running = !running; $('aRun').textContent = running ? 'Pause' : 'Continue';
    if (running) { last = performance.now(); requestAnimationFrame(tick); }
  });
  $('aReset').addEventListener('click', reset);
  $('aSpeed').addEventListener('input', (e) => { $('aSpeedOut').textContent = '×' + e.target.value; });
  draw();
}

/* ───────── Wash fastness ───────── */
function initWash() {
  const DYES = [
    { name: 'Indigo', col: [42, 63, 214], k: 0.05, s: 0.9 },
    { name: 'Reactive red', col: [200, 32, 58], k: 0.008, s: 0.35 },
    { name: 'Sulphur black', col: [30, 30, 38], k: 0.022, s: 0.6 },
    { name: 'Turquoise', col: [10, 165, 160], k: 0.03, s: 0.75 },
  ];
  const STEPS = ['5', '4-5', '4', '3-4', '3', '2-3', '2', '1-2', '1'];
  const scale = $('greyScale');
  STEPS.forEach((s, i) => {
    const el = document.createElement('i');
    const v = 122 + i * 14;
    el.innerHTML = `<span></span><span style="background:rgb(${v},${v},${v})"></span>${s}`;
    scale.append(el);
  });
  let dye = DYES[0];
  const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

  function update() {
    const n = +$('wCycles').value, T = +$('wTemp').value;
    const tf = 1 + (T - 40) / 40;
    const loss = 1 - Math.exp(-dye.k * n * tf);
    const stain = Math.min(1, loss * dye.s * 1.3);
    const idx = (v) => Math.min(8, Math.round(Math.pow(v, 0.75) * 8));
    const ci = idx(loss), si = idx(stain);
    $('wOrig').style.backgroundColor = mix(dye.col, dye.col, 0);
    $('wAfter').style.backgroundColor = mix(dye.col, [222, 218, 206], loss * 0.7);
    $('wStain').style.backgroundColor = mix([250, 249, 245], dye.col, stain * 0.4);
    $('wCyclesOut').textContent = n; $('wTempOut').textContent = T + ' °C';
    $('wChange').textContent = STEPS[ci]; $('wStaining').textContent = STEPS[si];
    const ok = ci <= 2 && si <= 3; // common buyer limit: change ≥ 4, staining ≥ 3-4
    $('wVerdict').textContent = ok ? 'Pass' : 'Fail'; $('wVerdict').className = ok ? 'is-pass' : 'is-fail';
    [...scale.children].forEach((el, i) => el.classList.toggle('is-on', i === ci));
  }
  chips($('washDyes'), DYES, (d) => { dye = d; update(); });
  $('wCycles').addEventListener('input', update); $('wTemp').addEventListener('input', update);
  update();
}

export function initBench() {
  initTensile(); initAbrasion(); initWash();
  const tabs = [...document.querySelectorAll('.bench .tab')];
  const pick = (t) => tabs.forEach((x) => {
    const on = x === t;
    x.classList.toggle('is-on', on); x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1;
    $(x.getAttribute('aria-controls')).hidden = !on;
  });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const n = tabs[(i + d + tabs.length) % tabs.length]; pick(n); n.focus();
    });
  });
}
