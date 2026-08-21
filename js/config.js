// opo5 — tuning.
//
// The homepage and the reel are iteration 4.1's, unchanged. The map below is
// new: a solid grid, and nothing in it moves on its own.

/* ---------- the homepage ---------- */

export const FADE_IN_MS  = 1400;
export const FADE_OUT_MS = 420;
export const INTRO_SIZE  = 168;   // px. seven times what it was in opo3

/* ---------- selected works: the reel ---------- */
// Iteration two's, exactly: it turns at one constant speed, always moving,
// never arriving. Holding a cover stops it and brings that one forward.

// The box a cover is fitted into, not the cover's shape. Each cover takes its
// own video's proportions and is sized to fit inside this — a 16:9 clip comes
// out 340×191. A square frame around a 16:9 picture meant either cropping the
// sides off or floating a strip in 150px of dead ground; neither is the work.
export const COVER_W = 340;   // widest a cover may be
export const COVER_H = 340;   // tallest a cover may be, and the fallback shape

export const SPREAD  = 165;   // px between two neighbouring side covers
export const GUTTER  = 170;   // extra px the centre cover pushes its neighbours out by
export const DEPTH   = 290;   // how far back a side cover sits
export const ANGLE   = 62;    // degrees a side cover is turned

// How the turn is paced as a cover crosses the front.
//   'constant'  one steady rate the whole way through. Nothing pauses on the
//               centre — the reel turns like a tie rack, which is the point.
//   'eased'     smoothstep, iteration two's. Flat at both ends, so a cover's
//               rate of turn falls to nothing exactly as it arrives and it
//               hangs there square on before picking up again.
export const TURN = 'constant';
export const SHRINK  = 0.10;
export const VISIBLE = 2.4;   // covers each side before they fade
export const FADE    = 0.8;

export const EASE_POS   = 0.10;  // how fast it catches a cover you asked for
export const SNAP       = 0.0006;
export const DRIFT      = 0.14;  // covers per second it turns. never arrives
// How fast it picks the drift back up. This is the second half of the lag: at
// 0.03 the reel took about a second to get back to speed *after* the wait above
// had already elapsed, so letting go felt like it had died.
export const DRIFT_EASE = 0.14;
// How long it holds still before it starts turning again. Two of them, because
// pushing the reel somewhere and merely looking at a cover are different acts:
// a swipe is a decision and deserves a beat to see where it landed, letting go
// of a cover is not, and waiting two seconds after it just felt broken.
export const RESUME_MS       = 700;   // after a swipe, a drag or an arrow key
export const RESUME_HOVER_MS = 90;    // after the pointer leaves a cover
export const WRAP       = true;

// prefixed: the map below has a HOLD_GROW/HOLD_EASE of its own
export const REEL_HOLD_GROW = 1.11;   // how much a held cover grows
export const HOLD_LIFT      = 85;     // px it comes forward
export const HOLD_FLAT      = 0.70;   // how much of its turn it gives up
export const REEL_HOLD_EASE = 0.055;

export const WHEEL_PER_COVER = 240;

/* ---------- the map: a solid grid ---------- */
// Iteration three's wall was ragged on purpose — every piece at its own
// proportions, courses of different weights, and a slow wander over the top of
// it so the whole field breathed. This one is the opposite and is meant to be:
// one cell size, rows that line up, and nothing moving unless you move it.

export const GAP  = 4;    // the joint between cells, px
export const EDGE = 10;   // margin around the whole grid

// How a cell gets its shape.
//   'proportional'  every cell is the shape its file already is. Rows are
//                   justified and the row height is solved so they fill the
//                   frame. Nothing is ever cropped.
//   'uniform'       one cell size for everything, and the file is cropped into
//                   it. CELL_ASPECT, ORPHAN_COST and LAST_ROW below apply only
//                   to this mode.
export const CELLS = 'proportional';

// What the grid loads. The field used to swim on the 480px proxies the server
// renders; this shows the files themselves, so a piece is sharp at any size and
// opening one does not swap the picture underneath you.
//
// It costs memory: the browser decodes every one of them. Set it false to go
// back to the proxies if the grid ever feels heavy.
//
// Videos are not included and must not be — the sources are 150–320MB each, and
// handing a wall of <video> the real files makes the browser open range requests
// it then abandons. The field plays the six-second clip, as before.
export const FULL_RES = true;

// The shape a cell should aim for, width ÷ height. The column count is chosen
// to get as close to this as it can: 1 is square, 1.6 is a landscape cell,
// 0.7 a portrait one. It is a target, not a rule — the frame decides the rest.
export const CELL_ASPECT = 1;

// A last row that cannot be filled leaves holes. This is what each hole costs
// in the column search: 0 ignores them and picks purely on cell shape, high
// values will take a badly shaped cell to come out even.
export const ORPHAN_COST = 0.06;

// What to do with a short last row.
//   'stretch'  widen its cells to span the width, so the block stays a block
//   'center'   leave them cell-sized, centred, and let the row end short
//   'left'     leave them cell-sized, packed left
export const LAST_ROW = 'stretch';

// How a piece meets its cell. **Nothing in this project is cropped**, so this
// is 'contain' and the whole of the media is always shown. With proportional
// cells it makes no difference — the cell is the file's own shape already.
//   'contain'  the whole picture, letterboxed if the cell is not its shape
//   'cover'    fill the cell, centre-cropped
export const FIT = 'contain';

// What decides the order pieces are dealt into the grid, reading left to right.
//   'hue'      iteration three's: by average colour, so it reads as a gradient
//   'name'     by filename
//   'shuffle'  random, re-drawn on every lay
export const ORDER = 'hue';

/* ---------- the map: arriving ---------- */
// Iteration three came in as a line of cards that toppled one after another,
// and 4.1 kept it. It is gone. The grid is simply there, and the pieces come up
// out of the ground in reading order.

export const RAISE_MS   = 420;  // how long one piece takes to come up
export const RAISE_STEP = 9;    // ms between one piece and the next. 0 = all at once

/* ---------- the map: looking ---------- */
// The only movement left. Stopping to look is still rewarded — a piece under
// the cursor grows a little, over its neighbours rather than into them, and
// nothing else on the grid so much as shifts.

export const HOLD_GROW = 1.10;  // how much bigger a piece under the cursor gets
export const HOLD_EASE = 0.16;  // how fast it gets there

/* ---------- the map: opening one ---------- */
// The node map's reveal, minus the shove. It still grows where it sits — but
// the grid it grows over holds its place instead of scattering, and dims back
// so the opened piece is the only lit thing.

export const EXPAND_FRAC = 0.82;  // of the room available to it
export const EXPAND_GAP  = 26;    // air around an opened piece
export const EASE_SIZE   = 0.14;  // how fast it grows
export const DIM         = 0.22;  // what the rest of the grid fades back to

// The shove itself, kept reachable. Iteration one pushed every overlapping
// neighbour clear along whichever axis it overlapped least, and he has asked
// for that back before. 0 is off; 1.12 is what 4.1 used.
export const EXPAND_PUSH = 0;
export const EASE_NODE   = 0.16;  // how fast a pushed neighbour travels

// A few pieces came with a readme. When one of those opens, the panel holding
// it needs this much of the left edge, and the piece is kept out of it.
export const NOTES_W = 412;
