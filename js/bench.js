// ================================================================
// terrazzo-bench — a Vietnamese đá mài (terrazzo) park bench, built entirely
// from primitives + a runtime speckle texture (no GLB, no image assets, no
// fonts). Zone-agnostic and reusable: the component only builds the bench in
// its OWN local frame (sitting on local y=0, seat width along local x, a
// sitter faces local +z, backrest on the -z edge); WHERE it stands is plain
// entity position/rotation attributes set by whoever instantiates it.
//
// Anatomy (all primitives, grouped under one THREE.Group so the whole bench
// moves/rotates as a unit):
//   - seat slab (box) + backrest slab (thin box, tilted back, rising from the
//     seat's back edge),
//   - two splayed legs (boxes rotated outward — the classic tapered-leg look
//     approximated by the splay),
//   - rolled end caps (horizontal cylinders) on the seat's side ends and the
//     backrest's top edge — the white curled ends of the reference benches,
//   - thin pinstripe accents inboard of each end on the seat top and the
//     backrest front.
//
// Terrazzo comes from makeTerrazzoTexture() below: a small cached canvas
// speckled with seeded-random flecks (same runtime-canvas approach as the
// shared ContactCue texture). Green/white speckle body, white speckle rolls,
// grey speckle legs — all colors + speckle density/seed are properties.
//
// Everything is unlit (MeshBasicMaterial), matching the exhibition's flat
// diffuse look; the speckle carries the surface interest.
//
// TUNABLES (defaults in the schema; adjust live by eye, no code edits):
//   width/depth/seatThickness/seatHeight — seat slab (top at seatHeight).
//   backHeight/backTilt/backThickness    — backrest rise above the seat top,
//                                          backward lean (deg), slab thickness.
//   legSplay/legInset                    — outward lean (deg), distance of
//                                          each leg from the seat ends.
//   rollEnds/rollRadius                  — the curled end cylinders.
//   stripe/stripeColor/stripeWidth       — the pinstripe accents.
//   bodyColor/endColor/legColor          — terrazzo base colors per part.
//   speckleDensity/speckleSeed           — fleck count / deterministic seed.
// ================================================================

// ----------------------------------------------------------------
// makeTerrazzoTexture — ONE reusable generator for every terrazzo surface:
// a small canvas filled with `base`, speckled with `density` flecks drawn in
// colors from `flecks`, deterministic per `seed` (seeded PRNG, not
// Math.random, so a given bench always looks the same). Canvases are cached
// by their full parameter key — N benches with the same palette share one
// texture. No asset files, mirroring ContactCue.makeTexture.
// ----------------------------------------------------------------
const TERRAZZO_CACHE = new Map();
function makeTerrazzoTexture(base, flecks, density, seed) {
  const key = base + "|" + flecks.join(",") + "|" + density + "|" + seed;
  if (TERRAZZO_CACHE.has(key)) return TERRAZZO_CACHE.get(key);

  // mulberry32 — tiny seeded PRNG, plenty for speckle placement.
  let s = (seed * 0x9e3779b9) >>> 0;
  const rand = function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Flecks: small irregular quads (marble chips), varied size + rotation.
  for (let i = 0; i < density; i++) {
    ctx.fillStyle = flecks[Math.floor(rand() * flecks.length)];
    const x = rand() * size;
    const y = rand() * size;
    const r = 1.2 + rand() * 3.2;
    const a = rand() * Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-r, -r * (0.4 + rand() * 0.5));
    ctx.lineTo(r * (0.5 + rand() * 0.5), -r * 0.5);
    ctx.lineTo(r, r * (0.3 + rand() * 0.6));
    ctx.lineTo(-r * (0.4 + rand() * 0.5), r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  TERRAZZO_CACHE.set(key, tex);
  return tex;
}

AFRAME.registerComponent("terrazzo-bench", {
  schema: {
    // seat slab
    width: { type: "number", default: 1.2 },
    depth: { type: "number", default: 0.45 },
    seatThickness: { type: "number", default: 0.09 },
    seatHeight: { type: "number", default: 0.45 }, // seat TOP above local floor
    // backrest
    backHeight: { type: "number", default: 0.45 }, // rise above the seat top
    backTilt: { type: "number", default: 8 }, // deg, leaning back
    backThickness: { type: "number", default: 0.06 },
    // legs
    legSplay: { type: "number", default: 8 }, // deg, outward lean
    legInset: { type: "number", default: 0.15 }, // from the seat ends
    // rolled end caps
    rollEnds: { type: "boolean", default: true },
    rollRadius: { type: "number", default: 0.06 },
    // pinstripe accents
    stripe: { type: "boolean", default: true },
    stripeColor: { type: "color", default: "#e8e2d2" },
    stripeWidth: { type: "number", default: 0.03 },
    // terrazzo palette + speckle
    bodyColor: { type: "color", default: "#3e7a5a" }, // đá mài green
    endColor: { type: "color", default: "#e8e2d2" }, // white rolls
    legColor: { type: "color", default: "#8f918b" }, // grey legs
    speckleDensity: { type: "number", default: 260 },
    speckleSeed: { type: "number", default: 7 },
  },

  init: function () {
    this.group = null;
    this.geometries = [];
    this.materials = [];
  },

  // Rebuild on ANY tunable change (first update included) — a handful of
  // primitives, so a full rebuild is cheap and keeps the code simple.
  update: function () {
    this.teardown();
    this.build();
  },

  build: function () {
    const d = this.data;
    const group = new THREE.Group();

    // --- shared unlit materials (textures come from the shared cache).
    const bodyMat = this.mat(d.bodyColor, ["#e8e2d2", "#245239", "#cfd8c9"]);
    const endMat = this.mat(d.endColor, ["#b9b3a4", "#3e7a5a", "#8f918b"]);
    const legMat = this.mat(d.legColor, ["#e8e2d2", "#5a5d57"]);
    const stripeMat = new THREE.MeshBasicMaterial({ color: d.stripeColor });
    this.materials.push(stripeMat);

    const box = (w, h, dp, mat) => {
      const g = new THREE.BoxGeometry(w, h, dp);
      this.geometries.push(g);
      return new THREE.Mesh(g, mat);
    };
    const cyl = (r, len, mat) => {
      const g = new THREE.CylinderGeometry(r, r, len, 12);
      this.geometries.push(g);
      return new THREE.Mesh(g, mat);
    };

    // --- seat slab, top at seatHeight, centred on the local origin.
    const seat = box(d.width, d.seatThickness, d.depth, bodyMat);
    seat.position.y = d.seatHeight - d.seatThickness / 2;
    group.add(seat);

    // --- backrest sub-group, hinged at the seat's BACK (-z) edge: the slab
    // rises from the hinge and leans back by backTilt. Its children (top
    // roll, stripes) inherit the tilt.
    const tilt = THREE.MathUtils.degToRad(d.backTilt);
    const backLen = d.backHeight / Math.cos(tilt); // slab length along its lean
    const backGroup = new THREE.Group();
    backGroup.position.set(0, d.seatHeight, -d.depth / 2 + d.backThickness / 2);
    backGroup.rotation.x = -tilt; // top away from the sitter
    const back = box(d.width, backLen, d.backThickness, bodyMat);
    back.position.y = backLen / 2;
    backGroup.add(back);
    group.add(backGroup);

    // --- two splayed legs (rotated boxes; the splay reads as the taper).
    const splay = THREE.MathUtils.degToRad(d.legSplay);
    const legH = d.seatHeight - 0.02; // reaches into the slab, never past it
    [-1, 1].forEach((side) => {
      const leg = box(0.08, legH, d.depth * 0.78, legMat);
      leg.position.set(side * (d.width / 2 - d.legInset), legH / 2, 0);
      leg.rotation.z = side * splay; // bottoms splay OUTWARD
      group.add(leg);
    });

    // --- rolled end caps: cylinders on the seat's side ends + back's top.
    if (d.rollEnds) {
      [-1, 1].forEach((side) => {
        const roll = cyl(d.rollRadius, d.depth, endMat);
        roll.rotation.x = Math.PI / 2; // axis along local z (front-back)
        roll.position.set(side * (d.width / 2), d.seatHeight - d.seatThickness / 2, 0);
        group.add(roll);
      });
      const topRoll = cyl(d.rollRadius, d.width, endMat);
      topRoll.rotation.z = Math.PI / 2; // axis along local x (bench length)
      topRoll.position.y = backLen; // top edge, follows the backrest tilt
      backGroup.add(topRoll);
    }

    // --- pinstripes inboard of each end: across the seat top + up the
    // backrest front (a hair proud of the surface against z-fighting).
    if (d.stripe) {
      const inset = d.legInset + d.stripeWidth; // just inboard of the legs
      [-1, 1].forEach((side) => {
        const x = side * (d.width / 2 - inset);
        const seatStripe = box(d.stripeWidth, 0.004, d.depth, stripeMat);
        seatStripe.position.set(x, d.seatHeight + 0.002, 0);
        group.add(seatStripe);
        const backStripe = box(d.stripeWidth, backLen, 0.004, stripeMat);
        backStripe.position.set(x, backLen / 2, d.backThickness / 2 + 0.002);
        backGroup.add(backStripe);
      });
    }

    this.group = group;
    this.el.setObject3D("bench", group);
  },

  // One unlit speckled material; the texture itself comes from (and stays
  // owned by) the shared cache, so only the material is disposed on rebuild.
  mat: function (base, flecks) {
    const tex = makeTerrazzoTexture(
      base,
      flecks,
      this.data.speckleDensity,
      this.data.speckleSeed
    );
    const m = new THREE.MeshBasicMaterial({ map: tex });
    this.materials.push(m);
    return m;
  },

  teardown: function () {
    if (this.group) this.el.removeObject3D("bench");
    this.group = null;
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose()); // textures live in the cache
    this.geometries = [];
    this.materials = [];
  },

  remove: function () {
    this.teardown();
  },
});
