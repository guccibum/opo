// opo3 — the data.
//
// Read only. One flat list of pieces: this iteration has no projects, no nodes
// and no edges — a piece is a file with words attached to it.

export const state = { site: {}, pieces: [] };

const fill = p => Object.assign({
  id: '', title: '', src: '', kind: 'image', poster: '', clip: '',
  medium: '', year: '', context: '', credit: '', caption: '', statement: '',
  sw: 0, sh: 0,
}, p);

const VIDEO = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'mpg', 'mpeg', 'ogv'];
const kindOf = name =>
  VIDEO.includes((name.split('.').pop() || '').toLowerCase()) ? 'video' : 'image';

// **The media folder is the list.** pieces.json is only read for `site` — the
// word and the title. Whatever is in media/ is what is on the wall, so adding
// or removing files there is the whole of editing this: no list to keep in
// step, nothing to regenerate, just drop them in and reload.
//
// A copy published somewhere without the server falls back to the `pieces`
// array in pieces.json, which is why it is still written out.
export async function load() {
  let data = null;
  try {
    const r = await fetch('pieces.json', { cache: 'no-store' });
    if (r.ok) data = await r.json();
  } catch (e) { /* an empty wall is a valid wall */ }
  data = data || {};
  state.site = data.site || {};

  try {
    const r = await fetch('/api/media', { cache: 'no-store' });
    if (r.ok) {
      const listing = await r.json();
      state.pieces = listing.map(m => {
        const name = m.src.replace(/^media\//, '');
        return fill({ id: name, title: name, src: m.src, kind: kindOf(name) });
      });
      state.fromFolder = true;
    }
  } catch (e) { /* no server: use what the file says */ }

  if (!state.pieces.length) state.pieces = (data.pieces || []).map(fill);

  // notes.json is the readmes that came with the work, keyed by the file they
  // document. Only a few pieces have one; the rest carry nothing, as before.
  try {
    const r = await fetch('notes.json', { cache: 'no-store' });
    if (r.ok) {
      const notes = await r.json();
      for (const p of state.pieces) if (notes[p.title]) p.notes = notes[p.title];
    }
  } catch (e) { /* no notes is fine */ }

  return state;
}

// The server knows which files the browser cannot decode itself — the tiffs
// here — and what it made instead. Ask it once and point the pieces at those,
// so nothing in the pool has to know about formats.
//
// Deliberately not awaited by boot: the first run has to render a png out of
// every tiff and pull a still out of three very large videos, which takes a
// few seconds. The word is on screen through all of it, and the pool only
// waits for this at the moment it is asked for.
export async function resolveMedia() {
  try {
    const r = await fetch('/api/media', { cache: 'no-store' });
    if (!r.ok) return state;
    const byName = new Map((await r.json()).map(m => [m.src, m]));
    for (const p of state.pieces) {
      const m = byName.get(p.src);
      if (!m) continue;
      if (m.preview) { p.origin = p.src; p.src = m.preview; }
      if (m.poster) p.poster = m.poster;
      if (m.clip) p.clip = m.clip;      // the small silent loop the field plays
      // where the picture actually is inside the frame, when the file has
      // black padding baked into it: [x, y, w, h, frameW, frameH]
      if (m.box) p.box = m.box;
      if (m.sw) { p.sw = m.sw; p.sh = m.sh; }
    }
  } catch (e) { /* a published copy just uses what the file says */ }
  return state;
}

export const has = v => v != null && v !== '';
