// opo7 — boot and wiring.
//
// Everything is gone but the row at the top and the three pages it switches
// between. The pages are empty on purpose: this is the frame, and what goes in
// it has not been decided yet.

import * as nav from './nav.js';

nav.bind([{ id: 'taj',   label: 'taj' },
          { id: 'works', label: 'selected works' },
          { id: 'map',   label: 'map' }]);

nav.show('taj');                       // land deliberately, not by default
