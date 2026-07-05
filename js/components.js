// ================================================================
// Custom A-Frame components for Zone A.
// Loaded in <head> (after the A-Frame CDN) so every component is REGISTERED
// before <a-scene> parses and tries to attach it.
// ================================================================

// --- Ring constants -----------------------------------------------------
const SWEEP_DEG = 180; // total angular spread of the ring, in degrees
const COUNT = 9; // number of images
const IMG_SIZE = 1.4; // width & height of each square image, in metres
const GAP_FRAC = 0.05; // gap between neighbours, as a fraction of width
const IMG_Y = 1.6; // height of each image's centre (eye height)
const ASSET_PREFIX = "#atpihl-"; // asset ids are atpihl-1 .. atpihl-9

// ----------------------------------------------------------------
// zoneARingPlacements(): THE single source of the ring geometry. Returns one
// record per image: { x, z, thetaDeg, rotY, radius }. Both the ring-layout
// (image placement) and the ring-contact-cue (floor cue placement) read this,
// so the cues can never drift out of sync with the images.
// ----------------------------------------------------------------
function zoneARingPlacements() {
  // The arc is symmetric around straight-ahead. COUNT images leave COUNT-1
  // gaps, so each step is the sweep split into COUNT-1.
  const halfSweep = SWEEP_DEG / 2; // 90
  const stepDeg = SWEEP_DEG / (COUNT - 1); // 180 / 8 = 22.5
  const stepRad = stepDeg * (Math.PI / 180);

  // Centre-to-centre arc length we WANT between neighbours: one image width
  // plus the 5% gap. Arc length = radius * angle(rad), so radius = arc / angle.
  const spacing = IMG_SIZE * (1 + GAP_FRAC); // 1.4 * 1.05 = 1.47 m
  const RADIUS = spacing / stepRad; // ~3.74 m

  const out = [];
  for (let i = 0; i < COUNT; i++) {
    // thetaDeg sweeps -90, -67.5, ... 0 ... +67.5, +90
    const thetaDeg = -halfSweep + i * stepDeg;
    const thetaRad = thetaDeg * (Math.PI / 180); // sin/cos want radians
    out.push({
      // Circle around the camera at the origin:
      //   x = radius * sin(theta)   -> swings left/right
      //   z = -radius * cos(theta)  -> negative z is "in front"
      x: RADIUS * Math.sin(thetaRad),
      z: -RADIUS * Math.cos(thetaRad),
      thetaDeg: thetaDeg,
      rotY: -thetaDeg, // an a-image faces +Z; -theta about Y faces the centre
      radius: RADIUS,
    });
  }
  return out;
}

// ----------------------------------------------------------------
// ring-layout: builds the nine-image half-circle from zoneARingPlacements().
// ----------------------------------------------------------------
AFRAME.registerComponent("ring-layout", {
  init: function () {
    const placements = zoneARingPlacements();
    const RADIUS = placements.length ? placements[0].radius : 0;
    console.log(
      `Zone A ring: sweep ${SWEEP_DEG}°, count ${COUNT}, radius ${RADIUS.toFixed(2)} m`
    );

    placements.forEach((p, i) => {
      const img = document.createElement("a-image");
      img.setAttribute("src", ASSET_PREFIX + (i + 1)); // by id, not path
      img.setAttribute("position", `${p.x} ${IMG_Y} ${p.z}`);
      img.setAttribute("rotation", `0 ${p.rotY} 0`);
      img.setAttribute("width", IMG_SIZE);
      img.setAttribute("height", IMG_SIZE);
      // "clickable" is what the raycaster filters on; the two components add
      // hover-highlight and click-to-focus behaviour.
      img.setAttribute("class", "clickable");
      img.setAttribute("image-hover", "");
      img.setAttribute("focus-on-click", "");
      this.el.appendChild(img);
    });
  },
});

// ----------------------------------------------------------------
// zone-a-root: the SINGLE placement handle for the whole Zone A assembly.
// #zone-a is the shared origin that BOTH the image ring (ring-layout) and the
// floor contact cues (ring-contact-cue) hang off — and the images carry their
// own audio trigger (focus-on-click) and hover/focus zones — so offsetting this
// one entity moves the entire assembly as a unit. It does NOT touch ring
// radius / image size / spacing / shape / height; only the assembly's position.
//
// `offset` is the tunable placement handle (full x/y/z), default 4 m back along
// -z (away from spawn) to make room for Zones B and C. Adjust live, e.g.:
//   document.getElementById('zone-a').setAttribute('zone-a-root','offset','0 0 -6')
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-a-root", {
  schema: {
    offset: { type: "vec3", default: { x: 0, y: 0, z: -4 } },
  },
  update: function () {
    const o = this.data.offset;
    // Drive the position component (not object3D directly) so there is no
    // init-order race with it; one offset moves images + cues + triggers.
    this.el.setAttribute("position", { x: o.x, y: o.y, z: o.z });
  },
});

// ----------------------------------------------------------------
// image-hover: subtle highlight while the mouse/laser ray is over an image.
// ----------------------------------------------------------------
AFRAME.registerComponent("image-hover", {
  init: function () {
    // A thin "frame": a slightly larger dark plane just behind the image.
    const border = document.createElement("a-plane");
    border.setAttribute("width", IMG_SIZE + 0.04);
    border.setAttribute("height", IMG_SIZE + 0.04);
    border.setAttribute("color", "#222");
    border.setAttribute("position", "0 0 -0.01");
    border.setAttribute("visible", false);
    this.el.appendChild(border);

    this.onEnter = () => {
      this.el.object3D.scale.set(1.05, 1.05, 1.05);
      border.setAttribute("visible", true);
    };
    this.onLeave = () => {
      this.el.object3D.scale.set(1, 1, 1);
      border.setAttribute("visible", false);
    };

    // Fired by the cursor/raycaster — works for BOTH mouse and VR laser.
    this.el.addEventListener("mouseenter", this.onEnter);
    this.el.addEventListener("mouseleave", this.onLeave);
  },
  remove: function () {
    this.el.removeEventListener("mouseenter", this.onEnter);
    this.el.removeEventListener("mouseleave", this.onLeave);
  },
});

// ----------------------------------------------------------------
// focus-on-click: THE SINGLE CLICK FORK.
// One handler, fired identically by the desktop mouse cursor and the VR
// laser trigger. It detects the session type and routes to the matching
// focus view — desktop HTML overlay, or in-scene VR view.
// ----------------------------------------------------------------
AFRAME.registerComponent("focus-on-click", {
  init: function () {
    this.onClick = () => {
      // src is an asset id like "#atpihl-3"; follow it to the <img> in
      // <a-assets> to recover the real file path, then derive the stem.
      const assetId = this.el.getAttribute("src");
      const assetImg = document.querySelector(assetId);
      const path = assetImg ? assetImg.getAttribute("src") : "";
      const stem = ZoneA.stemFromPath(path);

      if (this.el.sceneEl.is("vr-mode")) {
        // In the headset: build the in-scene 3D focus view (no HTML).
        window.openVRFocus(stem, assetId);
      } else {
        // Desktop / web: the existing HTML overlay, behaviour unchanged.
        window.openDesktopFocus(path);
      }
    };
    this.el.addEventListener("click", this.onClick);
  },
  remove: function () {
    this.el.removeEventListener("click", this.onClick);
  },
});

// ================================================================
// VR LOCOMOTION — these live on the controller entities but move the RIG
// (shared parent of camera + both controllers). Both act ONLY inside an
// immersive session, so desktop WASD + mouse-look are untouched, and they
// coexist with laser-controls on the same entity (laser owns the ray +
// trigger; these read 'thumbstickmoved').
// ================================================================
const MOVE_SPEED = 2; // metres per second — calm, walkable gallery pace
const SNAP_DEG = 45; // degrees per snap-turn flick (comfort, not smooth)

// --- Right thumbstick: smooth, head-relative movement ----------
AFRAME.registerComponent("smooth-locomotion", {
  init: function () {
    this.stick = { x: 0, y: 0 };
    this.rigEl = this.el.parentEl;
    this.cameraEl = document.getElementById("camera");

    // Reused scratch vectors so tick() allocates nothing per frame.
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.move = new THREE.Vector3();
    this.quat = new THREE.Quaternion();

    this.onStick = (e) => {
      this.stick.x = e.detail.x;
      this.stick.y = e.detail.y;
    };
    this.el.addEventListener("thumbstickmoved", this.onStick);
  },
  tick: function (time, delta) {
    if (!this.el.sceneEl.is("vr-mode")) return; // VR only
    const dead = 0.15;
    if (Math.abs(this.stick.x) < dead && Math.abs(this.stick.y) < dead) return;

    // Build flat forward/right from the camera's yaw -> head-relative move.
    this.cameraEl.object3D.getWorldQuaternion(this.quat);
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.right.y = 0;
    this.right.normalize();

    this.move.set(0, 0, 0);
    this.move.addScaledVector(this.forward, -this.stick.y); // forward = -y
    this.move.addScaledVector(this.right, this.stick.x);
    if (this.move.lengthSq() > 1) this.move.normalize();

    const dist = MOVE_SPEED * (delta / 1000); // frame-rate independent
    this.rigEl.object3D.position.addScaledVector(this.move, dist);
  },
  remove: function () {
    this.el.removeEventListener("thumbstickmoved", this.onStick);
  },
});

// --- Left thumbstick: 45° SNAP turn (no smooth rotation) -------
AFRAME.registerComponent("snap-turn", {
  init: function () {
    this.rigEl = this.el.parentEl;
    this.ready = true; // re-arm only after the stick recentres

    this.onStick = (e) => {
      if (!this.el.sceneEl.is("vr-mode")) return; // VR only
      const x = e.detail.x;
      if (this.ready && Math.abs(x) > 0.7) {
        const dir = x > 0 ? -1 : 1; // push right -> turn right
        this.rigEl.object3D.rotation.y += dir * THREE.MathUtils.degToRad(SNAP_DEG);
        this.ready = false;
      } else if (Math.abs(x) < 0.3) {
        this.ready = true; // re-arm
      }
    };
    this.el.addEventListener("thumbstickmoved", this.onStick);
  },
  remove: function () {
    this.el.removeEventListener("thumbstickmoved", this.onStick);
  },
});

// ================================================================
// ContactCue — SHARED contact-cue kit. The zone-agnostic pieces of the floor
// "contact cue" (the runtime radial-gradient TEXTURE, the shadow/glow MATERIAL,
// and the PER-ENVIRONMENT RETUNING) live here as free functions so more than
// one zone can reuse them. Zone A's ring cues (ring-contact-cue, below) and
// Zone B's wall cues (wall-contact-cue, in zone-b.js) both call these; only the
// PLACEMENT of the quads differs per zone. Extracted verbatim from Zone A's
// original methods, so Zone A's appearance is unchanged.
// ================================================================
const ContactCue = {
  // ONE soft radial-gradient texture; falloff encoded in ALPHA. White RGB (hue
  // comes from material.color); alpha = soft power falloff, 1 at the centre ->
  // 0 at the edge (so the square's corners are invisible: no rectangular edge).
  // Higher softness = gentler, fainter spread.
  makeTexture: function (softness) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    const exp = 1 + softness * 3;
    const STOPS = 16;
    for (let i = 0; i <= STOPS; i++) {
      const t = i / STOPS;
      const a = Math.pow(1 - t, exp);
      grad.addColorStop(t, `rgba(255,255,255,${a})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  // ONE shared material per cue set (retuned per environment). depthWrite:false
  // + polygonOffset keep it from z-fighting the floor.
  makeMaterial: function (data, texture) {
    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: data.opacity,
      color: new THREE.Color(data.color),
      side: THREE.DoubleSide,
      depthWrite: false, // don't write depth -> don't fight the floor
      polygonOffset: true, // bias toward camera, belt-and-suspenders vs z-fight
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      blending: THREE.NormalBlending,
    });
  },

  // Retune a cue material to the active environment profile (or fall back to
  // the component's own defaults): shadow = normal blend, glow = additive.
  tuneMaterial: function (material, data, profile) {
    if (!material) return;
    const p = profile || {}; // {} -> falls back to component defaults
    const mode = p.mode || data.mode; // "shadow" | "glow"
    const color = p.color || data.color;
    const opacity = p.opacity != null ? p.opacity : data.opacity;
    const blending =
      mode === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (material.blending !== blending) {
      material.blending = blending;
      material.needsUpdate = true; // blending change requires this
    }
    material.color.set(color);
    material.opacity = opacity;
  },

  // Read environment-manager's currently-active ground profile (it inits before
  // the cues). Presets without a profile -> null -> the cue's shadow default.
  currentProfile: function () {
    const envEl = document.getElementById("environment");
    const mgr =
      envEl && envEl.components && envEl.components["environment-manager"];
    return mgr ? mgr.activeProfile || null : null;
  },
};

// ================================================================
// ring-contact-cue — a per-image floor contact cue for the Zone A ring.
//
// Nine soft radial "pools" on the floor, one directly under each ring image
// (same x,z, derived from zoneARingPlacements() so they can't drift). The
// images do NOT move; this only adds a ground cue so they read as
// deliberately-floating-but-anchored rather than accidentally hovering.
//
// Design notes:
//  - ONE radial-gradient texture, generated on a canvas at runtime, with the
//    falloff in the ALPHA channel (white RGB, so material.color sets the hue).
//    The same texture serves both appearance modes; shared across all nine.
//  - ONE shared material across all nine meshes, so an environment switch
//    retunes a single material (colour / blending / opacity), not nine.
//  - This GEOMETRY is owned by Zone A and PERSISTS across environment switches
//    (it lives under #zone-a, which env teardown never touches). On a switch we
//    only RETUNE the shared material to the active preset's profile.
//  - z-fight guards vs the floor: small +y offset, depthWrite:false, and
//    polygonOffset.
//  - Two modes share texture+geometry, differ only in material settings:
//      shadow (light grounds): normal blend, dark tint, modest opacity.
//      glow   (dark grounds):  additive blend, neon tint, low opacity.
// ================================================================
AFRAME.registerComponent("ring-contact-cue", {
  schema: {
    // -- float-tuning knobs (eyeball live via setAttribute / the inspector) --
    radius: { type: "number", default: 1.3 }, // cue radius (m); > image width (1.4)
    opacity: { type: "number", default: 0.3 }, // base opacity (LOW); profile may override
    softness: { type: "number", default: 0.55 }, // gradient falloff 0 (hard) .. 1 (very soft)
    yoffset: { type: "number", default: 0.02 }, // metres above the floor (y=0)
    // -- base appearance; the active environment profile overrides these --
    color: { type: "color", default: "#000000" }, // tint
    mode: { type: "string", default: "shadow" }, // "shadow" | "glow"
  },

  init: function () {
    this.meshes = [];
    this.geometry = null;
    this.material = null;
    this.texture = null;
    this.curProfile = null; // active environment's profile (or null -> fallback)

    this.group = new THREE.Group();
    this.el.setObject3D("cue", this.group);

    // Reuse environment-manager's already-tracked active preset: it emits
    // "environmentchanged" { preset, profile } on every switch. Listen for it,
    // and read the current value on init (we attach after its first emit).
    this.onEnvChange = (e) => {
      this.applyProfile(e.detail && e.detail.profile);
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
  },

  update: function (oldData) {
    const d = this.data;
    const first = Object.keys(oldData).length === 0;

    if (first) {
      this.buildTexture(); // softness
      this.buildMaterial(); // color/opacity/mode (tuned below)
      this.buildGeometry(); // radius
      this.buildMeshes(); // 9 meshes at ring x,z, flat, +yoffset
      this.tuneMaterial();
      // Pick up the environment that is already active (manager inits first).
      this.applyProfile(this.currentEnvProfile());
      return;
    }

    // Subsequent prop tweaks: rebuild only what changed; geometry persists.
    if (oldData.softness !== d.softness) this.buildTexture();
    if (oldData.radius !== d.radius) this.buildGeometry();
    if (oldData.radius !== d.radius || oldData.yoffset !== d.yoffset) {
      this.layoutMeshes();
    }
    this.tuneMaterial();
  },

  // --- ONE soft radial-gradient texture; falloff encoded in ALPHA ---------
  buildTexture: function () {
    if (this.texture) this.texture.dispose();
    // Shared generator (ContactCue.makeTexture) so Zone B's wall cues get the
    // identical radial-gradient texture; softness is the only input.
    this.texture = ContactCue.makeTexture(this.data.softness);
    if (this.material) {
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
  },

  // --- ONE shared material (retuned per environment) ----------------------
  buildMaterial: function () {
    // Shared material builder (ContactCue.makeMaterial) — same blend + z-fight
    // guards Zone B reuses.
    this.material = ContactCue.makeMaterial(this.data, this.texture);
  },

  buildGeometry: function () {
    if (this.geometry) this.geometry.dispose();
    const d = this.data.radius * 2; // plane spans the cue diameter
    this.geometry = new THREE.PlaneGeometry(d, d);
    this.meshes.forEach((m) => {
      m.geometry = this.geometry;
    });
  },

  buildMeshes: function () {
    zoneARingPlacements().forEach((p) => {
      const mesh = new THREE.Mesh(this.geometry, this.material);
      mesh.rotation.x = -Math.PI / 2; // lie flat, facing up
      mesh.position.set(p.x, this.data.yoffset, p.z);
      this.group.add(mesh);
      this.meshes.push(mesh);
    });
  },

  layoutMeshes: function () {
    const placements = zoneARingPlacements();
    this.meshes.forEach((mesh, i) => {
      mesh.position.set(placements[i].x, this.data.yoffset, placements[i].z);
    });
  },

  // --- retune the shared material to the active profile (or fallback) ------
  applyProfile: function (profile) {
    this.curProfile = profile || null;
    this.tuneMaterial();
  },

  tuneMaterial: function () {
    // Shared retuner (ContactCue.tuneMaterial): shadow/glow + color + opacity
    // from the active env profile, falling back to this component's defaults.
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
  },

  // Read environment-manager's currently-active profile (shared helper).
  currentEnvProfile: function () {
    return ContactCue.currentProfile();
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("environmentchanged", this.onEnvChange);
    this.el.removeObject3D("cue");
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  },
});

// ----------------------------------------------------------------
// spot-contact-cue — ONE contact cue under a single object (a terminal, a
// pedestal, any standalone prop). The smallest possible consumer of the shared
// ContactCue kit: same runtime radial-gradient texture, same shadow/glow
// material, same per-environment retuning as the ring/wall/map cues — only the
// placement differs (one quad at this entity's own local origin, which is
// expected to sit at floor level). Lives wherever its object lives (never
// under #environment), so it persists across environment switches and only
// retunes its material.
//
// Tunables (same knobs as the other cue components):
//   radius / opacity / softness / yoffset (+ color / mode fallbacks).
//   width / depth — OPTIONAL rectangular footprint (metres, local x / z):
//   either overrides its axis of the circular radius*2 default, so wide
//   objects (a bench, a console) get an elliptical pool like Zone C's
//   screen cue.
// ----------------------------------------------------------------
AFRAME.registerComponent("spot-contact-cue", {
  schema: {
    radius: { type: "number", default: 0.45 },
    width: { type: "number", default: 0 }, // m along local x; 0 = radius*2
    depth: { type: "number", default: 0 }, // m along local z; 0 = radius*2
    opacity: { type: "number", default: 0.3 },
    softness: { type: "number", default: 0.55 },
    yoffset: { type: "number", default: 0.02 }, // metres above the local floor
    color: { type: "color", default: "#000000" },
    mode: { type: "string", default: "shadow" }, // "shadow" | "glow"
  },

  init: function () {
    this.curProfile = null;
    this.texture = ContactCue.makeTexture(this.data.softness);
    this.material = ContactCue.makeMaterial(this.data, this.texture);
    this.geometry = new THREE.PlaneGeometry(1, 1); // scaled to diameter below
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2; // lie flat, facing up
    this.el.setObject3D("cue", this.mesh);
    this.layout();

    // Retune with the environment (same contract as every other cue).
    this.onEnvChange = (e) => {
      this.curProfile = (e.detail && e.detail.profile) || null;
      ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
    this.curProfile = ContactCue.currentProfile();
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
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
    this.layout();
    ContactCue.tuneMaterial(this.material, this.data, this.curProfile);
  },

  layout: function () {
    const d = this.data;
    const s = d.radius * 2; // circular default; width/depth override per axis
    // The quad is rotated flat (-90° about x), so its local x spans world x
    // and its local y spans world z: scale (width, depth) gives the ellipse.
    this.mesh.scale.set(d.width > 0 ? d.width : s, d.depth > 0 ? d.depth : s, 1);
    this.mesh.position.set(0, d.yoffset, 0);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("environmentchanged", this.onEnvChange);
    this.el.removeObject3D("cue");
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  },
});
