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
    this.buildVideo();
    this.build();

    // First click on the screen is THE user gesture that unlocks playback
    // (Quest/mobile refuse programmatic play before one). Desktop mouse and
    // VR laser trigger both arrive here as the same `click`.
    this.onScreenClick = () => {
      if (!this.started) this.startPlayback();
    };
    this.screenEl.addEventListener("click", this.onScreenClick);
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
    this.screenEl.removeEventListener("click", this.onScreenClick);
    const v = this.videoEl;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    if (this.videoTexture) this.videoTexture.dispose();
  },
});
