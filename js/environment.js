// ================================================================
// Environment layer for Zone A.
//
// The atmosphere (background, fog, lights, ground, grid, particles) is a
// SWAPPABLE unit, independent of the ring. `environment-manager` owns the
// #environment container and rebuilds it from a named preset.
//
// Design rules (from the Step 1 audit):
//  - <a-scene> is a NEUTRAL host: it sets no background/fog/lights itself.
//    index.html sets light="defaultLightsEnabled: false" so A-Frame does NOT
//    inject its default light rig — presets fully own lighting.
//  - Locomotion is FREE-FLY and the raycasters target .clickable only, so NO
//    preset depends on the ground for movement. BUT the hover-highlight frame
//    (image-hover) uses a LIT material, so every preset MUST supply at least
//    ambient light or that affordance renders black. Every preset therefore
//    builds both a ground plane (comfort/orientation; mandated for all looks)
//    AND ambient light (the one real Step 1 dependency).
//  - Switching TEARS DOWN the old environment (removes #environment's
//    children) and BUILDS the new one fresh — no visibility toggling.
//  - Each preset sets scene background + fog EXPLICITLY, so teardown needs no
//    save/restore: the next preset just overwrites them.
//  - No aframe-particle-system-component: the dataspace field is a small,
//    custom THREE.Points object, tuned for 72fps on Quest 3.
// ================================================================

// ---------- tunables ----------
const GROUND_SIZE = 30; // metres square; matches the original plane
const PARTICLE_COUNT = 1500; // THREE.Points count — tune for density/fps
const PARTICLE_SPREAD = 30; // half-extent of the cube the points fill (m)
const PARTICLE_DRIFT = 0.02; // radians/sec — slow yaw of the whole field

// ----------------------------------------------------------------
// three-grid: a THREE.GridHelper wrapped as a component so it has a clean
// teardown (dispose on remove) and can be appended/removed like any entity.
// ----------------------------------------------------------------
AFRAME.registerComponent("three-grid", {
  schema: {
    size: { type: "number", default: 60 },
    divisions: { type: "number", default: 60 },
    color1: { type: "color", default: "#2b3f8c" },
    color2: { type: "color", default: "#11173a" },
    opacity: { type: "number", default: 0.5 },
  },
  init: function () {
    const d = this.data;
    const grid = new THREE.GridHelper(
      d.size,
      d.divisions,
      new THREE.Color(d.color1),
      new THREE.Color(d.color2)
    );
    grid.material.transparent = true;
    grid.material.opacity = d.opacity;
    grid.material.fog = true; // let the dataspace fog fade distant lines
    this.el.setObject3D("grid", grid);
    this.grid = grid;
  },
  remove: function () {
    this.el.removeObject3D("grid");
    if (this.grid) {
      this.grid.geometry.dispose();
      this.grid.material.dispose();
      this.grid = null;
    }
  },
});

// ----------------------------------------------------------------
// particle-field: a custom THREE.Points field (NOT a third-party particle
// system). Static buffer geometry built once; the whole field drifts via a
// cheap yaw in tick(). A few thousand points hold 72fps on Quest 3 — raise
// PARTICLE_COUNT carefully. Tune via the constants above or the schema.
// ----------------------------------------------------------------
AFRAME.registerComponent("particle-field", {
  schema: {
    count: { type: "number", default: PARTICLE_COUNT },
    spread: { type: "number", default: PARTICLE_SPREAD },
    color: { type: "color", default: "#8fbcff" },
    size: { type: "number", default: 0.05 },
    drift: { type: "number", default: PARTICLE_DRIFT },
  },
  init: function () {
    const d = this.data;
    const positions = new Float32Array(d.count * 3);
    for (let i = 0; i < d.count; i++) {
      // Uniform in a cube around the rig; y is 0..spread so the field sits
      // above the floor rather than half-buried. Built once, so Math.random
      // here is fine (no per-frame allocation).
      positions[i * 3 + 0] = (Math.random() - 0.5) * 2 * d.spread;
      positions[i * 3 + 1] = Math.random() * d.spread;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * d.spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(d.color),
      size: d.size,
      sizeAttenuation: true, // nearer points look bigger
      transparent: true,
      opacity: 0.85,
      depthWrite: false, // don't occlude the ring; cheap soft look
      fog: true, // fade into the dataspace fog
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false; // it surrounds the camera
    this.el.setObject3D("particles", points);
    this.points = points;
    this.drift = d.drift;
  },
  tick: function (time, delta) {
    if (this.points) this.points.rotation.y += this.drift * (delta / 1000);
  },
  remove: function () {
    this.el.removeObject3D("particles");
    if (this.points) {
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
  },
});

// ---------- small builders shared by presets ----------

// Create an element and apply a flat map of attributes.
function envEl(tag, attrs) {
  const e = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      e.setAttribute(k, attrs[k]);
    });
  }
  return e;
}

// Ground plane — built by EVERY preset. Locomotion is free-fly so it isn't
// strictly required for movement, but the brief mandates a floor in all looks
// (comfort/orientation).
function buildGround(parent, color) {
  parent.appendChild(
    envEl("a-plane", {
      position: "0 0 0",
      rotation: "-90 0 0",
      width: GROUND_SIZE,
      height: GROUND_SIZE,
      color: color,
    })
  );
}

// Ambient light — the ONE hard dependency from Step 1: the hover frame uses a
// lit material, so every preset must supply at least this. Built via the
// `light` component (not the <a-light> primitive) so prop names are explicit.
function buildAmbient(parent, color, intensity) {
  parent.appendChild(
    envEl("a-entity", {
      light:
        "type: ambient; color: " +
        (color || "#bbbbbb") +
        "; intensity: " +
        (intensity == null ? 1 : intensity),
    })
  );
}

// Scene background + fog, set EXPLICITLY so teardown needs no restore.
function setBackground(scene, color) {
  scene.setAttribute("background", { color: color });
}
function setFog(scene, opts) {
  if (opts) scene.setAttribute("fog", opts);
  else scene.removeAttribute("fog"); // explicit "no fog"
}

// A floating red label so a STUB look is obviously a stub in-headset.
function stubLabel(text) {
  return envEl("a-entity", {
    text: "value: " + text + "; align: center; color: #ff5555; width: 4",
    position: "0 2.4 -3",
  });
}

// ----------------------------------------------------------------
// Preset registry — plain builder functions: (envEl, sceneEl) => void.
// Each one (a) sets scene background + fog explicitly and (b) appends its
// atmospheric children into #environment, ALWAYS including a ground plane and
// ambient light.
// ----------------------------------------------------------------
const ENV_PRESETS = {
  // VOID — the migrated original look: a flat white space.
  void: function (env, scene) {
    setBackground(scene, "#eeeeee");
    setFog(scene, null); // no fog
    buildAmbient(env, "#bbbbbb", 1);
    env.appendChild(
      envEl("a-entity", {
        light:
          "type: hemisphere; color: #ffffff; groundColor: #cccccc; intensity: 1",
      })
    );
    buildGround(env, "#eeeeee");
  },

  // DATASPACE — dark volume with a glowing grid and a drifting point field.
  dataspace: function (env, scene) {
    setBackground(scene, "#05060a");
    setFog(scene, { type: "linear", color: "#05060a", near: 6, far: 26 });
    buildAmbient(env, "#223044", 1); // keeps the lit hover frame visible
    buildGround(env, "#0a0d16");
    env.appendChild(
      envEl("a-entity", {
        "three-grid": "size: 60; divisions: 60",
        position: "0 0.01 0", // a hair above the ground to avoid z-fighting
      })
    );
    env.appendChild(envEl("a-entity", { "particle-field": "" }));
  },

  // PHOTO — equirectangular photo sky. STUB.
  photo: function (env, scene) {
    // TODO(photo): replace the placeholder colour sky with a real equirect.
    // Add an <img id="env-photo" src="..."> to <a-assets>, then below use
    //   envEl("a-sky", { src: "#env-photo" })  instead of the color sky.
    console.warn(
      '[environment] "photo" preset is a STUB — set an equirect a-sky src.'
    );
    setBackground(scene, "#3a3f4a");
    setFog(scene, null);
    buildAmbient(env, "#cccccc", 1);
    buildGround(env, "#888888");
    env.appendChild(envEl("a-sky", { color: "#3a3f4a" })); // <-- swap for src:"#env-photo"
    env.appendChild(stubLabel("PHOTO preset (stub)\nset an equirect a-sky src"));
  },

  // SPLAT — Gaussian-splat scene. STUB.
  splat: function (env, scene) {
    // TODO(splat): Gaussian splatting needs a THIRD-PARTY A-Frame component
    // (TBD — e.g. a gaussian-splatting / luma-splat component). Add its
    // <script> to index.html, then build its entity here, e.g.:
    //   envEl("a-entity", { "gaussian-splatting": "src: url(scene.splat)" })
    console.warn(
      '[environment] "splat" preset is a STUB — needs a 3rd-party gaussian-splat component (TBD).'
    );
    setBackground(scene, "#101012");
    setFog(scene, null);
    buildAmbient(env, "#cccccc", 1);
    buildGround(env, "#1a1a1f");
    env.appendChild(
      stubLabel("SPLAT preset (stub)\nneeds a gaussian-splat component (TBD)")
    );
  },
};

// ----------------------------------------------------------------
// environment-manager: owns #environment. One property, `preset`. Builds the
// named preset on init / change, tearing the old one down first. Reads ?env=
// from the URL (shareable links) and cycles with the `n` key.
// ----------------------------------------------------------------
AFRAME.registerComponent("environment-manager", {
  schema: { preset: { type: "string", default: "void" } },

  init: function () {
    this.scene = this.el.sceneEl;
    this.order = ["void", "dataspace", "photo", "splat"];
    this.active = null; // the preset currently built into #environment

    // ?env= makes each look a shareable link. Adopt a valid value, else the
    // declared default. We build DIRECTLY here (not via setAttribute) so we
    // never re-enter the component lifecycle before init() finishes.
    const fromUrl = new URLSearchParams(window.location.search).get("env");
    const initial =
      fromUrl && ENV_PRESETS[fromUrl] ? fromUrl : this.data.preset;

    // `n` cycles to the next preset for quick side-by-side review.
    this.onKey = (e) => {
      if (e.key === "n" || e.key === "N") this.cycle();
    };
    window.addEventListener("keydown", this.onKey);

    this.build(initial); // single, first build
  },

  // Fires when `preset` is changed via setAttribute (e.g. cycle()). The
  // automatic initial update is skipped — init() already built the first look,
  // and `this.active` tracks what is actually mounted.
  update: function (oldData) {
    if (oldData && oldData.preset !== undefined && this.data.preset !== this.active) {
      this.build(this.data.preset);
    }
  },

  build: function (name) {
    const builder = ENV_PRESETS[name] || ENV_PRESETS.void;
    this.teardown(); // remove the old look entirely, then build fresh
    builder(this.el, this.scene);
    this.active = name;

    // Reflect the active preset in the URL so the address bar stays shareable.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("env", name);
      window.history.replaceState({}, "", url);
    } catch (e) {
      /* non-http (file://) — non-fatal */
    }
    console.log("[environment] preset =", name);
  },

  // Remove every child of #environment so the next preset builds fresh.
  // removeChild fires each component's remove() (THREE disposal), so this is a
  // true teardown, not a visibility toggle.
  teardown: function () {
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
  },

  cycle: function () {
    const i = this.order.indexOf(this.active);
    const next = this.order[(i + 1) % this.order.length];
    // setAttribute (post-init) drives update() -> build(next).
    this.el.setAttribute("environment-manager", "preset", next);
  },

  remove: function () {
    window.removeEventListener("keydown", this.onKey);
    this.teardown();
  },
});
