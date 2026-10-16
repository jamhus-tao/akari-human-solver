# Visual reference and asset provenance

The independent replay viewer uses the original site's visual language, not its
application code or game runtime. References were inspected on 2026-10-15:

- `https://dailyakari.com/`: black background, Alata headings, dark outlined
  controls, mint primary action, pink date accent and cyan links.
- Original game screenshot: checkerboard blue-gray white cells, black walls,
  white outline, white light points, pale clue glyphs.
- Public game theme `res://Themes/PuzzleTheme.tres`: BaseAlbedo
  (0.26, 0.332333, 0.4), LitColor (0.0736, 0.66608, 0.92), checker modulation,
  pink flash and green completed accents. These values informed CSS colors.
- Alata Latin WOFF2: Google Fonts public CDN, original URL
  `https://fonts.gstatic.com/s/alata/v12/PbytFmztEwbIoce9zqY.woff2`.
  License: `Alata-OFL.txt`, SIL Open Font License, obtained from Google Fonts.

`reference/` is local inspection material, gitignored, and blocked by the local
server. The viewer does not embed the original game's JS, shaders, textures,
WASM, analytics, or storage. The renderer uses flat cells; wall extrusion, perspective and transitional animation are omitted. The satisfied face is the
original static asset documented below; remaining counts use stable text. SVG geometry is authored locally. Pink center outlines, blue dashed
hypotheses, green proof outlines and red conflicts are viewer-only overlays.

## Satisfied clue face

`clue-satisfied.webp` is the original game's static end frame of the
`OneToSmile` animation (`OneToSmile59.png`, 240 x 240), extracted losslessly
from the public `akari.pck` stream texture. It is used solely for the requested
local original-style completion indicator. Original artwork belongs to its
creator; no open license for this game artwork is asserted. Confirm permission
before redistributing publicly. It is not a newly generated/replaced emoji.
The runtime, remaining animation frames and shaders are not shipped by this page.

The prior stable-clue-only description is superseded: replay cells show remaining
adjacent Lamp count, a satisfied face at exactly zero, and a small original Clue
value in the lower-right corner whenever remaining differs from original.
The Original board reference/export intentionally preserves the original numbers.

## Static illumination and flat geometry

`rendering.mjs` ports the settled-color path of the bundled original
`reference/akari.pck` PuzzleShader and PuzzleTheme. The base top-face color is
`(0.26, 0.332333, 0.4)`. Alternating cells retain the original checker
modulation (`CheckerMod=0.07`), including while lit. Each visible lamp contributes
`LitColor=(0.0736, 0.66608, 0.92)` with the original distance attenuation
(`Attenuation=0.2`) in grid space. Contributions add, receive the shader's lit
checker modulation (`CheckerStrength=0.45`), and use its lightness/max-channel
normalization and white mixing (`OverlapMult=1`, `OverlapDimmer=0.02`). This
reproduces the original behavior where blue light combines with the cell's
checker state, fades along a ray, and brightens where rays overlap.

Animation, hover/flash states, fringe transitions, lamp-ring masks, bloom and 3D
side faces are intentionally absent. The renderer evaluates the original shader's
settled cell-center result and draws it as a flat SVG square. Hard-edge SVG
rasterization prevents black seams between adjacent lit and Lamp cells. A final
88% light-to-floor blend is the requested replay-viewer adjustment, reducing
blue depth while preserving the original checker, attenuation and overlap order.
For lit cells only, 40% of the floor black component is removed before that
blend, so dark checker cells tint the light without heavily muddying it.

The current renderer uses equal-sized, aligned 2D squares, a rectangular white
outline and no side faces or perspective. Original floor colors, black walls,
white lamp points, the satisfied face and proof overlays are retained.
