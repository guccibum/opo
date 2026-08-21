// opo4.1 — the top.
//
// Iteration two's row, to Space Agnostic's own arrangement: the words are not a
// flex row, they are placed absolutely from widths measured on a canvas rather
// than from the DOM. The row starts a third of the way across and consecutive
// words sit one space-character apart.
//
// Each word is two elements — an outer catch area that never moves, and the
// text inside it, which is the only thing that slides. A word that moved on its
// own hover would slide out from under the cursor, unhover itself, slide back,
// and flicker between the two states forever.
//
// The slide is theirs, moved: on their site a word drops 5px when selected;
// here it drops when hovered.

const FONT = '18px "Helvetica Neue", Helvetica, Arial, sans-serif';

let wordsEl, readoutEl, words = [], ctx = null, onGo = () => {};
let at = 'taj';

export const page = () => at;

function width(text) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = FONT;
  return ctx.measureText(text).width;
}

export function bind(pages, go) {
  wordsEl = document.getElementById('words');
  readoutEl = document.getElementById('readout');
  onGo = go || onGo;

  wordsEl.textContent = '';
  words = [];

  for (const p of pages) {
    const b = document.createElement('span');
    b.className = 'word';
    b.dataset.page = p.id;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = p.label;
    b.appendChild(label);

    b.addEventListener('click', () => show(p.id));
    wordsEl.appendChild(b);
    words.push(b);
  }

  position();

  let raf = 0;
  addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; position(); });
  });
}

export function position() {
  const space = width(' ');
  let x = innerWidth / 3;                 // the row begins a third of the way across
  for (const el of words) {
    el.style.left = x + 'px';
    x += width(el.textContent) + space;   // one space between words
  }
}

export function show(id) {
  at = id;
  for (const b of words) {
    b.setAttribute('aria-current', b.dataset.page === id ? 'true' : 'false');
    const el = document.getElementById('page-' + b.dataset.page);
    if (el) el.hidden = b.dataset.page !== id;
  }
  onGo(id);
}

export function readout(text) {
  if (readoutEl) readoutEl.textContent = text || '';
}
