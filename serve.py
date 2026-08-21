#!/usr/bin/env python3
"""opo3 — local server. Stdlib only, localhost only.

Four things the stock http.server can't do, all of which this project needs:

  Range requests    206 partial content, which video needs to seek — and which
                    Safari requires before it will play at all.
  POST /upload      writes a dropped file into media/, so drag-and-drop lands
                    on disk instead of becoming a dead reference.
  Proxies           a PNG stand-in for formats no browser decodes (tif, psd,
                    heic, exr, raw), an H.264 stand-in for video it can't play
                    (ProRes, 10-bit, 4:2:2), and a small poster for everything,
                    so a zoomed-out patch stays cheap.
  POST /data        writes projects.json back to disk, atomically.

Run it from this folder:

    python3 serve.py

Then open http://localhost:8000. Editing is on only when the page is served
from here — /api/env is what tells the app so.
"""

import json
import os
import re
import subprocess
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
MEDIA = os.path.join(ROOT, 'media')
PREVIEWS = os.path.join(MEDIA, '.previews')
POSTERS = os.path.join(PREVIEWS, 'posters')
DATA = os.path.join(ROOT, 'projects.json')

POSTER_W = 480          # what a node shows until it is big enough to want the real file
PREVIEW_MAX = 4096      # cap on a proxy's longest edge — never an upscale

RANGE_RE = re.compile(r'^bytes=(\d*)-(\d*)$')

# Formats every browser decodes on its own.
NATIVE_IMAGES = {'png', 'apng', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif',
                 'svg', 'bmp', 'ico'}

# Formats macOS can read but browsers can't — these get a PNG proxy.
PROXY_IMAGES = {
    'psd', 'psb', 'tif', 'tiff', 'heic', 'heif', 'avci', 'exr', 'tga', 'jp2',
    'jxl', 'dds', 'icns', 'pict', 'sgi', 'pbm', 'ppm', 'pgm', 'mpo',
    'dng', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'sr2', 'srf', 'orf',
    'rw2', 'raf', 'raw', 'rwl', 'srw', 'pef', '3fr', 'fff', 'erf', 'dcr',
    'mos', 'mrw', 'iiq', 'x3f',
}

# Linear/HDR. Converted naively these come out black — they need an explicit
# transfer curve and a flatten to opaque RGB.
LINEAR_HDR = {'exr', 'hdr'}

VIDEO_EXTS = {'mov', 'mp4', 'm4v', 'webm', 'mkv', 'avi', 'mpg', 'mpeg',
              'mts', 'm2ts', 'ogv'}
AUDIO_EXTS = {'mp3', 'wav', 'wave', 'm4a', 'aac', 'flac', 'ogg', 'oga',
              'opus', 'aif', 'aiff', 'aifc', 'caf'}

# What a browser can actually decode.
PLAYABLE_VIDEO = {'h264', 'vp8', 'vp9', 'av1', 'theora'}
PLAYABLE_PIXFMT = {'yuv420p', 'yuvj420p'}
PLAYABLE_AUDIO_IN_VIDEO = {'aac', 'mp3', 'opus', 'vorbis', '', None}
NATIVE_AUDIO = {'mp3', 'wav', 'wave', 'm4a', 'aac', 'flac', 'ogg', 'oga', 'opus'}


def ext_of(name):
    return os.path.splitext(name)[1].lower().lstrip('.')


def safe_name(raw):
    """Reduce a client-supplied filename to a bare, harmless basename."""
    name = os.path.basename(unquote(raw or '')).strip()
    name = re.sub(r'[\x00-\x1f/\\]', '', name)
    if name in ('', '.', '..'):
        return None
    return name[:180]


def free_path(name):
    """media/<name>, suffixed if a different file already holds the name."""
    target = os.path.join(MEDIA, name)
    if not os.path.exists(target):
        return target
    stem, ext = os.path.splitext(name)
    n = 1
    while os.path.exists(target):
        target = os.path.join(MEDIA, '%s-%d%s' % (stem, n, ext))
        n += 1
    return target


def source_size(path):
    """Pixel dimensions of the original, so a node reports the real thing and
    not the proxy's size."""
    try:
        out = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', path],
                             capture_output=True, text=True, timeout=20).stdout
        w = re.search(r'pixelWidth:\s*(\d+)', out)
        h = re.search(r'pixelHeight:\s*(\d+)', out)
        if w and h:
            return int(w.group(1)), int(h.group(1))
    except Exception:
        pass
    return None, None


def ensure_preview(name):
    """PNG proxy for an image format the browser can't show."""
    if ext_of(name) not in PROXY_IMAGES:
        return None
    src = os.path.join(MEDIA, name)
    if not os.path.isfile(src):
        return None

    out = os.path.join(PREVIEWS, name + '.png')
    rel = 'media/.previews/' + name + '.png'
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        sw, sh = source_size(src)
        return {'preview': rel, 'sw': sw, 'sh': sh}

    os.makedirs(PREVIEWS, exist_ok=True)
    sw, sh = source_size(src)

    # Only ever shrink: `sips -Z` resamples both ways, so passing it
    # unconditionally would enlarge anything smaller than the cap.
    big = bool(sw and sh) and max(sw, sh) > PREVIEW_MAX
    sips_size = ['-Z', str(PREVIEW_MAX)] if big else []
    scale = "scale='min(%d,iw)':-1" % PREVIEW_MAX if big else 'null'

    sips_cmd = ['sips', '-s', 'format', 'png'] + sips_size + [src, '--out', out]
    ff_hdr = ['ffmpeg', '-y', '-v', 'error', '-apply_trc', 'iec61966_2_1',
              '-i', src, '-frames:v', '1', '-vf', scale + ',format=rgb24', out]
    ff_any = ['ffmpeg', '-y', '-v', 'error', '-i', src, '-frames:v', '1',
              '-vf', scale, out]

    order = [ff_hdr, sips_cmd] if ext_of(name) in LINEAR_HDR else [sips_cmd, ff_any]
    for cmd in order:
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=180)
        except Exception:
            continue
        if os.path.isfile(out) and os.path.getsize(out) > 0:
            return {'preview': rel, 'sw': sw, 'sh': sh}
    return None


_probe_cache = {}
_jobs = {}
_jobs_lock = threading.Lock()
# Two at a time. A folder of ProRes would otherwise start a dozen encodes at
# once and make the machine unusable while you are trying to work.
_encoders = threading.Semaphore(2)


def probe(path, stream, field):
    try:
        return subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', stream,
             '-show_entries', 'stream=' + field, '-of', 'default=nw=1:nk=1', path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip().split('\n')[0]
    except Exception:
        return ''


def video_playable(path):
    st = os.stat(path)
    key = (path, st.st_mtime, st.st_size)
    if key not in _probe_cache:
        _probe_cache[key] = (probe(path, 'v:0', 'codec_name'),
                             probe(path, 'v:0', 'pix_fmt'),
                             probe(path, 'a:0', 'codec_name'))
    v, pix, a = _probe_cache[key]
    if not v:
        return True                       # can't tell; leave it alone
    return (v in PLAYABLE_VIDEO and pix in PLAYABLE_PIXFMT
            and a in PLAYABLE_AUDIO_IN_VIDEO)


def transcode(cmd, src, out, name):
    """Runs on a worker thread; the file appears only when it is finished."""
    tmp = out + '.part'
    with _encoders:
        with _jobs_lock:
            _jobs[name] = 'running'
        sys.stderr.write('converting %s…\n' % name)
        try:
            r = subprocess.run(cmd + [tmp], capture_output=True, text=True,
                               timeout=4 * 60 * 60)
            if r.returncode != 0 or not os.path.exists(tmp):
                raise RuntimeError((r.stderr or '').strip().split('\n')[-1])
            os.replace(tmp, out)          # atomic: never a half file
            with _jobs_lock:
                _jobs.pop(name, None)
            sys.stderr.write('proxy ready: %s\n' % name)
        except Exception as e:
            if os.path.exists(tmp):
                os.remove(tmp)
            with _jobs_lock:
                _jobs[name] = 'failed'
            sys.stderr.write('proxy FAILED for %s: %s\n' % (name, e))


def ensure_media_proxy(name):
    """None if the file plays as it is, otherwise the proxy's state."""
    ext = ext_of(name)
    src = os.path.join(MEDIA, name)
    if not os.path.isfile(src):
        return None

    if ext in VIDEO_EXTS:
        if video_playable(src):
            return None
        suffix, cmd = '.mp4', [
            'ffmpeg', '-y', '-v', 'error', '-i', src,
            '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
            '-pix_fmt', 'yuv420p',        # the only chroma format browsers decode
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',    # plays before it is fully fetched
            '-f', 'mp4',
        ]
    elif ext in AUDIO_EXTS and ext not in NATIVE_AUDIO:
        suffix, cmd = '.m4a', ['ffmpeg', '-y', '-v', 'error', '-i', src,
                               '-c:a', 'aac', '-b:a', '256k', '-f', 'ipod']
    else:
        return None

    out = os.path.join(PREVIEWS, name + suffix)
    rel = 'media/.previews/' + name + suffix
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return {'preview': rel}

    with _jobs_lock:
        st = _jobs.get(name)
        if st == 'failed':
            return {'convert_failed': True}
        if st in ('queued', 'running'):
            return {'converting': True}
        _jobs[name] = 'queued'

    os.makedirs(PREVIEWS, exist_ok=True)
    threading.Thread(target=transcode, args=(cmd, src, out, name), daemon=True).start()
    return {'converting': True}


def ensure_poster(name, source=None):
    """A small still for every image and video — what a node shows until it is
    large enough on screen to deserve the real file. Also stops videos reading
    as black rectangles."""
    src = source or os.path.join(MEDIA, name)
    if not os.path.isfile(src):
        return None
    out = os.path.join(POSTERS, name + '.jpg')
    rel = 'media/.previews/posters/' + name + '.jpg'
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return rel

    os.makedirs(POSTERS, exist_ok=True)
    scale = "scale='min(%d,iw)':-2" % POSTER_W
    base = ['ffmpeg', '-y', '-v', 'error']
    if ext_of(name) in VIDEO_EXTS:
        # far enough in to have picture in it, not a fade up from black
        at, _ = pick_offset(src)
        attempts = [base + ['-ss', str(at), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4', out],
                    base + ['-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4', out]]
    else:
        attempts = [base + ['-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4', out]]

    for cmd in attempts:
        try:
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        except Exception:
            continue
        if os.path.isfile(out) and os.path.getsize(out):
            return rel
    return None


def describe(name):
    """Everything the page needs to point a node at one file."""
    out = {'src': 'media/' + name}
    ext = ext_of(name)
    got = ensure_media_proxy(name) if (ext in VIDEO_EXTS or ext in AUDIO_EXTS) \
        else ensure_preview(name)
    if got:
        out.update(got)
    if ext in VIDEO_EXTS or ext in NATIVE_IMAGES or (got and got.get('preview')
                                                     and ext not in AUDIO_EXTS):
        base = out.get('preview')
        poster = ensure_poster(name, os.path.join(ROOT, base) if base else None)
        if poster:
            out['poster'] = poster
    if ext in VIDEO_EXTS:
        clip = ensure_clip(name)
        if clip:
            out['clip'] = clip
            box = content_box(name, clip)
            if box:
                out['box'] = box
    return out


BOXES = os.path.join(PREVIEWS, 'boxes.json')
_boxes = None
_boxes_lock = threading.Lock()

# How much of the frame has to be black before it counts as padding rather than
# as picture. Taj's work is very dark — several files are almost entirely black —
# so this is deliberately blunt: a bar has to be a real bar, and a box that only
# shaves a couple of percent off is thrown away and the whole frame used.
BOX_MIN_TRIM = 0.04


def content_box(name, clip_rel):
    """Where the actual picture sits inside a video's frame, as
    [x, y, w, h, frameW, frameH] — or None if the file fills its own frame.

    Two of the three videos with readmes are 4:3 footage padded into a 1920×1080
    container: the black is *in the file*, so no amount of object-fit will get
    rid of it, and a cover sized to the file's 16:9 is a correctly shaped frame
    around an incorrectly padded picture. Measured once, off the six-second clip
    rather than the 300MB original, and cached."""
    global _boxes
    with _boxes_lock:
        if _boxes is None:
            try:
                with open(BOXES) as f:
                    _boxes = json.load(f)
            except Exception:
                _boxes = {}
        if name in _boxes:
            return _boxes[name] or None

    box = None
    try:
        # The whole file, on keyframes — never a sample of it. A six-second clip
        # is one moment of a three-minute work: homer reads 1528 wide at t=5 and
        # 1256 at t=20, so a box taken from one window crops away picture that
        # exists in another. reset=0 accumulates the widest extent over
        # everything it sees, which is the only box that is safe to hide.
        path = os.path.join(MEDIA, name)
        r = subprocess.run(
            ['ffmpeg', '-hide_banner', '-skip_frame', 'nokey', '-i', path,
             '-vf', 'cropdetect=limit=24:round=2:reset=0',
             '-f', 'null', '-'],
            capture_output=True, text=True, timeout=600)
        found = re.findall(r'crop=(\d+):(\d+):(\d+):(\d+)', r.stderr or '')
        dims = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
            capture_output=True, text=True, timeout=60).stdout.strip()
        fw, fh = [int(v) for v in dims.split(',')[:2]]
        if found and fw and fh:
            w, h, x, y = [int(v) for v in found[-1]]
            trim = 1 - (w * h) / float(fw * fh)
            if trim >= BOX_MIN_TRIM and w > 16 and h > 16:
                box = [x, y, w, h, fw, fh]
    except Exception as e:
        sys.stderr.write('cropdetect failed for %s: %s\n' % (name, e))

    with _boxes_lock:
        _boxes[name] = box
        try:
            os.makedirs(PREVIEWS, exist_ok=True)
            with open(BOXES, 'w') as f:
                json.dump(_boxes, f, indent=1)
        except Exception:
            pass
    return box


CLIPS = os.path.join(PREVIEWS, 'clips')
CLIP_W = 640            # a field tile is never bigger than this
CLIP_SECONDS = 6


def frame_mean(src, t):
    """Mean brightness of one frame, decoded tiny and raw. -1 if it will not
    decode at all."""
    try:
        out = subprocess.run(
            ['ffmpeg', '-v', 'error', '-ss', str(t), '-i', src, '-frames:v', '1',
             '-vf', 'scale=32:32,format=gray', '-f', 'rawvideo', '-'],
            capture_output=True, timeout=90).stdout
        return sum(out) / len(out) if out else -1
    except Exception:
        return -1


def duration_of(src):
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=nw=1:nk=1', src],
            capture_output=True, text=True, timeout=30).stdout.strip()
        return float(out)
    except Exception:
        return 0.0


def pick_offset(src):
    """Where in a video to cut from.

    A fixed offset is no good: plenty of these open on black, or fade up, and a
    clip taken from the first second is then six seconds of nothing — which
    looks exactly like a video that is failing to play. So a few points through
    the file are sampled and the first one with actual picture in it wins."""
    d = duration_of(src)
    points = [d * f for f in (0.25, 0.45, 0.1, 0.65, 0.85)] if d > 2 else [1, 0, 2]
    best_t, best_v = points[0], -1
    for t in points:
        v = frame_mean(src, t)
        if v > best_v:
            best_v, best_t = v, t
        if v >= 26:                      # plainly not black; stop looking
            break
    return max(0, best_t), best_v


def ensure_clip(name):
    """A short, silent, small loop for a video — what the field plays.

    Without this the page hands three <video> elements the original files,
    which here is 750MB between them. The browser opens range requests it then
    abandons, nothing ever has enough buffered to paint, and the tiles sit
    there as stills. A six-second 640px clip is a few hundred KB and loops
    forever without touching the network again. The real file is only fetched
    when a piece is actually opened."""
    src = os.path.join(MEDIA, name)
    if not os.path.isfile(src):
        return None

    out = os.path.join(CLIPS, name + '.mp4')
    rel = 'media/.previews/clips/' + name + '.mp4'
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return rel

    os.makedirs(CLIPS, exist_ok=True)
    at, level = pick_offset(src)
    if level < 0:
        sys.stderr.write('no decodable frame in %s\n' % name)
        return None
    tmp = out + '.part'
    cmd = ['ffmpeg', '-y', '-v', 'error',
           '-ss', str(at), '-t', str(CLIP_SECONDS),  # seek before -i: no full decode
           '-i', src,
           '-an',                                  # silent: the field never speaks
           '-vf', "scale='min(%d,iw)':-2" % CLIP_W,
           '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast',
           '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
           '-f', 'mp4', tmp]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)
        if os.path.isfile(tmp) and os.path.getsize(tmp) > 0:
            os.replace(tmp, out)
            return rel
    except Exception as e:
        sys.stderr.write('clip failed for %s: %s\n' % (name, e))
    if os.path.exists(tmp):
        os.remove(tmp)
    return None


def media_listing():
    if not os.path.isdir(MEDIA):
        return []
    return [describe(f) for f in sorted(os.listdir(MEDIA))
            if not f.startswith('.') and os.path.isfile(os.path.join(MEDIA, f))]


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')   # edits show up on reload
        super().end_headers()

    def log_message(self, fmt, *args):
        line = fmt % args
        if '/upload' in line or '/data' in line or ' 4' in line or ' 5' in line:
            sys.stderr.write('%s\n' % line)

    # ---- GET ----

    def do_GET(self):
        route = urlparse(self.path).path

        if route == '/api/env':
            return self.send_json({'editable': True})
        if route == '/api/media':
            return self.send_json(media_listing())

        rng = self.headers.get('Range')
        if rng:
            path = self.translate_path(self.path)
            if os.path.isfile(path):
                return self.send_range(path, rng)
        return super().do_GET()

    def send_range(self, path, rng):
        size = os.path.getsize(path)
        m = RANGE_RE.match(rng.strip())
        if not m:
            return super().do_GET()

        first, last = m.group(1), m.group(2)
        if first == '':
            if last == '':
                return super().do_GET()
            start, end = max(0, size - int(last)), size - 1
        else:
            start = int(first)
            end = int(last) if last else size - 1

        if start >= size or start > end:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return

        end = min(end, size - 1)
        count = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(count))
        self.end_headers()

        with open(path, 'rb') as f:
            f.seek(start)
            while count > 0:
                chunk = f.read(min(64 * 1024, count))
                if not chunk:
                    break
                self.wfile.write(chunk)
                count -= len(chunk)

    # ---- POST ----

    def do_POST(self):
        route = urlparse(self.path).path
        if route == '/upload':
            return self.do_upload()
        if route == '/data':
            return self.do_data()
        return self.send_error(404)

    def do_upload(self):
        name = safe_name(self.headers.get('X-Filename'))
        if not name:
            return self.send_error(400, 'missing or unusable X-Filename')

        length = int(self.headers.get('Content-Length') or 0)
        os.makedirs(MEDIA, exist_ok=True)

        existing = os.path.join(MEDIA, name)
        if os.path.isfile(existing) and os.path.getsize(existing) == length:
            self.discard(length)                       # the same file again
            out = describe(name)
            out['reused'] = True
            return self.send_json(out)

        target = free_path(name)
        try:
            with open(target, 'wb') as f:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    f.write(chunk)
                    remaining -= len(chunk)
        except OSError as e:
            return self.send_error(500, 'write failed: %s' % e)

        self.send_json(describe(os.path.basename(target)))

    def do_data(self):
        length = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(length) if length else b''
        try:
            json.loads(body)                           # refuse to persist garbage
        except Exception:
            return self.send_error(400, 'body is not JSON')
        tmp = DATA + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, DATA)                          # atomic: never a half file
        self.send_json({'saved': True, 'bytes': len(body)})

    def discard(self, length):
        while length > 0:
            chunk = self.rfile.read(min(1024 * 1024, length))
            if not chunk:
                break
            length -= len(chunk)

    # ---- helpers ----

    def send_json(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_one_request(self):
        # browsers abort media downloads constantly; that isn't an error
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get('PORT') or 8000)
    os.makedirs(MEDIA, exist_ok=True)
    print('opo3 →  http://localhost:%d   (ctrl-c to stop)' % port)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
