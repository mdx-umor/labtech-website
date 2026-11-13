import { COMPANY, SITES, TICKER, REQUEST } from './config.js';
import { initIntro } from './intro.js';
import { initSpecimen } from './specimen.js';
import { initBench } from './bench.js';
import { initXray } from './xray.js';
import { initAql } from './aql.js';

const $ = (id) => document.getElementById(id);
const safe = (fn) => { try { fn(); } catch (e) { console.error(e); } };

/* ── Nav, theme, reveal ── */
function initChrome() {
  const nav = $('nav'), links = $('navLinks'), menu = $('menuBtn');
  const stage = $('stage');
  const stick = () => { nav.classList.toggle('is-stuck', scrollY > 8); nav.classList.toggle('is-solid', !stage || stage.getBoundingClientRect().bottom < 80); };
  addEventListener('scroll', stick, { passive: true }); stick();
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', links.classList.toggle('is-open')));
  links.addEventListener('click', (e) => { if (e.target.tagName === 'A') { links.classList.remove('is-open'); menu.setAttribute('aria-expanded', false); } });

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  const anchors = [...links.querySelectorAll('a')];
  const spy = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) anchors.forEach((a) => a.classList.toggle('is-active', a.hash === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  anchors.forEach((a) => { const s = document.querySelector(a.hash); if (s) spy.observe(s); });

  const t = [...TICKER, ...TICKER].map((s) => `<span>${s}</span>`).join('');
  $('ticker').innerHTML = t;
  $('year').textContent = new Date().getFullYear();
}

/* ── Production line ── */
function initLine() {
  const range = $('lineRange'), fill = $('lineFill'), track = $('lineTrack');
  const knob = Object.assign(document.createElement('span'), { className: 'line-knob' });
  track.append(knob);
  const cards = [...document.querySelectorAll('.lcard')];
  function update() {
    const v = +range.value, prod = Math.min(100, Math.round(v / 80 * 100));
    fill.style.width = v + '%'; knob.style.left = v + '%';
    let stage = '', now = 'No inspection due — production running';
    if (v >= 8 && v <= 12) { stage = 'inline'; now = 'Inline inspection window'; }
    else if (v < 8) now = 'Too early — not enough pieces produced yet';
    else if (v >= 80 && v <= 88) { stage = 'fri'; now = 'Final random inspection'; }
    else if (v >= 93) { stage = 'loading'; now = 'Loading check'; }
    else if (v > 88) now = 'Released — waiting for the container';
    $('lineStage').textContent = v < 80 ? `Production ${prod} % complete` : v <= 88 ? 'Production 100 % · packed in cartons' : v < 93 ? 'Goods ready for dispatch' : 'Container at the dock';
    $('lineNow').textContent = now;
    cards.forEach((c) => c.classList.toggle('is-on', c.dataset.stage === stage));
  }
  range.addEventListener('input', update);
  update();
}

/* ── Network map ── */
function initMap() {
  const svg = $('netMap'), list = $('netList');
  const X = (lon) => 40 + (lon + 5) * 4.6, Y = (lat) => 360 - (lat - 5) * 5.6;
  let h = '';
  for (let lon = 0; lon <= 120; lon += 20) h += `<path class="grat" d="M${X(lon)} ${Y(62)}V${Y(4)}"/><text class="gl" x="${X(lon) + 3}" y="${Y(4) + 12}">${lon}°E</text>`;
  for (let lat = 10; lat <= 60; lat += 10) h += `<path class="grat" d="M${X(-5)} ${Y(lat)}H${X(130)}"/><text class="gl" x="${X(-5) + 2}" y="${Y(lat) - 4}">${lat}°N</text>`;
  const [, , hx, hy] = SITES[0];
  SITES.slice(1).forEach(([, , lon, lat], i) => {
    const x1 = X(hx), y1 = Y(hy), x2 = X(lon), y2 = Y(lat);
    const lift = Math.hypot(x2 - x1, y2 - y1) * 0.28;
    h += `<path class="arc${i === 0 ? ' main' : ''}" d="M${x1} ${y1}Q${(x1 + x2) / 2} ${(y1 + y2) / 2 - lift} ${x2} ${y2}"/>`;
  });
  SITES.forEach(([name, , lon, lat, dx, dy, hq], i) => {
    h += `<g class="node${hq ? ' hq' : ''}" data-i="${i}" transform="translate(${X(lon)} ${Y(lat)})"><circle class="halo" r="7"/><circle r="${hq ? 8 : 6}"/><text x="${dx}" y="${dy}" text-anchor="${dx < 0 ? 'end' : 'start'}">${name}</text></g>`;
  });
  svg.innerHTML = h;
  list.innerHTML = SITES.map(([name, desc, , , , , hq], i) => `<li data-i="${i}"${hq ? ' class="hq"' : ''}><i></i><div><b>${name}</b><span>${desc}</span></div></li>`).join('');
  const sync = (i, on) => {
    svg.querySelector(`.node[data-i="${i}"]`)?.classList.toggle('is-on', on);
    list.querySelector(`li[data-i="${i}"]`)?.classList.toggle('is-on', on);
  };
  for (const host of [svg, list]) {
    host.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-i]'); if (el) sync(el.dataset.i, true); });
    host.addEventListener('pointerout', (e) => { const el = e.target.closest('[data-i]'); if (el) sync(el.dataset.i, false); });
  }
}

/* ── Request builder ── */
function initRequest() {
  const sel = { product: new Set(), service: new Set(), market: new Set() };
  const group = (id, key, multi) => REQUEST[key].forEach((label) => {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: label });
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (!multi && !sel[key].has(label)) { sel[key].clear(); $(id).querySelectorAll('.chip').forEach((c) => { c.classList.remove('is-on'); c.setAttribute('aria-pressed', 'false'); }); }
      const on = !sel[key].has(label);
      on ? sel[key].add(label) : sel[key].delete(label);
      b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on);
      preview();
    });
    $(id).append(b);
  });
  group('reqProduct', 'product', true); group('reqService', 'service', true); group('reqMarket', 'market', false);

  const body = () => [
    `Product:  ${[...sel.product].join(', ') || '—'}`,
    `Service:  ${[...sel.service].join(', ') || '—'}`,
    `Market:   ${[...sel.market].join(', ') || '—'}`,
    `Name:     ${$('reqName').value || '—'}`,
    `Company:  ${$('reqCompany').value || '—'}`,
    '', $('reqMsg').value || '(no further details yet)',
  ].join('\n');
  const preview = () => { $('reqPreview').textContent = body(); };
  $('reqForm').addEventListener('input', preview);
  $('reqForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const subject = `Request: ${[...sel.service].join(' + ') || 'testing / inspection'}`;
    location.href = `mailto:${COMPANY.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body())}`;
  });
  preview();

  $('cAddr').textContent = COMPANY.address;
  $('cPhone').textContent = COMPANY.phone; $('cPhone').href = 'tel:' + COMPANY.phone.replace(/\s/g, '');
  $('cMail').textContent = COMPANY.email; $('cMail').href = 'mailto:' + COMPANY.email;
  $('cFb').href = COMPANY.facebook;
}

[initIntro, initChrome, initSpecimen, initBench, initXray, initAql, initLine, initMap, initRequest].forEach(safe);
