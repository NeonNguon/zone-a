// ================================================================
// Zone B — floor map: the "100 locations" dataset as a large walkable street
// map on the floor BEHIND the 100-image wall. A pale Saigon street map (CARTO
// Positron, baked OFFLINE by tools/bake-map-texture.js — no runtime tile
// fetching) lies flat on the floor; one colored sphere floats above each of
// the 100 real coordinates; a contact cue on the map grounds each sphere;
// clicking a sphere reveals its artwork image (same focus grammar as the wall).
//
// Loaded in <head> AFTER zone-b.js (it reads the wall's placement + width as
// its own defaults) and BEFORE <a-scene> parses.
//
// Sphere -> artwork mapping: each locations.json entry has an `id` (e.g.
// "991427") and every id matches a web4map image exactly ("991427x.jpg"), the
// SAME set of files the wall shows — so the mapping is by ID, not by index.
// ================================================================

// ----------------------------------------------------------------
// zone-b-map-root: the SINGLE placement handle for the whole floor-map
// assembly, mirroring zone-a-root / zone-b-root / zone-c-root. Its base
// position is DERIVED, not hardcoded: the wall's lateral spot from #zone-b's
// zone-b-root offset, at floor level, on the wall line — the board inside then
// extends BEHIND the wall (away from spawn). `offset` is the tunable handle,
// a DELTA from that derived spot (default 0 0 0), so the default placement
// keeps tracking the wall if the wall moves. Adjust live, e.g.:
//   document.getElementById('zone-b-map').setAttribute('zone-b-map-root','offset','0 0 2')
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-b-map-root", {
  schema: {
    offset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    // Visibility toggle for the teleport flow: hidden in the main exhibition,
    // shown on arrival. A PURE visibility flip (object3D.visible) — nothing is
    // torn down or rebuilt, materials/textures stay resident (the texture is
    // GPU-preloaded by map-board), so the first teleport has no load hitch.
    shown: { type: "boolean", default: true },
  },
  init: function () {
    this.wallRootEl = document.getElementById("zone-b");
    // The base spot is DERIVED from #zone-b's zone-b-root offset, but that
    // component is not guaranteed to have initialised by the time THIS
    // component's first update() runs — when it hasn't, getAttribute returns
    // nothing and place() would be stuck on the fallback. zone-b-root emits
    // `zonebrootchanged` on every placement, so re-derive from that: the first
    // one settles the init-order race, and any later one keeps the map tracking
    // the wall if the wall moves (this component's documented intent).
    this.onWallRootChange = () => this.place();
    if (this.wallRootEl) {
      this.wallRootEl.addEventListener("zonebrootchanged", this.onWallRootChange);
    }
  },

  remove: function () {
    if (this.wallRootEl) {
      this.wallRootEl.removeEventListener("zonebrootchanged", this.onWallRootChange);
    }
  },

  update: function () {
    this.place();
  },

  place: function () {
    this.el.object3D.visible = this.data.shown;
    // Read the wall's placement from its own source of truth (the zone-b-root
    // attribute in index.html) — never a copied number.
    let base = { x: 13, y: 3, z: 0 }; // last-resort fallback only
    const attr = this.wallRootEl && this.wallRootEl.getAttribute("zone-b-root");
    if (attr && attr.offset) {
      base = attr.offset;
    } else if (!this.wallRootEl) {
      console.warn("zone-b-map-root: #zone-b not found; using fallback base");
    }
    // else: zone-b-root simply hasn't initialised yet — `zonebrootchanged`
    // re-places us the moment it does, so this is not worth warning about.
    const o = this.data.offset;
    // Wall x/z (its lateral centre), but FLOOR level — the wall's y raises the
    // wall only; the map lies on the ground.
    this.el.setAttribute("position", {
      x: base.x + o.x,
      y: 0 + o.y,
      z: base.z + o.z,
    });
    this.el.emit("zonebmaprootchanged");
  },
});

// ----------------------------------------------------------------
// map-board: builds the whole map assembly — base plane + 100 spheres + their
// invisible hit targets — from the baked texture's sidecar JSON and the
// locations data. Everything is laid out in THIS entity's local frame; the
// entity carries the same `0 -90 0` yaw as the wall container, so local +x
// spans the wall's width (world +z) and local -z runs BEHIND the wall
// (world +x, away from spawn): the map reads like a table map approached from
// its south edge, north pointing away from spawn.
//
// COORDINATES — one source of truth: the sidecar JSON written by the bake
// (assets/zone-b-map-saigon.json) holds the EXACT normalized-Mercator bbox the
// JPEG covers AND the point list itself (embedded there because 100locations/
// is a nested git repo this repo cannot track). Each location is projected
// with the same Mercator formulas and normalized into that bbox, so a sphere
// sits over its true spot on the street map with no drift; plane depth
// follows the texture's Mercator aspect.
//
// TUNABLES (adjust by eye via setAttribute — no code edits):
//   mapWidth         — plane width in metres. 0 = AUTO: the wall's own width
//                      (read live from #zone-b-wall's image-wall).
//   basePlaneOpacity — map plane opacity (default fully opaque).
//   sphereRadius     — visual sphere radius (m).
//   hoverHeight      — sphere centre height above the map (m), ~waist height.
//   gapBehindWall    — metres between the wall plane and the map's near edge.
// ----------------------------------------------------------------
AFRAME.registerComponent("map-board", {
  schema: {
    mapWidth: { type: "number", default: 0 }, // 0 = auto (wall width)
    basePlaneOpacity: { type: "number", default: 1 },
    sphereRadius: { type: "number", default: 0.12 },
    hoverHeight: { type: "number", default: 1.0 },
    gapBehindWall: { type: "number", default: 1.0 },
    texture: { type: "string", default: "assets/zone-b-map-saigon.jpg" },
    sidecar: { type: "string", default: "assets/zone-b-map-saigon.json" },
    manifest: { type: "string", default: "web4map-512/manifest.json" }, // titles
    yLift: { type: "number", default: 0.02 }, // plane above floor (anti z-fight)
  },

  // Deterministic per-index palette (locations.json carries no colors):
  // saturated hues that read clearly on the pale Positron map. Assigned by
  // index modulo — stable across loads, never random.
  PALETTE: [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#00b7c4", "#f032e6", "#7a6400", "#1a9c76", "#c94c00",
  ],

  init: function () {
    this.planeEl = null;
    this.targets = []; // invisible hit-target entities (one per location)
    this.sphereGroup = null; // THREE.Group of the visual sphere meshes
    this.sphereGeo = null;
    this.hitGeo = null;
    this.hitMat = null;
    this.materials = {}; // palette color -> shared MeshBasicMaterial
    this.placements = null; // [{x, z, id, file, title, color}] local frame
    this.built = false;

    // Fetch the sidecar (bbox + points) and title manifest once, then build.
    // The manifest is best-effort (falls back to ""): the map must not break
    // without it.
    Promise.all([
      fetch(this.data.sidecar).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }),
      fetch(this.data.manifest)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([sidecar, manifest]) => {
        this.sidecar = sidecar;
        this.locations = sidecar.points || [];
        this.titles = {};
        (Array.isArray(manifest) ? manifest : []).forEach((e) => {
          if (e && e.file) this.titles[e.file] = e.title || "";
        });
        this.build();
      })
      .catch((err) => {
        console.error("map-board: failed to load map data", err);
      });
  },

  // Re-layout on any live tunable change; no-op until the data has arrived.
  update: function () {
    if (this.sidecar && this.locations) this.build();
  },

  // mapWidth=0 means AUTO: the wall's own width, read from the image-wall
  // attribute (its source of truth in index.html), falling back to the
  // component's resolver (handles the wall's own width:0 auto mode).
  resolveWidth: function () {
    if (this.data.mapWidth > 0) return this.data.mapWidth;
    const wallEl = document.getElementById("zone-b-wall");
    const attr = wallEl && wallEl.getAttribute("image-wall");
    if (attr && attr.width > 0) return attr.width;
    const wall = wallEl && wallEl.components && wallEl.components["image-wall"];
    if (wall) return wall.resolveWidth();
    console.warn("map-board: could not read wall width; FALLBACK 15 m");
    return 15;
  },

  // Normalized Web Mercator (same formulas as the bake script; y grows
  // DOWNWARD i.e. north = smaller y, matching the sidecar's bbox convention).
  mercX: function (lng) {
    return (lng + 180) / 360;
  },
  mercY: function (lat) {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  },

  build: function () {
    this.teardown();

    const d = this.data;
    const sc = this.sidecar;
    const width = this.resolveWidth();
    const depth = width / sc.aspect; // follow the texture's Mercator aspect
    // Expose the computed board dimensions for other Zone B furniture (the
    // teleport manager reads these + gapBehindWall to place one return terminal
    // at each map edge live — no copied map size). Kept in sync every build.
    this.width = width;
    this.depth = depth;
    // Plane centre in local frame: near (south) edge `gapBehindWall` behind
    // the wall line (local -z = behind), extending north away from spawn.
    const centerZ = -(d.gapBehindWall + depth / 2);

    // --- base plane: the baked street map, unlit like the rest of the
    // exhibition, lifted slightly off the floor against z-fighting (the same
    // trick as the contact cues).
    const plane = document.createElement("a-plane");
    plane.setAttribute("width", width);
    plane.setAttribute("height", depth);
    plane.setAttribute("position", `0 ${d.yLift} ${centerZ}`);
    plane.setAttribute("rotation", "-90 0 0"); // flat; texture top -> local -z
    plane.setAttribute(
      "material",
      `src: url(${d.texture}); shader: flat; ` +
        `opacity: ${d.basePlaneOpacity}; ` +
        `transparent: ${d.basePlaneOpacity < 1}`
    );
    this.el.appendChild(plane);
    this.planeEl = plane;

    // Force the map texture onto the GPU as soon as it decodes, even while
    // the whole assembly is hidden (visible:false skips rendering, and an
    // unrendered texture would otherwise upload — and hitch — on the first
    // frame after teleporting in).
    plane.addEventListener(
      "materialtextureloaded",
      () => {
        const mesh = plane.getObject3D("mesh");
        const renderer = this.el.sceneEl.renderer;
        if (mesh && mesh.material && mesh.material.map && renderer) {
          renderer.initTexture(mesh.material.map);
        }
      },
      { once: true }
    );

    // --- project the 100 points into the plane's local frame via the
    // sidecar's EXACT bbox (texture corners and spheres share one truth).
    const mx0 = sc.mercator.x0, mx1 = sc.mercator.x1;
    const my0 = sc.mercator.y0, my1 = sc.mercator.y1;
    this.placements = this.locations.map((p, i) => {
      const u = (this.mercX(p.lng) - mx0) / (mx1 - mx0); // 0 west .. 1 east
      const v = (this.mercY(p.lat) - my0) / (my1 - my0); // 0 north .. 1 south
      const file = p.id + "x.jpg"; // by-ID mapping to the wall's image set
      return {
        x: (u - 0.5) * width, // texture left edge = local -x (west)
        z: centerZ + (v - 0.5) * depth, // texture top = local -z (north)
        id: p.id,
        file: file,
        title: this.titles[file] || "",
        color: this.PALETTE[i % this.PALETTE.length],
      };
    });

    // --- visual spheres: ONE low-poly unit geometry + ONE material per
    // palette color, shared across all 100 meshes (10 materials, 100 cheap
    // meshes, zero per-frame work) — negligible next to the wall's 100 tiles.
    this.sphereGeo = new THREE.SphereGeometry(1, 12, 8);
    this.sphereGroup = new THREE.Group();
    const r = d.sphereRadius;
    const y = d.yLift + d.hoverHeight;
    this.placements.forEach((p) => {
      let mat = this.materials[p.color];
      if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: p.color });
        this.materials[p.color] = mat;
      }
      const m = new THREE.Mesh(this.sphereGeo, mat);
      m.scale.setScalar(r);
      m.position.set(p.x, y, p.z);
      this.sphereGroup.add(m);
    });
    this.el.setObject3D("spheres", this.sphereGroup);

    // --- hit targets: one INVISIBLE enlarged sphere per point (~2.5x the
    // visual radius) so Quest laser selection is comfortable. The raycaster
    // needs `.clickable` ENTITIES, so these are per-point a-entities carrying
    // an invisible mesh (opacity 0, colorWrite off — still ray-hittable);
    // the visual meshes above are never raycast targets.
    this.hitGeo = new THREE.SphereGeometry(1, 8, 6);
    this.hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitMat.colorWrite = false;
    this.placements.forEach((p) => {
      const t = document.createElement("a-entity");
      t.setAttribute("position", `${p.x} ${y} ${p.z}`);
      t.setAttribute("class", "clickable");
      t.dataset.file = p.file; // reveal image, chosen by ID
      t.dataset.color = p.color;
      t.setAttribute("data-title", p.title);
      const mesh = new THREE.Mesh(this.hitGeo, this.hitMat);
      mesh.scale.setScalar(r * 2.5);
      t.addEventListener("loaded", () => t.setObject3D("hit", mesh), {
        once: true,
      });
      this.el.appendChild(t);
      this.targets.push(t);
    });

    this.built = true;
    console.log(
      `map-board: ${this.placements.length} points on a ` +
        `${width.toFixed(2)} x ${depth.toFixed(2)} m map ` +
        `(texture ${sc.widthPx}x${sc.heightPx}, zoom ${sc.zoom})`
    );
    // Tell the contact cues the board (re)built so they re-derive positions.
    this.el.emit("zonebmapbuilt");
  },

  teardown: function () {
    if (this.planeEl && this.planeEl.parentNode) {
      this.planeEl.parentNode.removeChild(this.planeEl);
    }
    this.planeEl = null;
    this.targets.forEach((t) => t.parentNode && t.parentNode.removeChild(t));
    this.targets = [];
    if (this.sphereGroup) this.el.removeObject3D("spheres");
    this.sphereGroup = null;
    if (this.sphereGeo) this.sphereGeo.dispose();
    if (this.hitGeo) this.hitGeo.dispose();
    if (this.hitMat) this.hitMat.dispose();
    this.sphereGeo = this.hitGeo = this.hitMat = null;
    Object.values(this.materials).forEach((m) => m.dispose());
    this.materials = {};
    this.built = false;
  },

  remove: function () {
    this.teardown();
  },
});

// ----------------------------------------------------------------
// map-contact-cue — one small contact cue ON THE MAP PLANE under each sphere,
// grounding it (same intent as Zone B's wall cues / the spot cues).
// REUSES the shared ContactCue kit (js/components.js): the SAME radial
// gradient texture, the SAME shadow/glow material, and the SAME
// per-environment retuning — on an environment switch only the shared
// material retunes (no teardown), exactly like the other zones. Unlike the
// wall cues these do NOT pin to the world floor: they sit on the map plane
// and follow the assembly wherever its root moves.
//
// Tunables (same knobs as the other zones, scaled small for the spheres):
//   radius / opacity / softness / yoffset (above the PLANE) + color / mode
//   fallbacks for presets with no ground profile.
// ----------------------------------------------------------------
AFRAME.registerComponent("map-contact-cue", {
  schema: {
    board: { type: "selector" }, // the map-board entity (placement source)
    radius: { type: "number", default: 0.2 }, // small: ~1.7x sphere radius
    opacity: { type: "number", default: 0.3 },
    softness: { type: "number", default: 0.55 },
    yoffset: { type: "number", default: 0.02 }, // metres above the map plane
    color: { type: "color", default: "#000000" },
    mode: { type: "string", default: "shadow" }, // "shadow" | "glow"
  },

  init: function () {
    this.meshes = [];
    this.geometry = null;
    this.curProfile = null;

    this.group = new THREE.Group();
    this.el.setObject3D("cue", this.group);

    this.texture = ContactCue.makeTexture(this.data.softness);
    this.material = ContactCue.makeMaterial(this.data, this.texture);
    this.buildGeometry();

    this.boardEl =
      this.data.board ||
      (this.el.parentNode && this.el.parentNode.querySelector("[map-board]"));

    // Re-derive positions whenever the board (re)builds. Root moves need no
    // relayout: board and cues share the root parent, so their relative
    // transform is invariant.
    this.onBoardBuilt = () => this.layout();
    if (this.boardEl) {
      this.boardEl.addEventListener("zonebmapbuilt", this.onBoardBuilt);
    }

    // Retune with the environment (same contract as the other zones' cues).
    this.onEnvChange = (e) => {
      this.curProfile = (e.detail && e.detail.profile) || null;
      ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
    this.curProfile = ContactCue.currentProfile();
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);

    this.layout(); // in case the board is already built (component re-init)
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
    if (oldData.yoffset !== d.yoffset) this.layout();
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
  },

  buildGeometry: function () {
    if (this.geometry) this.geometry.dispose();
    const s = this.data.radius * 2; // plane spans the cue diameter
    this.geometry = new THREE.PlaneGeometry(s, s);
    this.meshes.forEach((m) => {
      m.geometry = this.geometry;
    });
  },

  ensureMeshCount: function (n) {
    while (this.meshes.length < n) {
      const m = new THREE.Mesh(this.geometry, this.material);
      m.rotation.x = -Math.PI / 2; // lie flat on the map, facing up
      this.group.add(m);
      this.meshes.push(m);
    }
    while (this.meshes.length > n) {
      this.group.remove(this.meshes.pop());
    }
  },

  // One cue on the map plane under each sphere: take each point's board-local
  // position at plane height, map it through world into THIS entity's frame
  // (the board carries the -90 yaw; this entity does not).
  layout: function () {
    const board =
      this.boardEl &&
      this.boardEl.components &&
      this.boardEl.components["map-board"];
    if (!board || !board.placements) return;

    const places = board.placements;
    const yLift = board.data.yLift;
    this.boardEl.object3D.updateWorldMatrix(true, false);
    this.el.object3D.updateWorldMatrix(true, false);

    this.ensureMeshCount(places.length);

    const v = new THREE.Vector3();
    for (let i = 0; i < places.length; i++) {
      // On the plane (+yoffset above it, against z-fighting the map texture).
      v.set(places[i].x, yLift + this.data.yoffset, places[i].z);
      this.boardEl.object3D.localToWorld(v);
      this.el.object3D.worldToLocal(v);
      this.meshes[i].position.copy(v);
    }
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("environmentchanged", this.onEnvChange);
    if (this.boardEl) {
      this.boardEl.removeEventListener("zonebmapbuilt", this.onBoardBuilt);
    }
    this.el.removeObject3D("cue");
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  },
});

// ----------------------------------------------------------------
// map-focus — click/select a sphere to reveal its artwork image full-view,
// with the SAME interaction grammar as the wall's wall-focus (js/zone-b.js):
//
//  - VR (in-world): an a-image springs from the sphere's spot to a readable
//    spot in front of the camera (title shown, rest dimmed by the same
//    camera-child dark sphere); select it again — or the dimmed space — to
//    send it back to the sphere and away. Capture-and-restore: the fly-out
//    returns to the sphere's exact world spot, then the image is removed;
//    the sphere itself never moves.
//  - WEB (desktop/mobile): REUSES the wall's #zoneb-focus blurred overlay —
//    the full-res picture FLIES in from the sphere's on-screen position
//    (FLIP), dismissed by clicking the backdrop or pressing Esc.
//
// Only one reveal at a time: while one is open the other spheres don't
// respond (focused guard + the dim/overlay occluding them), and the
// anim/busy guards ignore clicks mid-transition (double-click safe).
//
// Tunables: distance / height / dimRadius / dimOpacity / dur / aspect
// (the revealed picture's w:h, matching the wall tiles' 1.5).
// ----------------------------------------------------------------
AFRAME.registerComponent("map-focus", {
  schema: {
    distance: { type: "number", default: 1.8 },
    height: { type: "number", default: 1.4 },
    dimRadius: { type: "number", default: 4 },
    dimOpacity: { type: "number", default: 0.6 },
    dur: { type: "number", default: 450 }, // ms
    aspect: { type: "number", default: 1.5 }, // revealed picture w:h
  },

  init: function () {
    this.cameraEl = document.getElementById("camera");
    this.focused = null; // the hit-target entity currently revealed
    this.mode = null; // 'vr' | 'web'
    this.busy = false; // a web fly transition is running
    this.anim = null; // active VR tween, or null
    this.flyEl = null; // the VR a-image doing the reveal
    this.home = null; // its spawn transform at the sphere { pos, quat, scale }
    this.dimEl = null; // camera-child dark sphere (VR)
    this.uiEl = null; // world-anchored title label (VR)

    // Web reveal reuses the wall's blurred overlay DOM (index.html).
    this.overlay = document.getElementById("zoneb-focus");
    this.imgEl = document.getElementById("zoneb-focus-img");
    this.titleEl = document.getElementById("zoneb-focus-title");
    this.yearEl = document.getElementById("zoneb-focus-year");

    // Hit targets are DOM children of this entity; one delegated listener
    // catches their bubbled clicks from every platform's raycaster.
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
      if (e.key === "Escape" && this.focused && this.mode === "web" && !this.busy) {
        this.dismissWeb();
      }
    };
    window.addEventListener("keydown", this.onKey);
  },

  onClick: function (e) {
    if (this.anim || this.busy) return; // ignore clicks mid-transition
    const target = e.target;
    if (!target || target === this.el || !target.classList) return;
    if (!target.classList.contains("clickable")) return;
    if (this.focused) {
      // While revealed: web dismiss is handled by the overlay/Esc; the VR
      // path dismisses on any in-world click (the reveal or another sphere
      // behind the dim) — same one-at-a-time behaviour as the wall.
      if (this.mode === "vr") this.dismissVR();
      return;
    }
    if (!target.dataset.file) return; // not a map hit target
    if (this.el.sceneEl.is("vr-mode")) {
      this.mode = "vr";
      this.focusVR(target);
    } else {
      this.mode = "web";
      this.focusWeb(target);
    }
  },

  // The sphere's world position (centre of the reveal's fly path).
  targetWorldPos: function (target) {
    return target.object3D.getWorldPosition(new THREE.Vector3());
  },

  // ================= VR (in-world) path =================
  focusVR: function (target) {
    const spherePos = this.targetWorldPos(target);

    // Anchor a spot `distance` m in front of the camera at eye height,
    // facing the camera (computed once — not head-locked), like wall-focus.
    const cam = this.cameraEl.object3D;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camQuat = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    fwd.y = 0;
    fwd.normalize();
    const focusPos = camPos.clone().addScaledVector(fwd, this.data.distance);
    focusPos.y = camPos.y; // eye level
    const dir = camPos.clone().sub(focusPos).normalize();
    const faceQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );

    // The revealed picture: the wall's 512 tile texture (Quest-friendly, the
    // same asset the wall tiles show), scene-rooted so world == local.
    const h = this.data.height;
    const w = h * this.data.aspect;
    const img = document.createElement("a-image");
    img.setAttribute("src", "web4map-512/" + encodeURIComponent(target.dataset.file));
    img.setAttribute("width", w);
    img.setAttribute("height", h);
    img.setAttribute("class", "clickable"); // select it again -> dismiss
    this.el.sceneEl.appendChild(img);
    this.flyEl = img;

    // Spawn AT the sphere (tiny), captured as home for the exact fly-back.
    const startScale = Math.max(0.05, (this.dataSphereRadius() * 2) / h);
    this.home = {
      pos: spherePos.clone(),
      quat: faceQuat.clone(),
      scale: new THREE.Vector3(startScale, startScale, startScale),
    };
    const obj = img.object3D;
    obj.position.copy(this.home.pos);
    obj.quaternion.copy(this.home.quat);
    obj.scale.copy(this.home.scale);

    this.buildDim();
    this.buildLabel(target.getAttribute("data-title") || "", focusPos, faceQuat);

    this.focused = target;
    this.startAnim(
      obj,
      focusPos,
      faceQuat,
      new THREE.Vector3(1, 1, 1),
      null
    );
  },

  // The board's current sphereRadius (fly-out start size follows it).
  dataSphereRadius: function () {
    const board = this.el.components["map-board"];
    return board ? board.data.sphereRadius : 0.12;
  },

  dismissVR: function () {
    const img = this.flyEl;
    if (!img || !this.home) return;
    const target = this.focused;
    const home = this.home;

    // Un-dim immediately; the picture flies back down to its sphere.
    this.teardownDim();
    this.teardownLabel();

    this.startAnim(img.object3D, home.pos, home.quat, home.scale, () => {
      if (img.parentNode) img.parentNode.removeChild(img);
      this.flyEl = null;
      this.home = null;
      this.focused = null;
      this.mode = null;
      this.refreshRaycasters();
    });
  },

  // --- easing tween (same shape as wall-focus) ------------------------------
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
    if (!a) return; // no reveal in flight -> zero per-frame work
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

  // --- dim sphere + label: same construction as wall-focus ------------------
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

  buildLabel: function (title, focusPos, faceQuat) {
    if (!title) return;
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
    const back = document.createElement("a-plane");
    back.setAttribute("width", 1.1);
    back.setAttribute("height", 0.28);
    back.setAttribute("position", `0 ${-(halfH + 0.28)} 0`);
    back.setAttribute(
      "material",
      "color: #000000; opacity: 0.55; shader: flat; transparent: true; fog: false"
    );
    ui.appendChild(back);

    const titleEl = document.createElement("a-entity");
    titleEl.setAttribute("text", {
      value: title,
      align: "center",
      color: "#ffffff",
      width: 2.2,
    });
    titleEl.setAttribute("position", `0 ${-(halfH + 0.28)} 0.02`);
    ui.appendChild(titleEl);

    this.el.sceneEl.appendChild(ui);
    this.uiEl = ui;
  },

  teardownLabel: function () {
    if (this.uiEl && this.uiEl.parentNode) {
      this.uiEl.parentNode.removeChild(this.uiEl);
    }
    this.uiEl = null;
  },

  refreshRaycasters: function () {
    ["rightHand", "leftHand"].forEach(function (id) {
      const el = document.getElementById(id);
      const rc = el && el.components && el.components.raycaster;
      if (rc) rc.refreshObjects();
    });
  },

  // ================= Web (HTML overlay) path =================
  // The wall's blurred overlay, verbatim grammar: full-res picture flies in
  // (FLIP) from the sphere's on-screen position; backdrop / Esc dismisses.
  focusWeb: function (target) {
    if (!this.overlay || !this.imgEl) {
      this.mode = "vr"; // no overlay wired — in-world reveal still works
      this.focusVR(target);
      return;
    }
    this.focused = target;
    this.busy = true;
    // Freeze mouse-look so the sphere's screen rect stays valid for the
    // return fly (same as wall-focus).
    if (this.cameraEl) this.cameraEl.setAttribute("look-controls", "enabled", false);

    const rect = this.sphereScreenRect(target);
    const file = target.dataset.file || "";
    this.imgEl.src = file ? "web4map/" + encodeURIComponent(file) : "";
    this.titleEl.textContent = target.getAttribute("data-title") || "";
    this.yearEl.textContent = "2026"; // literal constant, matching the wall

    // Centred target size at the wall tiles' aspect, leaving room for text.
    const aspect = this.data.aspect;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tH = Math.min(0.62 * vh, (0.72 * vw) / aspect);
    this.imgEl.style.width = tH * aspect + "px";
    this.imgEl.style.height = tH + "px";

    this.overlay.classList.add("visible");

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

  dismissWeb: function () {
    const target = this.focused;
    if (!target) return;
    this.busy = true;
    const rect = this.sphereScreenRect(target);
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
      this.focused = null;
      this.mode = null;
      this.busy = false;
    };
    this.imgEl.addEventListener("transitionend", done);
    setTimeout(done, 600); // safety if transitionend doesn't fire
  },

  // The sphere's on-screen rectangle: project a camera-facing square of the
  // sphere's diameter at its world position — the start/end of the web fly.
  sphereScreenRect: function (target) {
    const sceneEl = this.el.sceneEl;
    const cam = sceneEl.camera;
    const canvas = sceneEl.canvas || (sceneEl.renderer && sceneEl.renderer.domElement);
    const w = (canvas && canvas.clientWidth) || window.innerWidth;
    const h = (canvas && canvas.clientHeight) || window.innerHeight;
    const r = this.dataSphereRadius();
    const p = this.targetWorldPos(target);
    const camQuat = cam.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const v = new THREE.Vector3();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c) => {
      v.copy(p).addScaledVector(right, c[0] * r).addScaledVector(up, c[1] * r);
      v.project(cam);
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
    if (this.flyEl && this.flyEl.parentNode) {
      this.flyEl.parentNode.removeChild(this.flyEl);
    }
    if (this.overlay && this.mode === "web") {
      this.overlay.classList.remove("visible");
    }
    if (this.imgEl) {
      this.imgEl.style.transition = "none";
      this.imgEl.style.transform = "none";
    }
    this.teardownDim();
    this.teardownLabel();
    if (this.cameraEl) this.cameraEl.setAttribute("look-controls", "enabled", true);
    this.focused = null;
    this.mode = null;
    this.busy = false;
    this.home = null;
    this.anim = null;
    this.flyEl = null;
  },
});
