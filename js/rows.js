// opo7 — one work to a row.
//
// The sculpture section. Twenty photographs of nine pieces, and which piece a
// photograph is of is the only organisation there is: each work gets a row to
// itself and its shots are justified across it.
//
// Flexbox does the justifying. Giving each photograph a `flex-grow` of its own
// aspect ratio makes a row of them come out at one height and exactly the full
// width — the same arithmetic the map's justified() does by hand, except the
// browser already knows how.
//
// It looks like the map because it is the same furniture: the same pieces, the
// same hairline, the same opening.

import * as player from './player.js';

const GAP = 4;    // the joint between shots, as the map has

export function build(mount, dir, groups) {
  mount.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'rows';

  for (const names of groups) {
    const row = document.createElement('div');
    row.className = 'row';

    for (const name of names) {
      const el = document.createElement('figure');
      el.className = 'piece';

      const img = document.createElement('img');
      img.src = dir + '/' + encodeURIComponent(name);
      img.alt = name;
      img.loading = 'lazy';
      img.decoding = 'async';

      // Until the file says what shape it is, every shot in a row is given the
      // same weight; the row is then re-justified as each one lands. Without
      // this the row is right only for photographs that happen to be 3:2.
      el.style.flexGrow = '1.5';
      img.addEventListener('load', () => {
        if (img.naturalWidth && img.naturalHeight) {
          el.style.flexGrow = String(img.naturalWidth / img.naturalHeight);
        }
      });

      el.appendChild(img);
      el.addEventListener('click', () =>
        player.open({ src: img.src, name, kind: 'image', from: el }));

      row.appendChild(el);
    }
    wrap.appendChild(row);
  }

  mount.appendChild(wrap);
  return wrap;
}

export { GAP };
