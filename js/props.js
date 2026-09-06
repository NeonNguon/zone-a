// ================================================================
// PropKit — the exhibition's small furniture, built from primitives and
// runtime canvases. No GLB, no image assets, no fonts.
//
// The same bargain terrazzo-bench (js/bench.js) makes, one step further along:
// bench.js is an A-FRAME COMPONENT that happens to be zone-agnostic, so using
// it means creating an entity and setting attributes. These props are wanted
// deep inside another component's build (corridor-root puts four of them in the
// chung cư corridor, under its own group, so they ride its `offset` and vanish
// with its `shown`), and an entity per prop would put them outside that group
// and outside its teardown. So PropKit is a plain object of BUILDERS instead:
// each returns a THREE.Group the caller owns, adds where it likes, and throws
// away with group.userData.dispose().
//
// THE CONTRACT every builder keeps:
//   ORIGIN     local (0, 0, 0) is on the FLOOR at the footprint's centre, so a
//              caller places a prop by its own position and never has to know
//              how tall it is.
//   FACING     local +z is the prop's FRONT — the side a person stands on. A
//              prop against a wall is yawed so its +z looks into the room, and
//              nothing else about it has to change.
//   SIZE       local +x is its WIDTH. So a row of seats spreads along x, a
//              table's long axis is x, and a bike's length is x (you see a
//              bike from the side, so its front is still +z).
//   OPTIONS    every dimension is an option with a default. Nothing in the
//              code below is a number that is not one, except proportions
//              DERIVED from them (a wheelbase from a wheel, a crank from a
//              wheel) which are commented where they happen.
//   DISPOSE    group.userData.dispose() releases every geometry, material and
//              texture the builder made.
//
// TEXTURES ARE PER-PROP, NOT CACHED ACROSS PROPS — the one place this
// deliberately differs from bench.js's TERRAZZO_CACHE. A cached texture cannot
// be disposed by the group that happens to be torn down first without pulling
// it out from under the others, and the corridor rebuilds on any schema change.
// Four props' worth of small canvases is a rounding error next to the
// corridor's six 1024² wall canvases; a dispose() that is exactly right is not.
// WITHIN one prop textures are shared by every mesh that wants them (all three
// seat backs sample one vinyl canvas, both wheels one spoke canvas).
//
// LIT, BY DEFAULT — and this is the one thing here that does not match the
// corridor's walls. Everything in js/zone-a-corridor.js is `shader: flat`
// (MeshBasicMaterial) with its light PAINTED INTO the texture, because the
// gallery's room lamps do not reach 400 m out and a lit corridor would be raked
// by the global directionals alone. A prop is different: it is a small object
// with real curvature standing in the middle of the floor, and baking a
// convincing key into a canvas that wraps a torus is not worth it. The globals
// DO reach the corridor — ambient 0.75, a hemisphere at 0.35 and two
// directionals at 1.2 and 0.5 (js/environment.js, GALLERY_*) — so
// MeshLambertMaterial gives these forms their roundness for free. That is a
// bright rig, so the albedos below are chosen dark on purpose.
//
//   unlit: true  swaps every material to MeshBasicMaterial and BAKES the same
//                fixed key/fill into the geometry's vertex colours instead
//                (bakeShading), so the forms still read. Use it if the props
//                come out brighter than the walls they stand against, or if a
//                future environment preset changes the rig under them.
//
// The four builders, and what they are FROM — both photographs are in
// reference/ChungCu:
//   seatRow      ...-7039: three brown vinyl cinema seats against a corridor
//                wall, the outer two with fan-pleated backs, the middle one
//                darker and squarer. Set on a dark plinth.
//   lowTable     ...-7039 again: the black oval in front of them, its laminate
//                peeled off in big pale islands, on four thin splayed legs.
//   childBike    ...-6551: a small blue bike with red trim leaning on the wall
//                of a dark corridor, next to a stuffed white bag.
//   plasticBag   ...-6551: that bag.
// ================================================================
const PropKit = {
  // ---- the small shared machinery ---------------------------------------

  // mulberry32, the same seeded PRNG bench.js and CorridorTextures use, so a
  // given `seed` always builds the identical prop (no Math.random anywhere).
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

  // A build in progress. Holds the group and the three lists that make
  // dispose() exact, plus the `unlit` flag every material and geometry has to
  // know about.
  begin: function (o) {
    const ctx = {
      group: new THREE.Group(),
      geometries: [],
      materials: [],
      textures: [],
      unlit: !!o.unlit,
    };
    ctx.group.userData.dispose = function () {
      ctx.geometries.forEach((g) => g.dispose());
      ctx.materials.forEach((m) => m.dispose());
      ctx.textures.forEach((t) => t.dispose());
      ctx.geometries = [];
      ctx.materials = [];
      ctx.textures = [];
    };
    return ctx;
  },

  tex: function (ctx, canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    ctx.textures.push(t);
    return t;
  },

  // A material, lit or not. `vertexColors` is switched on for the unlit path
  // because that is where the baked shading lives.
  mat: function (ctx, opts) {
    const o = Object.assign({}, opts);
    let m;
    if (ctx.unlit) {
      o.vertexColors = true;
      m = new THREE.MeshBasicMaterial(o);
    } else {
      m = new THREE.MeshLambertMaterial(o);
    }
    ctx.materials.push(m);
    return m;
  },

  // BAKED SHADING for the unlit path: the same key/fill the gallery's globals
  // would have given, written into the geometry's vertex colours from its own
  // NORMALS. It works on any primitive — a torus and a box get the same
  // treatment — which is what makes `unlit` a switch rather than a rewrite.
  // Only called when unlit; a lit material ignores vertex colours it has not
  // been told to read.
  KEY: [0.56, 0.75, 0.28], // GALLERY_KEY's direction, normalised
  FILL: [-0.54, 0.43, -0.65], // GALLERY_FILL's
  bakeShading: function (geo) {
    const pos = geo.attributes.position;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const nx = n.getX(i);
      const ny = n.getY(i);
      const nz = n.getZ(i);
      const k = Math.max(0, nx * this.KEY[0] + ny * this.KEY[1] + nz * this.KEY[2]);
      const f = Math.max(0, nx * this.FILL[0] + ny * this.FILL[1] + nz * this.FILL[2]);
      // ambient + hemisphere (which leans on the vertical) + key + fill, then
      // held under 1 so nothing blows out.
      const v = Math.min(1, 0.52 + 0.14 * (ny * 0.5 + 0.5) + 0.4 * k + 0.16 * f);
      col[i * 3] = v;
      col[i * 3 + 1] = v;
      col[i * 3 + 2] = v;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  },

  // Track a geometry, bake it if we are unlit, and hand it back.
  geo: function (ctx, g) {
    if (ctx.unlit) this.bakeShading(g);
    ctx.geometries.push(g);
    return g;
  },

  // One mesh, positioned (and optionally rotated) in the prop's local frame.
  add: function (ctx, g, m, x, y, z, rx, ry, rz) {
    const mesh = new THREE.Mesh(this.geo(ctx, g), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) mesh.rotation.set(rx || 0, ry || 0, rz || 0);
    ctx.group.add(mesh);
    return mesh;
  },

  // A CYLINDER FROM a TO b — the workhorse for a bicycle, which is nothing but
  // tubes between points. Both ends are given in the prop's own frame, so the
  // caller describes a frame by its joints and never by angles.
  tube: function (ctx, m, a, b, r, seg) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return null;
    const g = new THREE.CylinderGeometry(r, r, len, seg || 8, 1);
    const mesh = new THREE.Mesh(this.geo(ctx, g), m);
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    // A cylinder is born along +y; point it down the a->b axis.
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, dy, dz).normalize()
    );
    ctx.group.add(mesh);
    return mesh;
  },

  // Shade a hex by a factor, as a css string — used all over for "the same
  // colour, in shadow" without inventing a second option for it.
  shade: function (hex, f) {
    const h = String(hex).replace("#", "");
    const n = parseInt(
      h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h,
      16
    );
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
      Math.max(0, Math.min(255, Math.round(v * f)))
    );
    return "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
  },

  // ======================================================================
  // SEAT ROW — three cinema seats in brown vinyl, from reference ...-7039.
  //
  // What the photograph actually shows, and what is worth building: the two
  // OUTER seats have tall fan-pleated backs, five or six vertical channels
  // each, in a warm chestnut vinyl; the MIDDLE one is a different chair
  // altogether — darker, squarer, buttoned rather than channelled — because
  // three chairs in a corridor are three chairs somebody carried out there, not
  // a suite. That difference is the whole character of the row, so it is built
  // in: one canvas, two materials, the middle seat tinted down.
  //
  // The three sit on a shared dark plinth that runs the length of the row and a
  // little past it, on two small feet.
  //
  // @param {object} [o] seats 3, seatWidth .58, seatDepth .55, seatH .42,
  //   backH .55, armW .06, color "#5a2e1e", color2 "#7a4430", wear .5,
  //   pleats 6, seed 1, unlit false
  // @returns {THREE.Group} origin on the floor at the row's centre, front +z,
  //   width along x. 11 meshes, one texture.
  // ======================================================================
  seatRow: function (o) {
    o = o || {};
    const seats = o.seats != null ? o.seats : 3;
    const sw = o.seatWidth != null ? o.seatWidth : 0.58;
    const sd = o.seatDepth != null ? o.seatDepth : 0.55;
    const sh = o.seatH != null ? o.seatH : 0.42;
    const bh = o.backH != null ? o.backH : 0.55;
    const aw = o.armW != null ? o.armW : 0.06;
    const color = o.color || "#5a2e1e";
    const color2 = o.color2 || "#7a4430";
    const wear = o.wear != null ? o.wear : 0.5;
    const pleats = o.pleats != null ? o.pleats : 6;
    const seed = o.seed != null ? o.seed : 1;
    const ctx = this.begin(o);

    const tex = this.tex(ctx, this.vinylCanvas(256, seed, pleats, wear));
    // ONE canvas, TWO materials: a Lambert/Basic map is multiplied by the
    // material colour, so "the same vinyl, a darker chair" costs a material and
    // not a second 256² canvas.
    const outer = this.mat(ctx, { map: tex, color: new THREE.Color(color2) });
    const middle = this.mat(ctx, { map: tex, color: new THREE.Color(color) });
    const dark = this.mat(ctx, { color: new THREE.Color(this.shade(color, 0.42)) });

    const rowW = seats * sw;
    const plinthH = 0.11; // the dark base the chairs stand on
    const cushionH = 0.12;
    const backT = 0.09;

    // THE PLINTH, running a little past the row at both ends, and its two feet.
    this.add(ctx, new THREE.BoxGeometry(rowW + 0.16, plinthH, sd * 0.92), dark,
             0, plinthH / 2, 0);
    [-1, 1].forEach((s) => {
      this.add(ctx, new THREE.BoxGeometry(0.07, 0.03, sd * 0.6), dark,
               s * (rowW / 2 - 0.06), 0.015, 0);
    });

    for (let i = 0; i < seats; i++) {
      const x = (i - (seats - 1) / 2) * sw;
      const m = i === Math.floor(seats / 2) && seats > 1 ? middle : outer;
      // THE CUSHION: its top at seatH, so seatH means what it says.
      this.add(ctx, new THREE.BoxGeometry(sw - 0.02, cushionH, sd), m,
               x, sh - cushionH / 2, 0);
      // THE BACK, leaning back a little, standing on the cushion's rear edge.
      const back = this.add(
        ctx, new THREE.BoxGeometry(sw - 0.02, bh, backT), m,
        x, sh + bh / 2 - 0.02, -sd / 2 + backT / 2
      );
      back.rotation.x = 0.10; // ~6 degrees of recline
      back.position.z -= Math.sin(0.10) * bh * 0.5;
    }

    // THE ARMS, only at the two ends of the row — the chairs in the photograph
    // have wings between them rather than a rail, and the seat gaps already
    // read as divisions.
    [-1, 1].forEach((s) => {
      this.add(ctx, new THREE.BoxGeometry(aw, sh * 0.42, sd * 0.86), outer,
               s * (rowW / 2 - aw / 2), sh + sh * 0.11, 0.02);
    });

    return ctx.group;
  },

  // The vinyl: vertical pleat channels with a sheen down each one, a dark seam
  // between them, piping top and bottom, and — by `wear` — the cracking and
  // rubbed-pale patches that collect where knees and hands go, at the BOTTOM of
  // the canvas. On a seat back that lands at the base of the back; on a cushion
  // box it lands along the front edge, which is where a vinyl seat actually
  // splits.
  vinylCanvas: function (S, seed, pleats, wear) {
    const c = this.canvas(S, S);
    const ctx = c.getContext("2d");
    const rand = this.rand(seed * 131 + 7);

    // MID GREY, not white. The hue comes from material.color, which is
    // MULTIPLIED by this — so a white canvas has nowhere for a highlight to
    // go, and the channels come out flat. Starting at 0.78 leaves room to go
    // up to the full colour on a sheen and most of the way down in a seam,
    // which is the whole difference between pleated vinyl and brown stripes.
    ctx.fillStyle = "#c7c7c7";
    ctx.fillRect(0, 0, S, S);

    // THE CHANNELS. Each is a soft vertical band, brightest just off its
    // centre — vinyl over foam catches the light in a line, not a gradient —
    // with a dark seam stitched down between neighbours.
    const pitch = S / pleats;
    for (let i = 0; i < pleats; i++) {
      const x0 = i * pitch;
      const g = ctx.createLinearGradient(x0, 0, x0 + pitch, 0);
      g.addColorStop(0, "rgba(0,0,0,0.42)");
      g.addColorStop(0.16, "rgba(255,255,255,0.30)");
      g.addColorStop(0.34, "rgba(255,255,255,0.78)"); // the sheen
      g.addColorStop(0.58, "rgba(255,255,255,0.18)");
      g.addColorStop(0.86, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, pitch, S);
      // the seam
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x0 - Math.max(1, S / 300), 0, Math.max(1.5, S / 150), S);
    }

    // PIPING along the top and bottom edges: a dark welt with a lit top.
    [0.028, 0.965].forEach((v) => {
      const y = v * S;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, y, S, S * 0.022);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(0, y - S * 0.008, S, S * 0.008);
    });

    // WEAR, in the bottom fifth. Rubbed-pale patches first, then the cracks
    // through them — that order, because a crack runs across worn vinyl and
    // not under it.
    for (let k = 0; k < Math.round(26 * wear); k++) {
      ctx.fillStyle = "rgba(255,250,240," + (0.18 + rand() * 0.4).toFixed(3) + ")";
      const x = rand() * S;
      const y = S * (0.72 + rand() * 0.28);
      ctx.beginPath();
      ctx.ellipse(x, y, S * (0.02 + rand() * 0.08), S * (0.01 + rand() * 0.035),
                  rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < Math.round(30 * wear); k++) {
      ctx.strokeStyle = "rgba(0,0,0," + (0.25 + rand() * 0.4).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, S / 340);
      let x = rand() * S;
      let y = S * (0.74 + rand() * 0.26);
      ctx.beginPath();
      ctx.moveTo(x, y);
      // A crack wanders and forks; three or four short legs is enough to stop
      // it reading as a scratch.
      for (let j = 0; j < 3 + Math.floor(rand() * 3); j++) {
        x += (rand() - 0.5) * S * 0.09;
        y += (rand() - 0.5) * S * 0.05;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // ...and a general grubbiness low down.
    const gr = ctx.createLinearGradient(0, S * 0.7, 0, S);
    gr.addColorStop(0, "rgba(30,22,14,0)");
    gr.addColorStop(1, "rgba(30,22,14," + (0.3 * wear).toFixed(3) + ")");
    ctx.fillStyle = gr;
    ctx.fillRect(0, S * 0.7, S, S * 0.3);
    return c;
  },

  // ======================================================================
  // LOW TABLE — the black oval from reference ...-7039, whose whole character
  // is that the laminate has come OFF it: big pale irregular islands of bare
  // board across a gloss-black top, and a plywood edge that was never black at
  // all.
  //
  // The top is a CYLINDER, scaled on x and z into an ellipse — cheaper than an
  // ExtrudeGeometry and, at 28 segments, indistinguishable. It also comes with
  // three material GROUPS already (side, top cap, bottom cap), which is how the
  // plywood edge costs no extra mesh: the side takes its own material.
  //
  // @param {object} [o] w 1.1, d .6, h .45, top "oval", color "#141414",
  //   laminatePeel .5, legColor "#2a2a2a", legSplay 9, seed 1, unlit false
  // @returns {THREE.Group} origin on the floor at the top's centre, long axis
  //   along x. 6 meshes, one texture.
  // ======================================================================
  lowTable: function (o) {
    o = o || {};
    const w = o.w != null ? o.w : 1.1;
    const d = o.d != null ? o.d : 0.6;
    const h = o.h != null ? o.h : 0.45;
    const color = o.color || "#141414";
    const peel = o.laminatePeel != null ? o.laminatePeel : 0.5;
    const legColor = o.legColor || "#2a2a2a";
    const splay = ((o.legSplay != null ? o.legSplay : 9) * Math.PI) / 180;
    const seed = o.seed != null ? o.seed : 1;
    const round = o.top !== "rect";
    const ctx = this.begin(o);

    const TOP_T = 0.03;
    const tex = this.tex(ctx, this.laminateCanvas(256, seed, peel));
    const topMat = this.mat(ctx, { map: tex, color: new THREE.Color("#ffffff") });
    // The EDGE is bare plywood — pale, warm, and nothing like the top.
    const edgeMat = this.mat(ctx, { color: new THREE.Color("#9a8f7b") });
    const underMat = this.mat(ctx, { color: new THREE.Color(this.shade(color, 0.7)) });
    const legMat = this.mat(ctx, { color: new THREE.Color(legColor) });

    // THE TOP. CylinderGeometry's material index order is [side, top, bottom].
    const topGeo = round
      ? new THREE.CylinderGeometry(0.5, 0.5, TOP_T, 28, 1)
      : new THREE.BoxGeometry(1, TOP_T, 1);
    if (round) topGeo.scale(w, 1, d);
    else topGeo.scale(w, 1, d);
    const top = new THREE.Mesh(this.geo(ctx, topGeo),
                               round ? [edgeMat, topMat, underMat]
                                     : [edgeMat, edgeMat, topMat, underMat,
                                        edgeMat, edgeMat]);
    top.position.y = h - TOP_T / 2;
    ctx.group.add(top);

    // A THIN APRON just under it, a little inset, so the top reads as a slab
    // with something holding it up rather than as a floating disc.
    const apron = round
      ? new THREE.CylinderGeometry(0.5, 0.5, 0.018, 24, 1)
      : new THREE.BoxGeometry(1, 0.018, 1);
    apron.scale(w * 0.9, 1, d * 0.9);
    this.add(ctx, apron, underMat, 0, h - TOP_T - 0.009, 0);

    // FOUR SPLAYED ROUND LEGS. Thin, and leaning out a little, which is what
    // stops a low table looking like a box on stilts.
    const LEG_R = 0.011;
    const inset = 0.78; // how far out toward the rim they stand
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((s) => {
      const tx = (s[0] * w * inset) / 2;
      const tz = (s[1] * d * inset) / 2;
      // The foot splays outward from the top fixing by the lean over the drop.
      const spread = Math.tan(splay) * h;
      this.tube(ctx, legMat,
                [tx, h - TOP_T - 0.018, tz],
                [tx + s[0] * spread * 0.5, 0, tz + s[1] * spread * 0.5],
                LEG_R, 7);
    });
    return ctx.group;
  },

  // Gloss black laminate with the veneer off it. Drawn as a DISC, because the
  // cylinder's top cap maps its UVs radially and a square pattern would show
  // its corners being folded away at the rim.
  laminateCanvas: function (S, seed, peel) {
    const c = this.canvas(S, S);
    const ctx = c.getContext("2d");
    const rand = this.rand(seed * 313 + 29);
    const R = S / 2;

    ctx.fillStyle = "#141414";
    ctx.fillRect(0, 0, S, S);
    // A broad sheen across the gloss, off-centre, so the top is not one flat
    // black.
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(0.45, "rgba(255,255,255,0.02)");
    g.addColorStop(1, "rgba(0,0,0,0.25)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);

    // THE PEELED ISLANDS: pale bare board where the laminate has lifted. Big,
    // few, and hard-edged — that is what the photograph shows, not a wash. Each
    // gets a darker lip on one side, which is the laminate still standing proud
    // at the tear.
    const n = Math.round(7 * peel);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * R * 0.82;
      const x = R + Math.cos(a) * rr;
      const y = R + Math.sin(a) * rr;
      const size = S * (0.06 + rand() * 0.14);
      ctx.beginPath();
      const pts = 7 + Math.floor(rand() * 4);
      for (let j = 0; j <= pts; j++) {
        const t = (j / pts) * Math.PI * 2;
        const r2 = size * (0.55 + rand() * 0.75);
        const px = x + Math.cos(t) * r2;
        const py = y + Math.sin(t) * r2 * 0.72;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = rand() < 0.6 ? "#cdc7ba" : "#b6ad9c";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = Math.max(1.5, S / 190);
      ctx.stroke();
    }
    // Scuffs and ring marks over the lot.
    for (let k = 0; k < 30; k++) {
      ctx.strokeStyle = "rgba(200,196,186," + (0.05 + rand() * 0.16).toFixed(3) + ")";
      ctx.lineWidth = 1 + rand() * 2;
      const x = rand() * S;
      const y = rand() * S;
      ctx.beginPath();
      ctx.arc(x, y, S * (0.02 + rand() * 0.09), rand() * 6, rand() * 6 + 1.5);
      ctx.stroke();
    }
    return c;
  },

  // ======================================================================
  // CHILD'S BIKE — from reference ...-6551: a small blue bike with red trim,
  // stood against a corridor wall in the dark.
  //
  // The frame is described by its JOINTS and drawn with tube(), so the whole
  // machine is six points and the lines between them; changing `wheel` moves
  // every joint with it, because they are all fractions of the wheel.
  //
  // THE SPOKES ARE A TEXTURE, not geometry: each wheel is a torus for the tyre
  // and one flat disc carrying a canvas whose spokes are cut by ALPHA
  // (alphaTest, DoubleSide). Thirty-six spokes as cylinders would be more
  // triangles than the rest of the corridor's furniture put together, for
  // something read at two metres in a dark corridor.
  //
  // @param {object} [o] wheel .3 (DIAMETER), color "#2b6db3",
  //   color2 "#d94b3a", lean 12 (deg, tips the top toward local -z, which is
  //   INTO the wall when the bike is placed facing the room), seed 1,
  //   unlit false
  // @returns {THREE.Group} origin on the floor midway between the tyres,
  //   length along x (front wheel at +x), seen from +z. 23 meshes, one texture.
  // ======================================================================
  childBike: function (o) {
    o = o || {};
    const wheel = o.wheel != null ? o.wheel : 0.3;
    const color = o.color || "#2b6db3";
    const color2 = o.color2 || "#d94b3a";
    const lean = ((o.lean != null ? o.lean : 12) * Math.PI) / 180;
    const seed = o.seed != null ? o.seed : 1;
    const ctx = this.begin(o);

    const R = wheel / 2;
    // EVERY proportion below is a fraction of the wheel, so one option sizes
    // the whole machine. A child's bike is short and tall for its wheels.
    const wb = wheel * 2.4; // wheelbase
    const TUBE = wheel * 0.045;

    const frameMat = this.mat(ctx, { color: new THREE.Color(color) });
    const accentMat = this.mat(ctx, { color: new THREE.Color(color2) });
    const darkMat = this.mat(ctx, { color: new THREE.Color("#1c1c1e") });
    const rimMat = this.mat(ctx, { color: new THREE.Color("#c9c6bd") });
    const spokeTex = this.tex(ctx, this.spokeCanvas(256, seed));
    const spokeMat = this.mat(ctx, {
      map: spokeTex,
      color: new THREE.Color("#cfccc4"),
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    // THE JOINTS. x forward, y up, z across; the frame sits on z = 0.
    const A = [-wb / 2, R, 0]; // rear hub
    const B = [wb / 2, R, 0]; // front hub
    const BB = [-wb * 0.06, R * 0.6, 0]; // bottom bracket
    const ST = [-wb * 0.24, R * 1.95, 0]; // seat top
    const HT = [wb * 0.36, R * 1.9, 0]; // head tube top
    const HB = [wb * 0.44, R * 1.1, 0]; // head tube bottom / fork crown

    // WHEELS: tyre torus + spoke disc, both wheels sharing both geometries'
    // recipe but not their instances (a torus is 200 triangles; sharing would
    // save nothing worth the indirection).
    [A, B].forEach((hub) => {
      const tyre = new THREE.TorusGeometry(R * 0.87, R * 0.13, 8, 20);
      const t = this.add(ctx, tyre, darkMat, hub[0], hub[1], hub[2]);
      t.rotation.y = Math.PI / 2; // a torus is born in x-y; stand it in y-z
      const disc = new THREE.CircleGeometry(R * 0.8, 20);
      const dm = this.add(ctx, disc, spokeMat, hub[0], hub[1], hub[2]);
      dm.rotation.y = Math.PI / 2;
      const hubG = new THREE.CylinderGeometry(R * 0.09, R * 0.09, wheel * 0.16, 8);
      const hm = this.add(ctx, hubG, rimMat, hub[0], hub[1], hub[2]);
      hm.rotation.z = Math.PI / 2;
    });

    // THE FRAME: six tubes between the joints above.
    this.tube(ctx, frameMat, BB, HT, TUBE, 7); // down tube
    this.tube(ctx, frameMat, ST, HT, TUBE * 0.85, 7); // top tube, low: step-through
    this.tube(ctx, frameMat, BB, ST, TUBE, 7); // seat tube
    this.tube(ctx, frameMat, BB, A, TUBE * 0.8, 6); // chain stay
    this.tube(ctx, frameMat, ST, A, TUBE * 0.7, 6); // seat stay
    this.tube(ctx, frameMat, HB, B, TUBE * 0.8, 7); // fork

    // SADDLE, a small box with its nose down, on a short post.
    this.tube(ctx, rimMat, ST, [ST[0], ST[1] + R * 0.28, 0], TUBE * 0.6, 6);
    const sad = this.add(ctx, new THREE.BoxGeometry(wheel * 0.42, wheel * 0.06,
                                                    wheel * 0.16), darkMat,
                         ST[0], ST[1] + R * 0.34, 0);
    sad.rotation.z = -0.12;

    // HANDLEBAR: a stem up from the head tube, the bar across it, and two red
    // grips — the one flash of colour the reference bike has at that height.
    const barY = HT[1] + R * 0.34;
    this.tube(ctx, rimMat, HT, [HT[0], barY, 0], TUBE * 0.7, 6);
    const halfBar = wheel * 0.36;
    this.tube(ctx, darkMat, [HT[0], barY, -halfBar], [HT[0], barY, halfBar],
              TUBE * 0.62, 7);
    [-1, 1].forEach((s) => {
      this.tube(ctx, accentMat,
                [HT[0], barY, s * halfBar],
                [HT[0], barY, s * (halfBar - wheel * 0.1)],
                TUBE * 0.78, 7);
    });

    // CRANK + PEDALS, out on the +z side where they are seen.
    const crank = wheel * 0.22;
    this.tube(ctx, rimMat, [BB[0], BB[1], 0],
              [BB[0] - crank * 0.5, BB[1] - crank * 0.7, wheel * 0.13],
              TUBE * 0.55, 6);
    this.add(ctx, new THREE.BoxGeometry(wheel * 0.16, wheel * 0.03, wheel * 0.08),
             darkMat, BB[0] - crank * 0.5, BB[1] - crank * 0.7, wheel * 0.19);
    this.add(ctx, new THREE.BoxGeometry(wheel * 0.16, wheel * 0.03, wheel * 0.08),
             darkMat, BB[0] + crank * 0.5, BB[1] + crank * 0.7, -wheel * 0.19);

    // CHAIN GUARD — the pale panel over the chainring, which on the reference
    // bike is the biggest single thing you see.
    const guard = this.add(ctx,
      new THREE.BoxGeometry(wheel * 0.62, wheel * 0.3, wheel * 0.012),
      this.mat(ctx, { color: new THREE.Color("#ddd8cb") }),
      BB[0] - wheel * 0.14, BB[1] + wheel * 0.03, wheel * 0.1);
    guard.rotation.z = 0.15;

    // REAR RACK, over the back wheel.
    this.add(ctx, new THREE.BoxGeometry(wheel * 0.5, wheel * 0.035, wheel * 0.3),
             accentMat, A[0] + wheel * 0.06, R * 1.72, 0);

    // THE LEAN, about the tyres' own contact line: a rotation about the
    // machine's long axis, applied to the group, so wherever the caller puts it
    // the wheels stay on the floor. Positive tips it toward local -z, which is
    // AWAY from the viewer — i.e. into the wall it is propped against.
    ctx.group.rotation.x = -lean;
    return ctx.group;
  },

  // The spokes: a hub, a rim and thirty-odd radials, with everything between
  // them cut out by ALPHA so you see the corridor through the wheel.
  spokeCanvas: function (S, seed) {
    const c = this.canvas(S, S);
    const ctx = c.getContext("2d");
    const rand = this.rand(seed * 617 + 5);
    const R = S / 2;
    ctx.clearRect(0, 0, S, S); // transparent: only what is drawn survives

    ctx.translate(R, R);
    // THE RIM, and a tyre-side shadow just inside it.
    ctx.strokeStyle = "#cfcabe";
    ctx.lineWidth = S * 0.055;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = S * 0.016;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.868, 0, Math.PI * 2);
    ctx.stroke();

    // THE SPOKES, alternating lacing either side of the hub so the wheel does
    // not read as a flat sunburst.
    const N = 32;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const off = (i % 2 ? 1 : -1) * 0.10;
      ctx.strokeStyle = "rgba(226,222,212," + (0.7 + rand() * 0.3).toFixed(2) + ")";
      ctx.lineWidth = Math.max(1.2, S * 0.007);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + off) * R * 0.13, Math.sin(a + off) * R * 0.13);
      ctx.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
      ctx.stroke();
    }
    // THE HUB.
    ctx.fillStyle = "#b9b5aa";
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.06, 0, Math.PI * 2);
    ctx.fill();
    return c;
  },

  // ======================================================================
  // PLASTIC BAG — the stuffed white sack beside the bike in ...-6551.
  //
  // A sphere, displaced by seeded noise so it is lumpy rather than round,
  // squashed on the vertical, and FLATTENED where it meets the floor, because a
  // full bag spreads. Plus the knot: a small sphere on top. The creases are a
  // canvas, so the lumps read as folded polythene and not as a potato.
  //
  // @param {object} [o] w .35, h .45, color "#e9e6dc", lumps .18, seed 1,
  //   unlit false
  // @returns {THREE.Group} origin on the floor at the bag's centre. 2 meshes,
  //   one texture.
  // ======================================================================
  plasticBag: function (o) {
    o = o || {};
    const w = o.w != null ? o.w : 0.35;
    const h = o.h != null ? o.h : 0.45;
    const color = o.color || "#e9e6dc";
    const lumps = o.lumps != null ? o.lumps : 0.18;
    const seed = o.seed != null ? o.seed : 1;
    const ctx = this.begin(o);

    const tex = this.tex(ctx, this.creaseCanvas(256, seed));
    const mat = this.mat(ctx, { map: tex, color: new THREE.Color(color) });

    // The body: a unit sphere pushed about by noise, then scaled to w x h x w.
    const body = new THREE.SphereGeometry(0.5, 18, 14);
    const pos = body.attributes.position;
    const rand = this.rand(seed * 971 + 13);
    // Six random lobes; each vertex is pushed out by how much it faces each.
    const lobes = [];
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)
        .normalize();
      lobes.push({ v: v, a: (rand() - 0.4) * lumps });
    }
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const n = p.clone().normalize();
      let k = 1;
      lobes.forEach((l) => {
        k += l.a * Math.max(0, n.dot(l.v)) ** 2;
      });
      p.multiplyScalar(k);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    body.scale(w, h * 0.82, w * 0.9);
    body.translate(0, h * 0.44, 0);
    // FLATTEN THE BOTTOM: a full bag sits, it does not balance.
    const FLOOR = h * 0.06;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < FLOOR) pos.setY(i, FLOOR);
    }
    body.computeVertexNormals();
    this.add(ctx, body, mat, 0, 0, 0);

    // THE KNOT: the gathered top, pinched and leaning.
    const knot = new THREE.SphereGeometry(w * 0.19, 10, 8);
    knot.scale(1, 0.7, 1);
    const k = this.add(ctx, knot, mat, w * 0.06, h * 0.86, 0);
    k.rotation.z = 0.4;
    return ctx.group;
  },

  // Polythene: near-white, with soft creases and a few hard folds. White RGB
  // again, so the material's colour carries the tint.
  creaseCanvas: function (S, seed) {
    const c = this.canvas(S, S);
    const ctx = c.getContext("2d");
    const rand = this.rand(seed * 733 + 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, S, S);
    // Soft crumple: pale and dark patches, no edges.
    for (let k = 0; k < 60; k++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = S * (0.05 + rand() * 0.18);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const dark = rand() < 0.5;
      g.addColorStop(0, dark ? "rgba(120,118,110,0.20)" : "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // Hard folds: the lines a bag keeps once it has been screwed up.
    for (let k = 0; k < 22; k++) {
      ctx.strokeStyle = "rgba(105,103,96," + (0.16 + rand() * 0.3).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, S / 300);
      let x = rand() * S;
      let y = rand() * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        x += (rand() - 0.5) * S * 0.35;
        y += (rand() - 0.5) * S * 0.35;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A little ground-in grey along the bottom, where it has been dragged.
    const g = ctx.createLinearGradient(0, S * 0.66, 0, S);
    g.addColorStop(0, "rgba(90,86,78,0)");
    g.addColorStop(1, "rgba(90,86,78,0.34)");
    ctx.fillStyle = g;
    ctx.fillRect(0, S * 0.66, S, S * 0.34);
    return c;
  },
};
