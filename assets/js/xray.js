// Product X-ray: tap a marker to see what a lab checks at that spot.
const PRODUCTS = {
  garment: {
    name: 'Garment',
    svg: `<path d="M120 70 160 50q40 30 80 0l40 20 70 60-40 45-30-25v200H120V150l-30 25-40-45z"/>
          <circle class="thin" cx="200" cy="205" r="42"/><path class="thin" d="M120 150v200M280 150v200M130 338h140"/>
          <rect class="solid" x="190" y="66" width="20" height="12" rx="2" stroke="none"/>`,
    spots: [
      { x: 50, y: 51, part: 'Printed motif', title: 'Phthalates in prints', text: 'Plastisol prints are soft because of plasticisers. Restricted phthalates are extracted and measured.', meta: [['Method', 'ISO 14389'], ['Why', 'Restricted under REACH Annex XVII and CPSIA']] },
      { x: 37, y: 72, part: 'Dyed fabric', title: 'Azo dyes & colour fastness', text: 'Some azo dyes can split into carcinogenic aromatic amines. The dye must also stay put in washing, rubbing and perspiration.', meta: [['Methods', 'EN ISO 14362-1 · ISO 105-C06 · ISO 105-X12 · ISO 105-E04'], ['Why', 'Banned amines; staining of other clothes and skin']] },
      { x: 50, y: 18, part: 'Care & content label', title: 'Fibre composition', text: 'Is "100 % cotton" really 100 % cotton? Fibres are identified and blends are dissolved component by component and weighed.', meta: [['Method', 'ISO 1833 series'], ['Why', 'Labelling law, e.g. EU Regulation 1007/2011']] },
      { x: 70, y: 60, part: 'Side seam', title: 'Seam & fabric strength', text: 'Seams are pulled until they open; the fabric itself is tested for tensile and tear strength.', meta: [['Methods', 'ISO 13935-2 · ISO 13934-1 · ISO 13937-2'], ['Why', 'Durability in wear']] },
      { x: 50, y: 84, part: 'Whole garment', title: 'Dimensional stability', text: 'The garment is measured, washed and dried under controlled conditions, then measured again for shrinkage and twisting.', meta: [['Methods', 'ISO 6330 · ISO 5077'], ['Why', 'Fit after washing; care label accuracy']] },
      { x: 20, y: 33, part: 'Skin contact', title: 'pH value & formaldehyde', text: 'An aqueous extract of the fabric is checked for acidity and for free formaldehyde left over from finishing.', meta: [['Methods', 'ISO 3071 · ISO 14184-1'], ['Why', 'Skin irritation']] },
    ],
  },
  shoe: {
    name: 'Shoe',
    svg: `<path d="M50 285 56 190q6-28 44-22l48 8q30 6 52 38 50 36 120 42 46 6 46 29z"/>
          <path d="M40 285h326q6 28-26 28H70q-30 0-30-28z"/>
          <path class="thin" d="M150 180l40 46M166 172l42 50M110 172q-8 60 6 112M56 215h50"/>
          <circle class="solid" cx="160" cy="196" r="3" stroke="none"/><circle class="solid" cx="176" cy="212" r="3" stroke="none"/><circle class="solid" cx="192" cy="228" r="3" stroke="none"/>`,
    spots: [
      { x: 22, y: 60, part: 'Leather upper', title: 'Chromium VI & azo dyes', text: 'Chrome-tanned leather can form allergenic chromium VI. Leather dyes are screened for banned aromatic amines.', meta: [['Methods', 'ISO 17075 · ISO 17234-1'], ['Why', 'Skin sensitisation; REACH limits']] },
      { x: 60, y: 76, part: 'Sole bond', title: 'Upper–sole adhesion', text: 'The sole is peeled from the upper while the force is recorded, to see whether the bond survives real walking.', meta: [['Method', 'ISO 17708'], ['Why', 'Soles that come off']] },
      { x: 35, y: 77, part: 'Outsole', title: 'Flexing & abrasion resistance', text: 'The sole is bent tens of thousands of times and abraded to see whether it cracks or wears through.', meta: [['Methods', 'ISO 17707 · ISO 20871'], ['Why', 'Service life']] },
      { x: 44, y: 52, part: 'Laces & eyelets', title: 'Nickel release', text: 'Metal parts in prolonged skin contact are tested for the nickel they release into artificial sweat.', meta: [['Methods', 'EN 1811 · EN 12472'], ['Why', 'Nickel allergy; REACH Annex XVII']] },
      { x: 82, y: 67, part: 'Synthetic parts', title: 'Organotin compounds', text: 'Organotins may be present as stabilisers or biocides in plastics and coatings of footwear.', meta: [['Method', 'ISO/TS 16179'], ['Why', 'Toxic to reproduction; restricted']] },
      { x: 16, y: 46, part: 'Lining', title: 'Colour rubbing & pH', text: 'The lining is rubbed dry and wet against white cloth, and its extract is checked for acidity.', meta: [['Methods', 'ISO 17700 · ISO 4045'], ['Why', 'Stained socks; skin comfort']] },
    ],
  },
  toy: {
    name: 'Soft toy',
    svg: `<circle cx="152" cy="92" r="26"/><circle cx="248" cy="92" r="26"/><ellipse cx="118" cy="250" rx="30" ry="48" transform="rotate(24 118 250)"/><ellipse cx="282" cy="250" rx="30" ry="48" transform="rotate(-24 282 250)"/>
          <ellipse cx="160" cy="350" rx="36" ry="28"/><ellipse cx="240" cy="350" rx="36" ry="28"/><ellipse cx="200" cy="270" rx="74" ry="88"/><circle cx="200" cy="140" r="62"/>
          <circle class="solid" cx="178" cy="130" r="6" stroke="none"/><circle class="solid" cx="222" cy="130" r="6" stroke="none"/><ellipse class="solid" cx="200" cy="156" rx="9" ry="6" stroke="none"/>
          <path class="thin" d="M200 162v12M186 180q14 10 28 0M200 200v130"/>`,
    spots: [
      { x: 44.5, y: 32.5, part: 'Eyes & nose', title: 'Small parts', text: 'Eyes are gripped and pulled with a defined force. Anything that detaches and fits the small-parts cylinder is a choking hazard.', meta: [['Method', 'EN 71-1 · ISO 8124-1'], ['Why', 'Choking — the classic toy recall']] },
      { x: 50, y: 62, part: 'Seams', title: 'Seam strength', text: 'Seams are pulled apart to check that a child cannot reach the filling.', meta: [['Method', 'EN 71-1'], ['Why', 'Access to stuffing']] },
      { x: 72, y: 60, part: 'Plush fabric', title: 'Flammability', text: 'A flame is applied and the rate of spread measured. Soft toys must not flash over or burn fast.', meta: [['Method', 'EN 71-2'], ['Why', 'Burn injuries']] },
      { x: 50, y: 43, part: 'Coloured parts', title: 'Migration of certain elements', text: 'The material is placed in simulated stomach acid to see how much lead, cadmium, chromium and other elements migrate out.', meta: [['Method', 'EN 71-3'], ['Why', 'Poisoning when swallowed']] },
      { x: 28, y: 66, part: 'Mouthable surfaces', title: 'Saliva & perspiration fastness', text: 'Children suck on toys. Dyes must not bleed into saliva or sweat simulant.', meta: [['Method', 'DIN 53160-1 / -2'], ['Why', 'Dye uptake by mouth and skin']] },
      { x: 38, y: 87, part: 'Textile & filling', title: 'Organic chemical compounds', text: 'Solvents, preservatives, flame retardants and certain colourants are limited in toys for young children.', meta: [['Methods', 'EN 71-9 · EN 71-10 · EN 71-11'], ['Why', 'Chronic chemical exposure']] },
    ],
  },
  bag: {
    name: 'Bag',
    svg: `<path d="M150 140q0-80 50-80t50 80"/><rect x="95" y="140" width="210" height="210" rx="22"/>
          <path class="thin" d="M115 180h170M120 250h160v72H120z"/><rect class="solid" x="268" y="173" width="18" height="14" rx="3" stroke="none"/>
          <path class="thin" d="M95 300h-14v-110h14M305 300h14v-110h-14"/>`,
    spots: [
      { x: 60, y: 45, part: 'Zipper', title: 'Zipper strength & function', text: 'Zippers are opened and closed thousands of times and pulled sideways until they burst.', meta: [['Method', 'EN 16732'], ['Why', 'The most common bag failure']] },
      { x: 50, y: 17, part: 'Handle', title: 'Handle & strap load', text: 'The bag is loaded and lifted or jerked repeatedly to see whether handles and their attachment hold.', meta: [['Method', 'Suitcase & bag testing'], ['Why', 'Carrying safety']] },
      { x: 50, y: 71, part: 'Coated fabric', title: 'Phthalates in coatings', text: 'PVC and PU coatings are screened for restricted plasticisers.', meta: [['Method', 'ISO 14389'], ['Why', 'REACH Annex XVII']] },
      { x: 30, y: 52, part: 'Outer fabric', title: 'Colour fastness to rubbing', text: 'A bag rubs against clothes all day. The fabric is rubbed dry and wet against white cotton and staining is rated.', meta: [['Method', 'ISO 105-X12'], ['Why', 'Colour transfer to clothing']] },
      { x: 72, y: 84, part: 'Base', title: 'Abrasion resistance', text: 'The base fabric is abraded on the Martindale tester until it wears through.', meta: [['Method', 'ISO 12947-2'], ['Why', 'Service life']] },
    ],
  },
};

export function initXray() {
  const $ = (id) => document.getElementById(id);
  const tabs = $('xrayTabs'), stage = $('xrayCanvas');
  let key = 'garment', cur = 0;

  function show(i) {
    const p = PRODUCTS[key];
    cur = (i + p.spots.length) % p.spots.length;
    const s = p.spots[cur];
    stage.querySelectorAll('.hot').forEach((h, n) => { h.classList.toggle('is-on', n === cur); h.setAttribute('aria-pressed', n === cur); });
    $('xrayPart').textContent = s.part;
    $('xrayTitle').textContent = s.title;
    $('xrayText').textContent = s.text;
    $('xrayMeta').innerHTML = s.meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('xrayCount').textContent = `${cur + 1} / ${p.spots.length}`;
  }

  function load(k) {
    key = k;
    const p = PRODUCTS[k];
    tabs.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c.dataset.k === k));
    stage.innerHTML = `<svg viewBox="0 0 400 400" aria-hidden="true">${p.svg}</svg>`;
    p.spots.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hot'; b.style.left = s.x + '%'; b.style.top = s.y + '%';
      b.setAttribute('aria-label', `${s.part}: ${s.title}`);
      b.innerHTML = `<span>${i + 1}</span>`;
      b.addEventListener('click', () => show(i));
      stage.append(b);
    });
    show(0);
  }

  Object.entries(PRODUCTS).forEach(([k, p]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = p.name;
    b.addEventListener('click', () => load(k));
    tabs.append(b);
  });
  $('xrayPrev').addEventListener('click', () => show(cur - 1));
  $('xrayNext').addEventListener('click', () => show(cur + 1));
  document.querySelectorAll('[data-xray]').forEach((a) => a.addEventListener('click', () => load(a.dataset.xray)));
  load('garment');
}
