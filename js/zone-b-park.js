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

// One rectangle minus one rectangle, appended to `out` — the Zone A corridor's
// guillotine cut (corridor-root.rectMinus in js/zone-a-corridor.js), which lives
// on that component and so cannot be called from here. Both are
// {x0, x1, z0, z1}; other keys (the tag) are carried through. The z-bands clear
// of the hole survive whole; inside the hole's band only the strips either side
// of it in x are left. Cut on the hole's own edges, the pieces tile the
// remainder exactly, so the union stays continuous around the obstacle.
function parkRectMinus(a, h, out) {
  if (h.x1 <= a.x0 || h.x0 >= a.x1 || h.z1 <= a.z0 || h.z0 >= a.z1) {
    out.push(a);
    return;
  }
  const zLo = Math.max(a.z0, h.z0);
  const zHi = Math.min(a.z1, h.z1);
  if (a.z0 < zLo) out.push(Object.assign({}, a, { z1: zLo }));
  if (zHi < a.z1) out.push(Object.assign({}, a, { z0: zHi }));
  if (a.x0 < h.x0) out.push(Object.assign({}, a, { z0: zLo, z1: zHi, x1: h.x0 }));
  if (h.x1 < a.x1) out.push(Object.assign({}, a, { z0: zLo, z1: zHi, x0: h.x1 }));
}

// A terrazzo-bench's floor footprint in its OWN frame (sitter faces +z, back to
// -z), derived from its schema the way bench.js builds it: the seat and its
// side rolls (radius out past each end, a lip past the front), the backrest
// leaning back from its hinge with the top roll behind it, and the splayed
// legs' feet. So the hole cut for a bench follows the bench.
function parkBenchFootprint(b) {
  const lip = 0.015; // bench.js's roll lip
  const roll = b.rollEnds ? b.rollRadius : 0;
  const tilt = THREE.MathUtils.degToRad(b.backTilt);
  const backLen = b.backHeight / Math.cos(tilt);
  const hinge = -b.depth / 2 + b.backThickness / 2;
  const back = hinge - backLen * Math.sin(tilt) - b.backThickness / 2 - roll;
  const front = b.depth / 2 + (b.rollEnds ? lip : 0);
  const legH = b.seatHeight - 0.02;
  const foot = b.width / 2 - b.legInset +
    (legH / 2) * Math.sin(THREE.MathUtils.degToRad(b.legSplay)) + 0.04;
  const half = Math.max(b.width / 2 + roll, foot);
  return { x0: -half, x1: half, z0: Math.min(back, -front), z1: front };
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
  // the change high up, the way an overcast sky holds its light low).
  //
  // BELOW the horizon it turns to `ground`, and FAST — finished 0.7° under the
  // sphere's equator. That lower band is seen in exactly one place, the thin
  // strip between the foot of the skyline and the lawn's far edge, and it has
  // to read as land in the haze. Left at the horizon's pale grey (measured: the
  // same pixels with the skyline hidden and shown) it was the brightest thing
  // in the frame and read as a white ribbon under a dark city. The turn can
  // start right at the equator because the eye is 1.6 m above the sphere's
  // centre: eye-level horizon lands 0.37° ABOVE the equator, so the sky you
  // see over the city never gets any of it. The canvas has 2.8 px per degree,
  // so the turn is a soft two pixels. 4 px wide — width buys nothing on a
  // gradient.
  sky: function (top, horizon, ground, h) {
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const t0 = parkRGB(top);
    const h0 = parkRGB(horizon);
    const g0 = parkRGB(ground);
    for (let y = 0; y < h; y++) {
      const e = 1 - (2 * (y + 0.5)) / h; // +1 zenith, 0 horizon, -1 nadir
      let c;
      if (e >= 0) {
        const m = Math.pow(e, 0.55);
        c = h0.map((v, i) => v + (t0[i] - v) * m);
      } else {
        const deg = -e * 90; // degrees below the sphere's equator
        const m = Math.max(0, Math.min(1, (deg - 0.1) / 0.6));
        c = h0.map((v, i) => v + (g0[i] - v) * m);
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
//              / skyGround (#9ba399)
//   skyline    skyline (true) / skylineLift (0.05) / skylineTopTrim (0.45)
//              near: skylineRadius (130) / skylineHeight (40) / skylineHaze
//              (#7f8b94) / skylineHazeOpacity (0.85) / skylinePanelsMax (16)
//              far:  skylineRadius2 (180) / skylineHeight2 (60) / skylineHaze2
//              (#a7b1b8) / skylineHazeOpacity2 (0.7) / skylinePanelsMax2 (16)
//   trees      trees (true) / treeCount (16) / treeSeed (11) / treeScale (1)
//              / treeKerbClearance (3) / treeBuildingClearance (4)
//              / treeEdgeInset (2) / treeSpacing (7) / trunkColor (#5b4a3b)
//              / canopyColor (#4f7337) / canopyUnderside (0.55) / treeTone
//              (0.12) / treeCueOpacity (0.32)
//   benches    benches (true) / benchAlong (0.5) / benchInset (1.4)
//              / benchColor (#3e7a5a) / benchOffsets ({})
//   collision  collide (true) / wall (#zone-b-wall)
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
    skyGround: { type: "color", default: "#9ba399" }, // below the horizon
    // skyline — two rings of silhouette panels around the square's centre.
    // Heights are the VISIBLE (cropped) height; width follows from the picture.
    skyline: { type: "boolean", default: true },
    skylineLift: { type: "number", default: 0.05 },
    // Fraction of the picture (what SKYLINE_CROP leaves of it) trimmed off the
    // TOP. Measured: the four PNGs' tallest spires reach 44-51% of that height,
    // and everything above is empty — so 0.45 drops only sky, and with it about
    // half of every panel's transparent overdraw.
    skylineTopTrim: { type: "number", default: 0.45 },
    skylineRadius: { type: "number", default: 130 }, // near band
    skylineHeight: { type: "number", default: 40 },
    skylineHaze: { type: "color", default: "#7f8b94" },
    skylineHazeOpacity: { type: "number", default: 0.85 },
    skylinePanelsMax: { type: "int", default: 16 },
    skylineRadius2: { type: "number", default: 180 }, // far band
    skylineHeight2: { type: "number", default: 60 },
    skylineHaze2: { type: "color", default: "#a7b1b8" },
    skylineHazeOpacity2: { type: "number", default: 0.7 },
    skylinePanelsMax2: { type: "int", default: 16 },
    // trees — on the lawn only, seeded; see treeLayout
    trees: { type: "boolean", default: true },
    treeCount: { type: "int", default: 16 },
    treeSeed: { type: "number", default: 11 },
    treeKerbClearance: { type: "number", default: 3 }, // trunk to the kerb's outer face
    treeBuildingClearance: { type: "number", default: 4 }, // trunk to lawnWest
    treeEdgeInset: { type: "number", default: 2 }, // trunk to the lawn's outer edges
    treeSpacing: { type: "number", default: 7 }, // trunk to trunk, minimum
    treeScale: { type: "number", default: 1 },
    trunkColor: { type: "color", default: "#5b4a3b" },
    canopyColor: { type: "color", default: "#4f7337" },
    canopyUnderside: { type: "number", default: 0.55 }, // underside tone, x top
    treeTone: { type: "number", default: 0.12 }, // per-tree brightness spread
    treeCueOpacity: { type: "number", default: 0.32 },
    // benches — terrazzo-bench, two a side, facing the square; see benchLayout
    benches: { type: "boolean", default: true },
    benchAlong: { type: "number", default: 0.5 }, // ± this x half the side, from its middle
    benchInset: { type: "number", default: 1.4 }, // bench centre in from the kerb face
    benchColor: { type: "color", default: "#3e7a5a" },
    // By-eye nudges, applied after the derivation: { key: { along, in, yaw } }
    // in metres and DEGREES, keys n1 n2 / s1 s2 (1 = the -x end) and w1 w2 /
    // e1 e2 (1 = the -z end). e.g. {"w2": {"along": 1.5}, "n1": {"yaw": -6}}
    benchOffsets: {
      default: {},
      parse: function (v) {
        if (!v) return {};
        return typeof v === "string" ? JSON.parse(v) : v;
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
    // collision — the wall and the benches are solid (cut out of the square)
    collide: { type: "boolean", default: true },
    wall: { type: "string", default: "#zone-b-wall" }, // the image-wall to cut around
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
    this.skylineEl = null; // the ring's container entity (panels are a-planes)
    this.skylineToken = 0; // invalidates a previous build's pending attaches
    this.skylineCrops = {}; // src -> the cropped clone every panel of it shares
    this.benchEl = null; // the benches' container entity
    this.instanced = []; // InstancedMeshes, which own buffers of their own
    this.cueTex = null; // the trees' shared contact-cue texture

    // The wall is solid, so the square's walkable ground depends on where it
    // stands and how wide it is. Both events bubble to the scene, which is
    // listened to rather than the wall itself so init order cannot matter.
    this.onWallChange = () => {
      if (window.RigRegions) window.RigRegions.rebuild();
    };
    this.el.sceneEl.addEventListener("imagewallbuilt", this.onWallChange);
    this.el.sceneEl.addEventListener("zonebrootchanged", this.onWallChange);

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
  //
  // SOLID BY SUBTRACTION, exactly as the Zone A corridor makes its furniture
  // solid (see walkableRects in js/zone-a-corridor.js): the collider takes a
  // UNION of rectangles, so an obstacle is not added — its footprint, inflated
  // by the player radius, is CUT OUT of the square, and what is left is rebuilt
  // as the pieces around it. The image wall and each bench are cut. The trees
  // need nothing: they stand on the lawn, where there is no rectangle at all.
  //
  // Derived live on every collider rebuild — the wall's footprint from
  // image-wall's own metrics and #zone-b-wall's world transform, the benches'
  // from benchLayout, the same function that places them — so the walls you
  // bump into and the objects you see can never disagree.
  // ---------------------------------------------------------------
  walkableRects: function (opts) {
    const r = (opts && opts.playerRadius) || 0;
    const P = this.resolve();
    const s = P.square;
    let open = [{ x0: s.x0 + r, x1: s.x1 - r, z0: s.z0 + r, z1: s.z1 - r, tag: "park:square" }];
    if (this.data.collide) {
      const holes = [];
      const wall = this.wallFootprint();
      if (wall) holes.push(wall);
      this.benchLayout(P).forEach((b) => holes.push(b.box));
      holes.forEach((h) => {
        const hole = { x0: h.x0 - r, x1: h.x1 + r, z0: h.z0 - r, z1: h.z1 + r };
        const cut = [];
        open.forEach((a) => parkRectMinus(a, hole, cut));
        open = cut;
      });
    }
    return open.map((a, i) => Object.assign({}, a, { tag: "park:square/" + i }));
  },

  // The image wall's floor footprint in WORLD coordinates, or null until the
  // wall exists: image-wall's local footprint through #zone-b-wall's matrix
  // (which carries the zone-b-root offset and the 0 -90 0 turn).
  wallFootprint: function () {
    const el = this.data.wall && document.querySelector(this.data.wall);
    const iw = el && el.components && el.components["image-wall"];
    if (!iw || typeof iw.footprint !== "function") return null;
    const f = iw.footprint();
    el.object3D.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]].forEach((c) => {
      v.set(c[0], 0, c[1]).applyMatrix4(el.object3D.matrixWorld);
      box.x0 = Math.min(box.x0, v.x);
      box.x1 = Math.max(box.x1, v.x);
      box.z0 = Math.min(box.z0, v.z);
      box.z1 = Math.max(box.z1, v.z);
    });
    return box;
  },

  // ---------------------------------------------------------------
  // THE TREES. treeCount of them on the lawn and never on the square: a trunk
  // stands at least treeKerbClearance from the kerb's outer face,
  // treeBuildingClearance from the building (lawnWest), treeEdgeInset inside
  // the lawn's outer edges and treeSpacing from every other trunk. Placement is
  // seeded rejection sampling — the same seed always plants the same park — and
  // each tree draws its own trunk height, girth, canopy size and 2 or 3 canopy
  // blobs from the same stream. With the defaults nothing fits west of the
  // square (the strip beside the hallway is narrower than the two clearances),
  // so the trees stand north, south and east of it. If fewer than treeCount fit,
  // the build log says how many did.
  //
  // PURE: it reads only the schema and the resolved square, so it answers the
  // same thing whenever it is asked.
  // ---------------------------------------------------------------
  treeLayout: function (P) {
    const d = this.data;
    if (!d.trees) return [];
    const s = P.square;
    const L = P.lawn;
    const k = d.kerbWidth + d.treeKerbClearance;
    const clear = { x0: s.x0 - k, x1: s.x1 + k, z0: s.z0 - k, z1: s.z1 + k };
    const x0 = L.x0 + Math.max(d.treeBuildingClearance, d.treeEdgeInset);
    const x1 = L.x1 - d.treeEdgeInset;
    const z0 = L.z0 + d.treeEdgeInset;
    const z1 = L.z1 - d.treeEdgeInset;
    const rand = mulberry32(d.treeSeed * 9973 + 101);
    const sc = d.treeScale;
    const out = [];
    for (let tries = 0; tries < 8000 && out.length < d.treeCount; tries++) {
      const x = x0 + rand() * (x1 - x0);
      const z = z0 + rand() * (z1 - z0);
      if (x > clear.x0 && x < clear.x1 && z > clear.z0 && z < clear.z1) continue;
      const tooClose = out.some((t) => (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) <
        d.treeSpacing * d.treeSpacing);
      if (tooClose) continue;
      const trunkH = (2.3 + rand() * 1.1) * sc;
      const trunkR = (0.15 + rand() * 0.08) * sc;
      const canopyR = (1.9 + rand() * 0.9) * sc;
      const tint = 1 + (rand() * 2 - 1) * d.treeTone;
      const warm = (rand() - 0.5) * 0.08; // a little toward yellow or blue-green
      const blobs = [{ dx: 0, dz: 0, y: trunkH + canopyR * 0.35, r: canopyR }];
      const extra = rand() < 0.55 ? 2 : 1;
      for (let b = 0; b < extra; b++) {
        const a = rand() * Math.PI * 2;
        const dist = canopyR * (0.55 + rand() * 0.35);
        blobs.push({
          dx: Math.cos(a) * dist, dz: Math.sin(a) * dist,
          y: trunkH + canopyR * (0.1 + rand() * 0.3),
          r: canopyR * (0.6 + rand() * 0.2),
        });
      }
      out.push({ x: x, z: z, trunkH: trunkH, trunkR: trunkR, canopyR: canopyR,
        tint: tint, warm: warm, blobs: blobs });
    }
    return out;
  },

  // One tree per instance in THREE InstancedMeshes — trunks, canopy blobs and
  // floor cues — so the whole wood is three draw calls however many trees.
  // Unlit: the trunk darkens toward the ground and every blob toward its
  // underside through vertex colours, and each tree takes its own tint through
  // the instance colour, which multiplies over them.
  buildTrees: function (P) {
    const d = this.data;
    if (this.cueTex) this.cueTex.dispose();
    this.cueTex = null;
    const trees = this.treeLayout(P);
    this.treeCount = trees.length;
    if (!trees.length) return;
    if (trees.length < d.treeCount) {
      console.warn(`[park] only ${trees.length} of ${d.treeCount} trees fit the lawn ` +
        "with these clearances");
    }

    // TRUNK: an open-ended hexagonal prism of unit size, its base at y 0.
    const tGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    tGeo.translate(0, 0.5, 0);
    const tCol = [];
    const tp = tGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const k = 0.62 + 0.38 * tp.getY(i);
      tCol.push(k, k, k);
    }
    tGeo.setAttribute("color", new THREE.Float32BufferAttribute(tCol, 3));
    const tMat = new THREE.MeshBasicMaterial({ color: d.trunkColor, vertexColors: true });

    // CANOPY: a low-poly unit sphere, dark underneath.
    const cGeo = new THREE.SphereGeometry(1, 10, 7);
    const cCol = [];
    const cp = cGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const up = (cp.getY(i) + 1) / 2; // 0 underneath .. 1 on top
      const k = d.canopyUnderside + (1 - d.canopyUnderside) * Math.pow(up, 0.8);
      cCol.push(k, k, k);
    }
    cGeo.setAttribute("color", new THREE.Float32BufferAttribute(cCol, 3));
    const cMat = new THREE.MeshBasicMaterial({ color: d.canopyColor, vertexColors: true });

    // CUE: the exhibition's shared contact-cue kit, in SHADOW mode and NOT
    // following the environment retune — the lawn is unlit and belongs to no
    // preset, the same reasoning and the same null profile as the corridor's
    // props. A pool a little wider than the canopy, lying on the lawn.
    const cue = { opacity: d.treeCueOpacity, color: "#000000", mode: "shadow" };
    this.cueTex = ContactCue.makeTexture(0.6);
    const qMat = ContactCue.makeMaterial(cue, this.cueTex);
    ContactCue.tuneMaterial(qMat, cue, null);
    const qGeo = new THREE.PlaneGeometry(1, 1);
    qGeo.rotateX(-Math.PI / 2);

    const blobCount = trees.reduce((n, t) => n + t.blobs.length, 0);
    const trunks = new THREE.InstancedMesh(tGeo, tMat, trees.length);
    const canopy = new THREE.InstancedMesh(cGeo, cMat, blobCount);
    const cues = new THREE.InstancedMesh(qGeo, qMat, trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    let bi = 0;
    trees.forEach((t, i) => {
      m.compose(pos.set(t.x, 0, t.z), q, scl.set(t.trunkR, t.trunkH + 0.4 * t.canopyR, t.trunkR));
      trunks.setMatrixAt(i, m);
      col.setRGB(t.tint + t.warm, t.tint, t.tint - t.warm);
      t.blobs.forEach((b) => {
        m.compose(pos.set(t.x + b.dx, b.y, t.z + b.dz), q, scl.set(b.r, b.r * 0.62, b.r));
        canopy.setMatrixAt(bi, m);
        canopy.setColorAt(bi, col);
        bi++;
      });
      const w = t.canopyR * 2.3;
      m.compose(pos.set(t.x, 0.02, t.z), q, scl.set(w, 1, w));
      cues.setMatrixAt(i, m);
    });
    [trunks, canopy, cues].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.ground.add(mesh);
      this.instanced.push(mesh);
    });
    this.geometries.push(tGeo, cGeo, qGeo);
    this.materials.push(tMat, cMat, qMat);
  },

  // ---------------------------------------------------------------
  // THE BENCHES. Eight terrazzo-bench instances, two to each side of the
  // square, just inside the kerb and facing into it, placed from the square —
  // not typed: each side's pair stands ±benchAlong × half the side from its
  // middle, benchInset in from the kerb's inner face, backs to the kerb. The
  // west pair stands either side of the hallway mouth. benchOffsets nudges any
  // of them by eye after the derivation, the corridor's furnitureOffsets idea.
  //
  // benchInset is set so a visitor can still walk BEHIND a bench: its back
  // stands ~1.05 m off the kerb, which leaves a lane of about half a metre
  // between the two inflated no-go lines. Walking along every kerb is the test.
  //
  // PURE, like treeLayout: walkableRects calls it on every collider rebuild to
  // cut each bench's footprint out, before any bench exists. The footprint is
  // derived from terrazzo-bench's own schema (parkBenchFootprint), so a change
  // to the bench's defaults changes its hole too.
  // ---------------------------------------------------------------
  benchLayout: function (P) {
    const d = this.data;
    if (!d.benches || !AFRAME.components["terrazzo-bench"]) return [];
    const s = P.square;
    const schema = AFRAME.components["terrazzo-bench"].schema;
    const bench = {};
    Object.keys(schema).forEach((k) => {
      bench[k] = schema[k].default;
    });
    const f = parkBenchFootprint(bench);
    const along = d.benchAlong * (s.size / 2);
    // For each side: where its pair's centre line runs, which way is along it
    // (a), which way is into the square (n), and the yaw that faces the sitter
    // there (+z at yaw 0, +x at 90).
    const sides = [
      { key: "n", cx: s.cx, cz: s.z0 + d.benchInset, ax: 1, az: 0, nx: 0, nz: 1, yaw: 0 },
      { key: "s", cx: s.cx, cz: s.z1 - d.benchInset, ax: 1, az: 0, nx: 0, nz: -1, yaw: 180 },
      { key: "w", cx: s.x0 + d.benchInset, cz: s.cz, ax: 0, az: 1, nx: 1, nz: 0, yaw: 90 },
      { key: "e", cx: s.x1 - d.benchInset, cz: s.cz, ax: 0, az: 1, nx: -1, nz: 0, yaw: -90 },
    ];
    const offsets = d.benchOffsets || {};
    const out = [];
    sides.forEach((sd) => {
      [-1, 1].forEach((sign, i) => {
        const key = sd.key + (i + 1);
        const o = offsets[key] || {};
        const a = sign * along + (o.along || 0);
        const inward = o.in || 0;
        const x = sd.cx + sd.ax * a + sd.nx * inward;
        const z = sd.cz + sd.az * a + sd.nz * inward;
        const yaw = sd.yaw + (o.yaw || 0);
        // World bounds of the footprint turned by yaw (x' = x cos + z sin,
        // z' = -x sin + z cos — A-Frame's rotation about +y).
        const t = THREE.MathUtils.degToRad(yaw);
        const c = Math.cos(t);
        const sn = Math.sin(t);
        const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
        [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]].forEach((p) => {
          const wx = x + p[0] * c + p[1] * sn;
          const wz = z - p[0] * sn + p[1] * c;
          box.x0 = Math.min(box.x0, wx);
          box.x1 = Math.max(box.x1, wx);
          box.z0 = Math.min(box.z0, wz);
          box.z1 = Math.max(box.z1, wz);
        });
        out.push({ key: key, x: x, z: z, yaw: yaw, box: box });
      });
    });
    return out;
  },

  // The benches are entities (terrazzo-bench is a component), children of
  // #zone-b-park inside one container, rebuilt with the park. Each carries the
  // exhibition's spot-contact-cue, bench-sized, following the environment
  // retune like every cue in the gallery.
  buildBenches: function (P) {
    if (this.benchEl && this.benchEl.parentNode) {
      this.benchEl.parentNode.removeChild(this.benchEl);
    }
    this.benchEl = null;
    const layout = this.benchLayout(P);
    if (!layout.length) return;
    const root = document.createElement("a-entity");
    root.setAttribute("data-park", "benches");
    layout.forEach((b) => {
      const e = document.createElement("a-entity");
      e.setAttribute("id", "zone-b-bench-" + b.key);
      e.setAttribute("terrazzo-bench", "bodyColor: " + this.data.benchColor);
      e.setAttribute("position", `${b.x.toFixed(3)} 0 ${b.z.toFixed(3)}`);
      e.setAttribute("rotation", `0 ${b.yaw.toFixed(2)} 0`);
      e.setAttribute("spot-contact-cue", "width: 2.0; depth: 1.0");
      root.appendChild(e);
    });
    this.el.appendChild(root);
    this.benchEl = root;
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
    this.instanced.forEach((m) => m.dispose()); // their instance buffers
    this.instanced = [];
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
      "sky", [d.skyTop, d.skyHorizon, d.skyGround].join("|"),
      () => ParkTextures.sky(d.skyTop, d.skyHorizon, d.skyGround, 512), false
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

    // --- THE SKYLINE
    this.buildSkyline(s);

    // --- THE TREES and THE BENCHES
    this.buildTrees(P);
    this.buildBenches(P);

    this.built = true;
    console.log(
      `[park] square x ${s.x0.toFixed(3)}..${s.x1.toFixed(3)} z ${s.z0.toFixed(2)}..${s.z1.toFixed(2)}` +
        ` (centre ${s.cx.toFixed(2)} ${s.cz.toFixed(2)}), lawn x ${L.x0.toFixed(3)}..${L.x1}` +
        ` z ${L.z0}..${L.z1}, kerb mouth ${P.mouth ? P.mouth.z0.toFixed(3) + ".." + P.mouth.z1.toFixed(3) : "none"}`
    );
    this.el.emit("zonebparkchanged");
  },

  // ---------------------------------------------------------------
  // THE SKYLINE — Saigon in haze all the way round the square: a full ring of
  // silhouette panels in two depth bands, the corridor window's near/far idea
  // turned through 360 degrees.
  //
  // THE PANELS ARE THE ENVIRONMENT LAYER'S. SkylineKit (js/environment.js)
  // hands over skylinePanel(), the four pictures and SKYLINE_CROP, so each
  // panel is the same a-plane the skyline preset builds, cropped the same way:
  // the black foreground band cut off the bottom and the plane shortened by the
  // same fraction, smooth alpha (alphaTest 0), no depth write.
  //
  // PLUS A TOP TRIM, by the same rule. The pictures are mostly sky: measured,
  // the spires reach 44-51% of the cropped height and the rooftops (the height
  // at which a fifth of the columns are still building) 16-26%. skylineTopTrim
  // takes the empty top off and shortens the plane to match, so the city keeps
  // its proportions and a panel stops paying fill for 45% of nothing.
  //
  // WHY THE BANDS ARE THIS TALL: they have to read above the building from the
  // square. Seen from its centre, the foyer's roof is ~7 degrees up and Zone
  // C's ~12.7. At 40 m (near) and 60 m (far) the spires land around 13 and 15
  // degrees and the rooftops around 6 and 7 — so the city stands above the
  // roofline, and Zone C, the tallest box, cuts into it rather than hiding it.
  // (30 m panels put the whole city under the foyer's roof: most of every
  // panel is sky.)
  //
  // THE HAZE NEEDS A WHITE PICTURE. The PNGs are black-on-transparent, and a
  // tint multiplies, so a black silhouette cannot be pushed toward grey-blue —
  // the corridor hit exactly this. Its answer, CorridorTextures.silhouette, lifts
  // each PNG into a canvas filled white through its own alpha, and this ring
  // uses THOSE canvases rather than lifting its own: the same four pictures, so
  // the park adds no texture memory for them at all. Each band crops through
  // its own uv transform, which means a CLONE per picture (sharing the canvas
  // and the GPU storage) — and a clone only once the picture has arrived; see
  // the READY note on silhouette(). Until then a panel stays hidden, since a
  // mapless haze-coloured plane is a solid grey rectangle. If the corridor's
  // file is ever not loaded, the ring falls back to the black PNGs, untinted.
  //
  // HOW MANY PANELS: as many as it takes to close the ring. A flat panel of
  // width w facing the centre from radius R covers 2·atan(w / 2R) of arc, so a
  // band needs ceil(π / atan(w / 2R)) of them — 6 each at the defaults, with
  // the neighbours' edges crossing slightly rather than leaving a slot of sky.
  // skylinePanelsMax caps it; a capped band leaves gaps, which the build log
  // reports in metres. The far band is turned half a panel against the near one
  // so their seams never line up, and the pictures alternate so no two
  // neighbours match — including across the ring's closing seam.
  //
  // Everything stands inside the sky sphere — the far band's top corners, the
  // furthest point of the ring, are ~230 m from the centre against its 250 —
  // and nothing comes within 200 m of the 400 m teleport sub-spaces. The ring
  // hides with the sky whenever the camera is outside the sphere. The build log
  // prints each band's farthest point, and warns if one ever pokes through.
  // ---------------------------------------------------------------
  buildSkyline: function (s) {
    const d = this.data;
    const token = ++this.skylineToken;
    if (this.skylineEl && this.skylineEl.parentNode) {
      this.skylineEl.parentNode.removeChild(this.skylineEl);
    }
    this.skylineEl = null;
    this.skylineInfo = [];
    Object.keys(this.skylineCrops).forEach((k) => this.skylineCrops[k].dispose());
    this.skylineCrops = {};
    const kit = window.SkylineKit;
    if (!d.skyline) return;
    if (!kit) {
      console.warn("[park] no SkylineKit (js/environment.js); no skyline");
      return;
    }
    const lifter = typeof CorridorTextures !== "undefined" ? CorridorTextures : null;
    if (!lifter) console.warn("[park] no CorridorTextures; skyline stays black, untinted");

    const root = document.createElement("a-entity");
    root.setAttribute("data-park", "skyline");
    this.el.appendChild(root);
    this.skylineEl = root;

    // The texture window: from SKYLINE_CROP up, minus the top trim.
    const keep = (1 - kit.crop) * (1 - d.skylineTopTrim);
    // One cropped clone per picture, shared by every panel showing it.
    const cropped = (src) => {
      const base = lifter.silhouette(src);
      return base.userData.ready.then(() => {
        if (token !== this.skylineToken) return null;
        if (!this.skylineCrops[src]) {
          const t = base.clone();
          t.repeat.set(1, keep);
          t.offset.set(0, kit.crop);
          this.skylineCrops[src] = t;
        }
        return this.skylineCrops[src];
      });
    };

    const band = (label, R, h, haze, opacity, max, phase, first, order) => {
      const w = (h / keep) * kit.aspect;
      const need = Math.ceil(Math.PI / Math.atan(w / (2 * R)));
      const n = Math.max(3, Math.min(max, need));
      // Alternate the four pictures; if the ring's closing seam would put the
      // same one either side of it, the last panel takes one that is neither.
      const pics = [];
      for (let i = 0; i < n; i++) pics.push((first + i) % kit.srcs.length);
      if (pics[n - 1] === pics[0]) {
        for (let k = 0; k < kit.srcs.length; k++) {
          if (k !== pics[0] && k !== pics[n - 2]) {
            pics[n - 1] = k;
            break;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const deg = (360 / n) * (i + phase);
        const t = THREE.MathUtils.degToRad(deg);
        const src = kit.srcs[pics[i]];
        const panel = kit.panel(lifter ? "" : src, w, h, {
          repeat: "1 " + keep,
          offset: "0 " + kit.crop,
          alphaTest: 0,
          depthWrite: false,
          color: lifter ? haze : null,
          opacity: lifter ? opacity : null,
        });
        // Base on the ground line (+ lift), facing the square's centre.
        panel.setAttribute(
          "position",
          `${(s.cx + R * Math.sin(t)).toFixed(3)} ${(h / 2 + d.skylineLift).toFixed(3)} ` +
            `${(s.cz - R * Math.cos(t)).toFixed(3)}`
        );
        panel.setAttribute("rotation", `0 ${(-deg).toFixed(3)} 0`);
        if (lifter) panel.setAttribute("visible", false);
        root.appendChild(panel);
        const onLoaded = () => {
          const mesh = panel.getObject3D("mesh");
          if (!mesh) return;
          // Far band first, then near, then every other transparent thing
          // (the cues on the ground are all nearer).
          mesh.renderOrder = order;
          if (!lifter) return;
          cropped(src).then((tex) => {
            if (!tex || token !== this.skylineToken) return;
            mesh.material.map = tex;
            mesh.material.needsUpdate = true;
            panel.setAttribute("visible", true);
          });
        };
        if (panel.hasLoaded) onLoaded();
        else panel.addEventListener("loaded", onLoaded, { once: true });
      }
      const cover = 2 * THREE.MathUtils.radToDeg(Math.atan(w / (2 * R)));
      const gap = Math.max(0, 2 * R * Math.tan(Math.PI / n) - w);
      // The ring's farthest point: a panel's top corner.
      const reach = Math.sqrt(R * R + (w / 2) * (w / 2) + (h + d.skylineLift) * (h + d.skylineLift));
      this.skylineInfo.push({
        band: label, radius: R, height: h, panelWidth: +w.toFixed(1),
        panels: n, needed: need, degEach: +cover.toFixed(1), gapM: +gap.toFixed(1),
        reach: +reach.toFixed(1),
      });
    };
    band("far", d.skylineRadius2, d.skylineHeight2, d.skylineHaze2,
      d.skylineHazeOpacity2, d.skylinePanelsMax2, 0.5, 2, -2);
    band("near", d.skylineRadius, d.skylineHeight, d.skylineHaze,
      d.skylineHazeOpacity, d.skylinePanelsMax, 0, 0, -1);
    console.log(
      "[park] skyline " + this.skylineInfo.map((b) =>
        `${b.band} ${b.panels} × ${b.panelWidth} m at ${b.radius} m, reaching ${b.reach} m` +
          (b.gapM > 0 ? ` (GAPS of ${b.gapM} m — raise skylinePanelsMax)` : "")
      ).join(", ")
    );
    this.skylineInfo.forEach((b) => {
      if (b.reach >= d.skyRadius) {
        console.warn(`[park] the ${b.band} skyline band reaches ${b.reach} m, ` +
          `through the ${d.skyRadius} m sky — lower its height or radius`);
      }
    });
  },

  // The sky, the skyline and anything else far off, only while the camera is
  // inside the sky sphere.
  tick: function () {
    if (!this.built) return;
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldPosition(this._cam);
    const r = this.data.skyRadius * 0.98;
    const inside = this._cam.distanceToSquared(this.skyCenter) < r * r;
    if (this.far.visible !== inside) {
      this.far.visible = inside;
      if (this.skylineEl) this.skylineEl.object3D.visible = inside;
    }
  },

  remove: function () {
    if (this.fpEl) this.fpEl.removeEventListener("floorplanbuilt", this.onFloorplanBuilt);
    if (this.onSceneLoaded) this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
    if (window.RigRegions) window.RigRegions.removeRegionSource(this.regionSourceId);
    this.teardownMeshes();
    Object.keys(this.canvasTex).forEach((k) => this.canvasTex[k].tex.dispose());
    this.canvasTex = {};
    this.skylineToken++;
    if (this.skylineEl && this.skylineEl.parentNode) {
      this.skylineEl.parentNode.removeChild(this.skylineEl);
    }
    // The clones only: their canvases belong to CorridorTextures' cache.
    Object.keys(this.skylineCrops).forEach((k) => this.skylineCrops[k].dispose());
    this.skylineCrops = {};
    if (this.benchEl && this.benchEl.parentNode) {
      this.benchEl.parentNode.removeChild(this.benchEl);
    }
    if (this.cueTex) this.cueTex.dispose();
    this.el.sceneEl.removeEventListener("imagewallbuilt", this.onWallChange);
    this.el.sceneEl.removeEventListener("zonebrootchanged", this.onWallChange);
    this.el.removeObject3D("ground");
    this.el.removeObject3D("far");
    if (ParkConfig.component === this) ParkConfig.component = null;
  },
});
