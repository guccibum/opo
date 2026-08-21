// opo5 — the map.
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

import {
  GAP, EDGE, CELLS, FULL_RES, CELL_ASPECT, ORPHAN_COST, LAST_ROW, FIT, ORDER,
  RAISE_MS, RAISE_STEP, HOLD_GROW, HOLD_EASE,
  EXPAND_FRAC, EXPAND_GAP, EASE_SIZE, DIM, EXPAND_PUSH, EASE_NODE, NOTES_W,
} from './config.js';
import { grid, justified } from './grid.js';
import { byHue } from './hue.js';
import { state } from './store.js';
import * as audio from './audio.js';
import { boxAspect, fitInset } from './inset.js';

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

export function build() {
  mapEl.textContent = '';
  items = [];

  for (const p of state.pieces) {
    const el = document.createElement('figure');
    el.className = 'piece';

    let media;
    if (p.kind === 'video') {
      media = document.createElement('video');
      // the field plays the small silent loop, never the 300MB original
      media.src = p.clip || p.src;
      media.muted = true; media.loop = true; media.playsInline = true;
      media.autoplay = true; media.preload = 'auto';
      if (p.poster) media.poster = p.poster;
      media.addEventListener('canplay', () => { if (media.paused) media.play().catch(() => {}); });
      audio.register(media);
    } else {
      media = document.createElement('img');
      // the file itself, not the 480px proxy — see FULL_RES in config
      media.src = FULL_RES ? (p.src || p.poster) : (p.poster || p.src);
      media.alt = p.title || '';
    }
    el.appendChild(media);
    if (p.kind === 'video') fitInset(media, p);

    const it = {
      piece: p, el, media,
      home: { x: 0, y: 0, w: 200, h: 120 },
      x: 0, y: 0,
      ox: 0, oy: 0,                        // displacement, only if EXPAND_PUSH is on
      hold: 0,
      dim: 1,                              // 1 lit, DIM while another is open
      scale: 1, openScale: 1,
      raise: 0, raiseAt: 0,                // 0 → 1 as it comes up out of the ground
      // its real shape is already known — measureAll() loaded the poster to read
      // its colour. The grid does not need it to place anything (every cell is
      // the same), only to know what an opened piece grows to.
      // the picture's own shape. For a padded video that is the content box,
      // not the file's frame, so the cell is built to the picture.
      aspect: boxAspect(p, (p.colour && p.colour.iw && p.colour.ih)
        ? p.colour.iw / p.colour.ih : 16 / 9),
    };

    const measure = () => {
      const nw = media.naturalWidth || media.videoWidth;
      const nh = media.naturalHeight || media.videoHeight;
      if (!nw || !nh) return;
      if (it.piece.box) return;        // the box already says what shape it is
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

function deal() {
  const n = items.length;
  if (ORDER === 'hue') return byHue(items.map(it => it.piece));
  const idx = items.map((_, i) => i);
  if (ORDER === 'name') {
    return idx.sort((a, b) =>
      String(items[a].piece.title).localeCompare(String(items[b].piece.title)));
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
  const room = it.piece.notes ? Math.max(240, w - NOTES_W) : w;
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
  const left = (it.piece.notes ? NOTES_W : 0) + s.w / 2 + EDGE;
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

  if (it.piece.kind === 'video') {
    // the real file now, but still muted — nothing ever starts making noise on
    // its own. The controls are there for the viewer to turn it up.
    if (it.media.getAttribute('src') !== it.piece.src) it.media.src = it.piece.src;
    it.media.controls = true;
    it.media.loop = true;
    it.media.muted = true;
    audio.claim(it.media);
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

  if (it.piece.kind === 'video') {
    it.media.controls = false;
    it.media.muted = true;
    it.media.loop = true;
    if (it.piece.clip) it.media.src = it.piece.clip;   // back to the small loop
    it.media.play().catch(() => {});
  } else if (!FULL_RES && it.piece.poster) {
    it.media.src = it.piece.poster;      // back to the proxy for the field
  }
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
  audio.stopAll();
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

export function reflow() {
  if (mode !== 'live') return;
  if (expanded != null) { collapse(); return; }
  lay();
  for (const it of items) it.raise = 1;    // already here; do not come up again
  layout();
}
