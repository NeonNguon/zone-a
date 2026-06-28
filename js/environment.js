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
// Equirectangular sky image for the `photo` preset (converted HDR->SDR jpg).
const PHOTO_SKY_SRC = "assets/qwantani_moonrise_puresky_4k.jpg";
// Equirectangular image for the `room` preset's sphere (kept as-is).
const ROOM_SKY_SRC = "assets/ferndale_studio_04_4k.jpg";
// Radius (metres) of the `room` preset's inverted photo sphere. The ring sits
// ~3.7 m from centre, so it stays comfortably inside. Tune to resize the room.
const ROOM_RADIUS = 8;

// --- Saigon skyline silhouettes (black-on-transparent PNGs) -------------
// Shared by the `skyline` and `cityroom` presets. Rendered with transparency
// so the white room shows through above/between buildings (no rect edges).
const SAIGON_SRCS = [
  "assets/saigon1.png",
  "assets/saigon2.png",
  "assets/saigon3.png",
  "assets/saigon4.png",
];
const SKYLINE_ASPECT = 1456 / 816; // source image width/height, preserved on planes

// `skyline` preset (distant horizon ring) -------------------------------
const SKYLINE_RADIUS = 18; // metres centre -> skyline ring (tune horizon distance)
const SKYLINE_HEIGHT = 9; // metres, full plane height; buildings fill the lower
//                            part, transparent sky above (tune building scale)
const SKYLINE_COUNT = 6; // number of silhouette planes evenly around the ring;
//                          the 4 images repeat, white gaps between are fine
const SKYLINE_LIFT = 0.05; // metres the plane bases sit ABOVE the floor, so they
//                            aren't coplanar with the ground plane (anti z-fight);
//                            small enough that buildings still read as floor-rising
const SKYLINE_CROP = 0.25; // fraction of the image height (from the BOTTOM) to
//                            crop off — the solid black foreground band. Done via
//                            texture offset/repeat; the plane is shortened by the
//                            same fraction so buildings keep their apparent height
//                            (no vertical squash). Tune 0..~0.4.

// `cityroom` preset (flat panels on a white box room) -------------------
const CITYROOM_SIZE = 32; // metres, box width & depth (must exceed the ring; tune)
const CITYROOM_HEIGHT = 20; // metres, box height (>= panel height below)
// Which saigon image (1-4) maps to each of the 4 walls, in order: -Z, +X, +Z, -X.
const WALL_IMAGES = [1, 2, 3, 4];

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

// ----------------------------------------------------------------
// photo-room: an inverted sphere (BackSide — viewed from inside) textured with
// an equirectangular image, so the photo wraps CLOSE around the ring rather
// than sitting at an infinite a-sky distance. Kept a SPHERE on purpose: the
// image is equirectangular and would distort on flat box faces. Same lifecycle
// pattern as particle-field/three-grid — build in init(), dispose in remove()
// (geometry, material AND texture) so it tears down cleanly on cycle.
// ----------------------------------------------------------------
AFRAME.registerComponent("photo-room", {
  schema: {
    src: { type: "string", default: ROOM_SKY_SRC },
    radius: { type: "number", default: ROOM_RADIUS },
  },
  init: function () {
    const d = this.data;
    const geo = new THREE.SphereGeometry(d.radius, 64, 40);
    this.tex = new THREE.TextureLoader().load(d.src);
    this.tex.colorSpace = THREE.SRGBColorSpace; // jpg is sRGB-encoded
    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      side: THREE.BackSide, // we're INSIDE the sphere — render inner faces
      fog: false, // unlit backdrop; ignore scene fog
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.el.setObject3D("photoRoom", mesh);
    this.mesh = mesh;
  },
  remove: function () {
    this.el.removeObject3D("photoRoom");
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (this.tex) {
      this.tex.dispose(); // free the GPU texture too
      this.tex = null;
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

// A flat silhouette panel: a plane textured with a (keyed) black-on-transparent
// PNG. side: double so it reads correctly however you face it. opts let a caller
// tune the cutout and crop without affecting other callers:
//   alphaTest  (default 0.5) — 0 = smooth alpha BLEND (no cutout sparkle)
//   depthWrite (default true) — false avoids transparent depth artefacts
//   repeat/offset (default "1 1" / "0 0") — texture crop window
function skylinePanel(src, w, h, opts) {
  opts = opts || {};
  const alphaTest = opts.alphaTest == null ? 0.5 : opts.alphaTest;
  const depthWrite = opts.depthWrite == null ? true : opts.depthWrite;
  const repeat = opts.repeat || "1 1";
  const offset = opts.offset || "0 0";
  return envEl("a-plane", {
    width: w,
    height: h,
    material:
      "src: " + src +
      "; shader: flat; transparent: true; side: double" +
      "; alphaTest: " + alphaTest +
      "; depthWrite: " + depthWrite +
      "; repeat: " + repeat +
      "; offset: " + offset,
  });
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
        // Brighter lines + higher opacity so the floor reads clearly against
        // the dark background (color1 = centre lines, color2 = grid lines).
        "three-grid":
          "size: 60; divisions: 60; color1: #7da2ff; color2: #4a63c8; opacity: 0.85",
        position: "0 0.01 0", // a hair above the ground to avoid z-fighting
      })
    );
    env.appendChild(envEl("a-entity", { "particle-field": "" }));
  },

  // PHOTO — equirectangular photo sky (a-sky wraps the 2:1 image around you).
  // Currently a studio HDRI for a functional wraparound test (PHOTO_SKY_SRC).
  photo: function (env, scene) {
    setBackground(scene, "#000000"); // hidden behind the sky; black fallback
    setFog(scene, null);
    buildAmbient(env, "#cccccc", 1); // keeps the lit hover frame visible
    buildGround(env, "#888888"); // floor you stand on (per all-presets rule)
    env.appendChild(envEl("a-sky", { src: PHOTO_SKY_SRC }));
  },

  // ROOM — the ring INSIDE the photo: an inverted equirect sphere (radius
  // ROOM_RADIUS) wraps the studio close around the ring, instead of the
  // infinite dome the `photo` preset uses. A separate preset — `photo` is
  // left exactly as-is.
  room: function (env, scene) {
    setBackground(scene, "#000000"); // never seen (the sphere encloses you)
    setFog(scene, null);
    buildAmbient(env, "#cccccc", 1); // keeps the lit hover frame visible
    // Ground kept PRESENT (all-presets rule) but fully transparent + no depth
    // write, so the photo's OWN floor shows through — no grey-slab look.
    env.appendChild(
      envEl("a-plane", {
        position: "0 0 0",
        rotation: "-90 0 0",
        width: GROUND_SIZE,
        height: GROUND_SIZE,
        material: "transparent: true; opacity: 0; depthWrite: false",
      })
    );
    env.appendChild(envEl("a-entity", { "photo-room": "" }));
  },

  // SKYLINE — Saigon silhouettes as a distant horizon ringing the white space.
  // Flat planes standing on the floor line at SKYLINE_RADIUS, buildings rising
  // from the ground, white room above and behind. The 4 images repeat around.
  skyline: function (env, scene) {
    setBackground(scene, "#eeeeee"); // white, like void
    setFog(scene, null);
    buildAmbient(env, "#bbbbbb", 1); // hover frame needs light
    buildGround(env, "#eeeeee"); // white floor (ground dependency)

    const keep = 1 - SKYLINE_CROP; // fraction of image height kept (top part)
    const w = SKYLINE_HEIGHT * SKYLINE_ASPECT; // width unchanged (full image width)
    const h = SKYLINE_HEIGHT * keep; // plane shortened by the crop -> no squash
    // Texture window: show the TOP `keep` of the image (drop the bottom band).
    const crop = {
      repeat: "1 " + keep,
      offset: "0 " + SKYLINE_CROP,
      // Smooth alpha blend (no alphaTest cutout) — removes the edge sparkle that
      // alpha-testing a minified, soft-keyed texture produces. depthWrite off so
      // the transparent planes don't fight depth.
      alphaTest: 0,
      depthWrite: false,
    };
    for (let i = 0; i < SKYLINE_COUNT; i++) {
      const thetaDeg = (360 / SKYLINE_COUNT) * i;
      const t = thetaDeg * (Math.PI / 180);
      const x = SKYLINE_RADIUS * Math.sin(t);
      const z = -SKYLINE_RADIUS * Math.cos(t);
      const panel = skylinePanel(SAIGON_SRCS[i % 4], w, h, crop);
      // Base just above the floor line (lifted by SKYLINE_LIFT so it isn't
      // coplanar with the ground); centre at half height + lift; face centre.
      panel.setAttribute("position", `${x} ${h / 2 + SKYLINE_LIFT} ${z}`);
      panel.setAttribute("rotation", `0 ${-thetaDeg} 0`);
      env.appendChild(panel);
    }
  },

  // CITYROOM — a big white box room enclosing the ring, with the Saigon
  // silhouettes mapped FLAT onto the inner wall faces as graphic panels, each
  // sitting on the floor line of its wall (buildings rising from the floor).
  cityroom: function (env, scene) {
    setBackground(scene, "#eeeeee"); // white
    setFog(scene, null);
    buildAmbient(env, "#bbbbbb", 1); // hover frame needs light
    // Floor: pure white and UNLIT (shader: flat), matching the flat white box
    // walls. buildGround() uses a LIT material that ambient #bbb dims to grey —
    // that was the grey floor. Sized to the room so it's white wall-to-wall.
    // Still a ground plane (dependency rule).
    env.appendChild(
      envEl("a-plane", {
        position: "0 0 0",
        rotation: "-90 0 0",
        width: CITYROOM_SIZE,
        height: CITYROOM_SIZE,
        material: "color: #ffffff; shader: flat; side: double",
      })
    );

    const half = CITYROOM_SIZE / 2;
    // White box room — inner faces (side: back), so it encloses you in white.
    // SINK it SKYLINE_LIFT below the floor: otherwise the box's bottom inner
    // face is coplanar with the ground plane (both white at y=0), which z-fights
    // and makes the floor flicker. Dropping it leaves the ground plane as the
    // one visible floor; the ceiling drop is negligible.
    env.appendChild(
      envEl("a-box", {
        position: `0 ${CITYROOM_HEIGHT / 2 - SKYLINE_LIFT} 0`,
        width: CITYROOM_SIZE,
        height: CITYROOM_HEIGHT,
        depth: CITYROOM_SIZE,
        material: "color: #eeeeee; shader: flat; side: back",
      })
    );

    // One skyline panel per wall, spanning the wall width, bottom on the floor.
    // Same treatment as the skyline preset: crop the black foreground band off
    // the bottom (texture window) and shorten the panel by the same fraction so
    // buildings keep their apparent height (no squash); smooth alpha blend
    // instead of an alphaTest cutout to avoid edge sparkle.
    const keep = 1 - SKYLINE_CROP;
    const panelW = CITYROOM_SIZE; // span the wall width (unchanged)
    const panelH = (CITYROOM_SIZE / SKYLINE_ASPECT) * keep; // cropped height
    const crop = {
      repeat: "1 " + keep,
      offset: "0 " + SKYLINE_CROP,
      alphaTest: 0,
      depthWrite: false,
    };
    const eps = 0.05; // sit just inside the wall to avoid z-fighting
    const y = panelH / 2; // centre at half height -> bottom on the floor line
    const walls = [
      { pos: `0 ${y} ${-half + eps}`, rot: "0 0 0" }, // -Z wall, faces +Z (inward)
      { pos: `${half - eps} ${y} 0`, rot: "0 -90 0" }, // +X wall, faces -X
      { pos: `0 ${y} ${half - eps}`, rot: "0 180 0" }, // +Z wall, faces -Z
      { pos: `${-half + eps} ${y} 0`, rot: "0 90 0" }, // -X wall, faces +X
    ];
    for (let i = 0; i < 4; i++) {
      const src = SAIGON_SRCS[WALL_IMAGES[i] - 1];
      const panel = skylinePanel(src, panelW, panelH, crop);
      panel.setAttribute("position", walls[i].pos);
      panel.setAttribute("rotation", walls[i].rot);
      env.appendChild(panel);
    }
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
    this.order = ["void", "dataspace", "photo", "room", "skyline", "cityroom", "splat"];
    this.active = null; // the preset currently built into #environment

    const params = new URLSearchParams(window.location.search);

    // Dev-only HUD (2D overlay, defined in index.html). Default OFF: shown only
    // when ?debug is present, or toggled at runtime with `h`. Never appears in
    // the normal experience.
    this.hud = document.getElementById("env-hud");
    this.hudName = document.getElementById("env-hud-name");
    this.hudVisible = false;
    if (params.has("debug")) this.setHudVisible(true);

    // ?env= makes each look a shareable link. Adopt a valid value, else the
    // declared default. We build DIRECTLY here (not via setAttribute) so we
    // never re-enter the component lifecycle before init() finishes.
    const fromUrl = params.get("env");
    const initial =
      fromUrl && ENV_PRESETS[fromUrl] ? fromUrl : this.data.preset;

    // `n` cycles to the next preset; `h` toggles the dev HUD.
    this.onKey = (e) => {
      if (e.key === "n" || e.key === "N") this.cycle();
      else if (e.key === "h" || e.key === "H") this.toggleHud();
    };
    window.addEventListener("keydown", this.onKey);

    this.build(initial); // single, first build (also primes the HUD text)
  },

  // ---- dev HUD helpers ----
  setHudVisible: function (on) {
    this.hudVisible = on;
    if (this.hud) this.hud.hidden = !on;
  },
  toggleHud: function () {
    this.setHudVisible(!this.hudVisible);
  },
  updateHud: function (name) {
    if (this.hudName) this.hudName.textContent = name;
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
    this.updateHud(name); // keep the dev HUD in sync (even while hidden)

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
