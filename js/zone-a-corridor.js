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
// THE PLACED STENCILS. Two painted phone numbers on the long blank runs of
// wall — the right wall between its 1st and 2nd door, the left between its 2nd
// and 3rd. They are NOT the marks wallMarks paints into the wall canvas: those
// are masked into the paint stack itself and cannot be AIMED, because that
// canvas is one bay long and tiles every 3.6 m, so a mark on it turns up in
// every bay of that variant and nowhere in particular. These are quads with
// their own canvas, so they go where somebody with a can and a card would put
// one. Both kinds share markNumber() and every rule that matters — numbers
// only, never level, never a complete number. See stencilSpots() and
// CorridorTextures.stencilDecal.
//
// THE FURNITURE. Four props stand in the run — a three-seat row of brown vinyl
// cinema chairs with a peeling black oval table in front of them on the right,
// a child's bike leaning on the left wall with a stuffed bag beside it. They
// are built by PropKit (js/props.js, loaded before this file) and added to this
// component's own group, so they ride `offset`, hide with `shown` and go in
// teardown() like everything else.
//
// WHERE THEY GO IS DERIVED, not typed: furnitureLayout() reads L.openings and
// puts the seats between the SECOND and THIRD door on the right and the bike
// between the first two closed doors on the left. Change doorPitch and the
// furniture moves with the doors. That function is PURE and
// takes no part in the build, because walkableRects() needs the same answer and
// rig-collision calls it whenever it likes — including before the corridor has
// ever been built.
//
// AND THEY ARE SOLID BY SUBTRACTION. The collider takes the UNION of walkable
// rectangles, so a prop is not something added to the world — it is a hole cut
// in the floor you are allowed to stand on. See rectMinus() and the note above
// walkableRects.
//
// They are also the only LIT things out here (MeshLambertMaterial): a small
// object with real curvature is worth handing to the gallery's global lights,
// which do reach 400 m out even though its room lamps do not. `furnitureUnlit`
// bakes that shading into vertex colours instead — see the header of props.js.
//
// EVERY DOOR IS THREE THINGS, and only one of them is a door.
//
//   THE LEAF        a painted two-leaf door from an atlas of four, picked by
//                   doorPick from where it stands. The three apartments' doors
//                   stand open, and an open leaf carries a SECOND atlas on its
//                   other side (doorAtlasBack): the same door, same colour by
//                   construction — front and back share doorPalette(i) and
//                   doorCellUV(pick) — but plainer, no number plate, a bolt at
//                   handle height, grime up the bottom third. The side you
//                   stand next to inside a flat is the back, so it is the one
//                   that had to stop being bare timber. A CLOSED door gets no
//                   back: it is buried in the wall and cannot be seen.
//   THE VENT ROW    pierced bông gió concrete blocks in the wall ABOVE the
//                   frame, on every opening, closed door and apartment doorway
//                   alike — which is how a chung cư ventilates a shut flat.
//                   A REAL hole: buildSideWall splits the lintel into a band,
//                   the row and a band with nothing behind it, and
//                   lineCorridorWall cuts the SAME hole in the skin an
//                   apartment paints on its side of that wall, from the same
//                   ventRow() answer. The piercing itself is cut out of the
//                   blocks' two faces by ALPHA rather than modelled — see the
//                   long note on CorridorTextures.ventFace, including why it
//                   is the canvas's own alpha channel and not an alphaMap.
//   THE GATE        a folding steel scissor gate (cửa kéo) standing
//                   gateTrackDepth off the wall in front of the door, with its
//                   top channel and floor rail. Stretched across the opening
//                   with a padlock, or folded into a stack against the jamb —
//                   ~gateLockedRatio of the CLOSED doors locked, decided per
//                   door from the corridor's seed; the apartments always
//                   folded, their pictures being the point. Two shared
//                   geometries and InstancedMesh put every gate in the
//                   corridor into four draw calls. See buildGateMeshes.
//
// None of the three costs what it looks like it costs: the vent blocks are two
// geometries and at most four materials for the whole run, the gates two more
// and one, and both are instanced — so a longer corridor adds blocks and gates
// without adding a single draw call.
//
// THE WINDOW. The corridor's dead end is not dead: it carries a barred window
// with Saigon behind it, so the whole run reads as an approach to that view
// rather than as a passage to three doors. Five pieces, all children of the
// corridor root — so they ride `offset` and vanish with `shown` like everything
// else — and all of them derived from the opening in layout().win:
//
//   THE OPENING   the end wall becomes four boxes around the hole instead of
//                 one, the way a side wall is already built around a doorway.
//                 metricBoxUVs takes every face's UVs from its WORLD position,
//                 so the paint runs on across all four with no seam and no
//                 restart. Plus a concrete sill standing proud of the face.
//   THE GRILLE    a welded frame and lattice of square bar, ~30 bars merged
//                 into ONE geometry and one draw call. Each bar's u comes from
//                 its own position along its length, so the iron runs
//                 continuously through it and no two bars are rusted alike.
//                 grilleLattice() says where the bars go, and the daylight
//                 patch asks the same method, so the shadows cannot drift.
//   THE SKY       one plane, sized from viewCoverage() rather than from a
//                 number: the cone of sight through BOTH faces of the opening
//                 fans out hard (nearly 80 degrees off axis from the sill), and
//                 any fixed size shows the scene background at exactly the
//                 angles someone will try. The gradient is generated in ANGULAR
//                 space so the size never stretches it.
//   THE CITY      two depth bands of silhouette panels in front of it. A band
//                 is as many panels wide as that cone actually needs, butted
//                 edge to edge, because a single panel simply ENDS out at the
//                 sides with sky where the town should be. Neighbours are never
//                 the same picture. Each panel carries a UV skirt below v = 0
//                 so looking down never finds the image's bottom edge.
//   THE DAYLIGHT  a parallelogram on the floor with the grille's shadow in it,
//                 on the exhibition's shared ContactCue material in glow mode.
//                 It LEANS with the sun; it never splays — see buildDaylight.
//
// None of it is walkable or reachable: it is all outside the wall, there is no
// floor out there, and it adds nothing to walkableRects (verified: the collider
// returns byte-identical rectangles with `window` true and false).
//
// TWO THINGS THAT WILL BITE THE NEXT PERSON, both learned the hard way and both
// written up where they happened: THREE samples an alphaMap's GREEN channel,
// which is 0 everywhere in these PNGs (CorridorTextures.silhouette); and a
// canvas texture built around a placeholder while its image loads can never be
// re-uploaded on WebGL2, because the storage is immutable at the first upload's
// size (same place — it needs a dispose()).
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
// pierced bông gió vent blocks over them, patterned gạch bông encaustic tiles
// inside the apartments — and, the thing the walls are actually about, paint.
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
// TWENTY-FOUR canvases as the corridor ships, cached by their full parameter
// key — which includes a hash of the palette — so a rebuild (or a second
// corridor) reuses them: 3 corridor wall variants, ONE wall canvas for each of
// the three apartments' own schemes, floor, ceiling, the door atlas and its
// BACKS, room floor, all textureSize²; up to three 256² bông gió block faces
// (one per pattern actually used — a corridor set to a single ventPattern
// draws a single canvas); the gates' steel and the window grille's, which are
// one recipe at two settings; two 512×160 placed wall stencils; and for the
// window, the four skyline PNGs lifted into canvases (1456×816 each, 4.5 MB,
// 18.1 MB together), the sky gradient (4×512, a rounding error) and the
// daylight patch (256²). 85 MB with mipmaps, measured — of which the walls are
// 24 MB and the skylines 18 MB, so textureSize and viewLayers are still the
// two levers if a device is short of texture memory.
//
// The FURNITURE's canvases are neither in here nor in that count: PropKit
// keeps its textures per-prop so a group's own dispose() can be exact. See the
// header of js/props.js.
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

  // THE NUMBER ITSELF: a real Vietnamese mobile, 0 + a live prefix + seven
  // seeded digits, grouped the way they are written on walls. Its own function
  // because there are two kinds of mark now — the ones painted into the wall
  // canvas and the ones placed on a named stretch of it (stencilDecal below) —
  // and the two must not disagree about what a phone number looks like.
  //
  // Nine draws from `rand`, in this order, which is what it has always taken:
  // moving it here did not shift a single existing mark.
  markNumber: function (rand) {
    const pre = this.MARK_PREFIXES[Math.floor(rand() * this.MARK_PREFIXES.length)];
    let digits = "0" + pre;
    for (let i = 0; i < 7; i++) digits += Math.floor(rand() * 10);
    const sep = rand() < 0.5 ? " " : ".";
    return {
      digits: digits,
      text: digits.slice(0, 4) + sep + digits.slice(4, 7) + sep +
            digits.slice(7),
    };
  },

  // ---- A PLACED STENCIL ---------------------------------------------------
  // The same service ad as wallMarks, but on a stretch of wall somebody CHOSE
  // rather than wherever the bay texture happened to put one.
  //
  // WHY IT IS A SEPARATE THING. wallMarks paints into the wall canvas and masks
  // itself against that composite's own coat-index map, which is what makes a
  // mark read as paint inside the paint stack rather than as a decal. It is
  // also why it cannot be AIMED: the wall canvas is one bay long and tiles down
  // the corridor, so a mark drawn on it appears every 3.6 m, in every bay of
  // that variant, and nowhere in particular. Putting a number on one named
  // stretch of wall means a quad with its own canvas.
  //
  // WHAT IT KEEPS from wallMarks, because these are the rules and not the
  // implementation: numbers only and never a trade (a wall that captions itself
  // is not what this place is); a real Vietnamese mobile from markNumber, so
  // the two kinds of mark cannot disagree about what a phone number looks like;
  // painted freehand and so never level; overspray under the ink; the two
  // uncut BRIDGES every stencil card needs to hold together; and never a
  // complete number.
  //
  // WHAT IT DOES DIFFERENTLY. It cannot mask itself to a coat map it is not
  // part of, so its weathering is subtractive: the run of digits that has to go
  // is ERASED rather than overpainted, which on a transparent quad is the same
  // picture — the wall shows through where the ad has gone — and it costs no
  // second colour. The whole number stays inside the quad rather than running
  // off the edge of a bay, because a quad's edge is not a place a number can
  // plausibly be cut off at.
  stencilDecal: function (w, h, seed, o) {
    const key = "stencilDecal|" + w + "|" + h + "|" + seed + "|" + o.red + "|" +
                o.dark + "|" + o.ink + "|" + o.tilt;
    return this.get(key, () => {
      const c = this.canvas(w, h);
      const ctx = c.getContext("2d");
      const rand = this.rand(seed * 883 + 41);
      const num = this.markNumber(rand);
      const text = num.text;

      // SIZE IT TO THE QUAD. The digits want to be as big as the wall allows,
      // so the font is fitted to the width rather than picked and hoped for.
      let dh = h * 0.42; // digit height
      let fontPx = dh / 0.72;
      const fontFor = (px) => "700 " + px.toFixed(1) + "px " + this.MARK_FONT;
      ctx.font = fontFor(fontPx);
      const fit = (w * 0.9) / ctx.measureText(text).width;
      if (fit < 1) {
        fontPx *= fit;
        dh *= fit;
        ctx.font = fontFor(fontPx);
      }
      const wpx = ctx.measureText(text).width;

      // Painted freehand off a card: never level, and always tilted enough to
      // see. Same rule and same tunable as the marks in the wall.
      const tiltDeg = o.tilt * (0.4 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1);
      const theta = (tiltDeg * Math.PI) / 180;
      // BIASED TOWARD THE RED, harder than the baked marks' 62%. A mark in
      // the wall texture is background hum and can afford to be the dark ink
      // on a blue wall; a PLACED one is on a stretch chosen because you walk
      // up to it, and navy on cerulean is a mark nobody ever sees.
      const stencil = rand() < 0.85 ? o.red : o.dark;
      // The dark ink goes on heavier here than it does in the wall texture: a
      // placed mark is seen from across the corridor rather than in passing,
      // and navy at the baked marks' 0.58 disappears into a cerulean wall.
      const alpha = Math.min(
        0.95,
        (stencil === o.red ? 0.66 + rand() * 0.22 : 0.74 + rand() * 0.18) * o.ink
      );

      ctx.save();
      ctx.translate((w - wpx * Math.cos(theta)) / 2, h * 0.5 + dh * 0.5);
      ctx.rotate(theta);
      ctx.textBaseline = "alphabetic";

      // OVERSPRAY first — a soft dark halo under the ink, which is both what a
      // card stencil actually leaves and what lets the digits hold their shape
      // against a wall this mottled.
      ctx.fillStyle = stencil;
      ctx.globalAlpha = alpha * 0.4;
      ctx.shadowColor = "rgba(40,20,14,0.85)";
      ctx.shadowBlur = Math.max(2, dh * 0.11);
      ctx.fillText(text, 0, 0);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha;
      ctx.fillText(text, 0, 0);
      ctx.globalAlpha = 1;

      // THE BRIDGES: the card the digits were cut from has to hold together,
      // so every glyph carries two thin uncut gaps across it.
      ctx.globalCompositeOperation = "destination-out";
      const barH = Math.max(1, dh * 0.055);
      [0.36, 0.68].forEach((f) => {
        ctx.fillRect(-dh, -dh * f - barH / 2, wpx + dh * 2, barH);
      });

      // NEVER A COMPLETE NUMBER. A contiguous run of at least three digits
      // goes, taken out with ragged blobs rather than a rectangle — what
      // removed it was somebody's roller, not a scalpel. Measured in the text's
      // own frame, which is why this happens inside the rotation.
      const adv = [];
      let cursor = 0;
      const digitAt = [];
      for (let i = 0; i < text.length; i++) {
        adv.push(cursor);
        digitAt.push(text[i] >= "0" && text[i] <= "9");
        cursor += ctx.measureText(text[i]).width;
      }
      const runLen = 3 + Math.floor(rand() * 3);
      const start = Math.floor(rand() * Math.max(1, text.length - runLen));
      const x0 = adv[start] - dh * 0.15;
      const x1 =
        (start + runLen < adv.length ? adv[start + runLen] : cursor) + dh * 0.15;
      const blobs = Math.max(2, Math.round((x1 - x0) / (dh * 0.55)));
      for (let i = 0; i < blobs; i++) {
        const bx = x0 + ((i + 0.5) / blobs) * (x1 - x0);
        this.blob(ctx, rand, bx, -dh * 0.45, (x1 - x0) / blobs * 0.85,
                  dh * (0.75 + rand() * 0.25), 8);
      }
      ctx.restore();

      // EROSION over the whole ad: the wall has been shedding since it was
      // painted, and the pigment goes with it.
      ctx.globalCompositeOperation = "destination-out";
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = "rgba(0,0,0," + (0.25 + rand() * 0.75).toFixed(3) + ")";
        this.blob(ctx, rand, rand() * w, rand() * h, h * (0.02 + rand() * 0.11),
                  h * (0.02 + rand() * 0.09), 7);
      }
      // ...and a general thinning from one end, so no mark is evenly faded.
      const g = ctx.createLinearGradient(rand() < 0.5 ? 0 : w, 0,
                                         rand() < 0.5 ? w : 0, h);
      g.addColorStop(0, "rgba(0,0,0,0.45)");
      g.addColorStop(0.55, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      return c;
    });
  },

  // ONE stencilled phone number.
  oneNumberMark: function (ctx, C) {
    const S = C.S;
    const rand = C.rand;
    const pal = C.pal;

    // --- the number, and how it is written on the wall
    const text = this.markNumber(rand).text;

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
  //
  // There are TWO atlases, front (doorAtlas) and back (doorAtlasBack), and cell
  // i of one is the same door as cell i of the other: the colour comes from
  // doorPalette(i) and the seed from doorRand(seed, i, salt) in both, so a
  // door's two faces cannot disagree about what colour it was painted. The
  // back stream takes a different salt so its wear is its own and not a mirror
  // of the front's.
  DOOR_PALETTES: [
    { face: "#d8c78a", wear: "#b09a5a", edge: "#8e7a41" },
    { face: "#cfbc7e", wear: "#a89152", edge: "#87733c" },
    { face: "#6f8f7a", wear: "#547059", edge: "#425c47" }, // faded green
    { face: "#d3c184", wear: "#ab9455", edge: "#8a763e" },
  ],
  doorPalette: function (i) {
    return this.DOOR_PALETTES[i % this.DOOR_PALETTES.length];
  },
  doorRand: function (seed, i, salt) {
    return this.rand(seed * 401 + i * 97 + 5 + (salt || 0) * 1009);
  },
  // The atlas cell a door with `pick` (0..3) samples, as [u0, v0, u1, v1] for
  // setPlaneUVs — the same rectangle on both atlases.
  doorCellUV: function (pick) {
    const u0 = (pick % 2) * 0.5;
    const v0 = 1 - (Math.floor(pick / 2) + 1) * 0.5;
    return [u0, v0, u0 + 0.5, v0 + 0.5];
  },

  doorAtlas: function (size, seed) {
    const key = "door|" + size + "|" + seed;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const S = size;
      const cell = S / 2;
      for (let i = 0; i < 4; i++) {
        const rand = this.doorRand(seed, i, 0);
        const ox = (i % 2) * cell;
        const oy = Math.floor(i / 2) * cell;
        const p = this.doorPalette(i);
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

  // ---- DOOR ATLAS, THE BACKS ----------------------------------------------
  // The same four doors seen from inside the apartment. A door's back is the
  // plain side: the same paint (doorPalette, by cell index), but flat panels
  // in a simple rail-and-stile layout, no number plate, a dark bolt plate at
  // handle height, and it is the side that gets kicked and leaned on, so more
  // grime low down, scuffs, and a few drips. The paint is duller — it was
  // painted the same day as the front, then never again. Same size, same 2×2
  // cells, same texel density, so an open leaf reads the same up close from
  // either side.
  doorAtlasBack: function (size, seed) {
    const key = "doorBack|" + size + "|" + seed;
    return this.get(key, () => {
      const c = this.canvas(size, size);
      const ctx = c.getContext("2d");
      const S = size;
      const cell = S / 2;
      for (let i = 0; i < 4; i++) {
        const rand = this.doorRand(seed, i, 1);
        const ox = (i % 2) * cell;
        const oy = Math.floor(i / 2) * cell;
        const p = this.doorPalette(i);
        ctx.save();
        ctx.translate(ox, oy);
        ctx.beginPath();
        ctx.rect(0, 0, cell, cell);
        ctx.clip();

        // The face colour, let down toward grey: duller than the front.
        ctx.fillStyle = p.face;
        ctx.fillRect(0, 0, cell, cell);
        ctx.fillStyle = "rgba(96,92,84,0.22)";
        ctx.fillRect(0, 0, cell, cell);

        // Brushed paint, coarser than the front: nobody took care on this side.
        for (let k = 0; k < 70; k++) {
          ctx.fillStyle =
            rand() < 0.5
              ? "rgba(255,255,255," + (rand() * 0.05).toFixed(3) + ")"
              : "rgba(0,0,0," + (rand() * 0.06).toFixed(3) + ")";
          ctx.fillRect(rand() * cell, 0, 1 + rand() * 4, cell);
        }

        // TWO LEAVES, the gap between them, and on each a simple frame of
        // stiles and rails with FLAT panels between — a back has no mouldings.
        const gap = cell * 0.012;
        ctx.fillStyle = "rgba(38,30,20,0.85)";
        ctx.fillRect(cell / 2 - gap / 2, 0, gap, cell);
        const stile = cell * 0.075;
        const rail = cell * 0.07;
        const railsY = [0.0, 0.47, 0.93]; // top, lock rail, bottom (as a fraction)
        for (let leaf = 0; leaf < 2; leaf++) {
          const lx = leaf * cell / 2;
          const lw = cell / 2;
          // The panels sit BEHIND the frame: a step down into each one, drawn
          // as a dark line under the frame's lower/right edges and a lit one
          // along its upper/left, in the paint's own tones.
          ctx.fillStyle = "rgba(0,0,0,0.07)";
          for (let r = 0; r < railsY.length - 1; r++) {
            const py = cell * railsY[r] + rail;
            const ph = cell * railsY[r + 1] - py;
            ctx.fillRect(lx + stile, py, lw - stile * 2, ph);
          }
          ctx.lineWidth = Math.max(1.5, S / 400);
          for (let r = 0; r < railsY.length - 1; r++) {
            const py = cell * railsY[r] + rail;
            const py1 = cell * railsY[r + 1];
            const px = lx + stile;
            const px1 = lx + lw - stile;
            ctx.strokeStyle = "rgba(30,24,16,0.5)"; // shadow at the top/left
            ctx.beginPath();
            ctx.moveTo(px, py1);
            ctx.lineTo(px, py);
            ctx.lineTo(px1, py);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,250,232,0.22)"; // lit bottom/right
            ctx.beginPath();
            ctx.moveTo(px1, py);
            ctx.lineTo(px1, py1);
            ctx.lineTo(px, py1);
            ctx.stroke();
          }
        }

        // The BOLT PLATE at handle height on the meeting stile — a dark iron
        // plate with a sliding bolt across the gap — and, above it, the dark
        // rectangle where a chain hangs from a staple.
        // 1.0 m up a 2.1 m door is 52% of the way down the cell.
        const hy = cell * (1 - 1.0 / 2.1);
        const plateW = cell * 0.13;
        const plateH = cell * 0.05;
        const plateX = cell / 2 - plateW * 0.72; // mostly on the left leaf
        ctx.fillStyle = "rgba(34,34,36,0.95)";
        ctx.fillRect(plateX, hy - plateH / 2, plateW, plateH);
        ctx.fillStyle = "rgba(80,80,84,0.9)"; // the bolt itself
        ctx.fillRect(plateX + plateW * 0.15, hy - plateH * 0.16, plateW * 1.05,
                     plateH * 0.32);
        ctx.fillStyle = "rgba(120,118,112,0.8)"; // its knob
        ctx.fillRect(plateX + plateW * 0.45, hy - plateH * 0.42, plateW * 0.12,
                     plateH * 0.84);
        // Rust bleeding down from the plate.
        const bleed = ctx.createLinearGradient(0, hy + plateH / 2, 0,
                                               hy + plateH * 3);
        bleed.addColorStop(0, "rgba(110,66,36,0.45)");
        bleed.addColorStop(1, "rgba(110,66,36,0)");
        ctx.fillStyle = bleed;
        ctx.fillRect(plateX, hy + plateH / 2, plateW, plateH * 2.5);

        // Wear. Grime climbs the bottom third — this is where the mop and the
        // rain and the feet arrive — and scuffs sit in it.
        const bottom = ctx.createLinearGradient(0, cell * 0.62, 0, cell);
        bottom.addColorStop(0, "rgba(0,0,0,0)");
        bottom.addColorStop(0.6, "rgba(48,36,22,0.32)");
        bottom.addColorStop(1, "rgba(40,30,18,0.7)");
        ctx.fillStyle = bottom;
        ctx.fillRect(0, cell * 0.62, cell, cell * 0.38);
        for (let k = 0; k < 34; k++) {
          ctx.fillStyle = p.wear;
          ctx.globalAlpha = 0.25 + rand() * 0.5;
          const y = rand() < 0.7 ? cell * (0.66 + rand() * 0.34) : rand() * cell;
          const x = rand() * cell;
          this.blob(ctx, rand, x, y, cell * (0.015 + rand() * 0.06),
                    cell * (0.008 + rand() * 0.03), 9);
          ctx.globalAlpha = 1;
        }
        // Scuffs: short dark strokes low down, at the angle a shoe leaves.
        for (let k = 0; k < 22; k++) {
          ctx.strokeStyle = "rgba(28,22,16," + (0.2 + rand() * 0.45).toFixed(3) + ")";
          ctx.lineWidth = 1 + rand() * (S / 350);
          const x = rand() * cell;
          const y = cell * (0.72 + rand() * 0.27);
          const len = cell * (0.02 + rand() * 0.08);
          const a = (rand() - 0.5) * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
          ctx.stroke();
        }
        // A few drips: thin dark runs from somewhere on the door downward.
        for (let k = 0; k < 5; k++) {
          const x = rand() * cell;
          const y0 = rand() * cell * 0.6;
          const len = cell * (0.08 + rand() * 0.3);
          const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
          g.addColorStop(0, "rgba(60,44,28,0.35)");
          g.addColorStop(1, "rgba(60,44,28,0)");
          ctx.fillStyle = g;
          ctx.fillRect(x, y0, Math.max(1, S / 500) * (1 + rand()), len);
        }
        ctx.strokeStyle = p.edge;
        ctx.lineWidth = Math.max(2, S / 260);
        ctx.strokeRect(1, 1, cell - 2, cell - 2);

        // Baked light: the room's own tube is above and behind the leaf, so
        // the back is lit from above like the front, a little less.
        const lit = ctx.createLinearGradient(0, 0, 0, cell);
        lit.addColorStop(0, "rgba(255,250,230,0.1)");
        lit.addColorStop(0.45, "rgba(255,250,230,0)");
        lit.addColorStop(1, "rgba(10,8,6,0.26)");
        ctx.fillStyle = lit;
        ctx.fillRect(0, 0, cell, cell);
        ctx.restore();
      }
      return c;
    });
  },

  // ---- BÔNG GIÓ — the ventilation block's face ---------------------------
  // The pierced concrete blocks set in a row above every door, which is how a
  // chung cư corridor breathes: the flat is shut and the air still moves. The
  // louvred transom that used to sit INSIDE the frame is gone — a transom is
  // joinery, and what these corridors actually have is a hole in the concrete
  // above the frame.
  //
  // HOW A HOLE IS MADE HERE. The block is a thin box in a real gap in the wall
  // (see buildVentRow: the lintel is split into a band, the row, and a band,
  // with NO wall behind the row), and the pattern's holes are cut out of the
  // block's two faces by ALPHA. So the pierced part is not modelled: you look
  // through the near face's holes, past the far face's holes, and out into the
  // corridor or the room beyond, and the two faces standing ventDepth apart is
  // what gives the block its thickness as you walk past it.
  //
  // THE ALPHA GOES IN THE CANVAS'S OWN ALPHA CHANNEL, NOT AN alphaMap. THREE
  // samples an alphaMap's GREEN channel, and a green channel here would have to
  // survive the sRGB -> linear conversion the map's colour space asks for:
  // concrete #bfb8a8 is green 0.72 in sRGB and 0.478 linear, which lands just
  // UNDER a 0.5 alphaTest — the block would vanish entirely, and every darker
  // pixel (the shading round the holes, the grime) would cut its own extra
  // holes on the way. The alpha channel is not colour-managed, so map +
  // alphaTest is both exact and one texture. Same trap as the silhouette PNGs
  // further down, approached from the other side.
  //
  // Three patterns, each a complete motif inside its own solid border, so a row
  // of butted blocks reads as concrete mullions with holes between them — which
  // is what the reference rows look like. Drawn at 256 whatever the corridor's
  // textureSize is: it is a 20 cm block, and one canvas serves every copy.
  VENT_PATTERNS: ["circle", "flower", "diamond"],

  ventPatternFor: function (key) {
    return this.VENT_PATTERNS[key % this.VENT_PATTERNS.length];
  },

  // WHERE THE HOLES ARE, as canvas paths in an S-square cell. Returned rather
  // than drawn, because each path is used TWICE — stroked wide and dark first
  // (the rim shading), then punched — and the two must not drift apart.
  //
  // Paths may overlap freely: punching is destination-out, so overlapping
  // punches simply union, and a rim stroke running through a neighbouring
  // hole's interior is punched away with it. That is what lets the flower be
  // five plain circles rather than a rosette outline.
  ventHolePaths: function (S, pattern) {
    const M = S * 0.11; // the solid border every block keeps
    const F = S - M * 2; // the patterned field inside it
    const cx = S / 2;
    const cy = S / 2;
    const out = [];
    const circle = (x, y, r) => {
      const p = new Path2D();
      p.arc(x, y, r, 0, Math.PI * 2);
      out.push({ path: p, rule: "nonzero" });
    };
    if (pattern === "circle") {
      // A RING, cut into four arcs by solid spokes on the diagonals: an
      // unbroken annulus would leave the middle disc floating, and a block has
      // to hold it up. Plus a quarter circle in each corner of the field.
      const ro = F * 0.38;
      const ri = F * 0.17;
      const gap = 0.16; // radians of solid spoke either side of each diagonal
      for (let k = 0; k < 4; k++) {
        const a0 = (k * Math.PI) / 2 + gap;
        const a1 = ((k + 1) * Math.PI) / 2 - gap;
        const p = new Path2D();
        p.arc(cx, cy, ro, a0, a1);
        p.arc(cx, cy, ri, a1, a0, true);
        p.closePath();
        out.push({ path: p, rule: "nonzero" });
      }
      // Small enough to stay clear of the ring: a corner circle reaches
      // (0.707 - q/F) x F in from its corner, and the ring's outer edge is at
      // 0.38 F, so anything under about 0.3 F leaves concrete between them.
      const q = F * 0.16;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((s) => {
        circle(cx + (s[0] * F) / 2, cy + (s[1] * F) / 2, q);
      });
    } else if (pattern === "flower") {
      // FOUR PETALS round a middle: five overlapping circles, unioned by the
      // punch. The petals reach past each other, which is what rounds the
      // rosette's waist instead of leaving four separate holes.
      // Petal radius under pd (0.8 x is about right) is what gives the rosette
      // its WAISTS: at pr = pd the four circles merge into one blob and the
      // whole motif reads as a hole rather than as a flower. The middle circle
      // has to be at least (pd - pr) to bridge them.
      const pd = F * 0.23;
      const pr = F * 0.18;
      circle(cx, cy, F * 0.12);
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach((s) => {
        circle(cx + s[0] * pd, cy + s[1] * pd, pr);
      });
    } else {
      // DIAMOND LATTICE: four diamonds in a 2x2 and a fifth between them, so
      // what is left solid reads as crossing diagonal ribs.
      const dia = (x, y, r) => {
        const p = new Path2D();
        p.moveTo(x, y - r);
        p.lineTo(x + r, y);
        p.lineTo(x, y + r);
        p.lineTo(x - r, y);
        p.closePath();
        out.push({ path: p, rule: "nonzero" });
      };
      const r = F * 0.19;
      const off = F * 0.25;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((s) => {
        dia(cx + s[0] * off, cy + s[1] * off, r);
      });
      dia(cx, cy, F * 0.17);
    }
    return { paths: out, margin: M, field: F };
  },

  // ONE BLOCK FACE: concrete, weathered, with the pattern punched out of it.
  ventFace: function (size, seed, pattern, color, grime) {
    const key = "vent|" + size + "|" + seed + "|" + pattern + "|" + color +
                "|" + grime;
    return this.get(key, () => {
      const S = size;
      const c = this.canvas(S, S);
      const ctx = c.getContext("2d");
      const rand = this.rand(
        seed * 577 + this.VENT_PATTERNS.indexOf(pattern) * 131 + 7
      );
      const rgb = this.hexRGB(color);
      const tone = (f, a) =>
        "rgba(" + Math.round(rgb[0] * f) + "," + Math.round(rgb[1] * f) + "," +
        Math.round(rgb[2] * f) + "," + a + ")";

      // 1. THE CONCRETE. Flat colour, then a coarse mottle and a fine grit —
      // cast concrete is never one tone, and at 20 cm across you stand close
      // enough to see that.
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, S, S);
      for (let k = 0; k < 90; k++) {
        ctx.fillStyle = rand() < 0.5 ? tone(1.08, 0.16) : tone(0.86, 0.18);
        this.blob(ctx, rand, rand() * S, rand() * S, S * (0.03 + rand() * 0.1),
                  S * (0.03 + rand() * 0.1), 8);
      }
      this.grain(ctx, rand, S, S, Math.round(S * 5), 0.07);

      // 2. GRIME, before the holes are cut, so it settles on the solid and not
      // in the air. Heaviest low down and wherever a butted neighbour's joint
      // holds the dust.
      const low = ctx.createLinearGradient(0, S * 0.45, 0, S);
      low.addColorStop(0, "rgba(44,38,28,0)");
      low.addColorStop(1, "rgba(44,38,28," + (0.4 * grime).toFixed(3) + ")");
      ctx.fillStyle = low;
      ctx.fillRect(0, S * 0.45, S, S * 0.55);
      for (let k = 0; k < Math.round(26 * grime); k++) {
        ctx.fillStyle =
          "rgba(52,44,32," + (0.1 + rand() * 0.28).toFixed(3) + ")";
        this.blob(ctx, rand, rand() * S, rand() * S, S * (0.02 + rand() * 0.09),
                  S * (0.02 + rand() * 0.07), 9);
      }

      const holes = this.ventHolePaths(S, pattern);
      const M = holes.margin;

      // 3. THE HOLES' RIMS, stroked wide and dark BEFORE the punch: the punch
      // takes the inner half of every stroke away with it, and what is left is
      // a soft dark ring on the concrete round each opening. That ring is the
      // only thing telling the eye the block has depth, everything here being
      // unlit — see the LIGHTING note at the top of the file.
      //
      // Clipped to the field, so a rim never crosses the block's solid border.
      ctx.save();
      ctx.beginPath();
      ctx.rect(M, M, holes.field, holes.field);
      ctx.clip();
      ctx.lineJoin = "round";
      holes.paths.forEach((h) => {
        ctx.strokeStyle = "rgba(28,24,18,0.34)";
        ctx.lineWidth = S * 0.05;
        ctx.stroke(h.path);
        ctx.strokeStyle = "rgba(30,26,20,0.3)";
        ctx.lineWidth = S * 0.02;
        ctx.stroke(h.path);
      });
      // A thin LIT edge offset up and to the left: the top arris of the reveal
      // catching whatever light there is.
      ctx.save();
      ctx.translate(-S * 0.012, -S * 0.012);
      holes.paths.forEach((h) => {
        ctx.strokeStyle = "rgba(255,252,240,0.13)";
        ctx.lineWidth = S * 0.012;
        ctx.stroke(h.path);
      });
      ctx.restore();
      ctx.restore();

      // 4. PUNCH. destination-out subtracts the SOURCE's alpha from the
      // destination's, so the fill colour's own alpha is how hard it cuts —
      // and the fillStyle still standing here is the grime loop's last blotch
      // at alpha 0.1-0.38, which takes a third of the alpha away and leaves a
      // smear where the hole should be. Opaque black, explicitly, every time.
      // Clipped to the field, exactly as the rims were: the border is what
      // makes a row of these read as concrete mullions, and a corner motif
      // punched without the clip runs straight out through it.
      ctx.save();
      ctx.beginPath();
      ctx.rect(M, M, holes.field, holes.field);
      ctx.clip();
      ctx.globalCompositeOperation = "destination-out";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#000";
      holes.paths.forEach((h) => {
        ctx.fill(h.path, h.rule);
      });
      ctx.restore();

      // 5. THE BLOCK'S OWN EDGES: a dark line all round, so a row of butted
      // blocks shows its joints instead of reading as one pierced slab, and a
      // lighter one along the top.
      ctx.strokeStyle = "rgba(30,26,20,0.55)";
      ctx.lineWidth = Math.max(2, S * 0.016);
      ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.fillStyle = "rgba(255,252,240,0.16)";
      ctx.fillRect(0, 0, S, Math.max(1, S * 0.012));
      return c;
    });
  },

  // ---- THE VIEW: SKY --------------------------------------------------
  // A vertical gradient, generated in ANGULAR space rather than in metres.
  //
  // The sky plane has to be enormous (see viewCoverage) so that no sightline
  // through the window can miss it. Ramp the colours linearly up such a plane
  // and the whole gradient collapses into a sliver around the horizon: at 40 m
  // out, 45 degrees of elevation is 40 m up a plane 90 m tall. So each canvas
  // row is converted to the ELEVATION it will be seen at and coloured from
  // that, which makes the sky look the same whatever size the plane is.
  //
  // Below the horizon it goes to a deeper haze, not to more sky: that region is
  // what you see through the window when you look down past the city's base,
  // and it should read as more distance, not as a hole.
  skyGradient: function (h, topColor, horizonColor, dist, yBottom, yTop, eyeY) {
    const key = ["sky", h, topColor, horizonColor, dist.toFixed(1),
                 yBottom.toFixed(1), yTop.toFixed(1), eyeY.toFixed(2)].join("|");
    return this.get(key, () => {
      const c = this.canvas(4, h);
      const ctx = c.getContext("2d");
      const top = this.hexRGB(topColor);
      const hor = this.hexRGB(horizonColor);
      const mix = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
      for (let y = 0; y < h; y++) {
        const v = 1 - y / (h - 1); // 0 at the canvas bottom, 1 at the top
        const worldY = yBottom + v * (yTop - yBottom);
        const elev = Math.atan2(worldY - eyeY, dist); // radians
        let r, g, b;
        if (elev >= 0) {
          // Up from the horizon: the pale warm haze gives way to cooler grey
          // over the first 50 degrees or so.
          const t = Math.min(1, elev / (Math.PI * 0.28));
          const e = t * t * (3 - 2 * t); // ease, so the horizon band is wide
          r = mix(hor[0], top[0], e);
          g = mix(hor[1], top[1], e);
          b = mix(hor[2], top[2], e);
          // ...and a brighter band sitting right on the horizon, which is what
          // makes a hazy tropical sky read as hot rather than merely pale.
          const glow = Math.max(0, 1 - elev / (Math.PI * 0.045));
          r = mix(r, 255, glow * 0.22);
          g = mix(g, 252, glow * 0.2);
          b = mix(b, 236, glow * 0.16);
        } else {
          // Below it: deeper, warmer, greyer — distance, not sky.
          const t = Math.min(1, -elev / (Math.PI * 0.2));
          r = mix(hor[0], hor[0] * 0.62, t);
          g = mix(hor[1], hor[1] * 0.62, t);
          b = mix(hor[2], hor[2] * 0.66, t);
        }
        ctx.fillStyle =
          "rgb(" + Math.round(r) + "," + Math.round(g) + "," + Math.round(b) + ")";
        ctx.fillRect(0, y, 4, 1);
      }
      return c;
    });
  },

  // ---- THE VIEW: SILHOUETTE -------------------------------------------
  // The city, from one of the exhibition's existing Saigon PNGs.
  //
  // THE PNGs ARE BLACK ON TRANSPARENT, and that rules out two obvious
  // approaches. Used as `map`, no material colour can lighten them — a tint
  // MULTIPLIES, and anything times black is black, so a distant hazy skyline is
  // impossible. Used as `alphaMap`, they vanish: THREE samples an alpha map's
  // GREEN channel, and these files are greyscale-plus-alpha with green 0
  // everywhere (measured: max green anywhere = 0), so every pixel would come
  // out fully transparent.
  //
  // So the shape is lifted into a canvas and filled WHITE through source-in.
  // White multiplies to whatever the material's colour is, which means one
  // canvas serves any number of layers at any haze colour and opacity — three
  // canvases cover both depth bands and all eighteen of their panels.
  //
  // THE PLACEHOLDER HAS TO BE THROWN AWAY, not merely re-flagged. The image
  // loads asynchronously, so the texture is built around a tiny blank canvas
  // and the real picture is drawn into it later. On WebGL2 three allocates
  // IMMUTABLE storage (texStorage2D) at whatever size it first uploads — so
  // once the 4x4 placeholder has gone up, growing the canvas to 1456x816 and
  // setting needsUpdate CANNOT work: the re-upload fails down in the driver
  // ("glCopySubTextureCHROMIUM: Offset overflows texture dimensions", a console
  // warning and nothing else) and the layer stays fully transparent for good.
  //
  // Whether that happened came down to a race. If the PNG arrived before the
  // corridor's first frame the storage was allocated at the right size and the
  // city appeared; if it arrived after, the city was silently missing and only
  // the sky showed through the window. dispose() on load drops the GL texture
  // so the next frame allocates it afresh at the real size — the cost is one
  // throwaway 4x4 allocation, once, per image.
  silhouette: function (src) {
    const key = "silhouette|" + src;
    if (this.cache.has(key)) {
      if (!(key in this.timings)) this.timings[key] = 0;
      return this.cache.get(key);
    }
    const c = this.canvas(4, 4);
    const tex = this.texture(c);
    // The plane runs its UVs BELOW v = 0 to make a skirt under the city; clamp
    // so that region repeats the image's solid bottom row instead of wrapping
    // the sky back in at the bottom.
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    this.cache.set(key, tex);
    this.timings[key] = 0;
    const img = new Image();
    img.onload = () => {
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = "source-over";
      tex.dispose(); // see the note above: the placeholder's storage is immutable
      tex.needsUpdate = true;
    };
    img.onerror = () => {
      console.warn("[corridor] skyline image failed to load: " + src);
    };
    img.src = src;
    return tex;
  },

  // ---- THE DAYLIGHT PATCH ------------------------------------------------
  // What the window throws on the floor: one canvas, WHITE with the light in
  // its ALPHA channel, exactly like ContactCue.makeTexture — the material
  // supplies the colour and the strength, this supplies the shape.
  //
  // The canvas is in the patch's own space, not in metres: u runs across the
  // patch (0..1) and v runs 1 at the wall to 0 at the far edge. The patch is a
  // parallelogram, so a line of constant u is straight and parallel to every
  // other — which is exactly what parallel sunlight through a grille draws,
  // and what lets the shadows be plain stripes on a canvas.
  //
  // THE SHADOWS. The bar positions come in as FRACTIONS of the opening, taken
  // from grilleLattice() — the same numbers the bars themselves were built
  // from, so the two can never drift apart. The verticals map straight across
  // (u), and the horizontals map the opening's HEIGHT onto the patch's DEPTH:
  // a raked sun lays the window's height out along the floor, so the bar
  // nearest the sill lands nearest the wall and the head of the frame lands at
  // the far edge. Both get a penumbra that widens and washes out with depth,
  // which is the difference between a shadow and a decal.
  daylight: function (size, s) {
    const key = "daylight|" + size + "|" + JSON.stringify(s);
    return this.get(key, () => {
      const S = size;
      const c = this.canvas(S, S);
      const ctx = c.getContext("2d");

      // 1. THE LIGHT: full at the wall, dying away across the depth.
      const g = ctx.createLinearGradient(0, 0, 0, S);
      const STOPS = 24;
      for (let i = 0; i <= STOPS; i++) {
        const t = i / STOPS; // 0 at the wall, 1 at the far edge
        const a = Math.pow(1 - t, 1.3);
        g.addColorStop(t, "rgba(255,255,255," + a.toFixed(4) + ")");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);

      // Everything from here on REMOVES light: destination-out multiplies the
      // alpha already there by (1 - what is drawn), so the order of the
      // shadows and the edge fade against each other does not matter.
      ctx.globalCompositeOperation = "destination-out";

      // PENUMBRA, as a fraction of the BAR PITCH rather than as a count of
      // pixels — that is the whole trick here. A grille is mostly hole: the
      // bars are a tenth of their spacing, so their shadows have to stay a
      // small part of theirs too. Give the penumbra a fixed pixel size instead
      // and a close-set lattice turns into a grid of bright dots on a dark
      // floor, which is a shadow of a grating rather than of a grille.
      //
      // It still widens and washes out with depth, because that is the
      // difference between a shadow and a decal — just never past the point
      // where neighbouring shadows would meet.
      const pitchX = S / (s.xs.length + 1);
      const pitchY = S / (s.ys.length + 1);
      const pen = (t, pitch) => pitch * (0.04 + 0.34 * s.soft * t);
      const dark = (t) => 0.8 * (1 - 0.55 * t);

      // A soft-edged stripe: a plateau at full strength with a penumbra either
      // side of it. `across` true = a vertical bar (constant u), false = a
      // horizontal one (constant depth).
      const stripe = (centre, half, soft, a, across, y0, y1) => {
        const hw = half + soft;
        if (hw <= 0 || a <= 0) return;
        const core = Math.max(0.02, Math.min(0.48, (half / hw) * 0.5));
        const grad = across
          ? ctx.createLinearGradient(centre - hw, 0, centre + hw, 0)
          : ctx.createLinearGradient(0, centre - hw, 0, centre + hw);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.5 - core, "rgba(0,0,0," + a.toFixed(4) + ")");
        grad.addColorStop(0.5 + core, "rgba(0,0,0," + a.toFixed(4) + ")");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        if (across) ctx.fillRect(centre - hw, y0, hw * 2, y1 - y0);
        else ctx.fillRect(0, centre - hw, S, hw * 2);
      };

      // VERTICAL bars. Their penumbra has to grow along the patch, so each is
      // laid down in bands of depth rather than as one stripe.
      const BANDS = 40;
      const bandH = S / BANDS;
      const verticals = s.xs.concat([s.fx / 2, 1 - s.fx / 2]);
      const vWidth = s.xs.map(() => s.bx).concat([s.fx, s.fx]);
      verticals.forEach((u, i) => {
        const x = u * S;
        for (let b = 0; b < BANDS; b++) {
          const t = (b + 0.5) / BANDS;
          stripe(x, (vWidth[i] * S) / 2, pen(t, pitchX), dark(t), true,
                 b * bandH, (b + 1) * bandH + 1);
        }
      });

      // HORIZONTAL bars. Each sits at one depth, so one stripe does it.
      const horizontals = s.ys.concat([s.fy / 2, 1 - s.fy / 2]);
      const hWidth = s.ys.map(() => s.by).concat([s.fy, s.fy]);
      horizontals.forEach((t, i) => {
        stripe(t * S, (hWidth[i] * S) / 2, pen(t, pitchY), dark(t), false,
               0, S);
      });

      // 2. THE EDGES of the patch, where the wall either side of the opening
      // cuts the light off. Soft, because the reveal is thick and the sun is
      // not a point.
      const m = Math.max(0.02, 0.05 + 0.16 * s.soft);
      [[0, m], [1, -m]].forEach((e) => {
        const grad = ctx.createLinearGradient(e[0] * S, 0,
                                              (e[0] + e[1]) * S, 0);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(Math.min(e[0], e[0] + e[1]) * S, 0, Math.abs(e[1]) * S, S);
      });
      // ...and the far edge, so the patch ends in nothing rather than in a line.
      const gf = ctx.createLinearGradient(0, S, 0, S * 0.7);
      gf.addColorStop(0, "rgba(0,0,0,1)");
      gf.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gf;
      ctx.fillRect(0, S * 0.7, S, S * 0.3);

      ctx.globalCompositeOperation = "source-over";
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
//   vent true                         the bong gio row above EVERY door, open
//                                     or closed: a real hole through the wall
//   ventBlock .2 / ventCols 4         one block, and how many across (the row
//   ventRows 1                        is centred on the door and clamped to
//                                     fit inside the opening)
//   ventGap .15                       frame head to the row's bottom
//   ventDepth 0                       0 = auto: wallThickness, right through
//   ventPattern "mixed"               "circle" | "flower" | "diamond" |
//                                     "mixed" (one per door, seeded)
//   ventColor #bfb8a8 / ventGrime .5  the concrete, and how filthy it is
//   (transomHeight is GONE — the louvred fanlight it sized went with it)
//   gate true                         the scissor gate (cửa kéo) outside every
//                                     door: stretched across and padlocked, or
//                                     folded into a stack beside it
//   gateLockedRatio .3                how many CLOSED doors are locked, seeded
//                                     per door — the apartments are ALWAYS
//                                     folded, their pictures being the point
//   gateBar .012 / gateBarThick .004  a flat bar, on edge
//   gateStack .32                     the folded stack's width
//   gateCells 7                       diamonds across; the ROW count derives
//                                     from it (straps near 60 degrees)
//   gateColor #35373a / gateRust .4   the steel, on the grille's own recipe
//   gateTrackDepth .05                how far it all stands off the wall
//   gatePark "seed"                   "hinge" | "far" | "seed" — and a stack
//                                     that would hit a neighbour parks the
//                                     other way regardless
//   gateHeight is NOT a tunable: doorHeight - 0.05 (GATE_DROP)
//   wallStencils 0.6                  the painted phone numbers BAKED INTO the
//                                     wall texture: a density, one per bay of
//                                     the right variant, never aimed
//   wallStencilDecals true            ...and the PLACED ones, on the two long
//   wallStencilDecalWidth 1.7         blank stretches between doors. Derived
//   wallStencilDecalY 1.45            from L.openings; skipped, never
//                                     squeezed, if a stretch is too short
//   wallStencilTilt 6                 both kinds: degrees off level, and
//   wallStencilInk 1                  how much pigment went on
//   furniture true                    the four props from js/props.js — a seat
//                                     row and a low table on the right, a
//                                     child's bike and a bag on the left. All
//                                     four POSITIONS derived from L.openings
//   furnitureCollide true             cut their footprints out of the walkable
//                                     rectangle (see rectMinus)
//   furnitureUnlit false              the props are the only LIT things out
//                                     here; this bakes their shading instead
//   furnitureOffsets {}               by-eye nudges per prop, { z, x, yaw }
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
// How far a scissor gate's head sits under the door's own. gateHeight is
// DERIVED from doorHeight and this, rather than being a tunable of its own: a
// gate is cut to the opening it stands in, and a height that could disagree
// with doorHeight is a height that eventually will.
const GATE_DROP = 0.05;

const CORRIDOR_GEOM_PROPS = [
  "length", "width", "height", "landingDepth", "doorPitch", "doorWidth",
  "doorHeight", "roomWidth", "roomDepth", "roomSizes",
  "roomOffsets", "roomSpacing", "endWallShade",
  "vent", "ventBlock", "ventCols", "ventRows", "ventGap", "ventDepth",
  "ventPattern", "ventColor", "ventGrime",
  "gate", "gateLockedRatio", "gateBar", "gateBarThick", "gateStack",
  "gateCells", "gateColor", "gateRust", "gateTrackDepth", "gatePark",
  "furniture", "furnitureCollide", "furnitureUnlit", "furnitureOffsets",
  "window", "windowWidth", "windowHeight", "windowSill", "windowX",
  "windowRevealColor", "windowSillColor",
  "grilleBar", "grilleSpacingX", "grilleSpacingY", "grilleFrame",
  "grilleColor", "grilleRust", "grilleInset", "grilleTile",
  "viewSkyTop", "viewSkyHorizon", "viewSkyDistance", "viewSkyWidth",
  "viewSkyHeight", "viewClearance", "viewEyeY", "viewLayers",
  "viewSilhouetteSrc", "viewSilhouetteSrc2", "viewSilhouetteSrcL",
  "viewSilhouetteSrcR", "viewPanelsMax", "viewDistance", "viewWidth",
  "viewBottom", "viewHaze", "viewHazeOpacity", "viewDistance2", "viewWidth2",
  "viewHaze2", "viewHazeOpacity2", "viewCrop",
  "daylight", "daylightDepth", "daylightOpacity", "daylightColor",
  "daylightSkew", "daylightSoftness",
  "wallThickness", "textureSize", "seed", "wallNoiseRes", "wallFlake",
  "roomWallFlake", "wallGrain", "wallStripe", "wallStencils", "wallStencilTilt",
  "wallStencilInk",
  "wallStencilDecals", "wallStencilDecalWidth", "wallStencilDecalY",
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

    // ---- BÔNG GIÓ: the ventilation row above every door ----------------
    // Not a transom. A chung cu corridor ventilates a shut flat through
    // PIERCED CONCRETE BLOCKS set in the wall over the door frame, and that is
    // a real hole through the wall here: the lintel is split into a band, the
    // row and a band, with nothing behind the row, so corridor light reaches
    // the room through it and you can see the corridor from inside. See
    // buildVentRow and CorridorTextures.ventFace.
    //
    //   ventBlock    one block, square, in metres
    //   ventCols     blocks across; the row is CENTRED on the door, and is
    //                clamped down to fit inside the opening's own width
    //   ventRows     blocks high
    //   ventGap      from the TOP OF THE FRAME HEAD to the row's bottom
    //   ventDepth    0 = auto: wallThickness, so the block goes right through
    //   ventPattern  "circle" | "flower" | "diamond" | "mixed" — "mixed"
    //                gives each door one of the three, seeded from where it
    //                stands like its atlas cell is (doorKey)
    //   vent false   restores a plain lintel over every door
    vent: { type: "boolean", default: true },
    ventBlock: { type: "number", default: 0.2 },
    ventCols: { type: "number", default: 4 },
    ventRows: { type: "number", default: 1 },
    ventGap: { type: "number", default: 0.15 },
    ventDepth: { type: "number", default: 0 }, // 0 = auto (wallThickness)
    ventPattern: { type: "string", default: "mixed" },
    ventColor: { type: "color", default: "#bfb8a8" },
    ventGrime: { type: "number", default: 0.5 },

    // ---- THE SCISSOR GATES (cửa kéo) -----------------------------------
    // The folding steel gate outside every door: stretched across the opening
    // and padlocked when the flat is shut, folded into a stack against the
    // jamb when it is not. See the block above buildGateMeshes.
    //
    //   gateLockedRatio  how many of the CLOSED doors are locked, as a
    //                    probability drawn per door from the corridor's seed —
    //                    so the same corridor always locks the same doors, and
    //                    changing `seed` reshuffles the whole run at once. The
    //                    three apartment doorways are ALWAYS folded: their
    //                    pictures are the point, and a lattice of steel across
    //                    that is the exhibition behind bars.
    //   gateBar          a flat bar's width across its face...
    //   gateBarThick     ...and its thickness the other way. Flat bars on edge.
    //   gateStack        how wide the gate is when it is folded
    //   gateCells        diamonds across the extended span; the ROW count is
    //                    derived from it, so the straps land near 60 degrees
    //                    and the lattice closes on both rails
    //   gateTrackDepth   how far the whole assembly stands off the wall's face
    //                    (0.05 clears the 0.045 frame by five millimetres, and
    //                    is well inside the collider's 0.25 m player radius —
    //                    no collider change, see walkableRects)
    //   gatePark         "hinge" (the +z jamb, where the doors are hung),
    //                    "far", or "seed" — and whichever is asked for, a
    //                    stack that would hit a neighbour's frame parks on the
    //                    other side instead
    //   gate false       no gates at all
    //
    // gateHeight is not here: it is doorHeight - GATE_DROP.
    gate: { type: "boolean", default: true },
    gateLockedRatio: { type: "number", default: 0.3 },
    gateBar: { type: "number", default: 0.012 },
    gateBarThick: { type: "number", default: 0.004 },
    gateStack: { type: "number", default: 0.32 },
    gateCells: { type: "number", default: 7 },
    gateColor: { type: "color", default: "#35373a" },
    gateRust: { type: "number", default: 0.4 },
    gateTrackDepth: { type: "number", default: 0.05 },
    gatePark: { type: "string", default: "seed" },

    // ---- THE FURNITURE -------------------------------------------------
    // Four props from js/props.js, put where the DOORS say rather than at
    // typed coordinates — a seat row and a low table on the right wall in the
    // stretch before the first closed door, a child's bike and a stuffed bag
    // on the left between the first two. See furnitureLayout().
    //
    //   furnitureCollide  subtract each prop's footprint from the corridor's
    //                     walkable rectangle, so you cannot walk through them.
    //                     Off leaves the props as scenery you pass through.
    //   furnitureUnlit    build them MeshBasic with baked vertex shading
    //                     instead of MeshLambert. The props are the only lit
    //                     thing in the corridor — everything else has its light
    //                     painted into its texture — so this is the switch if
    //                     they read brighter than the walls they stand against.
    //   furnitureOffsets  by-eye nudges per prop, keyed seats / table / bike /
    //                     bag, each { z, x, yaw } in metres and DEGREES,
    //                     applied after the derivation. An object, or the JSON
    //                     string an HTML attribute carries — the same
    //                     parse/stringify pattern roomSizes uses. Any key or
    //                     any prop may be left out.
    furniture: { type: "boolean", default: true },
    furnitureCollide: { type: "boolean", default: true },
    furnitureUnlit: { type: "boolean", default: false },
    furnitureOffsets: {
      default: {},
      parse: function (v) {
        if (typeof v !== "string") return v || {};
        return v ? JSON.parse(v) : {};
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },

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
    // THE PLACED STENCILS: numbers on a NAMED stretch of wall — the right
    // wall between its 1st and 2nd door, the left between its 2nd and 3rd —
    // rather than in whichever bay the tiled wall canvas happened to put one.
    // See stencilSpots(). They honour wallStencilInk and wallStencilTilt like
    // the baked ones do; wallStencils does NOT scale them, because these are
    // placed and that one is a density.
    wallStencilDecals: { type: "boolean", default: true },
    wallStencilDecalWidth: { type: "number", default: 1.7 },
    wallStencilDecalY: { type: "number", default: 1.45 },
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

    // ---- THE VIEW through the window -----------------------------------
    // Saigon at a distance: a haze sky with the city in two silhouette layers
    // in front of it. All of it sits OUTSIDE the end wall, is unlit, and is
    // reachable only by eye — there is no floor out there and no way to get to
    // it. viewLayers 1 drops the far layer, 0 drops the city altogether.
    //
    // viewSkyWidth / viewSkyHeight are 0 = AUTO, and should stay that way. The
    // sky must cover every ray that can leave the window from anywhere a
    // visitor can stand, and those rays fan out hard: from the far side of a
    // 4.4 m corridor, one metre back, looking through the opposite edge of the
    // opening, the sightline is over 70 degrees off axis. A fixed size that
    // looks generous (120 x 60, say) leaves the scene's black background
    // showing at exactly the angles someone will try. viewCoverage() derives
    // the size from the aperture, the reveal's depth and viewClearance
    // instead — a plane is two triangles, so the size costs nothing, and the
    // gradient is generated in angular space so it does not stretch.
    viewSkyTop: { type: "color", default: "#c9d4dc" },
    viewSkyHorizon: { type: "color", default: "#efe9dc" },
    viewSkyDistance: { type: "number", default: 40 },
    viewSkyWidth: { type: "number", default: 0 },
    viewSkyHeight: { type: "number", default: 0 },
    viewClearance: { type: "number", default: 0.25 }, // closest eye to the wall
    viewEyeY: { type: "number", default: 1.6 },

    // THE CITY RUNS OFF BOTH SIDES. One skyline plane is not enough: walk up
    // to the window and the cone of sight through it opens out fast — at the
    // sill you can see nearly 80 degrees off axis through the far edge of the
    // opening — and a single panel simply ENDS out there, with sky where the
    // town should be. So each depth layer is a BAND of panels butted edge to
    // edge, as many as the cone at that distance actually needs
    // (viewCoverage), and every panel is one quad sharing one of three
    // textures. viewPanelsMax caps how many each side, for a device that
    // cannot spare the draw calls.
    //
    // Neighbours are never the same picture: the centre panel is
    // viewSilhouetteSrc, and going outward the sources alternate L, R, L...
    // one way and R, L, R... the other. Panels left of centre are also
    // MIRRORED (u runs 1 -> 0), which costs nothing and breaks up the repeat
    // further out where the same image does come round again.
    viewLayers: { type: "number", default: 2 },
    viewSilhouetteSrc: { type: "string", default: "assets/saigon2.png" },
    viewSilhouetteSrcL: { type: "string", default: "assets/saigon1.png" },
    viewSilhouetteSrcR: { type: "string", default: "assets/saigon3.png" },
    viewSilhouetteSrc2: { type: "string", default: "assets/saigon4.png" },
    viewPanelsMax: { type: "number", default: 4 },
    viewDistance: { type: "number", default: 22 },
    viewWidth: { type: "number", default: 48 },
    viewBottom: { type: "number", default: -4 },
    viewHaze: { type: "color", default: "#3d4a55" },
    viewHazeOpacity: { type: "number", default: 0.92 },
    viewDistance2: { type: "number", default: 34 },
    viewWidth2: { type: "number", default: 70 },
    viewHaze2: { type: "color", default: "#7d8a94" },
    viewHazeOpacity2: { type: "number", default: 0.75 },
    viewCrop: { type: "number", default: 0.06 },

    // ---- THE DAYLIGHT the window lets in --------------------------------
    // A patch of sun on the floor in front of the window with the grille's
    // shadow in it. It is what makes the view read as OUTSIDE rather than as a
    // picture hung at the end of the corridor: the light gets in.
    //
    // It is one quad and one canvas, unlit and additive, and it is the only
    // thing in the corridor that pretends there is a sun — everything else here
    // is flat-shaded (see the LIGHTING note at the top of the file), so this
    // has to carry the whole suggestion on its own.
    //
    //   daylightDepth     how far out from the wall the patch reaches
    //   daylightSkew      how far it LEANS sideways per metre of that depth,
    //                     which is where the sun is: 0 puts it square in front
    //                     of the window, 0.25 is about 14 degrees off. It is a
    //                     lean, never a widening — see buildDaylight
    //   daylightSoftness  0 = hard-edged shadows, 1 = a wide penumbra
    daylight: { type: "boolean", default: true },
    daylightDepth: { type: "number", default: 2.6 },
    daylightOpacity: { type: "number", default: 0.28 },
    daylightColor: { type: "color", default: "#fff6dc" },
    daylightSkew: { type: "number", default: 0.25 },
    daylightSoftness: { type: "number", default: 0.6 },

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
    // InstancedMeshes hold a buffer of their own (instanceMatrix) that neither
    // the geometry's dispose nor the material's touches, so they are tracked
    // separately and disposed with the rest.
    this.instanced = [];
    this.ventPlacements = {};
    this.ventCount = 0;
    this.gates = [];
    this.gateInfo = null;
    // PropKit groups. They own their own geometries and materials and hand
    // them back through group.userData.dispose(), so they are tracked
    // separately from this component's own lists.
    this.props = [];
    this.stencilCount = 0;
    // Textures this component made itself (the props' shared floor mark).
    // Everything else it draws lives in CorridorTextures' own cache, which
    // deliberately outlives a rebuild.
    this.textures = [];
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
  //
  // THE FURNITURE, and why an obstacle here is a SUBTRACTION. The collider
  // takes the UNION of these rectangles: anything inside any rectangle is
  // somewhere you may stand. So there is no such thing as adding a solid — a
  // prop is made solid by CUTTING ITS FOOTPRINT OUT of the rectangle it stands
  // in, and rebuilding what is left as the pieces around it. rectMinus() does
  // that: a rectangle minus a rectangle is up to four rectangles, and because
  // they are cut on the hole's own edges they tile the remainder exactly and
  // the union stays continuous — you walk past a prop through pieces that share
  // their edges, the same way the landing and the run already share z = 0.
  //
  // The footprint is inflated by playerRadius first, which is what actually
  // stops the camera: the collider does not know about the seat row, it knows
  // there is nowhere to stand within a quarter metre of it.
  // ---------------------------------------------------------------

  // One rectangle minus one rectangle, appended to `out`. Both are
  // {x0, x1, z0, z1} with any other keys carried through (the tag). Guillotine:
  // the z-bands clear of the hole survive whole, and inside the hole's own band
  // only the strips to either side of it in x are left.
  rectMinus: function (a, h, out) {
    if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) {
      out.push(a); // no overlap at all
      return;
    }
    const zLo = Math.max(a.z0, h.z0);
    const zHi = Math.min(a.z1, h.z1);
    if (a.z0 < zLo) out.push(Object.assign({}, a, { z1: zLo }));
    if (zHi < a.z1) out.push(Object.assign({}, a, { z0: zHi }));
    if (a.x0 < h.x0) {
      out.push(Object.assign({}, a, { z0: zLo, z1: zHi, x1: h.x0 }));
    }
    if (h.x1 < a.x1) {
      out.push(Object.assign({}, a, { z0: zLo, z1: zHi, x0: h.x1 }));
    }
  },
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
    // union stays continuous — and then cut around the furniture, which is the
    // only thing standing in either of them.
    let open = [
      { x0: -L.halfW + r, x1: L.halfW - r, z0: 0, z1: L.zBack - r,
        tag: "corridor:landing" },
      { x0: -L.halfW + r, x1: L.halfW - r, z0: L.zEnd + r, z1: 0,
        tag: "corridor:run" },
    ];
    if (d.furniture && d.furnitureCollide) {
      // `false`: this runs on every collider rebuild, and buildFurniture has
      // already said anything there was to say about where these went.
      this.furnitureLayout(L, false).forEach((p) => {
        const hole = {
          x0: p.x - p.spanX / 2 - r,
          x1: p.x + p.spanX / 2 + r,
          z0: p.z - p.spanZ / 2 - r,
          z1: p.z + p.spanZ / 2 + r,
        };
        const cut = [];
        open.forEach((a) => this.rectMinus(a, hole, cut));
        open = cut;
      });
    }
    open.forEach((a, i) => push(a.x0, a.x1, a.z0, a.z1, a.tag + "/" + i));

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
        top: d.doorHeight,
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
          top: d.doorHeight, // the leaf, and nothing above it but wall
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
      doorBack: CorridorTextures.doorAtlasBack(S, d.seed),
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
      // The other side of an OPEN leaf, seen from inside its apartment. One
      // material, shared by the three open doors; a closed door's back is
      // buried in the wall and never built.
      doorBack: this.mat({ map: this.tex.doorBack }),
      doorEdge: this.mat({ color: new THREE.Color("#4a3f2c") }),
      // The bong gio blocks' outer frame — the square tube round each block
      // that gives its border real depth. Flat concrete, a shade under the
      // faces' own colour. The FACES' materials are made in buildVentMeshes,
      // one per pattern actually used, so a corridor set to a single pattern
      // pays for a single canvas.
      ventFrame: this.mat({
        color: new THREE.Color(d.ventColor).multiplyScalar(0.78),
      }),
      // THE GATES' STEEL, on the window grille's own recipe. grilleIron draws
      // exactly this — black paint going to rust, u along the bar and v across
      // its section — and a scissor gate is nothing but bars, so it is reused
      // rather than copied under a new name. Its cache key carries the colour
      // and the rust, so the gates get their own canvas at their own settings
      // without touching the window's.
      gate: this.mat({
        map: CorridorTextures.grilleIron(256, d.seed, d.gateRust, d.gateColor),
      }),
      // ...and the track and floor rail: painted steel that has never been
      // touched, so a flat dark and no canvas at all.
      gateTrack: this.mat({
        color: new THREE.Color(d.gateColor).multiplyScalar(0.72),
      }),
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
    // Every vent block in the corridor is the same geometry in a different
    // place, so the walls only COLLECT the placements and one pass at the end
    // turns them into a couple of instanced meshes — see buildVentMeshes.
    this.ventPlacements = {};
    this.gates = [];
    this.buildSideWall(L, -1);
    this.buildSideWall(L, +1);
    this.buildVentMeshes(L);
    this.buildGateMeshes(L);
    this.buildWallStencils(L);
    this.buildFurniture(L);
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
        this.ventCount + " vent blocks in " +
        Object.keys(this.ventPlacements).length + " pattern(s), " +
        (this.gateInfo
          ? this.gateInfo.locked + " locked + " + this.gateInfo.folded +
            " folded gates (" + this.gateInfo.bars + " bars each, " +
            this.gateInfo.cells + "x" + this.gateInfo.rows + ", straps at " +
            this.gateInfo.angle.toFixed(0) + " deg extended / " +
            this.gateInfo.foldAngle.toFixed(0) + " folded), "
          : "no gates, ") +
        (this.stencilCount
          ? this.stencilCount + " placed stencils, "
          : "") +
        (this.props.length
          ? this.props.length + " props (" +
            this.props.reduce((n, g) => {
              let k = 0;
              g.traverse((o) => { if (o.isMesh) k++; });
              return n + k;
            }, 0) + " meshes, " + this.props.length + " floor marks), "
          : "no furniture, ") +
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
    this.buildView(L, w);
    this.buildDaylight(L, w);
  },

  // ---------------------------------------------------------------
  // THE DAYLIGHT PATCH: the sun through the window, on the floor.
  //
  // A PARALLELOGRAM — four vertices, two triangles — as wide as the opening,
  // leaning sideways as it comes toward you by daylightSkew per metre of
  // depth. The canvas does the rest (see CorridorTextures.daylight).
  //
  // It leans; it must NOT splay. Sunlight arrives as parallel rays, so the
  // grille lays a grid of PARALLEL lines on the floor — the bar shadows keep
  // the bars' own spacing, they only slide sideways. Widen the far edge
  // instead and the lines of constant u fan out from a point behind the
  // window, and the whole patch reads as a lamp standing in the opening
  // rather than as the sun. (It was built that way first, and that is exactly
  // what it looked like: the shadows appeared to twist.) On screen they still
  // converge toward the far end, of course — that is the camera's
  // perspective, and it is right.
  //
  // The MATERIAL is the exhibition's shared contact-cue material, in its glow
  // mode: ContactCue.makeMaterial + tuneMaterial give exactly what is wanted
  // here — additive blending, depthWrite off and a polygon offset so it cannot
  // fight the floor it lies on — and every other soft floor mark in the
  // exhibition is made the same way. Only the texture and the quad differ.
  // ---------------------------------------------------------------
  buildDaylight: function (L, w) {
    const d = this.data;
    if (!d.daylight || d.daylightDepth <= 0 || d.daylightOpacity <= 0) return;

    // Never let the patch run past the landing, however it is tuned.
    const depth = Math.min(d.daylightDepth, L.run - 0.2);
    if (depth <= 0.05) return;
    const shear = d.daylightSkew * depth; // sideways LEAN over that depth

    // The shadows are described to the canvas as fractions of the opening,
    // taken from the same lattice the bars were built from.
    const lat = this.grilleLattice(w);
    const tex = CorridorTextures.daylight(256, {
      xs: lat.xs.map((x) => +((x - w.x0) / w.w).toFixed(4)),
      ys: lat.ys.map((y) => +((y - w.y0) / w.h).toFixed(4)),
      bx: +(d.grilleBar / w.w).toFixed(4),
      by: +(d.grilleBar / w.h).toFixed(4),
      fx: +(d.grilleFrame / w.w).toFixed(4),
      fy: +(d.grilleFrame / w.h).toFixed(4),
      soft: d.daylightSoftness,
    });
    // The UVs run 0..1 exactly and the patch fades out at its own edges, but
    // clamp anyway: a repeating wrap can bleed the bright wall edge into the
    // dead far edge through bilinear filtering.
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

    const cue = { opacity: d.daylightOpacity, color: d.daylightColor,
                  mode: "glow" };
    const mat = ContactCue.makeMaterial(cue, tex);
    ContactCue.tuneMaterial(mat, cue, null); // null profile -> the cue's own mode
    this.materials.push(mat);

    // THE QUAD, laid out exactly like a PlaneGeometry rotated flat: v = 1 at
    // the wall (smaller z, the corridor runs toward +z), v = 0 at the far edge.
    const y = 0.012;
    const zWall = L.zEnd + 0.002;
    const zOut = L.zEnd + depth;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      w.x0, y, zWall,
      w.x1, y, zWall,
      w.x0 + shear, y, zOut,
      w.x1 + shear, y, zOut,
    ]), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([
      0, 1, 1, 1, 0, 0, 1, 0,
    ]), 2));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    ]), 3));
    geo.setIndex([0, 2, 1, 2, 3, 1]);
    this.geometries.push(geo);
    this.group.add(new THREE.Mesh(geo, mat));

    this.daylightInfo = {
      depth: +depth.toFixed(2), shear: +shear.toFixed(2),
      width: +w.w.toFixed(2),
      lean: +((Math.atan2(shear, depth) * 180) / Math.PI).toFixed(1),
      shadowsX: lat.xs.length + 2, shadowsY: lat.ys.length + 2,
    };
  },

  // ---------------------------------------------------------------
  // THE CONE OF SIGHT through the window, at a given distance beyond the wall.
  //
  // A ray only gets out if it clears BOTH faces of the opening — the inner one
  // and, `wallThickness` further on, the outer one — so the reveal itself is
  // what bounds how steeply anyone can look out. The worst case is an eye as
  // close to the wall as the collider allows, as far to one side of the
  // corridor as it allows, looking through the far edge of the opening.
  //
  // Returns the half-width and the top and bottom the backdrop needs at that
  // distance for the visitor never to see past it.
  // ---------------------------------------------------------------
  viewCoverage: function (L, w, dist) {
    const d = this.data;
    const throwZ = d.viewClearance + L.t; // eye to the OUTER face of the wall
    const eyeY = d.viewEyeY;
    // the eye can stand anywhere across the corridor
    const sx = Math.max(w.x1 + L.halfW, L.halfW - w.x0) / throwZ;
    const syUp = Math.max(0, w.y1 - eyeY) / throwZ;
    const syDn = Math.max(0, eyeY - w.y0) / throwZ;
    const D = dist + d.viewClearance; // eye to the plane
    return {
      halfW: sx * D + Math.abs(w.x),
      top: eyeY + syUp * D,
      bottom: eyeY - syDn * D,
    };
  },

  // ---------------------------------------------------------------
  // THE VIEW itself: sky, then the city in one or two layers. Everything here
  // is a child of the corridor group, so it rides `offset` and disappears with
  // `shown` like the rest of the corridor.
  // ---------------------------------------------------------------
  buildView: function (L, w) {
    const d = this.data;

    // --- SKY. Sized to cover every sightline (see viewCoverage), with the
    // gradient generated in angular space so the size does not stretch it.
    const cov = this.viewCoverage(L, w, d.viewSkyDistance);
    const skyW = d.viewSkyWidth > 0 ? d.viewSkyWidth : cov.halfW * 2;
    const skyTop = d.viewSkyHeight > 0
      ? d.viewEyeY + d.viewSkyHeight / 2 : cov.top;
    const skyBottom = d.viewSkyHeight > 0
      ? d.viewEyeY - d.viewSkyHeight / 2 : cov.bottom;
    const skyTex = CorridorTextures.skyGradient(
      512, d.viewSkyTop, d.viewSkyHorizon, d.viewSkyDistance,
      skyBottom, skyTop, d.viewEyeY);
    this.m.sky = this.mat({ map: skyTex, fog: false });
    const sky = this.addPlane(skyW, skyTop - skyBottom, this.m.sky);
    sky.position.set(w.x, (skyTop + skyBottom) / 2, L.zEnd - d.viewSkyDistance);
    sky.renderOrder = -2;
    this.viewInfo = {
      skyW: skyW, skyH: skyTop - skyBottom,
      skyTop: skyTop, skyBottom: skyBottom, layers: 0,
    };

    // --- THE CITY, far band first so the near one draws over it.
    const band = (src, dist, width, haze, opacity, order) => {
      // ONE material per source per band: the panels differ in their UVs, not
      // in their material, so the whole band is three materials however many
      // panels it takes — and three textures for the entire view.
      const mats = {};
      const matFor = (from) => {
        if (!mats[from]) {
          mats[from] = this.mat({
            map: CorridorTextures.silhouette(from),
            color: new THREE.Color(haze),
            transparent: true,
            opacity: opacity,
            depthWrite: false, // several transparent layers, no depth fighting
          });
        }
        return mats[from];
      };

      // The PNG's own aspect, minus the bottom band viewCrop trims off.
      const ASPECT = 816 / 1456;
      const pngH = width * ASPECT * (1 - d.viewCrop);
      // A SKIRT below the city, down to the lowest sightline: looking down
      // through the window must never find the bottom edge of the plane and
      // the sky under the town. The UVs run below v = 0 for it, and the
      // texture clamps, so the skirt is the image's own solid base row
      // continued downward — no seam, no second mesh.
      const cov = this.viewCoverage(L, w, dist);
      const skirt = Math.max(0, d.viewBottom - cov.bottom);
      const vPerM = 1 / (width * ASPECT);
      const v0 = d.viewCrop - skirt * vPerM;
      const y = d.viewBottom + pngH / 2 - skirt / 2;

      // HOW WIDE THE BAND HAS TO BE: the same cone the sky is sized from, so
      // the city ends exactly where nobody can see it end.
      const need = Math.max(0, cov.halfW - width / 2);
      const side = Math.min(d.viewPanelsMax, Math.ceil(need / width));
      const srcL = d.viewSilhouetteSrcL || src;
      const srcR = d.viewSilhouetteSrcR || src;

      for (let i = -side; i <= side; i++) {
        let from = src;
        if (i !== 0) {
          const odd = Math.abs(i) % 2 === 1;
          if (i < 0) from = odd ? srcL : srcR;
          else from = odd ? srcR : srcL;
        }
        // Mirror everything left of centre: same picture, other way round.
        const flip = i < 0;
        const m = this.addPlane(width, pngH + skirt, matFor(from),
                                flip ? [1, v0, 0, 1] : [0, v0, 1, 1]);
        m.position.set(w.x + i * width, y, L.zEnd - dist);
        m.renderOrder = order;
      }

      this.viewInfo.layers++;
      this.viewInfo["layer" + order] = {
        dist: dist, w: width, h: +(pngH + skirt).toFixed(1),
        skirt: +skirt.toFixed(1), panels: side * 2 + 1,
        bandW: +(width * (side * 2 + 1)).toFixed(0),
        needed: +(cov.halfW * 2).toFixed(0),
      };
    };
    if (d.viewLayers >= 2) {
      band(d.viewSilhouetteSrc2, d.viewDistance2, d.viewWidth2,
           d.viewHaze2, d.viewHazeOpacity2, -1);
    }
    if (d.viewLayers >= 1) {
      band(d.viewSilhouetteSrc, d.viewDistance, d.viewWidth,
           d.viewHaze, d.viewHazeOpacity, 0);
    }
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

    // LATTICE.
    const lat = this.grilleLattice(w);
    lat.xs.forEach((x) => bar(x, (w.y0 + w.y1) / 2, b, w.h - f, b, true));
    lat.ys.forEach((y) => bar(w.x, y, w.w - f, b, b, false));

    const geo = mergeGeometries(parts);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.m.grille);
    this.group.add(mesh);
    this.grilleBars = { nx: lat.xs.length, ny: lat.ys.length,
                        total: parts.length };
  },

  // WHERE THE LATTICE BARS GO, as world coordinates: spaced evenly INSIDE the
  // frame so the pattern is symmetric in the opening rather than starting from
  // one edge and leaving a runt gap at the other.
  //
  // Its own method because the daylight patch needs the same answer to put the
  // shadows in the right places, and two copies of this arithmetic would drift
  // apart the first time anyone touched grilleSpacingX.
  grilleLattice: function (w) {
    const d = this.data;
    const f = d.grilleFrame;
    const run = (lo, hi, pitch) => {
      const span = hi - lo;
      const n = Math.max(0, Math.round(span / pitch) - 1);
      const out = [];
      for (let k = 1; k <= n; k++) out.push(lo + (span * k) / (n + 1));
      return out;
    };
    return {
      xs: run(w.x0 + f, w.x1 - f, d.grilleSpacingX),
      ys: run(w.y0 + f, w.y1 - f, d.grilleSpacingY),
    };
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
  // opening (with the ventilation row cut through it), and — for the closed
  // doors — a leaf and a frame. Same construction as floorplan.buildSide, for the same reason: the
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
      // THE LINTEL: the wall carries on above the opening — as ONE box if
      // there is no vent row, and as four pieces around a real hole if there
      // is: a band from the frame head up to the row, a short piece of wall
      // each side of the row, and a band from the row to the ceiling. Nothing
      // is built BEHIND the row, which is what makes it a hole you can see the
      // corridor through from inside a flat.
      //
      // All four are seg() calls like any other wall, so metricBoxUVs takes
      // their UVs from their own world positions and the paint runs straight
      // on across every join with no restart — the same reason the window's
      // end wall is four boxes rather than a plane with a hole in it.
      const zA = op.z - op.width / 2;
      const zB = op.z + op.width / 2;
      const lintel = op.open ? 0 : rot(i + 1);
      const v = this.ventRow(L, op, true);
      if (!v) {
        seg(zB, zA, op.top, d.height, lintel);
      } else {
        seg(zB, zA, op.top, v.y0, lintel);   // under the row
        seg(zB, v.z1, v.y0, v.y1, lintel);   // the jamb of the hole, +z side
        seg(v.z0, zA, v.y0, v.y1, lintel);   // ...and -z
        seg(zB, zA, v.y1, d.height, lintel); // over the row, up to the ceiling
        this.collectVentBlocks(L, side, op, v);
      }
      cursor = op.z - op.width / 2;
      this.buildDoorFrame(L, side, op);
      if (!op.open) this.buildClosedDoor(L, side, op, i);
      // ...and its gate. Decided here, where the door's neighbours on this
      // wall are to hand for the parking check; built once for the whole
      // corridor by buildGateMeshes.
      this.collectGate(L, side, op, list);
    });
    const lastOpen = list.length > 0 && list[list.length - 1].open;
    seg(cursor, L.zLo, 0, d.height, lastOpen ? 0 : rot(list.length));
  },

  // ---------------------------------------------------------------
  // THE PLACED STENCILS — a stencilled phone number on a NAMED stretch of
  // wall, as against the ones baked into the wall canvas by wallMarks.
  //
  // The two do different jobs and both are wanted. wallMarks gives the corridor
  // its background hum of old advertising: a mark in every bay of the right
  // variant, masked into the paint stack itself, unaimed by construction
  // because the canvas it lives on tiles every 3.6 m. These are the ones you
  // actually walk up to — on the long blank runs of wall between doors, which
  // is exactly where somebody with a can and a card would put one.
  //
  // WHERE, derived like everything else here, from L.openings (which layout()
  // orders from the corridor's mouth toward the end wall):
  //   RIGHT wall, between the 1st and 2nd door
  //   LEFT wall, between the 2nd and 3rd
  // Both stretches are blank at the shipped settings — the seat row moved down
  // to the right wall's second gap and the bike sits in the left wall's first —
  // so a stencil is the only thing on either.
  //
  // A stretch too short to carry one is skipped rather than squeezed: a number
  // crammed between two frames reads as a label, and the whole point of these
  // is that somebody painted them on a wall nobody was looking after.
  // ---------------------------------------------------------------
  stencilSpots: function (L) {
    const d = this.data;
    if (!d.wallStencilDecals || d.wallStencilInk <= 0) return [];
    const fw = d.frameWidth;
    const out = [];
    // The gap between opening i and opening j on `side`, measured between their
    // facing FRAME edges — the frame, not the opening, or a stencil would run
    // under the timber.
    const between = (side, i, j) => {
      const list = L.openings[String(side)] || [];
      if (list.length <= j) return null;
      const a = list[i].z - list[i].width / 2 - fw;
      const b = list[j].z + list[j].width / 2 + fw;
      return { a: a, b: b, gap: a - b, side: side };
    };
    [between(1, 0, 1), between(-1, 1, 2)].forEach((g, k) => {
      if (!g) return;
      const width = Math.min(d.wallStencilDecalWidth, g.gap - 0.3);
      if (width < 0.8) return; // not enough blank wall to be worth one
      out.push({
        side: g.side,
        z: (g.a + g.b) / 2,
        w: width,
        h: width / 3.2, // the quad's proportions; the canvas matches
        seed: this.data.seed * 991 + k * 137,
      });
    });
    return out;
  },

  buildWallStencils: function (L) {
    const d = this.data;
    const spots = this.stencilSpots(L);
    if (!spots.length) return;
    const pal = this.corridorPal;
    spots.forEach((sp) => {
      const tex = CorridorTextures.stencilDecal(512, 160, sp.seed, {
        red: pal.stencil.red,
        dark: pal.stencil.dark,
        ink: d.wallStencilInk,
        tilt: d.wallStencilTilt,
      });
      // Its edges are soft and its middle is full of holes, so it has to blend
      // rather than cut: `transparent`, not alphaTest. depthWrite off and a
      // polygon offset keep it off the wall it lies on — the same treatment
      // every other soft mark in the exhibition gets (see ContactCue).
      const mat = this.mat({
        map: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const m = this.addPlane(sp.w, sp.h, mat);
      m.position.set(sp.side * (L.halfW - 0.006), d.wallStencilDecalY, sp.z);
      // Facing the corridor. The same quarter turn the props take, and it puts
      // the canvas's left-to-right along the viewer's, so the number reads the
      // right way round on both walls.
      m.rotation.y = (-sp.side * Math.PI) / 2;
    });
    this.stencilCount = spots.length;
  },

  // ---------------------------------------------------------------
  // THE FURNITURE — four props from js/props.js, put where the DOORS say.
  //
  // Nothing here is a typed coordinate. The seat row goes in the stretch
  // between the SECOND and THIRD door on the right — counting every opening
  // from the mouth, so the third is the apartment doorway; the bike goes
  // between the first two closed doors on the left. Both come out of
  // L.openings, so changing doorPitch or lengthening the corridor moves the
  // furniture with the doors instead of leaving it standing in a doorway.
  //
  // WHY THIS IS A PURE FUNCTION AND NOT PART OF THE BUILD. walkableRects() has
  // to subtract these footprints from the corridor, and rig-collision calls it
  // whenever IT likes — including before the corridor has ever been built. So
  // the placement is worked out here, from the layout alone, and both
  // buildFurniture (which puts the props there) and walkableRects (which cuts
  // holes in the floor there) ask the same question. Same reason ventRow() and
  // grilleLattice() are methods: two copies of this arithmetic would drift the
  // first time anyone touched a size.
  //
  // `warn` gates the console, because walkableRects can run many times a second
  // and buildFurniture runs once.
  //
  // Returns [{ key, x, z, yaw, spanX, spanZ, opts }], all in the corridor's
  // local frame: spanX / spanZ are the prop's WORLD footprint (a prop is yawed
  // a quarter turn to face the corridor, so its own width becomes spanZ).
  // ---------------------------------------------------------------
  PLAYER_R: 0.25, // rig-collision's default, used only to warn about squeezes

  furnitureLayout: function (L, warn) {
    const d = this.data;
    if (!d.furniture) return [];
    // It asks PropKit how big a bike is, so it cannot answer without it. The
    // collider calls this before anything is built; buildFurniture is where the
    // missing-script warning lives, so this just declines quietly.
    if (typeof PropKit === "undefined") return [];
    const t = L.t;
    const fw = d.frameWidth;
    const off = d.furnitureOffsets || {};
    const nudge = (k) => {
      const e = off[k] || {};
      return { z: e.z || 0, x: e.x || 0, yaw: e.yaw || 0 };
    };
    // A prop stands against a wall facing the corridor. Its own +z is its
    // front, so the yaw that turns it to face inward is a quarter turn against
    // the side — and that same turn puts its WIDTH along the corridor, which is
    // why spanZ below comes from a prop's width and spanX from its depth.
    const facing = (side) => (-side * Math.PI) / 2;
    const WALL_GAP = 0.03; // how far a prop's back stands off the inner face
    const out = [];

    // ---- THE SEAT ROW + ITS TABLE, on the RIGHT wall -------------------
    // BETWEEN THE SECOND AND THIRD DOOR, counting from the corridor's mouth.
    // layout() already orders each wall's openings that way, and this counts
    // ALL of them — the two closed doors and then the apartment doorway —
    // because "the third door on the right" is the third thing that looks like
    // a door as you walk in, whether or not it opens.
    //
    // It used to sit in the first stretch, between the mouth and the first
    // door, where you walked straight into it on arrival.
    const rightList = L.openings["1"] || [];
    const seatOpts = {
      seats: 3, seatWidth: 0.58, seatDepth: 0.55, seatH: 0.42, backH: 0.55,
      color: "#5a2e1e", color2: "#7a4430", wear: 0.6,
      seed: d.seed + 11, unlit: d.furnitureUnlit,
    };
    const rowW = seatOpts.seats * seatOpts.seatWidth;
    const rowD = seatOpts.seatDepth;
    const CLEAR = 0.4; // the elbow room the brief asks for either side of it
    let rowZ;
    let placedInLanding = false;
    if (rightList.length >= 3) {
      // The gap between their facing FRAME edges — the frame, not the opening,
      // or the row would touch the timber.
      const a = rightList[1].z - rightList[1].width / 2 - fw; // 2nd, far edge
      const b = rightList[2].z + rightList[2].width / 2 + fw; // 3rd, near edge
      const gap = a - b;
      if (gap >= rowW + CLEAR) {
        rowZ = (a + b) / 2;
      } else {
        placedInLanding = true;
        if (warn) {
          console.warn(
            "[corridor] no room for the seat row between the second and third " +
              "doors on the right: the gap is " + gap.toFixed(2) +
              " m and the row needs " + (rowW + CLEAR).toFixed(2) +
              " (3 seats of " + seatOpts.seatWidth + " m plus " + CLEAR +
              " m of elbow room). Standing it on the LANDING's right-hand wall " +
              "instead. Widen doorPitch (now " + d.doorPitch + ") to put it back."
          );
        }
      }
    } else {
      placedInLanding = true;
      if (warn) {
        console.warn(
          "[corridor] the right-hand wall has only " + rightList.length +
            " opening(s), so there is no gap between a second and a third " +
            "door for the seat row. Standing it on the landing instead."
        );
      }
    }
    if (placedInLanding) rowZ = L.zBack / 2;
    const seatX = L.halfW - WALL_GAP - rowD / 2;
    const sN = nudge("seats");
    out.push({
      key: "seats",
      x: seatX + sN.x,
      z: rowZ + sN.z,
      yaw: facing(1) + (sN.yaw * Math.PI) / 180,
      spanX: rowD,
      spanZ: rowW + 0.16, // the plinth runs a little past the chairs
      opts: seatOpts,
    });

    // THE TABLE, in front of the row. The brief says "0.45 m in front of the
    // row's centre"; measured from the CENTRE that lands the table 12 cm inside
    // the seats, so it is measured from the row's FRONT FACE instead — which is
    // what the photograph shows anyway, the table almost touching their knees.
    const tableOpts = {
      w: 1.1, d: 0.6, h: 0.45, color: "#141414", laminatePeel: 0.6,
      seed: d.seed + 23, unlit: d.furnitureUnlit,
    };
    const TABLE_GAP = 0.45;
    const rowFront = seatX - rowD / 2;
    const tN = nudge("table");
    // ±6 degrees of "somebody moved it and never straightened it", seeded so
    // it is the same every time this corridor is built.
    const skew = (CorridorTextures.rand(d.seed * 57 + 3)() - 0.5) * 12;
    out.push({
      key: "table",
      x: rowFront - TABLE_GAP + tN.x,
      z: rowZ + tN.z,
      yaw: facing(1) + ((skew + tN.yaw) * Math.PI) / 180,
      spanX: tableOpts.d,
      spanZ: tableOpts.w,
      opts: tableOpts,
    });

    // ---- THE BIKE + THE BAG, on the LEFT wall --------------------------
    const leftList = L.openings["-1"] || [];
    const leftClosed = leftList.filter((o) => !o.open);
    // WHEEL 0.38, not PropKit's 0.3. Against a 0.9 x 2.1 m door the default
    // read as a toddler's balance bike; the reference machine is a 16-inch
    // child's bike, which is what this is. PropKit keeps its own default —
    // this is the corridor deciding what stands in it.
    const bikeOpts = {
      wheel: 0.38, color: "#2b6db3", color2: "#d94b3a", lean: 12,
      seed: d.seed + 37, unlit: d.furnitureUnlit,
    };
    // ...and the bag smaller and duller than PropKit's default, which at
    // 0.35 x 0.45 in near-white stood nearly as tall as the bike and, being
    // the only lit near-white thing in a dark corridor, took the eye straight
    // off it.
    const bagOpts = {
      w: 0.3, h: 0.34, color: "#cdc7b7",
      seed: d.seed + 53, unlit: d.furnitureUnlit,
    };
    // HOW BIG A BIKE IS, asked of PropKit rather than worked out again here.
    // These numbers used to be re-derived in this file from the same fractions
    // childBike builds with — the wheelbase, the saddle height, the handlebar's
    // half-width — and a proportion changed in one place and not the other is
    // exactly how a bike ends up standing through a door frame. bikeMetrics()
    // answers without building anything, which is what this function needs: it
    // runs from walkableRects, long before any prop exists.
    const bm = PropKit.bikeMetrics(bikeOpts);
    const bikeLen = bm.length;
    const reach = bm.reach; // how far the LEANING machine gets toward the wall
    const bikeDepth = bm.depth;
    let bikeZ;
    if (leftClosed.length >= 2) {
      // Midway between the two doors' facing frame edges.
      const a = leftClosed[0].z - leftClosed[0].width / 2 - fw;
      const b = leftClosed[1].z + leftClosed[1].width / 2 + fw;
      bikeZ = (a + b) / 2;
      // A FOLDED GATE may already be parked in that gap. Ask the gates where
      // they went (quietly — collectGate already warned once if it had to) and
      // step the bike clear of any stack that overlaps it.
      const stacks = [];
      [leftClosed[0], leftClosed[1]].forEach((op) => {
        const park = this.gateParkSide(L, -1, op, leftList, false);
        const half = op.width / 2 + fw;
        const s0 = op.z + park * half;
        const s1 = s0 + park * d.gateStack;
        stacks.push({ lo: Math.min(s0, s1), hi: Math.max(s0, s1) });
      });
      const hits = (z) =>
        stacks.some((s) => z + bikeLen / 2 > s.lo && z - bikeLen / 2 < s.hi);
      if (d.gate && hits(bikeZ)) {
        const tryZ = [bikeZ + d.gateStack, bikeZ - d.gateStack].filter(
          (z) => z - bikeLen / 2 > b && z + bikeLen / 2 < a && !hits(z)
        );
        if (tryZ.length) {
          bikeZ = tryZ[0];
        } else if (warn) {
          console.warn(
            "[corridor] the bike's gap between the first two doors on the " +
              "left is taken by a folded gate stack, and there is no " +
              (bikeLen.toFixed(2)) + " m of clear wall either side of it " +
              "(the gap is " + (a - b).toFixed(2) + " m). Leaving the bike " +
              "where it is — it will overlap the stack. Widen doorPitch, " +
              "narrow gateStack, or nudge it with furnitureOffsets.bike.z."
          );
        }
      }
    } else {
      bikeZ = L.zEnd / 2;
      if (warn) {
        console.warn(
          "[corridor] fewer than two closed doors on the left wall, so the " +
            "bike has no gap between doors to lean in. Putting it halfway " +
            "down the left wall instead."
        );
      }
    }
    // How far the tyres stand off the wall, so the LEANING top clears it by
    // WALL_GAP rather than going through it.
    const bikeX = -(L.halfW - WALL_GAP - reach);
    const bN = nudge("bike");
    out.push({
      key: "bike",
      x: bikeX + bN.x,
      z: bikeZ + bN.z,
      yaw: facing(-1) + (bN.yaw * Math.PI) / 180,
      spanX: bikeDepth,
      spanZ: bikeLen,
      opts: bikeOpts,
    });

    // THE BAG, on the floor beside the rear wheel — which is the end toward the
    // MOUTH, the bike's own front pointing away down the corridor.
    const gN = nudge("bag");
    out.push({
      key: "bag",
      x: -(L.halfW - WALL_GAP - bagOpts.w / 2) + gN.x,
      z: bikeZ + bikeLen / 2 + bagOpts.w * 0.62 + gN.z,
      yaw: facing(-1) + (gN.yaw * Math.PI) / 180,
      spanX: bagOpts.w,
      spanZ: bagOpts.w,
      opts: bagOpts,
    });

    // ONE LAST CHECK: none of this may seal the corridor. A footprint plus a
    // player radius each side has to leave somebody room to walk past it.
    if (warn) {
      out.forEach((p) => {
        const free =
          p.x > 0
            ? p.x - p.spanX / 2 - this.PLAYER_R - (-L.halfW + this.PLAYER_R)
            : L.halfW - this.PLAYER_R - (p.x + p.spanX / 2 + this.PLAYER_R);
        if (free < 0.35) {
          console.warn(
            "[corridor] the " + p.key + " leaves only " + free.toFixed(2) +
              " m of walkable corridor beside it (player radius " +
              this.PLAYER_R + " m). The collider will make it hard or " +
              "impossible to get past. Widen the corridor (`width` is " +
              d.width + ") or move it with furnitureOffsets." + p.key + ".x."
          );
        }
      });
    }
    return out;
  },

  // Put them there. Each prop is a THREE.Group from PropKit, added to the
  // corridor's own group — so it rides `offset`, hides with `shown` and dies in
  // teardown() — plus one soft floor mark under it.
  buildFurniture: function (L) {
    const d = this.data;
    if (!d.furniture) return;
    if (typeof PropKit === "undefined") {
      console.warn(
        "[corridor] `furniture` is on but PropKit is not loaded. Add " +
          "<script src=\"js/props.js\"></script> to index.html BEFORE " +
          "js/zone-a-corridor.js. Building the corridor without it."
      );
      return;
    }
    const make = {
      seats: (o) => PropKit.seatRow(o),
      table: (o) => PropKit.lowTable(o),
      bike: (o) => PropKit.childBike(o),
      bag: (o) => PropKit.plasticBag(o),
    };
    // ONE floor-mark texture for all of them: the exhibition's shared contact
    // cue, in SHADOW mode. The corridor is unlit and its floor is dark cement,
    // so unlike every other cue in the show this one is NOT subscribed to the
    // environment retune — there is no environment out here to follow, and a
    // preset that switched cues to glow would light four bright patches in a
    // corridor whose whole point is that the light is painted on. Same
    // reasoning, and the same `null` profile, as buildDaylight.
    const cue = { opacity: 0.35, color: "#000000", mode: "shadow" };
    const cueTex = ContactCue.makeTexture(0.55);
    this.textures.push(cueTex);
    const cueMat = ContactCue.makeMaterial(cue, cueTex);
    ContactCue.tuneMaterial(cueMat, cue, null);
    this.materials.push(cueMat);

    this.furnitureLayout(L, true).forEach((p) => {
      const g = make[p.key](p.opts);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.yaw;
      this.group.add(g);
      this.props.push(g);

      // THE FLOOR MARK: a quad a third larger than the footprint, lying just
      // above the floor. Axis-aligned to the corridor rather than to the prop,
      // because it is a smudge of shadow and not a decal of the object.
      const mark = this.addPlane(p.spanX * 1.3, p.spanZ * 1.3, cueMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(p.x, 0.006, p.z);
    });
  },

  // ---------------------------------------------------------------
  // THE SCISSOR GATES (cửa kéo)
  //
  // The folding steel gate that stands outside every door in a chung cư:
  // stretched across the opening and padlocked when the flat is shut, shoved
  // into a stack against the jamb when it is not. It is what makes a corridor
  // of doors read as a corridor of HOMES — a door says there is a room behind
  // it, a gate says somebody locks it.
  //
  // ONE GEOMETRY PER STATE, FOR THE WHOLE CORRIDOR. A gate is forty-odd flat
  // bars, and a mesh per bar would be three hundred draw calls over seven
  // doors. Every opening here is the same width (layout() gives them all
  // doorWidth), the lattice lies in the y-z plane whichever wall it hangs on,
  // and both states are built SYMMETRIC in z — so an extended gate and a folded
  // one are each one merged BufferGeometry, and one door differs from the next
  // by a TRANSLATION and nothing else. That is what lets InstancedMesh do it:
  // two draw calls for every gate in the corridor, one more for all the tracks
  // and one for all the padlocks. Four, for the lot, however long the corridor
  // gets.
  //
  // THE LATTICE, both states out of one generator. Nodes sit on a diamond grid
  // `cells` wide and `rows` tall, and the bars are the LONG straps through it,
  // one family per diagonal — which is what a real gate is: long steel running
  // corner to corner and riveted where it crosses, not a mesh of short pieces.
  // Extended, the span is the opening plus its frame and the straps land near
  // 60 degrees off horizontal; folded, the SAME bar count is squeezed into
  // gateStack and the identical construction takes them up to near 80, which is
  // exactly what collapsing a pantograph does to it.
  //
  // gateHeight is DERIVED, not a tunable: doorHeight - GATE_DROP. A gate is cut
  // to its own opening, and a number that could disagree with doorHeight is a
  // number that eventually will.
  // ---------------------------------------------------------------

  // ONE FLAT BAR, as a box from `a` to `b` in the wall's y-z plane. `w` is the
  // strap's width across its face; the thickness is the other way. These are
  // FLAT bars on edge, and which way round that is decides whether the gate
  // reads as steel or as wire.
  gateStrap: function (parts, a, b, w, thick, tile) {
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dy, dz);
    if (len < 1e-4) return;
    const g = new THREE.BoxGeometry(thick, w, len);
    // u ALONG the bar, v across its section — the same mapping the window
    // grille's iron uses, which is why the same canvas recipe serves both. The
    // phase comes from where the bar STANDS, so no two straps in the lattice
    // are rusted alike and the whole gate still costs one texture.
    const pos = g.attributes.position;
    const uvs = g.attributes.uv;
    const phase = (a.y + a.z) * 3.7;
    for (let i = 0; i < pos.count; i++) {
      const face = Math.floor(i / 4); // 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z
      uvs.setXY(
        i,
        (phase + pos.getZ(i)) / tile,
        face === 0 || face === 1
          ? pos.getY(i) / w + 0.5
          : pos.getX(i) / thick + 0.5
      );
    }
    // A box's length is along its local z, and Rx(t) takes (0, 0, 1) to
    // (0, -sin t, cos t) — so the rotation that aims it at (dy, dz) is MINUS
    // that angle. A vertical bar therefore comes out with its width across z,
    // which is what a vertical strap on a gate actually is.
    g.rotateX(-Math.atan2(dy, dz));
    g.translate(0, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
  },

  // THE LATTICE. `span` is how wide the gate stands — the opening plus its
  // frame when it is stretched across, gateStack when it is folded — and
  // `cells` and `rows` are the same for both, which is what "the same gate,
  // collapsed" means.
  //
  // Nodes are (i, j), i across and j up, i in 0..2*cells and j in 0..2*rows,
  // and a node exists wherever i + j is even. A strap of the first family runs
  // along i - j = const and one of the second along i + j = const; each is a
  // single straight bar from where that line enters the rectangle to where it
  // leaves, so the count is cells + rows + 1 per family however fine the grid.
  //
  // SYMMETRIC IN Z, deliberately: the heavy leading stile is built at BOTH
  // ends. A gate that parks toward +z leads with its -z end and the other way
  // round, and one symmetric geometry serves both instead of two mirrored ones.
  gateGeometry: function (span, height, cells, rows, bar, thick, tile) {
    const parts = [];
    const hx = span / (2 * cells);
    const hy = height / (2 * rows);
    const nx = 2 * cells;
    const ny = 2 * rows;
    const P = (i, j) => ({ z: i * hx - span / 2, y: j * hy });

    for (let c = -ny; c <= nx; c += 2) {
      const j0 = Math.max(0, -c); // i - j = c
      const j1 = Math.min(ny, nx - c);
      if (j1 > j0) {
        this.gateStrap(parts, P(j0 + c, j0), P(j1 + c, j1), bar, thick, tile);
      }
    }
    for (let c = 0; c <= nx + ny; c += 2) {
      const j0 = Math.max(0, c - nx); // i + j = c
      const j1 = Math.min(ny, c);
      if (j1 > j0) {
        this.gateStrap(parts, P(c - j0, j0), P(c - j1, j1), bar, thick, tile);
      }
    }

    // THE PIVOT BARS: a vertical strap on every column where the diamonds meet,
    // which is where a real gate carries its rivets and its castors.
    for (let k = 0; k <= cells; k++) {
      const z = k * 2 * hx - span / 2;
      this.gateStrap(parts, { y: 0, z: z }, { y: height, z: z }, bar, thick,
                     tile);
    }

    // TOP AND BOTTOM RAIL: what the gate hangs from, and what it runs on.
    [bar / 2, height - bar / 2].forEach((y) => {
      this.gateStrap(parts, { y: y, z: -span / 2 }, { y: y, z: span / 2 }, bar,
                     thick * 1.6, tile);
    });

    // THE LEADING STILES. Twice the bar and twice the thickness: it is the only
    // part of a gate anybody ever touches, and it is what the padlock goes
    // through.
    [-1, 1].forEach((s) => {
      const z = s * (span / 2 - bar);
      this.gateStrap(parts, { y: 0, z: z }, { y: height, z: z }, bar * 2,
                     thick * 2.4, tile);
    });
    return { geometry: mergeGeometries(parts), bars: parts.length };
  },

  // THE TRACK AND THE FLOOR RAIL, as one geometry: the channel the gate hangs
  // from — above the frame head and under the vent row — and the shallow rail
  // it runs on. Both are as long as the opening PLUS the stack, because that is
  // how far the gate has to travel.
  //
  // The rail is set out past frameDepth rather than centred on the gate's own
  // plane, so it runs in FRONT of the jambs instead of through their feet. It
  // is 10 mm high; the collider keeps the camera playerRadius (0.25 m) off the
  // wall and the whole assembly is 50 mm deep, so none of this needs a collider
  // notch — see the note in walkableRects.
  gateTrackGeometry: function (len, headY, depth, frameDepth) {
    const parts = [];
    const CH = 0.045; // the channel's face height
    const RAIL = 0.01;
    const RAIL_D = 0.025;
    const chan = new THREE.BoxGeometry(depth * 0.7, CH, len);
    chan.translate(0, headY + CH / 2, 0);
    parts.push(chan);
    const rail = new THREE.BoxGeometry(RAIL_D, RAIL, len);
    // Its own x is measured from the gate plane back toward the wall, and the
    // gate plane is gateTrackDepth out; so this puts the rail's near edge on
    // the frame's outer face exactly.
    rail.translate(depth - frameDepth - RAIL_D / 2, RAIL / 2, 0);
    parts.push(rail);
    return mergeGeometries(parts);
  },

  // THE PADLOCK on a gate that is locked: a body, a shackle over it, and three
  // links of chain up to the stile. Built once at the origin and dropped at
  // every locked gate. Boxes, not tori — a torus is three hundred triangles for
  // something three centimetres across that nobody will ever get closer to than
  // the collider's quarter metre.
  gatePadlockGeometry: function () {
    const parts = [];
    parts.push(new THREE.BoxGeometry(0.022, 0.05, 0.036));
    [-1, 1].forEach((s) => {
      const g = new THREE.BoxGeometry(0.008, 0.028, 0.008);
      g.translate(0, 0.037, s * 0.012);
      parts.push(g);
    });
    const top = new THREE.BoxGeometry(0.008, 0.008, 0.032);
    top.translate(0, 0.049, 0);
    parts.push(top);
    // Three links of chain, each turned a quarter on the last.
    for (let k = 0; k < 3; k++) {
      const flat = k % 2 === 0;
      const g = new THREE.BoxGeometry(flat ? 0.006 : 0.016, 0.02,
                                      flat ? 0.016 : 0.006);
      g.translate(0, 0.062 + k * 0.017, 0);
      parts.push(g);
    }
    return mergeGeometries(parts);
  },

  // WHICH SIDE the folded stack parks on, as +1 (toward +z) or -1.
  //
  //   "hinge"  the side the wooden door itself is hung on, which is the +z jamb
  //            everywhere here (buildOpenDoor pivots there)
  //   "far"    the other one
  //   "seed"   per door, from the same doorKey its paint and its vent pattern
  //            come from
  //
  // ...and then CHECKED, because a stack is gateStack wide and has to go
  // somewhere real: if it would run into a neighbouring door's frame, or off
  // the end of the run, it parks on the other side instead; if neither side is
  // clear the corridor says so and parks it where it was asked to. The vent row
  // can never be in the way at any setting — the row lives inside the lintel,
  // between the jambs, and the stack is always outside them.
  gateParkSide: function (L, side, op, list, warn) {
    const d = this.data;
    const preferred =
      d.gatePark === "far"
        ? -1
        : d.gatePark === "seed"
        ? this.doorKey(op.z, side) % 2 === 0
          ? 1
          : -1
        : 1; // "hinge"
    const half = op.width / 2 + d.frameWidth;
    const clear = (s) => {
      const a = op.z + s * half;
      const b = a + s * d.gateStack;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (lo < L.zEnd || hi > L.zBack) return false; // off the end of the run
      return !list.some((o) => {
        if (o === op) return false;
        const oh = o.width / 2 + d.frameWidth;
        return o.z + oh > lo && o.z - oh < hi;
      });
    };
    if (clear(preferred)) return preferred;
    if (clear(-preferred)) return -preferred;
    // Quietly, when it is the FURNITURE asking where a stack went rather than
    // the gate builder deciding: collectGate has already said this once.
    if (warn === false) return preferred;
    console.warn(
      "[corridor] the folded gate beside the door at z " + op.z.toFixed(2) +
        " has nowhere to park: a " + d.gateStack + " m stack runs into a " +
        "neighbouring frame, or off the end of the run, on BOTH sides. " +
        "doorPitch is " + d.doorPitch + " m and a door with its frame is " +
        (op.width + d.frameWidth * 2).toFixed(2) + " m wide. Widen doorPitch " +
        "or narrow gateStack. Parking it on the preferred side regardless."
    );
    return preferred;
  },

  // ONE DOOR'S GATE — decided and collected, not built. buildGateMeshes turns
  // the corridor's whole set into four draw calls once both walls are up.
  //
  // LOCKED OR OPEN. The three APARTMENT doorways are always folded: their doors
  // stand open, their pictures are the point of the whole room, and a lattice
  // of steel across that is the exhibition behind bars. Every CLOSED door takes
  // its chances — locked with probability gateLockedRatio, drawn from the
  // corridor's own seeded PRNG through doorKey, so the same corridor always
  // locks the same doors and changing `seed` reshuffles the entire run at once.
  //
  // Through the PRNG and not doorKey % 100: doorKey is a rounded linear
  // function of z, so its low digits march in step down the corridor and a
  // straight modulo would have locked doors in a repeating pattern rather than
  // at random.
  collectGate: function (L, side, op, list) {
    const d = this.data;
    if (!d.gate) return;
    const locked =
      !op.open &&
      CorridorTextures.rand(this.doorKey(op.z, side) * 733 + 11)() <
        d.gateLockedRatio;
    const park = this.gateParkSide(L, side, op, list, true);
    const half = op.width / 2 + d.frameWidth;
    this.gates.push({
      // The gate's plane: gateTrackDepth out from the wall's inner face, which
      // clears the frame (frameDepth 0.045) by five millimetres.
      x: side * (L.halfW - d.gateTrackDepth),
      y: 0,
      // EXTENDED sits centred on the opening; FOLDED sits just outside the
      // frame on its park side, its own width beyond it.
      z: locked ? op.z : op.z + park * (half + d.gateStack / 2),
      // The track has to cover the opening AND the stack, so it is centred half
      // a stack over toward wherever this gate parks.
      trackZ: op.z + (park * d.gateStack) / 2,
      locked: locked,
      park: park,
      op: op,
      side: side,
    });
  },

  // EVERY GATE IN THE CORRIDOR: two lattice geometries, one track, one padlock,
  // four InstancedMeshes, two materials.
  buildGateMeshes: function (L) {
    const d = this.data;
    if (!this.gates.length) return;
    const H = d.doorHeight - GATE_DROP;
    const span = d.doorWidth + d.frameWidth * 2;
    const cells = Math.max(2, Math.round(d.gateCells));
    // ROWS come from the ANGLE, not from a tunable of their own: at `cells`
    // across, a diamond is span/cells wide, and the row count that puts the
    // diagonals nearest 60 degrees off horizontal is height / (width * tan 60).
    // Deriving it is also what keeps the lattice CLOSED at both rails — a
    // fractional row would leave the top course cut through.
    const rows = Math.max(2, Math.round(H / ((span / cells) * Math.sqrt(3))));
    const tile = d.grilleTile; // metres of bar per texture repeat, as the grille
    const ext = this.gateGeometry(span, H, cells, rows, d.gateBar,
                                  d.gateBarThick, tile);
    const fold = this.gateGeometry(d.gateStack, H, cells, rows, d.gateBar,
                                   d.gateBarThick, tile);
    const track = this.gateTrackGeometry(
      span + d.gateStack,
      d.doorHeight + d.frameWidth + 0.005, // just clear of the frame head
      d.gateTrackDepth,
      d.frameDepth
    );
    const lock = this.gatePadlockGeometry();
    this.geometries.push(ext.geometry, fold.geometry, track, lock);

    const place = (geo, material, list, at) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, material, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((g, i) => {
        const p = at(g);
        m4.makeTranslation(p.x, p.y, p.z);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.instanced.push(im);
    };

    const locked = this.gates.filter((g) => g.locked);
    const folded = this.gates.filter((g) => !g.locked);
    place(ext.geometry, this.m.gate, locked, (g) => g);
    place(fold.geometry, this.m.gate, folded, (g) => g);
    place(track, this.m.gateTrack, this.gates,
          (g) => ({ x: g.x, y: 0, z: g.trackZ }));
    // THE PADLOCKS hang on the leading stile at 1.0 m — the end AWAY from
    // wherever this gate would park, which is the end that meets the jamb. A
    // seeded nudge each, because they are hung by hand.
    place(lock, this.m.gate, locked, (g) => {
      const r = CorridorTextures.rand(this.doorKey(g.op.z, g.side) * 97 + 3);
      const lead = -g.park * (span / 2 - d.gateBar);
      return {
        x: g.x - g.side * 0.024, // on the corridor side of the lattice
        y: 1.0 + (r() - 0.5) * 0.06,
        z: g.z + lead - g.park * 0.014 + (r() - 0.5) * 0.012,
      };
    });
    this.gateInfo = {
      locked: locked.length,
      folded: folded.length,
      bars: ext.bars,
      rows: rows,
      cells: cells,
      // The straps' angle off horizontal, which is the number to look at if a
      // gate ever reads wrong: an extended one should be near 60, a folded one
      // steep enough to stack.
      angle: (Math.atan2(H / rows, span / cells) * 180) / Math.PI,
      foldAngle: (Math.atan2(H / rows, d.gateStack / cells) * 180) / Math.PI,
    };
  },

  // ---------------------------------------------------------------
  // THE VENTILATION ROW above one opening — WHERE it goes, or null if it does
  // not fit. Its own method because two builders need the same answer and must
  // not compute it twice: buildSideWall cuts the hole in the CORRIDOR wall, and
  // lineCorridorWall cuts the matching hole in the skin an apartment paints on
  // its side of that same wall. Two copies of this arithmetic would drift apart
  // the first time anyone touched ventGap, and the room would end up with a
  // painted panel over the hole — exactly the same reason grilleLattice() is a
  // method rather than a repeated sum.
  //
  // `warn` gates the console: the wall builder passes true, the room's skin
  // passes false, so a door that does not fit says so once and not twice.
  //
  // The row is CENTRED on the opening and lives INSIDE the lintel, so it can
  // never be wider than the opening itself — a wider row would want a hole in
  // the full-height wall segments beside the door, which is a different
  // building. Columns are dropped until it fits rather than the row being
  // silently squashed, because ventBlock is a real block size and 0.2 m means
  // 0.2 m.
  // ---------------------------------------------------------------
  ventRow: function (L, op, warn) {
    const d = this.data;
    if (!d.vent || d.ventBlock <= 0 || d.ventCols < 1 || d.ventRows < 1) {
      return null;
    }
    // Clear of the frame HEAD, not of the opening: the frame stands proud of
    // the wall and its head sits a frameWidth above op.top, so measuring from
    // op.top would put the row's bottom edge into the timber.
    const head = op.top + d.frameWidth;
    const y0 = head + d.ventGap;
    const rowH = d.ventRows * d.ventBlock;
    const y1 = y0 + rowH;
    const CLEAR = 0.1; // concrete that must be left between the row and the slab
    if (y1 + CLEAR > d.height) {
      if (warn) {
        console.warn(
          "[corridor] no room for the vent row over the door at z " +
            op.z.toFixed(2) + ": the frame head is at " + head.toFixed(2) +
            " m, and ventGap " + d.ventGap + " + " + d.ventRows + " x " +
            d.ventBlock + " m of block would take the row's top to " +
            y1.toFixed(2) + " m, inside the " + CLEAR + " m of ceiling the " +
            "wall has to keep (height " + d.height + "). Lower ventGap, drop " +
            "ventRows, or raise `height`. That door goes without."
        );
      }
      return null;
    }
    let cols = d.ventCols;
    while (cols > 1 && cols * d.ventBlock > op.width) cols--;
    if (cols * d.ventBlock > op.width) {
      if (warn) {
        console.warn(
          "[corridor] no room for the vent row over the door at z " +
            op.z.toFixed(2) + ": one " + d.ventBlock + " m block is wider " +
            "than the " + op.width.toFixed(2) + " m opening it has to sit " +
            "inside. That door goes without."
        );
      }
      return null;
    }
    if (warn && cols < d.ventCols) {
      console.warn(
        "[corridor] the vent row over the door at z " + op.z.toFixed(2) +
          " has been cut from " + d.ventCols + " blocks to " + cols +
          ": " + d.ventCols + " x " + d.ventBlock + " m is wider than the " +
          op.width.toFixed(2) + " m opening, and the row sits inside the " +
          "lintel. Narrow ventBlock or widen doorWidth."
      );
    }
    const rowW = cols * d.ventBlock;
    return {
      y0: y0,
      y1: y1,
      z0: op.z - rowW / 2,
      z1: op.z + rowW / 2,
      w: rowW,
      h: rowH,
      cols: cols,
      rows: d.ventRows,
      depth: d.ventDepth > 0 ? d.ventDepth : L.t,
    };
  },

  // The blocks that fill that hole. Nothing is BUILT here: every block in the
  // corridor is the same geometry standing at a different place, and both walls
  // want it in the same orientation (the block's faces look along x either
  // way), so a placement is a position and nothing else. They are collected by
  // pattern and instanced once, at the end of the walls — see buildVentMeshes.
  //
  // WHICH PATTERN: "mixed" gives each door one of the three, seeded from
  // doorKey — the same number its atlas cell comes from — so a door's paint and
  // its vent pattern travel together when the seed changes, and the same
  // corridor always has the same blocks over the same doors.
  collectVentBlocks: function (L, side, op, v) {
    const d = this.data;
    const pattern =
      d.ventPattern === "mixed"
        ? CorridorTextures.ventPatternFor(this.doorKey(op.z, side))
        : d.ventPattern;
    const list =
      this.ventPlacements[pattern] || (this.ventPlacements[pattern] = []);
    const x = side * (L.halfW + L.t / 2); // the wall's own centreline
    for (let r = 0; r < v.rows; r++) {
      for (let c = 0; c < v.cols; c++) {
        list.push({
          x: x,
          y: v.y0 + (r + 0.5) * d.ventBlock,
          z: v.z0 + (c + 0.5) * d.ventBlock,
        });
      }
    }
  },

  // ONE BLOCK'S TWO FACES, as a single geometry: two quads in the wall's y-z
  // plane, ventDepth apart, each looking out of its own side of the wall. That
  // separation is the whole illusion — you look through the near face's holes,
  // past the far face's, and out the other side, and walking along the corridor
  // makes the two slide against each other exactly as a 15 cm-deep block does.
  //
  // The faces are `side: DoubleSide` (see buildVentMeshes): through a hole you
  // are looking at the BACK of the far face, and without that it would not be
  // drawn at all — you would see straight through to the room and the block
  // would read as a stencil rather than as something with a thickness.
  ventPaneGeometry: function (block, depth) {
    const INSET = 0.004; // just inside the wall's faces, not flush with them
    const parts = [];
    [-1, 1].forEach((s) => {
      const g = new THREE.PlaneGeometry(block, block);
      // A plane is born in the x-y plane looking along +z; yaw it into the
      // wall's plane so it looks along the side's own x. The two end up
      // mirrored in u relative to each other, which is what the two faces of a
      // real block are.
      g.rotateY((s * Math.PI) / 2);
      g.translate(s * (depth / 2 - INSET), 0, 0);
      parts.push(g);
    });
    return mergeGeometries(parts);
  },

  // ...and the block's outer frame: a square tube round its border, four thin
  // boxes merged. It is what gives the border a real edge — at the row's rim,
  // and anywhere you look along the wall rather than at it, two paper-thin
  // quads would show themselves for what they are. One geometry, one material,
  // one instanced draw call for every block in the corridor.
  ventRingGeometry: function (block, depth) {
    const b = block * 0.09; // the border's own width
    const parts = [];
    const box = (sy, sz, cy, cz) => {
      const g = new THREE.BoxGeometry(depth, sy, sz);
      g.translate(0, cy, cz);
      parts.push(g);
    };
    box(b, block, (block - b) / 2, 0); // top
    box(b, block, -(block - b) / 2, 0); // bottom
    box(block - b * 2, b, 0, (block - b) / 2); // +z side
    box(block - b * 2, b, 0, -(block - b) / 2); // -z side
    return mergeGeometries(parts);
  },

  // EVERY VENT BLOCK IN THE CORRIDOR, in a handful of draw calls. The walls
  // collected placements; this turns them into one InstancedMesh per pattern
  // for the faces plus one for all the frames — so twelve doors' worth of
  // blocks is four draw calls rather than a hundred and forty, and the whole
  // row costs two geometries and at most four materials however long the
  // corridor gets.
  //
  // The face materials are made HERE rather than in build()'s table because
  // which patterns are in use is not known until the walls have been laid out:
  // a corridor set to a single ventPattern draws a single canvas.
  buildVentMeshes: function (L) {
    const d = this.data;
    const patterns = Object.keys(this.ventPlacements);
    if (!patterns.length) return;
    const depth = d.ventDepth > 0 ? d.ventDepth : L.t;
    const pane = this.ventPaneGeometry(d.ventBlock, depth);
    const ring = this.ventRingGeometry(d.ventBlock, depth);
    this.geometries.push(pane, ring);

    const place = (geo, material, list) => {
      const im = new THREE.InstancedMesh(geo, material, list.length);
      const m4 = new THREE.Matrix4();
      list.forEach((p, i) => {
        m4.makeTranslation(p.x, p.y, p.z);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      // An InstancedMesh carries its own bounding sphere over every instance,
      // and THREE computes it lazily the first time the frustum asks. Doing it
      // here instead keeps that work out of the first frame after a teleport,
      // which is the one frame in the corridor's life that has a budget.
      im.computeBoundingSphere();
      this.group.add(im);
      this.instanced.push(im);
      return im;
    };

    this.m.vent = {};
    const all = [];
    patterns.forEach((pattern) => {
      const list = this.ventPlacements[pattern];
      this.m.vent[pattern] = this.mat({
        map: CorridorTextures.ventFace(256, d.seed, pattern, d.ventColor,
                                       d.ventGrime),
        // The holes are cut out of the canvas's ALPHA, not out of an alphaMap
        // — see the note on ventFace for why the green channel is a trap here.
        // alphaTest and not `transparent`, so the blocks stay in the opaque
        // pass and sort by depth like everything else.
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      });
      place(pane, this.m.vent[pattern], list);
      all.push.apply(all, list);
    });
    place(ring, this.m.ventFrame, all);
    this.ventCount = all.length;
  },

  // WHICH DOOR a given opening is: an integer key seeded from where it stands
  // (z, side) and the corridor's seed, so the same corridor always has the same
  // doors and neighbours differ. Everything per-door derives from it — the
  // atlas cell (doorPick), and later the vent pattern and the gate's state —
  // so one door's choices all travel together when the seed changes.
  doorKey: function (z, side) {
    return Math.abs(Math.round(z * 7 + (side + 1) * 3 + this.data.seed));
  },
  // The atlas cell (0..3) that door's two faces sample — front and back alike.
  doorPick: function (z, side) {
    return this.doorKey(z, side) % 4;
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
  // corridor face. The opening stops at the top of the leaf: the ventilation
  // is a row of pierced blocks in the wall above the frame, not a fanlight.
  buildClosedDoor: function (L, side, op, i) {
    const d = this.data;
    const cx = side * (L.halfW + L.t / 2);
    // The leaf itself: plain dark timber on its edges, the atlas on its face.
    this.addBox(d.leafThickness, d.doorHeight, op.width, cx, d.doorHeight / 2,
                op.z, this.m.doorEdge);

    // Which of the four doors in the atlas this one is. Seeded by position, so
    // the same corridor always has the same doors, and neighbours differ.
    const pick = this.doorPick(op.z, side);
    const faceX = side * (L.halfW + L.t / 2 - d.leafThickness / 2 - 0.004);
    const face = this.addPlane(op.width, d.doorHeight, this.m.door,
                               CorridorTextures.doorCellUV(pick));
    face.position.set(faceX, d.doorHeight / 2, op.z);
    face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    // No back face: a closed door's other side is buried in the wall segment
    // behind it and cannot be seen from anywhere.
    //
    // Nothing above the leaf either. There used to be a louvred transom plane
    // filling the rest of the opening; the opening now stops at the top of the
    // leaf, and the ventilation is where it belongs — a row of pierced blocks
    // in the wall ABOVE the frame, built by the wall itself (buildVentRow), on
    // open doorways and closed doors alike.
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
    // OVER THE DOORWAY. One panel, unless the vent row runs through here —
    // then it is cut round the hole in exactly the pieces the corridor wall
    // itself was cut into, from the same ventRow() answer. Without this the
    // room paints a solid panel straight over its own vent and the hole is
    // only a hole from the corridor side.
    const op = (L.openings[String(r.side)] || []).filter((o) => o.room === r)[0];
    const v = op ? this.ventRow(L, op, false) : null;
    if (!v) {
      panel(dz0, dz1, d.doorHeight, H);
    } else {
      panel(dz0, dz1, d.doorHeight, v.y0);
      panel(dz0, v.z0, v.y0, v.y1);
      panel(v.z1, dz1, v.y0, v.y1);
      panel(dz0, dz1, v.y1, H);
    }
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

    // The door's two faces. Its atlas cell is picked the same way a closed
    // door's is, so the apartments' doors belong to the same set of four; the
    // FRONT (corridor side, on the leaf's outer face) samples the front atlas
    // and the BACK, on the other side of the same leaf, samples the same cell
    // of the back atlas. Both planes are children of the pivot, so they swing
    // with the leaf. Yawed opposite ways so each looks out of its own side;
    // that also mirrors the back's picture relative to the front, which is
    // exactly what walking round a door does.
    const pick = this.doorPick(r.z, r.side);
    const uv = CorridorTextures.doorCellUV(pick);
    const faceFor = (material, sign) => {
      const fgeo = new THREE.PlaneGeometry(d.doorWidth, d.doorHeight);
      setPlaneUVs(fgeo, uv[0], uv[1], uv[2], uv[3]);
      this.geometries.push(fgeo);
      const face = new THREE.Mesh(fgeo, material);
      face.position.set(sign * (d.leafThickness / 2 + 0.004), d.doorHeight / 2,
                        -d.doorWidth / 2);
      // A plane looks along its local +z; yaw it so that is the sign's way.
      face.rotation.y = sign < 0 ? -Math.PI / 2 : Math.PI / 2;
      pivot.add(face);
      return face;
    };
    faceFor(this.m.door, -r.side);     // toward the corridor (before the swing)
    faceFor(this.m.doorBack, r.side);  // toward the room
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
    this.instanced.forEach(function (im) {
      im.dispose();
    });
    this.instanced = [];
    this.props.forEach(function (g) {
      if (g.userData && g.userData.dispose) g.userData.dispose();
    });
    this.props = [];
    this.stencilCount = 0;
    this.textures.forEach(function (t) {
      t.dispose();
    });
    this.textures = [];
    this.ventPlacements = {};
    this.ventCount = 0;
    this.gates = [];
    this.gateInfo = null;
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
