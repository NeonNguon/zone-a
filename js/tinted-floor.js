// ================================================================
// tinted-floor — a LOCAL tinted-terrazzo floor patch over ONE floorplan room or
// hallway footprint.
//
// The exhibition floor is a SINGLE 64 m global ground plane (environment.js),
// shared by every room, so it cannot be recoloured per-zone without repainting
// the whole gallery. Instead this lays a second, small terrazzo plane covering
// ONLY one room's inner footprint (or one hallway's corridor strip) — its own
// palette, laid over the global floor. It reuses the SAME makeTerrazzoTexture
// generator (js/bench.js) as the bench and the global floor — runtime canvas, no
// asset file — so it reads as the same building in a different colourway. It is
// LIT (MeshStandardMaterial), so it shades under whatever the room's lamp gives
// it, exactly like the walls.
//
// Used for the Zone C dark screening-room floor (near-black default palette) and
// the Zone B mustard floor (palette overridden per instance) — and their
// approach hallways.
//
// Placement is read LIVE from #floorplan's config (cx/cz/w/d/thickness), the same
// contract room-fixtures follows — never a copied number — and it re-derives on
// `floorplanbuilt`, so it tracks any room change. It sits a hair (ylift) above the
// global floor to avoid z-fighting, and BELOW the contact cues (which sit at
// y≈0.02) so the cue pools render on top of it.
//
// It is mounted as a FIXED sibling of #floorplan (see index.html), NOT under
// #environment — so it persists across environment switches, like the cues and
// the walls.
//
// It covers EITHER a floorplan room (the `room` prop, default "zoneC") OR a
// hallway (the `hallway` prop, e.g. "central-zoneC") — a hallway patch is derived
// from the corridor's from/to span and clear width, spanning inner-face to
// inner-face along the passage so it abuts the room floor at one end and stops at
// the doorway threshold at the other. `hallway` takes precedence when set.
//
// TUNABLES (schema props — adjust live, no code edits):
//   room                 — which floorplan room to cover (default "zoneC").
//   hallway              — which floorplan hallway to cover (overrides room).
//   base                 — terrazzo body colour.
//   fleck1 / fleck2      — the two fleck colours.
//   density / seed       — fleck count per tile / deterministic seed.
//   tile                 — metres per texture tile (fleck scale).
//   ylift                — metres above the global floor (keep < the cues' 0.02).
// ================================================================
AFRAME.registerComponent("tinted-floor", {
  schema: {
    room: { type: "string", default: "zoneC" },
    hallway: { type: "string", default: "" }, // set to cover a hallway instead
    base: { type: "color", default: "#141416" }, // body (near-black default)
    fleck1: { type: "color", default: "#1e1e20" }, // fleck a
    fleck2: { type: "color", default: "#242426" }, // fleck b
    density: { type: "number", default: 300 }, // flecks per tile
    seed: { type: "number", default: 11 },
    tile: { type: "number", default: 1.8 }, // metres per texture tile
    ylift: { type: "number", default: 0.008 }, // above global floor, below cues
  },

  init: function () {
    this.fpEl = document.getElementById("floorplan");
    this.mesh = null;
    this.geometry = null;
    this.material = null;
    this.texture = null;
    // #floorplan may not have built yet on load (parse order), and it rebuilds
    // on any config change — `floorplanbuilt` covers both, same as room-fixtures.
    this.onBuilt = () => this.build();
    if (this.fpEl) this.fpEl.addEventListener("floorplanbuilt", this.onBuilt);
    this.build();
  },

  // Any tunable change rebuilds — one plane, so a full rebuild is cheap.
  update: function (oldData) {
    if (Object.keys(oldData).length === 0) return; // first update: init built it
    this.build();
  },

  // The rectangle to cover, in WORLD coordinates: { cx, cz, w, dep }. Either a
  // room's inner footprint, or a hallway's corridor strip. Returns null until
  // the floorplan config is readable (`floorplanbuilt` then calls back).
  footprint: function (attr) {
    const t = attr.thickness != null ? attr.thickness : 0.15;

    if (this.data.hallway) {
      const h = (attr.hallways || []).find((hh) => hh.id === this.data.hallway);
      if (!h || !h.corridor || !h.openings || !h.openings[0]) return null;
      // The corridor runs along the through axis (the side's axis letter); its
      // from/to are the two rooms' wall CENTRES. Extending each end by half a
      // thickness lands exactly on the two rooms' inner faces (the same lo/hi
      // the floorplan uses to place the corridor side-walls), so the strip abuts
      // the room floor at one end and the foyer threshold at the other.
      const half = t / 2;
      const lo = Math.min(h.corridor.from, h.corridor.to) - half;
      const hi = Math.max(h.corridor.from, h.corridor.to) + half;
      const runAxis = h.openings[0].side.charAt(1); // 'x' or 'z'
      const mid = (lo + hi) / 2;
      const span = hi - lo;
      // Clear width + a thickness so the cross-axis edges tuck UNDER the side
      // walls rather than leaving a hairline of pale floor at their base.
      const clear = h.width + t;
      return runAxis === "x"
        ? { cx: mid, cz: h.center, w: span, dep: clear }
        : { cx: h.center, cz: mid, w: clear, dep: span };
    }

    const r = attr.rooms && attr.rooms[this.data.room];
    if (!r) return null;
    // Inner footprint (minus wall thickness) so the plane meets the wall faces.
    return { cx: r.cx, cz: r.cz, w: r.w - t, dep: r.d - t };
  },

  build: function () {
    const attr = this.fpEl && this.fpEl.getAttribute("floorplan");
    if (!attr) return; // floorplan not up yet — `floorplanbuilt` calls us back

    const fp = this.footprint(attr);
    if (!fp) return; // config not readable yet — `floorplanbuilt` calls back

    const d = this.data;
    const w = fp.w;
    const dep = fp.dep;

    this.teardownGpu();

    // Terrazzo palette. CLONE the cached texture (makeTerrazzoTexture shares by
    // parameter key) so our per-instance tiling doesn't retile any other surface
    // built from the same palette — same guard finishGround uses.
    const tex = makeTerrazzoTexture(
      d.base,
      [d.fleck1, d.fleck2],
      d.density,
      d.seed
    ).clone();
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / d.tile, dep / d.tile);
    const renderer = this.el.sceneEl && this.el.sceneEl.renderer;
    tex.anisotropy = renderer
      ? Math.min(8, renderer.capabilities.getMaxAnisotropy())
      : 8;
    this.texture = tex;

    // LIT, so it shades under the room's lamp like the walls do.
    this.material = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.geometry = new THREE.PlaneGeometry(w, dep);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // lie flat, facing up
    // This entity sits at the world origin (sibling of #floorplan), so the
    // footprint's cx/cz are world coordinates: place the plane directly on them,
    // lifted a hair above the global floor.
    this.mesh.position.set(fp.cx, d.ylift, fp.cz);
    this.el.setObject3D("floor", this.mesh);
  },

  teardownGpu: function () {
    if (this.mesh) this.el.removeObject3D("floor");
    this.mesh = null;
    if (this.geometry) this.geometry.dispose();
    this.geometry = null;
    if (this.material) this.material.dispose();
    this.material = null;
    if (this.texture) this.texture.dispose();
    this.texture = null;
  },

  remove: function () {
    if (this.fpEl) this.fpEl.removeEventListener("floorplanbuilt", this.onBuilt);
    this.teardownGpu();
  },
});
