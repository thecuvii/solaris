# OG image

The user-supplied `Sky` settings rendered directly in WebGL without text.
`scene.js` is the source of truth for all shader parameters.

From the repository root:

```sh
node scripts/og/render.mjs --serve
node scripts/og/render.mjs
```

Preview: `http://127.0.0.1:3107/scripts/og/`. Rendering writes the shared social
image at `website/public/og.png` (2400 × 1260, rendered at 2× from a 1200 × 630 composition). Pass a PNG path to export elsewhere.
Chrome must be installed for capture.

Composition lives in `index.html`; sky and exposure parameters in `scene.js`.
The sky is procedural and does not need fonts or texture assets.
