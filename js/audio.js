// opo — audio nodes and the playback bus.
//
// An audio node is its waveform: the waveform is the thumbnail. Playback is
// exclusive across the whole page — starting anything stops everything else,
// audio and video alike — so the map never turns into a pile-up.
//
// The waveform is drawn here from decoded peaks, deliberately in one small
// function (`paint`), because this is where an oscilloscope, a spectrogram or a
// scrolling meter would go later. Swap what paint() draws and nothing else in
// the app has to know.

const peakCache = new Map();     // src -> Float32Array pairs [min,max,min,max…]
const players = new Set();       // every <audio>/<video> currently mounted

let ctx = null;
const audioCtx = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

/* ---------- the bus ---------- */

// Exclusivity follows *audibility*, not playback. A wall of silent loops can
// all run at once — they are pictures that move. The moment one of them is
// actually going to make a sound, everything else that would is stopped.
export function register(el) {
  players.add(el);
  el.addEventListener('play', () => { if (!el.muted && el.volume > 0) claim(el); });
  el.addEventListener('volumechange', () => {
    if (!el.paused && !el.muted && el.volume > 0) claim(el);
  });
}

export function claim(el) {
  for (const other of players) {
    if (other === el || other.paused) continue;
    if (other.muted || other.volume === 0) continue;   // silent: leave it be
    other.pause();
  }
}

export function stopAll() {
  for (const el of players) if (!el.paused) el.pause();
}

export function forget(el) { players.delete(el); }

/* ---------- peaks ---------- */

const COLS = 900;   // resolution of the stored waveform, independent of node width

export async function peaks(src) {
  if (peakCache.has(src)) return peakCache.get(src);

  const pending = (async () => {
    const buf = await (await fetch(src)).arrayBuffer();
    const audio = await audioCtx().decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const per = Math.floor(ch.length / COLS) || 1;
    const out = new Float32Array(COLS * 2);
    for (let i = 0; i < COLS; i++) {
      let lo = 1, hi = -1;
      const start = i * per, end = Math.min(start + per, ch.length);
      for (let j = start; j < end; j++) {
        const v = ch[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      out[i * 2] = lo; out[i * 2 + 1] = hi;
    }
    return { data: out, duration: audio.duration };
  })().catch(() => null);

  peakCache.set(src, pending);
  return pending;
}

// Stand-in for a node with no file yet — deterministic, so a given node always
// draws the same shape and the layout stays still between reloads.
function stubPeaks(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) % 100000;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = new Float32Array(COLS * 2);
  for (let i = 0; i < COLS; i++) {
    const env = Math.sin((i / COLS) * Math.PI) * 0.8 + 0.15;
    const a = rnd() * env;
    out[i * 2] = -a; out[i * 2 + 1] = a;
  }
  return { data: out, duration: 0 };
}

/* ---------- drawing ---------- */

export function paint(canvas, pk, opts) {
  const o = opts || {};
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 200;
  const h = canvas.clientHeight || 56;
  canvas.width = w * dpr; canvas.height = h * dpr;

  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const style = getComputedStyle(canvas);
  g.strokeStyle = o.faint ? (style.getPropertyValue('--gray') || '#888') : style.color;
  g.lineWidth = 1;

  // zero line
  g.globalAlpha = 0.35;
  g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  g.globalAlpha = 1;

  const d = pk.data, n = d.length / 2;
  g.beginPath();
  for (let px = 0; px < w; px++) {
    const i = Math.floor((px / w) * n);
    const lo = d[i * 2], hi = d[i * 2 + 1];
    g.moveTo(px + 0.5, h / 2 - hi * (h / 2 - 1));
    g.lineTo(px + 0.5, h / 2 - lo * (h / 2 - 1));
  }
  g.stroke();
}

/* ---------- mounting ---------- */

const clock = t => {
  if (!isFinite(t)) return '--:--';
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return m + ':' + String(s).padStart(2, '0');
};

// Builds the visible part of an audio node: waveform, playhead, transport.
// Returns the element; the caller appends it.
export function mount(node) {
  const wrap = document.createElement('div');
  wrap.className = 'audio';
  wrap.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.style.height = '56px';
  canvas.style.width = '100%';
  canvas.style.display = 'block';
  wrap.appendChild(canvas);

  const head = document.createElement('div');
  Object.assign(head.style, {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: '1px',
    background: 'currentColor', pointerEvents: 'none', opacity: 0,
  });
  wrap.appendChild(head);

  const bar = document.createElement('div');
  bar.className = 'transport';
  const play = document.createElement('button');
  play.textContent = 'play';
  const time = document.createElement('span');
  time.textContent = '0:00';
  bar.append(play, time);
  wrap.appendChild(bar);

  let el = null, dur = 0;

  const draw = pk => {
    dur = pk.duration || 0;
    paint(canvas, pk, { faint: !node.src });
    time.textContent = clock(dur);
  };

  if (node.src) {
    el = document.createElement('audio');
    el.src = node.src;
    el.preload = 'metadata';
    register(el);

    peaks(node.src).then(pk => draw(pk || stubPeaks(node.id)));

    play.onclick = e => {
      e.stopPropagation();
      if (el.paused) { claim(el); el.play(); } else { el.pause(); }
    };
    el.addEventListener('play',  () => { play.textContent = 'stop'; head.style.opacity = 1; });
    el.addEventListener('pause', () => { play.textContent = 'play'; });
    el.addEventListener('ended', () => { head.style.opacity = 0; });
    el.addEventListener('timeupdate', () => {
      const d = dur || el.duration;
      if (d) head.style.left = (el.currentTime / d) * 100 + '%';
      time.textContent = clock(el.currentTime) + ' / ' + clock(d);
    });

    // scrub
    canvas.onpointerdown = e => {
      e.stopPropagation();
      const r = canvas.getBoundingClientRect();
      const d = dur || el.duration;
      if (d) el.currentTime = ((e.clientX - r.left) / r.width) * d;
    };
  } else {
    draw(stubPeaks(node.id));
    play.disabled = true;
    time.textContent = 'no file';
  }

  // Redraw at the node's new width when it is resized or expanded.
  const ro = new ResizeObserver(() => {
    (node.src ? peaks(node.src) : Promise.resolve(null))
      .then(pk => paint(canvas, pk || stubPeaks(node.id), { faint: !node.src }));
  });
  ro.observe(canvas);

  wrap._teardown = () => { ro.disconnect(); if (el) { el.pause(); forget(el); } };
  return wrap;
}
