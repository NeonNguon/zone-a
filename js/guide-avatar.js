// ================================================================
// Guide avatar — a flat video cut-out of the artist standing on the floor.
//
// THE VIDEO. Each avatar (avatar/avatar-stacked.mp4, avatar-b-stacked.mp4,
// ...) is a plain H.264 file that carries its own alpha by STACKING: the top
// half is the colour image over black, the bottom half the matte, white =
// opaque, both halves the same size. Plain H.264 because it is the one format
// every target plays — Safari and the Quest browser included.
// avatar/avatar-alpha.webm (VP9 with real alpha) is reference only: Safari
// cannot decode it.
//
// ONE <video> per avatar (in <a-assets>), ONE VideoTexture, ONE draw call:
// the shader below samples both halves of the same texture.
//
// THE MATTE SIDECAR. Every avatar is framed differently — where the soles
// are, how much of the frame the person fills, how far off centre they stand
// — so those numbers are MEASURED, not typed: tools/measure-avatar.py reads
// every frame's matte and writes <video>.json beside the video (feet / head
// rows, left / right columns, the frame size). With `matte: auto` the
// component fetches that file from the video's own src, and keeps the figure
// hidden until it has it, so it never appears at the wrong size and jumps. A
// new avatar is therefore: export the stacked MP4, run the script once, point
// a guide-avatar at it.
//
// HIDDEN = PAUSED. An avatar in a sub-space that is switched off (the Zone A
// corridor, 400 m out, `shown: false` until you teleport in) pauses its video
// and stops its voice, so only the avatars you can see cost a decoder.
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
//   matte      — the sidecar JSON's URL; "auto" (default) = the video's src
//                with .json for its extension; "none" = use the two below.
//   figureFill — fraction of the frame height the figure occupies; the plane
//                is height / figureFill tall so the person comes out `height`.
//   footMargin — fraction of the frame height BELOW the soles. The plane is
//                sunk by this much so the soles, not the frame's edge, meet
//                y = 0. Both come from the sidecar when there is one; set
//                either on the tag to override it by hand.
//   billboard  — turn about Y (only) to face the camera every frame.
//   contactRadius — the soft floor shadow under the feet (0 = none). Read
//                once, at init.
//   sound      — URL of the voice clip a click plays ("" = not clickable).
//                Read once, at init.
//   soundRefDistance / soundRolloff — how the voice falls off with distance
//                (inverse model): full level within soundRefDistance of him.
//
// HOVER + CLICK. With a `sound`, an invisible hit box the size of the FIGURE
// (not the 1.8 m-wide plane, most of which is transparent) carries the
// `.clickable` class, so the desktop cursor and both lasers find it like any
// other clickable. Hover lifts the figure's brightness and pops it up a few
// percent (the images and terminals pop by 5%). A click plays the voice from
// the start; a click while it is speaking stops it — the same toggle as the
// memories' audio control. Until that first click, a small "click to
// interact" sign bobs over his head, pointing down at him; the click fades it
// out for good. While he speaks, a speech bubble in the sign's place shows
// what he is saying, a line at a time, from the `captions` JSON cues.
//
// WHILE HE SPEAKS he glitches: rows tear sideways, the channels split into
// red/blue fringes off the silhouette, scanlines, the odd dropout — the
// teleport glitch's vocabulary (js/transition.js), stepped at 24 fps. Its
// strength follows his voice's level (an AudioAnalyser on the clip), so it
// flares on syllables and settles in pauses, and it is exactly off — the
// shader's plain two-sample path — whenever he is silent.
//
// THE VOICE is spatial: a THREE.PositionalAudio on the avatar, fed from one
// reused HTMLAudioElement, mixed into AudioKit's listener — the page's ONE
// listener (js/audio.js), never a second. AudioKit.resume() is called inside
// the click, because an AudioContext started outside a gesture stays silent
// on Quest. The clip is avatar/Avatar-speech-1.mp3; it was generated as
// "ElevenLabs_2026-10-24T06_31_03_Tobias - German accent_pvc_sp90_s50_sb50_v3
// .mp3" and renamed to an ASCII name a URL can carry, like the files in audio/.
//
// HE CAN SAY MORE THAN ONE THING: a `first` line, an `again` line for any
// later click, a `done` line once a page-level event says the visitor has
// done what he sent them to do (rooms-visited, bottom of this file, for the
// corridor's three apartments), and a `back` line he says UNPROMPTED a beat
// after another event (the visitor teleported home). When he has had his say
// (clip ended, or cut short by a click) the entity emits
// `guide-avatar-spoke` with { line: "first" | "again" | "done" | "back" };
// guide-arrows (bottom of this file)
// waits on it — a set of arrows appears after one line and can be cleared by
// another.
//
// guide-avatar-spawn (below) places the entity in front of the rig once the
// scene has loaded: `distance` metres along the rig's facing and `lateral`
// metres across it (negative = left), on the floor.
// ================================================================

// ONE half of the stacked frame, until the sidecar or the video says
// otherwise: the size every avatar so far has been exported at.
const AVATAR_FRAME_W = 544;
const AVATAR_FRAME_H = 720;
// The info terminals' face, for the sign and the speech bubble.
const AVATAR_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

AFRAME.registerComponent("guide-avatar", {
  schema: {
    src: { type: "selector" }, // the <video>
    height: { type: "number", default: 1.8 },
    billboard: { type: "boolean", default: true },
    matte: { type: "string", default: "auto" },
    figureFill: { type: "number", default: 0.97 },
    footMargin: { type: "number", default: 10 / AVATAR_FRAME_H },
    contactRadius: { type: "number", default: 0.35 }, // 0 = no ground contact
    sound: { type: "string", default: "" }, // voice clip URL; "" = no click
    soundRefDistance: { type: "number", default: 5 },
    soundRolloff: { type: "number", default: 1 },
    // JSON cues for the speech bubble: [{ "start": seconds, "text": "..." }].
    // Each line shows from its start until the next one's. "" = no bubble.
    captions: { type: "string", default: "" },
    // MORE THAN ONE THING TO SAY. `sound` / `captions` are his FIRST line.
    // `again*` is what he says on any later click (unset: the first line
    // again); `done*` is what he says once the page-level event `doneOn` has
    // fired on the scene (e.g. rooms-visited's, below) — from then on, every
    // click. Each line's end is announced with its name (see the header).
    againSound: { type: "string", default: "" },
    againCaptions: { type: "string", default: "" },
    doneSound: { type: "string", default: "" },
    doneCaptions: { type: "string", default: "" },
    doneOn: { type: "string", default: "" },
    // A line he says UNPROMPTED: `backDelay` ms after the scene event `backOn`
    // (the visitor teleported home: zone-a-teleport's `zoneareturned`), if
    // he can be seen. Once said, it is also what a click plays.
    backSound: { type: "string", default: "" },
    backCaptions: { type: "string", default: "" },
    backOn: { type: "string", default: "" },
    backDelay: { type: "number", default: 1000 },
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
        // Hover, eased 0..1 by tick: a brightness lift on the figure.
        highlight: { value: 0 },
        // While he speaks: 0..1, following his voice's level (see tick), and
        // the clock the glitch is stepped on.
        glitch: { value: 0 },
        time: { value: 0 },
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
        "uniform float highlight;",
        "uniform float glitch;",
        "uniform float time;",
        "varying vec2 vUv;",
        "float hash(vec2 p) {",
        "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);",
        "}",
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
        "  float alpha;",
        "  vec3 colour;",
        // GLITCH (while he speaks). `glitch` is uniform across the draw, so
        // this branch costs nothing while he is silent: the plain path is the
        // same two samples as ever.
        "  if (glitch > 0.0) {",
        // Same vocabulary as the teleport glitch (js/transition.js): time
        // stepped to 24 fps for a blocky retiming, rows torn sideways. Only
        // SOME rows tear (more as glitch rises), so the figure stays legible.
        "    float t = floor(time * 24.0);",
        "    float row = floor(vUv.y * 48.0);",
        "    float pick = step(1.0 - 0.3 * glitch, hash(vec2(row, t)));",
        "    float x = vUv.x + pick * (hash(vec2(row, t + 7.0)) - 0.5) * 0.1 * glitch;",
        // ...and now and then a whole band jumps further.
        "    float band = floor(vUv.y * 7.0);",
        "    float jump = hash(vec2(band, floor(time * 9.0)));",
        "    x += step(0.93, jump) * (jump - 0.965) * 1.2 * glitch;",
        // RGB split: each channel from its own offset sample, each weighted by
        // its own matte, so the fringes hang off the SILHOUETTE in red and
        // blue rather than smearing the black ground into it.
        "    float s = 0.01 * glitch;",
        "    float aR = texture2D(map, vec2(x + s, va)).r;",
        "    float aG = texture2D(map, vec2(x, va)).r;",
        "    float aB = texture2D(map, vec2(x - s, va)).r;",
        "    alpha = max(aG, max(aR, aB));",
        "    if (alpha < 0.03) discard;",
        "    colour = vec3(texture2D(map, vec2(x + s, vc)).r * aR,",
        "                  texture2D(map, vec2(x, vc)).g * aG,",
        "                  texture2D(map, vec2(x - s, vc)).b * aB) / alpha;",
        // Scanlines, and an occasional dropout flicker of the whole figure.
        "    colour *= 1.0 - 0.3 * glitch * step(0.5, fract(vUv.y * 160.0));",
        "    alpha *= 1.0 - 0.45 * glitch * step(0.88, hash(vec2(t, 3.0)));",
        "  } else {",
        "    alpha = texture2D(map, vec2(vUv.x, va)).r;",
        "    if (alpha < 0.03) discard;",
        "    colour = texture2D(map, vec2(vUv.x, vc)).rgb;",
        "  }",
        // Hover lift, in linear light: up to +35%. The artist is dressed in
        // dark olive, so a multiply is what shows; nothing here clips.
        "  vec3 lin = avatarSRGBToLinear(colour) * (1.0 + 0.35 * highlight);",
        "  gl_FragColor = vec4(lin, alpha);",
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

    // Framing: the defaults until the sidecar arrives. The figure stays hidden
    // until then (a local file, so a matter of milliseconds), so it never
    // shows at one size and jumps to another.
    this.frame = { w: AVATAR_FRAME_W, h: AVATAR_FRAME_H };
    this.fig = null; // measured: { fill, foot, width, centre } as fractions
    this.mesh.visible = false;
    this.loadMatte();

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

    // Hover state, eased toward its target in tick.
    this.hover = 0;
    this.hoverTarget = 0;

    if (this.data.sound) this.buildInteraction();

    // `wantsVideo` remembers that playback has been asked for, so a hidden
    // avatar (paused by tick) starts again the moment it is shown.
    this.wantsVideo = false;
    this.playVideo = () => {
      this.wantsVideo = true;
      if (!this.isShown()) return; // tick starts it when it is
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

  // The sidecar (see the header): fetched once, then the layout redone with
  // the measured framing. Missing or broken -> the schema's figureFill /
  // footMargin, with a warning, so an unmeasured avatar still shows.
  loadMatte: function () {
    let url = this.data.matte;
    if (url === "auto") {
      const src = this.video.getAttribute("src") || "";
      url = src ? src.replace(/\.[^./]+$/, "") + ".json" : "";
    }
    const done = () => {
      this.matteReady = true;
      this.layout();
    };
    if (!url || url === "none") return done();
    fetch(url, { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((m) => {
        const W = m.frame.width;
        const H = m.frame.height;
        this.frame = { w: W, h: H };
        this.fig = {
          fill: (m.feet + 1 - m.head) / H, // soles to the top of the hair
          foot: (H - 1 - m.feet) / H, // the empty strip under the soles
          width: (m.right + 1 - m.left) / W,
          centre: ((m.left + m.right + 1) / 2 - W / 2) / W, // + = right of centre
        };
      })
      .catch((err) => {
        console.warn(
          "guide-avatar: no matte measurements at " + url +
            " (run tools/measure-avatar.py on the video); using figureFill / footMargin",
          err
        );
      })
      .then(done);
  },

  update: function () {
    this.layout();
  },

  layout: function () {
    if (!this.mesh || !this.matteReady) return;
    const d = this.data;
    // Measured framing, unless the tag sets either number by hand.
    const set = this.attrValue || {};
    const fig = this.fig;
    const fill = fig && set.figureFill === undefined ? fig.fill : d.figureFill;
    const foot = fig && set.footMargin === undefined ? fig.foot : d.footMargin;
    const figW = fig ? fig.width : 0.53;
    const figC = fig ? fig.centre : 0;

    // Plane height is the whole FRAME, so the PERSON comes out `height` tall.
    const h = d.height / fill;
    const w = h * (this.frame.w / this.frame.h);
    const geo = new THREE.PlaneGeometry(w, h);
    // Bottom edge to y = 0, then down by the empty strip under the soles.
    geo.translate(0, h / 2 - h * foot, 0);
    if (this.mesh.geometry) this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.visible = true;
    // 2 texel rows of the FULL stacked frame (see the uniform).
    this.material.uniforms.inset.value = 2 / (this.frame.h * 2);

    // The hit box covers the FIGURE: the person's height from the soles, and
    // the matte's measured width plus 10% for a hand or an elbow swinging out,
    // centred where the figure stands in the frame.
    if (this.hitMesh) {
      this.hitMesh.scale.set(w * figW * 1.1, d.height, 0.3);
      this.hitMesh.position.set(w * figC, d.height / 2, 0);
    }
    if (this.voiceHolder) this.voiceHolder.position.set(0, d.height * 0.9, 0);
    // The sign's centre, clear of his hair (even mid hover-pop, +4%).
    this.signY = d.height + 0.28;
    // The bubble's tail tip, just over his hair (clear of the hover pop).
    if (this.bubble) this.bubble.position.y = d.height + 0.12;
    if (this.voice) {
      this.voice.setRefDistance(d.soundRefDistance);
      this.voice.setRolloffFactor(d.soundRolloff);
    }
  },

  // ---------------------------------------------------------------
  // HOVER + CLICK — the hit box, its handlers, and the voice's element. The
  // PositionalAudio itself waits for the first click (see playVoice).
  // ---------------------------------------------------------------
  buildInteraction: function () {
    // Invisible but ray-hittable: opacity 0 + colorWrite off, the terminals'
    // hit-box recipe (js/terminal-kit.js). A unit box, sized in update().
    this.hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.hitMat.colorWrite = false;
    this.hitMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.hitMat);
    this.hitEl = document.createElement("a-entity");
    this.hitEl.setAttribute("class", "clickable");
    this.hitEl.addEventListener(
      "loaded",
      () => this.hitEl.setObject3D("hit", this.hitMesh),
      { once: true }
    );
    this.el.appendChild(this.hitEl);

    // The same mouseenter/mouseleave/click arrive from the desktop cursor and
    // both lasers.
    this.onEnter = () => (this.hoverTarget = 1);
    this.onLeave = () => (this.hoverTarget = 0);
    this.onClick = () => this.toggleVoice();
    this.hitEl.addEventListener("mouseenter", this.onEnter);
    this.hitEl.addEventListener("mouseleave", this.onLeave);
    this.hitEl.addEventListener("click", this.onClick);

    // ONE element, reused for every play. Loaded now so the first click is not
    // kept waiting; nothing is routed anywhere until that click.
    this.voiceEl = new Audio();
    this.voiceEl.preload = "auto";
    this.voiceEl.crossOrigin = null; // same origin: asking for CORS would only break it
    this.voiceEl.src = this.data.sound;

    // His LINES, by name. Only the ones with a sound exist; pickLine chooses.
    const d = this.data;
    this.lines = { first: { sound: d.sound, captions: d.captions } };
    if (d.againSound) this.lines.again = { sound: d.againSound, captions: d.againCaptions };
    if (d.doneSound) this.lines.done = { sound: d.doneSound, captions: d.doneCaptions };
    if (d.backSound) this.lines.back = { sound: d.backSound, captions: d.backCaptions };
    this.currentLine = "first";
    this.spoken = {}; // line name -> true once it has been started
    this.doneReached = false;
    if (d.doneOn) {
      this.onDone = () => (this.doneReached = true);
      this.el.sceneEl.addEventListener(d.doneOn, this.onDone);
    }
    // Unprompted: the beat after the event, then the `back` line — unless he
    // cannot be seen, or is already talking. The jump that fires it is a
    // click, so the page has its user activation and the AudioContext is
    // running: playing outside the gesture a second later is allowed.
    if (d.backOn && this.lines.back) {
      this.onBack = () => {
        clearTimeout(this.backTimer);
        this.backTimer = setTimeout(() => {
          const v = this.voiceEl;
          if (!this.isShown() || (!v.paused && !v.ended)) return;
          this.playVoice("back");
        }, d.backDelay);
      };
      this.el.sceneEl.addEventListener(d.backOn, this.onBack);
    }

    // Tell whoever is waiting on him (guide-arrows) that he has had his say,
    // and WHICH line: on the clip's end, and on a click that stops him.
    this.onVoiceEnded = () => {
      this.duckOthers(false);
      this.el.emit("guide-avatar-spoke", { line: this.currentLine }, false);
    };
    this.voiceEl.addEventListener("ended", this.onVoiceEnded);

    // From about the mouth, not the floor.
    this.voiceHolder = new THREE.Object3D();
    this.el.object3D.add(this.voiceHolder);

    this.buildSign();
    if (Object.keys(this.lines).some((k) => this.lines[k].captions)) this.buildBubble();
  },

  // The line a click plays now: the `done` line once it is earned, else the
  // `again` line after the first has been heard, else the first.
  pickLine: function () {
    if (this.doneReached && this.lines.done) return "done";
    if (this.spoken.back) return "back"; // the latest thing he has to tell you
    if (this.spoken.first && this.lines.again) return "again";
    return "first";
  },

  // ---------------------------------------------------------------
  // THE SPEECH BUBBLE — what he is saying, a line at a time, in a bubble
  // whose tail points down at his head, so the voice is plainly HIS and not
  // one floating in the room (and readable with the sound off). Same face as
  // the sign, in the same place: the sign is gone by the time he speaks.
  // Shown while he speaks and for a beat after; pulses with his level.
  // The cues are a JSON file beside the clip, so a re-recorded line is a data
  // edit, not a code one.
  // ---------------------------------------------------------------
  buildBubble: function () {
    this.cues = null; // the playing line's cues (set by playVoice)
    this.cuesBy = {}; // line name -> its cues, as they load
    Object.keys(this.lines).forEach((name) => {
      const url = this.lines[name].captions;
      if (!url) return;
      fetch(url, { cache: "no-cache" })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then((cues) => {
          this.cuesBy[name] = cues.slice().sort((a, b) => a.start - b.start);
          if (this.currentLine === name) this.cues = this.cuesBy[name];
        })
        .catch((err) => {
          console.warn("guide-avatar: no captions from " + url, err);
        });
    });

    this.bubbleCanvas = document.createElement("canvas");
    this.bubbleCanvas.width = 1024;
    this.bubbleCanvas.height = 384;
    this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
    this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
    this.bubbleMat = new THREE.MeshBasicMaterial({
      map: this.bubbleTex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const bw = 1.3; // metres; the text is ~7 cm tall at this size
    const bh = bw * (this.bubbleCanvas.height / this.bubbleCanvas.width);
    const geo = new THREE.PlaneGeometry(bw, bh);
    geo.translate(0, bh / 2, 0); // origin at the tail's tip: it grows from there
    this.bubble = new THREE.Mesh(geo, this.bubbleMat);
    this.bubble.renderOrder = 1;
    this.bubble.visible = false;
    this.el.object3D.add(this.bubble);
    this.bubbleFade = 0;
    this.bubbleHold = 0; // scene time (ms) until which it stays up
    this.cueIndex = -1;
  },

  // Redrawn only when the line changes (three times over the whole clip).
  drawBubble: function (text) {
    const c = this.bubbleCanvas;
    const ctx = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "600 54px " + AVATAR_FONT;

    // Wrap to at most three lines.
    const lines = [];
    let line = "";
    text.split(/\s+/).forEach(function (word) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > 860) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    lines.length = Math.min(lines.length, 3);

    const lineH = 66;
    const padX = 52;
    const padY = 36;
    const tail = 40;
    let textW = 0;
    lines.forEach((l) => (textW = Math.max(textW, ctx.measureText(l).width)));
    const bw = Math.min(W - 8, textW + 2 * padX);
    const bh = lines.length * lineH + 2 * padY - 12;
    const x0 = (W - bw) / 2;
    const x1 = x0 + bw;
    const y1 = H - 4 - tail; // the box's bottom edge
    const y0 = y1 - bh;
    const r = 34;
    const cx = W / 2;

    // Box and tail as ONE path: two overlapping translucent fills would leave
    // a darker seam where they meet.
    ctx.fillStyle = "rgba(11, 11, 16, 0.88)";
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.arcTo(x1, y0, x1, y1, r);
    ctx.arcTo(x1, y1, cx + 28, y1, r);
    ctx.lineTo(cx + 28, y1);
    ctx.lineTo(cx, H - 4);
    ctx.lineTo(cx - 28, y1);
    ctx.arcTo(x0, y1, x0, y0, r);
    ctx.arcTo(x0, y0, x1, y0, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8eef8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((l, i) => ctx.fillText(l, cx, y0 + padY + lineH / 2 - 6 + i * lineH));

    this.bubbleTex.needsUpdate = true;
  },

  // ---------------------------------------------------------------
  // THE SIGN — "click to interact" over his head, a chevron pointing down at
  // him. The info terminals' face (dark ground, light Helvetica, the pale blue
  // accent) on a pill. A child of the entity, so it turns with the billboard.
  // Bobs gently until the first click, then fades out for good.
  // ---------------------------------------------------------------
  buildSign: function () {
    const W = 512;
    const H = 192;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const label = "click to interact";

    ctx.font = "600 46px " + AVATAR_FONT;
    const pillW = Math.min(W - 8, ctx.measureText(label).width + 84);
    const pillH = 96;
    const px = (W - pillW) / 2;
    const r = pillH / 2;
    ctx.fillStyle = "rgba(11, 11, 16, 0.88)";
    ctx.beginPath();
    ctx.moveTo(px + r, 4);
    ctx.arcTo(px + pillW, 4, px + pillW, 4 + pillH, r);
    ctx.arcTo(px + pillW, 4 + pillH, px, 4 + pillH, r);
    ctx.arcTo(px, 4 + pillH, px, 4, r);
    ctx.arcTo(px, 4, px + pillW, 4, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e8eef8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, W / 2, 4 + pillH / 2 + 2);

    // The chevron, in the family's accent, pointing down at him.
    ctx.strokeStyle = "#bfe6ff";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 30, 128);
    ctx.lineTo(W / 2, 162);
    ctx.lineTo(W / 2 + 30, 128);
    ctx.stroke();

    this.signTex = new THREE.CanvasTexture(canvas);
    this.signTex.colorSpace = THREE.SRGBColorSpace;
    this.signMat = new THREE.MeshBasicMaterial({
      map: this.signTex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true, // flat: one pass is enough (see the avatar's)
    });
    const signW = 0.6;
    this.sign = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signW * (H / W)),
      this.signMat
    );
    this.sign.renderOrder = 1; // after the figure, so it is never behind him
    this.el.object3D.add(this.sign);
    this.signFade = 1; // 1 shown .. 0 gone
    this.signDismissed = false;
  },

  toggleVoice: function () {
    const v = this.voiceEl;
    if (!v) return;
    // A ray can still reach a HIDDEN avatar's hit box (the corridor's guide,
    // parked 400 m behind the gallery); a hidden guide does not answer.
    if (!this.isShown()) return;
    this.signDismissed = true; // the sign has done its job
    if (!v.paused && !v.ended) return this.stopVoice();
    this.playVoice();
  },

  // Called from INSIDE the click: the resume needs the gesture. `line` forces
  // one (the unprompted `back`); otherwise pickLine chooses.
  playVoice: function (line) {
    this.signDismissed = true; // he is talking: no need to ask for a click
    const listener = AudioKit.resume();
    if (!this.voice) {
      if (!listener) {
        console.warn("guide-avatar: no AudioListener yet; the voice is silent");
        return;
      }
      const d = this.data;
      this.voice = new THREE.PositionalAudio(listener);
      this.voice.setMediaElementSource(this.voiceEl);
      this.voice.setDistanceModel("inverse");
      this.voice.setRefDistance(d.soundRefDistance);
      this.voice.setRolloffFactor(d.soundRolloff);
      this.voiceHolder.add(this.voice);
      // His LEVEL drives the glitch, so it spikes on syllables and settles in
      // the pauses. 32 bins is plenty for a loudness reading.
      this.voiceLevel = new THREE.AudioAnalyser(this.voice, 32);
    }
    // Which line, and its clip into the one element (the PositionalAudio is
    // wired to the element, not the file, so a new src just plays through).
    line = line || this.pickLine();
    this.currentLine = line;
    this.spoken[line] = true;
    const src = this.lines[line].sound;
    if (this.voiceEl.getAttribute("src") !== src) this.voiceEl.src = src;
    if (this.cuesBy) this.cues = this.cuesBy[line] || null;
    this.cueIndex = -1; // the bubble redraws from this line's first cue
    try {
      this.voiceEl.currentTime = 0;
    } catch (e) {}
    const p = this.voiceEl.play();
    if (p && p.catch) p.catch(function () {});
    this.duckOthers(true);
  },

  // A voice ducks the ambience under it, exactly as a spoken memory does: the
  // corridor's television and street (js/corridor-audio.js) listen for this
  // page-level event, and the corridor's emitter hangs on the bicycle, right
  // across from the corridor's guide. On the way back up, keep the duck if a
  // memory is still speaking, so the guide never un-ducks over one.
  duckOthers: function (on) {
    const memory = !!(window.ZoneA && ZoneA.audio && ZoneA.audio.isPlaying());
    this.el.sceneEl.emit("zonea-memory", { playing: on || memory }, false);
  },

  stopVoice: function () {
    const v = this.voiceEl;
    if (!v || v.paused || v.ended) return;
    v.pause();
    try {
      v.currentTime = 0;
    } catch (e) {}
    this.bubbleHold = 0; // stopped: no lingering line
    this.onVoiceEnded(); // cut short still counts as having spoken
  },

  // Every ancestor visible: the corridor hides by flipping its root's
  // visibility, not by removing anything.
  isShown: function () {
    for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return false;
    return true;
  },

  tick: function (t, dt) {
    if (!this.mesh) return;

    // HIDDEN = PAUSED: no decoding a video nobody can see, no voice talking
    // to an empty corridor 400 m away. Nothing else to do while hidden.
    if (!this.isShown()) {
      if (!this.video.paused) this.video.pause();
      this.stopVoice();
      this.hoverTarget = 0;
      return;
    }
    if (this.wantsVideo && this.video.paused) this.playVideo();

    // Hover ease: ~100 ms each way, then the uniform and the pop follow it.
    if (this.hover !== this.hoverTarget) {
      const step = Math.min(1, (dt || 16) / 100);
      this.hover += (this.hoverTarget - this.hover) * step;
      if (Math.abs(this.hoverTarget - this.hover) < 0.01) this.hover = this.hoverTarget;
      this.material.uniforms.highlight.value = this.hover;
      // The mesh's origin is at the soles, so the pop grows him upward.
      const s = 1 + 0.04 * this.hover;
      this.mesh.scale.set(s, s, s);
    }

    // GLITCH while he speaks: a floor of 0.15 so it never quite settles, plus
    // his level. Fast attack, slower release, and back to exactly 0 (the
    // shader's cheap path) once he has stopped.
    const u = this.material.uniforms;
    const v = this.voiceEl;
    const speaking = !!v && !v.paused && !v.ended;
    let target = 0;
    if (speaking) {
      const level = this.voiceLevel ? this.voiceLevel.getAverageFrequency() / 160 : 0.5;
      target = 0.15 + 0.85 * Math.min(1, level);
    }
    if (target > 0 || u.glitch.value > 0) {
      const k = Math.min(1, (dt || 16) / (target > u.glitch.value ? 40 : 160));
      u.glitch.value += (target - u.glitch.value) * k;
      if (target === 0 && u.glitch.value < 0.01) u.glitch.value = 0;
      u.time.value = t / 1000;
    }

    // The sign: a slow bob, and a ~300 ms fade once dismissed.
    if (this.sign && this.sign.visible) {
      if (this.signDismissed) {
        this.signFade = Math.max(0, this.signFade - (dt || 16) / 300);
        this.signMat.opacity = this.signFade;
        if (this.signFade === 0) this.sign.visible = false; // no draw call
      }
      this.sign.position.y = this.signY + 0.025 * Math.sin(t / 650);
    }

    // The bubble: the current line while he speaks, held 0.8 s after he
    // finishes, fading in over ~150 ms and out over ~300 ms. It swells a few
    // percent with his level — the glitch's smoothed value — from its tail.
    if (this.bubble) {
      if (speaking && this.cues) {
        this.bubbleHold = t + 800;
        const now = v.currentTime + 0.05;
        let i = -1;
        while (i + 1 < this.cues.length && this.cues[i + 1].start <= now) i++;
        if (i !== this.cueIndex && i >= 0) {
          this.cueIndex = i;
          this.drawBubble(this.cues[i].text);
        }
      }
      const show = t < this.bubbleHold && this.cueIndex >= 0 ? 1 : 0;
      if (show || this.bubbleFade > 0) {
        const rate = (dt || 16) / (show ? 150 : 300);
        this.bubbleFade = show
          ? Math.min(1, this.bubbleFade + rate)
          : Math.max(0, this.bubbleFade - rate);
        this.bubbleMat.opacity = this.bubbleFade;
        this.bubble.visible = this.bubbleFade > 0;
        const s = 1 + 0.05 * u.glitch.value;
        this.bubble.scale.set(s, s, s);
        if (!show && this.bubbleFade === 0) this.cueIndex = -1; // next play redraws
      }
    }

    if (!this.data.billboard) return;
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
    if (this.hitEl) {
      this.hitEl.removeEventListener("mouseenter", this.onEnter);
      this.hitEl.removeEventListener("mouseleave", this.onLeave);
      this.hitEl.removeEventListener("click", this.onClick);
      if (this.hitEl.parentNode) this.hitEl.parentNode.removeChild(this.hitEl);
      this.hitMesh.geometry.dispose();
      this.hitMat.dispose();
    }
    if (this.onDone) this.el.sceneEl.removeEventListener(this.data.doneOn, this.onDone);
    if (this.onBack) this.el.sceneEl.removeEventListener(this.data.backOn, this.onBack);
    clearTimeout(this.backTimer);
    if (this.voiceEl) {
      this.voiceEl.removeEventListener("ended", this.onVoiceEnded);
      this.voiceEl.pause();
      this.voiceEl.removeAttribute("src");
    }
    // The listener stays: it is AudioKit's, shared with the rest of the page.
    if (this.voice) this.voice.disconnect();
    if (this.voiceHolder) this.el.object3D.remove(this.voiceHolder);
    if (this.sign) {
      this.el.object3D.remove(this.sign);
      this.sign.geometry.dispose();
      this.signMat.dispose();
      this.signTex.dispose();
    }
    if (this.bubble) {
      this.el.object3D.remove(this.bubble);
      this.bubble.geometry.dispose();
      this.bubbleMat.dispose();
      this.bubbleTex.dispose();
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
    // Metres to the rig's RIGHT (negative = left), across its facing.
    lateral: { type: "number", default: 0 },
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

    // Right of forward, on the floor: (-z forward) -> (+x right).
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const pos = origin
      .clone()
      .addScaledVector(fwd, this.data.distance)
      .addScaledVector(right, this.data.lateral);
    const dx = origin.x - pos.x;
    const dz = origin.z - pos.z;
    parent.worldToLocal(pos);
    this.el.object3D.position.copy(pos);
    // Face the rig. The billboard keeps this up to date while it is on; with
    // it off, this is the pose it keeps.
    this.el.object3D.rotation.set(0, Math.atan2(dx, dz), 0);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("loaded", this.place);
  },
});

// ----------------------------------------------------------------
// guide-arrows: the hot-pink chevrons on the floor that lead from the guide
// avatar to the booth he sends you to — "follow the arrows on the ground".
// Hidden until he has spoken (the avatar's `guide-avatar-spoke`: his clip
// ending, or a click cutting him short), then they pop in one after another
// from his feet to the booth, and a soft brightness pulse keeps running along
// them toward it. They stay until they have done their job, then fade out
// for good (still gone when the visitor comes back):
//   - a booth they lead to (`to`) is USED — a click on it, the same click its
//     teleport listens for. If it is used before he has spoken, they never
//     appear at all;
//   - the avatar speaks the line named in `until` (the corridor's arrows to
//     the rooms make way when he sends you home);
//   - the visitor REACHES the end (`reach` metres from the last arrow; 0 =
//     off) — for a doorway, where there is nothing to click.
//
// THE PATH is on the floor, in THIS entity's own frame (so a set of arrows
// inside the Zone A corridor's root uses the corridor's coordinates and moves
// and hides with it), worked out when they appear:
//   start  — the avatar's position plus `startOffset` (just in front of his
//            feet, toward the middle of the floor),
//   via    — waypoints in between, "x z, x z",
//   end    — either `end`, "x z", or the `to` entity's position, `stopShort`
//            metres back toward the visitor along the last leg, so the last
//            arrow lands in front of the booth rather than under it.
// A booth's position is read live (zone-a-teleport derives it from the
// floorplan), so the arrows follow if the room or the booth moves. A smooth
// curve (centripetal Catmull-Rom) through those points, an arrow every
// `spacing` metres along it, each turned to the curve's direction.
//
// ONE InstancedMesh: every arrow is one draw call together, which matters
// on Quest. Per-arrow pop = its instance scale; the pulse = its instance
// colour (a brightness on the hot pink).
// ----------------------------------------------------------------
AFRAME.registerComponent("guide-arrows", {
  schema: {
    from: { type: "selector", default: "#guide-avatar" },
    to: { type: "selector" },
    end: { type: "string", default: "" }, // "x z", instead of `to`
    startOffset: { type: "vec3", default: { x: 0.6, y: 0, z: 0.5 } },
    via: { type: "string", default: "" },
    stopShort: { type: "number", default: 1.3 },
    reach: { type: "number", default: 0 }, // metres from the end; 0 = off
    line: { type: "string", default: "first" }, // the avatar line that shows them
    until: { type: "string", default: "" }, // the avatar line that clears them
    spacing: { type: "number", default: 0.7 },
    color: { type: "color", default: "#ff1f8f" },
    size: { type: "number", default: 0.36 }, // chevron width, metres
    yoffset: { type: "number", default: 0.015 }, // above the floor
  },

  init: function () {
    this.shown = false;
    this.built = false;
    this.dismissed = false;
    this.onSpoke = (e) => {
      const line = (e.detail && e.detail.line) || "first";
      if (line === this.data.line) this.show();
      else if (line === this.data.until) this.dismiss();
    };
    if (this.data.from) this.data.from.addEventListener("guide-avatar-spoke", this.onSpoke);
    // The booth's clicks bubble up from its hit box to the booth entity, which
    // is where zone-a-teleport listens to jump; listening here too keeps the
    // arrows out of the teleport's code.
    this.onUsed = () => this.dismiss();
    if (this.data.to) this.data.to.addEventListener("click", this.onUsed);
  },

  // The booth has been used: the arrows have done their job.
  dismiss: function () {
    if (this.dismissed) return;
    this.dismissed = true;
    if (this.shown) this.tGone = null; // the fade starts on the next tick
  },

  show: function () {
    if (this.shown || this.dismissed) return;
    if (!this.build()) return;
    this.shown = true;
    this.t0 = null; // the pop starts on the next tick
    this.mesh.visible = true;
  },

  build: function () {
    const d = this.data;
    const xz = (str) =>
      str
        .split(",")
        .map((s) => s.trim().split(/\s+/).map(Number))
        .filter((p) => p.length === 2 && p.every(isFinite))
        .map((p) => new THREE.Vector3(p[0], 0, p[1]));
    const endPts = xz(d.end);
    if (!d.from || (!d.to && !endPts.length)) {
      console.warn("guide-arrows: need `from`, and `to` or `end`");
      return false;
    }
    // Everything in this entity's frame: world positions come in through
    // worldToLocal; `via` / `end` / startOffset are already in it.
    this.el.object3D.updateMatrixWorld(true);
    const local = (obj) => {
      const v = new THREE.Vector3();
      obj.getWorldPosition(v);
      return this.el.object3D.worldToLocal(v);
    };
    const start = local(d.from.object3D).add(d.startOffset);
    const pts = [start].concat(xz(d.via));
    let end;
    if (endPts.length) {
      end = endPts[0];
    } else {
      end = local(d.to.object3D);
      const prev = pts[pts.length - 1];
      const back = new THREE.Vector3(prev.x - end.x, 0, prev.z - end.z);
      if (back.lengthSq() > 1e-6) end.addScaledVector(back.normalize(), d.stopShort);
    }
    pts.push(end);
    pts.forEach((p) => (p.y = 0));
    this.endPt = end.clone();
    this._cam = new THREE.Vector3();

    const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    const length = curve.getLength();
    const n = Math.max(2, Math.floor(length / d.spacing) + 1);

    // A chevron pointing -z, flat on the floor. Proportions of `size` wide.
    const s = d.size / 0.36;
    const shape = new THREE.Shape();
    [
      [0, 0.12], [0.18, -0.06], [0.11, -0.12],
      [0, -0.01], [-0.11, -0.12], [-0.18, -0.06],
    ].forEach((p, i) => (i ? shape.lineTo(p[0] * s, p[1] * s) : shape.moveTo(p[0] * s, p[1] * s)));
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // +y of the shape -> -z on the floor

    // White, so the instance colour IS the colour. Unlit, like every floor
    // cue; depthWrite off + polygonOffset so it never fights the floor.
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, n);
    // Instances start at scale 0, so three's own bounds would be a point;
    // it is one draw call either way, so just never cull it.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;

    this.pos = [];
    this.yaw = [];
    const tan = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = curve.getPointAt(u);
      curve.getTangentAt(u, tan);
      this.pos.push(new THREE.Vector3(p.x, d.yoffset, p.z));
      // Yaw that turns -z onto the tangent.
      this.yaw.push(Math.atan2(-tan.x, -tan.z));
    }
    this.n = n;
    this.pink = new THREE.Color(d.color);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) this.setArrow(i, 0, 1);

    this.el.object3D.add(this.mesh); // positions are already in this frame
    this.built = true;
    return true;
  },

  setArrow: function (i, scale, bright) {
    this._q.setFromAxisAngle(this._up, this.yaw[i]);
    this._s.setScalar(Math.max(scale, 1e-4));
    this._m.compose(this.pos[i], this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this._c.copy(this.pink).multiplyScalar(bright);
    this.mesh.setColorAt(i, this._c);
  },

  tick: function (t) {
    if (!this.shown) return;
    if (this.t0 === null) this.t0 = t;
    const e = t - this.t0;

    // Dismissed: fade out over ~400 ms (under the teleport's glitch, which
    // takes the visitor away mid-fade), then hide and stop ticking for good.
    if (this.dismissed) {
      if (this.tGone === null) this.tGone = t;
      const f = Math.max(0, 1 - (t - this.tGone) / 400);
      this.material.opacity = 0.95 * f;
      if (f === 0) {
        this.mesh.visible = false; // no draw call
        this.shown = false; // and no more ticks' worth of work
        return;
      }
    } else if (this.data.reach > 0) {
      // Reached: the visitor is standing at the end of the path.
      const cam = this.el.sceneEl.camera;
      if (cam) {
        cam.getWorldPosition(this._cam);
        this.el.object3D.worldToLocal(this._cam);
        const dx = this._cam.x - this.endPt.x;
        const dz = this._cam.z - this.endPt.z;
        if (dx * dx + dz * dz < this.data.reach * this.data.reach) this.dismiss();
      }
    }

    for (let i = 0; i < this.n; i++) {
      // The pop: each arrow 90 ms after the last, 300 ms to grow, a little
      // overshoot (ease-out-back) so it lands with a bounce.
      const k = Math.min(1, Math.max(0, (e - i * 90) / 300));
      const c = 1.7;
      const pop = k === 0 ? 0 : 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
      // The pulse: a crest every 1.8 s, travelling toward the booth.
      const wave = 0.5 + 0.5 * Math.cos(((e / 1800) - i / this.n) * Math.PI * 2);
      this.setArrow(i, pop, 0.6 + 0.4 * Math.pow(wave, 3));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  },

  remove: function () {
    if (this.data.from) this.data.from.removeEventListener("guide-avatar-spoke", this.onSpoke);
    if (this.data.to) this.data.to.removeEventListener("click", this.onUsed);
    if (!this.built) return;
    this.el.object3D.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  },
});

// ----------------------------------------------------------------
// rooms-visited: notices when the visitor has stood inside EVERY apartment
// off the Zone A corridor, and says so once, as a page-level event (default
// `corridor-rooms-visited`) — which is what a guide-avatar's `doneOn` waits
// for, to change what he says.
//
// The rooms come from the corridor itself (corridor-root's layout, the same
// numbers the walls and the collider are built from), so nothing here is
// typed: an apartment is entered when the camera is past the corridor's
// outer wall face on the room's side, within its depth, and within its width
// along the corridor. Checked four times a second, and only while the
// corridor is shown; nothing at all once every room has been seen.
// ----------------------------------------------------------------
AFRAME.registerComponent("rooms-visited", {
  schema: {
    corridor: { type: "selector", default: "#zone-a-corridor" },
    event: { type: "string", default: "corridor-rooms-visited" },
  },

  init: function () {
    this.visited = {}; // room index -> true
    this.fired = false;
    this.next = 0;
    this._cam = new THREE.Vector3();
  },

  tick: function (t) {
    if (this.fired || t < this.next) return;
    this.next = t + 250;
    const c = this.data.corridor;
    const root = c && c.components["corridor-root"];
    const L = root && root.L;
    if (!L || !c.object3D.visible) return;
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldPosition(this._cam);
    c.object3D.worldToLocal(this._cam);
    const x = this._cam.x;
    const z = this._cam.z;
    L.rooms.forEach((r) => {
      const out = r.side * x; // metres out from the centreline, on its side
      if (out > L.outerHalf && out < L.outerHalf + r.d && Math.abs(z - r.z) < r.w / 2) {
        this.visited[r.index] = true;
      }
    });
    if (Object.keys(this.visited).length >= L.rooms.length) {
      this.fired = true;
      this.el.sceneEl.emit(this.data.event, { rooms: L.rooms.length }, false);
    }
  },
});
