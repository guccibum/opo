// opo7 — the top.
//
// Iteration two's row, to Space Agnostic's own arrangement: the words are not a
// flex row, they are placed absolutely from widths measured on a canvas rather
// than from the DOM. Consecutive words sit one space-character apart, and the
// row is centred — measured whole, then placed.
//
// Each word is two elements — an outer catch area that never moves, and the
// text inside it, which is the only thing that slides. A word that moved on its
// own hover would slide out from under the cursor, unhover itself, slide back,
// and flicker between the two states forever.
//
// The slide is theirs, moved: on their site a word drops when selected; here it
// drops when hovered.
//
// A word may carry children, and they are the same thing one size down on a
// second row underneath — measured the same way, sliding on hover the same way.

// The second row is centred on *its parent word*, not on the window, and it
// grows out of that word: the row's transform origin is put on the word itself,
// so scaling from nothing to full size reads as the row coming out of it, the
// way a window comes back out of the dock. Opening a word chooses none of its
// children — `work` reveals video, sculpture and image, and then it is up to
// you.
//
// A word's row is a toggle: pressing the word opens it, pressing the same word
// again shuts it. Landing on a page opens nothing — the first sight of the site
// is the three words and no more.
//
// Pressing a word that has children does not go anywhere. It offers what is
// under it, and one of those is what moves you — which is why `home` carries a
// `home` of its own. A word with no children has nothing to offer and so goes
// straight there.

const EDGE = 26;                        // px kept clear of the window, as #top has

let wordsEl, subEl, ctx = null, onGo = () => {};
let words = [];
let subs = new Map();                   // parent page id -> its child words
let at = null, branchAt = null;
let openAt = null;                      // whose row is showing, if any
let shutTimer = 0;

// Long enough to outlast the shrink in style.css. The row's words cannot be
// hidden the moment it is told to close — hiding them takes them out of the
// page at once and there is nothing left to animate, which is why closing used
// to just blink out while opening grew.
const SHUT_MS = 380;

export const page = () => at;
export const branch = () => branchAt;
export const opened = () => openAt;

function width(text, font) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

// The rows are placed from widths measured on a canvas, so the canvas has to be
// told exactly what the browser is about to set them in. Read back off the
// element rather than written down a second time here: a face named in
// style.css and the same face named in this file drift apart the moment one of
// them is changed, and the row quietly stops being centred. Changing the
// typeface is one line in style.css and nothing here.
function fontOf(el) {
  const s = getComputedStyle(el);
  return s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
}

// The labels are pulled along x by a css transform, which the canvas knows
// nothing about and which changes no element's layout width. Both have to be
// corrected for here: the row is spaced by the stretched widths, and each catch
// area is given the stretched width outright — otherwise the words are drawn
// four times as wide on top of one another, and only the left quarter of each
// one can be pointed at.
function stretchOf(el) {
  return parseFloat(getComputedStyle(el).getPropertyValue('--stretch')) || 1;
}

// One word: the catch area, and the label that is the only thing that moves.
function makeWord(into, cls, id, label, click) {
  const b = document.createElement('span');
  b.className = cls;
  b.dataset.page = id;

  const text = document.createElement('span');
  text.className = 'label';
  text.textContent = label;
  b.appendChild(text);

  b.addEventListener('click', click);
  into.appendChild(b);
  return b;
}

export function bind(pages, go) {
  wordsEl = document.getElementById('words');
  subEl = document.getElementById('subwords');
  onGo = go || onGo;

  wordsEl.textContent = '';
  subEl.textContent = '';
  words = [];
  subs = new Map();

  for (const p of pages) {
    // A word that carries children opens them and goes nowhere. One without any
    // has nothing to offer, so pressing it is the whole of the gesture.
    const press = p.children ? () => toggleRow(p.id)
                             : () => { closeRow(); show(p.id); };
    words.push(makeWord(wordsEl, 'word', p.id, p.label, press));
    if (!p.children) continue;
    // A child either names a page or does something. `control panel` is the
    // second kind: it opens the box rather than changing what is on screen, so
    // it never becomes the current branch and never hides its parent's page.
    subs.set(p.id, p.children.map(c =>
      makeWord(subEl, 'subword', c.id, c.label,
               c.action ? c.action : () => showBranch(p.id, c.id))));
  }

  position();                           // laid out at once, open or not

  let raf = 0;
  addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; position(); });
  });
}

// Centre one set of absolutely placed words on `mid`. The row has to be
// measured whole before any of it can be placed, because where it starts is not
// known until every word in it has been added up.
function lay(row, mid) {
  if (!row.length) return;
  const font = fontOf(row[0]);
  const k = stretchOf(row[0]);
  const space = width(' ', font) * k;
  const widths = row.map(el => width(el.textContent, font) * k);
  const total = widths.reduce((a, b) => a + b, 0) + space * (row.length - 1);

  // Centred on `mid`, unless that hangs it off an edge. A branch row is centred
  // on its parent word, and a word near the right of the window puts half of a
  // long row past the frame — so it is slid back inside and the centring is
  // given up only as far as it has to be. A row wider than the window itself
  // cannot be helped, and stays centred rather than being pinned to one side.
  let x = mid - total / 2;
  if (total + EDGE * 2 <= innerWidth) {
    x = Math.max(EDGE, Math.min(x, innerWidth - EDGE - total));
  }

  row.forEach((el, i) => {
    el.style.left = x + 'px';
    el.style.width = widths[i] + 'px';  // the catch area, as wide as it looks
    x += widths[i] + space;             // one space between words
  });
}

// Where a word sits across the window, from the numbers the row was laid out
// with rather than from the DOM — the label inside a hovered word has slid, and
// its rect would put the branch row 12px off every time you pointed at it.
function centreOf(el) {
  return (parseFloat(el.style.left) || 0)
       + width(el.textContent, fontOf(el)) * stretchOf(el) / 2;
}

// The point the branch row grows out of: its parent word, in the row's own
// coordinates. x is the word's centre — the row spans the window from 0, so a
// window x is already an element x. y is however far up the word sits.
function originOn(parentEl) {
  // subEl's `top` is a css number, measured down the document; a rect is
  // measured down the window. Since the rows scroll away with the page those
  // are not the same once anything has moved, so the rect is put back into
  // document space before the two are subtracted.
  const top = parseFloat(getComputedStyle(subEl).top) || 0;
  const r = parentEl.getBoundingClientRect();
  const mid = r.top + scrollY + r.height / 2;
  return centreOf(parentEl) + 'px ' + (mid - top) + 'px';
}

export function position() {
  lay(words, innerWidth / 2);

  // every set is laid out, not only the visible one: a hidden row still has to
  // be in the right place the instant its parent is clicked
  for (const [parent, kids] of subs) {
    const el = words.find(w => w.dataset.page === parent);
    if (!el) continue;
    lay(kids, centreOf(el));
    if (parent === openAt) subEl.style.transformOrigin = originOn(el);
  }
}

const showPage = (id, on) => {
  const el = document.getElementById('page-' + id);
  if (el) el.hidden = !on;
};

// Going somewhere. Only the page changes here — whether a row is open is a
// separate thing, and the two no longer move together.
export function show(id) {
  at = id;
  branchAt = null;

  for (const b of words) {
    const on = b.dataset.page === id;
    b.setAttribute('aria-current', on ? 'true' : 'false');
    showPage(b.dataset.page, on);
  }
  for (const kids of subs.values()) {
    for (const k of kids) {
      k.setAttribute('aria-current', 'false');
      showPage(k.dataset.page, false);
    }
  }

  onGo(id, null);
}

// Opening or shutting a word's row, and nothing else. A word that carries
// children does only this when pressed: it offers what is under it and stays
// where it is, and one of those children is what actually takes you somewhere.
export function toggleRow(id) {
  openAt = openAt === id ? null : id;
  paintRow();
}

export function closeRow() {
  if (openAt === null) return;
  openAt = null;
  paintRow();
}

function paintRow() {
  clearTimeout(shutTimer);
  position();                           // always: the rows are laid out whether
                                        // one of them is showing or not

  if (subs.has(openAt)) {
    // opening: the right words in place, and the origin moved onto the new word
    // *before* it is let out, or the growth starts from wherever the last one
    // grew from — position() above has just done that
    for (const [parent, kids] of subs) {
      for (const k of kids) k.hidden = parent !== openAt;
    }
    subEl.classList.add('on');
  } else {
    // Closing: it shrinks back into the word it came out of, so its words have
    // to stay in the page for as long as that takes. The origin is deliberately
    // left where it was — position() only moves it for a word that is open —
    // so it goes home rather than to somewhere new.
    subEl.classList.remove('on');
    shutTimer = setTimeout(() => {
      for (const kids of subs.values()) for (const k of kids) k.hidden = true;
    }, SHUT_MS);
  }
}

export function showBranch(parent, id) {
  show(parent);                         // the branch belongs to its parent
  branchAt = id;

  showPage(parent, false);              // and replaces its parent's page
  for (const k of subs.get(parent) || []) {
    const on = k.dataset.page === id;
    k.setAttribute('aria-current', on ? 'true' : 'false');
    showPage(k.dataset.page, on);
  }
  onGo(parent, id);
}
