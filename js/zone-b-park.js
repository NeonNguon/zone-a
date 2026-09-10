// ================================================================
// Zone B — the park. "The Lottery of Forgotten Dreams" left its coral room and
// went outdoors: a 40 × 40 m concrete square in a lawn, the Saigon skyline in
// haze far off on every side. You walk out of the foyer through the same coral
// hallway as before, and the square begins where the hallway ends.
//
// Loaded in <head> AFTER bench.js (the benches are terrazzo-bench instances)
// and rig-collision.js (RigRegions, which the square adds its walkable ground
// to), and BEFORE zone-b-teleport.js, whose Terminal A stands on the square and
// reads its centre from ParkConfig below.
//
// WHAT IS IN HERE:
//   park-root  — one component on #zone-b-park, a SIBLING of #floorplan (it is
//                ground and scenery, so it persists across environment
//                switches like the walls and the cues do). The entity sits at
//                the world origin and carries no transform, so every number
//                this file derives is a WORLD coordinate.
//   ParkConfig — the square, live, for anything else that stands on it.
//   ParkTextures — the runtime canvases.
//
// WHERE THE SQUARE IS comes from the floorplan, not from a number typed here.
// Its west edge is the OPEN END of the central-zoneB hallway (floorplan.js's
// corridorOpenEnds — x 10.2), and its centre line is that hallway's centre (z
// 0). Move the hallway and the square follows it. The lawn starts at the
// building's furthest +x outer wall face: that is Zone A's (x 5.675), not the
// foyer's (5.075), because Zone A is the wider room, and a lawn laid from the
// foyer's face would come up through Zone A's floor along its +x wall.
//
// THE GROUND STACK, from the bottom — every layer lifted just enough to never
// fight the one under it, and the two that share an edge never overlapping:
//   0.000  the global terrazzo plane (environment.js), under the building
//   0.003  lawnLift       the lawn, laid as four strips AROUND the square, so
//                         there is no lawn under the concrete at all
//   0.005  concreteLift   the square
//   0.008  the coral hallway strip (tinted-floor's ylift) — overlaps the lawn
//          where the passage crosses it, and nothing else
//   0.020  the contact cues, which also carry polygonOffset
// The 2-3 mm steps hold on the Quest's depth buffer: at camera near 0.1 a 24-bit
// buffer resolves about d² · 6e-7 m, 1 mm at 40 m, and the separation along a
// grazing ray is LARGER than the vertical step, not smaller. The one pair that
// could fight at range, lawn over terrazzo, only overlaps between the building
// and x 32, all of it within ~40 m of anywhere you can stand.
//
// LIGHTING — none of this is lit. The concrete, the lawn, the kerb and the sky
// are all MeshBasicMaterial with their tone BAKED into the canvas or the vertex
// colours, exactly the corridor's rule: the void preset's rig is built for white
// rooms (point lamps per room, directionals aimed at corners), and an outdoor
// square that depended on it would change whenever that rig was retuned. Unlit
// also costs nothing per fragment, which matters for two surfaces this large.
//
// THE SKY is an inverted sphere around the square with a vertical gradient on
// it. The scene's clear colour stays BLACK on purpose — see the void preset in
// environment.js: a Quest render hitch shows the clear colour, and black is the
// one that cannot flash. The sphere is simply drawn in front of it. It hides
// itself whenever the camera is outside it (the floor map and the corridor are
// both 400 m out, and a 250 m sphere seen from outside is a grey disc on their
// horizon).
// ================================================================

// ---------------------------------------------------------------- helpers
// "#rgb" / "#rrggbb" -> [r, g, b] sRGB bytes, for drawing straight into a
// canvas (a THREE.Color would hand back linear values).
function parkRGB(hex) {
  let h = String(hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Tileable value noise on a `cells`-periodic lattice: u, v in cell units, any
// range, returns 0..1. Periodic, so a canvas sampled over exactly [0, cells)
// wraps with no seam — which is the whole point on a repeating ground texture.
function parkNoise(cells, rand) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return function (u, v) {
    const x = Math.floor(u);
    const y = Math.floor(v);
    let fx = u - x;
    let fy = v - y;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((x % cells) + cells) % cells;
    const y0 = ((y % cells) + cells) % cells;
    const x1 = (x0 + 1) % cells;
    const y1 = (y0 + 1) % cells;
    const a = g[y0 * cells + x0];
    const b = g[y0 * cells + x1];
    const c = g[y1 * cells + x0];
    const d = g[y1 * cells + x1];
    const top = a + (b - a) * fx;
    return top + (c + (d - c) * fx - top) * fy;
  };
}

// An "auto"-able number property: the literal word `auto` (the default) means
// "derive it live", anything else is taken as metres.
function parkAuto() {
  return {
    default: "auto",
    parse: function (v) {
      if (typeof v === "number") return v;
      const n = parseFloat(v);
      return v === "auto" || v === "" || v == null || isNaN(n) ? "auto" : n;
    },
    stringify: function (v) {
      return String(v);
    },
  };
}

// Push one axis-aligned box into flat position/colour arrays as non-indexed
// triangles, each face in its own tone — the unlit way to make an edge read.
// `tones` = { top, x, z, bottom } multipliers on `color` (a THREE.Color);
// a tone of 0 or null skips that face entirely (a face nobody can see).
function parkBox(pos, col, b, color, tones) {
  const c = new THREE.Color();
  const face = (tone, pts) => {
    if (!tone) return;
    c.copy(color).multiplyScalar(tone);
    [0, 1, 2, 0, 2, 3].forEach((k) => {
      pos.push(pts[k][0], pts[k][1], pts[k][2]);
      col.push(c.r, c.g, c.b);
    });
  };
  const { x0, x1, y0, y1, z0, z1 } = b;
  // Corners wound so (b-a)×(c-a) points OUT of the box on every face.
  face(tones.top, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]);
  face(tones.bottom, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  face(tones.x, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]);
  face(tones.x, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
  face(tones.z, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
  face(tones.z, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]);
}

// ================================================================
// ParkTextures — the park's surfaces, drawn at runtime on canvases (no image
// assets: the same approach as ContactCue, makeTerrazzoTexture and the
// corridor). Every one is seeded, so the same numbers always draw the same
// square. Tone is BAKED IN — these go on unlit materials.
// ================================================================
const ParkTextures = {
  // THE SQUARE: poured concrete in slabs with saw-cut joints. The canvas holds
  // `slabs` × `slabs` of them; each slab gets its own tone, a faint lean across
  // it (the way a trowelled pour is never quite even), and the whole canvas a
  // soft two-octave mottle plus per-pixel grain. The joint is a dark cut with a
  // faintly lighter lip beside it, anti-aliased, never thinner than ~1.5 px so
  // it survives the first mip levels. Joints sit ON the canvas edges (half on
  // each side), so the repeat is seamless and lines up with the square's edge.
  concrete: function (o) {
    const S = o.size;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const rand = mulberry32(o.seed * 7919 + 13);
    const n = o.slabs;
    const base = parkRGB(o.color);
    const joint = parkRGB(o.joint);
    const slab = [];
    for (let i = 0; i < n * n; i++) {
      slab.push({
        t: (rand() * 2 - 1) * o.tone,
        gx: (rand() * 2 - 1) * o.tone * 0.6,
        gy: (rand() * 2 - 1) * o.tone * 0.6,
      });
    }
    const m1 = parkNoise(9, rand);
    const m2 = parkNoise(23, rand);
    const spp = S / n; // px per slab
    const pxPerM = spp / o.slabSize;
    const jh = Math.max(1.5, o.jointWidth * pxPerM) / 2; // half joint, px
    for (let y = 0; y < S; y++) {
      const sy = (y + 0.5) / spp;
      const fy = sy - Math.floor(sy);
      const j = Math.floor(sy) % n;
      const dy = Math.min(fy, 1 - fy) * spp;
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const sx = (x + 0.5) / spp;
        const fx = sx - Math.floor(sx);
        const i = Math.floor(sx) % n;
        const dx = Math.min(fx, 1 - fx) * spp;
        const s = slab[j * n + i];
        const u = x / S;
        const k =
          1 + s.t + s.gx * (fx - 0.5) + s.gy * (fy - 0.5) +
          (m1(u * 9, v * 9) - 0.5) * o.tone * 1.4 +
          (m2(u * 23, v * 23) - 0.5) * o.tone * 0.7 +
          (rand() - 0.5) * o.grain;
        const d = Math.min(dx, dy);
        const cut = Math.max(0, Math.min(1, jh + 0.5 - d));
        const lip = (Math.max(0, Math.min(1, jh + 1.8 - d)) - cut) * 0.05;
        const p = (y * S + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const lit = base[ch] * (k + lip);
          px[p + ch] = Math.max(0, Math.min(255, lit + (joint[ch] - lit) * cut));
        }
        px[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  // THE LAWN: a green that is never one green. Three octaves of tileable noise
  // make the patches — the lighter ones pushed a little toward yellow, the way
  // dry grass goes — then per-pixel speckle and a scatter of short darker and
  // lighter blades on top, wrapped at the canvas edges.
  lawn: function (o) {
    const S = o.size;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const rand = mulberry32(o.seed * 104729 + 7);
    const base = parkRGB(o.color);
    const n1 = parkNoise(4, rand);
    const n2 = parkNoise(11, rand);
    const n3 = parkNoise(29, rand);
    const sp = o.speckle;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const a = n1(u * 4, v * 4) - 0.5;
        // The large patches are kept LOW-contrast on purpose: they repeat every
        // lawnTile metres, and from the square at a few metres' height a strong
        // patch octave reads as a regular quilt across the whole lawn.
        const k =
          1 + a * 0.16 + (n2(u * 11, v * 11) - 0.5) * 0.12 +
          (n3(u * 29, v * 29) - 0.5) * 0.08 * sp + (rand() - 0.5) * 0.14 * sp;
        const p = (y * S + x) * 4;
        px[p] = Math.max(0, Math.min(255, base[0] * k + a * 18));
        px[p + 1] = Math.max(0, Math.min(255, base[1] * k + a * 6));
        px[p + 2] = Math.max(0, Math.min(255, base[2] * k - a * 7));
        px[p + 3] = 255;
      }
    }
    // Blades: 1×(2..4) px strokes, mostly darker, a few lighter.
    const blades = Math.round(S * S * 0.03 * sp);
    for (let b = 0; b < blades; b++) {
      const bx = Math.floor(rand() * S);
      const by = Math.floor(rand() * S);
      const len = 2 + Math.floor(rand() * 3);
      const k = rand() < 0.75 ? 0.74 + rand() * 0.1 : 1.12 + rand() * 0.1;
      const lean = rand() < 0.5 ? 0 : rand() < 0.5 ? -1 : 1;
      for (let t = 0; t < len; t++) {
        const xx = (((bx + (t === len - 1 ? lean : 0)) % S) + S) % S;
        const yy = (by + t) % S;
        const p = (yy * S + xx) * 4;
        px[p] = Math.min(255, px[p] * k);
        px[p + 1] = Math.min(255, px[p + 1] * k);
        px[p + 2] = Math.min(255, px[p + 2] * k);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  },

  // THE SKY: one column, zenith at the top row, horizon in the middle, nadir at
  // the bottom — the order SphereGeometry's v runs in, so the canvas maps onto
  // the sphere by latitude with no maths at the mesh. Above the horizon the
  // colour eases from the horizon's pale grey toward the zenith's blue (most of
  // the change high up, the way an overcast sky holds its light low); below it,
  // the horizon colour darkens slightly, which is what the ground haze beyond
  // the lawn's edge reads as. 4 px wide — width buys nothing on a gradient.
  sky: function (top, horizon, h) {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const t0 = parkRGB(top);
    const h0 = parkRGB(horizon);
    for (let y = 0; y < h; y++) {
      const e = 1 - (2 * (y + 0.5)) / h; // +1 zenith, 0 horizon, -1 nadir
      let c;
      if (e >= 0) {
        const m = Math.pow(e, 0.55);
        c = h0.map((v, i) => v + (t0[i] - v) * m);
      } else {
        const m = Math.min(1, -e * 4) * 0.08;
        c = h0.map((v) => v * (1 - m));
      }
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.fillRect(0, y, 4, 1);
    }
    return canvas;
  },

  wrap: function (canvas, repeat) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    return tex;
  },
};

// ================================================================
// ParkConfig — the square, LIVE, in world coordinates, for anything else that
// stands on it (Terminal A's manager reads the centre from here rather than
// copying a number). Answers from the mounted park-root; before that has
// initialised, from park-root's schema defaults resolved against the floorplan,
// which is the same answer unless the tag overrides something.
//   ParkConfig.square()  -> { x0, x1, z0, z1, cx, cz, size }
//   ParkConfig.center()  -> { x, z }
// ================================================================
window.ParkConfig = {
  component: null,

  resolved: function () {
    if (this.component) return this.component.resolve();
    const def = AFRAME.components["park-root"];
    if (!def) return null;
    const data = {};
    Object.keys(def.schema).forEach((k) => {
      data[k] = def.schema[k].default;
    });
    return parkResolve(data);
  },

  square: function () {
    const P = this.resolved();
    return P ? P.square : null;
  },

  center: function () {
    const s = this.square();
    return s ? { x: s.cx, z: s.cz } : null;
  },
};

// Resolve park-root's data into plain world numbers, reading the floorplan
// for everything left on `auto`. Pure: no scene state beyond #floorplan's config.
// `warn` (optional) receives a message whenever a fallback had to be used.
function parkResolve(d, warn) {
  const fpEl = document.getElementById("floorplan");
  const fp = fpEl && fpEl.getAttribute("floorplan");
  const rooms = (fp && fp.rooms) || {};
  const t = fp && fp.thickness != null ? fp.thickness : 0.15;
  const hall = ((fp && fp.hallways) || []).find((h) => h.id === d.hallway);
  const say = warn || function () {};

  // The hallway's OPEN END along x is where the concrete begins.
  let west = d.squareWest;
  let mouth = null;
  if (hall && hall.corridor && hall.openings && hall.openings[0]) {
    const alongX = hall.openings[0].side.charAt(1) === "x";
    const open =
      typeof corridorOpenEnds === "function" ? corridorOpenEnds(hall, rooms) : {};
    const end = open.hi
      ? Math.max(hall.corridor.from, hall.corridor.to)
      : open.lo
        ? Math.min(hall.corridor.from, hall.corridor.to)
        : null;
    if (west === "auto" && alongX && end != null) west = end;
    // The mouth: where the hallway meets the square's west kerb, the kerb has
    // to stop — the passage's full outer width, both side walls included.
    if (alongX && end != null && west !== "auto" && Math.abs(end - west) < 0.5) {
      const half = hall.width / 2 + t + 0.005;
      mouth = { z0: hall.center - half, z1: hall.center + half };
    }
  }
  if (west === "auto") {
    say("no open x-running hallway '" + d.hallway + "'; squareWest FALLBACK 10.2");
    west = 10.2;
  }

  let cz = d.squareZ;
  if (cz === "auto") cz = hall ? hall.center : 0;

  // The lawn starts at the building's furthest +x outer wall face.
  let lawnWest = d.lawnWest;
  if (lawnWest === "auto") {
    const faces = Object.keys(rooms).map((k) => rooms[k].cx + rooms[k].w / 2 + t / 2);
    if (faces.length) lawnWest = Math.max.apply(null, faces);
    else {
      say("no floorplan rooms; lawnWest FALLBACK 5.2");
      lawnWest = 5.2;
    }
  }

  const size = d.squareSize;
  return {
    square: {
      x0: west, x1: west + size, z0: cz - size / 2, z1: cz + size / 2,
      cx: west + size / 2, cz: cz, size: size,
    },
    lawn: {
      x0: lawnWest, x1: d.lawnEast,
      z0: cz - d.lawnHalfDepth, z1: cz + d.lawnHalfDepth,
    },
    mouth: mouth,
  };
}

// ================================================================
// park-root — see the header. Everything is rebuilt from the schema on any
// change and re-derived whenever the floorplan rebuilds; the canvases are only
// redrawn when their own parameters change.
//
// TUNABLES (defaults in parentheses; the full annotated list is on the
// #zone-b-park block in index.html):
//   placement  hallway (central-zoneB) / squareSize (40) / squareWest (auto)
//              / squareZ (auto) / lawnWest (auto) / lawnEast (70)
//              / lawnHalfDepth (40)
//   stack      concreteLift (0.005) / lawnLift (0.003)
//   kerb       kerbHeight (0.12) / kerbWidth (0.25) / kerbColor (#bdb8ae)
//   concrete   slabSize (2) / slabsPerTile (7) / concreteColor (#cdc8bf)
//              / jointColor (#8f897f) / jointWidth (0.015) / slabTone (0.045)
//              / concreteGrain (0.05) / concreteSeed (3) / textureSize (1024)
//   lawn       lawnColor (#6b8a47) / lawnSpeckle (1) / lawnTile (3.7)
//              / lawnSeed (5) / lawnTextureSize (512)
//   sky        skyRadius (250) / skyTop (#9fb1be) / skyHorizon (#dde2e3)
// ================================================================
AFRAME.registerComponent("park-root", {
  schema: {
    // placement
    hallway: { type: "string", default: "central-zoneB" },
    squareSize: { type: "number", default: 40 },
    squareWest: parkAuto(),
    squareZ: parkAuto(),
    lawnWest: parkAuto(),
    lawnEast: { type: "number", default: 70 },
    lawnHalfDepth: { type: "number", default: 40 },
    // the ground stack (see the header)
    concreteLift: { type: "number", default: 0.005 },
    lawnLift: { type: "number", default: 0.003 },
    // kerb — stands OUTSIDE the square, so its inner face is the square's edge
    kerbHeight: { type: "number", default: 0.12 },
    kerbWidth: { type: "number", default: 0.25 },
    kerbColor: { type: "color", default: "#bdb8ae" },
    // concrete
    slabSize: { type: "number", default: 2.0 },
    // Slabs per canvas edge. 7 × 2 m = a 14 m repeat, which does not divide the
    // 40 m square — so the per-slab tones never line up into a visible grid.
    slabsPerTile: { type: "int", default: 7 },
    concreteColor: { type: "color", default: "#cdc8bf" },
    jointColor: { type: "color", default: "#8f897f" },
    jointWidth: { type: "number", default: 0.015 },
    slabTone: { type: "number", default: 0.045 },
    concreteGrain: { type: "number", default: 0.05 },
    concreteSeed: { type: "number", default: 3 },
    textureSize: { type: "int", default: 1024 },
    // lawn — 3.7 m a repeat, again not a divisor of anything on the square
    lawnColor: { type: "color", default: "#6b8a47" },
    lawnSpeckle: { type: "number", default: 1 },
    lawnTile: { type: "number", default: 3.7 },
    lawnSeed: { type: "number", default: 5 },
    lawnTextureSize: { type: "int", default: 512 },
    // sky
    skyRadius: { type: "number", default: 250 },
    skyTop: { type: "color", default: "#9fb1be" },
    skyHorizon: { type: "color", default: "#dde2e3" },
  },

  init: function () {
    ParkConfig.component = this;
    this.fpEl = document.getElementById("floorplan");
    this.geometries = [];
    this.materials = [];
    this.canvasTex = {}; // name -> { key, tex }, redrawn only when the key changes
    this.warned = {};
    this.ground = new THREE.Group(); // concrete, lawn, kerb
    this.far = new THREE.Group(); // the sky (and, from stage 2, the skyline)
    this.el.setObject3D("ground", this.ground);
    this.el.setObject3D("far", this.far);
    this._cam = new THREE.Vector3();
    this.built = false;

    // The square's position is derived from the floorplan, so a floorplan
    // rebuild means a park rebuild. The collider re-reads its sources on the
    // same event, and our source re-resolves live, so the walls follow for free.
    this.onFloorplanBuilt = () => this.build();
    if (this.fpEl) this.fpEl.addEventListener("floorplanbuilt", this.onFloorplanBuilt);

    // WALKABILITY — the square is not in the floorplan, so it registers itself
    // with the collider the way the Zone A corridor does. Nothing on the lawn is
    // walkable: the source returns concrete only.
    this.regionSourceId = "zone-b-park";
    if (window.RigRegions) {
      window.RigRegions.addRegionSource(this.regionSourceId, (opts) =>
        this.walkableRects(opts)
      );
    } else {
      console.warn("park-root: no RigRegions; the square will not be walkable");
    }

    // DEBUG ENTRY — `?zoneb=debug` puts you on the square's west edge facing
    // east, instead of walking out through the foyer every time. Same
    // URLSearchParams convention as ?zonea=debug and environment.js's ?env=.
    const params = new URLSearchParams(window.location.search);
    if (params.get("zoneb") === "debug") {
      this.onSceneLoaded = () => this.debugEnter();
      if (this.el.sceneEl.hasLoaded) setTimeout(this.onSceneLoaded, 0);
      else this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
    }
  },

  update: function () {
    this.build();
    if (window.RigRegions) window.RigRegions.rebuild();
  },

  resolve: function () {
    return parkResolve(this.data, (msg) => {
      if (this.warned[msg]) return;
      this.warned[msg] = true;
      console.warn("[park] " + msg);
    });
  },

  debugEnter: function () {
    const s = this.resolve().square;
    const target = new THREE.Vector3(s.x0 + 1, 0, s.cz);
    if (window.TeleportRig) TeleportRig.go(target, -90); // -90 faces +x
    const rigEl = document.getElementById("rig");
    const collider = rigEl && rigEl.components && rigEl.components["rig-collision"];
    if (collider) collider.resync();
    console.log("[park] ?zoneb=debug — on the square's west edge at " +
      target.x.toFixed(2) + " 0 " + target.z.toFixed(2) + ", facing east");
  },

  // ---------------------------------------------------------------
  // THE WALKABLE GROUND: the concrete square, inset by the player radius on
  // all four sides, so the camera stops a radius short of the kerb's inner
  // face. It overlaps the central-zoneB hallway's own rectangle — which
  // rig-collision extends (thickness/2 + playerRadius + doorOverlap) past the
  // hallway's open end at x 10.2, to x 10.825, while this one starts at
  // 10.45 — so the union is continuous from the foyer to the square.
  // ---------------------------------------------------------------
  walkableRects: function (opts) {
    const r = (opts && opts.playerRadius) || 0;
    const s = this.resolve().square;
    return [{ x0: s.x0 + r, x1: s.x1 - r, z0: s.z0 + r, z1: s.z1 - r, tag: "park:square" }];
  },

  // A canvas texture owned by this component, redrawn only when `key` changes.
  canvasTexture: function (name, key, draw, repeat) {
    const have = this.canvasTex[name];
    if (have && have.key === key) return have.tex;
    if (have) have.tex.dispose();
    const tex = ParkTextures.wrap(draw(), repeat);
    this.canvasTex[name] = { key: key, tex: tex };
    return tex;
  },

  anisotropy: function () {
    const renderer = this.el.sceneEl && this.el.sceneEl.renderer;
    return renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 8;
  },

  addMesh: function (group, geo, mat) {
    this.geometries.push(geo);
    if (this.materials.indexOf(mat) < 0) this.materials.push(mat);
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  },

  teardownMeshes: function () {
    [this.ground, this.far].forEach((g) => {
      while (g.children.length) g.remove(g.children[0]);
    });
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries = [];
    this.materials = [];
  },

  build: function () {
    const d = this.data;
    const P = this.resolve();
    const s = P.square;
    this.teardownMeshes();

    // --- THE SQUARE
    const cTile = d.slabsPerTile * d.slabSize;
    const concrete = this.canvasTexture(
      "concrete",
      [d.textureSize, d.slabsPerTile, d.slabSize, d.concreteColor, d.jointColor,
        d.jointWidth, d.slabTone, d.concreteGrain, d.concreteSeed].join("|"),
      () => ParkTextures.concrete({
        size: d.textureSize, slabs: d.slabsPerTile, slabSize: d.slabSize,
        color: d.concreteColor, joint: d.jointColor, jointWidth: d.jointWidth,
        tone: d.slabTone, grain: d.concreteGrain, seed: d.concreteSeed,
      }),
      true
    );
    // The texture's u = 0 is the square's west edge and v = 0 its +z edge, so
    // the joints land on both edges whenever squareSize is a multiple of slabSize.
    concrete.repeat.set(s.size / cTile, s.size / cTile);
    concrete.anisotropy = this.anisotropy();
    const cGeo = new THREE.PlaneGeometry(s.size, s.size);
    cGeo.rotateX(-Math.PI / 2); // local +y -> world -z
    cGeo.translate(s.cx, d.concreteLift, s.cz);
    this.addMesh(this.ground, cGeo, new THREE.MeshBasicMaterial({ map: concrete }));

    // --- THE LAWN: four strips around the square + kerb, merged into one mesh.
    const lawnTex = this.canvasTexture(
      "lawn",
      [d.lawnTextureSize, d.lawnColor, d.lawnSpeckle, d.lawnSeed].join("|"),
      () => ParkTextures.lawn({
        size: d.lawnTextureSize, color: d.lawnColor,
        speckle: d.lawnSpeckle, seed: d.lawnSeed,
      }),
      true
    );
    lawnTex.anisotropy = this.anisotropy();
    const L = P.lawn;
    const kw = d.kerbWidth;
    const hole = { x0: s.x0 - kw, x1: s.x1 + kw, z0: s.z0 - kw, z1: s.z1 + kw };
    const strips = [
      { x0: L.x0, x1: L.x1, z0: L.z0, z1: hole.z0 }, // -z
      { x0: L.x0, x1: L.x1, z0: hole.z1, z1: L.z1 }, // +z
      { x0: L.x0, x1: hole.x0, z0: hole.z0, z1: hole.z1 }, // -x, toward the building
      { x0: hole.x1, x1: L.x1, z0: hole.z0, z1: hole.z1 }, // +x
    ];
    const lp = [];
    const luv = [];
    strips.forEach((r) => {
      const x0 = Math.max(r.x0, L.x0);
      const x1 = Math.min(r.x1, L.x1);
      const z0 = Math.max(r.z0, L.z0);
      const z1 = Math.min(r.z1, L.z1);
      if (x1 - x0 <= 0 || z1 - z0 <= 0) return;
      const y = d.lawnLift;
      // (x0,z0) (x0,z1) (x1,z1) | (x0,z0) (x1,z1) (x1,z0): both face +y.
      [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]].forEach((p) => {
        lp.push(p[0], y, p[1]);
        luv.push(p[0] / d.lawnTile, -p[1] / d.lawnTile);
      });
    });
    if (lp.length) {
      const lGeo = new THREE.BufferGeometry();
      lGeo.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
      lGeo.setAttribute("uv", new THREE.Float32BufferAttribute(luv, 2));
      lGeo.computeBoundingSphere();
      this.addMesh(this.ground, lGeo, new THREE.MeshBasicMaterial({ map: lawnTex }));
    }

    // --- THE KERB: a ring of four boxes outside the square's edge, butted at
    // the corners (the -z and +z runs span the full width, the -x and +x runs
    // fit between them, so nothing overlaps). The -x run stops for the hallway
    // mouth. One merged mesh; the faces take their tone from vertex colours.
    const kh = d.kerbHeight;
    const boxes = [
      { x0: hole.x0, x1: hole.x1, z0: hole.z0, z1: s.z0 },
      { x0: hole.x0, x1: hole.x1, z0: s.z1, z1: hole.z1 },
      { x0: s.x1, x1: hole.x1, z0: s.z0, z1: s.z1 },
    ];
    const west = { x0: hole.x0, x1: s.x0, z0: s.z0, z1: s.z1 };
    if (P.mouth && P.mouth.z0 > s.z0 && P.mouth.z1 < s.z1) {
      boxes.push(Object.assign({}, west, { z1: P.mouth.z0 }));
      boxes.push(Object.assign({}, west, { z0: P.mouth.z1 }));
    } else {
      boxes.push(west);
    }
    const kp = [];
    const kc = [];
    const kColor = new THREE.Color(d.kerbColor);
    boxes.forEach((b) => {
      parkBox(kp, kc, Object.assign({ y0: 0, y1: kh }, b), kColor,
        { top: 1, x: 0.8, z: 0.72, bottom: 0 });
    });
    const kGeo = new THREE.BufferGeometry();
    kGeo.setAttribute("position", new THREE.Float32BufferAttribute(kp, 3));
    kGeo.setAttribute("color", new THREE.Float32BufferAttribute(kc, 3));
    kGeo.computeBoundingSphere();
    this.addMesh(this.ground, kGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));

    // --- THE SKY
    const skyTex = this.canvasTexture(
      "sky", [d.skyTop, d.skyHorizon].join("|"),
      () => ParkTextures.sky(d.skyTop, d.skyHorizon, 512), false
    );
    const skyGeo = new THREE.SphereGeometry(d.skyRadius, 32, 16);
    skyGeo.translate(s.cx, 0, s.cz);
    const sky = this.addMesh(this.far, skyGeo, new THREE.MeshBasicMaterial({
      map: skyTex, side: THREE.BackSide, fog: false,
    }));
    // Drawn after the rest of the opaque pass, so everything in front of it has
    // already filled the depth buffer and most of its fragments are rejected
    // early — it is the largest surface in the scene.
    sky.renderOrder = 1;
    this.skyCenter = new THREE.Vector3(s.cx, 0, s.cz);

    this.built = true;
    console.log(
      `[park] square x ${s.x0.toFixed(3)}..${s.x1.toFixed(3)} z ${s.z0.toFixed(2)}..${s.z1.toFixed(2)}` +
        ` (centre ${s.cx.toFixed(2)} ${s.cz.toFixed(2)}), lawn x ${L.x0.toFixed(3)}..${L.x1}` +
        ` z ${L.z0}..${L.z1}, kerb mouth ${P.mouth ? P.mouth.z0.toFixed(3) + ".." + P.mouth.z1.toFixed(3) : "none"}`
    );
    this.el.emit("zonebparkchanged");
  },

  // The sky (and everything else in `far`) only when the camera is inside it.
  tick: function () {
    if (!this.built) return;
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldPosition(this._cam);
    const r = this.data.skyRadius * 0.98;
    const inside = this._cam.distanceToSquared(this.skyCenter) < r * r;
    if (this.far.visible !== inside) this.far.visible = inside;
  },

  remove: function () {
    if (this.fpEl) this.fpEl.removeEventListener("floorplanbuilt", this.onFloorplanBuilt);
    if (this.onSceneLoaded) this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
    if (window.RigRegions) window.RigRegions.removeRegionSource(this.regionSourceId);
    this.teardownMeshes();
    Object.keys(this.canvasTex).forEach((k) => this.canvasTex[k].tex.dispose());
    this.canvasTex = {};
    this.el.removeObject3D("ground");
    this.el.removeObject3D("far");
    if (ParkConfig.component === this) ParkConfig.component = null;
  },
});
