// opo7 — the map.
//
// A solid grid, and it holds still.
//
// Iteration three built a brick wall and put water under it: a spring holding
// each piece to its cell, a curl field wandering it a couple of pixels around
// home, and a ripple that ran outward when one of them swelled. 4.1 kept all of
// it, plus a line of cards that toppled one by one on the way in. Every one of
// those is gone here. There is no spring, no wander, no ripple, no topple, and
// the cursor does not push — a piece is put in its cell on lay() and stays in
// it until the window changes size.
//
// What is left is one number per piece: how far it has come up out of the
// ground, and how big it is drawn. Both are transforms. A settled grid runs no
// arithmetic at all — step() returns on the first line once everything has
// arrived and nothing is hovered.
//
// Two things still move, and both are answers to something you did:
//   holding one   it grows a little, over its neighbours. They do not move.
//   opening one   it grows where it sits and the rest dim back. In 4.1 this
//                 shoved every overlapping neighbour clear; that is EXPAND_PUSH
//                 in config and it is 0. Set it to 1.12 to have it back.

// Its numbers, which were in config.js before there was no config.js.

const GAP  = 4;    // the joint between cells, px
const EDGE = 10;   // margin around the whole grid

// How a cell gets its shape.
//   'proportional'  every cell is the shape its file already is. Rows are
//                   justified and the row height solved so they fill the frame.
//                   Nothing is ever cropped.
//   'uniform'       one cell size for everything, and the file cropped into it.
const CELLS = 'proportional';

const CELL_ASPECT = 1;      // the shape a uniform cell aims for, w / h
const ORPHAN_COST = 0.06;   // what a hole in the last row costs in the search
const LAST_ROW = 'stretch'; // stretch | center | left
const FIT = 'contain';      // nothing here is cropped

// What decides the order pieces are dealt in, reading left to right.
//   'hue'      by average colour, so the field reads as a gradient
//   'name'     by filename
//   'shuffle'  random, re-drawn on every lay
const ORDER = 'hue';

const RAISE_MS   = 420;  // how long one piece takes to come up
const RAISE_STEP = 9;    // ms between one piece and the next. 0 = all at once

const HOLD_GROW = 1.10;  // how much bigger a piece under the cursor gets
const HOLD_EASE = 0.16;  // how fast it gets there

const EXPAND_FRAC = 0.82;  // of the room available to it
const EXPAND_GAP  = 26;    // air around an opened piece
const EASE_SIZE   = 0.14;  // how fast it grows
const DIM         = 0.22;  // what the rest of the grid fades back to

// The shove, kept reachable. Iteration one pushed every overlapping neighbour
// clear along whichever axis it overlapped least. 0 is off; 1.12 is 4.1's.
const EXPAND_PUSH = 0;
const EASE_NODE   = 0.16;  // how fast a pushed neighbour travels

import { grid, justified } from './grid.js';

let mapEl, items = [], hooks = {};
let mode = 'idle';            // idle | live
let hovered = null;
let expanded = null;
let order = null;             // which piece takes which cell, kept between lays
let needsLay = false;         // a frame finally exists, or a shape arrived
let pendingRaise = false;     // the grid is dealt but the pieces have not come up
let settled = false;          // nothing left to ease; step() can return early

export const held = () => (hovered == null ? null : items[hovered].piece);
export const open = () => (expanded == null ? null : items[expanded].piece);

const size = () => ({ w: mapEl.clientWidth, h: mapEl.clientHeight });

/* ---------- building ---------- */

export function bind(el, h) {
  mapEl = el;
  hooks = h || {};

  // Anywhere that is not a piece closes the open one. The pieces stop the
  // event themselves, so this only ever sees the ground between them.
  mapEl.addEventListener('click', e => {
    if (expanded != null && !e.target.closest('.piece')) collapse();
  });
}

// The pieces to lay. Set by build(); each is { name, src }.
let pool = [];

export function build(files) {
  pool = files || pool;
  mapEl.textContent = '';
  items = [];

  for (const p of pool) {
    const el = document.createElement('figure');
    el.className = 'piece';

    const media = document.createElement('img');
    media.src = p.src;
    media.alt = p.name;
    media.decoding = 'async';
    el.appendChild(media);

    const it = {
      piece: p, el, media,
      home: { x: 0, y: 0, w: 200, h: 120 },
      x: 0, y: 0,
      ox: 0, oy: 0,                        // displacement, only if EXPAND_PUSH is on
      hold: 0,
      dim: 1,                              // 1 lit, DIM while another is open
      scale: 1, openScale: 1,
      raise: 0, raiseAt: 0,                // 0 → 1 as it comes up out of the ground
      // A guess until the file loads and measure() below reads the real one. In
      // proportional cells the shape *is* the layout, so this is what the whole
      // row it lands in gets rebuilt from.
      aspect: 16 / 9,
    };

    const measure = () => {
      const nw = media.naturalWidth, nh = media.naturalHeight;
      if (!nw || !nh) return;
      const a = nw / nh;
      if (Math.abs(a - it.aspect) < 0.001) return;
      it.aspect = a;
      // In proportional cells the shape *is* the layout, so a file reporting a
      // shape we guessed wrong changes the whole row it sits in. Uniform cells
      // do not care — every cell is the same size whatever the file is.
      if (CELLS === 'proportional') needsLay = true;
    };
    media.addEventListener('load', measure);
    media.addEventListener('loadedmetadata', measure);

    el.addEventListener('pointerenter', () => hold(items.indexOf(it)));
    el.addEventListener('pointerleave', () => {
      if (hovered != null && items[hovered] === it) hold(null);
    });
    el.addEventListener('click', e => {
      e.stopPropagation();                       // the ground closes; a piece opens
      const i = items.indexOf(it);
      // While one is open, a click anywhere else only ever closes it. The rest
      // of the grid is still lying there under the dim, and letting a click
      // land on a neighbour meant you could never put a piece down without
      // picking another one up.
      if (expanded != null) { collapse(); return; }
      expand(i);
    });

    mapEl.appendChild(el);
    if (media.tagName === 'VIDEO') media.play().catch(() => {});
    items.push(it);
  }
  mapEl.dataset.fit = FIT;
}

/* ---------- arriving ---------- */

// No line of cards and no topple. The grid is dealt, and then the pieces come
// up out of the ground in reading order — which, because the order is by hue,
// runs the gradient across the grid as it fills.
//
// The arrival is *asked for* here and scheduled by lay(), because lay() is
// allowed to fail: a page that has only just been unhidden can measure 0×0, and
// there is then no grid to come up out of anything. Leaving the request
// standing means the first lay() that does find a frame runs the arrival, and
// nothing here has to assume it worked.
export function enter() {
  mode = 'live';
  settled = false;
  pendingRaise = true;
  mapEl.classList.add('on');
  lay(true);
  layout();
}

function raise(now) {
  order.forEach((idx, k) => {
    const it = items[idx];
    it.raise = 0;
    it.raiseAt = now + k * RAISE_STEP;
  });
  pendingRaise = false;
}

// One cell each, all the same size, filling the frame.
export function lay(reshuffle) {
  const { w, h } = size();
  // Nothing can be laid out in a frame with no size — and there are ways to get
  // one: building while the page is still hidden, a window dragged to nothing,
  // or a tab the browser has not given a viewport yet. grid() rightly returns
  // no cells for it, so ask again when there is somewhere to put them.
  if (w <= 0 || h <= 0) { needsLay = true; return; }
  if (!order || reshuffle) order = deal();

  const cells = CELLS === 'proportional'
    ? justified(w - EDGE * 2, h - EDGE * 2, order.map(i => items[i].aspect), { gap: GAP })
    : grid(w - EDGE * 2, h - EDGE * 2, order.length, {
        gap: GAP, aspect: CELL_ASPECT, orphanCost: ORPHAN_COST, lastRow: LAST_ROW,
      });
  if (!cells.length) { needsLay = true; return; }

  order.forEach((idx, k) => {
    const it = items[idx], c = cells[k];
    it.home = {
      x: EDGE + c.x + c.w / 2,
      y: EDGE + c.y + c.h / 2,
      w: c.w,
      h: c.h,
    };
    it.x = it.home.x; it.y = it.home.y;      // placed, not eased towards
    it.ox = it.oy = 0;
    // The element is given its real size here and nowhere else. Everything
    // afterwards — coming up, the hold, opening — is a transform, so no frame
    // of any animation asks the browser to lay the page out again.
    it.el.style.width = it.home.w + 'px';
    it.el.style.height = it.home.h + 'px';
    it.el.style.zIndex = '100';
  });
  needsLay = false;
  settled = false;
  if (pendingRaise) raise(performance.now());
  if (mode === 'idle') mode = 'live';
}

// The average colour of a piece, off an 8x8 draw of it. Cheap, and plenty to
// tell one end of the spectrum from the other. Only measurable once the file
// has loaded, so a piece that has not is parked at the end until it has.
function hueOf(it) {
  if (it.hue !== undefined) return it.hue;
  const m = it.media;
  if (!m.complete || !m.naturalWidth) return null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(m, 0, 0, 8, 8);
    const d = cx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    r /= n * 255; g /= n * 255; b /= n * 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b), c2 = max - min;
    let h = 0;
    if (c2 > 0.02) {                       // a grey has no hue worth sorting on
      if (max === r) h = ((g - b) / c2 + 6) % 6;
      else if (max === g) h = (b - r) / c2 + 2;
      else h = (r - g) / c2 + 4;
      h /= 6;
    } else {
      h = -1 + max;                        // greys first, darkest to lightest
    }
    it.hue = h;
    return h;
  } catch (e) { return null; }
}

function deal() {
  const n = items.length;
  const idx = items.map((_, i) => i);
  if (ORDER === 'hue') {
    return idx.sort((a, b) => {
      const ha = hueOf(items[a]), hb = hueOf(items[b]);
      if (ha == null && hb == null) return 0;
      if (ha == null) return 1;            // not loaded yet: park it at the end
      if (hb == null) return -1;
      return ha - hb;
    });
  }
  if (ORDER === 'name') {
    return idx.sort((a, b) =>
      String(items[a].piece.name).localeCompare(String(items[b].piece.name)));
  }
  for (let i = n - 1; i > 0; i--) {          // shuffle
    const j = (Math.random() * (i + 1)) | 0;
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

/* ---------- looking ---------- */

function hold(i) {
  if (hovered === i || expanded != null) return;
  hovered = i;
  settled = false;
  if (hooks.hover) hooks.hover(i == null ? null : items[i].piece);
}

export function release() { hold(null); }

/* ---------- opening ---------- */

// Iteration one's push, kept for EXPAND_PUSH: move `other` clear of `rect`
// along whichever axis it overlaps least, and return the displacement.
function clearOf(rect, other) {
  const ax0 = rect.x - EXPAND_GAP, ay0 = rect.y - EXPAND_GAP;
  const ax1 = rect.x + rect.w + EXPAND_GAP, ay1 = rect.y + rect.h + EXPAND_GAP;
  const bx0 = other.x, by0 = other.y;
  const bx1 = other.x + other.w, by1 = other.y + other.h;

  const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
  const oy = Math.min(ay1, by1) - Math.max(ay0, by0);
  if (ox <= 0 || oy <= 0) return { dx: 0, dy: 0 };

  if (ox < oy) {
    const dir = (bx0 + bx1) / 2 < (ax0 + ax1) / 2 ? -1 : 1;
    return { dx: dir * ox * EXPAND_PUSH, dy: 0 };
  }
  const dir = (by0 + by1) / 2 < (ay0 + ay1) / 2 ? -1 : 1;
  return { dx: 0, dy: dir * oy * EXPAND_PUSH };
}

// What an opened piece grows to: as big as fits, at its own proportions.
function openSize(it) {
  const { w, h } = size();
  // a piece that brought a readme with it shares the frame with the panel
  const room = w;
  const maxW = room * EXPAND_FRAC;
  const maxH = h * EXPAND_FRAC;
  let ew = maxW, eh = ew / it.aspect;
  if (eh > maxH) { eh = maxH; ew = eh * it.aspect; }
  return { w: ew, h: eh };
}

export function expand(i) {
  const it = items[i];
  if (!it) return;
  expanded = i;
  hovered = null;
  settled = false;

  const { w, h } = size();
  const s = openSize(it);

  // it grows where it sits, only pulled back inside the frame
  const left = s.w / 2 + EDGE;
  const cx = Math.max(left, Math.min(w - s.w / 2 - EDGE, it.x));
  const cy = Math.max(s.h / 2 + EDGE, Math.min(h - s.h / 2 - EDGE, it.y));
  it.home.x = cx; it.home.y = cy;              // the cell stays the base size
  it.x = cx; it.y = cy;
  // An opened piece is shown whole, whatever FIT says: a crop is right for a
  // cell in a grid and wrong for the thing you asked to look at.
  // The element is cell-shaped and the file is not, so the scale is taken from
  // whichever axis needs the most — which leaves the element larger than the
  // picture on the other one. That surround is invisible (an open piece drops
  // its border and its ground in the stylesheet) but it is still part of the
  // element, and it was swallowing clicks: a 712×798 box around a 699×393
  // picture means the ground either side of an open video is not the ground,
  // and clicking there did nothing instead of closing.
  //
  // So the *picture* is given the size, not just the box. These are in the
  // element's own unscaled units, so that once the scale lands the picture
  // measures exactly s.w × s.h on screen. The stylesheet centres it and hands
  // the clicks back: the box is pointer-events: none, the picture is not.
  it.openScale = Math.max(s.w / Math.max(1, it.home.w), s.h / Math.max(1, it.home.h));
  it.media.style.width  = (s.w / it.openScale) + 'px';
  it.media.style.height = (s.h / it.openScale) + 'px';
  it.ox = it.oy = 0;
  it.el.style.zIndex = '800';
  it.el.classList.add('open');

  if (EXPAND_PUSH) {
    const rect = { x: cx - s.w / 2, y: cy - s.h / 2, w: s.w, h: s.h };
    for (let j = 0; j < items.length; j++) {
      if (j === i) continue;
      const o = items[j];
      const box = { x: o.home.x - o.home.w / 2, y: o.home.y - o.home.h / 2,
                    w: o.home.w, h: o.home.h };
      const d = clearOf(rect, box);
      o.ox = d.dx; o.oy = d.dy;
    }
  }

  if (false) {
    // the real file now, but still muted — nothing ever starts making noise on
    // its own. The controls are there for the viewer to turn it up.
    if (it.media.getAttribute('src') !== it.piece.src) it.media.src = it.piece.src;
    it.media.controls = true;
    it.media.loop = true;
    it.media.muted = true;

    it.media.play().catch(() => {});
  } else if (it.media.getAttribute('src') !== it.piece.src) {
    // the field shows a 480px proxy; opened, it is worth the real file
    it.media.src = it.piece.src;
  }
  mapEl.classList.add('opened');
  if (hooks.opened) hooks.opened(it.piece);
}

export function collapse() {
  if (expanded == null) return;
  const it = items[expanded];

  it.el.style.zIndex = '100';
  it.el.classList.remove('open');
  it.media.style.width = '';               // back to filling its cell
  it.media.style.height = '';
  it.openScale = 1;
  expanded = null;
  settled = false;

  for (const o of items) { o.ox = 0; o.oy = 0; }
  lay();                                   // straight back into the grid
  mapEl.classList.remove('opened');
  if (hooks.closed) hooks.closed();
}

export const isOpen = () => expanded != null;

// Back to the word: stand everything down so entering again builds it fresh.
export function reset() {
  collapse();

  mode = 'idle';
  order = null;
  settled = false;
  mapEl.classList.remove('on');
}

/* ---------- frame ---------- */

// A settled grid costs nothing. Once every piece is up, nothing is hovered and
// nothing is open, there is no arithmetic left to do and no transform left to
// write, so this returns on its first line until something changes.
export function step(now) {
  if (mode === 'idle' || !items.length) return;
  if (needsLay && expanded == null) lay();
  if (settled) return;

  let busy = false;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];

    if (it.raise < 1) {
      const t = (now - it.raiseAt) / Math.max(1, RAISE_MS);
      it.raise = t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3);   // ease out
      if (it.raise < 1) busy = true;
    }

    // One number carries every size change there is: the lift on hover and the
    // opening. A transform costs the compositor nothing, where width and height
    // cost a layout.
    const want = i === hovered ? 1 : 0;
    if (it.hold !== want) {
      it.hold += (want - it.hold) * HOLD_EASE;
      if (Math.abs(want - it.hold) < 0.002) it.hold = want;
      else busy = true;
    }

    // While one is open the rest step back. This is eased here rather than left
    // to a stylesheet: layout() writes opacity inline every frame for the
    // arrival, and an inline value beats any rule a stylesheet could set.
    const wantDim = (expanded != null && i !== expanded) ? DIM : 1;
    if (it.dim !== wantDim) {
      it.dim += (wantDim - it.dim) * EASE_SIZE;
      if (Math.abs(wantDim - it.dim) < 0.004) it.dim = wantDim;
      else busy = true;
    }

    let ts = 1;
    if (i === expanded) ts = it.openScale;
    else if (it.hold > 0) ts = 1 + (HOLD_GROW - 1) * it.hold;
    it.scale += (ts - it.scale) * EASE_SIZE;
    if (Math.abs(ts - it.scale) < 0.0005) it.scale = ts; else busy = true;

    // the shove, when it is switched on. Off, this is two adds of zero.
    if (EXPAND_PUSH) {
      const hx = it.home.x + it.ox, hy = it.home.y + it.oy;
      if (Math.abs(hx - it.x) > 0.1 || Math.abs(hy - it.y) > 0.1) {
        it.x += (hx - it.x) * EASE_NODE;
        it.y += (hy - it.y) * EASE_NODE;
        busy = true;
      } else { it.x = hx; it.y = hy; }
    }

    it.el.style.zIndex = i === expanded ? '800' : (it.hold > 0.5 ? '400' : '100');
  }

  layout();
  settled = !busy;
}

function layout() {
  if (!order) return;          // nothing has a cell yet; there is nothing to write
  for (const it of items) {
    // The element's own size never changes here — only where it is, how far it
    // has come up, and how big it is drawn.
    //
    // The translate uses the element's *unscaled* half size on purpose.
    // scale() runs about the centre (transform-origin is 50% 50%), so putting
    // the centre on (x, y) is enough — the growth happens around it. Offsetting
    // by the scaled half size as well counts it twice, and the piece slides
    // sideways as it grows: invisible at rest, hundreds of pixels out at the
    // size an opened piece reaches.
    it.el.style.opacity = it.raise * it.dim;
    it.el.style.transform =
      `translate(${it.x - it.home.w / 2}px, ${it.y - it.home.h / 2}px) ` +
      `scale(${it.scale})`;
  }
}

/* ---------- window ---------- */

// The grid drives itself. It used to be stepped by main.js's frame loop and
// told when to come up, and either could be forgotten at the call site — the
// reel was, and simply never started. A hidden page has no offsetParent, so the
// map can see for itself whether it is being looked at.
let running = false;
const onScreen = () => !!mapEl && mapEl.offsetParent !== null;

function loop(now) {
  requestAnimationFrame(loop);
  if (!onScreen()) return;
  if (mode === 'idle') enter();        // first time it is actually on screen
  step(now);
}

export function start() {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
  let raf = 0;
  addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { raf = 0; if (onScreen()) reflow(); });
  });
}

export function reflow() {
  if (mode !== 'live') return;
  if (expanded != null) { collapse(); return; }
  lay();
  for (const it of items) it.raise = 1;    // already here; do not come up again
  layout();
}
