// Hero: a fabric specimen clamped along its top edge. Drag to stretch it; overstretch and yarns break.
import { THREE, Cloth, weaveTexture, stage } from './cloth.js';

export function initHero() {
  const canvas = document.getElementById('weave');
  const readout = document.getElementById('weaveReadout');
  if (!canvas) return;

  const COLS = 40, ROWS = 34;
  let cloth, ctx;
  try {
    cloth = new Cloth({
      cols: COLS, rows: ROWS, width: 2.7, height: 2.25,
      pin: (i, j) => j === 0, tear: 2.5, texture: weaveTexture('plain'), repeat: [2.5, 2.1],
    });
    ctx = stage(canvas, { fov: 30, z: 6.4, y: -0.12 }, frame);
  } catch (e) {
    canvas.closest('.specimen-frame')?.classList.add('no-webgl');
    readout.textContent = '3D view needs WebGL';
    return;
  }
  const { scene, camera } = ctx;
  scene.add(cloth.mesh);

  // Clamp jaw holding the top edge
  const jaw = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 0.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x9aa3c7, metalness: 0.7, roughness: 0.35 })
  );
  jaw.position.set(0, 2.25 / 2 + 0.06, 0);
  scene.add(jaw);
  for (const x of [-1.2, 0, 1.2]) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.4 }));
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, jaw.position.y, 0.02);
    scene.add(bolt);
  }

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let peak = 0;
  function frame() {
    if (cloth.grabbed.length) { // move towards the pointer at a limited speed so yarns load gradually
      step.subVectors(goal, cloth.target);
      cloth.target.add(step.clampLength(0, 0.03));
    }
    cloth.step(1 / 60, calm ? 0 : 2.2);
    cloth.update();
    peak = Math.max(peak, cloth.strain);
    const s = Math.round(cloth.strain * 100);
    if (cloth.broken) {
      readout.textContent = `${cloth.broken} yarns broken · peak strain ${Math.round(Math.min(peak, cloth.tear - 1) * 100)} %`;
    } else if (cloth.grabbed.length) {
      readout.textContent = `peak yarn strain ${s} % · breaks at ${Math.round((cloth.tear - 1) * 100)} %`;
    } else {
      readout.textContent = 'drag the fabric · pull hard to tear it';
    }
  }

  // Pointer → grab the nearest yarn crossing and drag it in the camera plane
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const plane = new THREE.Plane(), hit = new THREE.Vector3(), goal = new THREE.Vector3(), step = new THREE.Vector3();
  const setRay = (e) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  canvas.addEventListener('pointerdown', (e) => {
    setRay(e);
    cloth.geometry.computeBoundingSphere();
    const h = ray.intersectObject(cloth.mesh)[0];
    if (!h) return;
    const p = cloth.pos;
    let best = h.face.a, bd = Infinity;
    for (const k of [h.face.a, h.face.b, h.face.c]) {
      const d = h.point.distanceToSquared(new THREE.Vector3(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]));
      if (d < bd) { bd = d; best = k; }
    }
    cloth.grab(best, 1);
    goal.copy(cloth.target);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), h.point);
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cloth.grabbed.length) return;
    setRay(e);
    if (ray.ray.intersectPlane(plane, hit)) goal.copy(hit);
  });
  const drop = () => { cloth.release(); canvas.style.cursor = ''; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);

  // Controls
  document.querySelectorAll('[data-weave]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-weave]').forEach((x) => x.classList.toggle('is-on', x === b));
    cloth.setTexture(weaveTexture(b.dataset.weave));
  }));
  document.getElementById('weaveReset')?.addEventListener('click', () => { cloth.reset(); peak = 0; });
}
