// opo7 — the ground's control panel.
//
// A box you pick up and put anywhere, holding the four things worth a hand on
// them while the glitch is being dialled in: a pause, the throttle, the radius
// it works within, and a heal that puts the picture straight back — the
// reference sketches' delete key, given a word.
//
// It is reached from `control panel` under home, and it starts closed. Where it
// was left and where the sliders were set are remembered, because dialling
// something in across a page reload and finding it back at the defaults is the
// fastest way to stop bothering.

import * as ground from './ground.js';

const STORE = 'opo7.panel';

// `curve` bends the track so the low end is worth having. Radius runs 4 to 900,
// and on a straight scale everything under 40px would live in the bottom four
// percent of a 94px track — three pixels of travel for the whole useful small
// end. Squaring it gives that range a fifth of the track instead.
const SLIDERS = [
  { key: 'rate',   label: 'throttle', min: 0, max: 60,  step: 1, fmt: v => String(Math.round(v)) },
  { key: 'radius', label: 'radius',   min: 4, max: 900, step: 2, curve: 2,
    fmt: v => Math.round(v) + 'px' },
];

let box, saved = {};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- what is remembered ---------- */

function load() {
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; }
  catch (e) { saved = {}; }
  return saved;
}

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      x: saved.x, y: saved.y, theme: saved.theme,
      rate: ground.params.rate, radius: ground.params.radius,
    }));
  } catch (e) { /* a private window just forgets, which is fine */ }
}

/* ---------- pieces ---------- */

// Every word in the box is stretched like the rows at the top are, so the box
// belongs to the same page. The factor is its own, because these are small and
// the row's is far too wide for them.
function word(text, cls) {
  const el = document.createElement('span');
  el.className = cls;
  const inner = document.createElement('span');
  inner.className = 'pw';
  inner.textContent = text;
  el.appendChild(inner);
  return el;
}

// A vertical track with a playhead on it: a capsule, the travelled part of it a
// lighter grey than the part not reached yet, and a round handle sitting where
// the two meet.
//
// Built by hand rather than out of <input type=range>. A range can be made
// vertical and it can be given a two-tone track, but not both at once without
// per-engine pseudo-elements that disagree about which end is which. The
// keyboard and the screen reader are put back on by hand below.
function slider(spec) {
  const wrap = document.createElement('div');
  wrap.className = 'slot';

  const track = document.createElement('div');
  track.className = 'track';
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', spec.label);
  track.setAttribute('aria-orientation', 'vertical');
  track.setAttribute('aria-valuemin', spec.min);
  track.setAttribute('aria-valuemax', spec.max);

  const fill = document.createElement('div');
  fill.className = 'fill';
  const head = document.createElement('div');
  head.className = 'head';
  track.append(fill, head);

  const read = document.createElement('span');
  read.className = 'slot-read';
  const readInner = document.createElement('span');
  readInner.className = 'pw';
  read.appendChild(readInner);

  // where the handle sits, 0 to 1, and the value that a position means. The two
  // are inverses of each other; with no curve they are both straight lines.
  const k = spec.curve || 1;
  const frac = () =>
    Math.pow((ground.params[spec.key] - spec.min) / (spec.max - spec.min), 1 / k);
  const valueAt = t => spec.min + Math.pow(t, k) * (spec.max - spec.min);

  const paint = () => {
    const t = frac();
    fill.style.height = (t * 100) + '%';
    head.style.bottom = (t * 100) + '%';
    readInner.textContent = spec.fmt(ground.params[spec.key]);
    track.setAttribute('aria-valuenow', Math.round(ground.params[spec.key]));
    track.setAttribute('aria-valuetext', spec.fmt(ground.params[spec.key]));
  };

  const set = v => {
    ground.params[spec.key] = clamp(v, spec.min, spec.max);
    paint();
    save();
  };

  // up is more. the value follows the pointer straight away, so pressing
  // anywhere on the track jumps there rather than nudging.
  const at = e => {
    const r = track.getBoundingClientRect();
    if (!r.height) return;
    const t = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    set(valueAt(t));
  };

  let holding = false;
  track.addEventListener('pointerdown', e => {
    // preventDefault stops the press selecting text, and would also stop it
    // handing over focus — so focus is given by hand, or the arrows do nothing
    // once a track has been clicked
    e.preventDefault();
    track.focus();
    track.setPointerCapture(e.pointerId);
    holding = true;
    track.classList.add('held');
    at(e);
  });
  track.addEventListener('pointermove', e => { if (holding) at(e); });
  const drop = () => { holding = false; track.classList.remove('held'); };
  track.addEventListener('pointerup', drop);
  track.addEventListener('pointercancel', drop);

  track.addEventListener('keydown', e => {
    const big = e.shiftKey ? 10 : 1;
    // stepped along the track rather than along the value: on a curved slider a
    // fixed value step is a crawl at one end and a leap at the other
    const nudge = d => set(valueAt(clamp(frac() + d * big * (spec.step / (spec.max - spec.min)) * k, 0, 1)));
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { nudge(1); e.preventDefault(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { nudge(-1); e.preventDefault(); }
    if (e.key === 'Home') { set(spec.max); e.preventDefault(); }
    if (e.key === 'End') { set(spec.min); e.preventDefault(); }
  });

  paint();
  wrap.append(word(spec.label, 'slot-name'), track, read);
  return wrap;
}

/* ---------- the box ---------- */

const vw = () => innerWidth || document.documentElement.clientWidth || 0;
const vh = () => innerHeight || document.documentElement.clientHeight || 0;

// Placing the box at all is what commits it to left/top, so style.css can own
// where it starts and that needs no measurement at any point.
function place(x, y) {
  const r = box.getBoundingClientRect();
  const W = vw(), H = vh();
  saved.x = W ? clamp(x, 0, Math.max(0, W - r.width)) : x;
  saved.y = H ? clamp(y, 0, Math.max(0, H - r.height)) : y;
  box.style.left = saved.x + 'px';
  box.style.top = saved.y + 'px';
  box.style.right = 'auto';
  box.style.bottom = 'auto';
}

// Which theme was left showing, read before the ground is started so it comes
// up on that one rather than flashing the first and then swapping.
export function startingTheme() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '{}').theme;
    return typeof v === 'number' ? v : 0;
  } catch (e) { return 0; }
}

export function open()  { if (box) box.hidden = false; }
export function close() { if (box) box.hidden = true; }
export const isOpen = () => !!box && !box.hidden;

export function build() {
  load();

  box = document.createElement('aside');
  box.id = 'panel';
  box.hidden = true;                    // reached from `control panel` under home

  // The top edge holds the close button and nothing else. The box is dragged by
  // any part of itself that is not a control, so this is no longer the handle.
  const bar = document.createElement('header');
  bar.className = 'panel-bar';

  // Two bars rather than the × character: Arial's is a hairline at any weight,
  // and the stroke has to be as thick as the words beside it.
  const shut = document.createElement('button');
  shut.type = 'button';
  shut.className = 'panel-x';
  shut.append(document.createElement('i'), document.createElement('i'));
  shut.setAttribute('aria-label', 'close the control panel');
  shut.addEventListener('click', close);
  bar.appendChild(shut);

  const body = document.createElement('div');
  body.className = 'panel-body';

  // ---- the theme, on the left ----
  // A preview of the picture the ground actually is, and pressing it takes the
  // next one. It shows the file `cover`-cropped, the same way the ground does,
  // so what is in the box is what is behind the page.
  const themeSlot = document.createElement('div');
  themeSlot.className = 'theme-slot';

  const shot = document.createElement('button');
  shot.type = 'button';
  shot.className = 'theme-shot';
  const shotImg = document.createElement('div');
  shotImg.className = 'shot-img';
  shot.appendChild(shotImg);

  const paintTheme = i => {
    shotImg.style.backgroundImage = `url('${ground.theme(i).src}')`;
    shot.setAttribute('aria-label',
      'page theme ' + (i + 1) + ' of ' + ground.THEMES.length + ' — press for the next');
    saved.theme = i;
    save();
  };

  shot.addEventListener('click', () => {
    shot.classList.add('turning');
    ground.nextTheme(i => {
      paintTheme(i);
      shot.classList.remove('turning');
    });
  });

  themeSlot.append(shot, word('page theme', 'theme-name'));

  const rack = document.createElement('div');
  rack.className = 'rack';
  for (const spec of SLIDERS) {
    if (typeof saved[spec.key] === 'number') {
      ground.params[spec.key] = clamp(saved[spec.key], spec.min, spec.max);
    }
    rack.appendChild(slider(spec));
  }

  // everything that was already here, kept together on the right
  const stack = document.createElement('div');
  stack.className = 'panel-stack';
  stack.appendChild(rack);

  body.append(themeSlot, stack);

  // Two words, not two buttons. The row at the top of the page is words that
  // are pressable; so is this.
  const row = document.createElement('div');
  row.className = 'panel-row';

  const power = document.createElement('button');
  power.type = 'button';
  power.className = 'panel-word';
  const powerInner = document.createElement('span');
  powerInner.className = 'pw';
  power.appendChild(powerInner);
  const paintPower = () => {
    powerInner.textContent = ground.params.paused ? 'off' : 'on';
    power.setAttribute('aria-pressed', String(!ground.params.paused));
  };
  power.addEventListener('click', () => { ground.params.paused = !ground.params.paused; paintPower(); });
  paintPower();

  const healBtn = document.createElement('button');
  healBtn.type = 'button';
  healBtn.className = 'panel-word';
  const healInner = document.createElement('span');
  healInner.className = 'pw';
  healInner.textContent = 'heal';
  healBtn.appendChild(healInner);
  healBtn.title = 'put the picture straight back';
  healBtn.addEventListener('click', () => {
    ground.heal();
    healBtn.classList.add('hit');
    setTimeout(() => healBtn.classList.remove('hit'), 260);
  });

  row.append(power, healBtn);
  stack.appendChild(row);
  box.append(bar, body);
  document.body.appendChild(box);

  paintTheme(ground.themeIndex());

  /* dragging — anywhere on the box that is not something you can work */
  let grab = null;
  box.addEventListener('pointerdown', e => {
    // the controls keep their own presses. everything else is a handle.
    if (e.target.closest('button, .track, input, textarea, select')) return;
    e.preventDefault();
    box.setPointerCapture(e.pointerId);
    const r = box.getBoundingClientRect();
    grab = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    box.classList.add('moving');
  });
  box.addEventListener('pointermove', e => {
    if (!grab) return;
    place(e.clientX - grab.dx, e.clientY - grab.dy);
  });
  const drop = () => { if (grab) { grab = null; box.classList.remove('moving'); save(); } };
  box.addEventListener('pointerup', drop);
  box.addEventListener('pointercancel', drop);

  // Only a box that has been moved before gets placed by hand. A fresh one is
  // left where style.css puts it, so it never depends on the window having
  // measured itself yet.
  if (typeof saved.x === 'number' && typeof saved.y === 'number') place(saved.x, saved.y);
  addEventListener('resize', () => { if (typeof saved.x === 'number') place(saved.x, saved.y); });

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { close(); return; }
    if (e.key !== 'g' && e.key !== 'G') return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    box.hidden = !box.hidden;
  });
}
