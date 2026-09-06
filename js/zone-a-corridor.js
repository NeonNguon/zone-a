// ================================================================
// Zone A V2 — the chung cư corridor, and the teleport pair that reaches it.
//
// Zone A used to BE its room: a half-circle ring of the nine "All the Places I
// Have Lived" images standing in the middle of it. In V2 the room is empty
// except for a teleport booth and the info terminal, and the images have moved
// into the place they are about — the long corridor of an old Saigon chung cư
// (apartment block), with three one-room apartments off its far end holding
// three images each.
//
// The corridor is a SUB-SPACE, built exactly like the Zone B floor map: parked
// far out (+400 m on z, where the map is at −400 so the two can never meet),
// hidden by a pure visibility flip, and reached only by teleport. Nothing about
// it is walkable-reachable from the gallery.
//
// Loaded in <head> AFTER rig-collision.js, because it needs every one of these
// registered first: `teleport-terminal` + TerminalKit (the booths' furniture),
// TeleportRig + `transition-glitch` (the masked jump), `floorplan` (the Zone A
// room centre the booth stands on) and `rig-collision` (the walkable-region
// registry the corridor adds its rooms to).
//
// Components in this file:
//   corridor-root   — the sub-space itself: geometry, procedural textures, its
//                     apartments and the nine images. One `offset` handle +
//                     `shown`, mirroring zone-b-map-root.
//   zone-a-teleport — the manager: the outbound booth in the Zone A room and
//                     the return booth on the corridor's landing, wired to each
//                     other through glitch-masked jumps.
//
// LIGHTING — read this before touching a material. Everything here is
// `shader: flat` (MeshBasicMaterial, unlit). The gallery's void preset lights
// its rooms with global directionals + a hemisphere + per-room point lamps that
// only exist over the FLOORPLAN's rooms; 400 m out, a lit corridor would be
// raked by the directionals alone and read completely wrong. So the light is
// BAKED INTO THE TEXTURES instead: the walls darken toward the ceiling and
// carry a soft pool under each tube, the ceiling carries a bright pool around
// each tube, the floor darkens along the wall edges. That makes the corridor
// independent of whichever environment preset is active, and costs nothing per
// frame. The only "lights" you can see are the tube planes themselves, which
// are just bright unlit quads.
// ================================================================

// ================================================================
// CorridorTextures — the corridor's whole surface palette, drawn at runtime on
// canvases (no image assets, same approach as ContactCue.makeTexture and
// bench.js's makeTerrazzoTexture) and wrapped as THREE.CanvasTextures with
// RepeatWrapping. Every texture is METRIC: the drawing function is told how
// many metres of wall/floor/door the canvas represents, and the meshes set
// their UVs from their own size, so a floor tile is 0.2 m everywhere and a door
// reads 2.1 m tall wherever it is.
//
// Palette + wear are taken from photographs of old Saigon chung cư corridors:
// dark red-brown cement floor tiles worn shiny down the middle, a yellowed
// stained ceiling, cream/yellow (sometimes faded green) two-leaf doors with
// louvred transoms, patterned gạch bông encaustic tiles inside the apartments
// — and, the thing the walls are actually about, paint.
//
// ---------------------------------------------------------------- THE WALLS
// A chung cư wall is not a colour, it is a STACK of coats put on over fifty
// years and worn back through each other, so that is how wall() builds it.
//
//   THE LAYER MODEL. Five coats — plaster, an earlier ochre scheme, a deep
//   cerulean, the pale lime-wash, a thin whitish top wash. Each has a COVERAGE
//   MASK: its own mix of a coarse (44 cm), a mid (24 cm) and a fine (13 cm)
//   noise field, all modulated by an 8:1 vertically stretched field so every
//   edge striates. Old thick coats fail in slabs, thin washes in small bits.
//   The mask is thresholded at a QUANTILE, so `coverage` is an area fraction
//   and means what it says. The stack resolves bottom-up: each surviving coat
//   is laid over what is already there — the old ones opaquely, the two washes
//   translucently and thinner still at the edge of an island, which is what
//   gives white-over-blue rather than white-beside-blue.
//
//   WHAT MAKES IT PAINT. Hard edges (a dark line at the foot of every step, a
//   light one on top, broken up by the fine field so it reads as relief and not
//   as ink); a gentle wear gradient that takes a little more off low down;
//   grime keyed to what is actually exposed rather than sprayed evenly; a 2 cm
//   speckle inside every coat's body, without which the whole thing reads as a
//   contour map.
//
//   VARIANTS. Three, handed out along the run and deliberately far apart:
//   "plain" (no painted ads — the one forced onto every segment beside an
//   apartment doorway, and onto the apartments themselves), "flaked"
//   (top washes largely gone, big blue islands, heavy grime, two ads) and
//   "stripe" (intact plus a ragged vertical band of the earlier ochre scheme,
//   one ad). They are behaviour presets — coverage biases, stripe on/off,
//   streak and grime strength — NOT colours, so they apply to any palette.
//
//   PAINTED MARKS. Stencilled phone numbers — no lettering of any kind, see
//   the note above wallMarks — painted at a few degrees off level on ONE coat
//   and then destroyed by whatever happened to the wall afterwards (see
//   markSurvival and the (a)/(b)/(c) guarantee — a number is never complete).
//
//   PALETTES. Every colour lives in WALL_PALETTES, and wall() takes one as an
//   argument, so the same generator paints any scheme — the relationship
//   makeTerrazzoTexture (js/bench.js) has with tinted-floor. Two are built in
//   ("chungcu", "green"); corridor-root picks one with `wallPalette`, patches it
//   with `wallPaletteOverride`, and can give each apartment its own with
//   `roomWallPalettes`. See the comment on WALL_PALETTES for the schema.
//
// ELEVEN canvases as the corridor ships, cached by their full parameter key —
// which includes a hash of the palette — so a rebuild (or a second corridor)
// reuses them: 3 corridor wall variants, ONE wall canvas for each of the three
// apartments' own schemes, floor, ceiling, door atlas, room floor, all
// textureSize², plus one small transom strip. About 41 MB, 55 MB with mipmaps.
// A palette costs one canvas per VARIANT it is actually used with, which is why
// an apartment (one variant) is cheap and the corridor (three) is not.
// On this desktop a wall canvas takes ~105 ms at the defaults (1024²,
// wallNoiseRes 2); halving the noise resolution or the texture size are the two
// levers, and ?zonea=debug prints the per-phase breakdown.
// ================================================================
const CorridorTextures = {
  cache: new Map(),

  // mulberry32 — the same tiny seeded PRNG bench.js uses, so a given `seed`
  // always paints the identical corridor (no Math.random anywhere).
  rand: function (seed) {
    let s = (seed * 0x9e3779b9) >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  canvas: function (w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },

  // Wrap a canvas as a repeating sRGB texture. Meshes that share a texture set
  // their repeat through their own UVs (see metricBoxUVs / setPlaneUVs), so the
  // texture object itself always stays at repeat 1 — one GPU upload per canvas
  // however many surfaces use it.
  texture: function (canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4; // grazing floor/wall angles are the whole corridor
    return tex;
  },

  // Build-time accounting. The wall canvases are the expensive ones (per-pixel
  // paint stratigraphy over several noise fields), and how long they take is
  // the number that decides wallNoiseRes / textureSize on a given device — so
  // every canvas records its own ms here and build() reports them.
  timings: {},

  // Cache wrapper: every getter goes through this, keyed by its arguments. A
  // cache HIT costs nothing and is recorded as such (0 ms), so the reported
  // total is always the work actually done this build.
  get: function (key, make) {
    if (this.cache.has(key)) {
      // A hit records 0 ms — but only if this canvas was not already DRAWN this
      // build. A texture is legitimately asked for more than once per build
      // (the wall canvases are fetched once for `tex` and again when their
      // materials are made), and the second ask must not erase the first's
      // cost from the report.
      if (!(key in this.timings)) this.timings[key] = 0;
      return this.cache.get(key);
    }
    const t0 = (window.performance || Date).now();
    const tex = this.texture(make());
    this.timings[key] = (window.performance || Date).now() - t0;
    this.cache.set(key, tex);
    return tex;
  },

  // ms spent this build on the canvases whose key starts with `prefix`, and how
  // many of them were actually drawn rather than served from the cache.
  timeFor: function (prefix) {
    let ms = 0;
    let drawn = 0;
    Object.keys(this.timings).forEach((k) => {
      if (k.indexOf(prefix) !== 0) return;
      ms += this.timings[k];
      if (this.timings[k] > 0) drawn++;
    });
    return { ms: ms, drawn: drawn };
  },

  // Clear the accounting at the start of a build (not the cache — the canvases
  // themselves are meant to survive).
  resetTimings: function () {
    this.timings = {};
  },

  // ---- THE PAINT STACK ---------------------------------------------------
  // WALL_PALETTES holds every colour the layer model uses, so the SAME
  // generator paints a different scheme without a line of its code changing —
  // exactly the relationship makeTerrazzoTexture (js/bench.js) has with
  // tinted-floor, where one speckle generator serves the bench, the dark Zone C
  // floor and the coral Zone B one.
  //
  // A palette is:
  //   coats[5]  bottom to top — plaster, an earlier scheme, the deep coat, the
  //             wash, the thin top wash. Each { color, color2, coverage,
  //             opacity }: two tones it varies between, the AREA FRACTION of
  //             the wall that still carries it (see maskThreshold), and how
  //             opaquely it covers what is under it (the thin washes are < 1,
  //             which is what lets the coat below show through them).
  //   stripe    { color } the band of an earlier scheme in the "stripe" variant
  //   grime     { color } the warm dark that collects in broken paint
  //   drip      { color } rust running down from the slab
  //   lichen    { color, core } the pale blooms and their dark centres
  //   streak    { light, dark } the brushed vertical strokes
  //   stencil   { red, dark } the two inks a mark is painted in — the first is
  //             usually the red-orange, but it is whatever READS on that wall
  //             (on the red scheme it is a chalky white)
  //
  // TO ADD A SCHEME: copy an entry, change the colours, and set `wallPalette`
  // on corridor-root to its name. To change ONE thing about an existing scheme,
  // leave the name alone and pass `wallPaletteOverride` instead — it is merged
  // over the named palette, and `coats` merges per index, so
  //   {"coats":[{},{"color":"#7a8f5a"}]}
  // swaps the ochre coat for green and leaves everything else as it was.
  WALL_PALETTES: {
    // The blue chung cư corridor: pale lime-wash over cerulean over an ochre
    // scheme over cement plaster, which is the stack the reference walls show.
    chungcu: {
      coats: [
        { color: "#948d80", color2: "#746e63", coverage: 1.0, opacity: 1 },
        { color: "#ba8f34", color2: "#cea43f", coverage: 0.78, opacity: 1 },
        { color: "#3a7ea4", color2: "#4a94b9", coverage: 0.94, opacity: 0.96 },
        { color: "#9dbac5", color2: "#acc6ce", coverage: 0.86, opacity: 0.88 },
        { color: "#d4dcd6", color2: "#c5cfca", coverage: 0.55, opacity: 0.8 },
      ],
      stripe: { color: "#cea43f" },
      grime: { color: "#3a2e22" },
      drip: { color: "#8a5a3a" },
      lichen: { color: "#e2e2d4", core: "#3a362c" },
      streak: { light: "#dbe5e2", dark: "#46565c" },
      stencil: { red: "#c8472a", dark: "#1c2a44" },
    },
    // ---- THE THREE APARTMENTS ------------------------------------------
    // Each is a whole stack, not a recoloured top coat. Two things are tuned
    // differently from the corridor and they are what make a room read as its
    // colour rather than as a white room with a tint:
    //
    //   THE TOP COAT CARRIES THE COLOUR. In the corridor the newest coat is a
    //   near-white wash over the blue, because nobody has painted a corridor in
    //   decades and what is left up there is old limewash. A room is different:
    //   somebody lives in it, so the last time it was painted it was painted
    //   its colour. So an apartment's top coat is the scheme itself, the coat
    //   under it a deeper version, and the saturated original below that.
    //
    //   That is also what lets roomWallFlake work. Turning the decay down means
    //   more of the top coat survives; if the top coat were near-white the room
    //   would simply go pale as it got calmer, which is exactly what it did
    //   before these colours were re-cut.
    //
    //   The WHOLE STACK is keyed to the scheme: the deep coat is a saturated
    //   version of it, the wash is that colour let down, the top wash is an
    //   off-white carrying the same cast, and the coat UNDER it all is a
    //   plausible earlier scheme for that building — which is what shows in
    //   the deep flakes and in the stripe.
    //
    // The two stencil inks are just "the two colours a mark is painted in";
    // the first is usually the red-orange, but on a red wall red would not
    // read, so there it is the chalky white people actually use.

    // Colonial yellow: the soft ochre of every French-era block in Saigon,
    // over an older terracotta scheme.
    yellow: {
      coats: [
        { color: "#948d80", color2: "#746e63", coverage: 1.0, opacity: 1 },
        { color: "#a2593a", color2: "#b56b48", coverage: 0.78, opacity: 1 },
        { color: "#cf9a2e", color2: "#dfab42", coverage: 0.94, opacity: 0.96 },
        { color: "#d9c07a", color2: "#e3cc8f", coverage: 0.88, opacity: 0.88 },
        { color: "#e9dab0", color2: "#ddcda2", coverage: 0.45, opacity: 0.8 },
      ],
      stripe: { color: "#b56b48" },
      grime: { color: "#3a2c1c" },
      drip: { color: "#8a5a3a" },
      lichen: { color: "#e8e3cc", core: "#3a352a" },
      streak: { light: "#f5ecd4", dark: "#6d5c36" },
      stencil: { red: "#b8402a", dark: "#23304a" },
    },

    // Oxide red: the deep brick-red of a stairwell or a communal room, over
    // the usual ochre.
    red: {
      coats: [
        { color: "#948d80", color2: "#746e63", coverage: 1.0, opacity: 1 },
        { color: "#ba8f34", color2: "#cea43f", coverage: 0.78, opacity: 1 },
        { color: "#9e3a2c", color2: "#b5493a", coverage: 0.94, opacity: 0.96 },
        { color: "#c98d7c", color2: "#d59e8e", coverage: 0.88, opacity: 0.88 },
        { color: "#dfbdb2", color2: "#d3aea3", coverage: 0.45, opacity: 0.8 },
      ],
      stripe: { color: "#cea43f" },
      grime: { color: "#3a2820" },
      drip: { color: "#8a5a3a" },
      lichen: { color: "#e8e0d6", core: "#3a322c" },
      streak: { light: "#f2e2da", dark: "#6e3f34" },
      stencil: { red: "#f0e6d8", dark: "#2a1c18" },
    },

    // Faded jade: the other colour these buildings are painted, over the same
    // ochre and plaster.
    green: {
      coats: [
        { color: "#948d80", color2: "#746e63", coverage: 1.0, opacity: 1 },
        { color: "#ba8f34", color2: "#cea43f", coverage: 0.78, opacity: 1 },
        { color: "#2f6b57", color2: "#3d8069", coverage: 0.94, opacity: 0.96 },
        { color: "#93b5a4", color2: "#a3c2b2", coverage: 0.88, opacity: 0.88 },
        { color: "#bdcfc4", color2: "#aec1b6", coverage: 0.45, opacity: 0.8 },
      ],
      stripe: { color: "#cea43f" },
      grime: { color: "#3a2e22" },
      drip: { color: "#8a5a3a" },
      lichen: { color: "#e2e2d4", core: "#3a362c" },
      streak: { light: "#dde8e0", dark: "#42574e" },
      stencil: { red: "#c8472a", dark: "#1c2a44" },
    },
  },

  // "#rrggbb" -> [r,g,b]. The palette is written in hex because that is what
  // everyone edits; the composite wants numbers.
  hexRGB: function (hex) {
    const h = String(hex).replace("#", "");
    const n = parseInt(
      h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  // A palette argument may be a NAME, an already-resolved palette object, or
  // nothing at all (the default scheme).
  resolvePalette: function (pal) {
    if (!pal) return this.WALL_PALETTES.chungcu;
    if (typeof pal === "string") {
      const found = this.WALL_PALETTES[pal];
      if (!found) {
        console.warn("corridor: unknown wall palette '" + pal + "'; using chungcu");
      }
      return found || this.WALL_PALETTES.chungcu;
    }
    return pal;
  },

  // Merge an override over a base palette. `coats` merges per INDEX, so an
  // override only has to name the coat it cares about; everything else is a
  // shallow per-group merge.
  mergePalette: function (base, over) {
    if (!over) return base;
    const out = {};
    Object.keys(base).forEach((k) => {
      out[k] = k === "coats" ? base.coats.map((c) => Object.assign({}, c))
                             : Object.assign({}, base[k]);
    });
    Object.keys(over).forEach((k) => {
      if (k === "coats" && over.coats) {
        over.coats.forEach((c, i) => {
          if (c && out.coats[i]) Object.assign(out.coats[i], c);
          else if (c) out.coats[i] = Object.assign({}, c);
        });
      } else if (over[k] && typeof over[k] === "object") {
        out[k] = Object.assign({}, out[k] || {}, over[k]);
      } else if (over[k] != null) {
        out[k] = over[k];
      }
    });
    return out;
  },

  // A short stable hash of a palette, for the cache key: two rooms asking for
  // the same colours share one canvas, two asking for different ones never do.
  // Keys are sorted so the hash does not depend on how the object was built.
  paletteKey: function (pal) {
    const stable = function (v) {
      if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
      if (v && typeof v === "object") {
        return "{" + Object.keys(v).sort().map(
          (k) => k + ":" + stable(v[k])).join(",") + "}";
      }
      return String(v);
    };
    const str = stable(pal);
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  },

  // The three looks handed out along the run, as OVERRIDES of the behaviour
  // knobs rather than of the colours — so a green room can still be "flaked".
  // `coverBias` shifts each coat's coverage (positive keeps more of it), and
  // the differences are big enough to read from the far end of the corridor
  // rather than being a subtle reseed.
  // COVERAGE is an area fraction, and because a pixel shows the TOPMOST coat
  // that survives, what you see is the cascade: ~55% top wash, ~30% pale, ~10%
  // deep coat, the rest the earlier scheme and bare plaster. That is the
  // proportion the reference walls hold — mostly pale, with the older schemes
  // showing through in a minority of places, not a camouflage of equal patches.
  WALL_VARIANTS: [
    // "plain" is the one WITHOUT painted ads, not the one that is clean. Every
    // wall segment beside an apartment doorway is forced to it so no phone
    // number lands next to a hanging picture — and while its coverBias also
    // made it far less weathered than the other two, that turned the whole
    // apartment stretch into a conspicuously scrubbed patch of corridor. It is
    // now weathered like the rest; only the ads are missing.
    { name: "plain", coverBias: [0, 0.03, 0.02, 0.0, -0.04], stripe: false,
      grain: 1.0, grime: 0.95, marks: 0 },
    { name: "flaked", coverBias: [0, -0.14, -0.16, -0.26, -0.3], stripe: false,
      grain: 1.15, grime: 1.15, marks: 2 },
    { name: "stripe", coverBias: [0, 0.02, 0.0, -0.04, -0.12], stripe: true,
      grain: 1.35, grime: 1.0, marks: 1 },
  ],

  // Named scratch buffers. Each wall canvas wants five noise fields and four
  // coat masks — nine megabytes of Float32Array at the default resolution — and
  // three canvases in a row churning that is enough to show up as GC pauses in
  // the middle of the build. The buffers are only live while one canvas is
  // being drawn, so they are pooled by name and reused by the next.
  scratch: {},
  buf: function (slot, n) {
    const b = this.scratch[slot];
    if (b && b.length === n) return b;
    const fresh = new Float32Array(n);
    this.scratch[slot] = fresh;
    return fresh;
  },

  // ---- NOISE FIELDS ------------------------------------------------------
  // A seeded value-noise / fbm generator. Everything on the wall that has to
  // look like weather rather than like a pattern — which coat of paint survives
  // where, the vertical brush grain, where the grime pooled — is a threshold on
  // one of these fields.
  //
  // Two properties matter, and both are deliberate:
  //
  //  PERIODIC IN X. The wall canvas repeats every lighting bay along the run,
  //  so a field that did not wrap would put a vertical seam every few metres.
  //  The lattice wraps in x (the last column interpolates back to the first),
  //  so every field tiles exactly — the same guarantee wrapX gives the canvas
  //  2D passes. It is NOT periodic in y: the canvas is used exactly once over
  //  the wall's height, and the wear has to differ at the ceiling and the floor.
  //
  //  ANISOTROPIC. baseFreqX and baseFreqY are separate, so a field can be
  //  stretched vertically into long streaks (the brushed grain that runs down
  //  every one of the reference walls) or kept round in METRIC space — which is
  //  not the same as round in pixels, because the canvas covers a bay's length
  //  by the wall's height and those are different numbers of metres.
  //
  // Fields are computed at a REDUCED resolution (wallNoiseRes on corridor-root:
  // 2 = half, 4 = quarter) and sampled bilinearly when the full-size canvas is
  // composited. Thresholding happens AFTER that interpolation, so a coat's edge
  // is still pixel-crisp — the reduction costs contour smoothness, not
  // sharpness, and it is the single biggest lever on build time.
  //
  // Returns { data: Float32Array(w*h), w, h } normalised to [0,1].
  noiseField: function (rand, w, h, opts) {
    const octaves = opts.octaves || 4;
    const gain = opts.gain != null ? opts.gain : 0.5;
    const lac = opts.lacunarity || 2;
    // `slot` reuses a pooled buffer (the wall does; a one-off caller need not).
    const out = opts.slot ? this.buf(opts.slot, w * h) : new Float32Array(w * h);
    if (opts.slot) out.fill(0);
    let amp = 1;
    let norm = 0;
    let fx = opts.baseFreqX;
    let fy = opts.baseFreqY;
    for (let o = 0; o < octaves; o++) {
      this.valueOctave(out, w, h, rand, fx, fy, amp);
      norm += amp;
      amp *= gain;
      fx *= lac;
      fy *= lac;
    }
    const inv = 1 / (norm || 1);
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return { data: out, w: w, h: h };
  },

  // One octave of value noise, added into `out`. `cx` lattice cells across the
  // width (rounded to a whole number — that is what makes the field periodic in
  // x) and `cy` down the height. Smoothstep interpolation, which is enough:
  // these fields are thresholded into hard edges, so gradient continuity buys
  // nothing that a Perlin gradient would.
  valueOctave: function (out, w, h, rand, cx, cy, amp) {
    const gw = Math.max(1, Math.round(cx)); // wraps
    const gh = Math.max(1, Math.round(cy)) + 1; // does not wrap: +1 for the edge
    const g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = rand();

    const sx = gw / w;
    const sy = (gh - 1) / h;
    // The x lattice lookup is the same for every row, so do it once.
    const ix0 = new Int32Array(w);
    const ixw = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const fxv = x * sx;
      const x0 = Math.floor(fxv);
      const tx = fxv - x0;
      ix0[x] = x0 % gw;
      ixw[x] = tx * tx * (3 - 2 * tx);
    }
    for (let y = 0; y < h; y++) {
      const fyv = y * sy;
      const y0 = Math.floor(fyv);
      const ty = fyv - y0;
      const wy = ty * ty * (3 - 2 * ty);
      const r0 = y0 * gw;
      const r1 = Math.min(gh - 1, y0 + 1) * gw;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = ix0[x];
        const x1 = x0 + 1 === gw ? 0 : x0 + 1; // wrap: the seam closes here
        const wx = ixw[x];
        const a = g[r0 + x0];
        const b = g[r0 + x1];
        const c = g[r1 + x0];
        const d = g[r1 + x1];
        const top = a + (b - a) * wx;
        const bot = c + (d - c) * wx;
        out[row + x] += (top + (bot - top) * wy) * amp;
      }
    }
  },

  // Index + weight tables for sampling a reduced field at full canvas size.
  // Built once per canvas and shared by every field (they all share a
  // resolution), so the composite loop is four array reads and three lerps per
  // field per pixel and no arithmetic on coordinates at all.
  //   wrap: x wraps (periodic), y clamps.
  bilinTable: function (srcN, dstN, wrap) {
    const i0 = new Int32Array(dstN);
    const i1 = new Int32Array(dstN);
    const wt = new Float32Array(dstN);
    const scale = srcN / dstN;
    for (let i = 0; i < dstN; i++) {
      const f = i * scale;
      const a = Math.floor(f);
      const t = f - a;
      const a0 = wrap ? a % srcN : Math.min(srcN - 1, a);
      const a1 = wrap ? (a0 + 1) % srcN : Math.min(srcN - 1, a0 + 1);
      i0[i] = a0;
      i1[i] = a1;
      wt[i] = t;
    }
    return { i0: i0, i1: i1, w: wt };
  },

  // ---- shared drawing helpers -------------------------------------------

  // An irregular blob: a closed wobbly polygon around (x,y). Every patch of
  // wear on these surfaces is one of these — peeled paint, plaster, a stain.
  blob: function (ctx, rand, x, y, rx, ry, points) {
    const n = points || 9;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = 0.55 + rand() * 0.75; // per-vertex radius jitter
      const px = x + Math.cos(a) * rx * k;
      const py = y + Math.sin(a) * ry * k;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  },

  // SEAMLESS TILING. The wall canvas repeats every bay along the corridor, so
  // anything drawn near its left or right edge has to appear at the other edge
  // too or there is a visible vertical seam every few metres. wrapX draws the
  // same mark three times - in place, and one canvas width either side - so
  // everything that runs off one edge comes back on the other. (Vertically
  // nothing wraps: the wall texture is used exactly once over the wall height.)
  wrapX: function (S, x, draw) {
    draw(x);
    if (x < S * 0.25) draw(x + S);
    else if (x > S * 0.75) draw(x - S);
  },

  // A SOFT patch: filled with a radial gradient so it fades out at its edge.
  // Nearly all wear on a limewashed wall is soft like this - damp, grime, a
  // thin skin of old paint - and hard-edged polygons are exactly what makes a
  // procedural wall look procedural. `rgb` is the patch colour, `a` its alpha
  // at the centre.
  softBlob: function (ctx, rand, x, y, rx, ry, rgb, a) {
    const r = Math.max(rx, ry, 1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(" + rgb + "," + a.toFixed(3) + ")");
    g.addColorStop(0.55, "rgba(" + rgb + "," + (a * 0.55).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + rgb + ",0)");
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  // Fine grain over everything, so no surface is a flat digital field.
  grain: function (ctx, rand, w, h, count, alpha) {
    for (let i = 0; i < count; i++) {
      const v = Math.floor(rand() * 60);
      ctx.fillStyle =
        "rgba(" + v + "," + v + "," + v + "," + (alpha * rand()).toFixed(3) + ")";
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
    }
  },

  // ---- PAINTED MARKS -----------------------------------------------------
  // The service ads that are stencilled on every wall in Saigon: a phone number
  // in bold condensed capitals, sometimes with the trade above it, sprayed
  // through a card stencil and left to weather.
  //
  // WHERE IN THE STACK. A mark is painted on ONE coat — the pale wash — so it
  // is destroyed by whatever happened to the wall afterwards, and that is what
  // makes it read as old rather than as a decal. It is masked by the coat-index
  // map the composite produced: full strength where the pale wash is still the
  // surface, a ghost where a later whitewash went over it, a trace where the
  // coat it was painted on has flaked (the pigment stays in the pits), nothing
  // at all where the wall has gone back to plaster.
  //
  // NEVER A COMPLETE NUMBER. Not left to chance — three mechanisms, and the
  // third audits the other two:
  //   (a) the coat mask above, which is the physical one;
  //   (b) every mark, by seed, either has a contiguous run of at least three
  //       digits OVERPAINTED with a patch of the coat above (somebody's later
  //       whitewash across the ad) or is placed so at least three digits run
  //       off the edge of the bay;
  //   (c) after drawing, each digit's ink is counted before and after masking;
  //       any digit still carrying 40% of its ink is "legible", and if more
  //       than seven survive, another run is overpainted until they do not.
  // (c) is what makes the guarantee hold no matter how the noise fell.
  //
  // NUMBERS ONLY. No trade above them, no freehand lettering: anything with
  // letters in it reads as a WORD from across the corridor and pulls the eye,
  // and a wall that captions itself is not what this place is. A phone number
  // is a texture — you register what it is without reading it.
  //
  // The number itself is a real Vietnamese mobile: 0 + a live prefix + seven
  // seeded digits, grouped the way they are written on walls, and never level:
  // it was painted freehand off a card, so it always sits a few degrees off
  // horizontal (wallStencilTilt).
  MARK_FONT: "Impact, 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif",
  MARK_PREFIXES: [
    "90", "91", "93", "97", "98", "32", "33", "34", "35", "36", "37", "38",
    "39", "70", "76", "77", "78", "79", "81", "82", "83", "84", "85", "88",
    "89",
  ],

  // How much of a mark survives, given which coat the wall has ended up
  // showing at that pixel. Index 3 is the coat it was painted on.
  markSurvival: function (idx) {
    if (idx === 3) return 1; // the coat it was painted on is the surface
    if (idx === 4) return 0.62; // a later wash went over it: a ghost, not gone
    if (idx === 2) return 0.2; // its coat flaked; pigment left in the pits
    return 0; // back to plaster: the mark went with the paint
  },

  wallMarks: function (ctx, C) {
    const S = C.S;
    const rand = C.rand;
    const density = C.density;
    if (density <= 0) return;

    // How many number marks this bay carries. The "flaked" variant gets the
    // most, "intact" none — which is also how the doorway-adjacent segments and
    // the apartments stay clear of them (they are built from those variants).
    const n = Math.floor(C.variant.marks * density + rand());
    const legibleLog = [];
    for (let i = 0; i < n; i++) {
      legibleLog.push(this.oneNumberMark(ctx, C));
    }
    if (C.debug && legibleLog.length) {
      console.log(
        "[corridor] wall marks (" + C.variant.name + "): legible digits " +
          legibleLog.join(", ") + " of 10 each"
      );
    }
  },

  // Mask a scratch canvas's alpha by the coat map underneath it, plus a little
  // noise roughness, and count how much ink each digit box keeps. Returns the
  // ImageData so the caller can go on editing it.
  // `a255` is the mark's own painted alpha. Both ink bars are relative to it,
  // so the audit asks "how much of this digit did the WALL take", not "how
  // faded was the paint" — a deliberately faint ad is still a legible one.
  maskToWall: function (sctx, C, bx, by, bw, bh, boxes, a255) {
    const S = C.S;
    const img = sctx.getImageData(0, 0, bw, bh);
    const d = img.data;
    // Ink per digit BEFORE the wall gets to it, so the audit below can say what
    // fraction of each digit survived rather than how many pixels it has.
    const before = boxes ? new Int32Array(boxes.length) : null;
    if (boxes) {
      for (let i = 0; i < boxes.length; i++) {
        before[i] = this.boxInk(d, bw, bh, boxes[i], a255 * 0.5);
      }
    }

    for (let y = 0; y < bh; y++) {
      const my = by + y;
      if (my < 0 || my >= S) {
        for (let x = 0; x < bw; x++) d[(y * bw + x) * 4 + 3] = 0;
        continue;
      }
      // the fine field, for a rough painted edge
      const fy0 = C.ty.i0[my] * C.fw;
      const fy1 = C.ty.i1[my] * C.fw;
      const fwy = C.ty.w[my];
      for (let x = 0; x < bw; x++) {
        const q = (y * bw + x) * 4 + 3;
        const a0 = d[q];
        if (a0 === 0) continue;
        const mx = bx + x;
        if (mx < 0 || mx >= S) {
          d[q] = 0;
          continue;
        }
        const sv = this.markSurvival(C.coatIdx[my * S + mx]);
        if (sv === 0) {
          d[q] = 0;
          continue;
        }
        const e0 = fy0 + C.tx.i0[mx];
        const e1 = fy0 + C.tx.i1[mx];
        const g0 = fy1 + C.tx.i0[mx];
        const g1 = fy1 + C.tx.i1[mx];
        const wx = C.tx.w[mx];
        const ta = C.FF[e0] + (C.FF[e1] - C.FF[e0]) * wx;
        const tb = C.FF[g0] + (C.FF[g1] - C.FF[g0]) * wx;
        const rough = 0.78 + 0.22 * (ta + (tb - ta) * fwy);
        d[q] = a0 * sv * rough;
      }
    }
    if (boxes) {
      const after = new Int32Array(boxes.length);
      for (let i = 0; i < boxes.length; i++) {
        after[i] = this.boxInk(d, bw, bh, boxes[i], a255 * 0.28);
      }
      img.inkBefore = before;
      img.inkAfter = after;
    }
    return img;
  },

  // Pixels in a box whose alpha is at or above `thr`.
  boxInk: function (d, bw, bh, b, thr) {
    let n = 0;
    const x0 = Math.max(0, b.x | 0);
    const x1 = Math.min(bw, Math.ceil(b.x + b.w));
    const y0 = Math.max(0, b.y | 0);
    const y1 = Math.min(bh, Math.ceil(b.y + b.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (d[(y * bw + x) * 4 + 3] >= thr) n++;
      }
    }
    return n;
  },

  // ONE stencilled phone number.
  oneNumberMark: function (ctx, C) {
    const S = C.S;
    const rand = C.rand;
    const pal = C.pal;

    // --- the number, and how it is written on the wall
    const pre = this.MARK_PREFIXES[Math.floor(rand() * this.MARK_PREFIXES.length)];
    let digits = "0" + pre;
    for (let i = 0; i < 7; i++) digits += Math.floor(rand() * 10);
    const sep = rand() < 0.5 ? " " : ".";
    const text =
      digits.slice(0, 4) + sep + digits.slice(4, 7) + sep + digits.slice(7);

    // --- size and place it, in metres
    const dh = (0.09 + rand() * 0.06) * C.pxY; // 9-15 cm digit height
    const fontPx = dh / 0.72;
    const baselineM = 1.1 + rand() * 0.8;
    const by = S * (1 - baselineM / C.heightM);
    const font = "700 " + fontPx.toFixed(1) + "px " + this.MARK_FONT;
    ctx.font = font;
    const wpx = ctx.measureText(text).width;
    // Painted freehand: never level, and always tilted enough to see. The sign
    // is random, the magnitude 40-100% of the tunable, so no mark is straight.
    const tiltDeg = C.tilt * (0.4 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1);
    const theta = (tiltDeg * Math.PI) / 180;

    // (b) — one of the two guarantees, by seed: run it off the edge of the bay
    // so at least three digits are simply not there, or keep it inside and
    // overpaint a run of digits below.
    const runOff = rand() < 0.5;
    let x0;
    if (runOff) {
      // 35-65% of the string visible => at least 3 digits outside
      const keep = 0.35 + rand() * 0.3;
      x0 = rand() < 0.5 ? S - wpx * keep : -wpx * (1 - keep);
    } else {
      x0 = rand() * Math.max(1, S - wpx);
    }

    // --- per-digit boxes, in the mark's own rotated frame
    const pad = Math.ceil(dh * 0.9);
    const bx = Math.floor(Math.min(x0, x0 + wpx) - pad);
    const byTop = Math.floor(by - dh * 1.45);
    const bw = Math.ceil(wpx + pad * 2);
    const bh = Math.ceil(dh * 2.1);
    const sc = this.canvas(bw, bh);
    const sctx = sc.getContext("2d");
    sctx.font = font;
    sctx.textBaseline = "alphabetic";
    sctx.translate(x0 - bx, by - byTop);
    sctx.rotate(theta);

    const stencil = rand() < 0.62 ? pal.stencil.red : pal.stencil.dark;
    // How much pigment went on. Scaled by wallStencilInk, and capped: a mark is
    // paint on a wall, never a decal, so it stays short of fully opaque.
    const alpha = Math.min(
      0.95,
      (stencil === pal.stencil.red ? 0.66 + rand() * 0.22 : 0.58 + rand() * 0.2) *
        C.ink
    );
    // Sprayed through a card, the edge of every glyph carries a little
    // overspray. Drawn as a soft dark halo under the ink, it is also what lets
    // the digits hold their shape against a wall this mottled.
    sctx.fillStyle = stencil;
    sctx.globalAlpha = alpha * 0.4;
    sctx.shadowColor = "rgba(40,20,14,0.85)";
    sctx.shadowBlur = Math.max(2, dh * 0.11);
    sctx.fillText(text, 0, 0);
    sctx.shadowBlur = 0;
    sctx.globalAlpha = alpha;
    sctx.fillText(text, 0, 0);

    // Stencil BRIDGES: the card the letters were cut from has to hold together,
    // so every glyph carries two thin uncut gaps across it.
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = "destination-out";
    const barH = Math.max(1, dh * 0.055);
    [0.36, 0.68].forEach((f) => {
      sctx.fillRect(-dh, -dh * f - barH / 2, wpx + dh * 2, barH);
    });
    sctx.globalCompositeOperation = "source-over";

    // digit boxes -> the scratch canvas's own axis-aligned frame
    const boxes = [];
    let cursor = 0;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const adv = sctx.measureText(ch).width;
      if (ch >= "0" && ch <= "9") {
        // corners of (cursor, -dh) .. (cursor+adv, 0), rotated
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        [[cursor, -dh], [cursor + adv, -dh], [cursor, 0], [cursor + adv, 0]]
          .forEach((pt) => {
            const rx = pt[0] * cos - pt[1] * sin + (x0 - bx);
            const ry = pt[0] * sin + pt[1] * cos + (by - byTop);
            if (rx < minX) minX = rx;
            if (rx > maxX) maxX = rx;
            if (ry < minY) minY = ry;
            if (ry > maxY) maxY = ry;
          });
        boxes.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
      }
      cursor += adv;
    }

    // --- mask it to the wall, and audit the digits
    let img = this.maskToWall(sctx, C, bx, byTop, bw, bh, boxes, alpha * 255);
    let legible = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (img.inkBefore[i] > 0 && img.inkAfter[i] / img.inkBefore[i] >= 0.4) {
        legible++;
      }
    }

    // (b) the overpaint half, and (c) the audit: keep covering runs of digits
    // until at most seven are readable. Each patch is a slab of the coat above
    // — somebody's later whitewash — with a ragged edge, painted on the WALL,
    // so it covers the wall as well as the ad.
    const patches = [];
    const coverRun = () => {
      const runLen = 3 + Math.floor(rand() * 2);
      const start = Math.floor(rand() * Math.max(1, boxes.length - runLen));
      let x0b = Infinity, x1b = -Infinity, y0b = Infinity, y1b = -Infinity;
      for (let i = start; i < Math.min(boxes.length, start + runLen); i++) {
        const b = boxes[i];
        if (b.x < x0b) x0b = b.x;
        if (b.x + b.w > x1b) x1b = b.x + b.w;
        if (b.y < y0b) y0b = b.y;
        if (b.y + b.h > y1b) y1b = b.y + b.h;
        // and erase those digits from the mark itself
        const px0 = Math.max(0, b.x | 0);
        const px1 = Math.min(bw, Math.ceil(b.x + b.w));
        const py0 = Math.max(0, (b.y - dh * 0.15) | 0);
        const py1 = Math.min(bh, Math.ceil(b.y + b.h + dh * 0.15));
        for (let y = py0; y < py1; y++) {
          for (let x = px0; x < px1; x++) img.data[(y * bw + x) * 4 + 3] = 0;
        }
        img.inkAfter[i] = 0;
      }
      patches.push({
        x: bx + x0b - dh * 0.12,
        y: byTop + y0b - dh * 0.2,
        w: x1b - x0b + dh * 0.24,
        h: y1b - y0b + dh * 0.4,
      });
      legible = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (img.inkBefore[i] > 0 && img.inkAfter[i] / img.inkBefore[i] >= 0.4) {
          legible++;
        }
      }
    };
    if (!runOff) coverRun();
    let guard = 0;
    while (legible > 7 && guard++ < 4) coverRun();

    sctx.putImageData(img, 0, 0);
    ctx.drawImage(sc, bx, byTop);

    // the whitewash patches go on last, over the ad and the wall alike
    const top = pal.coats[pal.coats.length - 1];
    patches.forEach((pt) => {
      this.paintPatch(ctx, rand, pt.x, pt.y, pt.w, pt.h, top.color);
    });
    return legible;
  },

  // A slab of later paint: a rectangle with a hand-brushed, ragged edge.
  paintPatch: function (ctx, rand, x, y, w, h, color) {
    ctx.save();
    // Translucent: a brushed-on patch of later paint, not a sticker — the wall
    // underneath still reads through it.
    ctx.globalAlpha = 0.5 + rand() * 0.22;
    ctx.fillStyle = color;
    ctx.beginPath();
    const jx = w * 0.05;
    const jy = h * 0.12;
    const steps = 7;
    ctx.moveTo(x, y);
    for (let i = 1; i <= steps; i++) ctx.lineTo(x + (w * i) / steps, y + (rand() - 0.5) * jy);
    for (let i = 1; i <= steps; i++) ctx.lineTo(x + w + (rand() - 0.5) * jx, y + (h * i) / steps);
    for (let i = steps - 1; i >= 0; i--) ctx.lineTo(x + (w * i) / steps, y + h + (rand() - 0.5) * jy);
    for (let i = steps - 1; i >= 0; i--) ctx.lineTo(x + (rand() - 0.5) * jx, y + (h * i) / steps);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  // ---- WALL --------------------------------------------------------------
  // PAINT STRATIGRAPHY. One canvas covers `bay` metres of wall length by the
  // FULL wall height, so the darkening toward the ceiling is baked at its true
  // height and never tiles vertically. Its length is one
  // lighting bay, so the pool painted down its centre lands under a ceiling
  // tube on every repeat.
  //
  // THE MODEL. These walls are not a colour, they are a stack of coats put on
  // over fifty years and worn back through each other, and that is how they are
  // built here. Five coats, bottom to top — plaster, an old ochre scheme, a
  // deep cerulean, the pale lime-wash, a thin whitish top wash — each with a
  // COVERAGE MASK: its own combination of noise fields, thresholded. A pixel
  // shows the TOPMOST coat whose mask survives its threshold, so where the top
  // wash has gone you see the pale wash, where that has gone the blue, and in
  // the worst places the bare plaster. Because the masks share a common coarse
  // field they mostly nest, like real flaking; because each also has its own
  // finer component they do not nest exactly, which is what stops it reading as
  // onion rings.
  //
  // The threshold is a QUANTILE of the mask, not a raw value, so a coat's
  // `coverage` means what it says: 0.65 keeps roughly 65% of the wall. That is
  // what makes wallFlake and the per-variant biases behave predictably.
  //
  // Four things then make it read as paint rather than as noise:
  //   HARD EDGES  no blending between coats. A second pass walks the coat-index
  //               map and draws a dark line on the LOWER side of every step and
  //               a light line on the upper side, so each coat stands proud.
  //   VERTICAL    every mask is modulated by a 6:1 vertically stretched field,
  //   GRAIN       and a few hundred thin translucent strokes are drawn over the
  //               top: the brushed grain that runs down all four references.
  //   WEAR        thresholds are biased by height, so a little more is gone
  //   GRADIENT    toward the floor, where the wall gets wet and kicked. Gently:
  //               the wall is one continuous surface from ceiling to floor and
  //               must never read as banded.
  //   GRIME       a dark warm glaze that collects where the surface is broken
  //               (masked by 1 − the pale coat's mask), not evenly.
  //
  // Three VARIANTS are handed out along the run — "intact" (calm, the default
  // between doors and always next to a hung image), "flaked" (top washes
  // largely gone, big blue islands, heavy grime) and "stripe" (intact plus a
  // ragged vertical band where an earlier ochre scheme shows through) — so
  // 16 m of corridor never shows the same wall twice in a row.
  //
  // `opts` carries what the canvas cannot know by itself: { bay, height } in
  // metres (so islands can be sized in centimetres and text in millimetres),
  // noiseRes, and the flake / grain / stripe knobs from corridor-root.
  wall: function (size, seed, variant, darken, palette, opts) {
    const pal = this.resolvePalette(palette);
    const o = opts || {};
    const bayM = o.bay > 0 ? o.bay : 3.6;
    const heightM = o.height > 0 ? o.height : 3.0;
    const res = Math.max(1, Math.round(o.noiseRes || 2));
    const flake = o.flake != null ? o.flake : 1;
    const grainAmt = o.grain != null ? o.grain : 1;
    const allowStripe = o.stripe !== false;
    const stencils = o.stencils != null ? o.stencils : 0.6;
    const stencilTilt = o.stencilTilt != null ? o.stencilTilt : 6;
    const stencilInk = o.stencilInk != null ? o.stencilInk : 1;
    // The palette is part of the key, so two rooms with different colours never
    // share a canvas and two with the same colours always do.
    const key =
      "wall|" +
      [size, seed, variant, darken, bayM.toFixed(3), heightM.toFixed(3),
       res, flake, grainAmt, allowStripe ? 1 : 0, stencils,
       stencilTilt, stencilInk, this.paletteKey(pal)].join("|");

    return this.get(key, () => {
      const S = size;
      const c = this.canvas(S, S);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 131 + variant * 17 + 3);
      const V = this.WALL_VARIANTS[((variant % 3) + 3) % 3];
      // Phase stopwatch — six timestamps, reported in debug mode. Which phase
      // dominates decides which knob to turn (wallNoiseRes for the fields,
      // textureSize for the per-pixel work), so it is worth having on hand.
      const T = [];
      const mark = (n) => T.push([n, (window.performance || Date).now()]);
      mark("start");
      const coats = pal.coats;

      // Pixels per metre. The canvas is square but the wall it covers is not,
      // so these differ — everything sized in metres goes through them.
      const pxX = S / bayM;
      const pxY = S / heightM;
      // Field frequencies for a feature `m` metres across, in METRIC space.
      const fqx = (m) => bayM / m;
      const fqy = (m) => heightM / m;

      // ---- the noise fields, at reduced resolution ------------------------
      const fw = Math.max(32, Math.round(S / res));
      const fh = fw;
      const mk = (slot, m, oct, stretch) =>
        this.noiseField(rand, fw, fh, {
          octaves: oct,
          baseFreqX: fqx(m),
          baseFreqY: fqy(m) / (stretch || 1),
          slot: slot,
        });
      const FW = mk("fw", 0.44, 4); // coarse wear: islands ~44 cm down to ~6 cm
      const FF = mk("ff", 0.13, 4); // fine: the bitty flakes of the top washes
      const FG = mk("fg", 0.24, 4); // mid: decorrelates the coats from each other
      const FV = mk("fv", 0.34, 4, 8); // 8:1 vertical stretch — the brushed grain
      const FD = mk("fd", 1.5, 3); // low frequency: where the grime pooled
      [FW, FF, FG, FV, FD].forEach(this.normaliseField);

      mark("fields");
      // ---- coat masks + their quantile thresholds -------------------------
      // Each coat mixes the coarse / mid / fine fields differently: the old
      // deep coats fail in big slabs, the thin top washes in small bits.
      const mixes = [
        null,
        [0.52, 0.30, 0.18], // 1 ochre — the oldest, fails in the largest slabs
        [0.44, 0.26, 0.30], // 2 deep blue
        [0.30, 0.22, 0.48], // 3 pale wash
        [0.18, 0.16, 0.66], // 4 top wash — thin, so it goes in small bits
      ];
      const grainMix = 0.46 * grainAmt * V.grain;
      const masks = [null];
      const thresh = [0];
      for (let i = 1; i < coats.length; i++) {
        const mx = mixes[i];
        const m = this.buf("mask" + i, fw * fh);
        for (let p = 0; p < m.length; p++) {
          const v = FW.data[p] * mx[0] + FG.data[p] * mx[1] + FF.data[p] * mx[2];
          // The vertical grain rides on every mask, so flake edges striate.
          m[p] = v * (1 - grainMix + grainMix * FV.data[p]);
        }
        this.normaliseField({ data: m });
        masks.push(m);
        // coverage -> threshold, as a quantile of THIS mask. wallFlake scales
        // how much of the coat is gone, so 0 restores an unweathered wall.
        let cov = coats[i].coverage + V.coverBias[i];
        cov = 1 - (1 - cov) * flake;
        thresh.push(this.maskThreshold(m, Math.max(0.02, Math.min(0.995, cov))));
      }

      mark("masks");
      // ---- per-column tables: the ochre stripe, the drips ------------------
      // Both must be PERIODIC in x or the bay joins would show: the stripe's
      // ragged edge is jittered with integer harmonics, and the drips are
      // wrapped by hand.
      //
      // There is deliberately NO DADO. An earlier version painted the lower
      // ~0.9 m of the wall as a darker grey-blue band, which is common enough
      // in these buildings — but it put a hard horizontal line across every
      // wall in the corridor, and the glaze flattened all the coat detail
      // underneath it. The wall reads far better as one continuous surface
      // from ceiling to floor, so the band, its brushed edge and the extra
      // wear that went with it are gone.

      // THE OLD COLOUR SCHEME showing as a vertical band: where it runs, coats
      // 2-4 are thresholded much harder, so the ochre underneath is what
      // survives. Its edges are ragged and it fades out top and bottom rather
      // than ending on a line.
      const stripeCol = new Float32Array(S);
      if (V.stripe && allowStripe) {
        const cx = rand() * S;
        const halfW = ((0.06 + rand() * 0.14) * pxX) / 2;
        const soft = Math.max(2, halfW * 0.5);
        const j1 = rand() * Math.PI * 2;
        const j2 = rand() * Math.PI * 2;
        for (let x = 0; x < S; x++) {
          let dx = Math.abs(x - cx);
          dx = Math.min(dx, S - dx); // wrapped distance
          const u = x / S;
          const jit =
            Math.sin(u * Math.PI * 2 * 7 + j1) * 0.2 +
            Math.sin(u * Math.PI * 2 * 3 + j2) * 0.14;
          const hw = halfW * (1 + jit);
          stripeCol[x] = dx < hw ? 1 : Math.max(0, 1 - (dx - hw) / soft);
        }
      }

      // DRIPS: narrow vertical runs, masked by the noise so they break up
      // instead of ending on a hard rectangle edge.
      const dripAmt = new Float32Array(S);
      const dripTop = new Float32Array(S);
      const dripLen = new Float32Array(S);
      const nDrips = Math.round((3 + Math.floor(rand() * 4)) * Math.min(1.5, flake));
      for (let i = 0; i < nDrips; i++) {
        const cx = rand() * S;
        const w = (0.01 + rand() * 0.035) * pxX; // 1-4.5 cm wide
        const top = rand() < 0.7 ? 0 : rand() * S * 0.2;
        const len = S * (0.15 + rand() * 0.55);
        const a = 0.35 + rand() * 0.5;
        for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
          const x = ((Math.round(cx) + k) % S + S) % S; // wraps
          const f = Math.max(0, 1 - Math.abs(k) / w);
          if (f * a > dripAmt[x]) {
            dripAmt[x] = f * a;
            dripTop[x] = top;
            dripLen[x] = len;
          }
        }
      }

      // ---- the composite: one pass, per pixel -----------------------------
      const img = ctx.createImageData(S, S);
      const px = img.data;
      const coatIdx = new Uint8Array(S * S);
      const tx = this.bilinTable(fw, S, true); // x wraps: the seam closes
      const ty = this.bilinTable(fh, S, false);

      const m1 = masks[1], m2 = masks[2], m3 = masks[3], m4 = masks[4];
      const t1 = thresh[1], t2 = thresh[2], t3 = thresh[3], t4 = thresh[4];
      const R = coats.map((k) => this.hexRGB(k.color));
      const R2 = coats.map((k) => this.hexRGB(k.color2 || k.color));
      const OP = coats.map((k) => (k.opacity != null ? k.opacity : 1));
      const grimeRGB = this.hexRGB(pal.grime.color);
      const dripRGB = this.hexRGB(pal.drip.color);
      // A slight tendency to more wear low down — the wall does get wet and
      // kicked — but gentle enough that it never reads as a band.
      const wearLow = 0.04;
      const stripeBias = 0.34;

      // ROW BUFFERS. Every field is sampled bilinearly, but the vertical half of
      // that interpolation is the SAME for every pixel in a row — so do it once
      // per row into a scratch row of the field's own width, and the inner loop
      // is left with two reads and one lerp per field instead of four and
      // three. On a 1024² canvas that is the difference between ~145 ms and
      // ~105 ms per wall.
      const SRC = [m1, m2, m3, m4, FV.data, FD.data, FF.data];
      const ROW = [];
      for (let i = 0; i < SRC.length; i++) ROW.push(this.buf("row" + i, fw));

      for (let y = 0; y < S; y++) {
        const ry0 = ty.i0[y] * fw;
        const ry1 = ty.i1[y] * fw;
        const wy = ty.w[y];
        for (let f = 0; f < SRC.length; f++) {
          const src = SRC[f];
          const dst = ROW[f];
          for (let i = 0; i < fw; i++) {
            const a = src[ry0 + i];
            dst[i] = a + (src[ry1 + i] - a) * wy;
          }
        }
        const R1 = ROW[0], R2f = ROW[1], R3 = ROW[2], R4 = ROW[3];
        const RV = ROW[4], RD = ROW[5], RF = ROW[6];
        const vy = y / S;
        // Slightly more of every coat is gone toward the floor.
        const bias = wearLow * vy * vy * (0.4 + 0.6 * vy);
        // The stripe fades in below the ceiling and out above the floor.
        const stripeY =
          Math.min(1, vy / 0.16) * Math.min(1, (1 - vy) / 0.22);
        const row = y * S;

        for (let x = 0; x < S; x++) {
          const i0 = tx.i0[x];
          const i1 = tx.i1[x];
          const wx = tx.w[x];

          // The four coat masks, the grain, the slow field and the fine one —
          // now one lerp each along the pre-interpolated row.
          let a = R1[i0];
          const v1 = a + (R1[i1] - a) * wx;
          a = R2f[i0];
          const v2 = a + (R2f[i1] - a) * wx;
          a = R3[i0];
          const v3 = a + (R3[i1] - a) * wx;
          a = R4[i0];
          const v4 = a + (R4[i1] - a) * wx;
          a = RV[i0];
          const vv = a + (RV[i1] - a) * wx;
          a = RD[i0];
          const vd = a + (RD[i1] - a) * wx;
          a = RF[i0];
          const vf = a + (RF[i1] - a) * wx;

          // Thresholds for THIS pixel: the coat's own, plus the height bias,
          // plus the stripe (which only eats the coats above the ochre).
          const sb = stripeCol[x] * stripeY * stripeBias;
          const h1 = t1 + bias * 0.5;
          const h2 = t2 + bias + sb;
          const h3 = t3 + bias + sb;
          const h4 = t4 + bias + sb;

          // Resolve the stack BOTTOM-UP, starting from bare plaster. Each coat
          // that survives here is laid over what is already there — the old
          // thick ones opaquely, the two washes translucently and thinner still
          // near the edge of their island, where `local` is small. That is what
          // gives white-over-blue instead of white-beside-blue.
          let r = R[0][0] + (R2[0][0] - R[0][0]) * vd;
          let g = R[0][1] + (R2[0][1] - R[0][1]) * vd;
          let b = R[0][2] + (R2[0][2] - R[0][2]) * vd;
          let idx = 0;
          if (v1 > h1) {
            idx = 1;
            const a = OP[1];
            r += (R[1][0] + (R2[1][0] - R[1][0]) * vd - r) * a;
            g += (R[1][1] + (R2[1][1] - R[1][1]) * vd - g) * a;
            b += (R[1][2] + (R2[1][2] - R[1][2]) * vd - b) * a;
          }
          if (v2 > h2) {
            idx = 2;
            const lo = (v2 - h2) * 7;
            const a = OP[2] * (0.6 + 0.4 * (lo > 1 ? 1 : lo));
            r += (R[2][0] + (R2[2][0] - R[2][0]) * vd - r) * a;
            g += (R[2][1] + (R2[2][1] - R[2][1]) * vd - g) * a;
            b += (R[2][2] + (R2[2][2] - R[2][2]) * vd - b) * a;
          }
          if (v3 > h3) {
            idx = 3;
            const lo = (v3 - h3) * 7;
            const a = OP[3] * (0.5 + 0.5 * (lo > 1 ? 1 : lo));
            r += (R[3][0] + (R2[3][0] - R[3][0]) * vd - r) * a;
            g += (R[3][1] + (R2[3][1] - R[3][1]) * vd - g) * a;
            b += (R[3][2] + (R2[3][2] - R[3][2]) * vd - b) * a;
          }
          if (v4 > h4) {
            idx = 4;
            const lo = (v4 - h4) * 7;
            const a = OP[4] * (0.45 + 0.55 * (lo > 1 ? 1 : lo));
            r += (R[4][0] + (R2[4][0] - R[4][0]) * vd - r) * a;
            g += (R[4][1] + (R2[4][1] - R[4][1]) * vd - g) * a;
            b += (R[4][2] + (R2[4][2] - R[4][2]) * vd - b) * a;
          }
          coatIdx[row + x] = idx;

          // Brush grain: a gentle multiply, stronger on the flaked variants.
          const sh = 1 + (vv - 0.5) * 0.26 * grainAmt * V.grain;
          r *= sh; g *= sh; b *= sh;

          // FINE BREAK-UP. Every coat gets a couple-of-centimetres speckle in
          // its own body, so no island is ever a flat field — without this the
          // wall reads as a contour map however good the shapes are.
          const spk = 0.90 + vf * 0.20;
          r *= spk; g *= spk; b *= spk;

          // GRIME collects where the surface is BROKEN — i.e. where a coat
          // below the pale wash is what you are looking at — and only where the
          // slow field says it pooled. Keyed to the exposed coat rather than to
          // a raw mask, so clean wall stays clean.
          if (idx < 3) {
            const depth = idx === 0 ? 1 : idx === 1 ? 0.72 : 0.5;
            const gr = 0.2 * depth * V.grime * (0.25 + 0.75 * vd);
            r += (grimeRGB[0] - r) * gr;
            g += (grimeRGB[1] - g) * gr;
            b += (grimeRGB[2] - b) * gr;
          }

          // DRIPS down the face, broken up by the grain field.
          const dA = dripAmt[x];
          if (dA > 0 && y > dripTop[x]) {
            const t = (y - dripTop[x]) / dripLen[x];
            if (t < 1) {
              const k = dA * (1 - t) * (0.35 + 0.65 * vv);
              r += (dripRGB[0] - r) * k * 0.5;
              g += (dripRGB[1] - g) * k * 0.5;
              b += (dripRGB[2] - b) * k * 0.5;
            }
          }

          const q = (row + x) * 4;
          px[q] = r < 0 ? 0 : r > 255 ? 255 : r;
          px[q + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          px[q + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
          px[q + 3] = 255;
        }
      }

      mark("composite");
      // ---- edge pass: make every coat stand proud -------------------------
      // Reads the coat-index map, not the masks: wherever a pixel's neighbour
      // belongs to a HIGHER coat, this pixel is at the foot of a step and gets
      // a shadow; wherever a neighbour is LOWER, this pixel is the top of the
      // step and catches the light. Two pixels of shadow, one of highlight —
      // that asymmetry is what reads as thickness. x wraps, so the seam is
      // seamless here too.
      const etx = tx;
      const ety = ty;
      for (let y = 0; y < S; y++) {
        const row = y * S;
        const up = y > 0 ? row - S : row;
        const dn = y < S - 1 ? row + S : row;
        const ey0 = ety.i0[y] * fw;
        const ey1 = ety.i1[y] * fw;
        const ewy = ety.w[y];
        for (let x = 0; x < S; x++) {
          const idx = coatIdx[row + x];
          const xl = x === 0 ? S - 1 : x - 1;
          const xr = x === S - 1 ? 0 : x + 1;
          const n1 = coatIdx[row + xl];
          const n2 = coatIdx[row + xr];
          const n3 = coatIdx[up + x];
          const n4 = coatIdx[dn + x];
          let hi = n1 > n2 ? n1 : n2;
          if (n3 > hi) hi = n3;
          if (n4 > hi) hi = n4;
          let lo = n1 < n2 ? n1 : n2;
          if (n3 < lo) lo = n3;
          if (n4 < lo) lo = n4;

          let k = 0;
          if (hi > idx) k = -0.11; // in the hole, at the foot of the step
          else {
            // second ring: the rest of the shadow's width
            const xl2 = xl === 0 ? S - 1 : xl - 1;
            const xr2 = xr === S - 1 ? 0 : xr + 1;
            if (
              coatIdx[row + xl2] > idx || coatIdx[row + xr2] > idx ||
              coatIdx[(y > 1 ? row - S - S : row) + x] > idx ||
              coatIdx[(y < S - 2 ? row + S + S : row) + x] > idx
            ) {
              k = -0.05;
            }
          }
          if (lo < idx) k += 0.085; // the lit lip of the coat above

          if (k !== 0) {
            // A real paint edge is not a drawn outline: it is thick here, worn
            // away there. Modulating by the fine field breaks the line up so it
            // reads as relief rather than as ink.
            const e0 = ey0 + etx.i0[x], e1 = ey0 + etx.i1[x];
            const f0 = ey1 + etx.i0[x], f1 = ey1 + etx.i1[x];
            const ewx = etx.w[x];
            const eta = FF.data[e0] + (FF.data[e1] - FF.data[e0]) * ewx;
            const etb = FF.data[f0] + (FF.data[f1] - FF.data[f0]) * ewx;
            k *= 0.35 + 1.15 * (eta + (etb - eta) * ewy);
            const q = (row + x) * 4;
            const f = 1 + k;
            px[q] = Math.min(255, Math.max(0, px[q] * f));
            px[q + 1] = Math.min(255, Math.max(0, px[q + 1] * f));
            px[q + 2] = Math.min(255, Math.max(0, px[q + 2] * f));
          }
        }
      }
      mark("edges");
      ctx.putImageData(img, 0, 0);

      // ---- 2D passes over the composite -----------------------------------

      // PAINTED MARKS first, because they belong UNDER everything that came
      // after them on a real wall — the brush grain, the blooms, the grime and
      // the light. They are masked by the coat map so the wall destroys them.
      this.wallMarks(ctx, {
        S: S,
        rand: rand,
        pal: pal,
        coatIdx: coatIdx,
        FF: FF.data,
        tx: tx,
        ty: ty,
        fw: fw,
        pxX: pxX,
        pxY: pxY,
        heightM: heightM,
        variant: V,
        density: stencils,
        tilt: stencilTilt,
        ink: stencilInk,
        debug: !!o.debug,
      });

      mark("marks");
      // BRUSHED VERTICALS: thin translucent strokes, the visible half of the
      // grain whose other half is already inside every mask.
      const streakL = this.hexRGB(pal.streak.light);
      const streakD = this.hexRGB(pal.streak.dark);
      const nStreak = Math.round((200 + rand() * 200) * grainAmt);
      for (let i = 0; i < nStreak; i++) {
        const y0 = rand() * S * 0.92;
        const len = S * (0.05 + rand() * 0.5);
        const light = rand() > 0.5;
        const a = (0.02 + rand() * 0.055) * grainAmt * V.grain;
        const lw = 0.5 + rand();
        const lean = (rand() - 0.5) * 2;
        ctx.strokeStyle =
          "rgba(" + (light ? streakL : streakD).join(",") + "," + a.toFixed(3) + ")";
        ctx.lineWidth = lw;
        this.wrapX(S, rand() * S, (xx) => {
          ctx.beginPath();
          ctx.moveTo(xx, y0);
          ctx.lineTo(xx + lean, y0 + len);
          ctx.stroke();
        });
      }

      // LICHEN: small pale spots with a dark centre, the crusty blooms that
      // come out on damp lime — mostly on the upper half.
      const lichenC = this.hexRGB(pal.lichen.color);
      const lichenK = this.hexRGB(pal.lichen.core || "#3a362c");
      const nLichen = Math.round((15 + Math.floor(rand() * 26)) * Math.min(1.5, flake));
      for (let i = 0; i < nLichen; i++) {
        const y = rand() < 0.72 ? rand() * S * 0.55 : rand() * S;
        const r1 = 2 + rand() * 5;
        const a1 = 0.3 + rand() * 0.45;
        const a2 = 0.25 + rand() * 0.35;
        this.wrapX(S, rand() * S, (xx) => {
          ctx.fillStyle = "rgba(" + lichenC.join(",") + "," + a1.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(xx, y, r1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(" + lichenK.join(",") + "," + a2.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(xx, y, r1 * 0.34, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Nail holes: a dark dot in a pale halo of broken plaster.
      for (let i = 0; i < 12; i++) {
        const y = S * (0.15 + rand() * 0.4);
        const r1 = 3 + rand() * 4;
        const r2 = 1.2 + rand() * 1.4;
        this.wrapX(S, rand() * S, (x) => {
          ctx.fillStyle = "rgba(226,226,214,0.5)";
          ctx.beginPath();
          ctx.arc(x, y, r1, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(28,30,30,0.65)";
          ctx.beginPath();
          ctx.arc(x, y, r2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // A couple of pencil-dark scrawls per bay — somebody's hand at arm's
      // length, never a readable word.
      const nScrawl = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < nScrawl; i++) {
        const y = S * (0.24 + rand() * 0.4);
        const stroke = "rgba(60,72,66," + (0.08 + rand() * 0.14).toFixed(3) + ")";
        const lw = 0.8 + rand() * 1.4;
        const seg = [];
        for (let k = 0; k < 3; k++) {
          seg.push((rand() - 0.5) * S * 0.03, (rand() - 0.5) * S * 0.022,
                   (rand() - 0.5) * S * 0.03, (rand() - 0.5) * S * 0.022);
        }
        this.wrapX(S, rand() * S, (x) => {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = lw;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          let cxp = x;
          let cyp = y;
          for (let k = 0; k < 3; k++) {
            ctx.quadraticCurveTo(cxp + seg[k * 4], cyp + seg[k * 4 + 1],
                                 cxp + seg[k * 4 + 2], cyp + seg[k * 4 + 3]);
            cxp += seg[k * 4 + 2];
            cyp += seg[k * 4 + 3];
          }
          ctx.stroke();
        });
      }

      // A little grime in the floor junction. Kept narrow and light: enough to
      // sit the wall on the floor rather than have it float, not enough to read
      // as a dark band along the bottom.
      const skirt = ctx.createLinearGradient(0, S - S * 0.035, 0, S);
      skirt.addColorStop(0, "rgba(26,36,40,0)");
      skirt.addColorStop(1, "rgba(26,36,40,0.28)");
      ctx.fillStyle = skirt;
      ctx.fillRect(0, S - S * 0.035, S, S * 0.035);

      this.grain(ctx, rand, S, S, Math.round(S * 5), 0.3);

      // ---- baked light, drawn LAST so it sits over every layer ----
      // A broad soft pool down the middle of the bay: the wall under the tube.
      const pool = ctx.createRadialGradient(S / 2, S * 0.3, 0, S / 2, S * 0.3, S * 0.62);
      pool.addColorStop(0, "rgba(255,252,238,0.22)");
      pool.addColorStop(0.5, "rgba(255,252,238,0.09)");
      pool.addColorStop(1, "rgba(255,252,238,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, S, S);
      // ...and a general darkening toward the ceiling (the tubes throw down, so
      // the top of the wall and the wall/ceiling junction sit in shadow).
      const top = ctx.createLinearGradient(0, 0, 0, S * 0.55);
      top.addColorStop(0, "rgba(6,12,16,0.5)");
      top.addColorStop(1, "rgba(6,12,16,0)");
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, S, S * 0.55);
      // A little extra darkness in the corners of the bay, between the pools.
      const sides = ctx.createLinearGradient(0, 0, S, 0);
      sides.addColorStop(0, "rgba(6,14,18,0.34)");
      sides.addColorStop(0.5, "rgba(6,14,18,0)");
      sides.addColorStop(1, "rgba(6,14,18,0.34)");
      ctx.fillStyle = sides;
      ctx.fillRect(0, 0, S, S);

      if (darken > 0) {
        ctx.fillStyle = "rgba(0,0,0," + darken + ")";
        ctx.fillRect(0, 0, S, S);
      }
      mark("passes");
      if (o.debug) {
        const parts = [];
        for (let i = 1; i < T.length; i++) {
          parts.push(T[i][0] + " " + (T[i][1] - T[i - 1][1]).toFixed(0));
        }
        console.log("[corridor] wall '" + V.name + "' ms: " + parts.join(", "));
      }
      return c;
    });
  },

  // Stretch a field to fill [0,1]. fbm lands well inside that range, and the
  // coat thresholds are quantiles of the result, so normalising first is what
  // makes `coverage` mean the same thing for every field.
  normaliseField: function (f) {
    const d = f.data;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const s = 1 / (mx - mn || 1);
    for (let i = 0; i < d.length; i++) d[i] = (d[i] - mn) * s;
    return f;
  },

  // The threshold above which `keep` of the mask's area survives — a 256-bin
  // histogram over every third sample, which is plenty for a number that only
  // has to be right to a percent or so. This is what lets a coat's `coverage`
  // be read as "how much of this coat is left" instead of an opaque constant.
  maskThreshold: function (mask, keep) {
    const bins = 256;
    const hist = new Int32Array(bins);
    let total = 0;
    for (let i = 0; i < mask.length; i += 3) {
      let b = (mask[i] * 255) | 0;
      if (b < 0) b = 0;
      else if (b > 255) b = 255;
      hist[b]++;
      total++;
    }
    let want = total * (1 - keep);
    let acc = 0;
    for (let i = 0; i < bins; i++) {
      acc += hist[i];
      if (acc >= want) return i / 255;
    }
    return 1;
  },

  // ---- FLOOR (corridor + landing) ---------------------------------------
  // The canvas covers the FULL corridor width by an equal depth, so everything
  // that varies ACROSS the corridor — the worn shiny band down the middle, the
  // dark margins along both walls — is baked in and only the length tiles.
  // `cols` 0.2 m tiles across, the same size along the run.
  floor: function (size, seed, cols) {
    const key = "floor|" + size + "|" + seed + "|" + cols;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 977 + 11);
      const S = size;
      const cell = S / cols;

      ctx.fillStyle = "#54301f";
      ctx.fillRect(0, 0, S, S);

      // Dark red-brown cement tiles, each one its own slightly different mix.
      for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz < cols; iz++) {
          const t = rand();
          const r = 74 + t * 33; // #4a2a1f .. #6b3d2c
          const g = 42 + t * 19;
          const b = 31 + t * 13;
          ctx.fillStyle = "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
          ctx.fillRect(ix * cell, iz * cell, cell - 1, cell - 1);
          // A couple of scuffs per tile.
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = "rgba(20,10,6," + (0.04 + rand() * 0.13).toFixed(3) + ")";
            this.blob(ctx, rand, (ix + rand()) * cell, (iz + rand()) * cell,
                      cell * 0.2, cell * 0.16, 7);
          }
        }
      }
      // Grout: slightly lighter, and never perfectly straight.
      ctx.strokeStyle = "rgba(133,94,72,0.55)";
      ctx.lineWidth = Math.max(1, S / 512);
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, S);
        ctx.moveTo(0, i * cell);
        ctx.lineTo(S, i * cell);
        ctx.stroke();
      }

      this.grain(ctx, rand, S, S, Math.round(S * 6), 0.35);

      // ---- baked wear + light (canvas x = ACROSS the corridor) ----
      // Everyone walks down the middle: that band is polished lighter, the
      // margins by the walls keep their dirt and sit in the walls' shadow.
      const band = ctx.createLinearGradient(0, 0, S, 0);
      band.addColorStop(0, "rgba(255,238,214,0)");
      band.addColorStop(0.5, "rgba(255,238,214,0.17)");
      band.addColorStop(1, "rgba(255,238,214,0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, S, S);
      const edge = ctx.createLinearGradient(0, 0, S, 0);
      edge.addColorStop(0, "rgba(10,5,3,0.45)");
      edge.addColorStop(0.18, "rgba(10,5,3,0.06)");
      edge.addColorStop(0.82, "rgba(10,5,3,0.06)");
      edge.addColorStop(1, "rgba(10,5,3,0.45)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, S, S);
      return c;
    });
  },

  // ---- CEILING -----------------------------------------------------------
  // One canvas per lighting bay: yellowed off-white with grey water stains, and
  // the bright pool the tube throws, centred so it lands on the tube in every
  // repeat (the bay length is snapped for exactly this — see layout()).
  ceiling: function (size, seed) {
    const key = "ceil|" + size + "|" + seed;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 613 + 29);
      const S = size;

      ctx.fillStyle = "#d9d2b8";
      ctx.fillRect(0, 0, S, S);
      // Yellowing, unevenly - soft washes, never hard shapes.
      for (let i = 0; i < 120; i++) {
        this.softBlob(ctx, rand, rand() * S, rand() * S,
                      S * (0.02 + rand() * 0.13), S * (0.02 + rand() * 0.13),
                      rand() > 0.4 ? "198,184,140" : "216,208,180",
                      0.05 + rand() * 0.2);
      }
      // Water stains: a soft brown tide with a greyer core - damp spreading
      // through a slab, with a faint edge where it dried and stopped.
      for (let i = 0; i < 11; i++) {
        const x = rand() * S;
        const y = rand() * S;
        const r = S * (0.04 + rand() * 0.13);
        this.softBlob(ctx, rand, x, y, r, r * (0.6 + rand() * 0.6), "146,124,90", 0.3);
        this.softBlob(ctx, rand, x, y, r * 0.55, r * 0.45, "120,112,96", 0.28);
        ctx.fillStyle = "rgba(122,104,74,0.16)";
        this.blob(ctx, rand, x, y, r * 0.8, r * 0.6, 15);
      }
      // Hairline cracks.
      ctx.strokeStyle = "rgba(120,112,96,0.4)";
      ctx.lineWidth = Math.max(1, S / 900);
      for (let i = 0; i < 7; i++) {
        let x = rand() * S;
        let y = rand() * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (rand() - 0.5) * S * 0.12;
          y += (rand() - 0.5) * S * 0.12;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      this.grain(ctx, rand, S, S, Math.round(S * 4), 0.22);

      // The tube's pool: a bright band across the corridor (canvas x spans the
      // width) fading along the run, plus a hot core right at the fitting.
      const pool = ctx.createLinearGradient(0, 0, 0, S);
      pool.addColorStop(0, "rgba(255,250,226,0)");
      pool.addColorStop(0.5, "rgba(255,250,226,0.5)");
      pool.addColorStop(1, "rgba(255,250,226,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, S, S);
      const core = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.42);
      core.addColorStop(0, "rgba(255,252,238,0.42)");
      core.addColorStop(1, "rgba(255,252,238,0)");
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, S, S);
      // Between bays the ceiling falls away into shadow.
      const dark = ctx.createLinearGradient(0, 0, 0, S);
      dark.addColorStop(0, "rgba(18,20,18,0.26)");
      dark.addColorStop(0.5, "rgba(18,20,18,0)");
      dark.addColorStop(1, "rgba(18,20,18,0.26)");
      ctx.fillStyle = dark;
      ctx.fillRect(0, 0, S, S);
      return c;
    });
  },

  // ---- DOOR ATLAS --------------------------------------------------------
  // FOUR two-leaf doors on one canvas, 2×2, so every door in the corridor
  // shares a single texture upload and picks its look through UVs (see
  // setPlaneUVs). Three are the cream/yellow of the reference corridors, one is
  // the faded green that turns up every few doors; each carries its own seeded
  // three-digit number on a small dark plate.
  doorAtlas: function (size, seed) {
    const key = "door|" + size + "|" + seed;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const S = size;
      const cell = S / 2;
      const palettes = [
        { face: "#d8c78a", wear: "#b09a5a", edge: "#8e7a41" },
        { face: "#cfbc7e", wear: "#a89152", edge: "#87733c" },
        { face: "#6f8f7a", wear: "#547059", edge: "#425c47" }, // faded green
        { face: "#d3c184", wear: "#ab9455", edge: "#8a763e" },
      ];
      for (let i = 0; i < 4; i++) {
        const rand = this.rand(seed * 401 + i * 97 + 5);
        const ox = (i % 2) * cell;
        const oy = Math.floor(i / 2) * cell;
        const p = palettes[i];
        ctx.save();
        ctx.translate(ox, oy);
        ctx.beginPath();
        ctx.rect(0, 0, cell, cell);
        ctx.clip();

        ctx.fillStyle = p.face;
        ctx.fillRect(0, 0, cell, cell);

        // Brushed paint: soft vertical streaking down each leaf.
        for (let k = 0; k < 90; k++) {
          ctx.fillStyle = "rgba(255,255,255," + (rand() * 0.06).toFixed(3) + ")";
          ctx.fillRect(rand() * cell, 0, 1 + rand() * 3, cell);
        }

        // TWO LEAVES with a dark gap between them, each with two sunk panels.
        const gap = cell * 0.012;
        ctx.fillStyle = "rgba(38,30,20,0.85)";
        ctx.fillRect(cell / 2 - gap / 2, 0, gap, cell);
        for (let leaf = 0; leaf < 2; leaf++) {
          const lx = leaf * cell / 2;
          const lw = cell / 2;
          for (let pan = 0; pan < 2; pan++) {
            const px = lx + lw * 0.14;
            const pw = lw * 0.72;
            const py = cell * (pan === 0 ? 0.1 : 0.56);
            const ph = cell * 0.32;
            ctx.strokeStyle = "rgba(40,32,20,0.55)"; // sunk shadow line
            ctx.lineWidth = Math.max(2, S / 300);
            ctx.strokeRect(px, py, pw, ph);
            ctx.strokeStyle = "rgba(255,252,232,0.3)"; // lit edge opposite it
            ctx.strokeRect(px + 2, py + 2, pw, ph);
            ctx.fillStyle = "rgba(0,0,0,0.05)";
            ctx.fillRect(px, py, pw, ph);
          }
        }

        // Wear: the paint goes at the edges and, worst of all, at the bottom
        // where the door is kicked, mopped and rained on.
        const bottom = ctx.createLinearGradient(0, cell * 0.78, 0, cell);
        bottom.addColorStop(0, "rgba(0,0,0,0)");
        bottom.addColorStop(1, "rgba(48,36,22,0.5)");
        ctx.fillStyle = bottom;
        ctx.fillRect(0, cell * 0.78, cell, cell * 0.22);
        for (let k = 0; k < 26; k++) {
          ctx.fillStyle = p.wear;
          ctx.globalAlpha = 0.25 + rand() * 0.5;
          const y = rand() < 0.5 ? cell * (0.8 + rand() * 0.2) : rand() * cell;
          const x = rand() < 0.6 ? (rand() < 0.5 ? rand() * cell * 0.1 : cell * (0.9 + rand() * 0.1)) : rand() * cell;
          this.blob(ctx, rand, x, y, cell * (0.01 + rand() * 0.05),
                    cell * (0.01 + rand() * 0.04), 9);
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = Math.max(2, S / 260);
        ctx.strokeRect(1, 1, cell - 2, cell - 2);

        // NUMBER PLATE — a small dark plate high on the left leaf, with a
        // seeded three-digit flat number (Helvetica stack, like the terminals).
        const num = String(100 + Math.floor(rand() * 899));
        const pw2 = cell * 0.2;
        const ph2 = cell * 0.085;
        const px2 = cell * 0.14;
        const py2 = cell * 0.035;
        ctx.fillStyle = "rgba(26,28,30,0.9)";
        ctx.fillRect(px2, py2, pw2, ph2);
        ctx.strokeStyle = "rgba(210,206,190,0.5)";
        ctx.lineWidth = Math.max(1, S / 700);
        ctx.strokeRect(px2, py2, pw2, ph2);
        ctx.fillStyle = "#e6e4da";
        ctx.font = "600 " + Math.round(ph2 * 0.72) + "px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(num, px2 + pw2 / 2, py2 + ph2 / 2);

        // Baked light: doors are lit from above by the corridor tubes.
        const lit = ctx.createLinearGradient(0, 0, 0, cell);
        lit.addColorStop(0, "rgba(255,250,230,0.16)");
        lit.addColorStop(0.45, "rgba(255,250,230,0)");
        lit.addColorStop(1, "rgba(10,8,6,0.22)");
        ctx.fillStyle = lit;
        ctx.fillRect(0, 0, cell, cell);
        ctx.restore();
      }
      return c;
    });
  },

  // ---- TRANSOM -----------------------------------------------------------
  // The louvred fanlight over every door: dark timber slats, tiled along the
  // door's width. A small strip, not a full textureSize canvas — it is one
  // repeating pattern with no large-scale structure to hold.
  transom: function (size, seed, slats) {
    const key = "transom|" + size + "|" + seed + "|" + slats;
    return this.get(key, () => {
      const w = size;
      const h = Math.max(64, Math.round(size / 4));
      const c = this.canvas(w, h);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 271 + 13);

      ctx.fillStyle = "#2a2419";
      ctx.fillRect(0, 0, w, h);
      const pitch = h / slats;
      for (let i = 0; i < slats; i++) {
        const y = i * pitch;
        // Each slat: a lit top bevel over a dark underside, so the louvre reads
        // as tilted timber rather than stripes.
        const g = ctx.createLinearGradient(0, y, 0, y + pitch);
        g.addColorStop(0, "#6d5c40");
        g.addColorStop(0.35, "#4b3f2b");
        g.addColorStop(0.75, "#221c13");
        g.addColorStop(1, "#3a3122");
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, pitch * 0.92);
        ctx.fillStyle = "rgba(0,0,0,0.55)"; // the gap you can see through
        ctx.fillRect(0, y + pitch * 0.92, w, pitch * 0.08);
      }
      // Grime and a few missing/broken slats.
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = "rgba(0,0,0," + (rand() * 0.25).toFixed(3) + ")";
        ctx.fillRect(rand() * w, rand() * h, rand() * w * 0.1, pitch * 0.9);
      }
      return c;
    });
  },

  // ---- GRILLE IRON -------------------------------------------------------
  // The bars of the window grille: black paint going to rust, drawn once and
  // tiled ALONG every bar's length. u runs along the bar, v across its square
  // section, which is what lets a flat-shaded bar read as solid: a light line
  // at one v edge and a dark one at the other is the whole of the "lighting".
  //
  // Bars take their u from their WORLD position (see buildGrille), so every bar
  // samples a different phase of the tile and no two are rusted alike, without
  // a texture or a draw call each.
  grilleIron: function (size, seed, rust, base) {
    const key = "grille|" + size + "|" + seed + "|" + rust + "|" + base;
    return this.get(key, () => {
      const w = size;
      const h = Math.max(16, Math.round(size / 6));
      const c = this.canvas(w, h);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 349 + 17);

      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Brush marks and unevenness in the paint, along the bar.
      for (let i = 0; i < 90; i++) {
        const a = 0.04 + rand() * 0.12;
        ctx.fillStyle =
          rand() > 0.5 ? "rgba(255,255,255," + a.toFixed(3) + ")"
                       : "rgba(0,0,0," + a.toFixed(3) + ")";
        ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 40, 1 + rand() * 3);
      }

      // RUST breaking through: elongated along the bar, heavier toward the
      // bottom edge of the section where water sits.
      const n = Math.round(70 * rust);
      for (let i = 0; i < n; i++) {
        const y = rand() < 0.62 ? h * (0.55 + rand() * 0.45) : rand() * h;
        const rw = 3 + rand() * 26;
        const rh = 1 + rand() * (h * 0.35);
        const a = (0.25 + rand() * 0.5) * rust;
        const g = ctx.createLinearGradient(0, y - rh, 0, y + rh);
        g.addColorStop(0, "rgba(122,74,42,0)");
        g.addColorStop(0.5, "rgba(122,74,42," + a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(122,74,42,0)");
        ctx.fillStyle = g;
        ctx.fillRect(rand() * w, y - rh, rw, rh * 2);
      }
      for (let i = 0; i < Math.round(26 * rust); i++) {
        ctx.fillStyle =
          "rgba(138,90,48," + (0.3 + rand() * 0.5).toFixed(3) + ")";
        this.blob(ctx, rand, rand() * w, rand() * h, 2 + rand() * 7,
                  1 + rand() * (h * 0.3), 9);
      }

      // The two section edges: a lit one at v = 1 and a dark one at v = 0. On
      // the face you actually look at, that is the difference between a stripe
      // and a bar.
      ctx.fillStyle = "rgba(196,198,203,0.5)";
      ctx.fillRect(0, 0, w, Math.max(1, h * 0.09));
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, h - Math.max(1, h * 0.13), w, Math.max(1, h * 0.13));
      return c;
    });
  },

  // ---- ROOM FLOOR (gạch bông) -------------------------------------------
  // The patterned encaustic tiles inside the apartments: a 4×4 block of 0.2 m
  // tiles that tiles onward, in the muted green / ochre / cream / rust of the
  // reference floors, with several motifs mixed so the block does not read as
  // one stamp. Deliberately louder than the corridor — stepping off the dark
  // cement into a patterned room is the whole arrival.
  roomFloor: function (size, seed, cols) {
    const key = "gachbong|" + size + "|" + seed + "|" + cols;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 733 + 41);
      const S = size;
      const cell = S / cols;
      const grounds = ["#d9cfae", "#cdc39f", "#d3c7a4"];
      const inks = ["#6d8265", "#a8763c", "#8d4a33", "#4f6a5c", "#b09242"];

      for (let ix = 0; ix < cols; ix++) {
        for (let iz = 0; iz < cols; iz++) {
          const x = ix * cell;
          const y = iz * cell;
          const ink = inks[Math.floor(rand() * inks.length)];
          const ink2 = inks[Math.floor(rand() * inks.length)];
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, cell, cell);
          ctx.clip();
          ctx.fillStyle = grounds[Math.floor(rand() * grounds.length)];
          ctx.fillRect(x, y, cell, cell);

          const motif = Math.floor(rand() * 4);
          const cx = x + cell / 2;
          const cy = y + cell / 2;
          if (motif === 0) {
            // Quarter-circles in the corners — the classic four-petal join.
            ctx.fillStyle = ink;
            [[x, y], [x + cell, y], [x, y + cell], [x + cell, y + cell]].forEach(function (p) {
              ctx.beginPath();
              ctx.moveTo(p[0], p[1]);
              ctx.arc(p[0], p[1], cell * 0.42, 0, Math.PI * 2);
              ctx.fill();
            });
            ctx.fillStyle = ink2;
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.16, 0, Math.PI * 2);
            ctx.fill();
          } else if (motif === 1) {
            // A rosette.
            ctx.fillStyle = ink;
            for (let p = 0; p < 8; p++) {
              const a = (p / 8) * Math.PI * 2;
              ctx.beginPath();
              ctx.ellipse(cx + Math.cos(a) * cell * 0.22, cy + Math.sin(a) * cell * 0.22,
                          cell * 0.13, cell * 0.07, a, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = ink2;
            ctx.beginPath();
            ctx.arc(cx, cy, cell * 0.11, 0, Math.PI * 2);
            ctx.fill();
          } else if (motif === 2) {
            // A diagonal chequer.
            ctx.fillStyle = ink;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI / 4);
            for (let a = -2; a < 2; a++) {
              for (let b = -2; b < 2; b++) {
                if ((a + b) % 2 === 0) {
                  ctx.fillRect(a * cell * 0.24, b * cell * 0.24, cell * 0.24, cell * 0.24);
                }
              }
            }
            ctx.restore();
          } else {
            // A bordered square with a small centre lozenge.
            ctx.strokeStyle = ink;
            ctx.lineWidth = cell * 0.08;
            ctx.strokeRect(x + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76);
            ctx.fillStyle = ink2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-cell * 0.15, -cell * 0.15, cell * 0.3, cell * 0.3);
            ctx.restore();
          }

          // Every tile is worn: chips, dirt in the grout, one polished corner.
          for (let k = 0; k < 5; k++) {
            ctx.fillStyle = "rgba(60,50,34," + (0.05 + rand() * 0.16).toFixed(3) + ")";
            this.blob(ctx, rand, x + rand() * cell, y + rand() * cell,
                      cell * 0.14, cell * 0.11, 7);
          }
          ctx.restore();
          ctx.strokeStyle = "rgba(90,78,58,0.5)";
          ctx.lineWidth = Math.max(1, S / 512);
          ctx.strokeRect(x, y, cell, cell);
        }
      }
      this.grain(ctx, rand, S, S, Math.round(S * 4), 0.3);
      // The apartments are small and lit by one tube: bright in the middle,
      // dark in the corners.
      const lit = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.75);
      lit.addColorStop(0, "rgba(255,248,224,0.1)");
      lit.addColorStop(1, "rgba(20,16,10,0.2)");
      ctx.fillStyle = lit;
      ctx.fillRect(0, 0, S, S);
      return c;
    });
  },

  // Free every cached texture (only on teardown — the cache is shared).
  dispose: function () {
    this.cache.forEach(function (tex) {
      tex.dispose();
    });
    this.cache.clear();
  },
};

// ----------------------------------------------------------------
// UV helpers. Textures here are METRIC and SHARED: one wall texture serves
// every wall segment in the corridor. A shared texture cannot carry a per-mesh
// repeat/offset (that is a property of the texture, not the mesh), so the
// scaling lives in each mesh's own UVs instead — which also keeps it to ONE GPU
// upload per canvas however many surfaces use it.
// ----------------------------------------------------------------

// Rewrite a BoxGeometry's UVs so every face samples the texture at a metric
// scale, CONTINUOUS with world space: u is the horizontal world coordinate the
// face runs along divided by uMetric, v is world height divided by vMetric. Two
// wall boxes that meet therefore continue each other's texture exactly, and a
// doorway reveal (the end face of a segment) is textured like the wall it is
// part of. `origin` is the box centre in the same frame the sizes are given in.
function metricBoxUVs(geo, origin, uMetric, vMetric) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const face = Math.floor(i / 4); // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
    const x = origin.x + pos.getX(i);
    const y = origin.y + pos.getY(i);
    const z = origin.z + pos.getZ(i);
    let u, v;
    // HANDEDNESS. The two faces of a pair look opposite ways, so they cannot
    // share a u formula: whichever one is seen from the far side gets the
    // texture mirrored, and anything with writing on it — the painted phone
    // numbers — reads backwards there. Negating u on those two faces puts them
    // the right way round. Which is which:
    //   +x face is seen looking along -x, and that viewer's right is -z  -> -z
    //   -x face is seen looking along +x, and that viewer's right is +z  -> +z
    //   +z face is seen looking along -z, and that viewer's right is +x  -> +x
    //   -z face is seen looking along +z, and that viewer's right is -x  -> -x
    // The mirroring is invisible in the noise; it only ever showed in the text.
    // Adjacent segments of one wall all present the SAME face, so they stay
    // continuous, and the texture is periodic in u, so the bay seam still
    // closes either way round.
    if (face === 0) {
      u = -z / uMetric;
      v = y / vMetric;
    } else if (face === 1) {
      u = z / uMetric;
      v = y / vMetric;
    } else if (face === 4) {
      u = x / uMetric;
      v = y / vMetric;
    } else if (face === 5) {
      u = -x / uMetric;
      v = y / vMetric;
    } else {
      u = x / uMetric;
      v = z / uMetric;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

// Merge a list of indexed BufferGeometries into ONE, and dispose the parts. The
// grille is ~40 bars; as separate meshes that is 40 draw calls for something
// the eye reads as a single object, so it is built as one geometry instead.
// The inputs are already positioned in the corridor's frame, so there is no
// per-part transform to apply here.
function mergeGeometries(list) {
  let vCount = 0;
  let iCount = 0;
  list.forEach((g) => {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  });
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const nor = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  list.forEach((g) => {
    const p = g.attributes.position;
    const u = g.attributes.uv;
    const n = g.attributes.normal;
    const ix = g.index;
    pos.set(p.array, vo * 3);
    uv.set(u.array, vo * 2);
    if (n) nor.set(n.array, vo * 3);
    for (let k = 0; k < ix.count; k++) idx[io + k] = ix.getX(k) + vo;
    vo += p.count;
    io += ix.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Point a PlaneGeometry's four UVs at an explicit rectangle of the texture —
// used for the door atlas (pick one of the four doors) and for tiling a strip
// (u1 > 1 repeats). PlaneGeometry vertex order is TL, TR, BL, BR.
function setPlaneUVs(geo, u0, v0, u1, v1) {
  const uv = geo.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

// ----------------------------------------------------------------
// roomImages — WHICH of the nine images hangs in WHICH apartment, and in what
// order (the order is [left wall, back wall, right wall] as you walk in). The
// nine are in a rough chronological order across the neighbourhoods lived in,
// so the default keeps that order intact: the first apartment off the corridor
// holds the first three, and so on. Change these ids to rehang the show.
// ----------------------------------------------------------------
const roomImages = [
  ["#atpihl-1", "#atpihl-2", "#atpihl-3"], // apartment 1 — LEFT, nearest the mouth
  ["#atpihl-4", "#atpihl-5", "#atpihl-6"], // apartment 2 — LEFT, farthest
  ["#atpihl-7", "#atpihl-8", "#atpihl-9"], // apartment 3 — RIGHT
];

// ================================================================
// corridor-root — the corridor sub-space: one entity, everything inside it.
//
// PLACEMENT, mirroring zone-b-map-root exactly:
//   `offset` moves the whole sub-space as a unit; the default parks it 400 m
//   out on +z (the floor map is 400 m out on −z), far past any environment's
//   geometry, so neither sub-space is reachable on foot and the two can never
//   see each other.
//   `shown` is a PURE visibility flip (object3D.visible) — nothing is torn down
//   or rebuilt, every canvas texture stays resident on the GPU, so the first
//   teleport in has no hitch. It also strips the images' `clickable` class
//   while hidden, so a stray desktop ray can never reach a picture 400 m away.
//
// It emits `zoneacorridorbuilt` after every (re)build and
// `zoneacorridorrootchanged` whenever the offset moves — the same contract the
// map root offers — so the teleport manager and the collider re-derive instead
// of copying numbers.
//
// ROOT-LOCAL FRAME (this is the frame every number below is in):
//   +z is BEHIND you on arrival. The landing occupies z ∈ [0, landingDepth]
//   and is closed at its back (+z); the corridor runs from z = 0 away to
//   z = −length, where the end wall closes it. x = 0 is the centreline, the
//   walls' inner faces are at ±width/2, the floor is y = 0 and the ceiling
//   y = height. `width`, `height`, `length` and `landingDepth` are all CLEAR
//   dimensions (face to face) — the wall bodies sit outside them.
//
// TUNABLES — all of them, with their defaults. Nothing in the code below is a
// number that is not derived from these:
//   offset 0 0 400 / shown false      placement + visibility
//   length 16 / width 4.4 / height 3  the corridor's clear box
//   landingDepth 2                    the arrival end, behind z = 0
//   doorPitch 3.2                     spacing of the CLOSED doors along a wall
//   doorWidth 0.9 / doorHeight 2.1    every opening, closed or open
//   transomHeight 0.4                 the louvred fanlight over a closed door
//   roomWidth 3.2 / roomDepth 4       the DEFAULT apartment: along / away from
//                                     the run
//   roomSizes [{},{},{}]              per-apartment { w, d } overrides, indexed
//                                     like roomImages; either key may be left
//                                     out. index.html sets 4.8x6.0 / default /
//                                     6.4 wide
//   roomOffsets [0,0,0]               a by-eye z nudge per apartment, applied
//                                     after the packing
//   roomSpacing 0                     0 = auto: the left pair packed tight
//                                     around one party wall. Above 0 it
//                                     overrides that pair's HALF step
//   wallThickness 0.15                every wall, exactly like the floorplan
//   textureSize 1024 / seed 1         the canvases: resolution + which corridor
//   endWallShade 0.92                 the dead end, as a linear multiplier of
//                                     the side walls (1 = identical)
//   tubeSpacing 4 / tubeColor #f4f1e2 the ceiling lights (spacing is SNAPPED)
//   frameWidth .07 / frameDepth .045  the door frames' face + how proud
//   frameColor #8d7f62                painted timber frames
//   leafThickness .045                a door leaf
//   doorOpenAngle 100                 how far the apartments' doors stand open
//   floorTile .2 / roomTile .2        cement + gạch bông tile size
//   tubeWidth .11 / tubeLength 0      the fittings (0 = auto: 0.6 × width)
//   tubeDrop .06                      how far a tube hangs below the ceiling
//   imageProud .02                    a picture's clearance off its wall
//   focusDistance 1.3 / focusDimRadius 2.5
//                                     the VR focus view's fit inside the
//                                     SMALLEST apartment (see js/focus-vr.js)
// ================================================================
const CORRIDOR_GEOM_PROPS = [
  "length", "width", "height", "landingDepth", "doorPitch", "doorWidth",
  "doorHeight", "transomHeight", "roomWidth", "roomDepth", "roomSizes",
  "roomOffsets", "roomSpacing", "endWallShade",
  "window", "windowWidth", "windowHeight", "windowSill", "windowX",
  "windowRevealColor", "windowSillColor",
  "grilleBar", "grilleSpacingX", "grilleSpacingY", "grilleFrame",
  "grilleColor", "grilleRust", "grilleInset", "grilleTile",
  "wallThickness", "textureSize", "seed", "wallNoiseRes", "wallFlake",
  "roomWallFlake", "wallGrain", "wallStripe", "wallStencils", "wallStencilTilt",
  "wallStencilInk",
  "wallPalette", "wallPaletteOverride",
  "roomWallPalettes", "tubeSpacing", "tubeColor",
  "frameWidth", "frameDepth", "frameColor", "leafThickness", "doorOpenAngle",
  "floorTile", "roomTile", "tubeWidth", "tubeLength", "tubeDrop", "imageProud",
];

AFRAME.registerComponent("corridor-root", {
  schema: {
    offset: { type: "vec3", default: { x: 0, y: 0, z: 400 } },
    shown: { type: "boolean", default: false },

    length: { type: "number", default: 16 },
    width: { type: "number", default: 2.2 },
    height: { type: "number", default: 3.0 },
    landingDepth: { type: "number", default: 2.0 },

    doorPitch: { type: "number", default: 3.2 },
    doorWidth: { type: "number", default: 0.9 },
    doorHeight: { type: "number", default: 2.1 },
    transomHeight: { type: "number", default: 0.4 },

    // The DEFAULT apartment, used by any of the three that does not override it.
    roomWidth: { type: "number", default: 3.2 },
    roomDepth: { type: "number", default: 4.0 },
    // PER-APARTMENT sizes, indexed like roomImages (0 = apartment 1, left and
    // nearest the mouth; 1 = apartment 2, left and far; 2 = apartment 3,
    // right). Each entry is { w, d } in metres — w ALONG the corridor, d away
    // from it — and either key may be left out to fall back to roomWidth /
    // roomDepth. An object, or the JSON string an HTML attribute carries (the
    // pattern floorplan.js uses for `rooms`). Empty by default, so the
    // component on its own still builds three identical 3.2 x 4.0 rooms; the
    // real sizes are set on the tag in index.html.
    roomSizes: {
      default: [{}, {}, {}],
      parse: function (v) {
        if (typeof v !== "string") return v || [{}, {}, {}];
        return v ? JSON.parse(v) : [{}, {}, {}];
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
    // A by-eye nudge along the corridor per apartment, in metres, same
    // indexing. Applied AFTER the packing below, so it deliberately breaks the
    // exact fit — that is what it is for.
    roomOffsets: {
      default: [0, 0, 0],
      parse: function (v) {
        if (typeof v !== "string") return v || [0, 0, 0];
        return v ? JSON.parse(v) : [0, 0, 0];
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
    // OPTIONAL override of the LEFT PAIR's step (apartment 2's centre to
    // apartment 1's centre is twice this). 0 = packed tight, sharing a party
    // wall, which is what the auto packing does.
    roomSpacing: { type: "number", default: 0 }, // 0 = auto

    wallThickness: { type: "number", default: 0.15 },
    textureSize: { type: "number", default: 1024 },
    seed: { type: "number", default: 1 },
    // The wall's noise fields are computed at textureSize / wallNoiseRes and
    // sampled bilinearly onto the full canvas (see CorridorTextures.noiseField).
    // 2 = half resolution, and by far the cheapest lever on the corridor's build
    // pause: 4 quarters the field work again at the cost of slightly smoother
    // flake contours. Coat edges stay pixel-crisp either way — they are
    // thresholded after the interpolation, not before.
    wallNoiseRes: { type: "number", default: 2 },
    // The wall's weathering, as three knobs over the whole stack of coats:
    //   wallFlake   0..1+ — how weathered the wall is. Primarily a multiplier
    //               on how much of each coat is GONE, and with it the number of
    //               lichen blooms and rust runs, so 0 really is a repainted
    //               wall rather than an unflaked one covered in stains. 1 is
    //               the reference walls; above 1 strips it further. (Nail holes
    //               and scrawls are NOT scaled: they are occupancy, not decay.)
    //   wallGrain   0..1+ — the strength of the vertical brushed streaking,
    //               both inside the coat masks and as strokes over them.
    //   wallStripe  allow the "stripe" variant to show its ragged band of an
    //               earlier ochre scheme. Off makes that variant a plain wall.
    wallFlake: { type: "number", default: 1 },
    // ...and how weathered an APARTMENT is, as a fraction of that. The corridor
    // is common ground nobody has painted in decades; a room someone lives in
    // gets repainted, so its walls are the same stack of coats far less far
    // gone. 1 would make a room exactly as ruined as the corridor.
    //
    // To aim it at a TOP-COAT COVERAGE instead of guessing: a coat's coverage
    // after flaking is 1 - (1 - c) * flake, where c is the palette's coverage
    // plus the variant's bias. The apartments run the "plain" variant over a
    // 0.45 top coat, so c = 0.45 - 0.04 = 0.41 and
    //     flake = (1 - target) / 0.59
    // 0.051 is a 97% top coat: the wall is the colour it was last painted, with
    // the coat beneath showing through in the last few percent.
    roomWallFlake: { type: "number", default: 0.051 },
    wallGrain: { type: "number", default: 1 },
    wallStripe: { type: "boolean", default: true },
    // WHICH COLOURS the wall generator paints with. `wallPalette` names an
    // entry in CorridorTextures.WALL_PALETTES ("chungcu" | "green");
    // `wallPaletteOverride` patches individual keys of it without redefining
    // the rest — an object, or the JSON string an HTML attribute carries (the
    // same parse/stringify pattern floorplan.js uses for `rooms`). `coats`
    // merges per index, so
    //   setAttribute('corridor-root','wallPaletteOverride',
    //                {coats:[{},{color:'#7a8f5a'}]})
    // swaps the ochre coat for green and changes nothing else.
    // The painted service ads. `wallStencils` is a density 0..1 (0 = none):
    // it scales how many number marks a bay carries, which is 2 on the
    // "flaked" variant, 1 on "stripe" and 0 on "intact" — and "intact" is what
    // the segments beside an apartment doorway and the apartments themselves
    // are built from, so the hung images never compete with an ad.
    // `wallStencilTilt` is how many degrees off horizontal they are painted
    // (each mark takes 40-100% of it, either way up) — they are done freehand
    // off a card and none of them is level. There is deliberately no lettering
    // option: numbers only.
    // `wallStencilInk` scales how much pigment went on — how strongly a mark
    // reads against the wall before the wall starts taking it away. 1 is a
    // fresh-ish coat of spray paint; below that it was thin to begin with.
    wallStencils: { type: "number", default: 0.6 },
    wallStencilTilt: { type: "number", default: 6 },
    wallStencilInk: { type: "number", default: 1 },
    wallPalette: { type: "string", default: "chungcu" },
    wallPaletteOverride: {
      default: null,
      parse: function (v) {
        if (typeof v !== "string") return v || null;
        return v ? JSON.parse(v) : null;
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
    // PER-APARTMENT palettes: three entries, one per apartment in roomImages
    // order (1, 2, 3), each null / a palette NAME / an override object applied
    // over the corridor's palette. Default none — every room is painted like
    // the corridor. Each distinct palette costs its own three wall canvases.
    roomWallPalettes: {
      default: [null, null, null],
      parse: function (v) {
        if (typeof v !== "string") return v || [null, null, null];
        return v ? JSON.parse(v) : [null, null, null];
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },

    // How much darker the corridor's dead-end wall is than the side walls, as a
    // straight linear multiplier: 1 is identical, and the default is a hint of
    // recession you would not notice unless you looked for it.
    endWallShade: { type: "number", default: 0.92 },

    // ---- THE WINDOW in the end wall ------------------------------------
    // The corridor's dead end is not dead: it carries a big barred window with
    // the city behind it, so the whole run reads as an approach to that view.
    // `window` false restores a solid end wall and skips the grille, the view
    // and the daylight with it.
    //   windowX     centre along the wall; 0 is the corridor's centreline
    //   windowSill  the opening's bottom, above the floor
    //   windowRevealColor  "" leaves the four reveals in the wall's own
    //                      texture; a colour paints them (painted concrete)
    window: { type: "boolean", default: true },
    windowWidth: { type: "number", default: 2.8 },
    windowHeight: { type: "number", default: 1.5 },
    windowSill: { type: "number", default: 1.0 },
    windowX: { type: "number", default: 0 },
    windowRevealColor: { type: "color", default: "" },
    windowSillColor: { type: "color", default: "#b9b3a6" },

    // ---- THE SECURITY GRILLE over that window --------------------------
    // Welded square bar, a frame and a lattice. `grilleInset` sits it behind
    // the wall's inner face, inside the reveal, where a grille actually goes —
    // and far enough back that the camera's near plane cannot reach it from the
    // closest spot the collider allows.
    grilleBar: { type: "number", default: 0.014 },
    grilleSpacingX: { type: "number", default: 0.14 },
    grilleSpacingY: { type: "number", default: 0.16 },
    grilleFrame: { type: "number", default: 0.04 },
    grilleColor: { type: "color", default: "#2a2b2e" },
    grilleRust: { type: "number", default: 0.35 },
    grilleInset: { type: "number", default: 0.03 },
    grilleTile: { type: "number", default: 0.5 }, // metres of bar per texture repeat

    tubeSpacing: { type: "number", default: 4 },
    tubeColor: { type: "color", default: "#f4f1e2" },

    // --- secondary tunables: the joinery. Same rule as above, no magic
    // numbers in the code; these just rarely need touching.
    frameWidth: { type: "number", default: 0.07 },
    frameDepth: { type: "number", default: 0.045 },
    frameColor: { type: "color", default: "#8d7f62" },
    leafThickness: { type: "number", default: 0.045 },
    doorOpenAngle: { type: "number", default: 100 },
    floorTile: { type: "number", default: 0.2 },
    roomTile: { type: "number", default: 0.2 },
    tubeWidth: { type: "number", default: 0.11 },
    tubeLength: { type: "number", default: 0 }, // 0 = auto (0.6 × width)
    tubeDrop: { type: "number", default: 0.06 },
    imageProud: { type: "number", default: 0.02 },
    // The VR focus view's fit inside an apartment (read by js/focus-vr.js via
    // ZoneA.focusVR when the teleport puts you in here). 1.3 m keeps the panel
    // clear of a 3.2 m-wide room's side walls; the dim radius has to stay
    // OUTSIDE the panel's own farthest corner (2.42 m at this distance) or the
    // dim sphere cuts a visible circle across the picture it is isolating —
    // 2.5 m is the smallest radius that does, and it still dims the corridor
    // seen through the open door.
    focusDistance: { type: "number", default: 1.3 },
    focusDimRadius: { type: "number", default: 2.5 },
  },

  init: function () {
    this.group = null;
    this.geometries = [];
    this.materials = [];
    this.imageEls = [];
    this.hiddenClickables = []; // clickables parked while the corridor is hidden
    this.built = false;

    // WALKABILITY. The corridor is not in the floorplan, so it registers its
    // own walkable rectangles with the collider's registry (js/rig-collision.js
    // — RigRegions). One source, derived live from this component's schema and
    // offset every time the collider rebuilds, so retuning the corridor retunes
    // its walls for free. Registering here rather than in build() means the
    // source exists no matter which component inits first; the function itself
    // re-derives the layout on each call, so it is correct even before the
    // first build.
    this.regionSourceId = "zone-a-corridor";
    if (window.RigRegions) {
      window.RigRegions.addRegionSource(this.regionSourceId, (opts) =>
        this.walkableRects(opts)
      );
    } else {
      console.warn("corridor-root: no RigRegions; the corridor will have no walls");
    }

    // Late-built hit boxes (TerminalKit's, inside the return booth) have to be
    // gated too — see applyShown.
    this.onLoaded = () => this.applyShown();
    if (this.el.sceneEl.hasLoaded) setTimeout(this.onLoaded, 0);
    else this.el.sceneEl.addEventListener("loaded", this.onLoaded);

    // DEBUG ENTRY — `?zonea=debug` shows the corridor on load and drops you on
    // the landing facing down it, instead of making you walk to the booth and
    // teleport every time. Same URLSearchParams convention as environment.js's
    // ?env= / ?debug. Kept after the build on purpose: it is the iteration path
    // for anyone tuning the corridor.
    const params = new URLSearchParams(window.location.search);
    this.debugMode = params.get("zonea") === "debug";
    if (this.debugMode) {
      this.onSceneLoaded = () => this.debugEnter();
      if (this.el.sceneEl.hasLoaded) setTimeout(this.onSceneLoaded, 0);
      else this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
    }
  },

  // Show the corridor and put the visitor on the landing, facing -z down the
  // run — the same arrival the teleport gives, minus the glitch.
  debugEnter: function () {
    const L = this.L || this.layout();
    const o = this.data.offset;
    this.el.setAttribute("corridor-root", "shown", true);
    const target = new THREE.Vector3(
      o.x, o.y, o.z + this.data.landingDepth / 2
    );
    if (window.TeleportRig) TeleportRig.go(target, 0);
    const rigEl = document.getElementById("rig");
    const collider = rigEl && rigEl.components && rigEl.components["rig-collision"];
    if (collider) collider.resync();
    console.log(
      "[corridor] ?zonea=debug — on the landing at " +
        target.x + " " + target.y + " " + target.z + ", " + L.bays + " bays ahead"
    );
  },

  update: function (oldData) {
    const d = this.data;
    const first = Object.keys(oldData).length === 0;
    const geomChanged =
      first ||
      CORRIDOR_GEOM_PROPS.some(function (k) {
        return oldData[k] !== d[k];
      });
    const o = d.offset;
    const moved =
      first ||
      !oldData.offset ||
      oldData.offset.x !== o.x ||
      oldData.offset.y !== o.y ||
      oldData.offset.z !== o.z;

    if (geomChanged) this.build();
    if (moved) {
      this.el.setAttribute("position", { x: o.x, y: o.y, z: o.z });
      this.el.emit("zoneacorridorrootchanged");
    }
    // The walkable rectangles are derived from the same schema + offset, so any
    // change to either means the collider has to re-read them.
    if ((geomChanged || moved) && window.RigRegions) window.RigRegions.rebuild();
    this.applyShown();
  },

  // ---------------------------------------------------------------
  // walkableRects(opts) — THE CORRIDOR'S WALLS, for rig-collision.
  //
  // The union of axis-aligned world-space rectangles the visitor may stand in:
  // the landing, the corridor, the three apartments, and one throat per open
  // doorway bridging each apartment to the run. Derived from this component's
  // own layout() — the same numbers the geometry was built from — so the walls
  // you see and the walls you cannot cross can never disagree.
  //
  // INSETS. The collider's rooms inset from a wall's CENTRELINE by
  // (wallThickness/2 + playerRadius). This component's `width` / `height` /
  // `length` / `landingDepth` are CLEAR dimensions — they already name the wall
  // INNER faces — so the identical stop line is just playerRadius in from a
  // face, which is what is applied below.
  //
  // THROATS. A wall is wallThickness thick and both sides are inset by the
  // player radius, so the corridor rectangle and an apartment rectangle stop
  // short of each other with a gap between them; without a bridge the doorway
  // would be a wall. Each throat is doorWidth minus a player diameter, extended
  // doorOverlap past BOTH neighbours' inset edges so the union stays
  // continuous — the same rule buildRegions() uses for the floorplan's
  // hallways. The closed doors get no throat, which is exactly why they are
  // solid: they sit inside a wall, where there is no rectangle at all.
  // ---------------------------------------------------------------
  walkableRects: function (opts) {
    const d = this.data;
    const L = this.layout();
    const o = d.offset; // the root carries no rotation: local + offset = world
    const r = (opts && opts.playerRadius) || 0;
    const overlap = (opts && opts.doorOverlap) || 0;
    const rects = [];
    const push = (x0, x1, z0, z1, tag) => {
      if (x1 - x0 <= 0 || z1 - z0 <= 0) return; // narrower than the visitor
      rects.push({
        x0: o.x + x0, x1: o.x + x1,
        z0: o.z + z0, z1: o.z + z1,
        tag: tag,
      });
    };

    // The LANDING and the CORRIDOR: one tube, split at z = 0 into two
    // rectangles that share that edge, so each carries its own tag while the
    // union stays continuous.
    push(-L.halfW + r, L.halfW - r, 0, L.zBack - r, "corridor:landing");
    push(-L.halfW + r, L.halfW - r, L.zEnd + r, 0, "corridor:run");

    L.rooms.forEach((room) => {
      // The apartment itself.
      const near = room.side * (L.halfW + L.t); // its face of the corridor wall
      const far = near + room.side * room.d;
      push(Math.min(near, far) + r, Math.max(near, far) - r,
           room.z - room.w / 2 + r, room.z + room.w / 2 - r,
           "corridor:room" + (room.index + 1));

      // Its doorway throat: from inside the corridor, through the wall, to
      // inside the apartment.
      const inCorridor = room.side * (L.halfW - r - overlap);
      const inRoom = room.side * (L.halfW + L.t + r + overlap);
      push(Math.min(inCorridor, inRoom), Math.max(inCorridor, inRoom),
           room.z - (d.doorWidth / 2 - r), room.z + (d.doorWidth / 2 - r),
           "corridor:door" + (room.index + 1));
    });

    return rects;
  },

  // `shown` is visibility only — plus one thing visibility does NOT cover.
  //
  // THREE's raycaster does not skip invisible objects (checked against r173:
  // a ray fired at a hidden mesh still returns a hit), and the desktop mouse
  // cursor's raycaster has no `far` limit. A picture hangs at exactly eye
  // height 400 m along +z, so looking back down the gallery and clicking would
  // otherwise open a focus view on a picture in a corridor you are not in. So
  // while the corridor is hidden, everything clickable inside it — the nine
  // images and the return booth's hit box — loses the `clickable` class the
  // raycasters filter on, and gets it back when the corridor is shown.
  //
  // Re-run on every build and once the scene has loaded, because the booth's
  // hit box is built by TerminalKit inside the terminal's own init, which can
  // land after ours.
  applyShown: function () {
    const on = this.data.shown;
    this.el.object3D.visible = on;
    if (on) {
      this.hiddenClickables.forEach(function (el) {
        el.classList.add("clickable");
      });
      this.hiddenClickables = [];
    } else {
      const list = this.el.querySelectorAll(".clickable");
      for (let i = 0; i < list.length; i++) {
        list[i].classList.remove("clickable");
        this.hiddenClickables.push(list[i]);
      }
    }
    this.refreshRaycasters();
  },

  // A-Frame's raycasters cache the object list they test; a class change alone
  // does not invalidate it, so ask each one to rebuild (the same nudge
  // focus-vr.js gives them after adding or removing clickable entities).
  refreshRaycasters: function () {
    const list = this.el.sceneEl.querySelectorAll("[raycaster]");
    for (let i = 0; i < list.length; i++) {
      const rc = list[i].components && list[i].components.raycaster;
      if (rc) rc.refreshObjects();
    }
  },

  // ---------------------------------------------------------------
  // layout() — EVERY derived dimension in one place, so the builders below
  // read numbers rather than compute them, and so the collider (Step 5) can
  // derive its walkable rectangles from exactly the same values the geometry
  // was built from.
  // ---------------------------------------------------------------
  layout: function () {
    const d = this.data;
    const t = d.wallThickness;
    const halfW = d.width / 2; // wall INNER faces, ±
    const zBack = d.landingDepth; // landing back wall inner face
    const zEnd = -d.length; // corridor end wall inner face
    const run = zBack - zEnd; // total clear run, landing + corridor

    // LIGHTING BAYS. The requested tubeSpacing is SNAPPED so the run divides
    // into a whole number of bays: the ceiling texture is exactly one bay long
    // with its light pool in the middle, so snapping is what makes every pool
    // land on its tube instead of drifting along the corridor.
    const bays = Math.max(1, Math.round(run / d.tubeSpacing));
    const bay = run / bays;

    // THE THREE APARTMENTS take the far stretch of the corridor, and each has
    // its OWN size now (roomSizes), so where they sit has to be packed
    // explicitly rather than fallen out of a single step.
    //
    //   LEFT WALL. Apartment 2 sits at the far end, its outer side wall against
    //   the corridor's end wall — centre at zEnd + (w2 + t)/2, which is where
    //   it has always been. Apartment 1 sits directly in front of it, the two
    //   of them SHARING one party wall, so its centre is a half of each width
    //   plus a wall thickness further along. That is a chung cư: apartments
    //   packed wall to wall, not spaced out.
    //
    //   RIGHT WALL. Apartment 3 is centred on the MIDPOINT of the left pair's
    //   whole span, so its doorway looks across at the party wall between them
    //   rather than into either of their doors.
    //
    // roomOffsets then nudges any of the three along the corridor by eye.
    const rs = d.roomSizes || [];
    const sizeOf = (i) => {
      const e = rs[i] || {};
      return {
        w: e.w > 0 ? e.w : d.roomWidth,
        d: e.d > 0 ? e.d : d.roomDepth,
      };
    };
    const ro = d.roomOffsets || [];
    const nudge = (i) => (typeof ro[i] === "number" ? ro[i] : 0);
    const sz = [sizeOf(0), sizeOf(1), sizeOf(2)];

    const z2 = zEnd + (sz[1].w + t) / 2; // apartment 2, hard against the end
    // The left pair's step: half of each width plus the party wall between
    // them, unless roomSpacing overrides it (it is a HALF step, as it always
    // was, so two same-side apartments end up 2 × it apart).
    const leftStep =
      d.roomSpacing > 0 ? d.roomSpacing * 2 : sz[1].w / 2 + t + sz[0].w / 2;
    const z1 = z2 + leftStep; // apartment 1, in front of it
    // ...and apartment 3 opposite the middle of the pair.
    const z3 = (z2 - sz[1].w / 2 + (z1 + sz[0].w / 2)) / 2;

    // Ordered from the END WALL back toward the mouth. `index` is the index
    // into roomImages: walking in you pass apartment 1 (left), 3 (right),
    // 2 (left), so from the far end that is 2, 3, 1.
    // Each carries its own size and its own optional wall palette override.
    const rp = d.roomWallPalettes || [];
    const rooms = [
      { side: -1, z: z2 + nudge(1), index: 1, w: sz[1].w, d: sz[1].d,
        wallPaletteOverride: rp[1] || null },
      { side: +1, z: z3 + nudge(2), index: 2, w: sz[2].w, d: sz[2].d,
        wallPaletteOverride: rp[2] || null },
      { side: -1, z: z1 + nudge(0), index: 0, w: sz[0].w, d: sz[0].d,
        wallPaletteOverride: rp[0] || null },
    ];

    // The apartments must not run into the landing. Their near end is
    // apartment 1's outer wall; if that reaches within a door pitch of z = 0
    // there is no corridor left in front of them, so say so loudly rather than
    // quietly overlapping the doors or the landing.
    const nearEnd = z1 + nudge(0) + sz[0].w / 2 + t;
    if (nearEnd > -d.doorPitch) {
      console.warn(
        "[corridor] the apartments reach the landing: apartment 1's near wall " +
          "is at z " + nearEnd.toFixed(2) + ", which leaves less than one door " +
          "pitch (" + d.doorPitch + " m) of corridor in front of it. Lengthen " +
          "`length` (now " + d.length + ") or shrink roomSizes."
      );
    }

    // CLOSED DOORS fill the rest of each wall on a regular pitch, the two walls
    // half a pitch out of step so doors never face each other across the
    // corridor. They stop short of the apartments' stretch.
    const openings = { "-1": [], "1": [] };
    rooms.forEach(function (r) {
      openings[String(r.side)].push({
        z: r.z,
        width: d.doorWidth,
        top: d.doorHeight, // an open doorway has no transom above it
        open: true,
        room: r,
      });
    });
    [-1, 1].forEach(function (side) {
      const list = openings[String(side)];
      // The nearest edge of this side's nearest apartment: closed doors have to
      // stay in front of it (and clear of its wall).
      let limit = zEnd;
      list.forEach(function (op) {
        // op.room is set for the apartments' openings, which are the only ones
        // in the list at this point — and each has its OWN width now.
        limit = Math.max(limit, op.z + op.room.w / 2 + t);
      });
      const phase = side < 0 ? 0.5 : 1.0; // left wall offset by half a pitch
      for (let k = 0; k < 64; k++) {
        const z = -(k + phase) * d.doorPitch;
        if (z - d.doorWidth / 2 < limit) break; // into the apartments' stretch
        if (z + d.doorWidth / 2 > 0) continue; // don't cut into the landing
        list.push({
          z: z,
          width: d.doorWidth,
          top: d.doorHeight + d.transomHeight, // leaf + louvred transom
          open: false,
        });
      }
      list.sort(function (a, b) {
        return b.z - a.z; // from the mouth (z ≈ 0) toward the end wall
      });
    });

    // THE WINDOW in the end wall, clamped to fit. It needs a margin of wall
    // each side and above it, or the opening would break out of the wall and
    // leave the corridor open at the corner.
    const outerHalf = d.width / 2 + t;
    let winW = d.windowWidth;
    let winH = d.windowHeight;
    let winSill = d.windowSill;
    let winX = d.windowX;
    if (d.window) {
      const MARGIN_SIDE = 0.3;
      const MARGIN_TOP = 0.25;
      const maxW = 2 * (outerHalf - Math.abs(winX) - MARGIN_SIDE);
      const maxH = d.height - winSill - MARGIN_TOP;
      if (winW > maxW || winH > maxH) {
        console.warn(
          "[corridor] the end-wall window does not fit and has been clamped: " +
            "asked for " + d.windowWidth.toFixed(2) + " x " +
            d.windowHeight.toFixed(2) + " at x " + winX.toFixed(2) +
            ", sill " + winSill.toFixed(2) + "; the wall is " +
            (outerHalf * 2).toFixed(2) + " x " + d.height.toFixed(2) +
            " and needs " + MARGIN_SIDE + " m each side and " + MARGIN_TOP +
            " m above. Using " + Math.min(winW, maxW).toFixed(2) + " x " +
            Math.min(winH, maxH).toFixed(2) + "."
        );
        winW = Math.min(winW, maxW);
        winH = Math.min(winH, maxH);
      }
    }

    return {
      t: t,
      halfW: halfW,
      outerHalf: outerHalf,
      win: d.window
        ? { x: winX, w: winW, h: winH, sill: winSill,
            x0: winX - winW / 2, x1: winX + winW / 2,
            y0: winSill, y1: winSill + winH }
        : null,
      zBack: zBack,
      zEnd: zEnd,
      run: run,
      bays: bays,
      bay: bay,
      rooms: rooms,
      openings: openings,
      // Wall runs span the FULL outer extent, so the corners overlap and close
      // themselves — the same trick the floorplan uses.
      zLo: zEnd - t,
      zHi: zBack + t,
      tubeLength: d.tubeLength > 0 ? d.tubeLength : d.width * 0.6,
    };
  },

  // ---------------------------------------------------------------
  // Mesh helpers. Everything is unlit (MeshBasicMaterial) — see the LIGHTING
  // note at the top of the file. Geometries and materials are tracked so a
  // rebuild can dispose them.
  // ---------------------------------------------------------------
  mat: function (opts) {
    const m = new THREE.MeshBasicMaterial(opts);
    this.materials.push(m);
    return m;
  },

  // A box whose faces are textured METRICALLY (uMetric metres of texture per
  // repeat horizontally, vMetric vertically) — walls, lintels, door leaves.
  addBox: function (sx, sy, sz, cx, cy, cz, material, uMetric, vMetric) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    if (uMetric) metricBoxUVs(geo, { x: cx, y: cy, z: cz }, uMetric, vMetric);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx, cy, cz);
    this.group.add(mesh);
    return mesh;
  },

  // A flat quad. `uv` is [u0, v0, u1, v1] in texture space; the caller derives
  // it from the quad's metric size, so tiling is always metric.
  addPlane: function (w, h, material, uv) {
    const geo = new THREE.PlaneGeometry(w, h);
    if (uv) setPlaneUVs(geo, uv[0], uv[1], uv[2], uv[3]);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    this.group.add(mesh);
    return mesh;
  },

  // ---------------------------------------------------------------
  build: function () {
    this.teardown();
    const d = this.data;
    const L = this.layout();
    this.L = L; // the collider (Step 5) reads this back

    this.group = new THREE.Group();
    this.el.setObject3D("corridor", this.group);

    const S = d.textureSize;
    CorridorTextures.resetTimings();
    // --- the corridor's own canvases; the apartments add theirs on demand ---
    // What the wall canvases need that the canvas cannot know by itself: how
    // many metres it covers (so wear can be sized in centimetres), and the
    // weathering knobs.
    const wopts = {
      bay: L.bay,
      height: d.height,
      noiseRes: d.wallNoiseRes,
      flake: d.wallFlake,
      grain: d.wallGrain,
      stripe: d.wallStripe,
      stencils: d.wallStencils,
      stencilTilt: d.wallStencilTilt,
      stencilInk: d.wallStencilInk,
      debug: this.debugMode,
    };
    this.wopts = wopts;
    // The apartments' own weathering: the same options with the flake turned
    // down. A separate object rather than a flag, so it flows through the
    // texture cache key like everything else.
    this.roomWopts = Object.assign({}, wopts, {
      flake: d.wallFlake * d.roomWallFlake,
    });
    this._wallMats = {}; // palette key -> the three variant materials
    this.corridorPal = this.wallPalette();
    this.tex = {
      wall: this.wallTextures(this.corridorPal),
      floor: CorridorTextures.floor(S, d.seed, Math.max(2, Math.round(d.width / d.floorTile))),
      ceiling: CorridorTextures.ceiling(S, d.seed),
      door: CorridorTextures.doorAtlas(S, d.seed),
      transom: CorridorTextures.transom(S, d.seed, 9),
      roomFloor: CorridorTextures.roomFloor(S, d.seed, 4),
    };
    // Materials: one per texture, shared by every mesh that uses it. The end
    // wall reuses a wall texture with the material COLOUR knocked down, which
    // is how "the wall texture, darker" costs no extra canvas.
    this.m = {
      wall: this.wallMaterials(this.corridorPal),
      // The corridor's dead end. It reuses a wall canvas and knocks the
      // brightness down a little, so the far end recedes — but only a little.
      //
      // setScalar, NOT a hex colour. THREE's colour management is on, so
      // new THREE.Color("#rrggbb") reads the hex as sRGB and converts it to the
      // linear working space before it multiplies the map. The old "#6f7c82"
      // looked like a 45% knock-down and actually landed at (0.16, 0.20, 0.22)
      // — a fifth of the brightness of every other wall, and blue-shifted with
      // it, because the conversion is not uniform across the channels. That is
      // why the end wall read as a different, colder surface instead of the
      // same wall further away. setScalar writes the working space directly, so
      // endWallShade means exactly what it says.
      endWall: this.mat({
        map: this.tex.wall[2],
        color: new THREE.Color().setScalar(d.endWallShade),
      }),
      floor: this.mat({ map: this.tex.floor }),
      ceiling: this.mat({ map: this.tex.ceiling }),
      door: this.mat({ map: this.tex.door }),
      doorEdge: this.mat({ color: new THREE.Color("#4a3f2c") }),
      transom: this.mat({ map: this.tex.transom }),
      frame: this.mat({ color: new THREE.Color(d.frameColor) }),
      // Window trim. Flat colours: a sill is a cast slab, it has no grain worth
      // a canvas. (Note the setScalar/hex distinction on endWall above — these
      // are real colours, so a hex is right here.)
      sill: this.mat({ color: new THREE.Color(d.windowSillColor) }),
      sillLip: this.mat({
        color: new THREE.Color(d.windowSillColor).multiplyScalar(0.62),
      }),
      reveal: this.mat({
        color: new THREE.Color(d.windowRevealColor || "#b9b3a6"),
        side: THREE.DoubleSide,
      }),
      grille: this.mat({
        map: CorridorTextures.grilleIron(256, d.seed, d.grilleRust, d.grilleColor),
      }),
      roomFloor: this.mat({ map: this.tex.roomFloor }),
      tube: this.mat({ color: new THREE.Color(d.tubeColor), fog: false }),
    };

    this.buildShell(L);
    this.buildSideWall(L, -1);
    this.buildSideWall(L, +1);
    this.buildTubes(L);
    this.partyWalls = {}; // two abutting apartments share ONE wall - see below
    L.rooms.forEach((r) => this.buildRoom(L, r));

    this.built = true;
    const wallT = CorridorTextures.timeFor("wall|");
    const allT = CorridorTextures.timeFor("");
    // The apartments' own line: where each one sits, how big it is, how many
    // closed doors are left on each wall, and how much clear corridor there is
    // in front of the whole stretch — the numbers you need to decide whether
    // `length` should grow.
    const closed = (side) =>
      L.openings[String(side)].filter((o) => !o.open).length;
    let nearest = L.zEnd;
    L.rooms.forEach((r) => {
      nearest = Math.max(nearest, r.z + r.w / 2 + L.t);
    });
    console.log(
      "[corridor] apartments " +
        L.rooms
          .slice()
          .sort((a, b) => a.index - b.index)
          .map((r) => "#" + (r.index + 1) + " " + (r.side < 0 ? "L" : "R") +
                      " z " + r.z.toFixed(2) + " " +
                      r.w.toFixed(1) + "x" + r.d.toFixed(1))
          .join(", ") +
        " | closed doors L " + closed(-1) + " R " + closed(1) +
        " | clear corridor in front of them " +
        Math.abs(0 - nearest).toFixed(2) + " m"
    );
    console.log(
      "[corridor] " + L.run.toFixed(1) + " m run, " + L.bays + " bays of " +
        L.bay.toFixed(2) + " m, " +
        (L.openings["-1"].length + L.openings["1"].length) + " doorways, " +
        L.rooms.length + " apartments, " + this.imageEls.length + " images, " +
        this.group.children.length + " meshes | textures " +
        allT.ms.toFixed(0) + " ms total, " + wallT.drawn + " wall canvas(es) " +
        (wallT.drawn ? (wallT.ms / wallT.drawn).toFixed(0) : "0") +
        " ms each (noiseRes " + d.wallNoiseRes + ", size " + S + ")"
    );
    this.el.emit("zoneacorridorbuilt");
  },

  // The corridor's own palette: a named entry from the texture kit, with this
  // component's override merged over it.
  wallPalette: function (override) {
    const base = CorridorTextures.resolvePalette(this.data.wallPalette);
    const merged = CorridorTextures.mergePalette(base, this.data.wallPaletteOverride);
    // A room's override is either a palette NAME (a whole different scheme) or
    // a patch on the corridor's.
    if (!override) return merged;
    if (typeof override === "string") {
      return CorridorTextures.resolvePalette(override);
    }
    return CorridorTextures.mergePalette(merged, override);
  },

  // The three variant canvases for a palette. Cached by the kit, so asking
  // twice for the same colours costs nothing.
  wallTextures: function (pal) {
    const S = this.data.textureSize;
    const seed = this.data.seed;
    return [0, 1, 2].map((v) =>
      CorridorTextures.wall(S, seed, v, 0, pal, this.wopts));
  },

  // ONE variant's material for a palette, built on demand and cached by
  // palette + variant. Lazy on purpose: an apartment uses a single variant, so
  // giving it its own scheme costs ONE extra canvas rather than three.
  wallMaterial: function (pal, variant, opts) {
    const o = opts || this.wopts;
    // The flake is part of the key: the corridor and an apartment can share a
    // palette and a variant and still be weathered differently.
    const key = CorridorTextures.paletteKey(pal) + "|" + variant + "|" + o.flake;
    if (this._wallMats[key]) return this._wallMats[key];
    const m = this.mat({
      map: CorridorTextures.wall(this.data.textureSize, this.data.seed,
                                 variant, 0, pal, o),
    });
    this._wallMats[key] = m;
    return m;
  },

  // All three variants — what the corridor itself needs.
  wallMaterials: function (pal) {
    return [0, 1, 2].map((v) => this.wallMaterial(pal, v));
  },

  // Floor, ceiling, the landing's back wall and the corridor's end wall.
  // The floor and ceiling are each ONE plane spanning landing AND corridor: the
  // landing is not a separate room, it is the closed end of the same tube, and
  // one plane keeps the 0.2 m tile grid running unbroken through z = 0 (two
  // abutting planes could only align if their lengths were exact multiples of
  // the tile).
  buildShell: function (L) {
    const d = this.data;

    // FLOOR. The texture's canvas spans the full corridor width, so u runs 0..1
    // across it (never stretched) and only the length repeats.
    const floor = this.addPlane(d.width, L.run, this.m.floor,
                                [0, 0, 1, L.run / d.width]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (L.zBack + L.zEnd) / 2);

    // CEILING, one texture repeat per lighting bay so the pools land on tubes.
    const ceil = this.addPlane(d.width, L.run, this.m.ceiling, [0, 0, 1, L.bays]);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, d.height, (L.zBack + L.zEnd) / 2);

    // BACK WALL of the landing (behind you on arrival) and the corridor's END
    // WALL. Both span the full outer width so they close the corners.
    const outerW = d.width + L.t * 2;
    // The landing's back wall takes the CALM variant: it is the first thing you
    // see on arrival, at arm's length behind the return booth, and a painted
    // phone number there reads as a label on the way home rather than as
    // something on a wall.
    this.addBox(outerW, d.height, L.t, 0, d.height / 2, L.zBack + L.t / 2,
                this.m.wall[0], L.bay, d.height);

    // THE END WALL. Solid, unless it carries the window — in which case it is
    // four boxes around the opening instead of one, exactly the way a side wall
    // is built around a doorway. metricBoxUVs derives every face's UVs from its
    // WORLD position, so the wall texture runs on across all four pieces with
    // no seam and no restart; that is the whole reason it works that way.
    // The boxes' inner end faces are the reveals.
    const zc = L.zEnd - L.t / 2;
    if (!L.win) {
      this.addBox(outerW, d.height, L.t, 0, d.height / 2, zc,
                  this.m.endWall, L.bay, d.height);
      return;
    }
    const w = L.win;
    const piece = (x0, x1, y0, y1) => {
      if (x1 - x0 < 0.004 || y1 - y0 < 0.004) return;
      this.addBox(x1 - x0, y1 - y0, L.t, (x0 + x1) / 2, (y0 + y1) / 2, zc,
                  this.m.endWall, L.bay, d.height);
    };
    piece(-outerW / 2, outerW / 2, 0, w.y0);              // below the sill
    piece(-outerW / 2, outerW / 2, w.y1, d.height);       // above the head
    piece(-outerW / 2, w.x0, w.y0, w.y1);                 // left of the opening
    piece(w.x1, outerW / 2, w.y0, w.y1);                  // right of it
    this.buildWindowTrim(L, w);
    this.buildGrille(L, w);
  },

  // ---------------------------------------------------------------
  // THE GRILLE: a welded frame and lattice of square bar across the opening,
  // built as ONE merged geometry — one draw call for about forty bars.
  //
  // Every bar's u comes from its world position along its own length, so the
  // iron texture runs continuously through a bar and each bar starts at a
  // different phase of it: no two are rusted the same way, at no cost.
  // ---------------------------------------------------------------
  buildGrille: function (L, w) {
    const d = this.data;
    const b = d.grilleBar;
    const f = d.grilleFrame;
    const tile = d.grilleTile;
    const parts = [];
    // The bars' near faces all sit at the same depth, inside the reveal.
    const zNear = L.zEnd - d.grilleInset;

    // One bar. `alongY` picks which axis is its length, and with it which way
    // the texture runs: u along the bar, v across its section.
    const bar = (cx, cy, sx, sy, sz, alongY) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      const pos = g.attributes.position;
      const uvs = g.attributes.uv;
      const cz = zNear - sz / 2;
      for (let i = 0; i < pos.count; i++) {
        const face = Math.floor(i / 4); // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
        const lx = pos.getX(i);
        const ly = pos.getY(i);
        const lz = pos.getZ(i);
        let u;
        let v;
        if (alongY) {
          u = (cy + ly) / tile;
          v = face === 4 || face === 5 ? lx / sx + 0.5 : lz / sz + 0.5;
        } else {
          u = (cx + lx) / tile;
          v = face === 4 || face === 5 ? ly / sy + 0.5 : lz / sz + 0.5;
        }
        uvs.setXY(i, u, v);
      }
      g.translate(cx, cy, cz);
      parts.push(g);
    };

    // FRAME: four flat bars just inside the opening's edges.
    bar(w.x0 + f / 2, (w.y0 + w.y1) / 2, f, w.h, f, true);
    bar(w.x1 - f / 2, (w.y0 + w.y1) / 2, f, w.h, f, true);
    bar(w.x, w.y0 + f / 2, w.w, f, f, false);
    bar(w.x, w.y1 - f / 2, w.w, f, f, false);

    // LATTICE, spaced evenly INSIDE the frame so the pattern is symmetric in
    // the opening rather than starting from one edge and leaving a runt gap at
    // the other.
    const ix0 = w.x0 + f;
    const ix1 = w.x1 - f;
    const iy0 = w.y0 + f;
    const iy1 = w.y1 - f;
    const spanX = ix1 - ix0;
    const spanY = iy1 - iy0;
    const nx = Math.max(0, Math.round(spanX / d.grilleSpacingX) - 1);
    const ny = Math.max(0, Math.round(spanY / d.grilleSpacingY) - 1);
    for (let k = 1; k <= nx; k++) {
      bar(ix0 + (spanX * k) / (nx + 1), (w.y0 + w.y1) / 2, b, w.h - f, b, true);
    }
    for (let k = 1; k <= ny; k++) {
      bar(w.x, iy0 + (spanY * k) / (ny + 1), w.w - f, b, b, false);
    }

    const geo = mergeGeometries(parts);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.m.grille);
    this.group.add(mesh);
    this.grilleBars = { nx: nx, ny: ny, total: parts.length };
  },

  // The sill, and optionally a painted reveal.
  buildWindowTrim: function (L, w) {
    const d = this.data;
    // CONCRETE SILL: a slab capping the wall below the opening, standing proud
    // of the inner face so it catches the light and throws a line of shadow.
    const SILL_T = 0.06;
    const SILL_D = 0.12;
    const SILL_PROUD = 0.05;
    const sillZ = L.zEnd + SILL_PROUD - SILL_D / 2;
    this.addBox(w.w + 0.1, SILL_T, SILL_D, w.x, w.y0 - SILL_T / 2, sillZ,
                this.m.sill);
    // ...and a thinner, darker lip under its front edge: two tones for the
    // price of one small box, which is all flat shading needs to read a slab.
    this.addBox(w.w + 0.1, 0.015, SILL_D * 0.55, w.x,
                w.y0 - SILL_T - 0.0075,
                L.zEnd + SILL_PROUD - SILL_D * 0.55 / 2, this.m.sillLip);

    // PAINTED REVEALS, only when asked for: four thin planes on the opening's
    // four inner faces. Off by default, when the reveals are simply the wall
    // texture continuing into the opening, which is what a knocked-through
    // hole in a painted wall actually looks like.
    if (!d.windowRevealColor) return;
    const zMid = L.zEnd - L.t / 2;
    const inset = 0.002;
    const mk = (sw, sh, x, y, rx, ry) => {
      const m = this.addPlane(sw, sh, this.m.reveal);
      m.position.set(x, y, zMid);
      m.rotation.set(rx, ry, 0);
    };
    mk(L.t, w.h, w.x0 + inset, (w.y0 + w.y1) / 2, 0, Math.PI / 2);   // left
    mk(L.t, w.h, w.x1 - inset, (w.y0 + w.y1) / 2, 0, -Math.PI / 2);  // right
    mk(w.w, L.t, w.x, w.y1 - inset, Math.PI / 2, 0);                 // head
    mk(w.w, L.t, w.x, w.y0 + inset, -Math.PI / 2, 0);                // bottom
  },

  // One side wall: the full run minus each opening, a lintel over every
  // opening, and — for the closed doors — a leaf, a louvred transom and a
  // frame. Same construction as floorplan.buildSide, for the same reason: the
  // segments' end faces ARE the doorway reveals, so a doorway is a real hole in
  // a wall with thickness rather than a decal.
  buildSideWall: function (L, side) {
    const d = this.data;
    const list = L.openings[String(side)];
    const wallX = side * (L.halfW + L.t / 2); // wall centreline
    let cursor = L.zHi;

    const seg = (a, b, y0, y1, variant) => {
      const len = Math.abs(b - a);
      if (len < 0.005 || y1 - y0 < 0.005) return;
      this.addBox(L.t, y1 - y0, len, wallX, (y0 + y1) / 2, (a + b) / 2,
                  this.m.wall[variant], L.bay, d.height);
    };

    // Variants rotate along the run (offset by the side, so the two walls are
    // never in step) — 16 m of corridor with no repeat you can read. The one
    // exception: a segment that touches an APARTMENT doorway is always variant
    // 0, the calm one, which is also the only variant that carries no painted
    // ad. The pictures are the point there and nothing should compete with
    // them, and forcing the variant is how that is guaranteed without a fourth
    // canvas.
    const rot = (i) => (i + (side < 0 ? 0 : 2)) % 3;
    list.forEach((op, i) => {
      const prev = i > 0 ? list[i - 1] : null;
      const byRoom = op.open || (prev && prev.open);
      seg(cursor, op.z + op.width / 2, 0, d.height, byRoom ? 0 : rot(i));
      // The lintel: the wall carries on above the opening.
      seg(op.z + op.width / 2, op.z - op.width / 2, op.top, d.height,
          op.open ? 0 : rot(i + 1));
      cursor = op.z - op.width / 2;
      this.buildDoorFrame(L, side, op);
      if (!op.open) this.buildClosedDoor(L, side, op, i);
    });
    const lastOpen = list.length > 0 && list[list.length - 1].open;
    seg(cursor, L.zLo, 0, d.height, lastOpen ? 0 : rot(list.length));
  },

  // The painted timber frame standing proud of the wall's inner face: two jambs
  // and a head, around every opening (closed door or apartment doorway).
  buildDoorFrame: function (L, side, op) {
    const d = this.data;
    const fx = side * (L.halfW - d.frameDepth / 2); // sits ON the inner face
    const jambH = op.top + d.frameWidth;
    [-1, 1].forEach((s) => {
      this.addBox(d.frameDepth, jambH, d.frameWidth, fx, jambH / 2,
                  op.z + s * (op.width / 2 + d.frameWidth / 2), this.m.frame);
    });
    this.addBox(d.frameDepth, d.frameWidth, op.width + d.frameWidth * 2, fx,
                op.top + d.frameWidth / 2, op.z, this.m.frame);
  },

  // A closed door: a thin leaf set INTO the wall's opening (the opening is
  // real — the wall segments stop either side of it), the door picture on its
  // corridor face, and the louvred transom filling the rest of the opening.
  buildClosedDoor: function (L, side, op, i) {
    const d = this.data;
    const cx = side * (L.halfW + L.t / 2);
    // The leaf itself: plain dark timber on its edges, the atlas on its face.
    this.addBox(d.leafThickness, d.doorHeight, op.width, cx, d.doorHeight / 2,
                op.z, this.m.doorEdge);

    // Which of the four doors in the atlas this one is. Seeded by position, so
    // the same corridor always has the same doors, and neighbours differ.
    const pick = Math.abs(Math.round(op.z * 7 + (side + 1) * 3 + this.data.seed)) % 4;
    const u0 = (pick % 2) * 0.5;
    const v0 = 1 - (Math.floor(pick / 2) + 1) * 0.5;
    const faceX = side * (L.halfW + L.t / 2 - d.leafThickness / 2 - 0.004);
    const face = this.addPlane(op.width, d.doorHeight, this.m.door,
                               [u0, v0, u0 + 0.5, v0 + 0.5]);
    face.position.set(faceX, d.doorHeight / 2, op.z);
    face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

    // TRANSOM: the louvre above the leaf, tiled metrically along the width.
    const tr = this.addPlane(op.width, d.transomHeight, this.m.transom,
                             [0, 0, op.width / d.transomHeight, 1]);
    tr.position.set(faceX, d.doorHeight + d.transomHeight / 2, op.z);
    tr.rotation.y = face.rotation.y;
  },

  // ---------------------------------------------------------------
  // ONE APARTMENT: a single room hanging off the corridor through an open
  // doorway, with three of the nine images on its three own walls.
  //
  // Frame (all root-local): `side` is -1 for the left-hand wall, +1 for the
  // right. `xNear` is the corridor wall's OUTER face — where the apartment
  // starts — and the room runs roomDepth further out to `xFar`; along the
  // corridor it spans roomWidth centred on its doorway.
  //
  // Its fourth wall is the corridor's own side wall, already built: that is
  // what "three walls + the corridor wall it shares" means, and it is why the
  // doorway needs no extra reveal geometry. Two apartments on the same wall
  // land exactly one wall thickness apart (see layout()'s auto spacing), so
  // they share a PARTY WALL — built once, by whichever room asks first.
  // ---------------------------------------------------------------
  buildRoom: function (L, r) {
    const d = this.data;
    const t = L.t;
    // This apartment's own size — every apartment has its own now (roomSizes).
    const rw = r.w; // along the corridor
    const rd = r.d; // away from it
    const xNear = r.side * (L.halfW + t); // the room's face of the corridor wall
    const xFar = xNear + r.side * rd; // its back wall's inner face
    const xMid = (xNear + xFar) / 2;
    const zNear = r.z - rw / 2; // -z wall inner face
    const zFar = r.z + rw / 2; // +z wall inner face
    // An apartment uses ONE variant, and it is 0 ("plain"): no painted ads on
    // a wall a picture hangs on, and no ochre stripe — the stripe is a fine
    // thing once along a 16 m corridor and far too much four times over in a
    // 3.2 m room. The apartments differ from each other by COLOUR now, which
    // is a stronger difference than a variant ever was. One variant also means
    // giving a room its own scheme costs one canvas, not three.
    const variant = 0;
    // An apartment is weathered by roomWallFlake whether or not it carries its
    // own colours — a room somebody lives in has been painted more recently
    // than the corridor either way.
    const roomPal = r.wallPaletteOverride
      ? this.wallPalette(r.wallPaletteOverride)
      : this.corridorPal;
    const wallMat = this.wallMaterial(roomPal, variant, this.roomWopts);

    // FLOOR + CEILING. Both reach back to the corridor's own inner face rather
    // than stopping at the room side of the wall, so the doorway threshold is
    // floored (and lidded) instead of showing a wallThickness-wide slot of
    // nothing; the overlap is buried inside the wall, and the two floors abut
    // exactly at the corridor face with no overlap to z-fight.
    const spanX = rd + t;
    const xPlate = r.side * (L.halfW + spanX / 2);
    // Where the room's own side walls start and stop (see the note on them
    // below): from the corridor wall's centreline out to the back wall's outer
    // face, so both ends are buried and neither shows on a surface you can see.
    const sideStartX = L.halfW + t / 2;
    const sideLen = L.halfW + t + rd + t - sideStartX;
    const tile = d.roomTile * 4; // the gạch bông canvas is a 4×4 tile block
    const floor = this.addPlane(spanX, rw, this.m.roomFloor,
                                [0, 0, spanX / tile, rw / tile]);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(xPlate, 0, r.z);
    const ceil = this.addPlane(spanX, rw, this.m.ceiling,
                               [0, 0, spanX / L.bay, rw / L.bay]);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(xPlate, d.height, r.z);

    // Is either side of this apartment a PARTY WALL — a plane with another
    // apartment on the far side of it? Both the back wall and the side walls
    // need to know, so work it out once.
    const sharedAt = [zNear - t / 2, zFar + t / 2].map((zc) =>
      L.rooms.some(
        (o) =>
          o !== r &&
          o.side === r.side &&
          (Math.abs(o.z - o.w / 2 - t / 2 - zc) < 1e-4 ||
            Math.abs(o.z + o.w / 2 + t / 2 - zc) < 1e-4)
      )
    );

    // BACK WALL (the one facing you as you walk in). It runs past its own side
    // walls so the corners close by overlap — the floorplan's trick — but only
    // as far as each side wall's OUTER face: a full thickness on a wall this
    // room owns, and half a thickness where the wall is a party leaf shared
    // with the neighbour.
    //
    // That distinction only started to matter when the apartments got
    // different depths. A back wall that overshot a party wall by the full
    // thickness used to end up buried in the neighbour's identical back wall;
    // with a shallower neighbour it instead pokes through the party wall into
    // the DEEPER room and shows its end face there, as a stripe in the
    // neighbour's colour.
    // On a shared side the overlap is a QUARTER thickness, which lands the back
    // wall's end inside this room's own half-thickness party leaf. Half a
    // thickness would put that end face exactly coplanar with the NEIGHBOUR's
    // leaf and the two would z-fight — a stripe of the neighbour's colour up
    // the corner of this room, which is precisely what it did.
    const backExt = sharedAt.map((sh) => (sh ? t / 4 : t));
    const backZ0 = zNear - backExt[0];
    const backZ1 = zFar + backExt[1];
    this.addBox(t, d.height, backZ1 - backZ0, xFar + r.side * t / 2,
                d.height / 2, (backZ0 + backZ1) / 2, wallMat, L.bay, d.height);

    // The TWO SIDE WALLS. Each runs from inside the corridor wall out past the
    // back wall — but only HALF WAY into it, never through it.
    //
    // A room wall must not reach the corridor wall's INNER face. That face is
    // the corridor's own surface, so a room wall ending flush with it shows its
    // end there, as a stripe the thickness of the wall. While everything was
    // painted alike that was invisible; the moment the apartments got their own
    // schemes it became a yellow and a red band on the corridor's blue wall,
    // side by side where two apartments share a party wall. Starting at the
    // corridor wall's CENTRELINE instead leaves half a thickness of corridor in
    // front of every room wall's end, and is still deep enough that no corner
    // can open a gap.
    //
    // A PARTY WALL — one plane with an apartment on either side of it — is
    // built as TWO half-thickness leaves rather than one box, so each
    // apartment paints its own face. That matters now the rooms have their own
    // schemes: with a single shared box, whichever room happened to build
    // first would put its colour on the other room's wall.
    //
    // The two apartments sharing it can now be DIFFERENT DEPTHS. Each leaf runs
    // its own room's depth, so over the shallower room they form a full wall
    // between the two, and past its back wall the deeper room's leaf carries on
    // alone — closing that room, with nothing but exterior on its other side.
    // That is why the leaf's length comes from `rd` and not from a shared
    // figure.
    [zNear - t / 2, zFar + t / 2].forEach((zc, i) => {
      const inward = i === 0 ? 1 : -1; // toward THIS room's interior
      const shared = sharedAt[i];
      const th = shared ? t / 2 : t;
      const zcc = shared ? zc + (inward * t) / 4 : zc;
      const key = r.side + "@" + zcc.toFixed(4);
      if (this.partyWalls[key]) return;
      this.partyWalls[key] = true;
      this.addBox(sideLen, d.height, th,
                  r.side * (sideStartX + sideLen / 2), d.height / 2, zcc,
                  wallMat, L.bay, d.height);
    });

    // THE FOURTH WALL is the corridor's own, and the corridor is painted on
    // both of its faces. A tenant paints their side — so when a room carries
    // its own scheme, skin the room-facing face in it: three thin panels around
    // the doorway, a few millimetres proud so they never z-fight the wall they
    // cover. Without this you walk into a yellow room whose fourth wall is
    // still corridor blue.
    this.lineCorridorWall(L, r, wallMat);

    // TUBES, on the corridor's own rule: fittings spread along the room at
    // roughly tubeSpacing, each laid ACROSS that run. A room is lit along its
    // depth, so a 6 m-deep apartment gets two rather than being lit by one
    // fitting in the middle, and the tube's length follows the room's width so
    // a wide apartment gets a long one.
    const roomBays = Math.max(1, Math.round(rd / d.tubeSpacing));
    const roomTubeLen = d.tubeLength > 0 ? d.tubeLength : rw * 0.6;
    for (let k = 0; k < roomBays; k++) {
      const tube = this.addPlane(roomTubeLen, d.tubeWidth, this.m.tube);
      tube.rotation.x = Math.PI / 2;
      // spread evenly along the depth, measured from the corridor wall out
      tube.position.set(
        xNear + r.side * ((k + 0.5) / roomBays) * rd,
        d.height - d.tubeDrop,
        r.z
      );
    }

    this.buildOpenDoor(L, r);
    this.hangImages(L, r, xMid, xFar, zNear, zFar);
  },

  // The room-facing skin of the corridor wall: the wall either side of the
  // doorway, and the strip above it. Planes, not boxes — they only re-face
  // something solid that is already there. UVs are metric and world-derived,
  // exactly like the wall boxes, so the paint runs continuously across the
  // join with the room's side walls.
  lineCorridorWall: function (L, r, mat) {
    const d = this.data;
    const x = r.side * (L.halfW + L.t + 0.005);
    const rotY = (r.side * Math.PI) / 2; // normal points into the room
    const zA = r.z - r.w / 2;
    const zB = r.z + r.w / 2;
    const dz0 = r.z - d.doorWidth / 2;
    const dz1 = r.z + d.doorWidth / 2;
    const H = d.height;
    const panel = (z0, z1, y0, y1) => {
      const w = z1 - z0;
      const h = y1 - y0;
      if (w < 0.005 || h < 0.005) return;
      const u0 = z0 / L.bay;
      const u1 = z1 / L.bay;
      const v0 = y0 / H;
      const v1 = y1 / H;
      // After the yaw, the plane's local +x runs toward +z on the left-hand
      // wall and toward -z on the right-hand one, so the u pair swaps.
      const m = this.addPlane(w, h, mat,
        r.side < 0 ? [u0, v0, u1, v1] : [u1, v0, u0, v1]);
      m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
      m.rotation.y = rotY;
    };
    panel(zA, dz0, 0, H);
    panel(dz1, zB, 0, H);
    panel(dz0, dz1, d.doorHeight, H);
  },

  // The apartment's own door, standing open into the room: the same leaf and
  // the same texture as a closed one, hinged on the +z jamb of its frame and
  // swung doorOpenAngle inward. Built under a pivot object so the hinge is a
  // real hinge — the leaf's edge stays on the frame at any angle.
  buildOpenDoor: function (L, r) {
    const d = this.data;
    const pivot = new THREE.Object3D();
    pivot.position.set(r.side * (L.halfW + L.t / 2), 0,
                       r.z + d.doorWidth / 2 + d.frameWidth / 2);
    // Swing INTO the room: -x for a left-hand apartment, +x for a right-hand
    // one, which is a positive yaw on the left and a negative one on the right.
    pivot.rotation.y = THREE.MathUtils.degToRad(-r.side * d.doorOpenAngle);
    this.group.add(pivot);

    const geo = new THREE.BoxGeometry(d.leafThickness, d.doorHeight, d.doorWidth);
    this.geometries.push(geo);
    const leaf = new THREE.Mesh(geo, this.m.doorEdge);
    leaf.position.set(0, d.doorHeight / 2, -d.doorWidth / 2);
    pivot.add(leaf);

    // The door's face. Its atlas cell is picked the same way a closed door's
    // is, so the apartments' doors belong to the same set of four.
    const pick = Math.abs(Math.round(r.z * 7 + (r.side + 1) * 3 + d.seed)) % 4;
    const u0 = (pick % 2) * 0.5;
    const v0 = 1 - (Math.floor(pick / 2) + 1) * 0.5;
    const fgeo = new THREE.PlaneGeometry(d.doorWidth, d.doorHeight);
    setPlaneUVs(fgeo, u0, v0, u0 + 0.5, v0 + 0.5);
    this.geometries.push(fgeo);
    const face = new THREE.Mesh(fgeo, this.m.door);
    face.position.set(-r.side * (d.leafThickness / 2 + 0.004), d.doorHeight / 2,
                      -d.doorWidth / 2);
    face.rotation.y = r.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    pivot.add(face);
  },

  // THE PICTURES. Three per apartment, on its LEFT, BACK and RIGHT walls as you
  // walk in, centred on each wall at IMG_Y with IMG_SIZE — the shared Zone A
  // image config in js/components.js, the same numbers the ring used.
  //
  // Each is an <a-image class="clickable" image-hover focus-on-click>, which is
  // exactly what ring-layout built, so hover, click, the desktop overlay, the
  // VR focus view, the captions and the spoken memories all work here with no
  // change to any of them.
  //
  // They stand `imageProud` off the wall. image-hover puts its hover frame at
  // the image's local z -0.01, i.e. still (imageProud - 0.01) clear of the wall
  // — no z-fighting, with the default 0.02 leaving a centimetre of margin.
  hangImages: function (L, r, xMid, xFar, zNear, zFar) {
    const d = this.data;
    const ids = roomImages[r.index] || [];
    // Walking in, your LEFT is +z in a left-hand apartment and -z in a
    // right-hand one; your RIGHT is the opposite wall; the BACK wall faces back
    // toward the corridor.
    const leftSign = -r.side;
    const walls = [
      // left wall
      { x: xMid, z: r.z + leftSign * (r.w / 2 - d.imageProud),
        rotY: leftSign > 0 ? 180 : 0 },
      // back wall — its face looks back toward the corridor
      { x: xFar - r.side * d.imageProud, z: r.z, rotY: -90 * r.side },
      // right wall
      { x: xMid, z: r.z - leftSign * (r.w / 2 - d.imageProud),
        rotY: leftSign > 0 ? 0 : 180 },
    ];
    walls.forEach((w, i) => {
      if (!ids[i]) return;
      const img = document.createElement("a-image");
      img.setAttribute("src", ids[i]); // by asset id, never a path
      img.setAttribute("position", w.x + " " + IMG_Y + " " + w.z);
      img.setAttribute("rotation", "0 " + w.rotY + " 0");
      img.setAttribute("width", IMG_SIZE);
      img.setAttribute("height", IMG_SIZE);
      img.setAttribute("class", "clickable");
      img.setAttribute("image-hover", "");
      img.setAttribute("focus-on-click", "");
      this.el.appendChild(img);
      this.imageEls.push(img);
    });
  },

  // The tubes: one bright unlit quad just under the ceiling in the middle of
  // every bay, lying across the corridor. They are the corridor's only visible
  // light source — the light itself is baked into the textures around them.
  buildTubes: function (L) {
    const d = this.data;
    for (let k = 0; k < L.bays; k++) {
      const z = L.zBack - (k + 0.5) * L.bay;
      const tube = this.addPlane(L.tubeLength, d.tubeWidth, this.m.tube);
      tube.rotation.x = Math.PI / 2; // face down
      tube.position.set(0, d.height - d.tubeDrop, z);
    }
  },

  teardown: function () {
    if (this.group) this.el.removeObject3D("corridor");
    this.group = null;
    this.geometries.forEach(function (g) {
      g.dispose();
    });
    this.materials.forEach(function (m) {
      m.dispose();
    });
    this.geometries = [];
    this.materials = [];
    this.imageEls.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    this.imageEls = [];
    this.built = false;
  },

  remove: function () {
    if (this.onSceneLoaded) {
      this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
    }
    this.el.sceneEl.removeEventListener("loaded", this.onLoaded);
    if (window.RigRegions) {
      window.RigRegions.removeRegionSource(this.regionSourceId);
    }
    this.teardown();
  },
});

// ----------------------------------------------------------------
// zone-a-teleport — the manager for the Zone A ⇄ corridor booth pair.
//
// A second, smaller sibling of zone-b-teleport (js/zone-b-teleport.js), NOT a
// refactor of it: that manager is wired to the floor map's four edge terminals
// and its own arrival grammar, and forking its structure is cheaper than
// generalising it. What IS shared is every building block — the presentational
// `teleport-terminal`, TeleportRig.go, the camera's `transition-glitch`, and
// rig-collision's setActive/resync — so the two jumps feel identical.
//
// Owns no copied coordinates: the outbound booth's spot is the Zone A room's
// CENTRE, read live from the floorplan's own config (the same way
// zone-b-teleport reads the Zone B room centre), plus a tunable offset.
//
// Placements — all derived, none copied:
//   Outbound booth  the CENTRE of the Zone A room (read live from the
//                   floorplan) + boothOffset, screen facing +z.
//   Return booth    root-local on the corridor's landing, returnBoothInset in
//                   front of its back wall, screen facing -z so you read it
//                   when you turn around, or when you walk back up the run.
//                   A child of #zone-a-corridor, so it hides and relocates
//                   with the corridor; re-placed on zoneacorridorbuilt and
//                   zoneacorridorrootchanged.
//   Corridor spawn  root-local (0, 0, landingDepth/2) + arrivalOffset, facing
//                   -z straight down the corridor.
//   Return spawn    returnSpawnOffset from the booth, yawed to face it
//                   (TeleportRig.yawToward, so any offset still faces it).
//
// Sequence per jump, identical in shape to zone-b-teleport's: trigger the
// glitch -> AT PEAK move the rig (TeleportRig.go, so the VISITOR and not the
// rig origin lands on the target, playspace and head-yaw compensated), flip the
// corridor's `shown`, resync the collider and set or clear the VR focus
// override -> the glitch resolves. `busy` plus transition-glitch's own
// active-guard block a re-trigger mid-flight.
//
// The collider is NOT deactivated on arrival, which is where this differs from
// the map jump: the corridor registers its own walkable rectangles with
// rig-collision (see corridor-root's region source), so the corridor is inside
// the walkable union and the clamp should stay ON to give the corridor its
// walls. All the jump has to do is resync() so last-valid is the landing.
//
// TUNABLES (setAttribute on #zone-a-teleport):
//   boothOffset       the outbound booth's offset from the Zone A room centre
//   arrivalOffset     nudge on the corridor landing spawn (root-local)
//   returnSpawnOffset where you land back in the Zone A room, from the booth
//   returnBoothInset  the return booth's clearance off the landing's back wall
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-a-teleport", {
  schema: {
    boothOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    arrivalOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    returnSpawnOffset: { type: "vec3", default: { x: 0, y: 0, z: 1.8 } },
    returnBoothInset: { type: "number", default: 0.3 },
  },

  init: function () {
    this.busy = false;
    this.corridorSpawn = new THREE.Vector3();
    this.returnSpawn = new THREE.Vector3();
    this.boothPos = new THREE.Vector3();

    this.booth = this.el.querySelector("#terminal-a2");
    this.floorplanEl = document.getElementById("floorplan");
    this.corridorEl = document.getElementById("zone-a-corridor");
    this.returnBooth = document.getElementById("terminal-a2-return");
    this.cameraEl = document.getElementById("camera");

    this.onOut = () => this.jump(true);
    this.onBack = () => this.jump(false);
    if (this.booth) this.booth.addEventListener("click", this.onOut);
    if (this.returnBooth) this.returnBooth.addEventListener("click", this.onBack);

    // The floorplan can rebuild (any tunable change rebuilds the whole plan),
    // and the room centre is derived from it — so re-derive when it does. The
    // corridor likewise re-emits when it is rebuilt or moved.
    this.onFloorplanBuilt = () => this.layout();
    if (this.floorplanEl) {
      this.floorplanEl.addEventListener("floorplanbuilt", this.onFloorplanBuilt);
    }
    this.onCorridorChange = () => this.layout();
    if (this.corridorEl) {
      this.corridorEl.addEventListener("zoneacorridorbuilt", this.onCorridorChange);
      this.corridorEl.addEventListener("zoneacorridorrootchanged", this.onCorridorChange);
    }

    // Label first: it does not depend on anything else having initialised, and
    // it must not be skipped if the corridor is not ready yet.
    this.labelBooth();
    this.layout();
  },

  update: function (oldData) {
    if (Object.keys(oldData).length === 0) return; // first update: init did it
    this.layout();
  },

  // The booth's screen carries the WORK's title, read from the single source of
  // truth (js/zone-texts.js) rather than duplicated into the HTML — the same
  // string the Zone A info terminal shows. teleport-terminal's own update()
  // repaints its screen canvas when the label lands (this manager's init runs
  // after its children's, so the terminal has already drawn once by now).
  labelBooth: function () {
    const entry = (window.ZoneTexts && window.ZoneTexts.a) || {};
    if (!this.booth || !entry.title) {
      console.warn("zone-a-teleport: no ZoneTexts.a title for the booth screen");
      return;
    }
    this.booth.setAttribute("teleport-terminal", "label", entry.title);
  },

  // The Zone A room's centre in WORLD coords, read live from the floorplan (the
  // room the booth stands in). #floorplan parses before this component, so its
  // config is readable here; falls back to the zone root's offset if not.
  zoneACenter: function () {
    const attr = this.floorplanEl && this.floorplanEl.getAttribute("floorplan");
    const r = attr && attr.rooms && attr.rooms.zoneA;
    if (r) return { x: r.cx, z: r.cz };
    console.warn("zone-a-teleport: no floorplan zoneA; FALLBACK to zone-a-root");
    const rootEl = document.getElementById("zone-a");
    const rootAttr = rootEl && rootEl.getAttribute("zone-a-root");
    const base = (rootAttr && rootAttr.offset) || { x: 0, y: 0, z: -12.5 };
    return { x: base.x, z: base.z };
  },

  layout: function () {
    if (!this.booth) return;
    const d = this.data;
    const c = this.zoneACenter();
    // Floor level, at the room centre + the tunable nudge. Yaw 0 leaves the
    // screen facing +z — back toward the doorway from the foyer, so you read it
    // as you walk in.
    const bx = c.x + d.boothOffset.x;
    const by = 0 + d.boothOffset.y;
    const bz = c.z + d.boothOffset.z;
    this.booth.setAttribute("position", { x: bx, y: by, z: bz });
    this.booth.setAttribute("rotation", "0 0 0");
    this.boothPos.set(bx, by, bz);

    // Where a return jump lands: beside the booth, looking at it — the same
    // grammar as coming back from the floor map.
    this.returnSpawn.set(
      bx + d.returnSpawnOffset.x,
      by + d.returnSpawnOffset.y,
      bz + d.returnSpawnOffset.z
    );

    // --- the corridor side ---
    const cr = this.corridorConfig();
    if (!cr) return;
    // The corridor root carries no rotation, so root-local offsets are simply
    // added to its world position.
    this.corridorSpawn.set(
      cr.offset.x + d.arrivalOffset.x,
      cr.offset.y + d.arrivalOffset.y,
      cr.offset.z + cr.landingDepth / 2 + d.arrivalOffset.z
    );
    if (this.returnBooth) {
      // Root-LOCAL (it is a child of the corridor): on the landing, clear of
      // the back wall, screen facing -z back down the corridor.
      this.returnBooth.setAttribute("position", {
        x: 0,
        y: 0,
        z: cr.landingDepth - this.data.returnBoothInset,
      });
      this.returnBooth.setAttribute("rotation", "0 180 0");
    }
  },

  // The corridor's live schema (never a copy of its numbers).
  //
  // NOT ready until corridor-root has initialised: until then getAttribute
  // hands back the RAW HTML attribute — a string, whose .offset is undefined —
  // and #rig is the last entity in the scene, so this manager can easily run
  // first. That is not an error worth warning about: the corridor emits
  // `zoneacorridorbuilt` the moment it is ready and we lay out again then. Only
  // a MISSING corridor is a real problem.
  corridorConfig: function () {
    if (!this.corridorEl) {
      console.warn("zone-a-teleport: no #zone-a-corridor; the booth goes nowhere");
      return null;
    }
    const attr = this.corridorEl.getAttribute("corridor-root");
    if (!attr || typeof attr !== "object" || !attr.offset) return null;
    return attr;
  },

  // One glitch-masked jump. `out` true = into the corridor, false = home.
  // Everything happens at PEAK obscuration, so the cut is never seen.
  jump: function (out) {
    if (this.busy) return;
    const cr = this.corridorConfig();
    if (!cr) return;
    const glitch =
      this.cameraEl &&
      this.cameraEl.components &&
      this.cameraEl.components["transition-glitch"];

    const cut = () => {
      if (out) {
        // Face -z, straight down the run: in the corridor's own frame that is
        // A-Frame's zero yaw, which is why this needs no derived angle.
        TeleportRig.go(this.corridorSpawn, 0);
      } else {
        TeleportRig.go(
          this.returnSpawn,
          TeleportRig.yawToward(this.returnSpawn, this.boothPos)
        );
      }
      this.corridorEl.setAttribute("corridor-root", "shown", out);

      // The clamp STAYS ON both ways round (unlike the map jump): the corridor
      // registers its own walkable rectangles with rig-collision, so it is
      // inside the walkable union and the clamp is what gives it walls. The
      // 400 m jump itself trips rig-collision's teleport safety net, which
      // suspends the clamp for exactly as long as it takes the visitor to be
      // inside a registered rect again — resync() lands last-valid on the
      // arrival spot so there is no snap-back either way.
      const rigEl = document.getElementById("rig");
      const collider = rigEl && rigEl.components && rigEl.components["rig-collision"];
      if (collider) {
        collider.setActive(true);
        collider.resync();
      }

      // The VR focus view is sized for the open gallery; inside a 3.2 × 4 m
      // apartment it needs to sit closer, with a tighter dim sphere. Set the
      // override on arrival, clear it on the way home (js/focus-vr.js reads it
      // at open time; the desktop overlay is untouched either way).
      window.ZoneA = window.ZoneA || {};
      if (out) {
        window.ZoneA.focusVR = {
          distance: cr.focusDistance,
          dimRadius: cr.focusDimRadius,
        };
      } else {
        delete window.ZoneA.focusVR;
      }
    };

    if (!glitch) {
      console.warn("zone-a-teleport: no transition-glitch on camera; hard cut");
      cut();
      return;
    }
    this.busy = true;
    // trigger() returns false if a transition is ALREADY in flight, in which
    // case its onDone never fires — so clear the guard here rather than
    // leaving this booth stuck busy for the rest of the session. (There are
    // two teleport managers now, sharing the one glitch on the camera.)
    if (!glitch.trigger(cut, () => { this.busy = false; })) this.busy = false;
  },

  remove: function () {
    if (this.booth) this.booth.removeEventListener("click", this.onOut);
    if (this.returnBooth) this.returnBooth.removeEventListener("click", this.onBack);
    if (this.floorplanEl) {
      this.floorplanEl.removeEventListener("floorplanbuilt", this.onFloorplanBuilt);
    }
    if (this.corridorEl) {
      this.corridorEl.removeEventListener("zoneacorridorbuilt", this.onCorridorChange);
      this.corridorEl.removeEventListener("zoneacorridorrootchanged", this.onCorridorChange);
    }
  },
});
