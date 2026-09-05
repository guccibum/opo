import * as player from './player.js';

// opo7 — the reel.
//
// Iteration two's cover flow, brought back: flat covers standing in a row in
// 3d, turned to face the middle, the one in front square on, with a reflection
// under it.
//
// It turns the way a rotating tie rack does — one constant speed, always
// moving, never arriving. There is no per-cover step and nothing settles: a
// cover comes to the front, is square on for an instant, and keeps going.
// Stopping to look is rewarded: hovering halts the reel, turns that cover
// toward you and brings it forward, and the name underneath reads out that file.
//
// What it carried before and does not now: the readmes, the titles, the dates,
// and the readout in the corner. A piece has its filename under it and nothing
// else.

/* ---------- tuning ---------- */
// Iteration two's numbers, unchanged.

const COVER_W = 340;   // widest a cover may be
const COVER_H = 340;   // tallest a cover may be, and the fallback shape

const SPREAD  = 165;   // px between two neighbouring side covers
const GUTTER  = 170;   // extra px the centre cover pushes its neighbours out by
const DEPTH   = 290;   // how far back a side cover sits
const ANGLE   = 62;    // degrees a side cover is turned

// How the turn is paced as a cover crosses the front.
//   'constant'  one steady rate the whole way through. Nothing pauses on the
//               centre — the reel turns like a tie rack, which is the point.
//   'eased'     smoothstep. Flat at both ends, so a cover's rate of turn falls
//               to nothing exactly as it arrives and it hangs there square on.
const TURN    = 'constant';
const SHRINK  = 0.10;
const VISIBLE = 2.4;   // covers each side before they fade
const FADE    = 0.8;

const EASE_POS = 0.10; // how fast it catches a cover you asked for
const SNAP     = 0.0006;
const DRIFT    = 0.14; // covers per second it turns. never arrives
const DRIFT_EASE = 0.14;

// How long it holds still before it starts turning again. Two of them, because
// pushing the reel somewhere and merely looking at a cover are different acts:
// a swipe is a decision and deserves a beat to see where it landed; letting go
// of a cover is not.
const RESUME_MS       = 700;
const RESUME_HOVER_MS = 90;
const WRAP = true;

const HOLD_GROW = 1.11;   // how much a held cover grows
const HOLD_LIFT = 85;     // px it comes forward
const HOLD_FLAT = 0.70;   // how much of its turn it gives up
const HOLD_EASE = 0.055;

const WHEEL_PER_COVER = 240;

// Where in a file the still is taken from. Nothing is downloaded but the
// headers and one frame's worth of bytes — serve.py answers byte ranges, so a
// 300MB file costs a few hundred kilobytes to show a picture of.
const STILL_AT = 0.12;

/* ---------- state ---------- */

let flowEl, rail, nameEl, items = [];
let pos = 0, target = 0, last = null, reported = -1;
let touched = -1e9, resumeFor = RESUME_MS, speed = DRIFT, lastT = 0;
let hovered = null, paused = false, drag = null, dragged = false;
let running = false, bound = false;

const wrapIndex = i => {
  const n = items.length;
  if (!n) return 0;
  return WRAP ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
};
const index = () => wrapIndex(Math.round(pos));
const current = () => items[index()];
const held = () => (hovered == null ? null : items[hovered]);

/* ---------- building ---------- */

export function build(mount, dir, names) {
  flowEl = document.createElement('div');
  flowEl.className = 'flow';
  rail = document.createElement('div');
  rail.className = 'rail';
  flowEl.appendChild(rail);

  nameEl = document.createElement('p');
  nameEl.className = 'reel-name';
  const inner = document.createElement('span');
  inner.className = 's';
  nameEl.appendChild(inner);

  mount.textContent = '';
  mount.append(flowEl, nameEl);

  flowEl.style.setProperty('--cover-w', COVER_W + 'px');
  flowEl.style.setProperty('--cover-h', COVER_H + 'px');

  flowEl.addEventListener('wheel', onWheel, { passive: false });
  flowEl.addEventListener('pointerdown', onDown);
  // On the window, so a drag that leaves the reel still finishes — and added
  // once, because the reel is a single thing and a second build() would
  // otherwise leave the first set attached and moving it twice per pointer.
  if (!bound) {
    bound = true;
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }

  items = [];
  for (const name of names) {
    const el = document.createElement('figure');
    el.className = 'cover';

    const face = document.createElement('div');
    face.className = 'face';

    const v = document.createElement('video');
    v.src = dir + '/' + name;
    v.muted = true; v.playsInline = true; v.loop = true;
    v.preload = 'metadata';

    // A cover is the shape of what is on it, and one frame of it is fetched so
    // there is something to look at without streaming the file.
    v.addEventListener('loadedmetadata', () => {
      if (v.videoWidth && v.videoHeight) {
        const w = Math.min(COVER_W, COVER_H * (v.videoWidth / v.videoHeight));
        el.style.setProperty('--cover-w', w + 'px');
        el.style.setProperty('--cover-h', (w / (v.videoWidth / v.videoHeight)) + 'px');
      }
      if (v.duration && isFinite(v.duration)) v.currentTime = v.duration * STILL_AT;
    }, { once: true });

    face.appendChild(v);
    el.appendChild(face);

    // pressing a cover opens it, larger, from the top
    el.addEventListener('click', () => {
      if (dragged) return;
      const was = paused;
      pause(true);                              // the reel holds while you watch
      player.open({ src: dir + '/' + name, name, kind: 'video', from: el,
                    closed: () => pause(was) });
    });
    el.addEventListener('pointerenter', () => hold(items.findIndex(x => x.el === el)));
    el.addEventListener('pointerleave', () => {
      if (hovered != null && items[hovered].el === el) hold(null);
    });

    rail.appendChild(el);
    items.push({ name, el, media: v, lift: 0 });
  }

  pos = target = 0;
  last = null; reported = 0;
  layout();
  readName(current());

  if (!running) { running = true; requestAnimationFrame(loop); }
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
    // `a` is smoothstep and drives where a cover *is*; a straight ramp there
    // puts a corner at the front and reads as a bounce. `turn` is straight, and
    // drives the rotation only — smoothstep there made a cover's rate of turn
    // fall to nothing as it arrived, and it hung square on before picking up.
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

// A hidden page has no offsetParent, so the reel knows on its own whether it is
// being looked at and stops when it is not. It used to be told by main.js, and
// when that wiring was left out it simply never started.
const onScreen = () => !!flowEl && flowEl.offsetParent !== null;

export function pause(on) {
  const was = paused;
  paused = on;
  if (on) hold(null);
  else if (was) touch();
}

function readName(it) {
  if (nameEl) nameEl.firstChild.textContent = it ? it.name : '';
}

function hold(i) {
  if (hovered === i) return;
  hovered = i;
  if (i == null) { touch(RESUME_HOVER_MS); readName(current()); }
  else readName(items[i]);
}

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

// what it is doing, for the console
export const state = () => ({
  paused, onScreen: onScreen(), hovered, speed: +speed.toFixed(4),
  pos: +pos.toFixed(3), target: +target.toFixed(3), covers: items.length,
  front: current() ? current().name : null,
});

/* ---------- frame ---------- */

// Exported so a frame can be driven by hand; a browser that has parked
// requestAnimationFrame is otherwise impossible to check.
export function step(now) {
  if (arguments.length) tick(now); else tick(performance.now());
}

function tick(now) {
  if (!items.length) return;

  // capped: a backgrounded tab hands back an enormous delta and the reel lurches
  const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 0;
  lastT = now;

  // the turning is a speed, not a step: it is never at rest on a cover and
  // never decelerates into one
  const stopped = paused || document.hidden || !onScreen() || hovered != null
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
    if (hovered == null) readName(current());   // a hold owns the name
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  tick(now);
}
