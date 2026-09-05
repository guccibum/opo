// opo7 — the work pages.
//
// What is in each section, and nothing else.
//
// The sections are not all the same shape. video is js/reel.js — iteration
// two's cover flow. image is js/map.js — iteration five's solid grid, which
// suits a lot of stills far better than a reel that shows five at a time.
// sculpture has its files converted and waiting but no display yet.
//
// The lists are here rather than read off the folder, because the folder can
// only be read where serve.py is running. A published copy has no server to ask,
// so what is on the page has to be written down.

import * as reel from './reel.js';
import * as map from './map.js';

const DIR = 'media/';

export const SETS = {
  video: [
    'homer.mp4',
    'salo.mp4',
    'sw4.mp4',
    'malakkka.mp4',
    'oeerm.mp4',
  ],
  sculpture: [],

  image: [
    '1l3 r123312528.jpg',
    'AKN.jpg',
    'Aihva.jpg',
    'IMG_5103 2.jpg',
    'aipg.jpg',
    'amb0.jpg',
    'eaglroc.jpg',
    'eqee2001.jpg',
    'eqee2068.jpg',
    'eqee2116.jpg',
    'eqee2165.jpg',
    'grndsrt.jpg',
    'grndsrt0.jpg',
    'jjuiwoks12166.jpg',
    'jjuiwoks12195.jpg',
    'jjuiwoks12196.jpg',
    'juiosok192jpg197.jpg',
    'kjb.jpg',
    'lmd14.jpg',
    'lmd15.jpg',
    'lmd16.jpg',
    'lmd17.jpg',
    'spk0.jpg',
  ],
};

export { reel, map };

// Filenames carry spaces, so each is encoded on its way into a url.
const url = (section, name) => DIR + section + '/' + encodeURIComponent(name);

export function build() {
  for (const [section, names] of Object.entries(SETS)) {
    const page = document.getElementById('page-' + section);
    if (!page || !names.length) continue;

    if (section === 'image') {
      const field = document.createElement('div');
      field.className = 'map';
      page.textContent = '';
      page.appendChild(field);
      map.bind(field, {});
      map.build(names.map(name => ({ name, src: url(section, name) })));
      map.start();      // it deals itself the first time the page is looked at
    } else {
      reel.build(page, DIR + section, names);
    }
  }
}
