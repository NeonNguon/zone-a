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

  // Twice a second: near and shown -> (load and) play; otherwise pause.
  tick: function (t) {
    if (t < this.nextCheck || !this.data.src) return;
    this.nextCheck = t + 500;
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
  },

  remove: function () {
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
