// ================================================================
// Zone B — teleport terminals: the floor map (relocated ~400 m out, hidden
// while you're in the main exhibition) is reached through a terminal beside
// the 100-image wall; a matching terminal on the map side brings you back.
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
  },

  init: function () {
    const d = this.data;

    // --- stand: base plate + slim column, unlit dark (exhibition furniture).
    const base = document.createElement("a-box");
    base.setAttribute("width", 0.34);
    base.setAttribute("height", 0.02);
    base.setAttribute("depth", 0.26);
    base.setAttribute("position", "0 0.01 0");
    base.setAttribute("material", "color: #14141a; shader: flat");
    this.el.appendChild(base);

    const standH = Math.max(0.1, d.screenHeightAboveFloor - 0.05);
    const stand = document.createElement("a-box");
    stand.setAttribute("width", 0.06);
    stand.setAttribute("height", standH);
    stand.setAttribute("depth", 0.06);
    stand.setAttribute("position", `0 ${standH / 2} 0`);
    stand.setAttribute("material", "color: #14141a; shader: flat");
    this.el.appendChild(stand);

    // --- head: bezel + screen, tilted like a console at standing height.
    const head = document.createElement("a-entity");
    head.setAttribute("position", `0 ${d.screenHeightAboveFloor} 0`);
    head.setAttribute("rotation", `${d.tilt} 0 0`);
    this.el.appendChild(head);
    this.head = head;

    const bezel = document.createElement("a-plane");
    bezel.setAttribute("width", d.screenWidth + 0.05);
    bezel.setAttribute("height", d.screenHeight + 0.05);
    bezel.setAttribute("position", "0 0 -0.006");
    bezel.setAttribute("material", "color: #101014; shader: flat");
    head.appendChild(bezel);

    // Hover frame: a light rim just behind the bezel, hidden until pointed at
    // (the dark-on-light inverse of the wall tiles' black hover frame).
    const rim = document.createElement("a-plane");
    rim.setAttribute("width", d.screenWidth + 0.1);
    rim.setAttribute("height", d.screenHeight + 0.1);
    rim.setAttribute("position", "0 0 -0.012");
    rim.setAttribute("material", "color: #bfe6ff; shader: flat");
    rim.setAttribute("visible", false);
    head.appendChild(rim);
    this.rim = rim;

    // Screen: manual mesh so the CanvasTexture is fully ours (no geometry /
    // texture cache interactions with other planes).
    this.screenTex = new THREE.CanvasTexture(this.makeScreenCanvas());
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenGeo = new THREE.PlaneGeometry(d.screenWidth, d.screenHeight);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex });
    const screenEnt = document.createElement("a-entity");
    head.appendChild(screenEnt);
    screenEnt.addEventListener(
      "loaded",
      () => screenEnt.setObject3D("screen", new THREE.Mesh(this.screenGeo, this.screenMat)),
      { once: true }
    );

    // --- hit target: one generous INVISIBLE box from the floor to above the
    // screen (opacity 0 + colorWrite off — still ray-hittable), the only
    // clickable part, so pointing anywhere at the terminal works.
    const hitW = d.screenWidth * d.hitScale;
    const hitH = d.screenHeightAboveFloor + d.screenHeight * d.hitScale * 0.5;
    this.hitGeo = new THREE.BoxGeometry(hitW, hitH, 0.5);
    this.hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitMat.colorWrite = false;
    const hit = document.createElement("a-entity");
    hit.setAttribute("position", `0 ${hitH / 2} 0`);
    hit.setAttribute("class", "clickable");
    hit.addEventListener(
      "loaded",
      () => hit.setObject3D("hit", new THREE.Mesh(this.hitGeo, this.hitMat)),
      { once: true }
    );
    this.el.appendChild(hit);

    // Hover response on the hit target: rim on + slight head pop. The same
    // mouseenter/mouseleave arrive from the desktop cursor and both lasers.
    this.onEnter = () => {
      this.rim.setAttribute("visible", true);
      this.head.object3D.scale.set(1.05, 1.05, 1.05);
    };
    this.onLeave = () => {
      this.rim.setAttribute("visible", false);
      this.head.object3D.scale.set(1, 1, 1);
    };
    hit.addEventListener("mouseenter", this.onEnter);
    hit.addEventListener("mouseleave", this.onLeave);
    this.hitEl = hit;

    // Image screens draw asynchronously once the (browser-cached) image loads.
    if (d.screenSrc) this.loadScreenImage();
  },

  // The screen's canvas: either a dark generated label (Helvetica, letterset,
  // thin accent rule — the data aesthetic) or, once loaded, the image crop.
  makeScreenCanvas: function () {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
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
    if (this.hitEl) {
      this.hitEl.removeEventListener("mouseenter", this.onEnter);
      this.hitEl.removeEventListener("mouseleave", this.onLeave);
    }
    if (this.screenGeo) this.screenGeo.dispose();
    if (this.screenMat) this.screenMat.dispose();
    if (this.screenTex) this.screenTex.dispose();
    if (this.hitGeo) this.hitGeo.dispose();
    if (this.hitMat) this.hitMat.dispose();
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
//   Terminal A — at the wall's RIGHT edge (as seen from spawn: +z end),
//     terminalAOffset from that corner, screen facing spawn (-x).
//   Terminal B — terminalBOffset from the map's near-edge CENTRE (the
//     arrival area), child of the map root so it moves/hides with the map;
//     screen auto-faces the arrival point.
//   Map spawn — mapSpawnOffset from the near-edge centre, facing +x (across
//     the map, the full sphere field ahead).
//   Return spawn — returnSpawnOffset from Terminal A, facing +x (the
//     terminal + wall area, NOT the exhibition's original spawn).
//
// Sequence per jump: glitch trigger -> AT PEAK move rig (visitor-compensated,
// see TeleportRig) + flip map `shown` -> glitch resolves. `busy` +
// transition-glitch's own active-guard block re-triggers mid-flight.
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-b-teleport", {
  schema: {
    terminalAOffset: { type: "vec3", default: { x: -1.2, y: 0, z: 1.0 } },
    terminalBOffset: { type: "vec3", default: { x: 0.5, y: 0.02, z: 2.2 } },
    mapSpawnOffset: { type: "vec3", default: { x: -0.6, y: 0, z: 0 } },
    returnSpawnOffset: { type: "vec3", default: { x: -1.6, y: 0, z: 0 } },
  },

  init: function () {
    this.busy = false;
    this.mapSpawn = new THREE.Vector3();
    this.returnSpawn = new THREE.Vector3();

    this.termA = this.el.querySelector("#terminal-a");
    this.termB = document.getElementById("terminal-b");
    this.mapRootEl = document.getElementById("zone-b-map");
    this.boardEl = document.getElementById("zone-b-map-board");
    this.cameraEl = document.getElementById("camera");

    this.onClickA = () => this.jump(this.mapSpawn, -90, true);
    this.onClickB = () => this.jump(this.returnSpawn, -90, false);
    if (this.termA) this.termA.addEventListener("click", this.onClickA);
    if (this.termB) this.termB.addEventListener("click", this.onClickB);

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

  layout: function () {
    const d = this.data;

    // --- wall config, from its own sources of truth.
    const wallRoot = document.getElementById("zone-b");
    const wallEl = document.getElementById("zone-b-wall");
    const rootAttr = wallRoot && wallRoot.getAttribute("zone-b-root");
    const base = (rootAttr && rootAttr.offset) || { x: 13, y: 3, z: 0 };
    let width = 15;
    const wallAttr = wallEl && wallEl.getAttribute("image-wall");
    if (wallAttr && wallAttr.width > 0) {
      width = wallAttr.width;
    } else if (wallEl && wallEl.components && wallEl.components["image-wall"]) {
      width = wallEl.components["image-wall"].resolveWidth();
    } else {
      console.warn("zone-b-teleport: could not read wall width; FALLBACK 15 m");
    }

    // --- Terminal A: at the wall's right edge (+z end, as seen from spawn),
    // at FLOOR level, offset by the tunable; screen faces spawn (-x).
    const ax = base.x + d.terminalAOffset.x;
    const ay = 0 + d.terminalAOffset.y;
    const az = base.z + width / 2 + d.terminalAOffset.z;
    if (this.termA) {
      this.termA.setAttribute("position", { x: ax, y: ay, z: az });
      this.termA.setAttribute("rotation", "0 -90 0"); // plane normal -> -x
    }

    // --- return spawn: beside Terminal A, facing +x (terminal + wall ahead).
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

    // --- Terminal B: child of the map root (moves/hides with the map), so
    // its position is root-LOCAL (root carries no rotation); screen faces the
    // arrival point.
    if (this.termB) {
      const bx = gap + d.terminalBOffset.x;
      const by = d.terminalBOffset.y;
      const bz = d.terminalBOffset.z;
      this.termB.setAttribute("position", { x: bx, y: by, z: bz });
      const dx = this.mapSpawn.x - (m.x + bx);
      const dz = this.mapSpawn.z - (m.z + bz);
      const yaw = THREE.MathUtils.radToDeg(Math.atan2(dx, dz)); // plane faces +z
      this.termB.setAttribute("rotation", `0 ${yaw.toFixed(2)} 0`);
    }
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
    if (this.termB) this.termB.removeEventListener("click", this.onClickB);
    if (this.mapRootEl) {
      this.mapRootEl.removeEventListener("zonebmaprootchanged", this.onMapChange);
    }
    if (this.boardEl) {
      this.boardEl.removeEventListener("zonebmapbuilt", this.onMapChange);
    }
  },
});
