// ================================================================
// Zone B — a 10×10 wall of 100 images, to the right of spawn.
// Loaded in <head> AFTER components.js (so zoneARingPlacements() is defined,
// letting image-wall auto-size itself from Zone A's ring radius) and BEFORE
// <a-scene> parses, so both components are registered in time.
//
// This is a PLACEMENT pass only: get the wall standing at the right size and
// orientation. Focus/zoom, LOD and streaming come in later passes.
// ================================================================

// ----------------------------------------------------------------
// zone-b-root: the SINGLE placement handle for the whole Zone B assembly,
// mirroring zone-a-root. #zone-b is the shared origin the image-wall hangs off,
// so moving this one entity moves the entire wall as a unit. It does NOT touch
// the grid math (width / gap / rows / cols / aspect) — only the assembly's
// position. `offset` is the tunable handle (full x/y/z), default ~6 3 0: to the
// RIGHT of spawn (+x) and raised. Adjust live, e.g.:
//   document.getElementById('zone-b').setAttribute('zone-b-root','offset','8 4 0')
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-b-root", {
  schema: {
    offset: { type: "vec3", default: { x: 6, y: 3, z: 0 } },
  },
  update: function () {
    const o = this.data.offset;
    // Drive the position component (not object3D directly) so there is no
    // init-order race with it; one offset moves the whole wall.
    this.el.setAttribute("position", { x: o.x, y: o.y, z: o.z });
    // Broadcast so the wall's floor cues re-derive against the new offset — they
    // stay pinned to world floor regardless of the wall's y.
    this.el.emit("zonebrootchanged");
  },
});

// ----------------------------------------------------------------
// image-wall: builds a rows × cols grid of SEPARATE textured planes (not
// atlased — kept separate for now) from lottery-512/manifest.json.
//
// ORIENTATION — built FLAT in local space:
//   • planes face +z (a-image's default facing),
//   • columns lay out along local +x (left → right),
//   • rows lay out along local +y (bottom → top),
//   • the grid is centred on the local origin.
// The parent container's `0 -90 0` rotation then turns this flat grid to face
// -x, back toward the spawn point. Net: turn right (face +x) and the wall is
// directly ahead, its width spanning across the view.
//
// TUNABLES (all adjustable by eye via setAttribute — no code edits):
//   width  — total wall width in metres. 0 = AUTO: 4 × Zone A's ring radius
//            (≈ double Zone A's overall diameter). Wall height derives from
//            width via the grid + tile aspect.
//   gap    — inter-tile spacing as a fraction of cell size (same absolute gap
//            in x and y, so spacing reads evenly). Start small.
//   rows / cols — grid dimensions, default 10 / 10.
//   aspect — tile width:height, default 1.333 (4:3).
// ----------------------------------------------------------------
AFRAME.registerComponent("image-wall", {
  schema: {
    width: { type: "number", default: 0 }, // 0 = auto (4 × Zone A ring radius)
    gap: { type: "number", default: 0.04 }, // fraction of cell size
    rows: { type: "int", default: 10 },
    cols: { type: "int", default: 10 },
    aspect: { type: "number", default: 1.333 }, // tile w:h (4:3)
    manifest: { type: "string", default: "lottery-512/manifest.json" },
    basePath: { type: "string", default: "lottery-512/" }, // prefix for tile URLs
  },

  init: function () {
    this.tiles = []; // a-image elements this component created
    this.names = null; // manifest filenames, once fetched

    // Fetch the manifest once, then build. update() re-lays-out on later prop
    // tweaks (it no-ops until this resolves).
    fetch(this.data.manifest)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((list) => {
        this.names = Array.isArray(list) ? list : [];
        this.build();
      })
      .catch((err) => {
        console.error(
          "image-wall: failed to load manifest",
          this.data.manifest,
          err
        );
      });
  },

  // Re-layout on any live tunable change (width/gap/rows/cols/aspect). No-op
  // until the manifest has arrived (the first update() runs before the fetch).
  update: function () {
    if (this.names) this.build();
  },

  // width=0 means AUTO: read Zone A's ring radius from its own source of truth
  // (zoneARingPlacements() in components.js) and use 4× it — double Zone A's
  // overall diameter. Falls back to a fixed default if that can't be read.
  resolveWidth: function () {
    if (this.data.width > 0) return this.data.width;
    if (typeof zoneARingPlacements === "function") {
      const p = zoneARingPlacements();
      if (p && p.length) {
        const w = 4 * p[0].radius;
        console.log(
          `image-wall: width AUTO = 4 × Zone A radius (${p[0].radius.toFixed(
            2
          )} m) = ${w.toFixed(2)} m`
        );
        return w;
      }
    }
    console.warn(
      "image-wall: could not read Zone A ring radius; FALLBACK width = 15 m"
    );
    return 15;
  },

  build: function () {
    // Clear tiles from any previous build (supports live re-layout).
    this.tiles.forEach((t) => t.parentNode && t.parentNode.removeChild(t));
    this.tiles = [];

    const d = this.data;
    const rows = d.rows;
    const cols = d.cols;
    const slots = rows * cols;
    const width = this.resolveWidth();

    // Cell / tile geometry. `gap` is a fraction of the horizontal cell; the
    // same ABSOLUTE gap is reused vertically so spacing reads evenly while the
    // tiles keep their 4:3 aspect. Height derives from all of this.
    const cellW = width / cols;
    const gapAbs = d.gap * cellW;
    const tileW = cellW - gapAbs;
    const tileH = tileW / d.aspect;
    const cellH = tileH + gapAbs;
    const height = rows * cellH;

    const have = this.names.length;
    const n = Math.min(have, slots);
    if (have < slots) {
      console.warn(
        `image-wall: manifest has ${have} image(s) for a ${rows}×${cols} (${slots}) grid; ` +
          `filling ${n}, leaving ${slots - have} slot(s) empty.`
      );
    }

    // Bottom-row (row 0) LOCAL positions, exposed for wall-contact-cue: it reads
    // these to drop one floor cue under each bottom tile. Rebuilt every build so
    // the cue count/positions follow the current grid (never hardcoded).
    this.bottomLocals = [];

    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols); // row 0 = BOTTOM
      // Centred on the local origin: columns along +x, rows along +y.
      const x = -width / 2 + cellW * (col + 0.5);
      const y = -height / 2 + cellH * (row + 0.5);

      if (row === 0) this.bottomLocals.push(new THREE.Vector3(x, y, 0));

      // Filenames carry spaces/parens; encode so the texture URL is valid.
      const url = d.basePath + encodeURIComponent(this.names[i]);
      const img = document.createElement("a-image");
      img.setAttribute("src", url); // plain URL, not an asset id
      img.setAttribute("position", `${x} ${y} 0`);
      img.setAttribute("width", tileW);
      img.setAttribute("height", tileH); // width/height set separately -> no squash
      this.el.appendChild(img);
      this.tiles.push(img);
    }

    console.log(
      `image-wall: built ${n} tile(s), ${rows}×${cols} grid — ` +
        `${width.toFixed(2)} m wide × ${height.toFixed(2)} m tall, ` +
        `tile ${tileW.toFixed(2)}×${tileH.toFixed(2)} m, gap ${gapAbs.toFixed(3)} m.`
    );

    // Tell Zone B's contact cues the wall (re)built, so their count + positions
    // follow the current grid without hardcoding cols or wall height.
    this.el.emit("imagewallbuilt", { cols: cols, rows: rows });
  },

  remove: function () {
    this.tiles.forEach((t) => t.parentNode && t.parentNode.removeChild(t));
    this.tiles = [];
  },
});

// ----------------------------------------------------------------
// wall-contact-cue — floor contact cues under the Zone B wall's BOTTOM ROW.
//
// Mirrors Zone A's ring-contact-cue and REUSES its machinery via the shared
// ContactCue kit (js/components.js): the SAME runtime radial-gradient texture,
// the SAME shadow/glow material, and the SAME per-environment retuning. Only the
// PLACEMENT differs — one flat quad per bottom-row tile, dropped to the floor
// beneath it.
//
// Ownership / lifecycle:
//  - Lives under #zone-b (NOT #environment), so its geometry PERSISTS across
//    environment switches; on a switch only the shared material retunes (no
//    teardown/rebuild).
//  - Count + positions are DERIVED from the wall's ACTUAL grid at (re)build time
//    (image-wall's bottomLocals), so the cue count follows `cols` automatically
//    and nothing bakes in the wall height.
//  - Each cue is pinned to WORLD floor (y = yoffset) regardless of the wall's
//    offset y: it takes each bottom tile's world position and drops it to the
//    floor, then maps that into this entity's local frame.
//  - Presets with no ground profile fall back to the dark "shadow" default.
//
// Tunables (eyeball live via setAttribute / inspector), same as Zone A:
//   radius / opacity / softness / yoffset  (+ color / mode fallbacks).
// ----------------------------------------------------------------
AFRAME.registerComponent("wall-contact-cue", {
  schema: {
    wall: { type: "selector" }, // the image-wall entity (bottom-row source)
    radius: { type: "number", default: 0.7 }, // cue radius (m); ~half a tile
    opacity: { type: "number", default: 0.3 }, // base opacity; profile may override
    softness: { type: "number", default: 0.55 }, // gradient falloff 0 (hard)..1 (soft)
    yoffset: { type: "number", default: 0.02 }, // metres above the floor (world y)
    color: { type: "color", default: "#000000" }, // tint; profile may override
    mode: { type: "string", default: "shadow" }, // "shadow" | "glow"
  },

  init: function () {
    this.meshes = [];
    this.geometry = null;
    this.curProfile = null;

    this.group = new THREE.Group();
    this.el.setObject3D("cue", this.group);

    // Shared texture + material (identical to Zone A's ring cues).
    this.texture = ContactCue.makeTexture(this.data.softness);
    this.material = ContactCue.makeMaterial(this.data, this.texture);
    this.buildGeometry();

    // Resolve the wall entity: explicit `wall` selector, else the sibling that
    // carries image-wall.
    this.wallEl =
      this.data.wall ||
      (this.el.parentNode && this.el.parentNode.querySelector("[image-wall]"));

    // Re-derive count + positions whenever the wall (re)builds or the whole
    // Zone B assembly moves (offset change).
    this.onWallBuilt = () => this.layout();
    if (this.wallEl) {
      this.wallEl.addEventListener("imagewallbuilt", this.onWallBuilt);
    }
    this.onMoved = () => this.layout();
    if (this.el.parentNode) {
      this.el.parentNode.addEventListener("zonebrootchanged", this.onMoved);
    }

    // Retune with the environment (same contract as ring-contact-cue): adopt the
    // already-active profile now, and follow every later switch.
    this.onEnvChange = (e) => {
      this.curProfile = (e.detail && e.detail.profile) || null;
      ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
    this.curProfile = ContactCue.currentProfile();
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);

    // Lay out now in case the wall is already built (e.g. component re-init).
    this.layout();
  },

  update: function (oldData) {
    if (Object.keys(oldData).length === 0) return; // first update: init did it
    const d = this.data;
    if (oldData.softness !== d.softness) {
      const old = this.texture;
      this.texture = ContactCue.makeTexture(d.softness);
      this.material.map = this.texture;
      this.material.needsUpdate = true;
      if (old) old.dispose();
    }
    if (oldData.radius !== d.radius) this.buildGeometry();
    // radius/yoffset affect placement; re-layout to reflect them.
    if (oldData.radius !== d.radius || oldData.yoffset !== d.yoffset) {
      this.layout();
    }
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
  },

  // One shared plane geometry across all cue meshes; rebuilt on radius change.
  buildGeometry: function () {
    if (this.geometry) this.geometry.dispose();
    const s = this.data.radius * 2; // plane spans the cue diameter
    this.geometry = new THREE.PlaneGeometry(s, s);
    this.meshes.forEach((m) => {
      m.geometry = this.geometry;
    });
  },

  // Grow/shrink the mesh pool to exactly `n` (one per bottom-row tile).
  ensureMeshCount: function (n) {
    while (this.meshes.length < n) {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.rotation.x = -Math.PI / 2; // lie flat, facing up
      this.group.add(m);
      this.meshes.push(m);
    }
    while (this.meshes.length > n) {
      this.group.remove(this.meshes.pop());
    }
  },

  // Place one cue on the world floor directly under each bottom-row tile.
  layout: function () {
    const wall =
      this.wallEl &&
      this.wallEl.components &&
      this.wallEl.components["image-wall"];
    if (!wall || !wall.bottomLocals || !wall.bottomLocals.length) return;

    const locals = wall.bottomLocals; // bottom-row positions, in wall-local space
    const container = this.wallEl.object3D; // carries the 0 -90 0 rotation + offset
    container.updateWorldMatrix(true, false);
    this.el.object3D.updateWorldMatrix(true, false);

    this.ensureMeshCount(locals.length);

    const v = new THREE.Vector3();
    for (let i = 0; i < locals.length; i++) {
      v.copy(locals[i]);
      container.localToWorld(v); // -> the bottom tile's WORLD position
      v.y = this.data.yoffset; // drop to the floor (world y), + tiny anti-z-fight lift
      this.el.object3D.worldToLocal(v); // -> this cue group's local frame
      this.meshes[i].position.copy(v);
    }
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("environmentchanged", this.onEnvChange);
    if (this.wallEl) {
      this.wallEl.removeEventListener("imagewallbuilt", this.onWallBuilt);
    }
    if (this.el.parentNode) {
      this.el.parentNode.removeEventListener("zonebrootchanged", this.onMoved);
    }
    this.el.removeObject3D("cue");
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  },
});
