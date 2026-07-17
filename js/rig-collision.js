// ================================================================
// rig-collision — constrains smooth-locomotion to the walkable floor.
//
// The visitor is SEATED (office chair) and never physically walks, so the
// camera rig only ever moves via thumbstick locomotion. That means clamping
// the RIG's (x,z) fully controls where the player can be — and, crucially, we
// never touch the camera or fight head tracking (which would cause nausea).
// This component only ever reads/writes the rig's x and z; never y, never the
// camera.
//
// WALKABLE REGION — the single source of truth is the `floorplan` component's
// OWN live config (rooms + hallways + wall thickness), read straight off
// #floorplan, not a second copy of the numbers. We rebuild whenever the
// floorplan (re)builds (`floorplanbuilt`), so retuning the plan retunes the
// collider for free. The region is a UNION of axis-aligned rectangles:
//   - one per room, with every SOLID wall edge inset inward by
//     (wallThickness/2 + playerRadius) from the wall centreline, so the camera
//     stops a player-radius short of the 0.15 m wall instead of clipping it;
//   - one per hallway corridor: the opening's clear width inset by the player
//     radius on its two side walls, then EXTENDED along the through axis into
//     both rooms it joins (past their inset edges) so the union stays
//     continuous through every doorway — you can walk room -> hall -> room.
// The doorway edges themselves are deliberately NOT inset: the corridor rect
// bridging into the room is what keeps the opening passable.
//
// PER-TICK (after locomotion has moved the rig THIS frame — see the tick-order
// note below): read the rig's new (x,z). If it's inside the union, remember it
// as last-valid. If it's outside, try an axis-separated SLIDE so you glide
// along a wall instead of sticking: try (newX, lastZ); else (lastX, newZ);
// else revert to last-valid.
//
// TICK ORDER — smooth-locomotion lives on #rightHand, a CHILD of the rig,
// while this component is on the rig itself. A-Frame plays a parent's
// components before its children's, so by default THIS would tick before the
// movement and correct a frame late. We fix it by moving our behavior to the
// end of the scene's tick list once everything has loaded (reorderTickLast),
// so the correction always runs after the move, in the same frame, before the
// frame is rendered.
//
// ZONE B TELEPORT — the scripted teleport jumps the rig ~400 m out to the
// floor map, far outside the walkable region. The teleport calls setActive()
// on us: it DISABLES the collider on arrival at the map (so the clamp can't
// yank the rig back) and RE-ENABLES it on return, calling resync() so
// last-valid is the return position and there's no snap-back. Both directions
// handled; see js/zone-b-teleport.js.
//
// TUNABLES (no code edit — setAttribute on #rig):
//   playerRadius — how far short of a wall the camera stops (m, default 0.25)
//   doorOverlap  — how far corridor rects reach into each room past its inset
//                  edge, guaranteeing the union stays continuous (m)
//   enabled      — master on/off
//   debug        — log every blocked / slid / reverted move
// ================================================================
AFRAME.registerComponent("rig-collision", {
  schema: {
    playerRadius: { type: "number", default: 0.25 },
    doorOverlap: { type: "number", default: 0.3 },
    enabled: { type: "boolean", default: true },
    debug: { type: "boolean", default: false },
  },

  init: function () {
    // Internal active flag, separate from the `enabled` tunable: the Zone B
    // teleport flips this to park us while the visitor is out on the map.
    this.active = true;
    this.rects = null; // walkable rectangles; null until the floorplan is read

    // Last known-good rig (x,z). Seeded from the rig's current spot (spawn is
    // the foyer origin, inside the walkable region).
    const p = this.el.object3D.position;
    this.lastX = p.x;
    this.lastZ = p.z;

    this.fpEl = document.getElementById("floorplan");

    // Rebuild the region whenever the floorplan (re)builds. Try once now too,
    // in case the floorplan already built before we inited.
    this.onFloorplanBuilt = () => this.buildRegions();
    if (this.fpEl) {
      this.fpEl.addEventListener("floorplanbuilt", this.onFloorplanBuilt);
    }
    this.buildRegions();

    // Ensure our tick runs AFTER smooth-locomotion's — see the header note.
    this.onSceneLoaded = () => this.reorderTickLast();
    if (this.el.sceneEl.hasLoaded) this.reorderTickLast();
    else this.el.sceneEl.addEventListener("loaded", this.onSceneLoaded);
  },

  update: function () {
    // playerRadius / doorOverlap changed -> the insets change -> rebuild.
    this.buildRegions();
  },

  // Move this behavior to the end of the scene's tick list so the collision
  // correction fires after every mover (notably smooth-locomotion, which sits
  // on a child of the rig and would otherwise tick first). Idempotent: it
  // splices itself out before re-appending, so repeated calls just keep us
  // last.
  reorderTickLast: function () {
    const scene = this.el.sceneEl;
    const arr = scene.behaviors && scene.behaviors.tick;
    if (!arr) return;
    const i = arr.indexOf(this);
    if (i !== -1) arr.splice(i, 1);
    arr.push(this);
  },

  // Build the walkable rectangles from the floorplan's OWN live config, so the
  // collider and the walls can never disagree. Rooms: inset every edge by
  // (thickness/2 + playerRadius). Corridors: opening width inset by the player
  // radius on the side walls, extended into both rooms along the through axis.
  buildRegions: function () {
    const data = this.fpEl && this.fpEl.getAttribute("floorplan");
    if (!data || !data.rooms) {
      // Floorplan not ready yet — leave rects null; the tick treats a null
      // region as "no constraint" so we never trap the player pre-build.
      this.rects = null;
      return;
    }
    const t = data.thickness != null ? data.thickness : 0.15;
    const r = this.data.playerRadius;
    const inset = t / 2 + r; // wall centreline -> stop line, per solid edge
    const rects = [];

    const rooms = data.rooms;
    Object.keys(rooms).forEach((name) => {
      const rm = rooms[name];
      rects.push({
        x0: rm.cx - rm.w / 2 + inset,
        x1: rm.cx + rm.w / 2 - inset,
        z0: rm.cz - rm.d / 2 + inset,
        z1: rm.cz + rm.d / 2 - inset,
        tag: "room:" + name,
      });
    });

    const ext = t / 2 + r + this.data.doorOverlap; // reach past each room's inset edge
    (data.hallways || []).forEach((h) => {
      const side = h.openings && h.openings[0] && h.openings[0].side;
      if (!side || !h.corridor) return;
      const through = side.charAt(1); // 'x' for ±x walls, 'z' for ±z walls
      const lo = Math.min(h.corridor.from, h.corridor.to);
      const hi = Math.max(h.corridor.from, h.corridor.to);
      const halfOpen = h.width / 2 - r; // side walls inset by the player radius
      if (halfOpen <= 0) return; // opening narrower than the player — skip
      const c = h.center; // opening centre on the wall's run axis
      let rect;
      if (through === "x") {
        // Walk across in x; opening spans z.
        rect = { x0: lo - ext, x1: hi + ext, z0: c - halfOpen, z1: c + halfOpen };
      } else {
        // Walk across in z; opening spans x.
        rect = { x0: c - halfOpen, x1: c + halfOpen, z0: lo - ext, z1: hi + ext };
      }
      rect.tag = "hall:" + h.id;
      rects.push(rect);
    });

    this.rects = rects;
    if (this.data.debug) {
      console.log("[rig-collision] built " + rects.length + " walkable rects", rects);
    }
  },

  // Point (x,z) inside the walkable union? A null region (floorplan not built)
  // means "no constraint" — everything is walkable.
  isWalkable: function (x, z) {
    if (!this.rects) return true;
    for (let i = 0; i < this.rects.length; i++) {
      const a = this.rects[i];
      if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return true;
    }
    return false;
  },

  tick: function () {
    if (!this.data.enabled || !this.active) return;

    const pos = this.el.object3D.position;
    const newX = pos.x;
    const newZ = pos.z;

    // Moved nowhere this frame — nothing to check (keeps last-valid current
    // when the rig is parked).
    if (newX === this.lastX && newZ === this.lastZ) return;

    if (this.isWalkable(newX, newZ)) {
      this.lastX = newX;
      this.lastZ = newZ;
      return;
    }

    // Outside — try to slide along whichever wall we hit (axis-separated).
    if (this.isWalkable(newX, this.lastZ)) {
      pos.z = this.lastZ; // slide along x, blocked in z
      this.lastX = newX;
      if (this.data.debug) console.log("[rig-collision] slid along x at z=" + this.lastZ.toFixed(2));
    } else if (this.isWalkable(this.lastX, newZ)) {
      pos.x = this.lastX; // slide along z, blocked in x
      this.lastZ = newZ;
      if (this.data.debug) console.log("[rig-collision] slid along z at x=" + this.lastX.toFixed(2));
    } else {
      pos.x = this.lastX; // fully blocked — revert
      pos.z = this.lastZ;
      if (this.data.debug) console.log("[rig-collision] blocked; reverted to " + this.lastX.toFixed(2) + "," + this.lastZ.toFixed(2));
    }
  },

  // --- teleport hooks (called by zone-b-teleport) ---------------------------
  // Park or resume the clamp. The Zone B teleport disables us on arrival at the
  // far-out floor map (so the clamp can't drag the rig back from z≈-400) and
  // re-enables us on return.
  setActive: function (on) {
    this.active = !!on;
    if (this.data.debug) console.log("[rig-collision] active = " + this.active);
  },

  // Re-seed last-valid to the rig's CURRENT (x,z). Called after a teleport
  // lands the rig at the return spot, so re-enabling the clamp doesn't snap the
  // rig back toward a stale pre-teleport position.
  resync: function () {
    const p = this.el.object3D.position;
    this.lastX = p.x;
    this.lastZ = p.z;
    if (this.data.debug) console.log("[rig-collision] resync -> " + this.lastX.toFixed(2) + "," + this.lastZ.toFixed(2));
  },

  remove: function () {
    if (this.fpEl) this.fpEl.removeEventListener("floorplanbuilt", this.onFloorplanBuilt);
    this.el.sceneEl.removeEventListener("loaded", this.onSceneLoaded);
    const arr = this.el.sceneEl.behaviors && this.el.sceneEl.behaviors.tick;
    if (arr) {
      const i = arr.indexOf(this);
      if (i !== -1) arr.splice(i, 1);
    }
  },
});
