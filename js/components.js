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
// ring-layout: builds the nine-image half-circle in a JS loop.
// ----------------------------------------------------------------
AFRAME.registerComponent("ring-layout", {
  init: function () {
    // The arc is symmetric around straight-ahead. COUNT images leave
    // COUNT-1 gaps, so each step is the sweep split into COUNT-1.
    const halfSweep = SWEEP_DEG / 2; // 90
    const stepDeg = SWEEP_DEG / (COUNT - 1); // 180 / 8 = 22.5
    const stepRad = stepDeg * (Math.PI / 180);

    // Centre-to-centre arc length we WANT between neighbours: one image
    // width plus the 5% gap.
    const spacing = IMG_SIZE * (1 + GAP_FRAC); // 1.4 * 1.05 = 1.47 m

    // Arc length = radius * angle(rad), so radius = arc / angle.
    const RADIUS = spacing / stepRad; // ~3.74 m
    console.log(`Zone A ring: sweep ${SWEEP_DEG}°, step ${stepDeg.toFixed(2)}°, radius ${RADIUS.toFixed(2)} m`);

    for (let i = 0; i < COUNT; i++) {
      // thetaDeg sweeps -90, -67.5, ... 0 ... +67.5, +90
      const thetaDeg = -halfSweep + i * stepDeg;
      const thetaRad = thetaDeg * (Math.PI / 180); // sin/cos want radians

      // Circle around the camera at the origin:
      //   x = radius * sin(theta)   -> swings left/right
      //   z = -radius * cos(theta)  -> negative z is "in front"
      const x = RADIUS * Math.sin(thetaRad);
      const z = -RADIUS * Math.cos(thetaRad);

      // An a-image faces +Z; rotating by -theta about Y faces the centre.
      const rotY = -thetaDeg;

      const img = document.createElement("a-image");
      img.setAttribute("src", ASSET_PREFIX + (i + 1)); // by id, not path
      img.setAttribute("position", `${x} ${IMG_Y} ${z}`);
      img.setAttribute("rotation", `0 ${rotY} 0`);
      img.setAttribute("width", IMG_SIZE);
      img.setAttribute("height", IMG_SIZE);
      // "clickable" is what the raycaster filters on; the two components add
      // hover-highlight and click-to-focus behaviour.
      img.setAttribute("class", "clickable");
      img.setAttribute("image-hover", "");
      img.setAttribute("focus-on-click", "");
      this.el.appendChild(img);
    }
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
