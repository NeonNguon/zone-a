// ================================================================
// Floorplan — the white-walled rooms the exhibition sits in.
//
// One data-driven component, `floorplan`, generates EVERY wall at runtime from
// a config: no asset files, primitives only (a-box / a-plane), same no-asset
// approach as the contact cues. It builds no floor — the environment preset's
// ground plane is the floor, so the rooms sit on whatever preset is active.
//
// HEIGHTS are per-room, and the hallways are deliberately LOWER than the rooms
// they join, so you duck through a passage and the space opens up on arrival:
//   foyer (central) 5 m, open top      zoneA  5 m, open top
//   zoneB          10 m, ceiling       zoneC 10 m, ceiling
//   hallways        3 m, roofed
// Two things fall out of that and are easy to miss:
//  - Openings are NOT full-height. A 3 m hallway into a 5 m room leaves 2 m of
//    wall above the doorway, so each opening gets a LINTEL segment over it.
//  - The hallways need roofs. Without one you would look up through a 3 m
//    doorway into open sky, and the lintel would read as a floating slab.
//
// Design rules:
//  - VISUAL ONLY. No collision this pass: the player walks through walls, and
//    the hallways are the *intended* path rather than the only one. A
//    lightweight rig constraint can be added later without touching this file's
//    geometry — the room/hallway config here is the natural source for it.
//  - shader: flat (unlit) throughout, for Quest cheapness. Walls therefore do
//    not depend on the active environment preset's lighting at all. Nothing
//    shades a corner either, which is what the edge lines are for — see
//    buildEdges().
//  - The zones are NOT touched: rooms are sized/placed around the zone-root
//    offsets in index.html, not the other way round.
//
// TUNABLES — all adjustable without code edits, via setAttribute on
// #floorplan. Simple ones are ordinary schema props:
//   document.getElementById('floorplan').setAttribute('floorplan', 'height', 4)
//   ... 'thickness' | 'color' | 'shader' | 'ceiling' | 'hallwayHeight'
//   ... 'edges' | 'edgeColor' | 'edgeLift'
// The full room/opening config is exposed too (objects pass through as-is;
// a JSON string in the HTML attribute also parses):
//   fp.setAttribute('floorplan', 'rooms', {...})      // see DEFAULT_ROOMS
//   fp.setAttribute('floorplan', 'hallways', [...])   // see DEFAULT_HALLWAYS
// Any change rebuilds the whole plan.
// ================================================================

// ---------- room config ----------
// cx/cz = centre, w = size along x, d = size along z (metres). Keys are the
// names the hallway config refers to. `height` and `ceiling` are per-room and
// both fall back to the component's `height` / `ceiling` defaults when omitted.
const DEFAULT_ROOMS = {
  // Foyer — the spawn room (the rig is at the origin). Open-topped: arriving in
  // a lidded box would read as a lobby rather than an entrance.
  central: { cx: 0, cz: 0, w: 10, d: 10, height: 5 },
  // The ring, forward (-z). Its images top out ~2.3 m, so 5 m is ample.
  zoneA: { cx: 0, cz: -11.85, w: 11.2, d: 11.1, height: 5 },
  // Image wall + triptych, right (+x). The wall tops out ~4.9 m.
  zoneB: { cx: 19.2, cz: -3, w: 18, d: 28.8, height: 10, ceiling: true },
  // Cinema, left (-x). The screen tops out ~7.1 m — the tallest thing in the
  // exhibition, and why these two rooms are 10 m rather than 5.
  zoneC: { cx: -14.7, cz: 0.2, w: 15.2, d: 24.4, height: 10, ceiling: true },
};

// ---------- hallway config ----------
// Each hallway cuts ONE opening into each of the two facing walls it names,
// spans the gap between them with two corridor side-walls, and roofs itself.
//   openings — the two [room, side] walls to cut. Both get the same opening, so
//              they line up by construction.
//   center   — opening centre along the wall's RUN axis: z for a ±x wall,
//              x for a ±z wall.
//   width    — clear width of the opening (metres).
//   height   — clear height of the opening AND of the corridor (metres);
//              falls back to the component's `hallwayHeight`. Wall above the
//              opening becomes a lintel.
//   corridor — span of the connecting corridor along the THROUGH axis: x for
//              ±x walls, z for ±z walls. Runs from one room's wall plane to the
//              other's, so the side-walls tuck into both.
const DEFAULT_HALLWAYS = [
  {
    id: "central-zoneB",
    openings: [
      { room: "central", side: "+x" },
      { room: "zoneB", side: "-x" },
    ],
    center: 0,
    width: 2.4,
    corridor: { from: 5, to: 10.2 },
  },
  {
    id: "central-zoneC",
    openings: [
      { room: "central", side: "-x" },
      { room: "zoneC", side: "+x" },
    ],
    center: -0.2,
    width: 2.4,
    corridor: { from: -7.1, to: -5 },
  },
  {
    id: "central-zoneA",
    openings: [
      { room: "central", side: "-z" },
      { room: "zoneA", side: "+z" },
    ],
    center: 0,
    width: 2.0,
    corridor: { from: -6.3, to: -5 },
  },
];

const SIDES = ["-x", "+x", "-z", "+z"];

// Segments shorter/shallower than this are dropped rather than built as
// slivers (e.g. an opening that reaches a wall's end, or a lintel in a room no
// taller than its hallway).
const MIN_SEGMENT = 0.01;

// A room side as a line: which axis it RUNS along, the fixed coordinate of its
// plane on the other axis, and the run's extent. Walls span the room's FULL
// extent on their run axis, so adjacent sides overlap by half a thickness at
// each corner — that overlap is what closes the corners.
function sideGeometry(room, side) {
  const hw = room.w / 2;
  const hd = room.d / 2;
  switch (side) {
    case "-x":
      return { axis: "z", fixed: room.cx - hw, min: room.cz - hd, max: room.cz + hd };
    case "+x":
      return { axis: "z", fixed: room.cx + hw, min: room.cz - hd, max: room.cz + hd };
    case "-z":
      return { axis: "x", fixed: room.cz - hd, min: room.cx - hw, max: room.cx + hw };
    case "+z":
      return { axis: "x", fixed: room.cz + hd, min: room.cx - hw, max: room.cx + hw };
    default:
      return null;
  }
}

// The through axis a side faces along — the direction you walk to cross it.
function throughAxis(side) {
  return side.charAt(1); // '-x'/'+x' -> 'x'; '-z'/'+z' -> 'z'
}

AFRAME.registerComponent("floorplan", {
  schema: {
    // Fallback room height, for rooms that do not set their own.
    height: { type: "number", default: 5 },
    // Fallback: are rooms lidded? Per-room `ceiling` overrides it.
    ceiling: { type: "boolean", default: false },
    // Fallback hallway height, for hallways that do not set their own. Also the
    // clear height of the openings — the wall above them becomes a lintel.
    hallwayHeight: { type: "number", default: 3 },
    thickness: { type: "number", default: 0.15 }, // metres
    color: { type: "color", default: "#ffffff" },
    shader: { type: "string", default: "flat" }, // unlit: cheap on Quest
    // Edge lines — see buildEdges(). Flat white walls under flat white light
    // have NO shading, so without these every corner and floor junction reads
    // as one continuous white field and you cannot see where a wall runs.
    edges: { type: "boolean", default: true },
    edgeColor: { type: "color", default: "#000000" },
    // How far the lines sit proud of the surfaces they trace (metres). Small
    // but non-zero: at 0 they are coplanar with the walls and the floor and
    // would z-fight. Raise it if you see stitching on a headset.
    edgeLift: { type: "number", default: 0.004 },
    // Config objects. `parse` accepts a live object (setAttribute with an
    // object) or a JSON string (an HTML attribute), so both routes work.
    rooms: {
      default: DEFAULT_ROOMS,
      parse: function (v) {
        return typeof v === "string" ? JSON.parse(v) : v;
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
    hallways: {
      default: DEFAULT_HALLWAYS,
      parse: function (v) {
        return typeof v === "string" ? JSON.parse(v) : v;
      },
      stringify: function (v) {
        return typeof v === "string" ? v : JSON.stringify(v);
      },
    },
  },

  // ---- per-item config, falling back to the component-wide defaults ----
  roomHeight: function (r) {
    return r.height != null ? r.height : this.data.height;
  },
  roomCeiling: function (r) {
    return r.ceiling != null ? r.ceiling : this.data.ceiling;
  },
  hallHeight: function (h) {
    return h.height != null ? h.height : this.data.hallwayHeight;
  },

  // Any tunable change rebuilds the plan from scratch — the walls are a few
  // dozen boxes, so a full rebuild is cheaper than diffing.
  update: function () {
    this.teardown();
    this.build();
  },

  remove: function () {
    this.teardown();
  },

  teardown: function () {
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    // The edge lines are an object3D on this entity, not a child entity, so
    // they need disposing by hand (the walls' own materials go with their
    // elements).
    if (this.lines) {
      this.el.removeObject3D("edges");
      this.lines.geometry.dispose();
      this.lines.material.dispose();
      this.lines = null;
    }
  },

  build: function () {
    const d = this.data;
    const rooms = d.rooms || {};
    const hallways = d.hallways || [];
    // Each wall records its footprint here for the edge pass to trace.
    this.footprints = [];
    this.capCount = 0;

    // Index the openings by "room/side" so each wall knows what to cut. The
    // hallway's height rides along: it sets how tall the opening is, and so
    // how much wall is left above it as a lintel.
    const openings = {};
    hallways.forEach((h) => {
      (h.openings || []).forEach((o) => {
        if (!rooms[o.room]) {
          console.warn(
            `[floorplan] hallway "${h.id}" names unknown room "${o.room}" — skipped.`
          );
          return;
        }
        const key = o.room + "/" + o.side;
        (openings[key] = openings[key] || []).push({
          center: h.center,
          width: h.width,
          height: this.hallHeight(h),
        });
      });
    });

    let count = 0;
    Object.keys(rooms).forEach((name) => {
      SIDES.forEach((side) => {
        count += this.buildSide(name, rooms[name], side, openings[name + "/" + side]);
      });
      this.buildCeiling(rooms[name]);
    });
    hallways.forEach((h) => {
      count += this.buildCorridor(h);
    });
    const lines = this.buildEdges(rooms);
    console.log(
      `[floorplan] ${Object.keys(rooms).length} rooms, ${hallways.length} hallways, ` +
        `${count} wall segments, ${this.capCount} ceilings/roofs, ${lines} edge lines`
    );
  },

  // One room side: the full run minus each opening, plus a lintel over each
  // opening (the hallways are lower than the rooms, so the wall carries on
  // above the doorway).
  buildSide: function (roomName, room, side, sideOpenings) {
    const g = sideGeometry(room, side);
    if (!g) return 0;

    const roomH = this.roomHeight(room);
    const capped = this.roomCeiling(room);

    // Cut points, ordered along the run. Openings are assumed not to overlap;
    // if they did, the segment between them would just come out negative-length
    // and be dropped by MIN_SEGMENT.
    const cuts = (sideOpenings || [])
      .map((o) => ({
        start: o.center - o.width / 2,
        end: o.center + o.width / 2,
        height: o.height,
      }))
      .sort((a, b) => a.start - b.start);

    let cursor = g.min;
    let built = 0;
    cuts.forEach((c) => {
      built += this.wall(g.axis, g.fixed, cursor, c.start, `${roomName}${side}`, 0, roomH, capped);
      // LINTEL over the doorway. wall() drops it on its own if the room is no
      // taller than its hallway (nothing left to span).
      built += this.wall(
        g.axis, g.fixed, c.start, c.end, `${roomName}${side}-lintel`, c.height, roomH, capped
      );
      cursor = c.end;
    });
    built += this.wall(g.axis, g.fixed, cursor, g.max, `${roomName}${side}`, 0, roomH, capped);
    return built;
  },

  // The two side-walls that carry an opening across the gap between the rooms,
  // plus the corridor's roof.
  //
  // The side-walls are placed so their INNER faces are flush with the opening's
  // edges — the corridor keeps the opening's full clear width and reads as a
  // straight continuation of it. They run the corridor's whole span, so they
  // tuck into both room walls at the ends with no seam.
  buildCorridor: function (h) {
    const side = h.openings && h.openings[0] && h.openings[0].side;
    if (!side || !h.corridor) {
      console.warn(`[floorplan] hallway "${h.id}" has no side/corridor — skipped.`);
      return 0;
    }
    const d = this.data;
    const hallH = this.hallHeight(h);
    // Walk across the wall's through axis; the side-walls run along it.
    const runAxis = throughAxis(side);
    const offset = h.width / 2 + d.thickness / 2;
    let built = 0;
    [-1, 1].forEach((s) => {
      built += this.wall(
        runAxis, h.center + s * offset, h.corridor.from, h.corridor.to,
        `hall-${h.id}`, 0, hallH, true // roofed, see below
      );
    });

    // ROOF. The corridor is lower than both rooms it joins, so it needs a lid:
    // without one you would look up through the doorway into open sky and the
    // lintel would float. It spans the CLEAR gap between the two rooms' wall
    // bodies (whose centres are the corridor's end planes, so each straddles it
    // by half a thickness) and the opening's clear width — meeting the lintels
    // and the side-walls edge-to-edge, overlapping neither, so nothing z-fights.
    const half = d.thickness / 2;
    const c0 = Math.min(h.corridor.from, h.corridor.to) + half;
    const c1 = Math.max(h.corridor.from, h.corridor.to) - half;
    if (c1 - c0 > MIN_SEGMENT) {
      const mid = (c0 + c1) / 2;
      const span = c1 - c0;
      if (runAxis === "x") this.cap(mid, hallH, h.center, span, h.width);
      else this.cap(h.center, hallH, mid, h.width, span);
    }
    return built;
  },

  // A room's ceiling, if it has one.
  buildCeiling: function (room) {
    if (!this.roomCeiling(room)) return;
    const d = this.data;
    // Span the room's INNER area, so the lid meets the walls' inner faces
    // edge-to-edge. Spanning the full extent instead would lay it exactly on
    // the walls' top faces — coplanar, and it would z-fight with them.
    this.cap(
      room.cx,
      this.roomHeight(room),
      room.cz,
      room.w - d.thickness,
      room.d - d.thickness
    );
  },

  // One horizontal lid — a room ceiling or a corridor roof.
  cap: function (x, y, z, spanX, spanZ) {
    const d = this.data;
    const el = document.createElement("a-plane");
    el.setAttribute("position", `${x} ${y} ${z}`);
    el.setAttribute("rotation", "90 0 0"); // faces down (-y), into the space
    el.setAttribute("width", spanX);
    el.setAttribute("height", spanZ);
    // side: double so the lid also reads from above — locomotion is free-fly,
    // so you can get up there and a one-sided lid would vanish.
    el.setAttribute("material", `color: ${d.color}; shader: ${d.shader}; side: double`);
    this.el.appendChild(el);
    this.capCount++;
  },

  // One wall segment: a box running along `axis` from `a` to `b`, with its
  // plane at `fixed` on the other horizontal axis, spanning y0..y1. y0 > 0
  // makes it a lintel (it hangs over a doorway); `capped` means something lids
  // it, which only the edge pass cares about.
  wall: function (axis, fixed, a, b, label, y0, y1, capped) {
    const d = this.data;
    const len = Math.abs(b - a);
    const tall = y1 - y0;
    if (len < MIN_SEGMENT || tall < MIN_SEGMENT) return 0;

    const mid = (a + b) / 2;
    const half = d.thickness / 2;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const box = { y0: y0, y1: y1, topCapped: !!capped, bottomOpen: y0 > MIN_SEGMENT };

    const el = document.createElement("a-box");
    if (axis === "z") {
      // Runs along z; its plane faces ±x.
      el.setAttribute("position", `${fixed} ${(y0 + y1) / 2} ${mid}`);
      el.setAttribute("width", d.thickness);
      el.setAttribute("depth", len);
      this.footprints.push(
        Object.assign(box, { x0: fixed - half, x1: fixed + half, z0: lo, z1: hi })
      );
    } else {
      // Runs along x; its plane faces ±z.
      el.setAttribute("position", `${mid} ${(y0 + y1) / 2} ${fixed}`);
      el.setAttribute("width", len);
      el.setAttribute("depth", d.thickness);
      this.footprints.push(
        Object.assign(box, { x0: lo, x1: hi, z0: fixed - half, z1: fixed + half })
      );
    }
    el.setAttribute("height", tall);
    el.setAttribute("material", `color: ${d.color}; shader: ${d.shader}`);
    el.setAttribute("data-wall", label); // dev handle; nothing reads it
    this.el.appendChild(el);
    return 1;
  },

  // Black edge lines, so the architecture reads. The walls are unlit flat white
  // on a flat white floor: nothing shades a corner, so without lines the whole
  // plan is one white field and you cannot tell where a wall runs, where it
  // meets the floor, or where a doorway is.
  //
  // ONE THREE.LineSegments for the entire plan — a single draw call and a
  // single material, which is the cheapest thing available on Quest. (Line
  // width is 1px on WebGL regardless of the material's linewidth; if these ever
  // need to read thicker, they have to become thin black boxes instead.)
  //
  // Every line is nudged `edgeLift` PROUD of the surface it traces — and which
  // way is "proud" depends on the side you SEE that surface from, so each is
  // placed deliberately. See the notes inline.
  buildEdges: function (rooms) {
    const d = this.data;
    if (!d.edges) return 0;

    const lift = d.edgeLift;
    const pts = [];
    const seg = (ax, ay, az, bx, by, bz) => pts.push(ax, ay, az, bx, by, bz);

    // Trace each wall box: its bottom rectangle, its top rectangle, and a
    // vertical at each of its four footprint corners. At a doorway those
    // verticals are the jamb reveals; at a room corner they are buried inside
    // the neighbouring wall and simply never draw (the depth test hides them).
    this.footprints.forEach((f) => {
      // Vertical placement, per surface, on the side it is seen from:
      //  - bottom: a wall SITS on the floor, so its line goes just above (below
      //    would be under the floor plane, hidden). A lintel HANGS, so its line
      //    goes just below its underside, where you look at it from.
      //  - top: an open top is seen from below and outside, so just above. A
      //    capped top is seen from inside the room, and a line above the lid
      //    would be hidden BY the lid — so just below it.
      const yb = f.bottomOpen ? f.y0 - lift : f.y0 + lift;
      const yt = f.topCapped ? f.y1 - lift : f.y1 + lift;
      const c = [
        [f.x0 - lift, f.z0 - lift],
        [f.x1 + lift, f.z0 - lift],
        [f.x1 + lift, f.z1 + lift],
        [f.x0 - lift, f.z1 + lift],
      ];
      for (let i = 0; i < 4; i++) {
        const a = c[i];
        const b = c[(i + 1) % 4];
        seg(a[0], yb, a[1], b[0], yb, b[1]); // floor junction / lintel underside
        seg(a[0], yt, a[1], b[0], yt, b[1]); // top edge / ceiling junction
        seg(a[0], yb, a[1], a[0], yt, a[1]); // vertical
      }
    });

    // Room corners need drawing EXPLICITLY. Perimeter walls span their room's
    // full extent, so they overlap by half a thickness at each corner — which
    // is what closes the corner, but it also means the box edges there sit
    // buried inside the adjoining wall. The corner you actually SEE, where the
    // two inner faces meet, has no box edge on it at all. So place a vertical
    // on each inner corner, nudged into the room to sit proud of both faces.
    // This lands exactly where the two walls' floor lines meet.
    Object.keys(rooms).forEach((name) => {
      const r = rooms[name];
      const h = this.roomHeight(r);
      const yt = this.roomCeiling(r) ? h - lift : h + lift;
      const ix = r.w / 2 - d.thickness / 2 - lift;
      const iz = r.d / 2 - d.thickness / 2 - lift;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((s) => {
        const x = r.cx + s[0] * ix;
        const z = r.cz + s[1] * iz;
        seg(x, lift, z, x, yt, z);
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(d.edgeColor) });
    this.lines = new THREE.LineSegments(geo, mat);
    this.el.setObject3D("edges", this.lines);
    return pts.length / 6;
  },
});
