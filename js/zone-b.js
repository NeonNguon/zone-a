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
//   shuffle — randomize the wall's image order per load (default false = today's
//            manifest order). The floor map is unaffected: it picks images BY
//            FILE ID (dataset.file), not by wall grid index.
//   shuffleSeed — 0 = fresh random each load; >0 = seeded, reproducible order
//            (a small deterministic PRNG, not Math.random). Debug aid; optional.
// ----------------------------------------------------------------

// Small deterministic PRNG (mulberry32) for seeded, reproducible shuffles.
// Only used when shuffleSeed > 0; the default (seed 0) path uses Math.random.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

AFRAME.registerComponent("image-wall", {
  schema: {
    width: { type: "number", default: 0 }, // 0 = auto (4 × Zone A ring radius)
    gap: { type: "number", default: 0.04 }, // fraction of cell size
    rows: { type: "int", default: 10 },
    cols: { type: "int", default: 10 },
    aspect: { type: "number", default: 1.333 }, // tile w:h (4:3)
    manifest: { type: "string", default: "web4map-512/manifest.json" },
    basePath: { type: "string", default: "web4map-512/" }, // prefix for tile URLs
    shuffle: { type: "boolean", default: false }, // randomize order per load
    shuffleSeed: { type: "number", default: 0 }, // 0 = fresh random; >0 = seeded
  },

  init: function () {
    this.tiles = []; // a-image elements this component created
    this.entries = null; // manifest entries { file, title }, in MANIFEST order
    this.displayEntries = null; // the order build() lays out from (maybe shuffled)

    // Fetch the manifest once, then build. update() re-lays-out on later prop
    // tweaks (it no-ops until this resolves). The manifest is an array of
    // objects { file, title }; a bare string is tolerated as a file with no
    // title (older manifest shape).
    fetch(this.data.manifest)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((list) => {
        this.entries = (Array.isArray(list) ? list : []).map((e) =>
          typeof e === "string" ? { file: e, title: "" } : e
        );
        // Decide the display order ONCE, right after the fetch resolves (before
        // the first build). build() never re-shuffles, so live tunable tweaks
        // (width/gap/…) keep the same order — only a `shuffle`/`shuffleSeed`
        // change via setAttribute re-rolls it (see update()).
        this.applyOrder();
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

  // Set this.displayEntries — the order build() lays out from. shuffle:false
  // keeps the manifest order verbatim; shuffle:true Fisher–Yates-shuffles a COPY
  // so this.entries (the by-index truth) is left intact. shuffleSeed 0 = fresh
  // random each load; >0 = a seeded, reproducible order (deterministic PRNG).
  applyOrder: function () {
    if (!this.entries) return;
    const order = this.entries.slice();
    if (this.data.shuffle) {
      const rng =
        this.data.shuffleSeed > 0 ? mulberry32(this.data.shuffleSeed) : Math.random;
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = order[i];
        order[i] = order[j];
        order[j] = tmp;
      }
      console.log(
        `image-wall: shuffled ${order.length} tile(s)` +
          (this.data.shuffleSeed > 0
            ? ` (seed ${this.data.shuffleSeed}, reproducible).`
            : " (fresh random this load).")
      );
    }
    this.displayEntries = order;
  },

  // Re-layout on any live tunable change (width/gap/rows/cols/aspect). No-op
  // until the manifest has arrived (the first update() runs before the fetch).
  // A `shuffle`/`shuffleSeed` change re-rolls the display order; other tweaks
  // keep it, so eyeballing the grid never reorders the wall.
  update: function (oldData) {
    if (!this.entries) return;
    if (
      oldData &&
      (oldData.shuffle !== this.data.shuffle ||
        oldData.shuffleSeed !== this.data.shuffleSeed)
    ) {
      this.applyOrder();
    }
    this.build();
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

    // Expose the computed tile geometry for other Zone B furniture: the
    // triptych (zone-b-triptych.js) sizes its images from these, so the wall
    // stays the single source of truth for per-image dimensions.
    this.tileW = tileW;
    this.tileH = tileH;
    this.wallHeight = height;

    // Lay out from the display order (shuffled or not), decided once in
    // applyOrder(); falls back to manifest order if applyOrder never ran.
    const entries = this.displayEntries || this.entries;
    const have = entries.length;
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

      // Each manifest entry is { file, title }. Use `file` for the texture URL
      // (encoded so any special chars are valid) and CARRY `title` on the tile
      // (data-title) so focus mode can read it later — not used for display now.
      const entry = entries[i];
      const url = d.basePath + encodeURIComponent(entry.file);
      const img = document.createElement("a-image");
      img.setAttribute("src", url); // plain URL, not an asset id
      img.setAttribute("position", `${x} ${y} 0`);
      img.setAttribute("width", tileW);
      img.setAttribute("height", tileH); // width/height set separately -> no squash
      img.setAttribute("data-title", entry.title || ""); // carried for focus mode
      img.dataset.file = entry.file; // also carry the source filename
      img.setAttribute("class", "clickable"); // raycaster-targetable (focus mode)
      img.setAttribute("wall-tile-hover", ""); // black frame on hover
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
// wall-tile-hover — a black frame that appears around a wall tile while the
// mouse cursor or a controller laser hovers it (same idea as Zone A's
// image-hover). It's a slightly-larger black plane sitting just behind the
// tile, revealed on `mouseenter` and hidden on `mouseleave` — both events are
// fired identically by the desktop/mobile cursor and the VR lasers.
// ----------------------------------------------------------------
AFRAME.registerComponent("wall-tile-hover", {
  init: function () {
    const w = parseFloat(this.el.getAttribute("width")) || 1;
    const h = parseFloat(this.el.getAttribute("height")) || 1;
    // Black plane a touch larger than the tile, just behind it -> reads as a
    // thin frame around the tile's edges. Unlit (flat) so it stays pure black;
    // not clickable, so it never intercepts the raycaster.
    const border = document.createElement("a-plane");
    border.setAttribute("width", w + 0.06);
    border.setAttribute("height", h + 0.06);
    border.setAttribute("position", "0 0 -0.01");
    border.setAttribute("material", "color: #000000; shader: flat");
    border.setAttribute("visible", false);
    this.el.appendChild(border);
    this.border = border;

    // On hover: reveal the frame and give the tile a subtle pop (like Zone A's
    // image-hover). The `data-focused` guard keeps this from stomping the focus
    // transform: while a tile is focused, wall-focus owns its scale, so hover
    // must not touch it.
    this.onEnter = () => {
      if (this.el.dataset.focused) return;
      border.setAttribute("visible", true);
      this.el.object3D.scale.set(1.05, 1.05, 1.05);
    };
    this.onLeave = () => {
      border.setAttribute("visible", false);
      if (this.el.dataset.focused) return;
      this.el.object3D.scale.set(1, 1, 1);
    };
    this.el.addEventListener("mouseenter", this.onEnter);
    this.el.addEventListener("mouseleave", this.onLeave);
  },
  remove: function () {
    this.el.removeEventListener("mouseenter", this.onEnter);
    this.el.removeEventListener("mouseleave", this.onLeave);
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

// ----------------------------------------------------------------
// wall-focus — click/select a wall tile to bring it forward to a readable spot
// in front of the camera (title + year shown, rest dimmed); select again (or
// click the dimmed space) to send it back to its exact grid slot.
//
// Works on desktop mouse, mobile tap and Quest 3 controller identically: it
// relies ENTIRELY on the scene's existing raycasters (cursor rayOrigin:mouse +
// the two laser-controls), which all fire the same `click` on `.clickable`.
// The tiles are made `.clickable` by image-wall; this one listener catches
// their bubbled clicks (it lives on the wall entity, the tiles' DOM parent).
//
// Two presentations, forked on session type (like Zone A):
//  - VR (in-world): the ACTUAL tile mesh animates from its slot to a spot in
//    front of the camera and back — its home transform is captured and restored
//    exactly (no drift). A camera-child dark sphere dims the rest; an a-text
//    card shows title + year. Dismiss = select the tile again or the dimmed space.
//  - WEB (desktop/mobile): Zone A's blurred-overlay aesthetic — a Helvetica
//    HTML overlay (blur backdrop, title + year) whose picture FLIES in (FLIP)
//    from the tile's on-screen position to centre, keeping the fly-in motion.
//    Dismiss = click the blurred backdrop or press Esc.
//
// Only one tile focuses at a time; a click while focused simply dismisses
// (the dim sphere / overlay occludes the wall — you can't jump to another).
//
// Tunables (new — do not affect the grid/cue/loader tunables):
//   distance  — metres in front of the camera (world-space, FOV-independent).
//   height    — focused tile's world height in metres (readable size).
//   dimRadius / dimOpacity — the dark sphere.
//   dur       — animation duration (ms).
//   nav       — enable stepping through the whole set from within the focus
//               view (default true). Navigation order = the wall's current
//               DISPLAY order (so it follows FEATURE 1's shuffle); wraps at both
//               ends. Derived from the focused tile's `.clickable` siblings, so
//               the triptych's own wall-focus cycles only its three images.
//   navBtnOffset — gap (m) between the focused picture's edge and the VR
//               "press A / press X" instruction labels beside it.
//   navTextWidth — those labels' text size (a-text width, m).
// ----------------------------------------------------------------
AFRAME.registerComponent("wall-focus", {
  schema: {
    distance: { type: "number", default: 1.8 },
    height: { type: "number", default: 1.4 },
    dimRadius: { type: "number", default: 4 },
    dimOpacity: { type: "number", default: 0.6 },
    dur: { type: "number", default: 450 }, // ms
    nav: { type: "boolean", default: true }, // step through the set in-focus
    navBtnOffset: { type: "number", default: 0.55 }, // gap from picture edge (m)
    navTextWidth: { type: "number", default: 1.8 }, // "press A/X" label text size (m)
  },

  init: function () {
    this.cameraEl = document.getElementById("camera");
    this.focused = null; // the tile element currently focused
    this.mode = null; // 'vr' (in-world) | 'web' (HTML overlay)
    this.busy = false; // a web fly transition is running
    this.home = null; // captured LOCAL transform { pos, quat, scale } (VR)
    this.anim = null; // active VR tween, or null
    this.dimEl = null; // camera-child dark sphere (VR)
    this.uiEl = null; // world-anchored title/year label (VR)
    this.titleTextEl = null; // the VR label's title a-text (updated on step)

    // FEATURE 2 nav state. navTiles = the focusable `.clickable` siblings in DOM
    // (display) order; navIndex = which one is currently shown. originTile and
    // its captured src/title are what dismiss always returns to (deliberately
    // NOT the last-viewed slot).
    this.navTiles = null;
    this.navIndex = -1;
    this.originTile = null;
    this.vrOriginSrc = null; // flown tile's home texture URL (VR restore)
    this.navEl = null; // world-anchored VR arrow-button container

    // Web (desktop/mobile) focus reuses Zone A's blurred-overlay aesthetic:
    // a Helvetica HTML overlay whose image FLIES in from the tile's screen
    // position. Refs to that overlay (in index.html).
    this.overlay = document.getElementById("zoneb-focus");
    this.imgEl = document.getElementById("zoneb-focus-img");
    this.titleEl = document.getElementById("zoneb-focus-title");
    this.yearEl = document.getElementById("zoneb-focus-year");
    this.countEl = document.getElementById("zoneb-focus-count"); // "12 / 100"
    this.webPrevBtn = document.getElementById("zoneb-focus-prev");
    this.webNextBtn = document.getElementById("zoneb-focus-next");
    this.webOriginSrc = null; // overlay img's home src (web restore)
    this.webOriginTitle = null; // overlay title's home text (web restore)

    // Tiles are DOM children of this entity, so their bubbled `click` lands
    // here — one delegated listener for every platform's raycaster.
    this.onClick = this.onClick.bind(this);
    this.el.addEventListener("click", this.onClick);
    this.onDimClick = () => {
      if (!this.anim && this.focused && this.mode === "vr") this.dismissVR();
    };

    // Web dismiss: click the blurred backdrop (empty space) or press Esc.
    if (this.overlay) {
      this.onOverlayClick = (e) => {
        if (e.target === this.overlay && this.focused && this.mode === "web" && !this.busy) {
          this.dismissWeb();
        }
      };
      this.overlay.addEventListener("click", this.onOverlayClick);
    }
    this.onKey = (e) => {
      if (!this.focused || this.mode !== "web") return;
      if (e.key === "Escape" && !this.busy) {
        this.dismissWeb();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.prev(); // busy-guarded inside step()
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.next();
      }
    };
    window.addEventListener("keydown", this.onKey);

    // Web arrow buttons live in the shared #zoneb-focus overlay (index.html).
    // Both wall-focus instances (wall + triptych) bind these, but the guard
    // (focused && web) means only the active one acts; map-focus never turns the
    // arrows on (they are gated by the .nav-on class), so its reveals stay clean.
    this.onWebPrev = (e) => {
      e.stopPropagation(); // don't bubble to the overlay's dismiss handler
      this.prev();
    };
    this.onWebNext = (e) => {
      e.stopPropagation();
      this.next();
    };
    if (this.webPrevBtn) this.webPrevBtn.addEventListener("click", this.onWebPrev);
    if (this.webNextBtn) this.webNextBtn.addEventListener("click", this.onWebNext);

    // Quest convenience bindings (the on-screen VR arrows are the primary,
    // discoverable control): left controller X = prev, right controller A = next
    // (B is taken by env-cycle). Bound only while a VR focus is open.
    this.leftHand = document.getElementById("leftHand");
    this.rightHand = document.getElementById("rightHand");
    this.onCtrlPrev = () => {
      if (this.focused && this.mode === "vr") this.prev();
    };
    this.onCtrlNext = () => {
      if (this.focused && this.mode === "vr") this.next();
    };
  },

  // ================= FEATURE 2: step through the set in-focus =================
  // Snapshot the focusable siblings (this entity's `.clickable` children, in DOM
  // = display order) and set navIndex to the clicked tile. For the wall these are
  // the 100 shuffled tiles; for the triptych's own wall-focus, only its 3 images.
  captureNav: function (tile) {
    if (this.data.nav) {
      this.navTiles = Array.prototype.slice
        .call(this.el.children)
        .filter((c) => c.classList && c.classList.contains("clickable"));
    } else {
      this.navTiles = [tile];
    }
    this.navIndex = this.navTiles.indexOf(tile);
    if (this.navIndex < 0) {
      this.navTiles = [tile];
      this.navIndex = 0;
    }
    this.originTile = tile;
  },

  next: function () {
    this.step(1);
  },
  prev: function () {
    this.step(-1);
  },

  // Advance navIndex (wrapping) and swap the DISPLAYED image/title IN PLACE — no
  // physical re-fly. Guarded against mid-transition (VR anim or web busy).
  step: function (dir) {
    if (!this.data.nav || this.anim || this.busy) return;
    if (!this.navTiles || this.navTiles.length < 2) return;
    const n = this.navTiles.length;
    this.navIndex = (this.navIndex + dir + n) % n;
    const target = this.navTiles[this.navIndex];
    if (this.mode === "vr") this.showVR(target);
    else this.showWeb(target);
  },

  // Human-readable "12 / 100" for the current step (1-based).
  updateCount: function () {
    if (this.countEl && this.navTiles) {
      this.countEl.textContent = `${this.navIndex + 1} / ${this.navTiles.length}`;
    }
  },

  onClick: function (e) {
    if (this.anim || this.busy) return; // ignore clicks mid-transition
    const tile = e.target;
    if (!tile || tile === this.el || !tile.classList) return;
    if (!tile.classList.contains("clickable")) return;
    if (this.focused) {
      // While focused: web dismiss is handled by the overlay/Esc (its overlay
      // intercepts canvas clicks); only the VR path reaches here.
      if (this.mode === "vr") this.dismissVR();
      return;
    }
    tile.emit("mouseleave"); // clear its hover frame + pop before it moves/lifts
    tile.dataset.focused = "1"; // hover now yields the tile's scale to focus
    this.captureNav(tile); // snapshot the paging list + origin before focusing
    if (this.el.sceneEl.is("vr-mode")) {
      this.mode = "vr";
      this.focusVR(tile);
    } else {
      this.mode = "web";
      this.focusWeb(tile);
    }
  },

  // ================= VR (in-world) path =================
  focusVR: function (tile) {
    const obj = tile.object3D;
    const parent = obj.parent; // the wall container (constant during focus)

    // Capture the exact home LOCAL transform to restore on dismiss (no drift).
    this.home = {
      pos: obj.position.clone(),
      quat: obj.quaternion.clone(),
      scale: obj.scale.clone(),
    };

    // Anchor a world spot `distance` m in front of the camera at eye height,
    // facing the camera (computed once, like Zone A's VR focus — not head-locked).
    const cam = this.cameraEl.object3D;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camQuat = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    fwd.y = 0;
    fwd.normalize();
    const focusPos = camPos.clone().addScaledVector(fwd, this.data.distance);
    focusPos.y = camPos.y; // eye level
    // The tile's +Z (its visible face) should point back at the camera.
    const dir = camPos.clone().sub(focusPos).normalize();
    const faceQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );

    // Convert the world target into the tile's LOCAL frame (parent is fixed).
    const toPos = parent.worldToLocal(focusPos.clone());
    const pQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    const toQuat = pQuat.clone().invert().multiply(faceQuat);
    const pScale = parent.getWorldScale(new THREE.Vector3());
    const hAttr = parseFloat(tile.getAttribute("height")) || 0.7;
    const tileWAttr = parseFloat(tile.getAttribute("width")) || 1; // for arrow placement
    const k = this.data.height / hAttr / (pScale.y || 1); // world height -> local scale
    const toScale = new THREE.Vector3(k, k, k);

    // Remember the flown tile's home texture so dismiss restores it (paging may
    // have swapped it to another image on the SAME mesh).
    this.vrOriginSrc = tile.getAttribute("src");

    this.buildDim();
    this.buildLabel(tile.getAttribute("data-title") || "", focusPos, faceQuat);
    // World-anchored arrow buttons beside the picture; picture half-width in
    // world metres = focused height × the tile's aspect / 2.
    const picHalfW = (this.data.height * (hAttr ? tileWAttr / hAttr : 1)) / 2;
    this.buildNavButtons(focusPos, faceQuat, picHalfW);
    // Quest convenience: X (prev) / A (next) while this VR focus is open.
    if (this.leftHand) this.leftHand.addEventListener("xbuttondown", this.onCtrlPrev);
    if (this.rightHand) this.rightHand.addEventListener("abuttondown", this.onCtrlNext);

    this.focused = tile;
    this.startAnim(obj, toPos, toQuat, toScale, null);
  },

  // Swap the flown tile's texture + label to `target` IN PLACE (no re-fly).
  showVR: function (target) {
    const tile = this.focused;
    if (!tile) return;
    tile.setAttribute("src", target.getAttribute("src"));
    if (this.titleTextEl) {
      this.titleTextEl.setAttribute("text", "value", target.getAttribute("data-title") || "");
    }
    this.preloadNeighbours(); // warm the next/prev textures to hide the load pop
  },

  // Best-effort decode of the neighbouring tiles' textures so a step doesn't pop.
  preloadNeighbours: function () {
    if (!this.navTiles || this.navTiles.length < 2) return;
    const n = this.navTiles.length;
    [this.navIndex + 1, this.navIndex - 1].forEach((k) => {
      const t = this.navTiles[((k % n) + n) % n];
      const src = t && t.getAttribute("src");
      if (src) {
        const im = new Image();
        im.src = src;
      }
    });
  },

  dismissVR: function () {
    const tile = this.focused;
    if (!tile) return;
    const obj = tile.object3D;
    const home = this.home;

    // Restore the flown tile's HOME texture before it flies back, so paging
    // never leaves a wrong image on the grid slot.
    if (this.vrOriginSrc != null) tile.setAttribute("src", this.vrOriginSrc);

    // Un-dim immediately; the tile flies back into the lit grid.
    this.teardownDim();
    this.teardownLabel();
    this.teardownNavButtons();
    if (this.leftHand) this.leftHand.removeEventListener("xbuttondown", this.onCtrlPrev);
    if (this.rightHand) this.rightHand.removeEventListener("abuttondown", this.onCtrlNext);
    if (this.cameraEl) {
      this.cameraEl.setAttribute("look-controls", "enabled", true);
    }

    this.startAnim(obj, home.pos, home.quat, home.scale, () => {
      // Snap to the captured home exactly (kills any interpolation residue).
      obj.position.copy(home.pos);
      obj.quaternion.copy(home.quat);
      obj.scale.copy(home.scale);
      delete tile.dataset.focused; // hover may own the tile's scale again
      this.focused = null;
      this.home = null;
      this.navTiles = null;
      this.navIndex = -1;
      this.originTile = null;
      this.vrOriginSrc = null;
      this.refreshRaycasters();
    });
  },

  // --- easing tween over the tile's own object3D (pos/quat/scale) ----------
  startAnim: function (obj, toPos, toQuat, toScale, onComplete) {
    this.anim = {
      obj: obj,
      fromPos: obj.position.clone(),
      toPos: toPos.clone(),
      fromQuat: obj.quaternion.clone(),
      toQuat: toQuat.clone(),
      fromScale: obj.scale.clone(),
      toScale: toScale.clone(),
      t: 0,
      dur: Math.max(0.001, this.data.dur / 1000),
      onComplete: onComplete,
    };
  },

  tick: function (time, dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt / 1000;
    let u = a.t / a.dur;
    if (u > 1) u = 1;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // easeInOutQuad
    a.obj.position.lerpVectors(a.fromPos, a.toPos, e);
    a.obj.quaternion.copy(a.fromQuat).slerp(a.toQuat, e);
    a.obj.scale.lerpVectors(a.fromScale, a.toScale, e);
    if (u >= 1) {
      a.obj.position.copy(a.toPos);
      a.obj.quaternion.copy(a.toQuat);
      a.obj.scale.copy(a.toScale);
      const done = a.onComplete;
      this.anim = null;
      if (done) done();
    }
  },

  // --- dim sphere (camera child): darkens everything past its radius -------
  buildDim: function () {
    const s = document.createElement("a-sphere");
    s.setAttribute("radius", this.data.dimRadius);
    s.setAttribute(
      "material",
      `color: #000000; opacity: ${this.data.dimOpacity}; shader: flat; transparent: true; fog: false; side: back`
    );
    s.setAttribute("class", "clickable"); // click empty space -> dismiss
    this.cameraEl.appendChild(s);
    s.addEventListener("click", this.onDimClick);
    this.dimEl = s;
    requestAnimationFrame(() => this.refreshRaycasters());
  },

  teardownDim: function () {
    if (this.dimEl) {
      this.dimEl.removeEventListener("click", this.onDimClick);
      if (this.dimEl.parentNode) this.dimEl.parentNode.removeChild(this.dimEl);
      this.dimEl = null;
    }
  },

  // --- world-anchored title + year label below the focused tile ------------
  buildLabel: function (title, focusPos, faceQuat) {
    const ui = document.createElement("a-entity");
    ui.setAttribute("position", `${focusPos.x} ${focusPos.y} ${focusPos.z}`);
    const eu = new THREE.Euler().setFromQuaternion(faceQuat, "YXZ");
    ui.setAttribute(
      "rotation",
      `${THREE.MathUtils.radToDeg(eu.x)} ${THREE.MathUtils.radToDeg(
        eu.y
      )} ${THREE.MathUtils.radToDeg(eu.z)}`
    );

    const halfH = this.data.height / 2;
    // A small dark card behind the text so it stays legible over any
    // environment — sized to wrap the two text lines with a little leeway
    // (narrower than the picture, not wider).
    const back = document.createElement("a-plane");
    back.setAttribute("width", 1.1);
    back.setAttribute("height", 0.46);
    back.setAttribute("position", `0 ${-(halfH + 0.37)} 0`);
    back.setAttribute(
      "material",
      "color: #000000; opacity: 0.55; shader: flat; transparent: true; fog: false"
    );
    ui.appendChild(back);

    // Title (white, prominent) + year (grey), matching Zone A's VR label.
    const titleEl = this.makeText(title, { width: 2.2, color: "#ffffff" });
    titleEl.setAttribute("position", `0 ${-(halfH + 0.26)} 0.02`);
    ui.appendChild(titleEl);
    this.titleTextEl = titleEl; // updated in place when paging (showVR)

    const yearEl = this.makeText("2026", { width: 1.6, color: "#c8c8c8" });
    yearEl.setAttribute("position", `0 ${-(halfH + 0.5)} 0.02`);
    ui.appendChild(yearEl);

    this.el.sceneEl.appendChild(ui);
    this.uiEl = ui;
  },

  teardownLabel: function () {
    if (this.uiEl && this.uiEl.parentNode) {
      this.uiEl.parentNode.removeChild(this.uiEl);
    }
    this.uiEl = null;
    this.titleTextEl = null;
  },

  // --- world-anchored VR instruction labels (prev / next) -------------------
  // Two INSTRUCTIONAL text labels flanking the focused picture — "Press A /
  // Next image" (right) and "Press X / Previous image" (left). They are NOT
  // clickable: in VR the triangle clicks never fired, so paging is driven purely
  // by the Quest controller buttons (A = next on the RIGHT controller, X = prev
  // on the LEFT), bound in focusVR and matching the sides these labels sit on.
  // World-anchored at the focus spot with the same facing as the title label,
  // and torn down with the focus.
  buildNavButtons: function (focusPos, faceQuat, picHalfW) {
    if (!this.data.nav || !this.navTiles || this.navTiles.length < 2) return;
    const cont = document.createElement("a-entity");
    cont.setAttribute("position", `${focusPos.x} ${focusPos.y} ${focusPos.z}`);
    const eu = new THREE.Euler().setFromQuaternion(faceQuat, "YXZ");
    cont.setAttribute(
      "rotation",
      `${THREE.MathUtils.radToDeg(eu.x)} ${THREE.MathUtils.radToDeg(
        eu.y
      )} ${THREE.MathUtils.radToDeg(eu.z)}`
    );

    // Same placement the arrow buttons used: picture half-width + the tunable
    // gap. A is on the RIGHT controller -> "next" on the RIGHT of the picture;
    // X is on the LEFT controller -> "previous" on the LEFT.
    const off = picHalfW + this.data.navBtnOffset;
    cont.appendChild(this.makeNavLabel(off, "Press A", "Next image"));
    cont.appendChild(this.makeNavLabel(-off, "Press X", "Previous image"));

    this.el.sceneEl.appendChild(cont);
    this.navEl = cont;
  },

  // One instruction label: two centred white text lines on a small dark backing
  // card (the same legible-over-any-background pattern as the title label). NOT
  // clickable — it only tells the visitor which controller button to press.
  makeNavLabel: function (x, line1, line2) {
    const w = this.data.navTextWidth;
    const card = document.createElement("a-entity");
    card.setAttribute("position", `${x} 0 0.02`);
    const back = document.createElement("a-plane");
    back.setAttribute("width", w * 0.62);
    back.setAttribute("height", w * 0.4);
    back.setAttribute(
      "material",
      "color: #000000; opacity: 0.55; shader: flat; transparent: true; fog: false; side: double"
    );
    card.appendChild(back);
    const txt = this.makeText(line1 + "\n" + line2, { width: w });
    txt.setAttribute("position", "0 0 0.01");
    card.appendChild(txt);
    return card;
  },

  teardownNavButtons: function () {
    if (this.navEl && this.navEl.parentNode) {
      this.navEl.parentNode.removeChild(this.navEl);
    }
    this.navEl = null;
  },

  makeText: function (value, opts) {
    const t = document.createElement("a-entity");
    t.setAttribute(
      "text",
      Object.assign(
        { value: value, align: "center", color: "#ffffff", width: 2 },
        opts || {}
      )
    );
    return t;
  },

  // Nudge the laser raycasters to rebuild their target lists after the dim
  // sphere is added/removed (mirrors Zone A's VR focus).
  refreshRaycasters: function () {
    ["rightHand", "leftHand"].forEach(function (id) {
      const el = document.getElementById(id);
      const rc = el && el.components && el.components.raycaster;
      if (rc) rc.refreshObjects();
    });
  },

  // ================= Web (HTML overlay) path =================
  // Zone A's blurred-overlay aesthetic (blur backdrop + Helvetica title/year),
  // with the tile's picture FLYING in from its on-screen position (FLIP) so the
  // motion from the earlier pass is kept. The 3D tile is left in place (blurred
  // behind); a sharp HTML <img> of the full-res original lifts off to centre.
  focusWeb: function (tile) {
    if (!this.overlay || !this.imgEl) {
      // No overlay wired — fall back to the in-world path so focus still works.
      this.mode = "vr";
      this.focusVR(tile);
      return;
    }
    this.focused = tile;
    this.busy = true;
    // Freeze mouse-look so the tile's screen rect stays valid for the return fly.
    if (this.cameraEl) this.cameraEl.setAttribute("look-controls", "enabled", false);

    const rect = this.tileScreenRect(tile);
    const file = tile.dataset.file || "";
    // Full-res original (browser colour-manages the embedded profile correctly).
    // A tile may carry its own complete URL (dataset.fullsrc — used by the
    // triptych, whose sources don't live in web4map/); the wall's tiles keep
    // the manifest-file convention.
    this.imgEl.style.opacity = "1"; // clear any residue from a prior cross-fade
    this.imgEl.src = this.tileWebSrc(tile);
    this.titleEl.textContent = tile.getAttribute("data-title") || "";
    this.yearEl.textContent = "2026"; // literal constant, not read from data
    // Remember the home image/title so dismiss restores them (paging swaps them).
    this.webOriginSrc = this.imgEl.src;
    this.webOriginTitle = this.titleEl.textContent;
    // Show the paging arrows + counter ONLY for wall-focus (map-focus reuses the
    // same overlay but never adds .nav-on, so its single-image reveals stay clean).
    if (this.data.nav && this.navTiles && this.navTiles.length > 1) {
      this.overlay.classList.add("nav-on");
      this.updateCount();
    } else {
      this.overlay.classList.remove("nav-on");
    }

    // Centred target size, keeping the tile's aspect, leaving room for the text.
    const ww = parseFloat(tile.getAttribute("width")) || 1.5;
    const hh = parseFloat(tile.getAttribute("height")) || 1;
    const aspect = ww / hh;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tH = Math.min(0.62 * vh, (0.72 * vw) / aspect);
    this.imgEl.style.width = tH * aspect + "px";
    this.imgEl.style.height = tH + "px";

    this.overlay.classList.add("visible");

    // FLIP: measure the centred target, then start from the tile's rect and
    // release the transform so it eases to centre.
    requestAnimationFrame(() => {
      const fin = this.imgEl.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - (fin.left + fin.width / 2);
      const dy = rect.top + rect.height / 2 - (fin.top + fin.height / 2);
      const sc = fin.width ? rect.width / fin.width : 1;
      this.imgEl.style.transition = "none";
      this.imgEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
      void this.imgEl.offsetWidth; // force reflow so the start state applies
      this.imgEl.style.transition = "transform 0.4s ease";
      this.imgEl.style.transform = "none";
      const done = () => {
        this.imgEl.removeEventListener("transitionend", done);
        this.busy = false;
      };
      this.imgEl.addEventListener("transitionend", done);
      setTimeout(() => {
        if (this.busy) {
          this.imgEl.removeEventListener("transitionend", done);
          this.busy = false;
        }
      }, 600);
    });
  },

  // A tile's full-res web URL: its own complete URL if it carries one (the
  // triptych's dataset.fullsrc), else the manifest-file convention under web4map/.
  tileWebSrc: function (tile) {
    const file = tile.dataset.file || "";
    return tile.dataset.fullsrc || (file ? "web4map/" + encodeURIComponent(file) : "");
  },

  // Swap the overlay image + title to `target` IN PLACE with a short cross-fade
  // (no fly between steps). Reuses `busy` so a step can't fire mid-transition.
  showWeb: function (target) {
    if (!this.imgEl) return;
    this.busy = true;
    this.updateCount();
    this.titleEl.textContent = target.getAttribute("data-title") || "";
    const src = this.tileWebSrc(target);
    this.imgEl.style.transition = "opacity 0.15s ease";
    this.imgEl.style.opacity = "0";
    const swap = () => {
      this.imgEl.src = src;
      // Fade back in once the new image is ready (or immediately if cached).
      const fadeIn = () => {
        this.imgEl.style.opacity = "1";
        this.busy = false;
      };
      if (this.imgEl.complete) fadeIn();
      else this.imgEl.addEventListener("load", fadeIn, { once: true });
      // Safety: never get stuck busy if load/transition never fires.
      setTimeout(() => {
        if (this.busy) {
          this.imgEl.style.opacity = "1";
          this.busy = false;
        }
      }, 500);
    };
    setTimeout(swap, 150); // let the fade-out play before the source swaps
  },

  dismissWeb: function () {
    const tile = this.focused;
    if (!tile) return;
    this.busy = true;
    // Restore the ORIGINALLY clicked image/title so the picture that flies back
    // matches the tile it lands on (paging may have swapped the displayed image).
    this.imgEl.style.transition = "none";
    this.imgEl.style.opacity = "1";
    if (this.webOriginSrc != null) this.imgEl.src = this.webOriginSrc;
    if (this.webOriginTitle != null) this.titleEl.textContent = this.webOriginTitle;
    this.overlay.classList.remove("nav-on");
    // Fly the picture back to the tile's on-screen rect, then hide the overlay.
    const rect = this.tileScreenRect(tile);
    const fin = this.imgEl.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - (fin.left + fin.width / 2);
    const dy = rect.top + rect.height / 2 - (fin.top + fin.height / 2);
    const sc = fin.width ? rect.width / fin.width : 1;
    this.imgEl.style.transition = "transform 0.4s ease";
    this.imgEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
    this.overlay.classList.remove("visible");
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      this.imgEl.removeEventListener("transitionend", done);
      this.imgEl.style.transition = "none";
      this.imgEl.style.transform = "none";
      if (this.cameraEl) this.cameraEl.setAttribute("look-controls", "enabled", true);
      if (tile) delete tile.dataset.focused;
      this.focused = null;
      this.mode = null;
      this.busy = false;
      this.navTiles = null;
      this.navIndex = -1;
      this.originTile = null;
      this.webOriginSrc = null;
      this.webOriginTitle = null;
    };
    this.imgEl.addEventListener("transitionend", done);
    setTimeout(done, 600); // safety if transitionend doesn't fire
  },

  // The tile's current on-screen rectangle (project its four corners with the
  // active camera) — the start/end of the web fly.
  tileScreenRect: function (tile) {
    const sceneEl = this.el.sceneEl;
    const cam = sceneEl.camera;
    const canvas = sceneEl.canvas || (sceneEl.renderer && sceneEl.renderer.domElement);
    const w = (canvas && canvas.clientWidth) || window.innerWidth;
    const h = (canvas && canvas.clientHeight) || window.innerHeight;
    const obj = tile.object3D;
    obj.updateWorldMatrix(true, false);
    const ww = parseFloat(tile.getAttribute("width")) || 1;
    const hh = parseFloat(tile.getAttribute("height")) || 1;
    const corners = [
      [-ww / 2, -hh / 2], [ww / 2, -hh / 2], [ww / 2, hh / 2], [-ww / 2, hh / 2],
    ];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    corners.forEach((c) => {
      v.set(c[0], c[1], 0).applyMatrix4(obj.matrixWorld).project(cam);
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
    });
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  },

  remove: function () {
    this.el.removeEventListener("click", this.onClick);
    window.removeEventListener("keydown", this.onKey);
    if (this.overlay && this.onOverlayClick) {
      this.overlay.removeEventListener("click", this.onOverlayClick);
    }
    if (this.webPrevBtn) this.webPrevBtn.removeEventListener("click", this.onWebPrev);
    if (this.webNextBtn) this.webNextBtn.removeEventListener("click", this.onWebNext);
    if (this.leftHand) this.leftHand.removeEventListener("xbuttondown", this.onCtrlPrev);
    if (this.rightHand) this.rightHand.removeEventListener("abuttondown", this.onCtrlNext);
    // If focused mid-teardown, restore state so the grid/overlay aren't broken.
    if (this.mode === "vr" && this.focused && this.home) {
      const obj = this.focused.object3D;
      if (this.vrOriginSrc != null) this.focused.setAttribute("src", this.vrOriginSrc);
      obj.position.copy(this.home.pos);
      obj.quaternion.copy(this.home.quat);
      obj.scale.copy(this.home.scale);
    }
    if (this.focused) delete this.focused.dataset.focused;
    if (this.overlay) this.overlay.classList.remove("visible", "nav-on");
    if (this.imgEl) {
      this.imgEl.style.transition = "none";
      this.imgEl.style.transform = "none";
      this.imgEl.style.opacity = "1";
    }
    this.teardownDim();
    this.teardownLabel();
    this.teardownNavButtons();
    if (this.cameraEl) this.cameraEl.setAttribute("look-controls", "enabled", true);
    this.focused = null;
    this.mode = null;
    this.busy = false;
    this.home = null;
    this.anim = null;
    this.navTiles = null;
    this.navIndex = -1;
    this.originTile = null;
    this.vrOriginSrc = null;
    this.webOriginSrc = null;
    this.webOriginTitle = null;
  },
});
