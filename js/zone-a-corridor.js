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
//                     rooms and the nine images. One `offset` handle + `shown`,
//                     mirroring zone-b-map-root. (STEP 2/3)
//   zone-a-teleport — the manager: the outbound booth in the Zone A room and
//                     the return booth on the corridor's landing, wired to each
//                     other through glitch-masked jumps. (STEP 4)
// ================================================================

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
// TUNABLES (setAttribute on #zone-a-teleport):
//   boothOffset — the outbound booth's offset from the Zone A room centre (m).
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-a-teleport", {
  schema: {
    boothOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
  },

  init: function () {
    this.booth = this.el.querySelector("#terminal-a2");
    this.floorplanEl = document.getElementById("floorplan");

    // The floorplan can rebuild (any tunable change rebuilds the whole plan),
    // and the room centre is derived from it — so re-derive when it does.
    this.onFloorplanBuilt = () => this.layout();
    if (this.floorplanEl) {
      this.floorplanEl.addEventListener("floorplanbuilt", this.onFloorplanBuilt);
    }

    this.layout();
    this.labelBooth();
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
    this.booth.setAttribute("position", {
      x: c.x + d.boothOffset.x,
      y: 0 + d.boothOffset.y,
      z: c.z + d.boothOffset.z,
    });
    this.booth.setAttribute("rotation", "0 0 0");
  },

  remove: function () {
    if (this.floorplanEl) {
      this.floorplanEl.removeEventListener("floorplanbuilt", this.onFloorplanBuilt);
    }
  },
});
