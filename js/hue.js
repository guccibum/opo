// opo3 — the average hue of a piece.
//
// This is the map's ordering system, and it is separate from what you see: the
// wall always shows the real file, but *where* a file goes is decided by its
// average colour. Laid out in that order the wall reads as a gradient — the
// reds together, the greens together, the whole thing sweeping around the wheel.
//
// The average is taken by drawing the picture into a single pixel and reading
// it back. The browser's own downscale does the averaging, in one step, at
// whatever quality it likes — which is both faster and better than walking the
// pixels by hand. It is read from the small proxy, which is what the field is
// showing anyway.

const ONE = document.createElement('canvas');
ONE.width = ONE.height = 1;
const ctx = ONE.getContext('2d', { willReadFrequently: true });

// …and an 8×8 for the fingerprint, below.
const GRID = 8;
const SMALL = document.createElement('canvas');
SMALL.width = SMALL.height = GRID;
const sctx = SMALL.getContext('2d', { willReadFrequently: true });

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

// A difference hash: shrink to 8×8 grey and record, for each pixel, only
// whether it is brighter than the one to its right. What survives is the
// picture's structure — where its edges are — and not its exposure, its scale
// or its compression. Two files that look the same come out with the same bits
// even when nothing about them is byte-identical, which is the case that
// matters here: whole runs of these are frames lifted from one source.
function fingerprint(img) {
  sctx.clearRect(0, 0, GRID, GRID);
  sctx.drawImage(img, 0, 0, GRID, GRID);
  const d = sctx.getImageData(0, 0, GRID, GRID).data;
  const luma = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const k = i * 4;
    luma.push(d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114);
  }
  const bits = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID - 1; x++) {
      bits.push(luma[y * GRID + x] > luma[y * GRID + x + 1] ? 1 : 0);
    }
  }
  // How much structure there actually is. On a nearly flat picture — and
  // several of these are almost entirely black — every one of those
  // comparisons is between two near-equal values, so the bits are decided by
  // noise. Two unrelated dark images will then agree by chance and be taken
  // for the same picture. Anything this flat is exempted from that judgement.
  const mean = luma.reduce((a, b) => a + b, 0) / luma.length;
  const sd = Math.sqrt(luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length);
  return { bits, sd };
}

export function distance(a, b) {
  if (!a || !b) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export const FLAT = 10;         // luma spread under this and the hash is noise

function of(img) {
  ctx.clearRect(0, 0, 1, 1);
  ctx.drawImage(img, 0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  const hsl = rgbToHsl(r, g, b);
  return { r, g, b, ...hsl };
}

// Loads whatever the field would show and reads its average. Never rejects —
// a piece that will not decode simply has no colour, and sorts with the greys.
function measure(p) {
  return new Promise(resolve => {
    const url = p.poster || p.src;
    if (!url) return resolve({ h: 0, s: 0, l: 0 });
    const img = new Image();
    img.onload = () => {
      try {
        const f = fingerprint(img);
        // iw/ih, not w/h. of() returns { r, g, b, h, s, l } where h is the
        // *hue*, and a later h: img.naturalHeight in this same literal silently
        // overwrote it — so byHue() spent three iterations sorting the coloured
        // pieces by pixel height. The greys were fine, because they sort on l.
        resolve({ ...of(img), print: f.bits, sd: f.sd,
                  iw: img.naturalWidth, ih: img.naturalHeight });
      }
      catch (e) { resolve({ h: 0, s: 0, l: 0 }); }
    };
    img.onerror = () => resolve({ h: 0, s: 0, l: 0 });
    img.src = url;
  });
}

export async function measureAll(pieces) {
  await Promise.all(pieces.map(async p => { p.colour = await measure(p); }));
  return pieces;
}

// The order the wall is laid out in.
//
// Hue alone is no good at this end of the scale: a nearly black or nearly grey
// picture has a hue, but it is noise — two frames of the same dark video can
// land on opposite sides of the wheel. So anything under a saturation floor is
// treated as having no colour at all and grouped at the start, ordered dark to
// light, and the coloured pieces follow it around the wheel. The result reads
// as one sweep: black, through the greys, into colour.
export const GREY = 0.12;

export function byHue(pieces) {
  const idx = pieces.map((_, i) => i);
  const c = i => pieces[i].colour || { h: 0, s: 0, l: 0 };
  return idx.sort((a, b) => {
    const ca = c(a), cb = c(b);
    const ga = ca.s < GREY, gb = cb.s < GREY;
    if (ga !== gb) return ga ? -1 : 1;
    if (ga) return ca.l - cb.l;
    return ca.h - cb.h;
  });
}

/* ---------- duplicates ---------- */

// Whole runs of these files are frames pulled from the same source: the same
// picture over and over, a few numbers apart in the filename. Byte-for-byte
// they are all different, so nothing upstream catches them — but on a wall they
// read as one image repeated, which is worse than not showing it at all.
//
// The first of a run is kept and the rest are dropped. Near-identical is
// measured on the fingerprint, not the filename, so it also catches a pair that
// happen to look alike without being named alike.
export const SAME = 6;          // bits out of 56 — under this is the same picture

// Of a set of twins, which is the real one? The plainest name: no "copy", no
// " 2", no trailing digits, shortest. Otherwise `amb0 copy.tif` beats `amb0.tif`
// purely because it sorts first, and the wall shows the duplicate while hiding
// the original.
function canonical(p) {
  const n = (p.title || '').toLowerCase();
  let score = 0;
  if (/\bcopy\b/.test(n)) score += 100;
  if (/ \d+\.[a-z0-9]+$/.test(n)) score += 50;
  score += n.length * 0.1;
  return score;
}

export function dedupe(pieces, tolerance) {
  const t = tolerance == null ? SAME : tolerance;
  const kept = [], dropped = [];
  // decide in canonical order, so the plainest name is the one that survives
  const order = pieces.slice().sort((a, b) => canonical(a) - canonical(b));
  for (const p of order) {
    const c = p.colour;
    const print = c && c.print;
    const flat = !c || c.sd == null || c.sd < FLAT;
    const twin = print && !flat && kept.find(k => {
      const kc = k.colour;
      if (!kc || kc.sd == null || kc.sd < FLAT) return false;   // never judge against a flat one
      return distance(kc.print, print) <= t;
    });
    if (twin) { p.duplicateOf = twin.title; dropped.push(p); }
    else kept.push(p);
  }
  // hand them back in the original order, minus the twins
  const keep = new Set(kept);
  return { kept: pieces.filter(p => keep.has(p)), dropped };
}

/* ---------- how big to set each area ---------- */

// Where a stretch of the wall is all one colour, the pieces in it are set
// small; where the colour is turning over quickly, they are set large.
//
// The reasoning is that a run of near-identical images earns less room than a
// run of genuinely different ones — a dozen frames of the same green agate say
// about as much as one of them does, so they are given the space of one and
// packed fine. A piece with nothing much like it either side gets the width of
// the course to itself.
//
// The list arrives already in hue order, so "how fast is the colour turning
// over here" is just the spread across a window of neighbours.
export function weights(ordered, opts) {
  const o = opts || {};
  const win = o.window == null ? 4 : o.window;
  const ref = o.ref == null ? 0.055 : o.ref;   // hue turned over, per window
  const low = o.low == null ? 0.55 : o.low;
  const high = o.high == null ? 1.5 : o.high;
  const vary = o.vary == null ? 0 : o.vary;
  const rnd = o.rnd || Math.random;
  const aspects = o.aspects || null;
  const n = ordered.length;

  // A course's height is shared by everything in it, and a piece's width comes
  // out of that height times its own shape. So in a finely set course a 1:2
  // picture ends up 28px across — present, but not something you could look at.
  // The further a piece is from square, the more height its course is given, so
  // the shrinking that similar colours earn cannot turn a tall picture into a
  // sliver.
  const stretch = k => {
    if (!aspects) return 1;
    const a = aspects[k] || 1;
    const off = Math.abs(Math.log(a));             // 0 at square, grows either way
    return 1 + Math.min(1.1, off * 0.85);
  };

  return ordered.map((p, k) => {
    const a = Math.max(0, k - win), b = Math.min(n - 1, k + win);
    let lo = Infinity, hi = -Infinity, grey = true;
    for (let j = a; j <= b; j++) {
      const c = ordered[j].colour || { h: 0, s: 0, l: 0 };
      const v = c.s < GREY ? c.l : c.h;
      if (c.s >= GREY) grey = false;
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    const spread = (hi - lo) / (grey ? 0.5 : 1);   // lightness runs 0..1 too
    const t = Math.max(0, Math.min(1, spread / ref));
    const jitter = 1 + (rnd() * 2 - 1) * vary;
    return (low + (high - low) * t) * jitter * stretch(k);
  });
}
