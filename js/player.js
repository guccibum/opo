// opo7 — the window a piece opens into.
//
// One way of opening things, for the whole site. A cover on the reel and a
// photograph in the sculpture rows both come up here: larger, over the page,
// with their name under them.
//
// It grows out of whatever was pressed, the way a branch row grows out of its
// word — the origin is put on that element and it scales up from almost nothing.
//
// There is no ground behind it. The page shows through, because the thing you
// opened is the only thing worth adding.

let box, media, nameEl, onClosed = null, kind = 'video';

function make() {
  box = document.createElement('div');
  box.id = 'player';
  box.hidden = true;

  const shut = document.createElement('button');
  shut.type = 'button';
  shut.className = 'player-x';
  shut.append(document.createElement('i'), document.createElement('i'));
  shut.setAttribute('aria-label', 'close');
  shut.addEventListener('click', close);

  const inner = document.createElement('div');
  inner.className = 'player-box';

  nameEl = document.createElement('p');
  nameEl.className = 'player-name';
  nameEl.appendChild(document.createElement('span')).className = 's';

  inner.appendChild(nameEl);
  box.append(shut, inner);
  document.body.appendChild(box);

  // anywhere that is not the picture itself closes it
  box.addEventListener('click', e => {
    if (e.target === box || e.target.classList.contains('player-box')) close();
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && !box.hidden) close();
  });
}

export function open(o) {
  if (!box) make();
  if (media) media.remove();

  kind = o.kind || 'video';
  if (kind === 'video') {
    media = document.createElement('video');
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.src = o.src;
    media.currentTime = 0;              // from the beginning, not from the still
  } else {
    media = document.createElement('img');
    media.src = o.src;
    media.alt = o.name || '';
  }
  box.querySelector('.player-box').insertBefore(media, nameEl);
  nameEl.firstChild.textContent = o.name || '';
  onClosed = o.closed || null;

  // the point it grows out of: whatever was pressed, in the window's own space
  if (o.from) {
    const r = o.from.getBoundingClientRect();
    box.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
  }

  box.hidden = false;
  // The transition needs a start value to travel from, so the shown-but-small
  // state has to be flushed before `on` is added. Reading a layout property
  // forces that synchronously — waiting a frame for it would leave the window
  // stuck at 12% in any tab where requestAnimationFrame is throttled.
  void box.offsetWidth;
  box.classList.add('on');

  if (kind === 'video') media.play().catch(() => {});
}

export function close() {
  if (!box || box.hidden) return;
  box.classList.remove('on');
  const m = media;
  if (m && m.tagName === 'VIDEO') m.pause();
  setTimeout(() => {
    box.hidden = true;
    if (m && m.tagName === 'VIDEO') {
      m.removeAttribute('src');           // stop it downloading in the dark
      m.load();
    }
  }, 360);
  const done = onClosed;
  onClosed = null;
  if (done) done();
}

export const isOpen = () => !!box && !box.hidden;
