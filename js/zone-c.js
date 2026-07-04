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

// ----------------------------------------------------------------
// zone-c-root: the SINGLE placement handle for the whole Zone C assembly,
// mirroring zone-a-root / zone-b-root. Every Zone C child (screen, control
// strip, positional audio) is built under this entity, so moving the one
// `offset` moves the entire cinema as a unit. Default offset mirrors Zone B
// across the spawn point: Zone B sits at 13 3 0 (+x), so Zone C sits at
// -13 3 0 (-x). Adjust live, e.g.:
//   document.getElementById('zone-c').setAttribute('zone-c-root','offset','-15 3 0')
//
// TUNABLES (all schema properties — adjustable by eye, no code edits):
//   offset                 — assembly position (vec3), the placement handle.
//   screenWidth            — screen width in metres; height derives from 16:9.
//   screenHeightAboveFloor — WORLD-floor clearance of the screen's bottom
//                            edge. Pinned to the world floor regardless of the
//                            root's y (same intent as Zone B's floor cues
//                            staying pinned under a raised wall).
//   controlsFadeDelay      — idle ms before the control strip fades out.
//   audioRefDistance       — full-volume radius of the screen audio (m).
//   audioRolloff           — exponential falloff beyond that radius.
// ----------------------------------------------------------------
AFRAME.registerComponent("zone-c-root", {
  schema: {
    offset: { type: "vec3", default: { x: -13, y: 3, z: 0 } },
    screenWidth: { type: "number", default: 12 },
    screenHeightAboveFloor: { type: "number", default: 1 },
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

    // The screen: a dark 16:9 plane until the video's first frame arrives —
    // deliberately not pure black so it reads as a surface, not a hole.
    // It is ALWAYS clickable: first click starts playback (the user gesture
    // Quest/mobile require); later clicks just revive the control strip.
    const screen = document.createElement("a-plane");
    screen.setAttribute("class", "clickable");
    screen.setAttribute(
      "material",
      "shader: flat; color: #0d0d0d; fog: false"
    );
    container.appendChild(screen);
    this.screenEl = screen;

    // Subtle play affordance floating just in front of the dark screen —
    // a simple geometric triangle (no font dependency). Hidden forever after
    // the first play.
    const glyph = document.createElement("a-triangle");
    glyph.setAttribute("vertex-a", "-0.45 0.6 0");
    glyph.setAttribute("vertex-b", "-0.45 -0.6 0");
    glyph.setAttribute("vertex-c", "0.75 0 0");
    glyph.setAttribute(
      "material",
      "shader: flat; color: #d8d8d8; transparent: true; opacity: 0.55; fog: false"
    );
    container.appendChild(glyph);
    this.glyphEl = glyph;

    this.layout();
  },

  // --- sizes/positions from the live schema (re-run on any tunable change) --
  layout: function () {
    const d = this.data;
    const w = d.screenWidth;
    const h = (w * 9) / 16;

    // screenHeightAboveFloor is measured from the WORLD floor (y=0), so the
    // screen's bottom edge stays put even if the root's y offset changes —
    // subtract the root's y to convert into this entity's local space.
    const centerY = d.screenHeightAboveFloor + h / 2 - d.offset.y;

    this.screenEl.setAttribute("width", w);
    this.screenEl.setAttribute("height", h);
    this.screenEl.setAttribute("position", `0 ${centerY} 0`);

    this.glyphEl.setAttribute("position", `0 ${centerY} 0.05`);

    if (this.stripEl) this.layoutControls();
  },

  // ================================================================
  // CONTROL STRIP — a minimal floating row below the screen:
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
    const panelW = Math.max(4.5, d.screenWidth * 0.6);
    const panelH = 0.7;

    // Pinned relative to the WORLD floor like the screen: strip top sits a
    // little below the screen's bottom edge.
    const centerWorldY = d.screenHeightAboveFloor - 0.15 - panelH / 2;
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

      // Idle timeout — never while scrubbing or while a pointer rests on it.
      if (
        this.fadeTarget === 1 &&
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
    const els = [
      this.mouseCursorEl(),
      document.getElementById("rightHand"),
      document.getElementById("leftHand"),
    ];
    for (let i = 0; i < els.length; i++) {
      const rc = els[i] && els[i].components && els[i].components.raycaster;
      if (!rc) continue;
      const hit = rc.getIntersection(this.screenEl);
      if (hit && hit.point) {
        const last = this.rayLast[i];
        if (last && last.distanceTo(hit.point) > 0.02) this.activity();
        this.rayLast[i] = (last || new THREE.Vector3()).copy(hit.point);
      } else {
        this.rayLast[i] = null;
      }
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
    v.preload = "metadata"; // duration/dimensions early; no eager full fetch
    v.playsInline = true;
    v.setAttribute("playsinline", ""); // attribute form for older mobile WebKit
    v.loop = false;
    v.src = VIDEO_URL;
    this.videoEl = v;
    this.videoTexture = null;

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

  // First-gesture entry point: build the video texture, swap it onto the
  // screen, and start playback — all inside the user's click so mobile/Quest
  // gesture requirements are satisfied. (Positional audio hooks in here too,
  // for the same reason: AudioContext creation needs the gesture.)
  startPlayback: function () {
    const v = this.videoEl;
    if (!this.started) {
      this.started = true;
      this.applyVideoTexture();
      this.glyphEl.setAttribute("visible", false);
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

  remove: function () {
    this.endScrub();
    this.screenEl.removeEventListener("click", this.onScreenClick);
    this.screenEl.removeEventListener("mouseenter", this.onScreenEnter);
    this.playBtn.removeEventListener("click", this.onPlayClick);
    this.restartBtn.removeEventListener("click", this.onRestartClick);
    this.trackHit.removeEventListener("mousedown", this.onTrackDown);
    this.stripClickables.forEach((el) => {
      el.removeEventListener("mouseenter", this.onStripEnter);
      el.removeEventListener("mouseleave", this.onStripLeave);
    });
    const v = this.videoEl;
    if (v) {
      v.removeEventListener("play", this.onVideoState);
      v.removeEventListener("pause", this.onVideoState);
      v.removeEventListener("ended", this.onVideoEnded);
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (this.videoTexture) this.videoTexture.dispose();
  },
});
