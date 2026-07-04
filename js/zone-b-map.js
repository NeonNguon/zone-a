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
  },
  update: function () {
    // Read the wall's placement from its own source of truth (the zone-b-root
    // attribute in index.html) — never a copied number.
    let base = { x: 13, y: 3, z: 0 }; // fallback = zone-b-root's current default
    const wallRoot = document.getElementById("zone-b");
    const attr = wallRoot && wallRoot.getAttribute("zone-b-root");
    if (attr && attr.offset) {
      base = attr.offset;
    } else {
      console.warn("zone-b-map-root: #zone-b not found; using fallback base");
    }
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
// grounding it (same intent as Zone A's ring cues / Zone B's wall cues).
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

