// Opening: the logo rises through a body of liquid glass, settles, then docks in the top-left corner.
import { THREE } from './cloth.js';

const FRAG = `
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes, uLogo; uniform float uP, uT;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float ss(float a, float b, float x) { return smoothstep(a, b, x); }

// Signed distance to the glass: a pill that swells over the logo while droplets flow in and merge with it.
float glass(vec2 p) {
  float u = uLogo.x, grow = ss(0.0, 0.5, uP), melt = ss(0.02, 0.62, uP);
  float d = sdBox(p, vec2(0.66 * u, 0.36 * u) * (0.08 + 0.92 * grow), 0.3 * u * grow + 1.0);
  for (int i = 0; i < 5; i++) {
    float f = float(i), a = f * 1.2566 + 0.6 + uT * 0.35;
    vec2 c = vec2(cos(a), sin(a) * 0.7) * u * mix(1.25, 0.0, melt) + vec2(sin(uT * 1.3 + f), cos(uT * 1.1 + f * 2.0)) * u * 0.03;
    d = smin(d, length(p - c) - u * (0.1 + 0.03 * sin(f * 3.1)) * (1.0 - 0.6 * melt), u * 0.22);
  }
  return d;
}
// Dome height of the liquid surface (0 at the rim → 1 in the body)
float height(vec2 p) {
  float t = clamp(-glass(p) / (uLogo.x * 0.1), 0.0, 1.0);
  float ripple = sin(p.x * 0.02 + uT * 2.2) * sin(p.y * 0.026 - uT * 1.7) * 0.05 * (1.0 - ss(0.3, 0.8, uP));
  return sqrt(1.0 - (1.0 - t) * (1.0 - t)) + ripple * t;
}
// The page under the glass: paper with the logo's faint diagonal stripes, so refraction has something to bend
vec3 paper(vec2 q) {
  vec3 base = mix(vec3(0.965, 0.965, 0.953), vec3(0.905, 0.92, 0.955), clamp(length(q) / length(uRes) * 1.5, 0.0, 1.0));
  float w = uLogo.x * 0.045, s = abs(fract((q.x * 0.743 + q.y * 0.669) / w) - 0.5);
  return mix(base, vec3(0.0, 0.024, 0.29), 0.038 * ss(0.3, 0.26, s));
}
vec4 logo(vec2 p, float scale) {
  vec2 uv = p / (uLogo * scale) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture2D(uTex, uv);
}
void main() {
  vec2 p = gl_FragCoord.xy - 0.5 * uRes;
  float settle = ss(0.72, 0.92, uP), live = 1.0 - settle;
  float d = glass(p), inside = ss(1.0, -1.0, d);
  float h = height(p), e = 2.0;
  vec3 n = normalize(vec3(height(p - vec2(e, 0.0)) - height(p + vec2(e, 0.0)), height(p - vec2(0.0, e)) - height(p + vec2(0.0, e)), 0.11));
  n = mix(vec3(0.0, 0.0, 1.0), n, inside * live);

  // the logo zooms in from the depth; the liquid lens magnifies and bends it
  float zoom = mix(0.3, 1.0, 1.0 - pow(1.0 - ss(0.0, 0.78, uP), 3.0));
  float lens = 1.0 + 0.34 * h * inside * live;
  vec2 bend = n.xy * uLogo.x * 0.11;
  vec3 col;
  for (int i = 0; i < 3; i++) {                       // refract each colour a little differently
    float k = 0.8 + 0.2 * float(i);
    vec2 q = (p + bend * k) / lens;
    vec4 s = logo(q, zoom);
    vec3 c = mix(paper(q), s.rgb, s.a * ss(0.02, 0.3, uP));
    if (i == 0) col.r = c.r; else if (i == 1) col.g = c.g; else col.b = c.b;
  }
  // glass body: almost clear, with a bright rim, a caustic crescent and a soft shadow on the page
  float g = inside * live, rim = pow(1.0 - clamp(-d / (uLogo.x * 0.1), 0.0, 1.0), 2.0);
  vec2 ld = normalize(vec2(-0.6, 0.8));
  col = mix(col, vec3(0.93, 0.96, 1.0), 0.05 * g);
  col *= 1.0 - 0.1 * g * rim;
  col += g * pow(max(dot(n, normalize(vec3(ld * 0.75, 0.66))), 0.0), 90.0) * 1.1;        // specular glint
  col += g * rim * max(dot(normalize(n.xy + 1e-4), ld), 0.0) * 0.5;                      // lit edge
  col += g * rim * rim * max(dot(normalize(n.xy + 1e-4), -ld), 0.0) * vec3(0.55, 0.7, 1.0) * 0.55; // light gathered on the far rim
  float sh = ss(uLogo.x * 0.09, 0.0, glass(p - vec2(8.0, -14.0) * uLogo.x / 640.0)) * (1.0 - inside) * live;
  col = mix(col, vec3(0.0, 0.02, 0.29), 0.1 * sh);
  gl_FragColor = vec4(col, 1.0);
}`;

export function initIntro() {
  const veil = document.getElementById('intro'), mark = document.getElementById('introLogo'), slot = document.getElementById('navLogo');
  if (!veil) return;
  const done = () => { veil.remove(); document.documentElement.classList.remove('is-intro'); slot.style.visibility = ''; };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Dock: slide the centred logo into the nav slot, losing the tagline on the way.
  const dock = () => {
    const a = mark.getBoundingClientRect(), b = slot.getBoundingClientRect();
    veil.classList.add('is-docking');
    mark.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width})`;
    setTimeout(done, calm ? 0 : 1000);
  };

  let renderer;
  const canvas = veil.querySelector('canvas');
  try { if (calm) throw 0; renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); }
  catch (e) { canvas.remove(); setTimeout(dock, calm ? 0 : 900); return; }

  const img = new Image();
  img.onerror = () => { canvas.remove(); dock(); };
  img.onload = () => {
    const tc = document.createElement('canvas'); tc.width = 2048; tc.height = Math.round(2048 * img.height / img.width);
    tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
    const tex = new THREE.CanvasTexture(tc); tex.colorSpace = THREE.NoColorSpace;
    const dpr = Math.min(devicePixelRatio, 2);
    const uni = { uTex: { value: tex }, uRes: { value: new THREE.Vector2() }, uLogo: { value: new THREE.Vector2() }, uP: { value: 0 }, uT: { value: 0 } };
    const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: uni, fragmentShader: FRAG, vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}' })));
    const size = () => {
      renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight, false);
      const r = mark.getBoundingClientRect();
      uni.uRes.value.set(innerWidth * dpr, innerHeight * dpr); uni.uLogo.value.set(r.width * dpr, r.height * dpr);
    };
    size(); addEventListener('resize', size);

    const DUR = 3400; let t0 = performance.now(), speed = 1, prog = 0, last = t0;
    const hold = new URLSearchParams(location.search).get('intro'); // ?intro=0.5 freezes a frame for inspection
    const skip = () => { speed = 5; };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, skip, { once: true, passive: true }));
    (function tick(now) {
      prog = Math.min(1, prog + (now - last) / DUR * speed); last = now;
      if (hold) { uni.uP.value = +hold; uni.uT.value = +hold * 3.4; renderer.render(scene, cam); return requestAnimationFrame(tick); }
      uni.uP.value = prog; uni.uT.value = (now - t0) / 1000;
      renderer.render(scene, cam);
      if (prog < 1) return requestAnimationFrame(tick);
      removeEventListener('resize', size);
      veil.classList.add('is-clear');           // canvas fades, the real logo underneath takes over
      setTimeout(() => { dock(); renderer.dispose(); }, 380);
    })(t0);
  };
  img.src = mark.querySelector('img').src;
}
