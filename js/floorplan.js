// ================================================================
// Floorplan — the white-walled rooms the exhibition sits in.
//
// One data-driven component, `floorplan`, generates EVERY wall at runtime from
// a config: no asset files, primitives only (a-box), same no-asset approach as
// the contact cues. It builds nothing else — no floor (the environment preset's
// ground plane is the floor) and no ceiling (rooms are open-topped, so the
// preset's background reads as sky).
//
// Design rules:
//  - VISUAL ONLY. No collision this pass: the player walks through walls, and
//    the hallways are the *intended* path rather than the only one. A
//    lightweight rig constraint can be added later without touching this file's
//    geometry — the room/hallway config here is the natural source for it.
//  - shader: flat (unlit) throughout, for Quest cheapness. Walls therefore do
//    not depend on the active environment preset's lighting at all.
//  - The zones are NOT touched: rooms are sized/placed around the zone-root
//    offsets in index.html, not the other way round.
//
// TUNABLES — all adjustable without code edits, via setAttribute on
// #floorplan. Simple ones are ordinary schema props:
//   document.getElementById('floorplan').setAttribute('floorplan', 'height', 4)
//   ... 'thickness' | 'color' | 'shader'
// The full room/opening config is exposed too (objects pass through as-is;
// a JSON string in the HTML attribute also parses):
//   fp.setAttribute('floorplan', 'rooms', {...})      // see DEFAULT_ROOMS
//   fp.setAttribute('floorplan', 'hallways', [...])   // see DEFAULT_HALLWAYS
// Any change rebuilds the whole plan.
// ================================================================

// ---------- room config ----------
// cx/cz = centre, w = size along x, d = size along z (metres). Keys are the
// names the hallway config refers to.
const DEFAULT_ROOMS = {
  central: { cx: 0, cz: 0, w: 10, d: 10 }, // spawn room (rig is at the origin)
  zoneA: { cx: 0, cz: -11.85, w: 11.2, d: 11.1 }, // the ring, forward (-z)
  zoneB: { cx: 19.2, cz: -3, w: 18, d: 28.8 }, // image wall + triptych, right (+x)
  zoneC: { cx: -14.7, cz: 0.2, w: 15.2, d: 24.4 }, // cinema, left (-x)
};

// ---------- hallway config ----------
// Each hallway cuts ONE opening into each of the two facing walls it names, and
// spans the gap between them with two corridor side-walls (top open, no floor).
//   openings — the two [room, side] walls to cut. Both get the same opening, so
//              they line up by construction.
//   center   — opening centre along the wall's RUN axis: z for a ±x wall,
//              x for a ±z wall.
//   width    — clear width of the opening (metres).
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

// Segments shorter than this are dropped rather than built as slivers (e.g. an
// opening that reaches a wall's end).
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
    height: { type: "number", default: 3 }, // metres, floor -> open top
    thickness: { type: "number", default: 0.15 }, // metres
    color: { type: "color", default: "#ffffff" },
    shader: { type: "string", default: "flat" }, // unlit: cheap on Quest
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
  },

  build: function () {
    const d = this.data;
    const rooms = d.rooms || {};
    const hallways = d.hallways || [];

    // Index the openings by "room/side" so each wall knows what to cut.
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
        });
      });
    });

    let count = 0;
    Object.keys(rooms).forEach((name) => {
      SIDES.forEach((side) => {
        count += this.buildSide(name, rooms[name], side, openings[name + "/" + side]);
      });
    });
    hallways.forEach((h) => {
      count += this.buildCorridor(h);
    });
    console.log(
      `[floorplan] ${Object.keys(rooms).length} rooms, ${hallways.length} hallways, ${count} wall segments`
    );
  },

  // One room side: the full run minus each opening, left to right.
  buildSide: function (roomName, room, side, sideOpenings) {
    const g = sideGeometry(room, side);
    if (!g) return 0;

    // Cut points, ordered along the run. Openings are assumed not to overlap;
    // if they did, the segment between them would just come out negative-length
    // and be dropped by MIN_SEGMENT.
    const cuts = (sideOpenings || [])
      .map((o) => ({ start: o.center - o.width / 2, end: o.center + o.width / 2 }))
      .sort((a, b) => a.start - b.start);

    let cursor = g.min;
    let built = 0;
    cuts.forEach((c) => {
      built += this.wall(g.axis, g.fixed, cursor, c.start, `${roomName}${side}`);
      cursor = c.end;
    });
    built += this.wall(g.axis, g.fixed, cursor, g.max, `${roomName}${side}`);
    return built;
  },

  // The two side-walls that carry an opening across the gap between the rooms.
  // They are placed so their INNER faces are flush with the opening's edges —
  // the corridor keeps the opening's full clear width and reads as a straight
  // continuation of it. They run the corridor's whole span, so they tuck into
  // both room walls at the ends with no seam.
  buildCorridor: function (h) {
    const side = h.openings && h.openings[0] && h.openings[0].side;
    if (!side || !h.corridor) {
      console.warn(`[floorplan] hallway "${h.id}" has no side/corridor — skipped.`);
      return 0;
    }
    // Walk across the wall's through axis; the side-walls run along it.
    const runAxis = throughAxis(side); // corridor walls run along the through axis
    const offset = h.width / 2 + this.data.thickness / 2;
    let built = 0;
    [-1, 1].forEach((s) => {
      built += this.wall(
        runAxis,
        h.center + s * offset,
        h.corridor.from,
        h.corridor.to,
        `hall-${h.id}`
      );
    });
    return built;
  },

  // One wall segment: a box running along `axis` from `a` to `b`, with its
  // plane at `fixed` on the other horizontal axis. Standing on the floor
  // (y = 0), open above.
  wall: function (axis, fixed, a, b, label) {
    const d = this.data;
    const len = Math.abs(b - a);
    if (len < MIN_SEGMENT) return 0;
    const mid = (a + b) / 2;

    const el = document.createElement("a-box");
    if (axis === "z") {
      // Runs along z; its plane faces ±x.
      el.setAttribute("position", `${fixed} ${d.height / 2} ${mid}`);
      el.setAttribute("width", d.thickness);
      el.setAttribute("depth", len);
    } else {
      // Runs along x; its plane faces ±z.
      el.setAttribute("position", `${mid} ${d.height / 2} ${fixed}`);
      el.setAttribute("width", len);
      el.setAttribute("depth", d.thickness);
    }
    el.setAttribute("height", d.height);
    el.setAttribute("material", `color: ${d.color}; shader: ${d.shader}`);
    el.setAttribute("data-wall", label); // dev handle; nothing reads it
    this.el.appendChild(el);
    return 1;
  },
});
