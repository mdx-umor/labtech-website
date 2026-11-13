// AQL sampling plans — ISO 2859-1 / ANSI/ASQ Z1.4, single sampling, normal inspection.
const LETTERS = 'ABCDEFGHJKLMNPQR';
const SIZES = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000];
// Upper lot-size bound → code letter index for general inspection levels I, II, III (Table 1)
const LOTS = [
  [8, 0, 0, 1], [15, 0, 1, 2], [25, 1, 2, 3], [50, 2, 3, 4], [90, 2, 4, 5], [150, 3, 5, 6],
  [280, 4, 6, 7], [500, 5, 7, 8], [1200, 6, 8, 9], [3200, 7, 9, 10], [10000, 8, 10, 11],
  [35000, 9, 11, 12], [150000, 10, 12, 13], [500000, 11, 13, 14], [Infinity, 12, 14, 15],
];
// Code-letter index at which each AQL has its Ac = 0 plan (Table 2-A)
const ZERO = { '0.065': 10, '0.10': 9, '0.15': 8, '0.25': 7, '0.40': 6, '0.65': 5, '1.0': 4, '1.5': 3, '2.5': 2, '4.0': 1, '6.5': 0 };
const AC = [1, 2, 3, 5, 7, 10, 14, 21];

/** Returns { n, ac, re } for a code letter and AQL, following the table's arrows. */
export function plan(letter, aql, lot) {
  const z = ZERO[aql], d = letter - z;
  let row, ac;
  if (d <= 1) { row = z; ac = 0; }                       // 0 plan, or arrow pointing to it
  else if (d === 2) { row = z + 3; ac = 1; }             // arrow down to first Ac = 1 plan
  else if (d - 3 < AC.length) { row = letter; ac = AC[d - 3]; }
  else { row = z + 3 + AC.length - 1; ac = AC[AC.length - 1]; } // arrow up to last plan
  row = Math.min(row, SIZES.length - 1);
  let n = SIZES[row];
  if (n >= lot) { n = lot; }                             // sample ≥ lot → 100 % inspection
  return { n, ac, re: ac + 1 };
}

export function codeLetter(lot, level) {
  return LOTS.find((r) => lot <= r[0])[level + 1];
}

// P(X ≤ ac) for X ~ Binomial(n, p)
function pAccept(n, ac, p) {
  if (p <= 0) return 1;
  let term = Math.pow(1 - p, n), sum = term;
  for (let k = 1; k <= ac; k++) { term *= (n - k + 1) / k * p / (1 - p); sum += term; }
  return Math.min(1, sum);
}

export function initAql() {
  const $ = (id) => document.getElementById(id);
  const opts = Object.keys(ZERO).sort((a, b) => a - b);
  for (const [id, def] of [['aqlMajor', '2.5'], ['aqlMinor', '4.0']]) {
    $(id).innerHTML = opts.map((o) => `<option${o === def ? ' selected' : ''}>${o}</option>`).join('');
  }
  let plans = {};

  function calc() {
    const lot = Math.max(2, Math.floor(+$('lot').value || 2));
    const level = +document.querySelector('#aqlLevel input:checked').value;
    const L = codeLetter(lot, level);
    const n = Math.min(SIZES[L], lot);
    plans = { lot, major: plan(L, $('aqlMajor').value, lot), minor: plan(L, $('aqlMinor').value, lot) };
    $('aqlLetter').textContent = LETTERS[L];
    $('aqlN').textContent = n.toLocaleString('en');
    const share = n / lot * 100;
    $('aqlShare').textContent = (share >= 10 ? share.toFixed(0) : share.toFixed(share < 1 ? 2 : 1)) + ' %';
    const row = (name, aql, p) => `<tr><td>${name}</td><td>${aql}</td><td>${p.n.toLocaleString('en')}</td><td>${p.ac}</td><td>${p.re}</td></tr>`;
    $('aqlRows').innerHTML =
      `<tr><td>Critical</td><td>not allowed</td><td>${n.toLocaleString('en')}</td><td>0</td><td>1</td></tr>` +
      row('Major', $('aqlMajor').value, plans.major) + row('Minor', $('aqlMinor').value, plans.minor);
    odds(); drawGrid(null);
    $('simResult').textContent = '';
  }

  function odds() {
    const pM = +$('simMajor').value / 100, pm = +$('simMinor').value / 100;
    $('simMajorOut').textContent = (pM * 100).toFixed(1) + ' %';
    $('simMinorOut').textContent = (pm * 100).toFixed(1) + ' %';
    const pa = pAccept(plans.major.n, plans.major.ac, pM) * pAccept(plans.minor.n, plans.minor.ac, pm);
    $('simOdds').textContent = `A lot of this quality would pass about ${Math.round(pa * 100)} out of 100 inspections. Sampling gives confidence, not certainty, which is why the plan matters.`;
  }

  // Each square is one sampled piece; shows at most 500 and scales the rest.
  function drawGrid(res) {
    const cv = $('simGrid'), g = cv.getContext('2d'), css = getComputedStyle(document.documentElement);
    const n = Math.max(plans.major.n, plans.minor.n), shown = Math.min(n, 500);
    const cols = Math.ceil(Math.sqrt(shown * cv.width / cv.height)), rows = Math.ceil(shown / cols);
    const s = Math.min((cv.width - 16) / cols, (cv.height - 16) / rows);
    g.clearRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < shown; i++) {
      const x = 8 + (i % cols) * s, y = 8 + Math.floor(i / cols) * s;
      const t = res ? res.marks[i] : 0;
      g.fillStyle = t === 2 ? css.getPropertyValue('--fail') : t === 1 ? css.getPropertyValue('--signal') : css.getPropertyValue('--line');
      g.fillRect(x + 1, y + 1, Math.max(1, s - 2), Math.max(1, s - 2));
    }
  }

  function simulate() {
    const pM = +$('simMajor').value / 100, pm = +$('simMinor').value / 100;
    const n = Math.max(plans.major.n, plans.minor.n);
    const marks = new Uint8Array(n);
    let major = 0, minor = 0;
    for (let i = 0; i < n; i++) {
      if (i < plans.major.n && Math.random() < pM) { major++; marks[i] = 2; }
      else if (i < plans.minor.n && Math.random() < pm) { minor++; marks[i] = 1; }
    }
    // Shuffle so defects scatter the way a random draw would
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [marks[i], marks[j]] = [marks[j], marks[i]]; }
    const pass = major <= plans.major.ac && minor <= plans.minor.ac;
    const el = $('simResult');
    el.textContent = `${pass ? 'Pass' : 'Fail'}: ${major} major (limit ${plans.major.ac}), ${minor} minor (limit ${plans.minor.ac})`;
    el.className = 'sim-result ' + (pass ? 'is-pass' : 'is-fail');
    drawGrid({ marks });
  }

  $('aqlForm').addEventListener('input', calc);
  $('simMajor').addEventListener('input', odds);
  $('simMinor').addEventListener('input', odds);
  $('simRun').addEventListener('click', simulate);
  new MutationObserver(() => drawGrid(null)).observe(document.documentElement, { attributeFilter: ['data-theme'] });
  calc();
}
