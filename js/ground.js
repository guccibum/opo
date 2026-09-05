// opo7 — the ground, glitching.
//
// Generative Gestaltung's image feedback, put on a pointer. Both reference
// sketches do the same one thing: take a rectangle of what is already on the
// canvas and stamp it back down a few pixels away. Because the source is the
// canvas and not the original file, every stamp lands on top of earlier stamps
// and the picture compounds into a smear. That is the whole trick.
//
//   P_4_1_2_01   tall thin columns, full height — vertical streaking
//   P_4_1_2_02   wide short blocks, 150 x 50, jittered +-10 — blocky displacement
//
// Theirs picks its blocks at random over the whole frame and never stops, so
// the picture is gone in seconds. Here the blocks are picked around the cursor
// and the original is painted back underneath at a low alpha every frame, so
// the damage follows the pointer, and everywhere it is not the picture slowly
// comes back. Stand still and the ground heals; drag across it and it tears.

// What the page can be, in the order the preview rotates through. Two pictures,
// the darker one first.
//
// A theme is not only the picture. The words take their colour from it: the
// image is measured when it loads and the ink is set a fixed distance from what
// was found, so every theme reads at the same remove and none of them has to be
// given a colour by hand. Adding one is adding a line here.
// where the pictures live. one line to move them all
const DIR = 'backgrounds/';

// `ink` overrides which way the words go. Left off, the picture decides: the
// ink lands a fixed distance from the average, on whichever side has the room.
// Set it when the average lies about the picture — blue averages to a middling
// teal and gets dark words, but the dark blob it carries sits exactly where the
// row does, and swallows them.
export const THEMES = [
  { src: DIR + 'bg1q3op2.png' },                 // the dark one
  { src: DIR + 'bg1q3op3.png' },                 // the light one
  { src: DIR + 'blue.png', ink: 'light' },       // the blue one
];

/* ---------- tuning ---------- */

// Which of the two shapes a block is. 'blocks' is _02 and is what the banner
// looks like; 'columns' is _01 — tall and thin, and it streaks downward.
const MODE = 'blocks';

const BLOCK_W = 150;   // px. _02's numbers exactly
const BLOCK_H = 50;
const COL_W   = 26;    // px, in 'columns' mode. its height is the frame's
const JITTER  = 10;    // px a stamp lands from where it was read

const IDLE    = 0.10;  // what fraction of the rate keeps going when it is still

// How quickly the tearing answers the pointer, and how quickly it lets go.
const RISE    = 0.28;
const FALL    = 0.045;

const MAX_DPR = 2;

// The three the panel holds, and their defaults. Everything above is fixed;
// these are the ones worth a hand on them while the effect is being dialled in.
export const params = {
  rate:   16,     // blocks stamped per frame while the pointer is moving hard
  radius: 230,    // px around the cursor that blocks are picked from
  // How fast the picture comes back. This is the only thing holding the effect
  // in equilibrium — at 0 the frame is destroyed and never recovers, and much
  // above 0.1 the smear is wiped out before it can be seen.
  heal:   0.045,
  paused: false,
};

/* ---------- state ---------- */

let cv, ctx, img = null, w = 0, h = 0, dpr = 1;
let themeAt = 0;
let fit = null;                 // where the picture sits, cover-style
let px = 0, py = 0;             // the pointer, in canvas pixels
let seen = false;               // has the pointer ever been over the page
let force = 0, aim = 0;         // how hard it is tearing, and where that is going
let running = false;

const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- the canvas ---------- */

// It sits exactly where the css ground does and is left there if anything below
// fails, so a browser that cannot run this still gets the picture — style.css
// paints it on body::before and this covers it.
function mount() {
  cv = document.createElement('canvas');
  cv.id = 'ground';
  document.body.insertBefore(cv, document.body.firstChild);
  ctx = cv.getContext('2d', { alpha: false });
}

// `cover`, worked out by hand: the css version of the same thing is on
// body::before and the two have to agree or the ground jumps when this starts.

function measure() {
  dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  w = Math.max(1, Math.round(innerWidth * dpr));
  h = Math.max(1, Math.round(innerHeight * dpr));
  cv.width = w; cv.height = h;
  cv.style.width = innerWidth + 'px';
  cv.style.height = innerHeight + 'px';

  if (!img) return;
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  fit = { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
  px = w / 2; py = h / 2;
  reset();
}

function reset() {
  if (!img || !fit) return;
  ctx.globalAlpha = 1;
  ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
}

/* ---------- the feedback ---------- */

// One stamp: read a rectangle and put it back down a few pixels away. Reading
// from the canvas rather than from the file is the whole of it — the source is
// already damaged, so the damage accumulates.
function stamp() {
  let bw, bh, x1, y1;

  if (MODE === 'columns') {
    bw = Math.floor(rnd(COL_W * 0.4, COL_W * 1.6));
    bh = h;
    x1 = Math.floor(px + rnd(-params.radius, params.radius) * dpr);
    y1 = 0;
  } else {
    bw = Math.floor(BLOCK_W * dpr);
    bh = Math.floor(BLOCK_H * dpr);
    x1 = Math.floor(px + rnd(-params.radius, params.radius) * dpr);
    y1 = Math.floor(py + rnd(-params.radius, params.radius) * dpr);
  }

  // clamped, because drawImage with a source rectangle hanging off the canvas
  // silently draws nothing and the effect just stops near the edges
  x1 = Math.max(0, Math.min(x1, w - bw));
  y1 = Math.max(0, Math.min(y1, h - bh));
  if (bw <= 0 || bh <= 0) return;

  const j = JITTER * dpr;
  const x2 = Math.round(x1 + rnd(-j, j));
  const y2 = Math.round(y1 + rnd(-j, j));

  ctx.drawImage(cv, x1, y1, bw, bh, x2, y2, bw, bh);
}

function frame() {
  if (!running) return;
  requestAnimationFrame(frame);
  if (!img || !fit) return;

  // Paused leaves the frame exactly as it was torn — it is a pause, not a stop,
  // so letting go picks the same picture back up.
  if (params.paused) return;

  // the picture, painted back underneath. everything the cursor has left alone
  // is walking back toward it a little every frame.
  if (params.heal > 0) {
    ctx.globalAlpha = params.heal;
    ctx.drawImage(img, fit.x, fit.y, fit.w, fit.h);
    ctx.globalAlpha = 1;
  }

  force += (aim - force) * (aim > force ? RISE : FALL);
  aim *= 0.86;                  // movement has to be renewed to keep it torn

  const n = Math.round(params.rate * (IDLE + force * (1 - IDLE)));
  for (let i = 0; i < n; i++) stamp();
}

/* ---------- the pointer ---------- */

function onMove(e) {
  // the panel is furniture, not ground: the picture must not tear under it
  if (e.target && e.target.closest && e.target.closest('#panel')) return;

  const x = e.clientX * dpr, y = e.clientY * dpr;
  const d = seen ? Math.hypot(x - px, y - py) : 0;
  px = x; py = y; seen = true;
  // how hard it tears is how fast the pointer is going, not where it is
  aim = Math.min(1, Math.max(aim, d / (90 * dpr)));
}

/* ---------- the palette a picture implies ---------- */

// How far the ink sits from the ground it stands on, 0 to 1. This is the whole
// of the contrast rule: a dark picture is given light words and a light one dark
// words, always by this much, so no theme is louder than another.
const INK_GAP = 0.66;

const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// The average of the picture, taken off a tiny draw of it — 24x24 is plenty to
// tell dark from light and costs nothing.
function averageOf(image) {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const cx = c.getContext('2d', { willReadFrequently: true });
  try {
    cx.drawImage(image, 0, 0, 24, 24);
    const d = cx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    return [r / n, g / n, b / n];
  } catch (e) {
    return [51, 51, 52];               // the ground's old flat colour
  }
}

// Two rgb triples written onto the root; style.css builds every other colour it
// uses out of these, so the panel, the rules and the sliders all move together.
function applyPalette(image, ink) {
  const [r, g, b] = averageOf(image);

  const L = lum(r, g, b);
  // which side the ink goes: the picture's own, unless the theme insists
  const up = ink === 'light' ? true : ink === 'dark' ? false : L < 0.5;
  const want = up ? Math.min(1, L + INK_GAP) : Math.max(0, L - INK_GAP);
  const v = Math.round(want * 255);

  const root = document.documentElement.style;
  const flat = [r, g, b].map(Math.round).join(' ');
  root.setProperty('--paper-rgb', flat);
  root.setProperty('--ground-flat', 'rgb(' + flat + ')');
  root.setProperty('--ink-rgb', v + ' ' + v + ' ' + v);
  // the slider handle is lit from the ink's side of the page
  root.setProperty('--head-hi', `rgb(${Math.min(255, v + 24)} ${Math.min(255, v + 24)} ${Math.min(255, v + 24)})`);
  root.setProperty('--head-lo', `rgb(${Math.max(0, v - 48)} ${Math.max(0, v - 48)} ${Math.max(0, v - 48)})`);
}

/* ---------- themes ---------- */

export const themeIndex = () => themeAt;
const wrap = i => ((i % THEMES.length) + THEMES.length) % THEMES.length;
export const theme = i => THEMES[wrap(i == null ? themeAt : i)];

// Swap the picture under everything. The canvas is re-fitted because the two
// files are nothing like the same shape, and the frame is reset rather than
// left half torn by the picture that used to be there.
export function setTheme(i, done) {
  const was = themeAt;
  const want = wrap(i);
  const { src, ink } = THEMES[want];

  // Nothing on the page is touched until the picture is actually in hand. A
  // theme is a picture *and* the colours measured off it, and switching one
  // without the other is what leaves dark words standing on a dark ground — a
  // missing file used to do exactly that.
  const next = new Image();

  next.onload = () => {
    themeAt = want;
    img = next;
    applyPalette(next, ink);            // the words follow the picture

    // the still fallback under the canvas follows along, so a browser that
    // never ran any of this still shows the picture that was chosen
    document.documentElement.style.setProperty('--ground-img', `url('${src}')`);

    if (cv) measure();
    if (done) done(themeAt);
  };

  // the file is not there: stay exactly where we were, and say so
  next.onerror = () => {
    console.warn('ground: no such theme file —', src);
    if (done) done(was);
  };

  next.src = src;
  return want;
}

export function nextTheme(done) { return setTheme(themeAt + 1, done); }

/* ---------- the panel's handles ---------- */

// Back to the picture, at once. This is the reference sketches' delete key.
export function heal() {
  aim = 0; force = 0;
  reset();
}

/* ---------- go ---------- */

export function start(at) {
  // A page that has been asked not to move gets the picture and nothing else.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (typeof at === 'number') {
      themeAt = wrap(at);
      const { src, ink } = THEMES[themeAt];
      document.documentElement.style.setProperty('--ground-img', `url('${src}')`);
      const still = new Image();
      still.onload = () => applyPalette(still, ink);
      still.src = src;
    }
    return;
  }

  mount();

  setTheme(typeof at === 'number' ? at : 0, () => {
    if (!running) { running = true; requestAnimationFrame(frame); }
  });

  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('resize', () => { if (img && img.complete) measure(); });

  // a backgrounded tab hands back an enormous gap; start again from the picture
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { aim = 0; force = 0; }
  });
}
