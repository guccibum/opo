// opo4.1 — selected works.
//
// Iteration two, rebuilt, holding only the three projects that came with a
// readme. A cover flow: flat covers standing in a row in 3d, turned to face the
// middle, the one in front square on, with a reflection under it.
//
// It turns the way a rotating tie rack does — one constant speed, always
// moving, never arriving. There is no per-cover step and nothing settles: a
// cover comes to the front, is square on for an instant, and keeps going.
// Stopping to look is rewarded: hovering halts the reel, turns that cover
// toward you and brings it forward, and the caption reads out that project.

import {
  COVER_W, COVER_H, SPREAD, GUTTER, DEPTH, ANGLE, SHRINK, VISIBLE, FADE,
  EASE_POS, SNAP, DRIFT, DRIFT_EASE, RESUME_MS, RESUME_HOVER_MS, WRAP,
  WHEEL_PER_COVER, TURN,
  REEL_HOLD_GROW as HOLD_GROW, HOLD_LIFT, HOLD_FLAT,
  REEL_HOLD_EASE as HOLD_EASE,
} from './config.js';
import * as audio from './audio.js';
import { boxAspect, fitInset } from './inset.js';

let flowEl, rail, items = [];
let pos = 0, target = 0, last = null, reported = -1;
let touched = -1e9, resumeFor = RESUME_MS, speed = DRIFT, lastT = 0;
let hovered = null, paused = false, drag = null, dragged = false;
let onChange = () => {}, onOpen = () => {};

export const count = () => items.length;
// which cover is in front — read from where the reel is, not from where it was
// asked to go, so the caption changes as covers pass
export const index = () => wrapIndex(Math.round(pos));
export const current = () => items[index()] && items[index()].work;
export const held = () => (hovered == null ? null : items[hovered].work);

function wrapIndex(i) {
  const n = items.length;
  if (!n) return 0;
  return WRAP ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
}

/* ---------- building ---------- */

export function bind(el, hooks) {
  flowEl = el;
  rail = document.getElementById('rail');
  onChange = hooks.change || onChange;
  onOpen = hooks.open || onOpen;

  flowEl.style.setProperty('--cover-w', COVER_W + 'px');
  flowEl.style.setProperty('--cover-h', COVER_H + 'px');

  flowEl.addEventListener('wheel', onWheel, { passive: false });
  flowEl.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
}

export function build(works) {
  rail.textContent = '';
  items = [];

  for (const w of works) {
    const el = document.createElement('figure');
    el.className = 'cover';

    const face = document.createElement('div');
    face.className = 'face';

    // the small silent loop, never the 300MB original
    const v = document.createElement('video');
    v.src = w.piece.clip || w.piece.src;
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    if (w.piece.poster) v.poster = w.piece.poster;
    v.addEventListener('canplay', () => { if (v.paused) v.play().catch(() => {}); });
    audio.register(v);
    face.appendChild(v);

    // A cover is the shape of what is on it. Fitted inside the COVER_W ×
    // COVER_H box so a portrait clip cannot grow taller than a landscape one is
    // wide, and re-read once the file says what it actually is.
    const shape = aspect => {
      if (!aspect || !isFinite(aspect)) return;
      const w2 = Math.min(COVER_W, COVER_H * aspect);
      el.style.setProperty('--cover-w', w2 + 'px');
      el.style.setProperty('--cover-h', (w2 / aspect) + 'px');
    };
    // the picture's shape, not the file's — most of these are padded
    const c = w.piece.colour;
    shape(boxAspect(w.piece, c && c.iw && c.ih ? c.iw / c.ih : 16 / 9));
    fitInset(v, w.piece);
    v.addEventListener('loadedmetadata', () => {
      if (!w.piece.box && v.videoWidth && v.videoHeight) {
        shape(v.videoWidth / v.videoHeight);
      }
    });

    el.appendChild(face);
    el.addEventListener('click', () => { if (!dragged) onOpen(w); });
    el.addEventListener('pointerenter', () => hold(items.findIndex(x => x.el === el)));
    el.addEventListener('pointerleave', () => {
      if (hovered != null && items[hovered].el === el) hold(null);
    });

    rail.appendChild(el);
    v.play().catch(() => {});
    items.push({ work: w, el, media: v, lift: 0 });
  }

  pos = target = 0;
  last = null; reported = 0;
  layout();
  onChange(current(), 0);
}

/* ---------- geometry ---------- */

// signed distance from the front, the short way round
function offsetOf(i) {
  const n = items.length;
  if (!n) return 0;
  if (!WRAP) return i - pos;
  const half = n / 2;
  return ((i - pos + half) % n + n) % n - half;
}

function layout() {
  const n = items.length;
  // a cover has to be gone before it reaches the seam, or it teleports
  const seam = n / 2;
  const fadeEnd = WRAP ? Math.min(VISIBLE + FADE, seam) : VISIBLE + FADE;
  const fadeStart = Math.max(0.4, fadeEnd - FADE);
  const span = Math.max(0.01, fadeEnd - fadeStart);

  for (let i = 0; i < n; i++) {
    const it = items[i];
    const o = offsetOf(i);
    const s = Math.sign(o);

    // Two ramps, because the arrangement and the turn want different things.
    //
    // `a` is smoothstep and drives where a cover *is* — how far out it is
    // pushed, how far back it sits, how much it shrinks. A straight ramp there
    // puts a corner at the front: a cover would come forward at a constant rate
    // and start receding the instant it arrived, which reads as a bounce.
    //
    // `turn` is straight, and drives the rotation only. Smoothstep is flat at
    // both ends, so a cover's *rate of turn* fell to nothing as it reached the
    // front — it hung there square on, then picked up again. That is the stall.
    // Linear in t means s * t * ANGLE is just o * ANGLE across the whole middle
    // of the reel, so the turn passes through the front at a constant rate and
    // never pauses on anything. TURN in config puts the old easing back.
    const t = Math.min(Math.abs(o), 1);
    const a = t * t * (3 - 2 * t);
    const turn = TURN === 'eased' ? a : t;
    const L = it.lift;

    const x  = o * SPREAD + s * GUTTER * a;
    const z  = -a * DEPTH + HOLD_LIFT * L;
    const ry = s * turn * ANGLE * (1 - HOLD_FLAT * L);
    const sc = (1 - a * SHRINK) * (1 + (HOLD_GROW - 1) * L);

    it.el.style.transform =
      `translate(-50%, -50%) translateX(${x}px) translateZ(${z}px) ` +
      `rotateY(${ry}deg) scale(${sc})`;
    it.el.style.zIndex = String(1000 - Math.round(Math.abs(o) * 10) + Math.round(L * 500));

    const d = Math.abs(o);
    let op = d <= fadeStart ? 1 : Math.max(0, 1 - (d - fadeStart) / span);
    op = op + (1 - op) * L;                  // a held cover comes fully back
    it.el.style.opacity = String(op);
    it.el.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
    it.el.classList.toggle('center', d < 0.5);
  }
}

/* ---------- movement ---------- */

// `ms` is how long this particular touch should hold the reel for — a swipe
// buys the full pause, letting go of a cover buys almost none.
const touch = ms => {
  touched = performance.now();
  resumeFor = ms == null ? RESUME_MS : ms;
};

export function pause(on) {
  const was = paused;
  paused = on;
  if (on) hold(null);
  // only a real un-pause restarts the resume clock; booting must not cost the
  // reel a standing start
  else if (was) touch();
}

function hold(i) {
  if (hovered === i) return;
  hovered = i;
  if (i == null) { touch(RESUME_HOVER_MS); onChange(current(), index()); }
  else onChange(items[i].work, i);
}

export function go(n) { target += n; touch(); }

function onWheel(e) {
  e.preventDefault();
  // a swipe pushes the reel along and leaves it there; nothing snaps
  const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  target += d / WHEEL_PER_COVER;
  touch();
}

function onDown(e) {
  if (e.button !== 0) return;
  drag = { x: e.clientX, start: target, moved: false };
}
function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 3) drag.moved = true;
  target = drag.start - dx / (SPREAD + GUTTER);
  touch();
}
function onUp() {
  if (!drag) return;
  dragged = drag.moved;                    // that was a throw, not a choice
  drag = null;
  if (dragged) setTimeout(() => { dragged = false; }, 0);
  touch();
}

/* ---------- frame ---------- */

export function step(now) {
  if (!items.length) return;

  // capped: a backgrounded tab hands back an enormous delta and the reel lurches
  const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
  lastT = now;

  // the turning is a speed, not a step: it is never at rest on a cover and
  // never decelerates into one
  const stopped = paused || document.hidden || hovered != null
               || now - touched < resumeFor;
  speed += ((stopped ? 0 : DRIFT) - speed) * DRIFT_EASE;
  if (speed > 1e-5) target += speed * dt;

  pos += (target - pos) * EASE_POS;
  if (Math.abs(target - pos) < SNAP) pos = target;

  let lifting = false;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const want = i === hovered ? 1 : 0;
    if (it.lift !== want) {
      it.lift += (want - it.lift) * HOLD_EASE;
      if (Math.abs(want - it.lift) < 0.002) it.lift = want;
      lifting = true;
    }
  }

  if (pos !== last || lifting) { layout(); last = pos; }

  const i = index();
  if (i !== reported) {
    reported = i;
    if (hovered == null) onChange(current(), i);   // a hold owns the caption
  }
}
