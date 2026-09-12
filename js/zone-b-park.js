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
// How close any part of the park may come to a teleport sub-space before the
// build log complains. The sub-spaces sit ~400 m out and the park now reaches
// outward (the river to skylineRadius, the skyline bands past it), so this is
// the margin that keeps the two from ever being in frame together.
const PARK_SUBSPACE_CLEARANCE = 100;

// How far the river is pulled UNDER the lawn's edge, in metres. Enough that no
// triangle's rounding can open a hairline between water and grass, small enough
// that it is never visible as water over the lawn.
const RIVER_OVERLAP = 0.05;

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

// BEARINGS, the skyline panels' convention, used by everything that stands in a
// ring around the square: 0 = -z, 90 = +x (east), 180 = +z, 270 = -x. So the
// unit direction for a bearing is (sin, -cos), which is what parkPanelPos and
// the bands below both build their positions from.
function parkDir(deg) {
  const t = THREE.MathUtils.degToRad(deg);
  return { x: Math.sin(t), z: -Math.cos(t) };
}

// How far it is from a point INSIDE an axis-aligned rectangle to the rectangle's
// edge along a bearing — a ray/box exit, the slab test with the near side
// dropped because the origin is known to be inside. The river uses it to follow
// the lawn's outline rather than guessing a radius for it.
function parkRectExit(cx, cz, deg, r) {
  const d = parkDir(deg);
  let m = Infinity;
  if (d.x > 1e-9) m = Math.min(m, (r.x1 - cx) / d.x);
  else if (d.x < -1e-9) m = Math.min(m, (r.x0 - cx) / d.x);
  if (d.z > 1e-9) m = Math.min(m, (r.z1 - cz) / d.z);
  else if (d.z < -1e-9) m = Math.min(m, (r.z0 - cz) / d.z);
  return isFinite(m) ? Math.max(0, m) : 0;
}

// The bearing of a point as seen from the square's centre, in 0..360.
function parkBearing(cx, cz, x, z) {
  const deg = THREE.MathUtils.radToDeg(Math.atan2(x - cx, -(z - cz)));
  return ((deg % 360) + 360) % 360;
}

// Signed shortest angle from a to b, in -180..180 — "how far apart are these two
// bearings", which is the only way to compare them without the 0/360 wrap
// biting (the near band asks it of every far panel behind it).
function parkAngleDelta(a, b) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return d;
}

// A seeded Fisher-Yates, returning a NEW array — the same seed always deals the
// same order, which is what makes a shuffled skyline reproducible enough to tune
// by eye. Dealing without replacement is the point: a ring of six panels drawn
// independently would show the same picture twice as often as not.
function parkShuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
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

  // THE RIVER: the same idea as the lawn and deliberately far weaker. Two
  // octaves only — broad swells and a fine ripple — at a few per cent either
  // side of the base tone, with no speckle and no "blades".
  //
  // WHY SO FAINT. This surface is seen almost edge-on and it is BIG: it runs
  // from the lawn's edge out to the foot of the skyline, so a single pixel of
  // it near the far edge covers many metres. Any texture with real contrast
  // turns into moire out there, and a strong low-frequency octave repeating
  // every riverTile metres reads as a quilt — exactly the trap the lawn's patch
  // octave is kept low-contrast for, and worse here because the viewing angle is
  // flatter. What the noise is actually for is to stop a hundred-metre field of
  // ONE value from banding on the Quest's 8-bit output, and that takes very
  // little. No animation: the whole park is static, and a moving surface at this
  // size would be the only thing in the scene asking for a per-frame upload.
  river: function (o) {
    const S = o.size;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(S, S);
    const px = img.data;
    const rand = mulberry32(o.seed * 40503 + 17);
    const base = parkRGB(o.color);
    const n1 = parkNoise(4, rand); // swells
    const n2 = parkNoise(17, rand); // ripple
    const amp = o.noise;
    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        // ±3% swell, ±2% ripple, both scaled by riverNoise.
        const k =
          1 + (n1(u * 4, v * 4) - 0.5) * 0.06 * amp +
          (n2(u * 17, v * 17) - 0.5) * 0.04 * amp;
        const p = (y * S + x) * 4;
        px[p] = Math.max(0, Math.min(255, base[0] * k));
        px[p + 1] = Math.max(0, Math.min(255, base[1] * k));
        px[p + 2] = Math.max(0, Math.min(255, base[2] * k));
        px[p + 3] = 255;
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
//   collision  collide (true) / walls (#zone-b-wall, #zone-b-triptych-stack)
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
    // river — a flat ring segment filling the gap between the lawn's outer edge
    // and the foot of the near skyline band, on ONE bearing only. See buildRiver.
    river: { type: "boolean", default: true },
    riverBearingDeg: { type: "number", default: 90 }, // 90 = east, panel bearings
    riverArcDeg: { type: "number", default: 120 },
    riverOuter: parkAuto(), // auto = skylineRadius, so it follows the near band
    // A touch darker and COOLER than skyGround (#9ba399, a warm grey-green):
    // the water has to separate from the land the sky's lower band stands in
    // for, and at this distance tone and temperature are the only cues left.
    riverColor: { type: "color", default: "#7c888e" },
    riverLift: { type: "number", default: 0.002 }, // UNDER lawnLift; see buildRiver
    riverNoise: { type: "number", default: 1 },
    riverTile: { type: "number", default: 24 }, // metres a texture repeat
    riverSeed: { type: "number", default: 7 },
    riverTextureSize: { type: "int", default: 256 },
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
    // Which pictures the bands deal from, and in what order. See buildSkyline.
    skylineSeed: { type: "number", default: 17 },
    bridges: { type: "boolean", default: true },
    // Where the two bridges stand, in the panels' bearing convention. "auto"
    // puts one at each end of the river arc, which is where a bridge crossing
    // this stretch of water would be. Otherwise a list: "40 140".
    bridgeBearingsDeg: {
      default: "auto",
      parse: function (v) {
        if (Array.isArray(v)) return v.map(Number).filter((n) => !isNaN(n));
        if (typeof v === "number") return [v];
        const t = String(v == null ? "" : v).trim();
        if (t === "" || t === "auto") return "auto";
        const out = t.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
        return out.length ? out : "auto";
      },
      stringify: function (v) {
        return v === "auto" || v == null ? "auto" : [].concat(v).join(" ");
      },
    },
    // boats — a third band, on the water only. See buildBoats.
    boats: { type: "boolean", default: true },
    boatRadius: { type: "number", default: 100 }, // between the lawn and the near band
    // The height of the TALLEST boat in the pool; every other picture shows at
    // its own share of it. Not a panel height — see buildBoats on why this band
    // sizes itself from the pictures rather than the other way round.
    boatHeight: { type: "number", default: 6 },
    // Nearer than the near band, so less haze: darker and more opaque than
    // skylineHaze/#7f8b94 at 0.85, still short of an untinted black silhouette.
    boatHaze: { type: "color", default: "#5a646c" },
    boatHazeOpacity: { type: "number", default: 0.93 },
    boatCount: { type: "int", default: 5 },
    boatSeed: { type: "number", default: 13 },
    // How much of its own slot a boat may wander, 0 = dead even, 1 = anywhere
    // in the slot. Bounded by the slot so the boats keep their order and spacing.
    boatJitter: { type: "number", default: 0.7 },
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
    // collision — the walls and the benches are solid (cut out of the square)
    collide: { type: "boolean", default: true },
    // The free-standing walls to cut around: a selector list, each matching an
    // entity whose image-wall or zone-b-triptych answers footprint().
    walls: { type: "string", default: "#zone-b-wall, #zone-b-triptych-stack" },
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
    this.skylineInfo = []; // per-band build facts, for logFarScenery
    this.riverInfo = null; // the river's build facts, or null when it is off
    this.boatEl = null; // the boat band's container entity
    this.boatInfo = null; // the boat band's build facts, or null when it is off
    this.picsUsed = {}; // source path -> true, the pictures this build lifted
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
    this.el.sceneEl.addEventListener("zonebtriptychbuilt", this.onWallChange);

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
  // as the pieces around it. The two free-standing walls — the image wall and
  // the triptych's — and each bench are cut. The trees need nothing: they stand
  // on the lawn, where there is no rectangle at all.
  //
  // Derived live on every collider rebuild — each wall's footprint from its own
  // component (image-wall, zone-b-triptych) and world transform, the benches'
  // from benchLayout, the same function that places them — so the walls you
  // bump into and the objects you see can never disagree.
  // ---------------------------------------------------------------
  walkableRects: function (opts) {
    const r = (opts && opts.playerRadius) || 0;
    const P = this.resolve();
    const s = P.square;
    let open = [{ x0: s.x0 + r, x1: s.x1 - r, z0: s.z0 + r, z1: s.z1 - r, tag: "park:square" }];
    if (this.data.collide) {
      const holes = this.wallFootprints();
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

  // The free-standing walls' floor footprints in WORLD coordinates, one per
  // entity in `walls` that exists yet: each component's local footprint()
  // (image-wall's, zone-b-triptych's) through its entity's matrix, which
  // carries the zone-b-root offset and any turn — the image wall's 0 -90 0.
  wallFootprints: function () {
    const out = [];
    if (!this.data.walls) return out;
    const v = new THREE.Vector3();
    document.querySelectorAll(this.data.walls).forEach((el) => {
      const comps = (el.components && [el.components["image-wall"],
        el.components["zone-b-triptych"]]) || [];
      const c = comps.find((k) => k && typeof k.footprint === "function");
      const f = c && c.footprint();
      if (!f) return;
      el.object3D.updateWorldMatrix(true, false);
      const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
      [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]].forEach((p) => {
        v.set(p[0], 0, p[1]).applyMatrix4(el.object3D.matrixWorld);
        box.x0 = Math.min(box.x0, v.x);
        box.x1 = Math.max(box.x1, v.x);
        box.z0 = Math.min(box.z0, v.z);
        box.z1 = Math.max(box.z1, v.z);
      });
      out.push(box);
    });
    return out;
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

    // --- THE RIVER (before the skyline: it is the ground the boats stand on)
    this.buildRiver(P);

    // --- THE SKYLINE and THE BOATS (boats after: they share its token)
    this.buildSkyline(s);
    this.buildBoats(s);
    this.logFarScenery(s);

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
  // THE TELEPORT SUB-SPACES, read from the DOM rather than typed here. The floor
  // map and the chung cư corridor are each parked ~400 m out on z by their
  // root's `offset` attribute, and that attribute is the only place the number
  // lives — copying it into this file would be a second copy to forget. The
  // skyline's note has always claimed "nothing comes within 200 m of the 400 m
  // sub-spaces"; now that the park is growing outward (the river reaches
  // skylineRadius, the boats stand at boatRadius) the claim is checked instead.
  //
  // Anything this returns is a point, and the check is against a piece of park
  // geometry expressed as a centre plus a reach — the same "farthest point"
  // number the skyline bands already report.
  // ---------------------------------------------------------------
  // The roots' `offset` attribute is NOT the answer: for zone-b-map-root it is
  // documented as a DELTA from a spot derived off the Zone B wall, so reading it
  // would give a few metres rather than the 400 it resolves to. Both components
  // end up writing the entity's own position, so that is what is read — the
  // resolved truth, whatever it was derived from.
  //
  // A root still sitting at the origin has not placed itself yet (this can run
  // before those components' first update). That is reported rather than
  // silently skipped, so an absent check never looks like a passing one.
  subspaces: function () {
    const out = [];
    const pending = [];
    document.querySelectorAll("[zone-b-map-root], [corridor-root]").forEach((el) => {
      const id = el.id || el.tagName.toLowerCase();
      const p = el.object3D && el.object3D.position;
      if (!p || (!p.x && !p.y && !p.z)) {
        pending.push(id);
        return;
      }
      out.push({ id: id, x: p.x, y: p.y, z: p.z });
    });
    this.subspacesPending = pending;
    return out;
  },

  // Warn if `reach` metres around `centre` comes within PARK_SUBSPACE_CLEARANCE
  // of any sub-space. Returns the tightest clearance in metres, or null when
  // there are no sub-spaces to clear (the park alone in a test page).
  checkSubspaces: function (label, cx, cz, reach) {
    const subs = this.subspaces();
    if (!subs.length) return null;
    let tightest = Infinity;
    subs.forEach((sub) => {
      const dx = sub.x - cx;
      const dz = sub.z - cz;
      const gap = Math.sqrt(dx * dx + dz * dz) - reach;
      if (gap < tightest) tightest = gap;
      if (gap < PARK_SUBSPACE_CLEARANCE) {
        console.warn(
          `[park] the ${label} reaches within ${gap.toFixed(1)} m of the ` +
            `${sub.id} sub-space at z ${sub.z} — it must stay ` +
            `${PARK_SUBSPACE_CLEARANCE} m clear or the two will be visible from each other`
        );
      }
    });
    return tightest;
  },

  // ---------------------------------------------------------------
  // THE RIVER — the Saigon, on the east side of the square.
  //
  // WHAT GAP IT FILLS. The lawn stops at lawnEast / ±lawnHalfDepth and the near
  // skyline band stands at skylineRadius, and between the two there is a ring of
  // nothing. What shows there is the sky sphere's lower band — the `skyGround`
  // tone, which exists precisely to read as land in the haze (see the
  // ParkTextures.sky note on why that band had to stop being pale). On the east
  // that strip is the river, so this lays a surface over it. One side only:
  // riverBearingDeg / riverArcDeg, in the panels' bearing convention, so "90"
  // means the same direction here as it does on the skyline.
  //
  // IT IS A RING SEGMENT WHOSE INNER EDGE IS THE LAWN'S OUTLINE, not a circle.
  // The lawn is a rectangle and the skyline is a circle, so the gap between them
  // is neither, and an inner circle would either leave a crescent of sky-ground
  // showing at the lawn's corners or run up over the grass in the middle.
  // parkRectExit samples the lawn along each bearing instead. Between two
  // samples taken on the SAME edge of the rectangle the chord lies exactly on
  // that edge, so the inner boundary is exact everywhere except where it crosses
  // a corner — and the corners inside the arc are inserted as samples of their
  // own, so it is exact there too.
  //
  // THE SEAM IS AN OVERLAP, NOT A BUTT JOINT. The water is pulled RIVER_OVERLAP
  // under the grass and sits at riverLift (0.002), BELOW lawnLift (0.003), so
  // the lawn wins the overlap and no hairline of sky-ground can show between
  // them however the triangles round off. The two never fight for the same
  // pixel: 1 mm apart, and both are within ~45 m of anywhere you can stand,
  // where the depth buffer resolves about a millimetre and the separation along
  // a grazing ray is larger than the vertical step (the ground-stack note).
  // Nothing else is down there to fight — the global terrazzo plane is only
  // GROUND_SIZE (64 m) across, centred on the world origin, and stops at x 32
  // while the river starts beyond the lawn at x 70.
  //
  // OPAQUE, AND DRAWN FIRST. Flat and unlit like every other surface in the
  // park. Being opaque already puts it ahead of the skyline — three draws the
  // whole opaque pass before any transparent one, and the panels are
  // transparent — so renderOrder is set only to say so out loud, and to keep it
  // ahead of the sky sphere (renderOrder 1) which it occludes.
  // ---------------------------------------------------------------
  buildRiver: function (P) {
    const d = this.data;
    this.riverInfo = null;
    if (!d.river) return;
    const s = P.square;
    const L = P.lawn;
    const outer = d.riverOuter === "auto" ? d.skylineRadius : d.riverOuter;
    const arc = Math.max(0, Math.min(360, d.riverArcDeg));
    if (arc <= 0 || outer <= 0) return;

    const from = d.riverBearingDeg - arc / 2;
    const to = d.riverBearingDeg + arc / 2;

    // Sample bearings: a regular step fine enough that the OUTER edge reads as a
    // curve, plus the lawn's corners so the INNER edge is exact across them.
    // At 2° the outer chord's sagitta is outer·(1−cos 1°) ≈ 2 cm at 130 m.
    const step = 2;
    const bearings = [];
    for (let a = from; a < to; a += step) bearings.push(a);
    bearings.push(to);
    [[L.x0, L.z0], [L.x1, L.z0], [L.x1, L.z1], [L.x0, L.z1]].forEach((c) => {
      const b = parkBearing(s.cx, s.cz, c[0], c[1]);
      // The corner may sit in the arc under any 360 offset of its bearing.
      [b - 360, b, b + 360].forEach((cand) => {
        if (cand > from && cand < to) bearings.push(cand);
      });
    });
    bearings.sort((a, b) => a - b);

    const pos = [];
    const uv = [];
    const y = d.riverLift;
    let innerMin = Infinity;
    let innerMax = 0;
    const at = (deg, r) => {
      const dir = parkDir(deg);
      return [s.cx + dir.x * r, s.cz + dir.z * r];
    };
    const push = (p) => {
      pos.push(p[0], y, p[1]);
      uv.push(p[0] / d.riverTile, -p[1] / d.riverTile);
    };
    for (let i = 0; i < bearings.length - 1; i++) {
      const a = bearings[i];
      const b = bearings[i + 1];
      if (b - a < 1e-6) continue;
      const ra = Math.max(0, parkRectExit(s.cx, s.cz, a, L) - RIVER_OVERLAP);
      const rb = Math.max(0, parkRectExit(s.cx, s.cz, b, L) - RIVER_OVERLAP);
      innerMin = Math.min(innerMin, ra, rb);
      innerMax = Math.max(innerMax, ra, rb);
      if (ra >= outer || rb >= outer) continue; // lawn already past the band
      const ia = at(a, ra);
      const ib = at(b, rb);
      const oa = at(a, outer);
      const ob = at(b, outer);
      // Wound so both triangles face +y, like the lawn's strips.
      push(ia); push(ob); push(oa);
      push(ia); push(ib); push(ob);
    }
    if (!pos.length) {
      console.warn("[park] the river arc is entirely behind the lawn's edge; no water built");
      return;
    }

    const tex = this.canvasTexture(
      "river",
      [d.riverTextureSize, d.riverColor, d.riverNoise, d.riverSeed].join("|"),
      () => ParkTextures.river({
        size: d.riverTextureSize, color: d.riverColor,
        noise: d.riverNoise, seed: d.riverSeed,
      }),
      true
    );
    tex.anisotropy = this.anisotropy();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    // In `far`, not `ground`: it is scenery at the skyline's distance, so it
    // hides with the sky whenever the camera leaves the sphere (see tick).
    const mesh = this.addMesh(this.far, geo, new THREE.MeshBasicMaterial({ map: tex }));
    mesh.renderOrder = -3;

    const clear = this.checkSubspaces("river", s.cx, s.cz, outer);
    this.riverInfo = {
      bearing: d.riverBearingDeg, arc: arc, outer: outer,
      innerMin: +innerMin.toFixed(1), innerMax: +innerMax.toFixed(1),
      tris: pos.length / 9, subspaceClearM: clear == null ? null : +clear.toFixed(0),
    };
    if (outer >= d.skyRadius) {
      console.warn(`[park] the river reaches ${outer} m, through the ${d.skyRadius} m sky ` +
        "— lower riverOuter");
    }
  },

  // ---------------------------------------------------------------
  // ONE CROPPED TEXTURE per (picture, window), shared by every panel that shows
  // it. The canvas underneath belongs to CorridorTextures' cache and is keyed by
  // SOURCE PATH, so the four originals are one canvas between the corridor and
  // this ring however many bands use them; what is cloned here is only the uv
  // transform, which is per-band because each band crops a different amount off
  // the top.
  //
  // THE KEY HAS TO INCLUDE THE WINDOW, not just the source. The skyline bands
  // and the boat band trim different amounts, so a cache keyed on the path alone
  // would hand the second band the first band's crop and silently show it the
  // wrong slice of its own picture. (Today no picture is in both pools, so this
  // would not have bitten yet — which is exactly the kind of bug that waits.)
  //
  // Resolves to null if the build has been superseded while the image was
  // loading; see the READY note on CorridorTextures.silhouette for why a clone
  // must not exist before the real picture has arrived.
  // ---------------------------------------------------------------
  croppedTexture: function (lifter, kit, src, keep, token) {
    const key = src + "|" + keep.toFixed(4);
    const base = lifter.silhouette(src);
    return base.userData.ready.then(() => {
      if (token !== this.skylineToken) return null;
      if (!this.skylineCrops[key]) {
        const t = base.clone();
        t.repeat.set(1, keep);
        t.offset.set(0, kit.crop);
        this.skylineCrops[key] = t;
      }
      return this.skylineCrops[key];
    });
  },

  // ONE PANEL standing on the ground line at a bearing, facing the square's
  // centre — the mechanics every band shares: the environment layer's plane, the
  // same crop window, smooth alpha, no depth write, and the white-lifted canvas
  // attached once it has loaded (until then the panel stays hidden, because a
  // mapless haze-coloured plane is a solid grey rectangle).
  farPanel: function (o) {
    const d = this.data;
    const t = THREE.MathUtils.degToRad(o.deg);
    const panel = o.kitPanel || window.SkylineKit.panel;
    const kit = window.SkylineKit;
    const el = panel(o.lifter ? "" : o.src, o.w, o.h, {
      repeat: "1 " + o.keep,
      offset: "0 " + kit.crop,
      alphaTest: 0,
      depthWrite: false,
      color: o.lifter ? o.haze : null,
      opacity: o.lifter ? o.opacity : null,
    });
    el.setAttribute(
      "position",
      `${(o.cx + o.R * Math.sin(t)).toFixed(3)} ${(o.h / 2 + d.skylineLift).toFixed(3)} ` +
        `${(o.cz - o.R * Math.cos(t)).toFixed(3)}`
    );
    el.setAttribute("rotation", `0 ${(-o.deg).toFixed(3)} 0`);
    if (o.lifter) el.setAttribute("visible", false);
    o.root.appendChild(el);
    const onLoaded = () => {
      const mesh = el.getObject3D("mesh");
      if (!mesh) return;
      mesh.renderOrder = o.order;
      if (!o.lifter) return;
      this.croppedTexture(o.lifter, kit, o.src, o.keep, o.token).then((tex) => {
        if (!tex || o.token !== this.skylineToken) return;
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
        el.setAttribute("visible", true);
      });
    };
    if (el.hasLoaded) onLoaded();
    else el.addEventListener("loaded", onLoaded, { once: true });
    return el;
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
    this.picsUsed = {}; // distinct source paths this build lifts into canvases
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

    // THE POOL: the five new city pictures AND the four originals. The old four
    // are not retired — they are the reference everything here is scaled to, and
    // dropping them would change the skyline's character for no reason.
    const pool = (kit.cities || []).concat(kit.srcs);
    const bridgeSrcs = d.bridges ? (kit.bridges || []) : [];

    // THE TOP TRIM, FITTED PER BAND rather than taken on trust.
    //
    // skylineTopTrim 0.45 keeps 0.55 of the cropped height, and that number was
    // chosen when the pool was four pictures whose spires reach 0.436-0.503 —
    // it dropped only sky. The pool is now nine and they are not all framed the
    // same way: city-04 reaches 0.719. Left at 0.45 it would be beheaded, and
    // nothing would say so.
    //
    // So each band trims to ITS OWN tallest picture and RAISES ITS PANEL by the
    // same ratio. That second half is what keeps the change invisible: what sets
    // the city's apparent size is metres per unit of cropped height,
    // h / (1 - trim), so holding that fixed leaves every picture standing
    // exactly where it did before — saigon1's spires at 36.6 m in the near band,
    // as ever — while a taller picture is simply taller. Panel WIDTH comes out
    // unchanged for the same reason (w = h / keep x aspect, and keep scales with
    // 1 - trim), so the ring still closes with the same number of panels.
    const trimWant = d.skylineTopTrim;
    const fitTrim = (srcs) => {
      const maxSpire = srcs.reduce((m, src) => Math.max(m, kit.spire(src)), 0);
      const trim = Math.min(trimWant, Math.max(0, 1 - maxSpire));
      const tallest = srcs.reduce((a, b) => (kit.spire(a) >= kit.spire(b) ? a : b));
      return { trim: trim, maxSpire: maxSpire, tallest: tallest };
    };

    // DEAL PICTURES TO PANELS, without replacement from a shuffled deck, so a
    // ring of six shows six different cities rather than the same one twice.
    // `forbid` rejects a card for a slot; the deck is re-shuffled when it runs
    // out of legal ones. The bounded retry is there because a constraint set CAN
    // be unsatisfiable — a two-picture pool cannot fill a ring of three without
    // a repeat somewhere — and a scene must not hang on that. It takes the
    // least-bad card instead, and the seam check in the build log says so.
    const deal = (srcs, n, rand, forbid) => {
      const out = [];
      let deck = parkShuffle(srcs, rand);
      for (let i = 0; i < n; i++) {
        let pick = null;
        for (let pass = 0; pass < 3 && pick == null; pass++) {
          for (let k = deck.length - 1; k >= 0; k--) {
            if (!forbid(i, deck[k], out)) {
              pick = deck.splice(k, 1)[0];
              break;
            }
          }
          if (pick == null) deck = parkShuffle(srcs, rand);
        }
        out.push(pick == null ? srcs[i % srcs.length] : pick);
        if (!deck.length) deck = parkShuffle(srcs, rand);
      }
      return out;
    };

    const built = {}; // label -> { degs, pics }, so `near` can consult `far`

    const band = (label, R, h0, haze, opacity, max, phase, seedOffset, order) => {
      const fit = fitTrim(pool.concat(label === "near" ? bridgeSrcs : []));
      const keep = (1 - kit.crop) * (1 - fit.trim);
      const h = h0 * ((1 - fit.trim) / (1 - trimWant)); // same metres per unit
      const w = (h / keep) * kit.aspect;
      const need = Math.ceil(Math.PI / Math.atan(w / (2 * R)));
      const n = Math.max(3, Math.min(max, need));
      const degs = [];
      for (let i = 0; i < n; i++) degs.push((360 / n) * (i + phase));

      const rand = mulberry32(d.skylineSeed * 2749 + seedOffset);
      const far = built.far;
      const pics = deal(pool, n, rand, (i, src, got) => {
        if (i > 0 && src === got[i - 1]) return true; // neighbours differ
        if (i === n - 1 && src === got[0]) return true; // and across the seam
        // The near band must not repeat the far band's picture behind itself.
        //
        // BOTH NEIGHBOURS COUNT, not just the nearest. The far band is turned
        // half a panel against the near one so their seams never line up, which
        // means no far panel is ever squarely behind a near one — every near
        // panel is EXACTLY equidistant from two of them, and both show through
        // its gaps. Taking "the closest" would pick one of the two arbitrarily
        // (whichever the loop saw first) and leave the other free to repeat.
        if (far) {
          const reach = (360 / far.degs.length) * 0.5 + 1e-6;
          for (let k = 0; k < far.degs.length; k++) {
            if (Math.abs(parkAngleDelta(degs[i], far.degs[k])) > reach) continue;
            if (src === far.pics[k]) return true;
          }
        }
        return false;
      });

      // THE BRIDGES: one each, on a bearing over the water, taking over the
      // panel that would otherwise stand there — so the ring still closes and
      // nothing else moves. Placed once, in this band, never repeated.
      //
      // THE PANEL HAS TO BE OVER THE WATER, which is a stronger condition than
      // "nearest to the asked-for bearing" and the reason this does not simply
      // take the closest. A bridge wants the END of the river arc, and an end
      // falls between panels as often as not: at the defaults it asks for 30°
      // while the panels sit at 0° and 60°, both exactly 30° away. Nearest-wins
      // then turns on which one the loop happened to see first, and it put a
      // cable-stayed bridge at 0° — due north, standing on grass. So the
      // candidates are filtered to panels INSIDE the arc first, and only then
      // sorted by distance.
      const placedBridges = [];
      if (label === "near" && bridgeSrcs.length) {
        const wanted = this.bridgeBearings();
        const half = Math.max(0, Math.min(360, d.riverArcDeg)) / 2;
        const overWater = (deg) =>
          Math.abs(parkAngleDelta(d.riverBearingDeg, deg)) <= half + 1e-6;
        const taken = {};
        bridgeSrcs.forEach((src, bi) => {
          const want = wanted[bi];
          if (want == null) return;
          const pick = (requireWater) => {
            let best = -1;
            let bestD = 360;
            for (let k = 0; k < n; k++) {
              if (taken[k]) continue;
              if (requireWater && !overWater(degs[k])) continue;
              const dd = Math.abs(parkAngleDelta(want, degs[k]));
              if (dd < bestD) {
                bestD = dd;
                best = k;
              }
            }
            return { best: best, d: bestD };
          };
          let got = pick(true);
          let dry = false;
          if (got.best < 0) {
            got = pick(false); // no water panel free: take one anyway, and say so
            dry = true;
          }
          if (got.best < 0) {
            console.warn("[park] no free near panel left for " + src.split("/").pop());
            return;
          }
          if (dry) {
            console.warn(
              `[park] ${src.split("/").pop()} could not get a panel over the river ` +
                `(${d.riverArcDeg}° arc, ${n} panels) — it stands on land at ` +
                `${degs[got.best].toFixed(0)}°. Widen riverArcDeg or raise skylinePanelsMax.`
            );
          }
          taken[got.best] = true;
          pics[got.best] = src;
          placedBridges.push({
            src: src.split("/").pop(),
            wanted: +want.toFixed(1),
            at: +degs[got.best].toFixed(1),
            offBy: +got.d.toFixed(1),
            overWater: !dry,
          });
        });
      }

      built[label] = { degs: degs, pics: pics };
      pics.forEach((src) => { this.picsUsed[src] = true; });
      for (let i = 0; i < n; i++) {
        this.farPanel({
          root: root, src: pics[i], w: w, h: h, keep: keep,
          deg: degs[i], cx: s.cx, cz: s.cz, R: R,
          haze: haze, opacity: opacity, order: order, token: token, lifter: lifter,
        });
      }
      const cover = 2 * THREE.MathUtils.radToDeg(Math.atan(w / (2 * R)));
      const gap = Math.max(0, 2 * R * Math.tan(Math.PI / n) - w);
      // The ring's farthest point: a panel's top corner.
      const reach = Math.sqrt(R * R + (w / 2) * (w / 2) + (h + d.skylineLift) * (h + d.skylineLift));
      this.skylineInfo.push({
        band: label, radius: R, height: +h.toFixed(1), heightWas: h0,
        panelWidth: +w.toFixed(1), panels: n, needed: need,
        degEach: +cover.toFixed(1), gapM: +gap.toFixed(1), reach: +reach.toFixed(1),
        trim: +fit.trim.toFixed(3), trimWant: trimWant,
        tallest: fit.tallest.split("/").pop(), maxSpire: +fit.maxSpire.toFixed(3),
        seamOk: pics[n - 1] !== pics[0],
        bridges: placedBridges,
        pics: pics.map((x) => x.split("/").pop()),
      });
    };
    // Render order, back to front: far band, near band, boats, then everything
    // else transparent (the ground cues, all nearer than any of this).
    // FAR IS BUILT FIRST because the near band's deal reads it, to avoid
    // standing the same picture at the same bearing at both depths.
    band("far", d.skylineRadius2, d.skylineHeight2, d.skylineHaze2,
      d.skylineHazeOpacity2, d.skylinePanelsMax2, 0.5, 0, -3);
    band("near", d.skylineRadius, d.skylineHeight, d.skylineHaze,
      d.skylineHazeOpacity, d.skylinePanelsMax, 0, 977, -2);
  },

  // Where the bridges stand. "auto" is the two ends of the river arc: the water
  // is the only place a bridge makes sense, and its ends are where a crossing
  // would leave the frame. Explicit bearings are NOT clamped into the arc —
  // that is the author's call — but the build log says whether each one landed
  // over water.
  // The build log keeps picture BASENAMES (a full path per panel makes it
  // unreadable); this puts one back to the path SkylineKit knows it by, so the
  // log can look its measurements up again.
  srcForName: function (name) {
    const kit = window.SkylineKit;
    if (!kit) return null;
    const all = (kit.cities || []).concat(kit.bridges || [], kit.boats || [], kit.srcs || []);
    for (let i = 0; i < all.length; i++) {
      if (all[i].split("/").pop() === name) return all[i];
    }
    return null;
  },

  bridgeBearings: function () {
    const d = this.data;
    const v = d.bridgeBearingsDeg;
    if (v !== "auto" && v && v.length) return v;
    const half = Math.max(0, Math.min(360, d.riverArcDeg)) / 2;
    return [d.riverBearingDeg - half, d.riverBearingDeg + half];
  },

  // ---------------------------------------------------------------
  // THE BOATS — a third band, on the river and nowhere else.
  //
  // It is built out of the same parts as the skyline bands (SkylineKit's plane,
  // the same crop window, the same white-lifted canvases through
  // CorridorTextures) so it costs no new machinery and no duplicated texture.
  // Three things make it a different band rather than a third ring:
  //
  //   IT IS AN ARC, NOT A RING. Boats belong on water, so the panels only exist
  //   between riverBearingDeg ± riverArcDeg/2, and they are inset from the arc's
  //   ends by half a panel's own angular width so no boat hangs off the edge of
  //   the water it is floating on. boatRadius (100 m) sits between the lawn's
  //   outer edge (~40-56 m out) and the near skyline band (130 m), so the whole
  //   band stands on the river surface with city behind it.
  //
  //   IT IS SPACED, NOT PACKED. A skyline band works out how many panels it
  //   takes to CLOSE, because a gap in a skyline is a hole. Boats want gaps:
  //   boatCount panels are dealt one to a slot across the arc and each wanders
  //   up to boatJitter of its own slot, seeded by boatSeed. Bounding the wander
  //   by the slot is what keeps them from clumping or swapping places, so the
  //   spacing reads as scattered rather than as a row with one pushed out.
  //
  //   IT SIZES ITSELF FROM THE PICTURES. The skyline bands fix a panel height
  //   and let the picture fill it; that only works because the four originals
  //   are framed almost identically (spires at 0.436-0.503 of the cropped
  //   height). The boat pictures are not: a low sampan is 0.229 and a
  //   tall-masted fishing boat 0.971, four times as much. Fixing the panel
  //   height would make every boat the same size on the water, which is the one
  //   thing they visibly are not. So the band trims to its TALLEST picture,
  //   boatHeight is that boat's height, and every other picture comes out at its
  //   own share of it — a 6 m mast next to a 1.4 m sampan. That is also why the
  //   trim is fitted rather than taken from skylineTopTrim: 0.45 would keep only
  //   0.55 of the cropped height and cut the masts off nine of the nineteen.
  // ---------------------------------------------------------------
  buildBoats: function (s) {
    const d = this.data;
    this.boatInfo = null;
    if (this.boatEl && this.boatEl.parentNode) {
      this.boatEl.parentNode.removeChild(this.boatEl);
    }
    this.boatEl = null;
    if (!d.boats || d.boatCount <= 0) return;
    const kit = window.SkylineKit;
    if (!kit) return; // buildSkyline has already warned
    const pool = kit.boats || [];
    if (!pool.length) {
      console.warn("[park] SkylineKit has no boat pictures; no boat band");
      return;
    }
    const lifter = typeof CorridorTextures !== "undefined" ? CorridorTextures : null;
    const token = this.skylineToken;

    const root = document.createElement("a-entity");
    root.setAttribute("data-park", "boats");
    this.el.appendChild(root);
    this.boatEl = root;

    // Trim fitted to the tallest picture in the pool: keep exactly as much of
    // the cropped height as the tallest subject occupies, and not a row more.
    const maxSpire = pool.reduce((m, src) => Math.max(m, kit.spire(src)), 0);
    const trim = Math.max(0, 1 - maxSpire);
    const keep = (1 - kit.crop) * (1 - trim);
    const h = d.boatHeight;
    const w = (h / keep) * kit.aspect;

    const R = d.boatRadius;
    const arc = Math.max(0, Math.min(360, d.riverArcDeg));
    // Half a panel's angular width, so a boat at either end still floats.
    const halfPanelDeg = THREE.MathUtils.radToDeg(Math.atan(w / (2 * R)));
    const from = d.riverBearingDeg - arc / 2 + halfPanelDeg;
    const to = d.riverBearingDeg + arc / 2 - halfPanelDeg;
    const span = to - from;
    if (span <= 0) {
      console.warn(
        `[park] the river arc (${arc}°) is narrower than one ${w.toFixed(0)} m boat panel ` +
          `at ${R} m — widen riverArcDeg, lower boatHeight, or move boatRadius out`
      );
      return;
    }

    const rand = mulberry32(d.boatSeed * 7681 + 29);
    const n = d.boatCount;
    const slot = span / n;
    const jitter = Math.max(0, Math.min(1, d.boatJitter));
    // Dealt without replacement: five boats drawn independently from fourteen
    // pictures show a duplicate more often than not (birthday problem — about
    // a 1 in 2 chance), and two identical hulls side by side on open water is
    // the one thing that gives a seeded scatter away. Reshuffled if the band
    // ever asks for more boats than there are pictures.
    let deck = parkShuffle(pool, rand);
    const placed = [];
    for (let i = 0; i < n; i++) {
      const centre = from + slot * (i + 0.5);
      const deg = centre + (rand() - 0.5) * slot * jitter;
      if (!deck.length) deck = parkShuffle(pool, rand);
      const src = deck.pop();
      const spire = kit.spire(src);
      // This picture's own height, as its share of the tallest one's.
      const ph = h * (spire / maxSpire);
      const pw = (ph / keep) * kit.aspect;
      this.farPanel({
        root: root, src: src, w: pw, h: ph, keep: keep,
        deg: deg, cx: s.cx, cz: s.cz, R: R,
        haze: d.boatHaze, opacity: d.boatHazeOpacity,
        order: -1, token: token, lifter: lifter,
      });
      this.picsUsed[src] = true;
      placed.push({ deg: +deg.toFixed(1), src: src.split("/").pop(), h: +ph.toFixed(1) });
    }

    // A boat has to be ON the water. buildRiver ran first, so its measured
    // extent is known: inside innerMax the boat would be standing on the lawn
    // (or on the square), past `outer` it would be beyond the far shore, out on
    // the sky sphere's ground band with the skyline behind it.
    const riv = this.riverInfo;
    if (!riv) {
      console.warn(
        `[park] the boat band is on at ${R} m but the river is off — the boats ` +
          "will be standing on the sky sphere's ground band"
      );
    } else {
      if (R >= riv.outer) {
        console.warn(`[park] boatRadius ${R} m is past the river's far edge ` +
          `(${riv.outer} m) — the boats are aground`);
      }
      if (R <= riv.innerMax) {
        console.warn(`[park] boatRadius ${R} m is inside the lawn's outer edge ` +
          `(up to ${riv.innerMax} m at the corners) — the boats are on the grass`);
      }
    }

    const reach = Math.sqrt(R * R + (w / 2) * (w / 2) + (h + d.skylineLift) * (h + d.skylineLift));
    this.boatInfo = {
      radius: R, count: n, arcFrom: +from.toFixed(1), arcTo: +to.toFixed(1),
      trim: +trim.toFixed(3), maxSpire: +maxSpire.toFixed(3),
      tallest: +h.toFixed(1), shortest: +Math.min.apply(null, placed.map((p) => p.h)).toFixed(1),
      widest: +w.toFixed(1), reach: +reach.toFixed(1), placed: placed,
    };
  },

  // ---------------------------------------------------------------
  // THE BUILD LOG for everything far off — the skyline bands, the river, and
  // (from the next stage) the boats. One place, called from build() after all
  // of them, rather than each printing its own: they share a frame and the
  // interesting question is always how they sit relative to each other and to
  // the two limits that bound them all — the sky sphere they must stay inside,
  // and the teleport sub-spaces they must stay clear of.
  //
  // Called unconditionally, so `skyline: false` or `river: false` still says so
  // rather than leaving a silent gap in the log.
  // ---------------------------------------------------------------
  logFarScenery: function (s) {
    const d = this.data;
    const bands = this.skylineInfo || [];
    console.log(
      "[park] skyline " +
        (bands.length
          ? bands.map((b) =>
              `${b.band} ${b.panels} × ${b.panelWidth} m at ${b.radius} m, ${b.height} m tall, ` +
                `reaching ${b.reach} m` +
                (b.gapM > 0 ? ` (GAPS of ${b.gapM} m — raise skylinePanelsMax)` : "")
            ).join(", ")
          : "off")
    );

    // What each band is actually showing, and why it is that tall. The trim is
    // the interesting number: it is fitted to the band's tallest picture, so a
    // value below skylineTopTrim means a picture in the pool needed the room.
    const kit = window.SkylineKit;
    bands.forEach((b) => {
      console.log(
        `[park]   ${b.band}: ${b.pics.join(", ")}` +
          (b.seamOk ? "" : " — SEAM REPEATS (pool too small for this many panels)")
      );
      if (b.trim < b.trimWant) {
        console.log(
          `[park]   ${b.band}: top trim ${b.trimWant} → ${b.trim} to clear ${b.tallest} ` +
            `(spire ${b.maxSpire}); panel ${b.heightWas} → ${b.height} m so the city keeps its scale`
        );
      }
      if (b.bridges && b.bridges.length) {
        console.log(
          `[park]   ${b.band}: bridges ` +
            b.bridges.map((x) =>
              `${x.src} at ${x.at}° (wanted ${x.wanted}°, off by ${x.offBy}°` +
                (x.overWater ? ", over the river)" : ", ON LAND)")
            ).join(", ")
        );
      }
    });

    // A picture framed far tighter than the originals is not broken, but it will
    // not sit at the same apparent scale as the rest of the pool — it is the
    // thing that makes one panel tower over its neighbours for no reason in the
    // world. Reported rather than left to be noticed in a headset.
    if (kit && kit.referenceSpire) {
      const limit = kit.referenceSpire.max * 1.5;
      const odd = [];
      bands.forEach((b) => {
        b.pics.forEach((name) => {
          const src = this.srcForName(name);
          if (src && kit.spire(src) > limit && odd.indexOf(name) < 0) odd.push(name);
        });
      });
      if (odd.length) {
        console.warn(
          `[park] these pictures are framed much tighter than the four originals ` +
            `(spire over ${limit.toFixed(2)} against their ${kit.referenceSpire.min}-` +
            `${kit.referenceSpire.max}), so they stand well taller than their neighbours: ` +
            odd.join(", ") + " — re-cut them with maxSpire in tools/silhouette-alpha.js"
        );
      }
    }
    const r = this.riverInfo;
    console.log(
      "[park] river " +
        (r
          ? `${r.arc}° at bearing ${r.bearing}, from the lawn's edge ` +
            `(${r.innerMin}-${r.innerMax} m out) to ${r.outer} m, ${r.tris} triangles` +
            (r.subspaceClearM == null ? "" : `, ${r.subspaceClearM} m clear of the sub-spaces`)
          : "off")
    );

    const bo = this.boatInfo;
    console.log(
      "[park] boats " +
        (bo
          ? `${bo.count} on the river at ${bo.radius} m, bearings ` +
            `${bo.arcFrom}-${bo.arcTo}°, ${bo.shortest}-${bo.tallest} m tall ` +
            `(trim ${bo.trim} fitted to the tallest picture, spire ${bo.maxSpire}), ` +
            `at ${bo.placed.map((x) => `${x.deg}° ${x.src}`).join(", ")}`
          : "off")
    );

    // WHAT THIS COSTS IN TEXTURE MEMORY, because it is the one number that grew
    // a lot. Each picture is lifted into a 1456x816 canvas (4.5 MB, 6 MB with
    // mipmaps) by CorridorTextures, and the park used to share the corridor's
    // four and add nothing. Shuffling a pool of nine cities, two bridges and
    // fourteen boats means it lifts whatever it actually deals — so the count
    // is reported rather than assumed. The levers, in order: boatCount, then
    // skylinePanelsMax (fewer panels deal fewer distinct pictures), then the
    // pool sizes in js/environment.js.
    const used = Object.keys(this.picsUsed || {});
    const legacy = (kit && kit.srcs) || [];
    const shared = used.filter((x) => legacy.indexOf(x) >= 0).length;
    console.log(
      `[park] pictures ${used.length} lifted into canvases, ~${(used.length * 4.53).toFixed(0)} MB ` +
        `(~${(used.length * 6.05).toFixed(0)} MB with mipmaps); ${shared} of them shared with the ` +
        "Zone A corridor window, which lifts the same four"
    );

    // Everything far off reduced to a centre and a farthest point — the shape
    // both of the two limits are measured against.
    this.farCenter = { x: s.cx, z: s.cz };
    this.farReach = bands.map((b) => ({ label: b.band + " band", reach: b.reach }));
    if (r) this.farReach.push({ label: "river", reach: r.outer });
    if (bo) this.farReach.push({ label: "boat band", reach: bo.reach });
    this.farReach.forEach((f) => {
      if (f.reach >= d.skyRadius) {
        console.warn(`[park] the ${f.label} reaches ${f.reach} m, through the ` +
          `${d.skyRadius} m sky — lower its height or radius`);
      }
    });
    this.checkAllSubspaces();
  },

  // ---------------------------------------------------------------
  // THE CLEARANCE CHECK, WHICH USUALLY HAS TO WAIT. The park builds on
  // `floorplanbuilt`, and the two sub-space roots write their own positions from
  // their own components' update — which on a cold load has not run yet, so at
  // build time both are still sitting at the origin and there is nothing to
  // measure against. Reporting "clear" from that would be a pass the check never
  // made, so instead it says what it could not check and runs again, once, on
  // the scene's `loaded` event, by which time they have placed themselves.
  // ---------------------------------------------------------------
  checkAllSubspaces: function () {
    const subs = this.subspaces();
    const pending = this.subspacesPending || [];
    let worst = Infinity;
    (this.farReach || []).forEach((f) => {
      const gap = this.checkSubspaces(f.label, this.farCenter.x, this.farCenter.z, f.reach);
      if (gap != null && gap < worst) worst = gap;
    });
    console.log(
      `[park] sub-space clearance (${PARK_SUBSPACE_CLEARANCE} m minimum): ` +
        (subs.length
          ? subs.map((x) => `${x.id} at z ${x.z.toFixed(0)}`).join(", ") +
            (isFinite(worst) ? `, tightest ${worst.toFixed(0)} m` : "")
          : "none found") +
        (pending.length ? `; not placed yet, unchecked: ${pending.join(", ")}` : "")
    );
    if (pending.length && !this.subspaceRechecked) {
      this.subspaceRechecked = true; // once only, however many roots are late
      const again = () => this.checkAllSubspaces();
      if (this.el.sceneEl.hasLoaded) setTimeout(again, 0);
      else this.el.sceneEl.addEventListener("loaded", again, { once: true });
    }
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
      if (this.boatEl) this.boatEl.object3D.visible = inside;
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
    if (this.boatEl && this.boatEl.parentNode) {
      this.boatEl.parentNode.removeChild(this.boatEl);
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
    this.el.sceneEl.removeEventListener("zonebtriptychbuilt", this.onWallChange);
    this.el.removeObject3D("ground");
    this.el.removeObject3D("far");
    if (ParkConfig.component === this) ParkConfig.component = null;
  },
});
