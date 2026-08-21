// opo5 — the layout.
//
// Two ways to fill the frame, and both are grids in the sense that matters:
// rows that line up, no piece overlapping another, no gaps left over.
//
//   proportional   every cell is the shape its file already is. Rows are
//                  justified — the pieces in a row share a top and a bottom
//                  edge and span the width exactly — and the row height is
//                  solved for so the rows also stack to fill the height.
//                  Nothing is cropped, because a cell is never a shape the
//                  file is not.
//
//   uniform        one cell size for everything, and the file is cropped into
//                  it. Squarer, harder, and it throws away the proportions.
//
// A solid grid. Iteration three set every piece at its own proportions and let
// the courses come out ragged; this one does the opposite and asks one question
// only: how many columns?
//
// Every cell is the same size, the rows all line up, and the block fills the
// frame. A piece is drawn into its cell rather than fitted to it (see FIT in
// config) — so the grid is solid, with nothing showing through it.
//
// Columns are chosen, not given. For each possible count the cell that falls
// out of it is measured against the shape asked for, and the count whose cell
// comes closest wins. A last row that cannot be filled is penalised, so an
// arrangement that comes out even is preferred over one a hair closer in shape
// with four holes in the bottom corner.

export function grid(w, h, n, opts) {
  const o = opts || {};
  const gap = o.gap == null ? 4 : o.gap;
  const want = o.aspect || 1;          // the shape a cell should aim for
  const orphanCost = o.orphanCost == null ? 0.06 : o.orphanCost;
  const maxCols = o.maxCols || n;
  if (!n || w <= 0 || h <= 0) return [];

  let best = null;
  for (let cols = 1; cols <= Math.min(n, maxCols); cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    if (cw <= 1 || ch <= 1) continue;

    // how far off the wanted shape this cell is, measured as a ratio so that
    // twice as wide and twice as tall score the same
    const shape = Math.abs(Math.log((cw / ch) / want));
    const holes = cols * rows - n;
    const score = shape + holes * orphanCost;
    if (!best || score < best.score) best = { score, cols, rows, cw, ch };
  }
  if (!best) return [];

  const { cols, rows, cw, ch } = best;
  const cells = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    // The last row is usually short. Left alone it ends mid-air and the block
    // stops being a block, so its cells are widened to span the width instead —
    // same height as every other row, just fewer and wider.
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const rw = o.lastRow === 'left' ? cw
             : (w - gap * (inRow - 1)) / inRow;
    const x = o.lastRow === 'center' && inRow < cols
            ? c * (cw + gap) + (w - (inRow * cw + gap * (inRow - 1))) / 2
            : c * (rw + gap);
    cells[i] = { x, y: r * (ch + gap), w: rw, h: ch, row: r, col: c, cols, rows };
  }
  return cells;
}


// Justified rows: every piece at its own proportions.
//
// Two things have to come out right at once. Each row spans the width exactly,
// which fixes its height — a row's height is the width divided by the sum of
// its aspects. And the rows together have to fill the frame's height.
//
// Dealing greedily (keep adding until the row is full, then start another)
// satisfies the first and leaves the second to luck: the pieces that do not
// happen to fill a final row end up alone in it, and 55 pieces came out as
// five full rows and a pair marooned in the corner. So the rows are *balanced*
// instead — the count is chosen, and then the pieces are partitioned into
// exactly that many contiguous runs of as near as possible equal weight.
//
// Contiguous matters: the order is the hue order, and a row is only allowed to
// be a stretch of it. Shuffling pieces between rows to even them up would trade
// the gradient for tidiness.

// The best way to cut `aspects` into `rows` contiguous runs, where best means
// the runs come out closest to equal. Straight dynamic programming — n is 55
// and rows is under a dozen, so the whole table costs nothing.
function partition(aspects, rows) {
  const n = aspects.length;
  const pre = [0];
  for (const a of aspects) pre.push(pre[pre.length - 1] + a);
  const ideal = pre[n] / rows;
  const cost = (i, j) => { const d = (pre[j] - pre[i]) - ideal; return d * d; };

  const dp = Array.from({ length: rows + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const cut = Array.from({ length: rows + 1 }, () => new Int32Array(n + 1));
  dp[0][0] = 0;
  for (let r = 1; r <= rows; r++) {
    for (let j = r; j <= n; j++) {
      for (let i = r - 1; i < j; i++) {
        const v = dp[r - 1][i] + cost(i, j);
        if (v < dp[r][j]) { dp[r][j] = v; cut[r][j] = i; }
      }
    }
  }
  const out = [];
  let j = n;
  for (let r = rows; r >= 1; r--) { const i = cut[r][j]; out.unshift([i, j]); j = i; }
  return out;                       // [start, end) per row, in order
}

export function justified(w, h, aspects, opts) {
  const o = opts || {};
  const gap = o.gap == null ? 4 : o.gap;
  const n = aspects.length;
  if (!n || w <= 0 || h <= 0) return [];

  const heightsFor = runs => runs.map(([i, j]) => {
    let sum = 0;
    for (let k = i; k < j; k++) sum += aspects[k];
    return (w - gap * (j - i - 1)) / sum;
  });

  // Which row count fills the frame best?
  //
  // Not simply "the most rows that still fit". Dealing into rows is a step
  // function, so the largest count that fits can leave a quarter of the height
  // over — and paying that into the joints gives 30px between rows and 4px
  // between the pieces inside them, which reads as six separate strips rather
  // than one field.
  //
  // The count above it overflows, but only a little, and it can be scaled to
  // fit: scaling every row height by the same factor leaves every cell's aspect
  // untouched (both its width and its height come from that height), so nothing
  // is distorted — the rows simply stop reaching the full width and are centred
  // instead. That trades a big horizontal band at the bottom for a thin one down
  // each side, which is nearly always the better deal.
  //
  // So both are measured, by the only thing that matters: how much of the frame
  // ends up with picture on it.
  let best = null;
  for (let rows = 1; rows <= Math.min(n, 40); rows++) {
    const runs = partition(aspects, rows);
    const hs = heightsFor(runs);
    const raw = hs.reduce((a, b) => a + b, 0);
    const room = h - gap * (rows - 1);
    if (room <= 0) break;
    const scale = raw > room ? room / raw : 1;
    let area = 0;
    runs.forEach(([i, j], r) => {
      const rh = hs[r] * scale;
      for (let k = i; k < j; k++) area += (rh * aspects[k]) * rh;
    });
    if (!best || area > best.area) best = { runs, hs, scale, rows, area };
    // past the point where a row holds one piece there is nothing left to gain
    if (rows >= n) break;
  }
  if (!best) return [];

  const hs = best.hs.map(v => v * best.scale);
  const runs = best.runs;

  // Anything still left over is paid into the joints, so the rows reach the
  // bottom without a piece being stretched to get there. After the scaling
  // above there is usually very little.
  const used = hs.reduce((a, b) => a + b, 0);
  const joint = hs.length > 1
    ? gap + Math.max(0, h - used - gap * (hs.length - 1)) / (hs.length - 1)
    : gap;

  const cells = new Array(n);
  let y = 0;
  runs.forEach(([i, j], r) => {
    const rh = hs[r];
    // a scaled row no longer spans the width, so it is centred rather than left
    // to hang off one side
    let rowW = gap * (j - i - 1);
    for (let k = i; k < j; k++) rowW += rh * aspects[k];
    let x = (w - rowW) / 2;
    for (let k = i; k < j; k++) {
      cells[k] = { x, y, w: rh * aspects[k], h: rh, row: r };
      x += rh * aspects[k] + gap;
    }
    y += rh + joint;
  });
  return cells;
}
