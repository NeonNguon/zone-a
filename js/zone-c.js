// ================================================================
// Zone C — outdoor cinema: a single 16:9 video screen OPPOSITE Zone B.
// Loaded in <head> after zone-b.js and BEFORE <a-scene> parses, so the
// component is registered in time.
//
// Pass 1: screen + video texture + minimal control strip + positional audio.
// OUT OF SCOPE until Pass 2: fullscreen/immersive view (the strip reserves a
// placeholder slot for its button), seating, zone entry transition, analytics.
// ================================================================

// Single swappable video source. The final video may move to a CDN later —
// change ONLY this constant. Same-origin today, but the <video> element is
// created with crossorigin="anonymous" so a CDN swap needs no code change.
const VIDEO_URL = "video/GoEastV2.mp4";
// Pre-play thumbnail shown on the screen until the first frame takes over.
const POSTER_URL = "video/thumbnail.jpg";

// ----------------------------------------------------------------
// zone-c-root: the SINGLE placement handle for the whole Zone C assembly,
// mirroring zone-a-root / zone-b-root. Every Zone C child (screen, control
// strip, positional audio) is built under this entity, so moving the one
// `offset` moves the entire cinema as a unit. Default offset started as Zone
// B's mirror across the spawn point (Zone B at 13 3 0 → -13 3 0), then was
// walked in closer to spawn by eye: -10 3 0. Adjust live, e.g.:
//   document.getElementById('zone-c').setAttribute('zone-c-root','offset','-12 3 0')
//
// TUNABLES (all schema properties — adjustable by eye, no code edits):
//   offset                 — assembly position (vec3), the placement handle.
//   screenWidth            — screen width in metres; height derives from 16:9
//                            (used only when screenHeight is 0).
//   screenHeight           — screen height in metres. When > 0 it DRIVES the
//                            size (width = height × 16/9) so the screen can fill
//                            the wall; when 0, the legacy width-driven path runs
//                            (backward compatible).
//   screenHeightAboveFloor — WORLD-floor clearance of the screen's bottom
//                            edge. Pinned to the world floor regardless of the
//                            root's y (same intent as Zone B's floor cues
//                            staying pinned under a raised wall).
//   controlsScale          — uniform size of the control strip (1 = as authored)
//                            — the strip sits just below the screen's bottom edge.
//   controlsFadeDelay      — idle ms before the control strip fades out.
//   audioRefDistance       — full-volume radius of the screen audio (m).
//   audioRolloff           — exponential falloff beyond that radius.
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-c-root", {
  schema: {
    offset: { type: "vec3", default: { x: -10, y: 3, z: 0 } },
    // 9.6 = 80% of the original 12 m screen; the raised bottom edge (1.675 m)
    // keeps the ORIGINAL screen centre (4.375 m) — it shrank in place rather
    // than sinking with its bottom edge. Used only when screenHeight is 0.
    screenWidth: { type: "number", default: 9.6 },
    // 0 = width-driven (legacy). > 0 = height-driven: the screen is this tall
    // and its width derives from 16:9, so it can be sized to fill the wall.
    screenHeight: { type: "number", default: 0 },
    screenHeightAboveFloor: { type: "number", default: 1.675 },
    // The control strip sits just BELOW the screen's bottom edge (flush against
    // the screen plane, over the dark wall — NOT floating in front of the video,
    // which stacked its transparent quads over the bright screen and flickered
    // badly on the Quest). controlsScale shrinks the whole strip uniformly (1 =
    // as authored); leave room below the screen for it via screenHeightAboveFloor.
    controlsScale: { type: "number", default: 1 },
    controlsFadeDelay: { type: "number", default: 4000 }, // ms
    audioRefDistance: { type: "number", default: 8 },
    audioRolloff: { type: "number", default: 5 },
  },

  init: function () {
    this.started = false; // becomes true on the first user-gesture play

    // Control-strip visibility state. The strip starts hidden and fades in on
    // any interaction with the screen or itself; after `controlsFadeDelay` ms
    // idle it fades back out and stops catching raycasts.
    this.stripShown = false;
    this.fade = 0; // 0..1 current strip opacity factor
    this.fadeTarget = 0;
    this.now = 0; // scene time (ms), refreshed every tick for event handlers
    this.lastActive = 0;
    this.stripHover = 0; // pointers currently over strip elements (no fade)
    this.scrubbing = false;
    this.scrubCursor = null; // the cursor/controller entity dragging the seek
    this.rayLast = {}; // per-raycaster last hit point on the screen (motion)
    this._hasFrame = undefined; // screen white/black state (video frame ready?)
    this._preloadStarted = false; // full-file preload kicked off yet?
    this._blobUrl = null; // object URL of the fully-downloaded film (if any)
    this.xrLayer = null; // active WebXR compositor video layer (Quest), if any
    this.usingLayer = false; // film is on the XR layer (WebGL screen detached)
    this.layerComposited = false; // quad currently in the session's render state?
    this._threeLayer = null; // three's projection layer (the scene) to keep alongside

    this.buildVideo();
    this.build();
    this.buildControls();

    // First click on the screen is THE user gesture that unlocks playback
    // (Quest/mobile refuse programmatic play before one). Desktop mouse and
    // VR laser trigger both arrive here as the same `click`. Later clicks
    // just count as activity, reviving the control strip.
    this.onScreenClick = () => {
      this.activity();
      if (!this.started) this.startPlayback();
    };
    this.screenEl.addEventListener("click", this.onScreenClick);
    this.onScreenEnter = () => this.activity();
    this.screenEl.addEventListener("mouseenter", this.onScreenEnter);
  },

  update: function () {
    const o = this.data.offset;
    // Drive the position component (not object3D directly) so there is no
    // init-order race with it; one offset moves screen + controls + audio.
    this.el.setAttribute("position", { x: o.x, y: o.y, z: o.z });
    if (this.container) this.layout();
    this.applyAudioTunables();
    // Broadcast so the screen's floor cue re-derives against the new offset /
    // screenWidth — it stays pinned to the world floor regardless of the
    // root's y (same contract as zone-b-root's zonebrootchanged).
    this.el.emit("zonecrootchanged");
  },

  // --- static scene graph: built once; layout() owns all sizes/positions ---
  build: function () {
    // Container rotated to face the spawn point: Zone C sits on -x, planes
    // face local +z, and `0 90 0` turns local +z to world +x — back toward
    // spawn. (Zone B is the mirror image: +x position, `0 -90 0` rotation.)
    const container = document.createElement("a-entity");
    container.setAttribute("rotation", "0 90 0");
    this.el.appendChild(container);
    this.container = container;

    // The screen: shows the film's thumbnail until the video's first frame
    // takes over (dark until the poster loads, so it never reads as a hole).
    // No play glyph on top — the control strip appears on hover and carries
    // the affordance. The screen is ALWAYS clickable: first click starts
    // playback (the user gesture Quest/mobile require); later clicks just
    // revive the control strip.
    const screen = document.createElement("a-plane");
    screen.setAttribute("class", "clickable");
    // Pure-black base. shader: flat is MeshBasicMaterial, whose color MULTIPLIES
    // the video map (white = show the video, black = show black), so the base
    // colour is what the screen falls back to when there is no frame to show —
    // black keeps a Quest decoder hitch from flashing a bright white plane in
    // the dark room. tick() drives it white/black off the video's readyState.
    screen.setAttribute(
      "material",
      "shader: flat; color: #000000; fog: false"
    );
    container.appendChild(screen);
    this.screenEl = screen;
    this.loadPoster();

    this.layout();
  },

  // Poster is loaded manually (not via the material's src) so it shares the
  // same swap path as the video texture and can't race it: whichever of
  // [poster loaded / mesh ready] finishes last applies it, and it never
  // overwrites an already-running video map.
  loadPoster: function () {
    this.posterTexture = null;
    const apply = () => {
      const mesh = this.screenEl.getObject3D("mesh");
      if (!mesh || !this.posterTexture || this.videoTexture) return;
      mesh.material.map = this.posterTexture;
      mesh.material.color.set("#ffffff");
      mesh.material.needsUpdate = true;
    };
    new THREE.TextureLoader().load(
      POSTER_URL,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.posterTexture = tex;
        apply();
      },
      undefined,
      () => console.warn("zone-c: poster failed to load", POSTER_URL)
    );
    this.screenEl.addEventListener("loaded", apply, { once: true });
  },

  // --- sizes/positions from the live schema (re-run on any tunable change) --
  layout: function () {
    const d = this.data;
    // Two sizing modes: screenHeight > 0 DRIVES the size (width from 16:9) so
    // the screen can fill the wall; screenHeight 0 keeps the legacy width-driven
    // behaviour. `screenW` is published for the contact cue's AUTO width, which
    // must follow the ACTUAL screen width in either mode.
    let w, h;
    if (d.screenHeight > 0) {
      h = d.screenHeight;
      w = (h * 16) / 9;
    } else {
      w = d.screenWidth;
      h = (w * 9) / 16;
    }
    this.screenW = w;

    // screenHeightAboveFloor is measured from the WORLD floor (y=0), so the
    // screen's bottom edge stays put even if the root's y offset changes —
    // subtract the root's y to convert into this entity's local space.
    const centerY = d.screenHeightAboveFloor + h / 2 - d.offset.y;

    this.screenEl.setAttribute("width", w);
    this.screenEl.setAttribute("height", h);
    this.screenEl.setAttribute("position", `0 ${centerY} 0`);

    if (this.stripEl) this.layoutControls();
  },

  // ================================================================
  // CONTROL STRIP — a minimal row just BELOW the screen's bottom edge, flush
  // against the screen plane (controlsScale sizes it):
  //   [play/pause] [restart] [------- seek track -------] [fs slot]
  // Flat quads only, no fonts (icons are triangles/bars, so nothing depends
  // on a glyph existing in a text font). Each button's dark backing plane IS
  // its hit target, sized generously for Quest controller pointing.
  // The rightmost slot is a RESERVED PLACEHOLDER for Pass 2's fullscreen
  // button — inert and near-invisible, it just keeps the layout stable.
  // ================================================================
  buildControls: function () {
    const strip = document.createElement("a-entity");
    strip.setAttribute("visible", false); // hidden until first interaction
    this.container.appendChild(strip);
    this.stripEl = strip;

    const flat = (color, opacity) =>
      `shader: flat; color: ${color}; transparent: true; opacity: ${opacity}; fog: false`;

    const plane = (parent, w, h, mat) => {
      const p = document.createElement("a-plane");
      p.setAttribute("width", w);
      p.setAttribute("height", h);
      p.setAttribute("material", mat);
      parent.appendChild(p);
      return p;
    };
    const tri = (parent, a, b, c, mat) => {
      const t = document.createElement("a-triangle");
      t.setAttribute("vertex-a", a);
      t.setAttribute("vertex-b", b);
      t.setAttribute("vertex-c", c);
      t.setAttribute("material", mat);
      parent.appendChild(t);
      return t;
    };

    // Backing panel (not a hit target — the buttons/track are).
    this.panelEl = plane(strip, 1, 0.7, flat("#101010", 0.8));

    // --- play/pause button: one backing plane, two swapped icons ----------
    this.playBtn = plane(strip, 0.6, 0.6, flat("#1d1d1d", 0.9));
    this.playIcon = tri(
      this.playBtn,
      "-0.13 0.18 0",
      "-0.13 -0.18 0",
      "0.19 0 0",
      flat("#e8e8e8", 1)
    );
    this.playIcon.setAttribute("position", "0 0 0.01");
    this.pauseIcon = document.createElement("a-entity");
    this.pauseIcon.setAttribute("position", "0 0 0.01");
    this.playBtn.appendChild(this.pauseIcon);
    plane(this.pauseIcon, 0.1, 0.36, flat("#e8e8e8", 1)).setAttribute(
      "position",
      "-0.09 0 0"
    );
    plane(this.pauseIcon, 0.1, 0.36, flat("#e8e8e8", 1)).setAttribute(
      "position",
      "0.09 0 0"
    );
    this.pauseIcon.setAttribute("visible", false);

    // --- restart button: skip-to-start icon (bar + left triangle) ---------
    this.restartBtn = plane(strip, 0.6, 0.6, flat("#1d1d1d", 0.9));
    plane(this.restartBtn, 0.06, 0.32, flat("#e8e8e8", 1)).setAttribute(
      "position",
      "-0.13 0 0.01"
    );
    tri(
      this.restartBtn,
      "0.17 0.16 0",
      "0.17 -0.16 0",
      "-0.05 0 0",
      flat("#e8e8e8", 1)
    ).setAttribute("position", "0 0 0.01");

    // --- seek bar: generous invisible hit plane + thin visual track -------
    // The hit plane spans EXACTLY the track width so intersection uv.x maps
    // 1:1 to playback fraction; its extra height forgives shaky VR pointing.
    this.trackHit = plane(strip, 1, 0.5, flat("#ffffff", 0));
    this.trackEl = plane(this.trackHit, 1, 0.06, flat("#5a5a5a", 0.9));
    this.trackEl.setAttribute("position", "0 0 0.01");
    this.fillEl = plane(this.trackHit, 1, 0.06, flat("#ffffff", 1));
    this.knobEl = plane(this.trackHit, 0.05, 0.2, flat("#ffffff", 1));

    // --- Pass 2 placeholder: fullscreen button will live here -------------
    this.fsSlot = plane(strip, 0.6, 0.6, flat("#1d1d1d", 0.25));

    // Hit targets that gain/lose the `clickable` class with strip visibility,
    // so a faded-out strip stops catching raycasts entirely.
    this.stripClickables = [this.playBtn, this.restartBtn, this.trackHit];

    // Hover bookkeeping: while any pointer rests ON the strip it never fades.
    this.onStripEnter = () => {
      this.stripHover++;
      this.activity();
    };
    this.onStripLeave = () => {
      this.stripHover = Math.max(0, this.stripHover - 1);
    };
    this.stripClickables.forEach((el) => {
      el.addEventListener("mouseenter", this.onStripEnter);
      el.addEventListener("mouseleave", this.onStripLeave);
    });

    this.onPlayClick = () => {
      this.activity();
      const v = this.videoEl;
      if (!this.started || v.paused || v.ended) this.startPlayback();
      else v.pause();
    };
    this.playBtn.addEventListener("click", this.onPlayClick);

    this.onRestartClick = () => {
      this.activity();
      this.startPlayback(); // also the unlock gesture if nothing played yet
      this.seekTo(0);
    };
    this.restartBtn.addEventListener("click", this.onRestartClick);

    // Seek: press starts a scrub (and seeks immediately); tick() follows the
    // pointer while held; release anywhere ends it. mousedown/mouseup come
    // from the desktop cursor, triggerup from the VR controller.
    this.onTrackDown = (e) => this.beginScrub(e);
    this.trackHit.addEventListener("mousedown", this.onTrackDown);
    this._endScrub = () => this.endScrub();

    this.layoutControls();
  },

  layoutControls: function () {
    const d = this.data;
    const scale = d.controlsScale > 0 ? d.controlsScale : 1;
    // Uniform shrink of the whole strip (panel + buttons + track together), so
    // it reads compact under the big screen without re-tuning every child.
    this.stripEl.object3D.scale.set(scale, scale, scale);

    // Panel width is capped so it does NOT track the wall-filling screen width
    // (that made it huge); a compact fixed-ish strip, then controlsScale tunes it.
    const screenW = this.screenW || d.screenWidth;
    const panelW = Math.min(5.5, Math.max(4.5, screenW * 0.6));
    const panelH = 0.7;

    // The strip sits just BELOW the screen's bottom edge, flush against the
    // screen plane (local z 0.02) — over the dark wall, not over the bright
    // video. Pinned to the WORLD floor like the screen: the clearance below the
    // bottom edge is in the strip's own units, so it scales with controlsScale.
    const gap = 0.2; // strip-local metres between screen bottom and strip top
    const centerWorldY =
      d.screenHeightAboveFloor - (gap + panelH / 2) * scale;
    this.stripEl.setAttribute("position", `0 ${centerWorldY - d.offset.y} 0.02`);

    this.panelEl.setAttribute("width", panelW);
    this.panelEl.setAttribute("height", panelH);

    const playX = -panelW / 2 + 0.55;
    const restartX = playX + 0.85;
    const fsX = panelW / 2 - 0.55;
    this.playBtn.setAttribute("position", `${playX} 0 0.01`);
    this.restartBtn.setAttribute("position", `${restartX} 0 0.01`);
    this.fsSlot.setAttribute("position", `${fsX} 0 0.01`);

    const trackLeft = restartX + 0.75;
    const trackRight = fsX - 0.75;
    this.trackW = trackRight - trackLeft;
    this.trackHit.setAttribute("width", this.trackW);
    this.trackHit.setAttribute(
      "position",
      `${(trackLeft + trackRight) / 2} 0 0.01`
    );
    this.trackEl.setAttribute("width", this.trackW);
    this.fillEl.setAttribute("width", this.trackW);
    this.updateProgress();
  },

  // Progress fill + knob from the video's current position. The fill plane is
  // track-wide and LEFT-ANCHORED via scale + recentred position (updating a
  // width attribute would rebuild geometry every frame).
  updateProgress: function () {
    const v = this.videoEl;
    const frac =
      v && v.duration && isFinite(v.duration) ? v.currentTime / v.duration : 0;
    const w = this.trackW;
    this.fillEl.object3D.scale.x = Math.max(frac, 0.0001);
    this.fillEl.object3D.position.set(-w / 2 + (frac * w) / 2, 0, 0.02);
    this.knobEl.object3D.position.set(-w / 2 + frac * w, 0, 0.03);
  },

  // --- activity / visibility ------------------------------------------------
  // Any interaction stamps the idle clock and revives the strip. `this.now`
  // is scene time captured each tick — events reuse the latest tick's stamp.
  activity: function () {
    this.lastActive = this.now;
    this.showControls();
  },

  showControls: function () {
    this.fadeTarget = 1;
    if (this.stripShown) return;
    this.stripShown = true;
    this.stripEl.setAttribute("visible", true);
    this.stripClickables.forEach((el) => el.classList.add("clickable"));
    this.refreshRaycasters();
  },

  // Fading out = animate opacity down in tick(); ONLY when it reaches zero is
  // the strip actually hidden + declassed so raycasts pass through it.
  hideControls: function () {
    this.fadeTarget = 0;
  },

  deactivateStrip: function () {
    if (!this.stripShown) return;
    this.stripShown = false;
    this.stripEl.setAttribute("visible", false);
    this.stripClickables.forEach((el) => el.classList.remove("clickable"));
    this.refreshRaycasters();
  },

  applyFade: function () {
    const f = this.fade;
    this.stripEl.object3D.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      // Capture each material's authored opacity once, first time we see it.
      if (node.userData.zcBaseOpacity === undefined) {
        node.userData.zcBaseOpacity = node.material.opacity;
      }
      node.material.opacity = node.userData.zcBaseOpacity * f;
    });
  },

  // --- seek scrub -------------------------------------------------------
  beginScrub: function (e) {
    this.activity();
    this.scrubbing = true;
    this.scrubCursor = (e.detail && e.detail.cursorEl) || null;
    const hit = e.detail && e.detail.intersection;
    if (hit && hit.uv) this.seekFrac(hit.uv.x);
    window.addEventListener("mouseup", this._endScrub);
    if (this.scrubCursor) {
      this.scrubCursor.addEventListener("triggerup", this._endScrub);
    }
  },

  endScrub: function () {
    if (!this.scrubbing) return;
    this.scrubbing = false;
    this.activity();
    window.removeEventListener("mouseup", this._endScrub);
    if (this.scrubCursor) {
      this.scrubCursor.removeEventListener("triggerup", this._endScrub);
      this.scrubCursor = null;
    }
  },

  seekFrac: function (f) {
    const v = this.videoEl;
    // Guard: no seeking before metadata (duration unknown until readyState 1).
    if (!v || v.readyState < 1 || !isFinite(v.duration)) return;
    const t = Math.min(Math.max(f, 0), 1) * v.duration;
    // Small dead-band so a held-still scrub doesn't spam currentTime writes.
    if (Math.abs(t - v.currentTime) > 0.1) v.currentTime = t;
  },

  seekTo: function (t) {
    const v = this.videoEl;
    if (!v || v.readyState < 1) return;
    v.currentTime = t;
  },

  // --- per-frame: fade animation, idle timeout, scrub follow, progress ----
  tick: function (time, dt) {
    this.now = time;

    if (this.usingLayer) {
      // Film on the WebXR compositor layer: composite it only while the viewer
      // is inside Zone C (else it shows through walls), and keep it pinned to the
      // screen as the rig moves.
      this.updateLayerVisibility();
      if (this.layerComposited) this.updateXRLayerTransform();
    } else if (this.started && this.videoTexture) {
      // Screen fails to BLACK, not white. The flat material's colour multiplies
      // the video map, so white shows the video and black shows black. Whenever
      // the video has no current frame to display (readyState < HAVE_CURRENT_DATA
      // — a decoder stall/hitch), drive the colour black so the screen goes dark
      // instead of flashing a bright white plane; back to white the moment a
      // frame is available. Change-guarded so it's one colour set per transition.
      const hasFrame = this.videoEl.readyState >= 2; // HAVE_CURRENT_DATA
      if (hasFrame !== this._hasFrame) {
        this._hasFrame = hasFrame;
        const mesh = this.screenEl.getObject3D("mesh");
        if (mesh && mesh.material) {
          mesh.material.color.set(hasFrame ? "#ffffff" : "#000000");
        }
      }
    }

    // Pointer MOTION on the big screen counts as activity (mouseenter only
    // fires once, so a moving pointer inside the screen would otherwise read
    // as idle). Compares each raycaster's hit point frame to frame.
    this.pollScreenMotion();

    // Follow the held pointer along the seek track.
    if (this.scrubbing) {
      const rcEl = this.scrubCursor || this.mouseCursorEl();
      const rc = rcEl && rcEl.components && rcEl.components.raycaster;
      const hit = rc && rc.getIntersection(this.trackHit);
      if (hit && hit.uv) {
        this.seekFrac(hit.uv.x);
        this.activity();
      }
    }

    if (this.stripShown) {
      this.updateProgress();

      // Idle timeout — never while scrubbing, while a pointer rests on it, or
      // while the film is on the XR layer (the strip is the only way to reach
      // pause/restart/seek there, so it must stay put).
      if (
        this.fadeTarget === 1 &&
        !this.usingLayer &&
        !this.scrubbing &&
        this.stripHover <= 0 &&
        time - this.lastActive > this.data.controlsFadeDelay
      ) {
        this.hideControls();
      }

      // Fade animation (~250 ms each way).
      const step = dt / 250;
      if (this.fadeTarget === 1 && this.fade < 1) {
        this.fade = Math.min(1, this.fade + step);
        this.applyFade();
      } else if (this.fadeTarget === 0 && this.fade > 0) {
        this.fade = Math.max(0, this.fade - step);
        this.applyFade();
        if (this.fade === 0) this.deactivateStrip();
      }
    }
  },

  pollScreenMotion: function () {
    // DESKTOP MOUSE ONLY — deliberately not the VR controllers: a hand is
    // never perfectly still, so laser jitter on a 12 m screen would count as
    // perpetual activity and the strip would never fade while the laser rests
    // on the screen (the natural pose while watching). In VR the strip is
    // revived by mouseenter/click as the ray sweeps back onto screen or strip.
    const el = this.mouseCursorEl();
    const rc = el && el.components && el.components.raycaster;
    if (!rc) return;
    const hit = rc.getIntersection(this.screenEl);
    if (hit && hit.point) {
      const last = this.rayLast.mouse;
      if (last && last.distanceTo(hit.point) > 0.02) this.activity();
      this.rayLast.mouse = (last || new THREE.Vector3()).copy(hit.point);
    } else {
      this.rayLast.mouse = null;
    }
  },

  mouseCursorEl: function () {
    if (!this._mouseCursorEl) {
      this._mouseCursorEl = this.el.sceneEl.querySelector("[cursor]");
    }
    return this._mouseCursorEl;
  },

  // Nudge every raycaster to rebuild its `.clickable` target list after the
  // strip gains/loses the class (mirrors Zone B's refresh helper, plus the
  // desktop mouse cursor).
  refreshRaycasters: function () {
    const els = [
      this.mouseCursorEl(),
      document.getElementById("rightHand"),
      document.getElementById("leftHand"),
    ];
    els.forEach((el) => {
      const rc = el && el.components && el.components.raycaster;
      if (rc) rc.refreshObjects();
    });
  },

  // --- the <video> element: created up front, PLAYED only on user gesture ---
  buildVideo: function () {
    const v = document.createElement("video");
    // crossorigin BEFORE src so the fetch itself carries it. Same-origin
    // today (no CORS in play), but this keeps the element CDN-ready.
    v.crossOrigin = "anonymous";
    v.preload = "auto"; // hint the browser to buffer ahead (see preloadVideo)
    v.playsInline = true;
    v.setAttribute("playsinline", ""); // attribute form for older mobile WebKit
    v.loop = false;
    v.src = VIDEO_URL;
    this.videoEl = v;
    this.videoTexture = null;

    // FULLY preload the film in the background so playback + seeking never stall
    // on the network, and it's also ready for the WebXR layer. Kick off as soon
    // as the scene is ready — well before the visitor walks to Zone C.
    this.startPreload = () => this.preloadVideo();
    if (this.el.sceneEl.hasLoaded) this.preloadVideo();
    else this.el.sceneEl.addEventListener("loaded", this.startPreload, { once: true });

    // Entering VR: preload backstop + move the film onto a WebXR compositor layer
    // (tryCreateXRLayer). Leaving VR: tear the layer down. `loadeddata` retries
    // the layer if the video's metadata wasn't ready yet at first play.
    this.onEnterVR = () => {
      this.preloadVideo();
      this.tryCreateXRLayer();
    };
    this.onExitVR = () => this.destroyXRLayer();
    this.onVideoReady = () => {
      if (this.el.sceneEl.is("vr-mode")) this.tryCreateXRLayer();
    };
    this.el.sceneEl.addEventListener("enter-vr", this.onEnterVR);
    this.el.sceneEl.addEventListener("exit-vr", this.onExitVR);
    v.addEventListener("loadeddata", this.onVideoReady);

    // The video element is the single source of truth for play state — the
    // icons follow its events rather than our click handlers, so external
    // pauses (tab hidden, headset removed) stay in sync too.
    this.onVideoState = () => this.updatePlayIcon();
    v.addEventListener("play", this.onVideoState);
    v.addEventListener("pause", this.onVideoState);
    this.onVideoEnded = () => {
      this.updatePlayIcon();
      this.activity(); // surface the strip so replay is one click away
    };
    v.addEventListener("ended", this.onVideoEnded);
  },

  updatePlayIcon: function () {
    const v = this.videoEl;
    const showPlay = !this.started || v.paused || v.ended;
    this.playIcon.setAttribute("visible", showPlay);
    this.pauseIcon.setAttribute("visible", !showPlay);
  },

  // Download the ENTIRE film once, in the background, and play it from memory —
  // so neither playback nor seeking ever waits on the network. Fetches the file
  // to a Blob and points the <video> at an object URL. We only swap the source
  // if playback hasn't begun (swapping resets currentTime); if the visitor
  // starts the film before the download finishes they stay on the streaming
  // source (the pre-existing behaviour) — but the download starts at scene load,
  // so it is almost always ready first. Guarded to run once; safe to call from
  // several triggers.
  preloadVideo: function () {
    if (this._preloadStarted) return;
    this._preloadStarted = true;
    fetch(VIDEO_URL)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.blob();
      })
      .then((blob) => {
        this._blobUrl = URL.createObjectURL(blob);
        // Only adopt the fully-buffered source before the first play — otherwise
        // it would reset an in-progress viewing.
        if (!this.started) this.videoEl.src = this._blobUrl;
        console.log("zone-c: film fully preloaded (" +
          Math.round(blob.size / 1e6) + " MB, playing from memory)");
      })
      .catch((err) => console.warn("zone-c: film preload failed", err));
  },

  // ================================================================
  // WebXR COMPOSITOR VIDEO LAYER (Quest). Show the film on a native WebXR quad
  // layer instead of a WebGL texture on the screen plane. On the Quest, actively
  // decoding a video INTO a WebGL texture contends with the app's own rendering
  // and drops whole frames — the cleared background flashes through the screen
  // and the room edges (this is the playback flicker; it stops the instant you
  // pause, because the decoder stops). A media quad layer hands the video to the
  // headset's COMPOSITOR, which pulls decoded frames on its own path — no
  // contention — and composites at full resolution (sharper than a resampled
  // texture, too).
  //
  // Defensive: engages only when an immersive session is in LAYERS mode,
  // XRMediaBinding exists, and the video's metadata is ready; anything missing
  // falls back to the WebGL video texture (so desktop + unsupported headsets are
  // unchanged). The quad is re-posed every frame to the screen's world transform
  // relative to the locomotion rig, so it stays fixed in the room as you move.
  // ================================================================
  tryCreateXRLayer: function () {
    if (this.xrLayer || !this.started) return;
    const sceneEl = this.el.sceneEl;
    if (!sceneEl.is("vr-mode")) return;
    if (typeof XRMediaBinding === "undefined") {
      console.warn("zone-c: XRMediaBinding unavailable — WebGL screen fallback");
      return;
    }
    const renderer = sceneEl.renderer;
    const session = renderer.xr.getSession();
    const refSpace = renderer.xr.getReferenceSpace();
    if (!session || !refSpace) return;
    const existing = session.renderState.layers;
    if (!existing || !existing.length) {
      console.warn("zone-c: XR session not in layers mode — WebGL screen fallback");
      return;
    }
    const v = this.videoEl;
    if (!v.videoWidth || !v.videoHeight) return; // metadata not ready; retry later
    try {
      const binding = new XRMediaBinding(session);
      const w = this.screenW || this.data.screenWidth;
      const h = this.data.screenHeight > 0 ? this.data.screenHeight : (w * 9) / 16;
      this.xrLayer = binding.createQuadLayer(v, {
        space: refSpace,
        layout: "mono",
        transform: new XRRigidTransform(),
        // XRQuadLayer width/height are HALF-extents (distance from centre to
        // edge), so halve the screen size — passing full dims made the layer 2×,
        // which loomed toward the viewer and clipped through the floor.
        width: w / 2,
        height: h / 2,
      });
      this._threeLayer = existing[0]; // three's projection layer (the scene)
      this.updateXRLayerTransform();
      this.usingLayer = true;
      this.layerComposited = false;
      this.detachWebglVideo(); // stop the WebGL screen doing ANY video work
      // The video quad hides the screen, so bring the control strip up and keep
      // it up (tick won't auto-fade it while usingLayer) — otherwise the film
      // plays with no reachable pause/restart/seek.
      this.showControls();
      // Composite the quad ONLY while the viewer is inside Zone C. Quad layers
      // have no depth occlusion against the scene, so a permanently-on quad shows
      // through the walls from every other room; gating it on location keeps the
      // film out of sight until you're in the cinema (where it reads correctly).
      this.updateLayerVisibility();
      console.log("zone-c: film on a WebXR compositor quad layer");
    } catch (e) {
      console.warn("zone-c: XR video layer failed — WebGL screen fallback", e);
      this.xrLayer = null;
      this.usingLayer = false;
    }
  },

  // Re-pose the quad each frame. Its transform lives in the XR REFERENCE space,
  // but the screen lives in WORLD space and the rig slides the world under the
  // refspace during locomotion, so: refspacePose = inverse(rigWorld) · screenWorld.
  updateXRLayerTransform: function () {
    if (!this.xrLayer) return;
    const rig = this._rigEl || (this._rigEl = document.getElementById("rig"));
    if (!rig) return;
    const s = this.screenEl.object3D;
    s.updateWorldMatrix(true, false);
    rig.object3D.updateWorldMatrix(true, false);
    const m = (this._xrMat || (this._xrMat = new THREE.Matrix4()))
      .copy(rig.object3D.matrixWorld)
      .invert()
      .multiply(s.matrixWorld);
    const p = this._xrPos || (this._xrPos = new THREE.Vector3());
    const q = this._xrQuat || (this._xrQuat = new THREE.Quaternion());
    const sc = this._xrScl || (this._xrScl = new THREE.Vector3());
    m.decompose(p, q, sc);
    this.xrLayer.transform = new XRRigidTransform(
      { x: p.x, y: p.y, z: p.z },
      { x: q.x, y: q.y, z: q.z, w: q.w }
    );
  },

  // Zone C's footprint in WORLD coords (read live from the floorplan, cached).
  zoneCBounds: function () {
    if (this._zcBounds) return this._zcBounds;
    const fp = document.getElementById("floorplan");
    const attr = fp && fp.getAttribute("floorplan");
    const r = attr && attr.rooms && attr.rooms.zoneC;
    if (!r) return null;
    this._zcBounds = {
      xmin: r.cx - r.w / 2,
      xmax: r.cx + r.w / 2,
      zmin: r.cz - r.d / 2,
      zmax: r.cz + r.d / 2,
    };
    return this._zcBounds;
  },

  // Composite the quad only while the camera is inside Zone C's footprint. The
  // boundary sits at the walls, so the film pops in as you cross the doorway and
  // is never seen through a wall from another room. (No occlusion is needed
  // INSIDE the room — nothing stands between the viewer and the back-wall screen.)
  updateLayerVisibility: function () {
    const b = this.zoneCBounds();
    if (!b) return;
    const cam = this._cameraEl || (this._cameraEl = document.getElementById("camera"));
    if (!cam) return;
    const p = cam.object3D.getWorldPosition(
      this._camPos || (this._camPos = new THREE.Vector3())
    );
    const inside =
      p.x >= b.xmin && p.x <= b.xmax && p.z >= b.zmin && p.z <= b.zmax;
    if (inside) this.addLayer();
    else this.removeLayer();
  },

  addLayer: function () {
    if (this.layerComposited || !this.xrLayer || !this._threeLayer) return;
    const session = this.el.sceneEl.renderer.xr.getSession();
    if (!session) return;
    // Quad AFTER the projection layer = composited on top of the scene.
    session.updateRenderState({ layers: [this._threeLayer, this.xrLayer] });
    this.layerComposited = true;
  },

  removeLayer: function () {
    if (!this.layerComposited) return;
    const session = this.el.sceneEl.renderer.xr.getSession();
    if (session && this._threeLayer) {
      session.updateRenderState({ layers: [this._threeLayer] });
    }
    this.layerComposited = false;
  },

  // Strip the video off the WebGL screen so it does no decode/upload work while
  // the compositor layer owns the film (that WebGL video work IS the contention).
  // The plane shows the POSTER STILL (a static image — no per-frame decode/upload,
  // so no contention): the live video quad covers it while you're inside Zone C,
  // and from OUTSIDE (through the doorway, properly wall-occluded since the WebGL
  // screen has real depth) it reads as a still frame instead of a black hole. It
  // also stays the click target behind the quad. Falls back to black if the
  // poster hasn't loaded yet.
  detachWebglVideo: function () {
    const mesh = this.screenEl.getObject3D("mesh");
    if (mesh && mesh.material) {
      mesh.material.map = this.posterTexture || null;
      mesh.material.color.set(this.posterTexture ? "#ffffff" : "#000000");
      mesh.material.needsUpdate = true;
    }
    this._hasFrame = undefined;
  },

  destroyXRLayer: function (restore) {
    if (!this.xrLayer) return;
    const session = this.el.sceneEl.renderer.xr.getSession();
    try {
      if (session && this._threeLayer) {
        session.updateRenderState({ layers: [this._threeLayer] });
      }
      if (this.xrLayer.destroy) this.xrLayer.destroy();
    } catch (e) {
      /* session may already be ending */
    }
    this.xrLayer = null;
    this.usingLayer = false;
    this.layerComposited = false;
    this._threeLayer = null;
    // Put the film back on the WebGL screen (desktop mirror / a re-entered
    // session) — skipped on teardown (restore === false).
    if (restore !== false && this.started) {
      this.videoTexture = null;
      this.applyVideoTexture();
    }
  },

  // First-gesture entry point: build the video texture, swap it onto the
  // screen, and start playback — all inside the user's click so mobile/Quest
  // gesture requirements are satisfied. (Positional audio hooks in here too,
  // for the same reason: AudioContext creation needs the gesture.)
  startPlayback: function () {
    const v = this.videoEl;
    if (!this.started) {
      this.started = true;
      this.initAudio(); // AudioContext creation ALSO needs the user gesture
      // In VR, prefer the WebXR compositor layer (no decoder↔render contention).
      // It no-ops if the session/metadata aren't ready; we then use the WebGL
      // texture and upgrade later (enter-vr / loadeddata retry the layer).
      if (this.el.sceneEl.is("vr-mode")) this.tryCreateXRLayer();
      if (!this.usingLayer) this.applyVideoTexture();
    }
    if (v.ended) v.currentTime = 0; // replay from the top after a run-through
    const p = v.play();
    if (p && p.catch) {
      p.catch((err) => console.warn("zone-c: video play() rejected", err));
    }
  },

  applyVideoTexture: function () {
    if (this.videoTexture) return;
    const tex = new THREE.VideoTexture(this.videoEl);
    // Video frames are sRGB; without this the screen renders washed out.
    if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.videoTexture = tex;

    // Swap the map directly on the existing flat material (set once in
    // build()); nothing else re-sets the material attribute, so the map
    // survives. VideoTexture re-uploads every frame on its own.
    const mesh = this.screenEl.getObject3D("mesh");
    if (!mesh) return;
    mesh.material.map = tex;
    mesh.material.color.set("#ffffff"); // stop the dark tint multiplying video
    mesh.material.needsUpdate = true;
  },

  // --- positional audio ---------------------------------------------------
  // The video's sound is pulled out of the element and localised AT THE
  // SCREEN via THREE.PositionalAudio (setMediaElementSource reroutes the
  // element's output entirely, so nothing plays "in your head"). Exponential
  // distance model: full volume within audioRefDistance of the screen,
  // falling off at audioRolloff beyond it — with the defaults (8 / 5) the
  // film is clearly present ~10 m out. NOTE: spawn is now only 10 m from the
  // screen, so some sound carries there (~1/3 volume with the defaults) —
  // raise audioRolloff if spawn should stay quieter.
  // Built here (not init) because creating an AudioContext outside a user
  // gesture leaves it suspended on Quest/mobile.
  initAudio: function () {
    if (this.audio) return;
    const cameraEl = document.getElementById("camera");
    if (!cameraEl) {
      console.warn("zone-c: no #camera entity; skipping positional audio");
      return;
    }
    this.listener = new THREE.AudioListener();
    cameraEl.object3D.add(this.listener);
    if (this.listener.context.state === "suspended") {
      this.listener.context.resume();
    }

    const audio = new THREE.PositionalAudio(this.listener);
    audio.setMediaElementSource(this.videoEl);
    audio.setDistanceModel("exponential");
    audio.setRefDistance(this.data.audioRefDistance);
    audio.setRolloffFactor(this.data.audioRolloff);
    this.screenEl.object3D.add(audio); // localised at the screen itself
    this.audio = audio;
  },

  applyAudioTunables: function () {
    if (!this.audio) return;
    this.audio.setRefDistance(this.data.audioRefDistance);
    this.audio.setRolloffFactor(this.data.audioRolloff);
  },

  remove: function () {
    this.endScrub();
    if (this.audio) {
      this.audio.disconnect();
      this.screenEl.object3D.remove(this.audio);
    }
    if (this.listener && this.listener.parent) {
      this.listener.parent.remove(this.listener);
    }
    this.screenEl.removeEventListener("click", this.onScreenClick);
    this.screenEl.removeEventListener("mouseenter", this.onScreenEnter);
    this.playBtn.removeEventListener("click", this.onPlayClick);
    this.restartBtn.removeEventListener("click", this.onRestartClick);
    this.trackHit.removeEventListener("mousedown", this.onTrackDown);
    this.stripClickables.forEach((el) => {
      el.removeEventListener("mouseenter", this.onStripEnter);
      el.removeEventListener("mouseleave", this.onStripLeave);
    });
    this.destroyXRLayer(false); // false = don't re-attach the WebGL video on teardown
    if (this.el.sceneEl) {
      if (this.startPreload) {
        this.el.sceneEl.removeEventListener("loaded", this.startPreload);
      }
      this.el.sceneEl.removeEventListener("enter-vr", this.onEnterVR);
      this.el.sceneEl.removeEventListener("exit-vr", this.onExitVR);
    }
    const v = this.videoEl;
    if (v) {
      v.removeEventListener("play", this.onVideoState);
      v.removeEventListener("pause", this.onVideoState);
      v.removeEventListener("ended", this.onVideoEnded);
      v.removeEventListener("loadeddata", this.onVideoReady);
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (this.videoTexture) this.videoTexture.dispose();
    if (this.posterTexture) this.posterTexture.dispose();
    if (this._blobUrl) URL.revokeObjectURL(this._blobUrl);
  },
});

// ----------------------------------------------------------------
// screen-contact-cue — the cinema screen's floor contact cue.
//
// ONE wide elliptical pool on the floor under the screen (the control strip
// deliberately gets none), so the screen reads as deliberately-floating-but-
// anchored — same philosophy as Zone A's ring cues and Zone B's wall cues.
// ALL texture / material / env-retune logic is the shared ContactCue kit in
// components.js; this component owns only its single quad's geometry+layout.
//
// The ellipse is the SAME radial-gradient texture on a non-uniform quad:
// cueWidth spans the screen's width axis, cueDepth the front/back axis.
// cueWidth 0 = AUTO: 1.35 × the parent zone-c-root's screenWidth (mirrors
// image-wall's width-AUTO idiom). `intensity` boosts the profile-resolved
// opacity for THIS cue only — the big ellipse needs more presence than the
// shared profiles (tuned for Zone A/B's small pools) give it.
//
// Env adaptation: identical contract to ring/wall cues — adopt the active
// ground profile on init, retune the material on every `environmentchanged`
// (shadow on light floors, glow on dark ones, dark-shadow fallback when the
// preset declares no profile). GEOMETRY persists; only the material retunes.
// Lives under #zone-c, which env teardown never touches, and re-pins to the
// world floor on `zonecrootchanged` (offset / screenWidth tweaks).
// ----------------------------------------------------------------
AFRAME.registerComponent("screen-contact-cue", {
  schema: {
    cueWidth: { type: "number", default: 0 }, // m; 0 = AUTO (1.35 × screenWidth)
    cueDepth: { type: "number", default: 3.2 }, // m front-to-back
    opacity: { type: "number", default: 0.3 }, // base opacity; profile may override
    // The env profiles' opacities are tuned for Zone A/B's small per-image
    // pools and leave this one big ellipse too faint next to the player UI.
    // intensity scales the PROFILE-RESOLVED opacity for this cue only, so it
    // reads stronger in every environment without touching the shared
    // profiles (shadow gets darker, glow gets brighter).
    intensity: { type: "number", default: 1.6 },
    softness: { type: "number", default: 0.55 }, // gradient falloff 0 (hard)..1 (soft)
    yoffset: { type: "number", default: 0.02 }, // metres above the floor (world y)
    color: { type: "color", default: "#000000" }, // tint; profile may override
    mode: { type: "string", default: "shadow" }, // "shadow" | "glow"
    // FORCE-GLOW local override (see spot-contact-cue). Zone C's floor is dark,
    // so the active `void` profile's shadow pool is invisible on it; forceGlow
    // makes this cue render as an additive light glow instead, re-derived on
    // every tune so it survives `environmentchanged`. Off by default.
    forceGlow: { type: "boolean", default: false },
    glowColor: { type: "color", default: "#9fb2cc" }, // light tint for the glow
    glowOpacity: { type: "number", default: 0.5 },
  },

  init: function () {
    this.curProfile = null;

    this.group = new THREE.Group();
    this.el.setObject3D("cue", this.group);

    // Shared texture + material (identical to Zone A/B cues).
    this.texture = ContactCue.makeTexture(this.data.softness);
    this.material = ContactCue.makeMaterial(this.data, this.texture);
    this.geometry = null;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    // Lie flat facing up, then spin a quarter turn about its own normal so the
    // geometry's WIDTH axis runs along world z — the axis the screen (which
    // faces +x) spans. Euler XYZ applies the z-spin before the x-flatten.
    this.mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    this.group.add(this.mesh);
    this.buildGeometry();

    // Re-pin/re-size when the whole Zone C assembly moves or resizes.
    this.onMoved = () => {
      this.buildGeometry(); // AUTO width follows screenWidth
      this.layout();
    };
    if (this.el.parentNode) {
      this.el.parentNode.addEventListener("zonecrootchanged", this.onMoved);
    }

    // Retune with the environment (same contract as ring/wall cues): adopt the
    // already-active profile now, and follow every later switch.
    this.onEnvChange = (e) => {
      this.curProfile = (e.detail && e.detail.profile) || null;
      this.tune();
    };
    this.el.sceneEl.addEventListener("environmentchanged", this.onEnvChange);
    this.curProfile = ContactCue.currentProfile();
    this.tune();

    this.layout();
  },

  // The profile actually applied: the forceGlow local override when set, else
  // the active environment profile. Re-read on every tune so the override
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

  // Shared retune (forceGlow override or the active profile) + this cue's own
  // intensity boost on the resolved opacity.
  tune: function () {
    ContactCue.tuneMaterial(this.material, this.data, this.effectiveProfile());
    this.material.opacity = Math.min(
      1,
      this.material.opacity * this.data.intensity
    );
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
    if (oldData.cueWidth !== d.cueWidth || oldData.cueDepth !== d.cueDepth) {
      this.buildGeometry();
    }
    if (oldData.yoffset !== d.yoffset) this.layout();
    this.tune();
  },

  // cueWidth=0 means AUTO: 1.35 × the screen's ACTUAL width, read live from the
  // parent zone-c-root (so tuning screenWidth OR screenHeight re-sizes the cue
  // with it). Prefer the published effective width `screenW` (set by layout(),
  // correct in both the width- and height-driven modes); fall back to the
  // screenWidth prop if layout() hasn't run yet.
  resolveWidth: function () {
    if (this.data.cueWidth > 0) return this.data.cueWidth;
    const root =
      this.el.parentNode &&
      this.el.parentNode.components &&
      this.el.parentNode.components["zone-c-root"];
    if (root) {
      const sw = root.screenW != null ? root.screenW : root.data.screenWidth;
      return sw * 1.35;
    }
    console.warn("screen-contact-cue: no zone-c-root parent; FALLBACK 16.2 m");
    return 16.2;
  },

  buildGeometry: function () {
    const w = this.resolveWidth();
    const old = this.geometry;
    this.geometry = new THREE.PlaneGeometry(w, this.data.cueDepth);
    this.mesh.geometry = this.geometry;
    if (old) old.dispose();
  },

  // Pin the quad to the WORLD floor directly under the screen's centre (the
  // screen sits at the root's x,z; only y needs forcing to floor+yoffset).
  layout: function () {
    this.el.object3D.updateWorldMatrix(true, false);
    const v = this.el.object3D.getWorldPosition(new THREE.Vector3());
    v.y = this.data.yoffset;
    this.el.object3D.worldToLocal(v);
    this.mesh.position.copy(v);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("environmentchanged", this.onEnvChange);
    if (this.el.parentNode) {
      this.el.parentNode.removeEventListener("zonecrootchanged", this.onMoved);
    }
    this.el.removeObject3D("cue");
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  },
});

// ================================================================
// NOTE: the local tinted terrazzo floor patches live in the shared
// `tinted-floor` component (js/tinted-floor.js) — Zone C's dark screening-room
// floor was its first use; Zone B reuses it in soft coral. See that file.
// ================================================================

// ================================================================
// TESTING NOTES — Zone C Pass 1
//
// Desktop:
//   • Load, turn to face -x (opposite the wall): a large 16:9 screen filling
//     the dark room's back wall (screenHeight-driven; bottom edge ~0.35 m off
//     the floor, seated ~0.30 m off the wall), showing the film's thumbnail
//     (dark plane only until it loads). No play glyph — hover brings up the
//     strip.
//   • Click the screen → video plays, sound clearly localised AT the screen.
//   • Walk back to spawn → audio drops off clearly but no longer to
//     near-nothing (~1/3 volume — the zone moved in); raise audioRolloff if
//     spawn should be quieter.
//   • Hover/move the mouse over screen or strip → the control strip fades in
//     just below the screen's bottom edge (controlsScale sizes it); leave
//     everything idle ~4 s → strip fades out and no longer blocks clicks behind
//     it.
//   • Play/pause toggles (icon follows real video state), restart jumps to
//     0 and plays, click/drag on the seek track scrubs (dev server serves
//     range requests, so seeking into unbuffered video works).
//
// Quest:
//   • Same flow via controller ray + trigger: trigger on screen starts
//     playback (the gesture also unlocks the AudioContext), strip buttons
//     and seek-drag work with the laser, strip fades on idle.
//   • WATCH THE FRAMERATE with the video playing: the source is 1080p at a
//     high bitrate (~14 Mbit/s) and video textures re-upload every frame.
//     If Quest fps suffers, report it — we may generate a 720p derivative
//     for the in-scene screen (VIDEO_URL is the single swap point).
//
// Ground contact cue:
//   • Void/light environment: soft dark elliptical shadow pool under the
//     screen — clearly wider than the screen (~1.35 × its width, ~3.2 m
//     deep), reading distinctly darker than Zone A/B's small pools
//     (intensity boost on the profile opacity).
//   • Dataspace/dark environment: the same pool as a soft neon glow instead.
//   • Cycle environments (`e` key / right-hand B) while standing in Zone C:
//     the cue retunes colour/blend/opacity in place — no flicker, no rebuild.
//   • Move the zone (offset) or resize the screen (screenWidth): the cue
//     follows the screen and re-sizes with it (cueWidth AUTO = 1.2 × width).
//
// Live tuning from the console, e.g.:
//   document.getElementById('zone-c')
//     .setAttribute('zone-c-root', 'audioRefDistance', 10)
//   ...same for offset / screenWidth / screenHeightAboveFloor /
//   controlsFadeDelay / audioRolloff. The cue's knobs live on its own child
//   entity: document.querySelector('[screen-contact-cue]')
//     .setAttribute('screen-contact-cue', 'cueDepth', 3)
// ================================================================
