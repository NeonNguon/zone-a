// ================================================================
// rig-collision — constrains locomotion to the walkable floor (VR + desktop).
//
// WHAT MOVES depends on the mode, so WHAT WE CLAMP does too:
//   - VR: the visitor is SEATED and never physically walks, so the rig only
//     moves via thumbstick locomotion. We clamp the RIG's (x,z) and leave the
//     camera alone — correcting the camera against HEAD TRACKING would cause
//     nausea. (The head's small seated offset from the rig is ignored, per the
//     seated-visitor assumption.)
//   - Desktop: wasd-controls moves the CAMERA's local position (the rig stays
//     put), so clamping the rig would do nothing. Here the camera's local
//     translation IS the locomotion — not head tracking — so we measure the
//     camera's WORLD position and push the CAMERA's local position back. Safe:
//     desktop has no headset, so there's nothing to fight.
// Either way we only ever touch x and z, never y.
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

    // Last known-good VISITOR floor (x,z), in WORLD space. Seeded from the
    // rig's current spot (spawn is the foyer origin, inside the region).
    const p = this.el.object3D.position;
    this.lastX = p.x;
    this.lastZ = p.z;
    // Force the first tick to reseed against the actual mover for the current
    // mode (see tick): null never equals a real boolean.
    this._inVR = null;

    this.camEl = document.getElementById("camera");
    // Scratch, reused per frame so tick allocates nothing.
    this._m = { x: 0, z: 0 }; // measured mover position
    this._wp = new THREE.Vector3(); // camera world position
    this._d = new THREE.Vector3(); // world-space correction delta
    this._invQ = new THREE.Quaternion(); // inverse rig rotation

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
  // correction fires after every mover — smooth-locomotion (VR) and
  // wasd-controls (desktop) both sit on children of the rig and, by A-Frame's
  // parent-before-child play order, would otherwise tick first. Idempotent: it
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

  // The (x,z) of the thing that locomotion actually moves this frame, in WORLD
  // space: the rig in VR, the camera on desktop (see the header note).
  moverXZ: function (inVR, out) {
    if (inVR) {
      const p = this.el.object3D.position; // rig is a scene child: local == world
      out.x = p.x;
      out.z = p.z;
    } else {
      this.camEl.object3D.getWorldPosition(this._wp);
      out.x = this._wp.x;
      out.z = this._wp.z;
    }
    return out;
  },

  tick: function () {
    if (!this.data.enabled || !this.active) return;

    const inVR = this.el.sceneEl.is("vr-mode");
    // Entering/leaving VR swaps which entity we measure (rig <-> camera) and
    // those disagree by the head offset, so reseed last-valid and skip a frame
    // rather than correcting against the discontinuity. Also covers the very
    // first tick (_inVR starts null).
    if (inVR !== this._inVR) {
      this._inVR = inVR;
      const m = this.moverXZ(inVR, this._m);
      this.lastX = m.x;
      this.lastZ = m.z;
      return;
    }

    const m = this.moverXZ(inVR, this._m);
    const newX = m.x;
    const newZ = m.z;

    // Moved nowhere this frame — nothing to check (keeps last-valid current
    // when the visitor is parked).
    if (newX === this.lastX && newZ === this.lastZ) return;

    if (this.isWalkable(newX, newZ)) {
      this.lastX = newX;
      this.lastZ = newZ;
      return;
    }

    // Outside — pick the corrected target via an axis-separated slide, so you
    // glide along whichever wall you hit instead of sticking.
    let cx, cz, how;
    if (this.isWalkable(newX, this.lastZ)) {
      cx = newX;
      cz = this.lastZ; // slide along x, blocked in z
      how = "slid-x";
    } else if (this.isWalkable(this.lastX, newZ)) {
      cx = this.lastX; // slide along z, blocked in x
      cz = newZ;
      how = "slid-z";
    } else {
      cx = this.lastX; // fully blocked — revert
      cz = this.lastZ;
      how = "blocked";
    }

    this.applyCorrection(inVR, newX, newZ, cx, cz);
    this.lastX = cx;
    this.lastZ = cz;
    if (this.data.debug) {
      console.log("[rig-collision] " + how + " -> " + cx.toFixed(2) + "," + cz.toFixed(2));
    }
  },

  // Move the visitor's world floor position from (newX,newZ) to the corrected
  // (cx,cz). In VR the mover is the rig, so we set it straight. On desktop the
  // mover is the camera (wasd shifted its LOCAL position), so we push the
  // camera's local position by the world-space correction, rotated into the
  // rig's frame — exact even if a desktop teleport left the rig yawed. Only
  // x,z; y is never touched.
  applyCorrection: function (inVR, newX, newZ, cx, cz) {
    if (inVR) {
      const pos = this.el.object3D.position;
      pos.x = cx;
      pos.z = cz;
    } else {
      this._d.set(cx - newX, 0, cz - newZ); // world-space correction
      this._invQ.copy(this.el.object3D.quaternion).invert();
      this._d.applyQuaternion(this._invQ); // -> rig-local
      const cam = this.camEl.object3D;
      cam.position.x += this._d.x;
      cam.position.z += this._d.z;
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

  // Re-seed last-valid to the visitor's CURRENT world (x,z) for the active
  // mode. Called after a teleport lands the rig at the return spot, so
  // re-enabling the clamp doesn't snap back toward a stale pre-teleport
  // position.
  resync: function () {
    const inVR = this.el.sceneEl.is("vr-mode");
    this._inVR = inVR;
    const m = this.moverXZ(inVR, this._m);
    this.lastX = m.x;
    this.lastZ = m.z;
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
