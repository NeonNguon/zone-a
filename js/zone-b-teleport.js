// ================================================================
// Zone B — teleport terminals: the floor map (relocated ~400 m out, hidden
// while you're in the main exhibition) is reached through a freestanding sign
// in the MIDDLE of the Zone B room; a bright return terminal on EACH of the
// map's four edges brings you back to that same spot (findable from anywhere
// on the map, each topped by a tall beacon over the sphere field).
// Each jump runs the reusable transition-glitch (js/transition.js) and
// executes the actual rig relocation + map visibility flip at the glitch's
// PEAK, so the cut is never visible.
//
// Loaded in <head> AFTER zone-b-map.js and transition.js (it reads the wall's
// and the map's live config, and triggers the camera's glitch component).
//
// Two components:
//   teleport-terminal — the physical object: slim stand + angled screen at
//     standing height, canvas-textured (a cropped detail of the baked Saigon
//     map as destination preview, or a generated dark label screen), with a
//     hover response and a generous invisible hit target for Quest lasers.
//     Purely presentational: the manager below wires what a click does.
//   zone-b-teleport — the manager: derives terminal + spawn positions from
//     the wall's and map's OWN config (no copied numbers), wires clicks to
//     glitch-masked rig teleports, and flips the map root's `shown` toggle.
// ================================================================

// ----------------------------------------------------------------
// teleport-terminal — minimal geometry in the exhibition's language: a dark
// slim stand, a small tilted screen plane (unlit), a soft hover pop + light
// frame so it reads as interactive, and an invisible enlarged hit BOX that
// receives the raycaster (comfortable Quest selection from any approach).
//
// TUNABLES: screenWidth/screenHeight/screenHeightAboveFloor/tilt (geometry),
//   hitScale (hit box = screen size × this, floor to above the screen),
//   screenSrc + cropMin/cropMax (image detail, fractions of the image with
//   y measured from the TOP), label (generated text screen when no src).
//
// WAYFINDING (return terminals only): `accent` (a bright colour) turns the dark
//   label screen into a high-contrast, self-lit-looking "way home" screen and,
//   with `beacon:true`, raises a tall unlit pillar + floating `beaconLabel`
//   billboard ABOVE the sphere field so the nearest exit is spottable from
//   anywhere on the map. One accent colour across all four = one clear language.
//   beaconHeight / beaconWidth size the pillar; beaconOffset sets it BEHIND the
//   screen (like a post behind a sign) so it never occludes the label. All
//   flat/unlit — Quest-cheap.
// ----------------------------------------------------------------
AFRAME.registerComponent("teleport-terminal", {
  schema: {
    label: { type: "string", default: "" }, // text screen (no src)
    screenSrc: { type: "string", default: "" }, // image screen (cover-cropped)
    cropMin: { type: "vec2", default: { x: 0, y: 0 } }, // image fractions, y from top
    cropMax: { type: "vec2", default: { x: 1, y: 1 } },
    screenWidth: { type: "number", default: 0.52 },
    screenHeight: { type: "number", default: 0.36 },
    screenHeightAboveFloor: { type: "number", default: 1.15 },
    tilt: { type: "number", default: -12 }, // screen pitch, deg (top away)
    hitScale: { type: "number", default: 2.2 }, // hit box vs screen size
    // Wayfinding accent + beacon (return terminals). accent "" = plain terminal.
    accent: { type: "color", default: "" }, // bright "way home" colour (screen + beacon)
    beacon: { type: "boolean", default: false }, // raise a tall marker above it
    beaconHeight: { type: "number", default: 3.0 }, // pillar height above floor (m)
    beaconWidth: { type: "number", default: 0.12 }, // pillar cross-section (m)
    beaconLabel: { type: "string", default: "" }, // floating billboard text (e.g. EXIT)
    beaconOffset: { type: "number", default: 0.45 }, // pillar set BEHIND the screen (m)
  },

  init: function () {
    const d = this.data;

    // Furniture (stand / head / bezel / hover rim / screen mesh / hit box)
    // comes from the shared TerminalKit (js/terminal-kit.js) — extracted
    // verbatim from this component, so the look and behaviour are unchanged.
    // This component owns only the screen canvas CONTENT and the teleport.
    this.rig = TerminalKit.build(this.el, {
      canvas: this.makeScreenCanvas(),
      screenWidth: d.screenWidth,
      screenHeight: d.screenHeight,
      screenHeightAboveFloor: d.screenHeightAboveFloor,
      tilt: d.tilt,
      hitScale: d.hitScale,
    });
    this.screenTex = this.rig.screenTex;

    // A tall bright beacon above the terminal (return terminals) — built as a
    // DOM child so it inherits the terminal's inward facing set by the manager.
    if (d.beacon) this.buildBeacon();

    // Image screens draw asynchronously once the (browser-cached) image loads.
    if (d.screenSrc) this.loadScreenImage();
  },

  // The screen's canvas. Three looks: a bright self-lit `accent` "way home"
  // screen (bold white label on the accent colour — reads as glowing on the
  // unlit screen mesh); else a dark generated label (Helvetica, thin accent
  // rule — the data aesthetic); or, once loaded, the image crop.
  makeScreenCanvas: function () {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    if (this.data.accent) {
      // Bright wayfinding screen: saturated accent fill + bold white label,
      // framed white — high contrast, unmistakable, self-lit-looking.
      ctx.fillStyle = this.data.accent;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      if (this.data.label) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 76px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.data.label, canvas.width / 2, canvas.height / 2);
      }
      this.canvas = canvas;
      return canvas;
    }
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#3a4a66";
    ctx.strokeRect(10.5, 10.5, canvas.width - 21, canvas.height - 21);
    if (this.data.label) {
      ctx.fillStyle = "#e8eef8";
      ctx.font = "600 44px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.data.label, canvas.width / 2, canvas.height / 2);
      ctx.fillStyle = "#bfe6ff";
      ctx.fillRect(canvas.width / 2 - 60, canvas.height / 2 + 42, 120, 3);
    }
    this.canvas = canvas;
    return canvas;
  },

  // A tall, bright, UNLIT wayfinding beacon rising above the sphere field: a
  // slim four-sided pillar (visible from every direction) plus, if beaconLabel
  // is set, a floating text billboard just above it facing the terminal's front
  // (the map centre, where visitors stand). Flat geometry, no lights/shadows —
  // Quest-cheap. A DOM child of the terminal, so it moves/hides/orients with it.
  buildBeacon: function () {
    const d = this.data;
    const col = d.accent || "#ffc400";
    const cont = document.createElement("a-entity");

    // Set the pillar BEHIND the screen (the screen faces +z toward the map
    // centre, so behind = -z): it rises like a post behind the sign and never
    // crosses the label. The billboard shares the same setback, high above.
    const zBack = (-d.beaconOffset).toFixed(3);

    const pillar = document.createElement("a-box");
    pillar.setAttribute("width", d.beaconWidth);
    pillar.setAttribute("depth", d.beaconWidth);
    pillar.setAttribute("height", d.beaconHeight);
    pillar.setAttribute("position", `0 ${(d.beaconHeight / 2).toFixed(3)} ${zBack}`);
    pillar.setAttribute(
      "material",
      `color: ${col}; shader: flat; fog: false`
    );
    cont.appendChild(pillar);

    if (d.beaconLabel) {
      const lbl = document.createElement("a-entity");
      lbl.setAttribute(
        "position",
        `0 ${(d.beaconHeight + 0.35).toFixed(3)} ${zBack}`
      );
      lbl.setAttribute("text", {
        value: d.beaconLabel,
        align: "center",
        color: col,
        width: 6, // large enough to read from across the map
        side: "double",
      });
      cont.appendChild(lbl);
    }

    this.el.appendChild(cont);
    this.beaconEl = cont;
  },

  // Draw the cropMin..cropMax detail of the image onto the screen canvas,
  // COVER-fitted (no squash) — e.g. the central-Saigon detail of the baked
  // map JPEG, so Terminal A previews the destination with no new asset.
  loadScreenImage: function () {
    const d = this.data;
    const img = new Image();
    img.onload = () => {
      const sx = d.cropMin.x * img.width;
      const sy = d.cropMin.y * img.height;
      let sw = (d.cropMax.x - d.cropMin.x) * img.width;
      let sh = (d.cropMax.y - d.cropMin.y) * img.height;
      // Cover-fit: shrink one crop axis to the canvas aspect (centred).
      const want = this.canvas.width / this.canvas.height;
      if (sw / sh > want) {
        const w2 = sh * want;
        return this.drawCrop(img, sx + (sw - w2) / 2, sy, w2, sh);
      }
      const h2 = sw / want;
      this.drawCrop(img, sx, sy + (sh - h2) / 2, sw, h2);
    };
    img.onerror = () => {
      console.warn("teleport-terminal: screen image failed", d.screenSrc);
    };
    img.src = d.screenSrc;
  },

  drawCrop: function (img, sx, sy, sw, sh) {
    const ctx = this.canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
    // Keep the thin frame over the picture so both terminals share a face.
    ctx.strokeStyle = "#3a4a66";
    ctx.strokeRect(10.5, 10.5, this.canvas.width - 21, this.canvas.height - 21);
    this.screenTex.needsUpdate = true;
  },

  remove: function () {
    if (this.rig) this.rig.dispose();
    if (this.beaconEl && this.beaconEl.parentNode) {
      this.beaconEl.parentNode.removeChild(this.beaconEl);
    }
  },
});

// ----------------------------------------------------------------
// zone-b-teleport — the manager. Owns NO copied coordinates: everything is
// derived live from the wall's config (#zone-b's zone-b-root + #zone-b-wall's
// image-wall) and the map's config (#zone-b-map's root position + map-board),
// and re-derived whenever the map root moves or the board rebuilds — so
// retuning the map offset later can't break arrival points.
//
// Placements (all world-space, derived):
//   Terminal A — a freestanding sign at the CENTRE of the Zone B room (read
//     live from the floorplan), terminalAOffset from that centre, screen
//     facing -x (the entrance / the return-spawn side).
//   Return terminals — ONE per map edge (near/far/left/right), each `returnInset`
//     inside its edge midpoint (derived live from the board's width/depth + gap),
//     children of the map root so they move/hide with the map; every screen faces
//     the map CENTRE and every one runs the identical return jump.
//   Map spawn — mapSpawnOffset from the near-edge centre, facing +x (across
//     the map, the full sphere field ahead).
//   Return spawn — returnSpawnOffset from Terminal A, facing +x (toward the
//     sign in the middle of the room, NOT the exhibition's original spawn).
//
// Sequence per jump: glitch trigger -> AT PEAK move rig (visitor-compensated,
// see TeleportRig) + flip map `shown` -> glitch resolves. `busy` +
// transition-glitch's own active-guard block re-triggers mid-flight.
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-b-teleport", {
  schema: {
    terminalAOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } }, // from room centre
    mapSpawnOffset: { type: "vec3", default: { x: -0.6, y: 0, z: 0 } },
    returnSpawnOffset: { type: "vec3", default: { x: -1.6, y: 0, z: 0 } },
    // Each return terminal sits this far INSIDE its map edge (m), lifted returnY
    // above the map plane; all four face the map centre so a visitor among the
    // spheres sees the bright screen. Live-derived from the board (no map size).
    returnInset: { type: "number", default: 0.7 },
    returnY: { type: "number", default: 0.02 },
  },

  init: function () {
    this.busy = false;
    this.mapSpawn = new THREE.Vector3();
    this.returnSpawn = new THREE.Vector3();

    this.termA = this.el.querySelector("#terminal-a");
    this.mapRootEl = document.getElementById("zone-b-map");
    this.boardEl = document.getElementById("zone-b-map-board");
    this.cameraEl = document.getElementById("camera");

    // The return terminals: every teleport-terminal under the map root (each
    // tagged data-edge = near|far|left|right). All are children of the map root,
    // so they relocate/hide with the map, and ALL run the identical return jump.
    this.returnTerminals = this.mapRootEl
      ? Array.prototype.slice.call(
          this.mapRootEl.querySelectorAll("[teleport-terminal]")
        )
      : [];

    this.onClickA = () => this.jump(this.mapSpawn, -90, true);
    this.onReturn = () => this.jump(this.returnSpawn, -90, false);
    if (this.termA) this.termA.addEventListener("click", this.onClickA);
    this.returnTerminals.forEach((t) =>
      t.addEventListener("click", this.onReturn)
    );

    // Re-derive whenever the map root moves or the board (re)builds.
    this.onMapChange = () => this.layout();
    if (this.mapRootEl) {
      this.mapRootEl.addEventListener("zonebmaprootchanged", this.onMapChange);
    }
    if (this.boardEl) {
      this.boardEl.addEventListener("zonebmapbuilt", this.onMapChange);
    }

    this.layout();
  },

  update: function (oldData) {
    if (Object.keys(oldData).length === 0) return; // first update: init did it
    this.layout();
  },

  // Zone B's room centre in WORLD coords, read live from the floorplan (the room
  // the freestanding teleport sign stands in). #floorplan parses before this
  // component, so its config is readable here; falls back to the wall root's
  // offset if not.
  zoneBCenter: function () {
    const fp = document.getElementById("floorplan");
    const attr = fp && fp.getAttribute("floorplan");
    const r = attr && attr.rooms && attr.rooms.zoneB;
    if (r) return { x: r.cx, z: r.cz };
    console.warn("zone-b-teleport: no floorplan zoneB; FALLBACK to wall root");
    const wallRoot = document.getElementById("zone-b");
    const rootAttr = wallRoot && wallRoot.getAttribute("zone-b-root");
    const base = (rootAttr && rootAttr.offset) || { x: 19.2, y: 3, z: -3 };
    return { x: base.x, z: base.z };
  },

  layout: function () {
    const d = this.data;

    // --- Terminal A: a freestanding sign at the CENTRE of the Zone B room
    // (read live from the floorplan — no copied numbers), at FLOOR level and
    // offset by the tunable; screen faces -x (the entrance / return-spawn side).
    const c = this.zoneBCenter();
    const ax = c.x + d.terminalAOffset.x;
    const ay = 0 + d.terminalAOffset.y;
    const az = c.z + d.terminalAOffset.z;
    if (this.termA) {
      this.termA.setAttribute("position", { x: ax, y: ay, z: az });
      this.termA.setAttribute("rotation", "0 -90 0"); // plane normal -> -x
    }

    // --- return spawn: beside Terminal A (the sign in the middle), facing +x
    // toward it — so a jump back lands you at the same spot the sign stands.
    this.returnSpawn.set(
      ax + d.returnSpawnOffset.x,
      0 + d.returnSpawnOffset.y,
      az + d.returnSpawnOffset.z
    );

    // --- map side: near-edge CENTRE from the map root's live position + the
    // board's own gap (the map extends +x from the root; see map-board).
    if (!this.mapRootEl || !this.boardEl) return;
    const m = this.mapRootEl.object3D.position;
    const board = this.boardEl.components["map-board"];
    const gap = board ? board.data.gapBehindWall : 1.0;
    const nearX = m.x + gap;

    this.mapSpawn.set(
      nearX + d.mapSpawnOffset.x,
      m.y + d.mapSpawnOffset.y,
      m.z + d.mapSpawnOffset.z
    );

    // --- return terminals: one on each of the four map edges, derived LIVE
    // from the board's width/depth + gap (no copied map size). The map root
    // carries NO rotation, so root-LOCAL == world-axis offsets from the root:
    //   near edge x = gap, far edge x = gap + depth, z spans ±width/2 around 0.
    // Each terminal sits `returnInset` inside its edge midpoint and yaws so its
    // screen (+z) faces the map CENTRE (cx, 0), where visitors stand. Skipped
    // until the board has built (width/depth set) — a later zonebmapbuilt
    // re-runs this with them present.
    if (!board || board.width == null || board.depth == null) return;
    const bw = board.width;
    const bd = board.depth;
    const cx = gap + bd / 2; // map-centre x, root-local
    const inset = d.returnInset;
    this.returnTerminals.forEach((t) => {
      const edge = t.dataset.edge || "near";
      let px, pz;
      if (edge === "far") {
        px = gap + bd - inset; pz = 0;
      } else if (edge === "left") {
        px = cx; pz = -bw / 2 + inset;
      } else if (edge === "right") {
        px = cx; pz = bw / 2 - inset;
      } else {
        px = gap + inset; pz = 0; // near / south (default)
      }
      t.setAttribute("position", { x: px, y: d.returnY, z: pz });
      // Face the map centre: yaw so the screen plane (+z) points inward.
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(cx - px, 0 - pz));
      t.setAttribute("rotation", `0 ${yaw.toFixed(2)} 0`);
    });
  },

  // One glitch-masked jump. The rig move + visibility flip happen at PEAK
  // obscuration; busy (plus the glitch's own active-guard) blocks re-triggers
  // until the view has fully resolved.
  jump: function (target, faceDeg, showMap) {
    if (this.busy) return;
    const glitch =
      this.cameraEl &&
      this.cameraEl.components &&
      this.cameraEl.components["transition-glitch"];
    const cut = () => {
      TeleportRig.go(target, faceDeg);
      if (this.mapRootEl) {
        this.mapRootEl.setAttribute("zone-b-map-root", "shown", showMap);
      }
      // Keep the rig-collision clamp from fighting this jump. The map is ~400 m
      // out, far outside the walkable region, so the clamp would drag the rig
      // straight back. Disable it on arrival at the map; re-enable it + resync
      // last-valid on the return jump (the rig has just landed at the return
      // spot, which IS inside the walkable region). Guarded so the teleport
      // still works if the collider isn't present.
      const rigEl = document.getElementById("rig");
      const collider =
        rigEl && rigEl.components && rigEl.components["rig-collision"];
      if (collider) {
        if (showMap) {
          collider.setActive(false); // going to the map — stop clamping
        } else {
          collider.setActive(true); // back in the exhibition — clamp again
          collider.resync(); // seed last-valid to the return spot (no snap-back)
        }
      }
    };
    if (!glitch) {
      console.warn("zone-b-teleport: no transition-glitch on camera; hard cut");
      cut();
      return;
    }
    this.busy = true;
    glitch.trigger(cut, () => {
      this.busy = false;
    });
  },

  remove: function () {
    if (this.termA) this.termA.removeEventListener("click", this.onClickA);
    this.returnTerminals.forEach((t) =>
      t.removeEventListener("click", this.onReturn)
    );
    if (this.mapRootEl) {
      this.mapRootEl.removeEventListener("zonebmaprootchanged", this.onMapChange);
    }
    if (this.boardEl) {
      this.boardEl.removeEventListener("zonebmapbuilt", this.onMapChange);
    }
  },
});
