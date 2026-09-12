// ================================================================
// zone-b-audio — the park's field recordings, in the places they were made.
//
// Two mp3s, recorded at Công viên Landmark 81 in Ho Chi Minh City in 2026 (see
// ZoneBAudio.TRACKS; their own filenames are the credit). They do opposite
// things on purpose:
//
//   THE BIRDS      Four in the afternoon in the park. One emitter, standing at
//                  the CENTRE OF THE SQUARE, looping. It is loudest in the
//                  middle and falls away toward the kerb, so the middle of the
//                  square is a place with a sound of its own rather than the
//                  park being one even wash. Measured on the floor: 1.0 at the
//                  centre, about 0.4 at the kerb.
//
//   THE RIVER      A boat crossing. It belongs to the WATER, not to a spot, so
//                  its emitter is moved each frame to the nearest point of the
//                  shore and a little way out onto it. Walk toward any edge of
//                  the square and a boat goes past somewhere out in front of
//                  you; stand in the middle and the river is as good as gone.
//                  About 0.5 at the kerb against 0.1 at the centre.
//
// WHY THE RIVER EMITTER MOVES. The water runs all the way round the park now,
// so "the river" is not a point — it is a ring, and the nearest part of it
// depends on where you are standing. A ring of fixed emitters would be the
// obvious answer and is the wrong one: the same recording playing from several
// places at once sums into a comb filter, and the phasing is audible the moment
// you move. One source, kept at the nearest water, is a ring of sound made out
// of one voice.
//
// STREAMED, NOT DECODED, for the reason corridor-audio gives at length: these
// two are 2.6 MB of mp3 and would be some 50 MB of PCM resident on a Quest if
// they were AudioBuffers. HTMLAudioElement into
// PositionalAudio.setMediaElementSource keeps them compressed.
//
// THE LISTENER IS SHARED. AudioKit.getListener() (js/audio.js) owns the page's
// one THREE.AudioListener. This does not make another; see the note there for
// why two would be worse than none.
//
// AND IT NEEDS A GESTURE. An AudioContext built outside a user gesture starts
// suspended on Quest and mobile and stays silent. The corridor has a teleport
// click to hang that on; the park has no such moment — you walk into it — so
// the graph is built on the FIRST gesture anywhere on the page, whenever that
// was, and the gate below decides whether anything is actually audible.
//
// NOTHING PLAYS OUTSIDE THE PARK, and the gate is not the falloff. The birds
// would still be at 0.27 in the foyer on distance alone, which is 30 m from the
// square's centre — a gallery with birdsong in it. So the whole layer fades in
// and out on whether the camera is within gateMargin of the SQUARE.
//
// It has to be the square and not the lawn: since the lawn was wrapped around
// the building (js/zone-b-park.js) its rectangle CONTAINS the gallery, so
// gating on the lawn would turn the park on inside Zone C. The square plus a
// few metres is the passage mouth and nothing else, so the park fades up as you
// come down the hallway, which is where it should.
//
// ZERO COST WHEN NOBODY IS THERE: nothing is fetched until the first gesture,
// and while the gate is shut the two elements are paused.
// ================================================================
const ZoneBAudio = {
  // THE MANIFEST — the only place the files and their credits are written.
  // `title` is the recording's own filename, verbatim, diacritics intact; it
  // names the park, what can be heard and the hour, and it is the credit.
  // `originalFile` is what it was called before the rename to something a URL
  // can carry without escaping.
  TRACKS: {
    birds: {
      src: "audio/cong-vien-landmark-81-chim-hot-4pm.mp3",
      title: "Công viên Landmark 81_chim hót 4pm_Tp.Hcm 2026",
      originalFile: "Công viên Landmark 81_chim hót 4pm_Tp.Hcm 2026.mp3",
    },
    river: {
      src: "audio/cong-vien-landmark-81-tau-chay-ngang.mp3",
      title: "Công viên Landmark 81_Tàu chạy ngang_Tp.Hcm 2026",
      originalFile: "Công viên Landmark 81_Tàu chạy ngang_Tp.Hcm 2026.mp3",
    },
  },
};

AFRAME.registerComponent("zone-b-audio", {
  schema: {
    enabled: { type: "boolean", default: true },

    // ---- the birds, at the centre of the square -----------------------
    // `inverse` because this one has no edge to it: birds get quieter as you
    // walk away and never stop, which is what the model does.
    //   birdsRefDistance  the plateau, in metres from the centre
    //   birdsRolloff      how fast it falls away past that
    // 8 / 1.0 puts full volume over the middle of the square and about 0.4 at
    // the kerb 20 m out — enough that walking in from the edge is walking into
    // the birds, which is the point of putting them in the centre.
    birdsVolume: { type: "number", default: 0.8 },
    birdsRefDistance: { type: "number", default: 8 },
    birdsRolloff: { type: "number", default: 1 },
    birdsMaxDistance: { type: "number", default: 80 },
    birdsHeight: { type: "number", default: 4 }, // up in the trees, not underfoot

    // ---- the river, at the nearest shore ------------------------------
    // `linear` is the only model that reaches exactly zero at a distance you
    // can name, and this one wants a nameable edge: the river is there at the
    // kerb and NOT there in the middle. With refDistance 1 and rolloff 1 the
    // gain is 1 at a metre and 0 at riverRange exactly.
    //
    // 50 m, measured from the square: the shore is 19.8 m beyond the east kerb
    // and 39.8 m from the centre, so with riverWaterOffset the emitter is about
    // 25 m from a visitor at the kerb (gain 0.5) and 45 m from one in the
    // middle (0.1). Lower it to pull the river back to the very edge.
    riverVolume: { type: "number", default: 0.85 },
    riverRange: { type: "number", default: 50 },
    // How far PAST the shore the boat is — it should be out on the water, not
    // standing on the grass at the water's edge.
    riverWaterOffset: { type: "number", default: 5 },
    riverHeight: { type: "number", default: 1.5 }, // just above the water

    // ---- the gate -----------------------------------------------------
    // How far outside the SQUARE the park is still audible. 5 m reaches into
    // the hallway mouth and stops short of the foyer's east wall (x 5.075), so
    // the park arrives as you walk down the passage and is not in the gallery.
    gateMargin: { type: "number", default: 5 },
    fadeIn: { type: "number", default: 2.0 },
    fadeOut: { type: "number", default: 1.2 },
  },

  init: function () {
    this.built = false; // the audio graph, built on the first gesture
    this.open = false; // is the camera inside the gate
    this.gestured = false; // has the page had a user gesture yet
    this.birds = null; // { el, audio }
    this.river = null; // { el, audio, holder }
    this.P = null; // the park's resolved geometry, cached
    this._cam = new THREE.Vector3();

    // The park's square and lawn come from ParkConfig rather than being typed
    // here, so moving the park moves the sound with it. Re-read whenever the
    // park rebuilds; parkResolve walks the floorplan, so this is not free and
    // does not belong in a tick.
    this.readPark = () => {
      this.P = window.ParkConfig ? window.ParkConfig.resolved() : null;
    };
    this.readPark();
    this.onParkChanged = () => this.readPark();
    this.el.sceneEl.addEventListener("zonebparkchanged", this.onParkChanged);

    // THE GESTURE. Any one will do and only the first matters; the gate decides
    // whether it makes a sound. Listed on `window` in the capture phase so a
    // click consumed by something else still counts.
    this.onGesture = () => {
      this.gestured = true;
      AudioKit.resume();
      this.dropGesture();
    };
    this.gestureEvents = ["pointerdown", "mousedown", "touchstart", "keydown"];
    this.dropGesture = () => {
      this.gestureEvents.forEach((t) =>
        window.removeEventListener(t, this.onGesture, true)
      );
    };
    this.gestureEvents.forEach((t) =>
      window.addEventListener(t, this.onGesture, true)
    );

    // Leaving the tab is leaving the park, as far as sound goes.
    this.onVisibility = () => {
      if (!this.built) return;
      if (document.hidden) this.pauseAll();
      else if (this.open) this.playAll();
    };
    document.addEventListener("visibilitychange", this.onVisibility);
  },

  // ---------------------------------------------------------------
  // THE GRAPH. Built once, on the first gesture, and never rebuilt — the
  // emitters are moved rather than replaced when the park changes.
  // ---------------------------------------------------------------
  build: function () {
    if (this.built) return true;
    if (typeof THREE === "undefined" || typeof AudioKit === "undefined") return false;
    // The context was created and resumed inside the gesture that set
    // `gestured`; this only matters if something suspended it since (another
    // tab, a headset taking its display back). Outside a gesture it is a no-op,
    // which is why it is insurance and not the plan.
    AudioKit.resume();
    const listener = AudioKit.getListener();
    if (!listener) {
      console.warn("[park audio] no AudioListener yet; the park will be silent");
      return false;
    }

    const media = (src) => {
      const el = new Audio();
      el.src = src;
      el.loop = true;
      el.preload = "auto"; // we are about to want it
      el.crossOrigin = null; // same origin: asking for CORS would only break it
      return el;
    };
    const T = ZoneBAudio.TRACKS;
    const d = this.data;

    // --- the birds, at the centre of the square ---
    const bEl = media(T.birds.src);
    const bAudio = new THREE.PositionalAudio(listener);
    bAudio.setMediaElementSource(bEl);
    bAudio.setDistanceModel("inverse");
    bAudio.setRefDistance(d.birdsRefDistance);
    bAudio.setRolloffFactor(d.birdsRolloff);
    bAudio.setMaxDistance(d.birdsMaxDistance);
    bAudio.gain.gain.value = 0; // faded up by the gate
    this.el.object3D.add(bAudio);
    this.birds = { el: bEl, audio: bAudio };

    // --- the river, on a holder that follows the nearest shore ---
    // The PositionalAudio hangs off its own Object3D rather than being moved
    // itself: three reads a panner's position from the world matrix, and giving
    // it a parent to be moved by keeps the audio node's own transform at rest.
    const holder = new THREE.Object3D();
    this.el.object3D.add(holder);
    const rEl = media(T.river.src);
    const rAudio = new THREE.PositionalAudio(listener);
    rAudio.setMediaElementSource(rEl);
    rAudio.setDistanceModel("linear");
    rAudio.setRefDistance(1);
    rAudio.setRolloffFactor(1);
    rAudio.setMaxDistance(Math.max(2, d.riverRange));
    rAudio.gain.gain.value = 0;
    holder.add(rAudio);
    this.river = { el: rEl, audio: rAudio, holder: holder };

    this.built = true;
    this.place();
    console.log(
      `[park audio] built — birds at the square's centre (ref ${d.birdsRefDistance} m), ` +
        `river at the nearest shore (range ${d.riverRange} m); ` +
        `"${T.birds.title}" / "${T.river.title}"`
    );
    return true;
  },

  // ---------------------------------------------------------------
  // WHERE THE TWO EMITTERS STAND.
  //
  // The birds do not move: the centre of the square.
  //
  // The river follows the shore. For a listener inside an axis-aligned
  // rectangle the nearest point on its boundary is found by asking which of the
  // four edges is closest and projecting onto that one — no search, and it puts
  // the boat squarely out to the side you are walking toward rather than off at
  // an angle, which is what a ray from the park's centre would have done.
  // ---------------------------------------------------------------
  place: function () {
    if (!this.built || !this.P) return;
    const d = this.data;
    const s = this.P.square;
    const L = this.P.lawn;

    this.birds.audio.position.set(s.cx, d.birdsHeight, s.cz);

    // The camera, clamped into the lawn so the maths holds even if something
    // ever puts the visitor outside it.
    const x = Math.min(Math.max(this._cam.x, L.x0), L.x1);
    const z = Math.min(Math.max(this._cam.z, L.z0), L.z1);
    const dx0 = x - L.x0;
    const dx1 = L.x1 - x;
    const dz0 = z - L.z0;
    const dz1 = L.z1 - z;
    const near = Math.min(dx0, dx1, dz0, dz1);
    const off = d.riverWaterOffset;
    let px = x;
    let pz = z;
    if (near === dx1) px = L.x1 + off;
    else if (near === dx0) px = L.x0 - off;
    else if (near === dz1) pz = L.z1 + off;
    else pz = L.z0 - off;
    this.river.holder.position.set(px, d.riverHeight, pz);
  },

  // ---------------------------------------------------------------
  // THE GATE — is the camera in the park. Distance to the SQUARE's rectangle,
  // zero when inside it, against gateMargin. See the header for why the square
  // and not the lawn.
  // ---------------------------------------------------------------
  inPark: function () {
    if (!this.P) return false;
    const s = this.P.square;
    const dx = Math.max(s.x0 - this._cam.x, 0, this._cam.x - s.x1);
    const dz = Math.max(s.z0 - this._cam.z, 0, this._cam.z - s.z1);
    return Math.sqrt(dx * dx + dz * dz) <= this.data.gateMargin;
  },

  ramp: function (audio, to, secs) {
    const g = audio.gain.gain;
    const ctx = audio.context;
    const now = ctx ? ctx.currentTime : 0;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + Math.max(0.01, secs));
  },

  applyGains: function (secs) {
    if (!this.built) return;
    const d = this.data;
    const on = this.open && d.enabled ? 1 : 0;
    this.ramp(this.birds.audio, d.birdsVolume * on, secs);
    this.ramp(this.river.audio, d.riverVolume * on, secs);
  },

  playAll: function () {
    [this.birds, this.river].forEach((s) => {
      if (!s) return;
      const p = s.el.play();
      if (p && p.catch) p.catch(function () {}); // autoplay refusal: stay silent
    });
  },

  pauseAll: function () {
    [this.birds, this.river].forEach((s) => {
      if (s) s.el.pause();
    });
  },

  tick: function () {
    if (!this.data.enabled) return;
    const cam = this.el.sceneEl.camera;
    if (!cam) return;
    cam.getWorldPosition(this._cam);

    const want = this.inPark();
    if (want && !this.built) {
      // Nothing is fetched, and no AudioContext node exists, until a visitor
      // both reaches the park AND has made a gesture the browser accepts.
      if (!this.gestured || !this.build()) return;
    }
    if (!this.built) return;

    if (want !== this.open) {
      this.open = want;
      if (want) this.playAll();
      this.applyGains(want ? this.data.fadeIn : this.data.fadeOut);
      // Paused only after the fade has run, or it would cut off mid-breath.
      clearTimeout(this.pauseTimer);
      if (!want) {
        this.pauseTimer = setTimeout(
          () => { if (!this.open) this.pauseAll(); },
          this.data.fadeOut * 1000 + 120
        );
      }
    }

    // The river's emitter tracks the shore nearest the listener; the birds'
    // does not move, and place() setting it again each frame costs nothing.
    if (this.open) this.place();
  },

  // Retuning by hand should not need a reload.
  update: function (oldData) {
    if (!this.built || !Object.keys(oldData).length) return;
    const d = this.data;
    this.birds.audio.setRefDistance(d.birdsRefDistance);
    this.birds.audio.setRolloffFactor(d.birdsRolloff);
    this.birds.audio.setMaxDistance(d.birdsMaxDistance);
    this.river.audio.setMaxDistance(Math.max(2, d.riverRange));
    this.place();
    this.applyGains(0.2);
  },

  remove: function () {
    this.dropGesture();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.el.sceneEl.removeEventListener("zonebparkchanged", this.onParkChanged);
    clearTimeout(this.pauseTimer);
    this.pauseAll();
    [this.birds, this.river].forEach((s) => {
      if (!s) return;
      if (s.audio.parent) s.audio.parent.remove(s.audio);
      s.el.src = "";
    });
    this.birds = null;
    this.river = null;
    this.built = false;
  },
});
