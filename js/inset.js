// opo5 — the picture inside the frame.
//
// Eleven of the twelve videos here are 4:3 footage padded into a 16:9 container:
// the black bars are *in the file*, so no object-fit can remove them, and a
// frame built to the file's own proportions is a correctly shaped box around an
// incorrectly padded picture. The server measures where the picture actually
// sits (cropdetect, once, off the six-second clip) and hands it over as
// [x, y, w, h, frameW, frameH].
//
// Trimming that padding is not cropping the work. Nothing of the picture is
// lost — only the black the file was wrapped in.

// the shape of the picture itself, which is what a cell or a cover is built to
export function boxAspect(piece, fallback) {
  const b = piece && piece.box;
  if (b && b[2] > 0 && b[3] > 0) return b[2] / b[3];
  return fallback;
}

// Blow the media up so its picture — not its frame — fills the element, and
// slide the padding out of view. Everything is a percentage of the element, so
// it holds at any size and costs no relayout when the element is scaled.
export function fitInset(media, piece) {
  const b = piece && piece.box;
  if (!b || !(b[2] > 0) || !(b[3] > 0)) {
    media.style.position = '';
    media.style.width = '100%'; media.style.height = '100%';
    media.style.left = ''; media.style.top = '';
    return false;
  }
  const [x, y, w, h, fw, fh] = b;
  media.style.position = 'absolute';
  media.style.width  = (fw / w * 100) + '%';
  media.style.height = (fh / h * 100) + '%';
  media.style.left   = (-x / w * 100) + '%';
  media.style.top    = (-y / h * 100) + '%';
  media.style.objectFit = 'fill';   // the element is already the picture's shape
  return true;
}
