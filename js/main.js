// opo7 — boot and wiring.
//
// Everything is gone but the rows at the top and the pages they switch between.
// The pages are empty on purpose: this is the frame, and what goes in it has
// not been decided yet.
//
// home and work each carry branches, and a word that carries them goes nowhere
// when pressed — it offers what is under it and waits. work's three name pages;
// home's two are both actions, one going home and one opening the box that
// drives the ground. `about` carries nothing, so pressing it just goes there.
//
// The ground tears under the cursor on every page, not only home.
//
// The ground is a canvas running Generative Gestaltung's image feedback under
// the cursor. See js/ground.js, and js/panel.js for the box that drives it —
// press g to put that away or bring it back.


import * as nav from './nav.js';
import * as ground from './ground.js';
import * as panel from './panel.js';
import * as work from './work.js';

nav.bind([
  { id: 'home',  label: 'home', children: [
      { id: 'home-again', label: 'home',          action: () => nav.show('home') },
      { id: 'control',    label: 'control panel', action: () => panel.open() },
  ] },
  { id: 'about', label: 'about' },
  { id: 'work',  label: 'work', children: [
      { id: 'video',     label: 'video' },
      { id: 'sculpture', label: 'sculpture' },
      { id: 'image',     label: 'image' },
  ] },
]);

work.build();                          // the media, under video / sculpture / image

nav.show('home');                      // land deliberately, with nothing open

ground.start(panel.startingTheme());   // the picture behind it all, on a pointer
panel.build();                         // the box that drives it, reached from home

// a console handle, for the things that should not have buttons
window.opo7 = { nav, ground, panel, work };
