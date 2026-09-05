# opo7

https://guccibum.github.io/opo/

```bash
python3 serve.py
```

Three words at the top and the pages they switch between. A word that carries
children opens them and goes nowhere; one of those children is what moves you,
which is why `home` carries a `home` of its own. Pressing the same word again
shuts its row.

- **home** — the ground, and `control panel`
- **about** — the bio
- **work** — `video`, `sculpture`, `image`

## The ground

`js/ground.js` runs Generative Gestaltung's image feedback on a canvas under the
cursor: a block of what is already there, stamped back a few pixels away, so the
damage compounds. The picture is painted back underneath every frame, which is
the only thing holding it in equilibrium — stand still and it heals, drag across
it and it tears.

A theme is a picture **and** the colours measured off it. The image is averaged
when it loads and the ink set a fixed distance from what was found, so no theme
is louder than another. Every colour on the site is built from those two
triples, `--paper-rgb` and `--ink-rgb`.

Adding a theme is one line in `THEMES` at the top of `js/ground.js`.

## The control panel

`control panel`, under `home`. Throttle, radius, on, heal, and the theme.
Dragged from anywhere that is not a control; what you set is remembered. `g`
hides it.

## The work

| section | display |
|---|---|
| `video` | `js/reel.js` — iteration two's cover flow |
| `image` | `js/map.js` + `js/grid.js` — iteration five's solid grid |
| `sculpture` | files converted and waiting; no display yet |

Both open into `js/player.js`, over the page, growing out of whatever was
pressed.

What is in each section is written down in `SETS` at the top of `js/work.js`,
not read off the folder — the folder can only be read where `serve.py` is
running, and a published copy has no server to ask.

A section is built the first time it is asked for, not at boot.

## The type

Everything is set from four numbers at the top of `style.css`:

```css
--type:    arial, sans-serif;
--weight:  700;
--stretch: 4;      /* the top row, along x */
--stretch-y: 2;    /* and up */
```

`js/nav.js` measures the row on a canvas and reads the face, weight and size
back off the element, so changing the typeface is one line there and nothing
here.
