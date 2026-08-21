// opo5 — boot and wiring.
//
//   taj              the word, out of the dark. click it for selected works
//   selected works   the three that came with a readme, on iteration two's reel
//   map              everything, on a solid grid that holds still
//
// The three words at the top go anywhere from anywhere.

import * as store from './store.js';
import { state } from './store.js';
import { measureAll, dedupe } from './hue.js';
import * as nav from './nav.js';
import * as works from './works.js';
import * as map from './map.js';
import { INTRO_SIZE, FADE_IN_MS, FADE_OUT_MS } from './config.js';

const introWord = document.getElementById('intro-word');
const closeBtn = document.getElementById('close');
const notesEl = document.getElementById('notes');
const sheet = document.getElementById('sheet');
const sheetBody = document.getElementById('sheet-body');

const cTitle = document.getElementById('c-title');
const cMeta  = document.getElementById('c-meta');
const cLine  = document.getElementById('c-line');
const cOpen  = document.getElementById('c-open');

const built = { works: false, map: false };

/* ---------- the readmes ---------- */

// Field names are the readmes' own; anything a file did not say is absent.
function fillNotes(el, n, fallback) {
  el.textContent = '';
  if (!n) return false;

  const h = document.createElement('h2');
  h.textContent = n.title || fallback;
  el.appendChild(h);

  const dl = document.createElement('dl');
  for (const [label, v] of [['short', n.short], ['completed', n.date],
                            ['medium', n.medium], ['course', n.course]]) {
    if (!v) continue;
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
  if (dl.children.length) el.appendChild(dl);

  for (const [label, v] of [['', n.abstract], ['on this file', n.fileNote],
                            ['notes', n.note]]) {
    if (!v) continue;
    if (label) {
      const k = document.createElement('h3'); k.textContent = label; el.appendChild(k);
    }
    const p = document.createElement('p');
    p.textContent = v;
    el.appendChild(p);
  }

  for (const url of n.links || []) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = url;
    el.appendChild(a);
  }
  return true;
}

/* ---------- selected works ---------- */

function caption(w) {
  if (!w) {
    cTitle.textContent = ''; cMeta.textContent = ''; cLine.textContent = '';
    cOpen.hidden = true;
    return;
  }
  const n = w.notes;
  cOpen.hidden = false;
  cTitle.textContent = n.title || w.piece.title;
  cMeta.textContent = [n.date, n.medium, n.course].filter(Boolean).join('  ·  ');
  cLine.textContent = n.fileNote || '';
  nav.readout(n.title || w.piece.title);
}

function openWork(w) {
  fillNotes(sheetBody, w.notes, w.piece.title);

  // the real file here, not the preview clip
  const fig = document.createElement('figure');
  const v = document.createElement('video');
  v.src = w.piece.src;
  v.controls = true; v.playsInline = true; v.muted = true; v.preload = 'metadata';
  if (w.piece.poster) v.poster = w.piece.poster;
  fig.appendChild(v);
  sheetBody.insertBefore(fig, sheetBody.children[1] || null);

  sheet.hidden = false;
  sheet.scrollTop = 0;
  closeBtn.hidden = false;
  works.pause(true);
}

function closeSheet() {
  if (sheet.hidden) return;
  sheet.hidden = true;
  sheetBody.textContent = '';
  closeBtn.hidden = true;
  if (nav.page() === 'works') works.pause(false);
}

cOpen.addEventListener('click', () => {
  const w = works.held() || works.current();
  if (w) openWork(w);
});

/* ---------- the map ---------- */

function mapHover(p) { nav.readout(p ? p.title : ''); }

function mapOpened(p) {
  closeBtn.hidden = false;
  nav.readout(p.title);
  notesEl.hidden = !fillNotes(notesEl, p.notes, p.title);
}

function mapClosed() {
  closeBtn.hidden = true;
  notesEl.hidden = true;
  nav.readout('');
}

/* ---------- pages ---------- */

// Only the page you are on gets to keep its video decoders running.
//
// The reel holds three and the map holds twelve, and once a page is built it
// stays built — so both sets are alive at once and fifteen <video> elements
// compete for what the browser will decode concurrently. Seven of them sat at
// readyState 1: metadata, no frames, no error, nothing to paint. Pausing the
// ones you cannot see frees them for the ones you can.
function idle(id) {
  for (const v of document.querySelectorAll('#rail video')) {
    if (id === 'works') v.play().catch(() => {}); else v.pause();
  }
  for (const v of document.querySelectorAll('#map video')) {
    if (id === 'map') v.play().catch(() => {}); else v.pause();
  }
}

function go(id) {
  closeSheet();
  if (map.isOpen()) map.collapse();
  notesEl.hidden = true;
  closeBtn.hidden = true;
  nav.readout('');
  works.pause(id !== 'works');

  if (id === 'works' && !built.works) {
    works.build(state.pieces.filter(p => p.notes).map(p => ({ piece: p, notes: p.notes })));
    built.works = true;
  }
  if (id === 'map' && !built.map) {
    map.build();
    map.enter();                       // deal the grid; the pieces come up out of it
    built.map = true;
  }
  idle(id);
}

/* ---------- keys ---------- */

addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!sheet.hidden) closeSheet();
    else if (map.isOpen()) map.collapse();
    return;
  }
  if (nav.page() === 'works') {
    if (e.key === 'ArrowRight') works.go(1);
    if (e.key === 'ArrowLeft') works.go(-1);
    if (e.key === 'Enter') {
      const w = works.held() || works.current();
      if (w) openWork(w);
    }
  }
});

closeBtn.addEventListener('click', () => {
  if (!sheet.hidden) closeSheet(); else map.collapse();
});

addEventListener('resize', () => { if (nav.page() === 'map') map.reflow(); });

/* ---------- frame loop ---------- */

function tick(now) {
  // the next frame is asked for whatever happens: an exception escaping here
  // would end the loop permanently and freeze the whole site
  try {
    if (nav.page() === 'works') works.step(now);
    else if (nav.page() === 'map') map.step(now);
  } catch (e) {
    console.error('frame:', e);
  }
  requestAnimationFrame(tick);
}

/* ---------- go ---------- */

(async function boot() {
  await store.load();

  introWord.textContent = state.site.intro || 'taj';
  introWord.style.fontSize = INTRO_SIZE + 'px';
  document.documentElement.style.setProperty('--fade-in', FADE_IN_MS + 'ms');
  document.documentElement.style.setProperty('--fade-out', FADE_OUT_MS + 'ms');
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'close');

  works.bind(document.getElementById('flow'), { change: caption, open: openWork });
  map.bind(document.getElementById('map'),
           { hover: mapHover, opened: mapOpened, closed: mapClosed });

  nav.bind([{ id: 'taj', label: 'taj' },
            { id: 'works', label: 'selected works' },
            { id: 'map', label: 'map' }], go);

  // the big word is the front door, and it opens onto the selected work
  introWord.addEventListener('click', () => nav.show('works'));

  nav.show('taj');                     // land deliberately, not by default

  // a frame later, so the fade has a value to travel from
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.getElementById('page-taj').classList.add('lit')));

  await store.resolveMedia();
  await measureAll(state.pieces);
  const { kept, dropped } = dedupe(state.pieces);
  state.dropped = dropped;
  state.pieces = kept;

  requestAnimationFrame(tick);

  window.opo5 = { state, nav, works, map };
})();
