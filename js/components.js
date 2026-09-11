// ================================================================
// Custom A-Frame components for Zone A.
// Loaded in <head> (after the A-Frame CDN) so every component is REGISTERED
// before <a-scene> parses and tries to attach it.
// ================================================================

// --- Shared Zone A image config ----------------------------------------
// The nine "All the Places I Have Lived" images. These four constants are all
// that survives of the original half-circle RING (removed in Zone A V2 — the
// images now hang on the walls of three apartments off the chung cu corridor,
// see js/zone-a-corridor.js). They stay HERE, not in the corridor file, because
// they are the ZONE's image config, not the corridor's: image-hover sizes its
// hover frame from IMG_SIZE, and the corridor's room walls hang their images at
// IMG_Y, IMG_SIZE, from ASSET_PREFIX + 1..COUNT.
const COUNT = 9; // number of images
const IMG_SIZE = 1.4; // width & height of each square image, in metres
const IMG_Y = 1.6; // height of each image's centre (eye height)
const ASSET_PREFIX = "#atpihl-"; // asset ids are atpihl-1 .. atpihl-9

// ----------------------------------------------------------------
// zone-a-root: the SINGLE placement handle for the whole Zone A assembly.
// #zone-a is the shared origin everything that stands in the Zone A ROOM hangs
// off — since Zone A V2 that is the outbound teleport booth's manager and the
// info terminal, the images having moved out to the chung cu corridor (a
// separate, far-away root: #zone-a-corridor, js/zone-a-corridor.js). Offsetting
// this one entity moves the whole room assembly as a unit; it touches no
// child's own geometry, only the assembly's position.
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
    // init-order race with it; one offset moves the whole room assembly.
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
// one zone can reuse them. The single-object cues (spot-contact-cue, below) and
// Zone B's wall cues (wall-contact-cue, in zone-b.js) both call these; only the
// PLACEMENT of the quads differs per zone. Extracted verbatim from Zone A's
// original ring cues (removed in Zone A V2 with the ring itself), so every
// remaining cue in the exhibition looks exactly as it always did.
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


// ----------------------------------------------------------------
// spot-contact-cue — ONE contact cue under a single object (a terminal, a
// pedestal, any standalone prop). The smallest possible consumer of the shared
// ContactCue kit: same runtime radial-gradient texture, same shadow/glow
// material, same per-environment retuning as the wall/map cues — only the
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
    // FORCE-GLOW local override. On a dark floor (Zone C's dark terrazzo) the
    // active `void` profile resolves to a near-black shadow pool, which is
    // invisible. Setting forceGlow makes THIS cue ignore the env profile and
    // render as an additive glow with a light tint instead — surviving every
    // `environmentchanged` because the override is re-derived on each tune. Off
    // by default, so Zone A/B cues are unaffected; only the Zone C instances
    // (set in index.html) opt in.
    forceGlow: { type: "boolean", default: false },
    glowColor: { type: "color", default: "#9fb2cc" }, // light tint for the glow
    glowOpacity: { type: "number", default: 0.5 },
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
      ContactCue.tuneMaterial(this.material, this.data, this.effectiveProfile());
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
    this.curProfile = ContactCue.currentProfile();
    ContactCue.tuneMaterial(this.material, this.data, this.effectiveProfile());
  },

  // The profile actually applied: the forceGlow local override when set, else
  // the active environment profile. Re-read on every tune, so the override
  // persists across environment switches.
  effectiveProfile: function () {
    if (this.data.forceGlow) {
      return {
        mode: "glow",
        color: this.data.glowColor,
        opacity: this.data.glowOpacity,
      };
    }
    return this.curProfile;
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
    ContactCue.tuneMaterial(this.material, this.data, this.effectiveProfile());
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
