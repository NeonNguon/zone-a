// ================================================================
// video-screen — a freestanding outdoor screen playing a looping video.
//
// First use: the animation of "The Lottery of Forgotten Dreams" on the park
// square (#lottery-screen in index.html), facing back across the square.
//
// THE VIDEO STREAMS. The lottery animation is 7 minutes of 1080p — 300 MB,
// three times what GitHub takes in one file — so it is not in the repo. It
// plays straight from Vimeo's progressive link, whose CDN answers with
// Access-Control-Allow-Origin: *, which is what lets a cross-origin video
// become a WebGL texture at all. crossOrigin is set BEFORE src, so the very
// first request already asks for CORS. If that link ever changes (the video
// is replaced, or its privacy settings change), `src` in index.html is the
// one thing to update.
//
// IT ONLY RUNS NEAR. Nothing is fetched until the visitor first comes within
// `playRadius` metres, and the video pauses again whenever they are further
// away or the screen is hidden — so the rest of the exhibition never pays
// for a 1080p decoder it cannot see. Muted, because a browser lets a video
// start on its own only when it is; looping.
//
// UNLIT. The picture is a MeshBasicMaterial with tone mapping off: a screen
// emits its own light, so the park's sun and fog do not shade it. three
// decodes the sRGB video for its own materials, so the colours come out as
// they are in the file. The frame and legs ARE lit (standard material), so
// they sit in the park like the benches do.
//
// Tunables (setAttribute, no code edits):
//   src         the video URL
//   width       picture width in metres; height follows the video's aspect
//               (`aspect` until its metadata arrives, or if set by hand)
//   bottom      the picture's lower edge above the floor, metres
//   border      the frame's margin round the picture, metres
//   playRadius  metres from the screen within which it plays
//   region      "x0 z0 x1 z1", a world-space rectangle; when set, it plays
//               while the visitor is INSIDE it instead (a radius big enough
//               for the far side of a 40 m square also reaches the foyer)
//   xrLayer     in the headset, use the compositor layer below (default on)
//   occluders   selector for what can stand in front of the screen
//
// IN THE HEADSET the picture is NOT a WebGL texture. On the Quest, decoding a
// video into a WebGL texture contends with the scene's own rendering and drops
// whole frames — the park's floor, the wall edges and the shoreline flickered
// while it played (Zone C's cinema hit the same thing and solved it the same
// way; see tryCreateXRLayer in js/zone-c.js). So in an immersive session with
// layers, the video goes on a WebXR QUAD LAYER: the headset's compositor pulls
// the decoded frames on its own path, no contention, at full resolution. The
// WebGL screen meanwhile does no per-frame video work at all — it shows a
// STILL, captured once from the video.
//
// A quad layer has no depth: it is drawn over everything. Zone C only shows
// its layer while you are inside the cinema. This screen stands in the open,
// so the layer is shown only while you are IN FRONT of it with a CLEAR VIEW:
// four times a second, rays from your eyes to the screen's corners are cast
// against `occluders` (here the lottery wall and the triptych), and anything
// in the way — or standing behind the screen, or leaving the park — switches
// the layer off. Then the still on the WebGL screen is what you see, hidden
// behind the wall properly like any other surface; it is re-captured each time
// the layer goes off, so it is the moment you looked away from.
//
// The layer list is shared with Zone C's film layer: this adds and removes
// only its own quad, never replaces the list. Desktop is unchanged — a
// desktop GPU does not have the contention, and there are no layers.
// ================================================================

AFRAME.registerComponent("video-screen", {
  schema: {
    src: { type: "string", default: "" },
    width: { type: "number", default: 5.4 },
    aspect: { type: "number", default: 16 / 9 },
    bottom: { type: "number", default: 0.9 },
    border: { type: "number", default: 0.08 },
    playRadius: { type: "number", default: 45 },
    region: { type: "string", default: "" }, // "x0 z0 x1 z1"; overrides playRadius
    frameColor: { type: "color", default: "#1b1b1d" },
    // In the headset: play on a WebXR compositor quad layer, not a WebGL
    // texture (see "IN THE HEADSET" in the header). false = always WebGL.
    xrLayer: { type: "boolean", default: true },
    // Things that can stand between a visitor and the screen (a selector, any
    // number of matches): the quad layer has no depth, so while any of them
    // blocks the view it is switched off and the WebGL still takes over.
    occluders: { type: "string", default: "" },
  },

  init: function () {
    const d = this.data;

    // ONE element; nothing fetched yet (preload none, src set only when the
    // visitor first comes near — see tick).
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; // BEFORE src: the first request asks for CORS
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "none";
    this.video = v;
    this.loaded = false;
    this.aspect = d.aspect;
    this.onMeta = () => {
      if (v.videoWidth && v.videoHeight && !this.attrValue.aspect) {
        this.aspect = v.videoWidth / v.videoHeight;
        this.layout();
      }
    };
    v.addEventListener("loadedmetadata", this.onMeta);

    this.texture = new THREE.VideoTexture(v);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    // Black until the first frame arrives (three skips the upload till then).
    this.screenMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0xffffff,
      toneMapped: false,
    });
    this.frameMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.frameColor),
      roughness: 0.6,
      metalness: 0.1,
    });

    this.group = new THREE.Group();
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.screenMat);
    this.frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.frameMat);
    this.legs = [0, 1].map(() => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.frameMat);
      this.group.add(leg);
      return leg;
    });
    this.group.add(this.frame, this.screen);
    this.el.setObject3D("screen", this.group);

    // The floor's soft shadow under the whole thing, the exhibition's shared
    // contact cue (js/components.js), sized in layout().
    this.cueEl = document.createElement("a-entity");
    this.el.appendChild(this.cueEl);

    this._me = new THREE.Vector3();
    this._cam = new THREE.Vector3();
    this.nextCheck = 0;

    // The compositor layer (headset only; see the header).
    this.layer = null; // the XRQuadLayer, once made
    this.layerShown = false; // in the session's layer list right now
    this.still = null; // CanvasTexture: the WebGL screen's picture meanwhile
    this.nextLayerCheck = 0;
    this._rc = new THREE.Raycaster();
    this._dir = new THREE.Vector3();
    this._corner = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this.onExitVR = () => this.destroyLayer();
    this.el.sceneEl.addEventListener("exit-vr", this.onExitVR);
  },

  update: function () {
    if (this.attrValue.aspect) this.aspect = this.data.aspect;
    this.layout();
  },

  layout: function () {
    const d = this.data;
    const w = d.width;
    const h = w / this.aspect;
    const b = d.border;
    const cy = d.bottom + h / 2;
    const depth = 0.14;

    this.screen.scale.set(w, h, 1);
    this.screen.position.set(0, cy, 0.006); // a hair proud of the frame face
    this.frame.scale.set(w + 2 * b, h + 2 * b, depth);
    this.frame.position.set(0, cy, -depth / 2);
    // Two legs, a third of the way in from each end, from the floor up into
    // the frame.
    const legH = d.bottom + h / 3;
    this.legs.forEach((leg, i) => {
      leg.scale.set(0.12, legH, 0.12);
      leg.position.set((i ? 1 : -1) * (w / 3), legH / 2, -depth / 2);
    });
    this.cueEl.setAttribute("spot-contact-cue", {
      width: w * 0.85,
      depth: 0.9,
      opacity: 0.25,
    });
  },

  // Every ancestor visible: a hidden screen never plays.
  isShown: function () {
    for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return false;
    return true;
  },

  tick: function (t) {
    // The layer, if there is one: re-posed EVERY frame (it lives in the XR
    // reference space, the screen in the world, and locomotion slides one
    // under the other), shown or hidden four times a second.
    if (this.layer) {
      if (this.layerShown) this.poseLayer();
      if (t >= this.nextLayerCheck) {
        this.nextLayerCheck = t + 250;
        this.gateLayer();
      }
    }
    this.checkPlay(t);
  },

  // Twice a second: near and shown -> (load and) play; otherwise pause.
  checkPlay: function (t) {
    if (t < this.nextCheck || !this.data.src) return;
    this.nextCheck = t + 500;
    // In the headset, move the picture onto a compositor layer as soon as the
    // video can be bound (it needs its metadata). No-op on desktop.
    if (!this.layer && this.loaded) this.tryCreateLayer();
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldPosition(this._cam);
    let near;
    const box = this.data.region.trim().split(/\s+/).map(Number);
    if (box.length === 4 && box.every(isFinite)) {
      const c = this._cam;
      near = c.x > box[0] && c.z > box[1] && c.x < box[2] && c.z < box[3];
    } else {
      this.el.object3D.getWorldPosition(this._me);
      const r = this.data.playRadius;
      near = this._me.distanceToSquared(this._cam) < r * r;
    }
    near = near && this.isShown();
    const v = this.video;
    if (near) {
      if (!this.loaded) {
        v.preload = "auto";
        v.src = this.data.src;
        this.loaded = true;
      }
      if (v.paused) {
        const p = v.play();
        if (p && p.catch) p.catch(function () {});
      }
    } else if (!v.paused) {
      v.pause();
    }
    this.near = near;
  },

  // ---------------------------------------------------------------
  // THE COMPOSITOR LAYER (headset only). The recipe is Zone C's
  // (js/zone-c.js tryCreateXRLayer), proven on the Quest; it engages only
  // when every piece is there and otherwise leaves the WebGL texture alone.
  // ---------------------------------------------------------------
  tryCreateLayer: function () {
    const scene = this.el.sceneEl;
    if (!this.data.xrLayer || !scene.is("vr-mode")) return;
    if (typeof XRMediaBinding === "undefined" || typeof XRRigidTransform === "undefined") return;
    const xr = scene.renderer.xr;
    const session = xr.getSession();
    const refSpace = xr.getReferenceSpace();
    if (!session || !refSpace) return;
    const layers = session.renderState.layers;
    if (!layers || !layers.length) return; // session not in layers mode
    const v = this.video;
    if (!v.videoWidth || !v.videoHeight) return; // metadata not ready: next time
    try {
      const w = this.data.width;
      const h = w / this.aspect;
      this.layer = new XRMediaBinding(session).createQuadLayer(v, {
        space: refSpace,
        layout: "mono",
        transform: new XRRigidTransform(),
        // HALF-extents (centre to edge), as Zone C learned the hard way.
        width: w / 2,
        height: h / 2,
      });
      this.layerShown = false;
      // The WebGL screen stops doing video work: a still instead.
      this.showStill();
      this.nextLayerCheck = 0;
      console.log("video-screen: " + (this.el.id || "screen") + " on a WebXR compositor quad layer");
    } catch (e) {
      console.warn("video-screen: XR layer failed — WebGL texture fallback", e);
      this.layer = null;
    }
  },

  // The WebGL screen's picture while the layer owns the video: ONE frame,
  // drawn into a small canvas and uploaded once — not 24 times a second.
  showStill: function () {
    const v = this.video;
    if (!this.stillCanvas) {
      this.stillCanvas = document.createElement("canvas");
      this.stillCanvas.width = 960;
      this.stillCanvas.height = 540;
    }
    const ctx = this.stillCanvas.getContext("2d");
    try {
      ctx.drawImage(v, 0, 0, this.stillCanvas.width, this.stillCanvas.height);
    } catch (e) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, this.stillCanvas.width, this.stillCanvas.height);
    }
    if (!this.still) {
      this.still = new THREE.CanvasTexture(this.stillCanvas);
      this.still.colorSpace = THREE.SRGBColorSpace;
    } else {
      this.still.needsUpdate = true;
    }
    if (this.screenMat.map !== this.still) {
      this.screenMat.map = this.still;
      this.screenMat.needsUpdate = true;
    }
  },

  // refspacePose = inverse(rigWorld) · screenWorld, scale dropped (the
  // layer's size is its own width/height).
  poseLayer: function () {
    const rig = this._rig || (this._rig = document.getElementById("rig"));
    if (!rig) return;
    this.screen.updateWorldMatrix(true, false);
    rig.object3D.updateWorldMatrix(true, false);
    this._m.copy(rig.object3D.matrixWorld).invert().multiply(this.screen.matrixWorld);
    this._m.decompose(this._p, this._q, this._s);
    this.layer.transform = new XRRigidTransform(
      { x: this._p.x, y: this._p.y, z: this._p.z },
      { x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w }
    );
  },

  // Show the layer only when nothing could be in front of it: playing, in
  // front of the screen, and a clear line from the eyes to all four corners.
  gateLayer: function () {
    let want = this.near && !this.video.paused && this.isShown();
    const cam = this.el.sceneEl.camera;
    if (want && cam) {
      cam.getWorldPosition(this._cam);
      // In front: the camera on the picture's +z side.
      this._corner.copy(this._cam);
      this.screen.worldToLocal(this._corner);
      if (this._corner.z < 0.05) want = false;
    }
    if (want) want = this.clearView();
    if (want) this.addLayer();
    else this.removeLayer();
  },

  clearView: function () {
    if (!this.data.occluders) return true;
    const objs = [];
    document.querySelectorAll(this.data.occluders).forEach((e) => objs.push(e.object3D));
    if (!objs.length) return true;
    for (let i = 0; i < 4; i++) {
      this._corner.set(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, 0);
      this.screen.localToWorld(this._corner);
      this._dir.copy(this._corner).sub(this._cam);
      const dist = this._dir.length();
      this._rc.set(this._cam, this._dir.normalize());
      this._rc.far = dist - 0.05;
      if (this._rc.intersectObjects(objs, true).length) return false;
    }
    return true;
  },

  // Add / remove ONLY this quad in the session's layer list — Zone C's film
  // layer may be in there too.
  addLayer: function () {
    if (this.layerShown) return;
    const session = this.el.sceneEl.renderer.xr.getSession();
    if (!session) return;
    this.poseLayer();
    const list = session.renderState.layers.filter((l) => l !== this.layer);
    session.updateRenderState({ layers: list.concat([this.layer]) });
    this.layerShown = true;
  },

  removeLayer: function () {
    if (!this.layerShown) return;
    const session = this.el.sceneEl.renderer.xr.getSession();
    if (session) {
      session.updateRenderState({
        layers: session.renderState.layers.filter((l) => l !== this.layer),
      });
    }
    this.layerShown = false;
    this.showStill(); // the moment you looked away, on the WebGL screen
  },

  destroyLayer: function () {
    if (!this.layer) return;
    try {
      this.removeLayer();
      if (this.layer.destroy) this.layer.destroy();
    } catch (e) {
      /* the session may already be over */
    }
    this.layer = null;
    this.layerShown = false;
    // Back to the live WebGL texture (desktop after leaving the headset).
    this.screenMat.map = this.texture;
    this.screenMat.needsUpdate = true;
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("exit-vr", this.onExitVR);
    this.destroyLayer();
    if (this.still) this.still.dispose();
    const v = this.video;
    v.removeEventListener("loadedmetadata", this.onMeta);
    v.pause();
    v.removeAttribute("src");
    v.load(); // drops the network connection and the decoder
    this.el.removeObject3D("screen");
    if (this.cueEl.parentNode) this.cueEl.parentNode.removeChild(this.cueEl);
    this.screen.geometry.dispose();
    this.frame.geometry.dispose();
    this.legs.forEach((leg) => leg.geometry.dispose());
    this.screenMat.dispose();
    this.frameMat.dispose();
    this.texture.dispose();
  },
});
