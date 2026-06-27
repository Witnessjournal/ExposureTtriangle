# Photographic Exposure — WebGL Tool

An interactive visualiser for how photographic exposure works: four dials
(ISO, shutter **Time**, **Aperture**, exposure compensation) on the left, and a
rotatable 3-D **ISO / F / T** exposure space on the right with a live preview
photo that brightens, blurs, defocuses and grows noisy as you move through it.

## What it shows

- **Exposure space** — ISO (vertical), Time and Aperture axes. A marker dot
  marks the chosen combination, with a drop-line to the F–T plane and dashed
  projections onto the F and T axes.
- **The preview photo** sits in the plane of the *auto* parameters and only
  translates along the controlled axis:
  - 3 auto (full auto) → lies in the F–T plane, slides vertically with ISO
  - 1 controlled → orthogonal to that axis, in the plane of the two auto axes
  - 2 controlled → orthogonal to the lone auto axis
- **Live effects** driven by a WebGL shader: aperture → depth-of-field blur,
  shutter time → motion blur, ISO → grain, exposure → brightness (the photo's
  **alpha channel is a depth map** for the defocus).
- **Auto heuristic** (lexicographic): hit correct exposure → aperture as close
  to f/5.6 as possible → ISO near base (200) → shutter as short as possible.
  When correct exposure can't be reached, the photo goes bright/dark and the EV
  badge turns amber (over) or blue (under).
- **½-stop / ⅓-stop** toggle re-grades every dial, preserving the current values.

## Files

| File | Purpose |
|------|---------|
| `exposure-triangle.js` | The reusable, framework-free Web Component. |
| `scene.png` | Preview photo. RGB = image, **alpha = depth map** (0 near → 1 far). |
| `_extensions/exposure-triangle/` | The Quarto shortcode extension (bundles the JS + photo). |
| `index.html` | Standalone demo / embed example. |
| `demo.qmd` | RevealJS deck showing the Quarto extension. |
| `Exposure Triangle.dc.html` | The original authoring source (Design Component). |

## Use it on a page (e.g. Quarto)

```html
<script src="exposure-triangle.js"></script>
<exposure-triangle style="height:560px"></exposure-triangle>
```

Three.js is loaded automatically from a CDN; styles are isolated in shadow DOM.

### Attributes

| Attribute | Default | Notes |
|-----------|---------|-------|
| `accent` | `#F5B544` | Dial + marker colour. |
| `scene` | `./scene.png` | Preview photo URL (alpha = depth). |
| `floor-grid` | shown | `"false"` to hide the F–T grid. |
| `spin` | off | present to auto-rotate. |
| `three-src` | CDN r128 | override the Three.js URL. |

### Programmatic mount

```js
ExposureTriangle.mount('#target', { accent: '#2A6FDB', height: '600px' });
```

The element emits a `change` event with `{ iso, f, t, ev, mode }` whenever the
state moves.

## Use as a Quarto extension (RevealJS / HTML)

A shortcode extension lives in `_extensions/exposure-triangle/`. It bundles the
component script **and** the default `scene.png`, wiring both into the rendered
output automatically — no manual `<script>` tag, no copying assets.

Install it into a Quarto project:

```sh
quarto add <owner>/<repo>                   # once published to GitHub, or…
# copy _extensions/exposure-triangle/ into your project's _extensions/
```

Then drop the shortcode into any RevealJS (or HTML) document:

````markdown
---
format: revealjs
---

## Full auto

{{< exposure-triangle >}}

## Customised

{{< exposure-triangle accent="#2A6FDB" spin=true floor-grid=false height="640px" >}}
````

`quarto render demo.qmd` builds the included sample deck.

### Shortcode arguments

Each maps directly onto the component attribute of the same name:

| Argument | Default | Notes |
|----------|---------|-------|
| `accent` | `#F5B544` | Dial + marker colour. |
| `scene` | bundled `scene.png` | Preview photo URL (alpha = depth). |
| `floor-grid` | `true` | `false` to hide the F–T grid. |
| `spin` | `false` | `true` to auto-rotate. |
| `three-src` | CDN r128 | Override the Three.js URL. |
| `height` | `560px` | CSS height of the widget box. |
| `width` | full | CSS width of the widget box. |

The bundled photo is found relative to the script's own URL, so the default
`scene` works wherever Quarto places the lib folder.

## Local preview

Any static server works (the component fetches `scene.png`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## License

MIT
