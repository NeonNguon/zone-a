// ================================================================
// Guide avatar — a flat video cut-out of the artist standing on the floor.
//
// THE VIDEO. avatar/avatar-stacked.mp4 is a plain H.264 file (544x1440) that
// carries its own alpha by STACKING: the top half (rows 0-719) is the colour
// image over black, the bottom half (rows 720-1439) is the matte, white =
// opaque. Plain H.264 because it is the one format every target plays — Safari
// and the Quest browser included. avatar/avatar-alpha.webm (VP9 with real
// alpha) is reference only: Safari cannot decode it.
//
// ONE <video> (#avatar-video in <a-assets>), ONE VideoTexture, ONE draw call:
// the shader below samples both halves of the same texture.
//
// PLAYBACK. The video is muted + playsinline, which most browsers will autoplay
// anyway, so play() is tried once at init. Where that is refused (Quest before
// any interaction, low-power mode on iOS), the FIRST user gesture starts it —
// the same one-time, capture-phase gesture listener Zone B's park audio uses
// (js/zone-b-audio.js), plus enter-vr, which is itself a gesture. The
// page has no shared unlock handler to hook into: each consumer of a gesture
// listens for its own and drops the listener after the first one.
//
// Tunables (setAttribute on the entity, no code edits):
//   height     — the PERSON's real height in metres (top of head to soles).
//   figureFill — fraction of the frame height the figure occupies; the plane
//                is height / figureFill tall so the person comes out `height`.
//   footMargin — fraction of the frame height BELOW the soles (the matte ends
//                at row 709 of 720 on every frame -> 10/720). The plane is sunk
//                by this much so the soles, not the frame's edge, meet y = 0.
//   billboard  — turn about Y (only) to face the camera every frame.
//   contactRadius — the soft floor shadow under the feet (0 = none). Read
//                once, at init.
//
// guide-avatar-spawn (below) places the entity in front of the rig once the
// scene has loaded: `distance` metres along the rig's facing, on the floor.
// ================================================================

// Native size of ONE half of the stacked frame (the colour image).
const AVATAR_FRAME_W = 544;
const AVATAR_FRAME_H = 720;

AFRAME.registerComponent("guide-avatar", {
  schema: {
    src: { type: "selector" }, // the <video>
    height: { type: "number", default: 1.8 },
    billboard: { type: "boolean", default: true },
    figureFill: { type: "number", default: 0.97 },
    footMargin: { type: "number", default: 10 / AVATAR_FRAME_H },
    contactRadius: { type: "number", default: 0.35 }, // 0 = no ground contact
  },

  init: function () {
    this.video = this.data.src;
    if (!this.video) {
      console.warn("guide-avatar: no video for src; nothing to show");
      return;
    }

    // Linear both ways and no mipmaps: the video is redrawn every frame, and
    // mipmapping a 544x1440 frame every frame is wasted work (and would blend
    // the two halves together at the lower levels anyway).
    this.texture = new THREE.VideoTexture(this.video);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.texture },
        // Seam inset, in UV: 2 texel rows of the FULL stacked frame. Bilinear
        // filtering reads half a texel either side of where it samples, and the
        // codec's deblocking smears a pixel or two across row 720, so neither
        // half samples right up to the seam.
        inset: { value: 2 / (AVATAR_FRAME_H * 2) },
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}",
      ].join("\n"),
      fragmentShader: [
        "uniform sampler2D map;",
        "uniform float inset;",
        "varying vec2 vUv;",
        // three stores a VIDEO texture's bytes as they are (sRGB) and leaves
        // the decode to the shader — its own materials do this under
        // DECODE_VIDEO_TEXTURE. A ShaderMaterial gets no such help, so decode
        // here, then let colorspace_fragment re-encode for the output exactly
        // as it does for every built-in material. Net: identical to an
        // unlit sRGB photo texture (MeshBasicMaterial) on the same screen.
        "vec3 avatarSRGBToLinear(vec3 c) {",
        "  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),",
        "             step(vec3(0.04045), c));",
        "}",
        "void main() {",
        // UV v = 0 is the BOTTOM of the texture (flipY), so the colour (top)
        // half is v 0.5..1 and the matte (bottom) half is v 0..0.5.
        "  float vc = mix(0.5 + inset, 1.0, vUv.y);",
        "  float va = mix(0.0, 0.5 - inset, vUv.y);",
        "  float alpha = texture2D(map, vec2(vUv.x, va)).r;",
        "  if (alpha < 0.03) discard;",
        "  vec3 colour = texture2D(map, vec2(vUv.x, vc)).rgb;",
        "  gl_FragColor = vec4(avatarSRGBToLinear(colour), alpha);",
        "  #include <tonemapping_fragment>",
        "  #include <colorspace_fragment>",
        "}",
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // three draws a transparent DoubleSide material twice (back faces, then
      // front) so a closed shape blends in order. A flat plane cannot overlap
      // itself, so the second pass is a wasted draw call.
      forceSinglePass: true,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
    this.el.setObject3D("mesh", this.mesh);

    // GROUND CONTACT: the exhibition's shared spot-contact-cue (js/components.js)
    // — the same soft radial pool, depthWrite:false, tuned to the environment
    // like every other prop's — so the figure stands on the floor rather than
    // hovering over it. A circle, so the billboard turning it changes nothing.
    if (this.data.contactRadius > 0) {
      this.cueEl = document.createElement("a-entity");
      this.cueEl.setAttribute("spot-contact-cue", { radius: this.data.contactRadius });
      this.el.appendChild(this.cueEl);
    }

    // Scratch for the billboard tick (no per-frame allocation).
    this._cam = new THREE.Vector3();

    this.playVideo = () => {
      const p = this.video.play();
      if (p && p.catch) p.catch(function () {});
    };

    // THE GESTURE. Any one will do and only the first matters. On `window` in
    // the capture phase so a click consumed by something else still counts.
    this.onGesture = () => {
      this.playVideo();
      this.dropGesture();
    };
    this.gestureEvents = ["pointerdown", "mousedown", "touchstart", "keydown"];
    this.dropGesture = () => {
      this.gestureEvents.forEach((t) =>
        window.removeEventListener(t, this.onGesture, true)
      );
      this.el.sceneEl.removeEventListener("enter-vr", this.onGesture);
    };
    this.gestureEvents.forEach((t) =>
      window.addEventListener(t, this.onGesture, true)
    );
    this.el.sceneEl.addEventListener("enter-vr", this.onGesture);

    // Try now as well: muted inline video usually may autoplay. A refusal is
    // swallowed, and the gesture above is still waiting either way.
    this.playVideo();
  },

  update: function () {
    if (!this.mesh) return;
    const d = this.data;
    // Plane height is the whole FRAME, so the PERSON comes out `height` tall.
    const h = d.height / d.figureFill;
    const w = h * (AVATAR_FRAME_W / AVATAR_FRAME_H);
    const geo = new THREE.PlaneGeometry(w, h);
    // Bottom edge to y = 0, then down by the empty strip under the soles.
    geo.translate(0, h / 2 - h * d.footMargin, 0);
    if (this.mesh.geometry) this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
  },

  tick: function () {
    if (!this.mesh || !this.data.billboard) return;
    const cam = this.el.sceneEl.camera;
    const parent = this.el.object3D.parent;
    if (!cam || !parent) return;
    // Camera into the PARENT's space, so the yaw is right whatever the entity
    // hangs off. Yaw only: the plane stays upright however high the head is.
    cam.getWorldPosition(this._cam);
    parent.worldToLocal(this._cam);
    const p = this.el.object3D.position;
    const dx = this._cam.x - p.x;
    const dz = this._cam.z - p.z;
    if (dx * dx + dz * dz < 1e-6) return; // standing inside it: keep last yaw
    this.el.object3D.rotation.set(0, Math.atan2(dx, dz), 0);
  },

  remove: function () {
    if (!this.mesh) return;
    this.dropGesture();
    if (this.cueEl && this.cueEl.parentNode) {
      this.cueEl.parentNode.removeChild(this.cueEl); // its remove() disposes
    }
    this.el.removeObject3D("mesh");
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  },
});

// ----------------------------------------------------------------
// guide-avatar-spawn: put this entity `distance` metres ahead of the rig, on
// the floor, facing it — ONCE, when the scene has loaded (so the rig is where
// it is going to start). "Ahead" is the rig's own yaw, flattened to the floor;
// the rig sits at floor level, so its world y is the floor's.
// ----------------------------------------------------------------
AFRAME.registerComponent("guide-avatar-spawn", {
  schema: {
    rig: { type: "selector", default: "#rig" },
    distance: { type: "number", default: 2.2 },
  },

  init: function () {
    this.place = this.place.bind(this);
    const scene = this.el.sceneEl;
    // `loaded` may already have fired (entity added later, fast device).
    if (scene.hasLoaded) this.place();
    else scene.addEventListener("loaded", this.place, { once: true });
  },

  place: function () {
    const rig = this.data.rig;
    const parent = this.el.object3D.parent;
    if (!rig || !parent) {
      console.warn("guide-avatar-spawn: no rig to stand in front of");
      return;
    }
    const origin = new THREE.Vector3();
    rig.object3D.getWorldPosition(origin);
    const q = new THREE.Quaternion();
    rig.object3D.getWorldQuaternion(q);
    // A-Frame's forward is -z. Yaw only: drop any tilt, back to unit length.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();

    const pos = origin.clone().addScaledVector(fwd, this.data.distance);
    parent.worldToLocal(pos);
    this.el.object3D.position.copy(pos);
    // Face the rig (back along -fwd). The billboard keeps this up to date while
    // it is on; with it off, this is the pose it keeps.
    this.el.object3D.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("loaded", this.place);
  },
});
