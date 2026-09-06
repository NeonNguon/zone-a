// ================================================================
// corridor-audio — the chung cư corridor's field recordings, in the places
// they were recorded from.
//
// Three mp3s, made in Ho Chi Minh City in 2026 (see CorridorAudio.TRACKS for
// the full credits, which are the recordings' own filenames). Two things play:
//
//   THE FLAT           Cư Xá Thanh Đa, block A, third floor, six in the
//                      evening: a television running a Vietnamese film, music
//                      somewhere, a child a long way off. It loops, and its
//                      emitter hangs ON THE BICYCLE — so the corridor's sound
//                      has a source in it rather than being a wash, it is
//                      loudest where somebody's front door is, and it carries
//                      into the apartments the way a neighbour's television
//                      does. It starts when the visitor arrives and stops when
//                      they leave.
//   THE STREET         Đồng Khởi at eight, and the Nguyễn Tri Phương six-way
//                      at seven. They ALTERNATE — one, then the other, then
//                      the first again — behind the window in the end wall,
//                      and they are audible only within streetRange (6 m) of
//                      it. Walk up the corridor and the city arrives; walk
//                      away and it is gone. That is the whole point of the
//                      window, done in sound.
//
// STREAMED, NOT DECODED. Every source here is an HTMLAudioElement handed to
// THREE.PositionalAudio.setMediaElementSource, and never an AudioBuffer from
// THREE.AudioLoader. The three files are 5.4 MB of mp3 between them; decoded
// to PCM for an AudioBuffer they are float32 stereo at 44.1 kHz, which is
// 46 MB each for the two long ones and about 124 MB for the set — resident,
// on a Quest, for ambience. As media elements they stay compressed and decode
// as they play, and the browser streams them.
//
// The cost of that choice, stated plainly: a media element cannot be started
// sample-accurately and its currentTime is approximate. Neither matters for a
// two-minute field recording that fades in.
//
// THE LISTENER IS SHARED. AudioKit.getListener() (js/audio.js) owns the page's
// one THREE.AudioListener, on #camera. This does not create one. See the block
// above AudioKit for why two would be worse than none.
//
// AND THE CONTEXT NEEDS A GESTURE. An AudioContext made outside a user gesture
// starts suspended on Quest and mobile and stays silent however much you play
// into it. The gesture that brings a visitor into the corridor is the teleport
// click, so the whole graph is built lazily inside zone-a-teleport's cut, and
// AudioKit.resume() is called there before anything plays.
//
// ZERO COST WHEN NOBODY IS IN THE CORRIDOR: nothing is fetched (preload
// "none"), no AudioContext node exists, and the component is removed from the
// scene's behaviour list so its tick is not called at all.
// ================================================================
const CorridorAudio = {
  // THE MANIFEST — the only place the files and their credits are written.
  // `title` is the recording's own filename, verbatim, diacritics intact:
  // it names the building, the block, the floor, the hour and what you can
  // hear on it, and it is the credit. `originalFile` is what it was called
  // before the rename to something a URL can carry.
  TRACKS: {
    corridor: {
      src: "audio/cu-xa-thanh-da.mp3",
      title:
        "Cư Xá Thanh Đa_Lô A-Lầu 3-6h Chiều-Tiếng Tivi Mở Phim Việt Nam-" +
        "Tiếng Nhạc-Tiếng Em Bé Vọng Từ Xa_TP.HCM 2026",
      originalFile:
        "Cư Xá Thanh Đa_Lô A-Lầu 3-6h Chiều-Tiếng Tivi Mở Phim Việt Nam-" +
        "Tiếng Nhạc-Tiếng Em Bé Vọng Từ Xa_TP.HCM 2026.mp3",
      duration: 131.6,
    },
    street: [
      {
        src: "audio/dong-khoi-8pm.mp3",
        title: "Đường Đồng Khởi Q1 (đối diện Vincom), 8pm_Tp.Hcm 2026",
        originalFile: "Đường Đồng Khởi Q1 (đối diện Vincom), 8pm_Tp.Hcm 2026.mp3",
        duration: 89.3,
      },
      {
        src: "audio/nguyen-tri-phuong-7pm.mp3",
        title: "Đường phố_Ngã sáu Nguyễn Tri Phương, 7pm_Tp.Hcm 2026",
        originalFile: "Đường phố_Ngã sáu Nguyễn Tri Phương, 7pm_Tp.Hcm 2026.mp3",
        duration: 131.2,
      },
    ],
  },
};

AFRAME.registerComponent("corridor-audio", {
  schema: {
    // A master switch that leaves the layer in place. Everything below is
    // multiplied by it, so turning it off silences the corridor without
    // pulling the component out of index.html.
    enabled: { type: "boolean", default: true },

    // ---- the flat, on the bicycle -------------------------------------
    // "inverse" is the model that behaves like a real room: loud at the
    // source, falling away smoothly, still faintly there at the far end.
    //   corridorRefDistance  the PLATEAU: it is at full volume everywhere
    //                        within this of the bicycle. At 5 that covers the
    //                        landing, which is 4.6 m from it — so you arrive
    //                        into the television rather than walking up to it.
    //                        Drop it to ~3.5 if the arrival should be quieter.
    //   corridorRolloff      how fast it falls away past the plateau. This and
    //                        refDistance TOGETHER decide how much of the
    //                        neighbour's television reaches the apartments,
    //                        which is the thing to tune by ear first.
    //   corridorMaxDistance  where the falloff stops being computed
    //
    // 5 / 0.8 rather than the 3 / 1.2 this shipped with: the flat now carries
    // the length of the run instead of dying in the middle of it. Measured on
    // the centreline at eye height — 0.95 at the bicycle, 0.92 mid-corridor,
    // 0.43 at the window, and 0.47-0.66 inside the three apartments.
    corridorVolume: { type: "number", default: 0.95 },
    corridorRefDistance: { type: "number", default: 5 },
    corridorRolloff: { type: "number", default: 0.8 },
    corridorMaxDistance: { type: "number", default: 30 },
    // WHERE it hangs. "bike" reads the bicycle's derived position straight
    // out of corridor-root (furniturePos.bike) rather than re-deriving it;
    // "landing" puts it on the arrival end; anything else is anchorOffset
    // alone, i.e. a plain root-local point.
    corridorAnchor: { type: "string", default: "bike" },
    anchorOffset: { type: "vec3", default: { x: 0, y: 1.4, z: 0 } },

    // ---- the street, behind the window --------------------------------
    // "linear" is the ONLY model that reaches exactly zero at a distance you
    // can name. inverse and exponential are asymptotic — they get quiet but
    // never stop — and the brief for this one is a hard edge: the city is
    // there near the window and NOT there down the corridor. With
    // refDistance 1, rolloffFactor 1 and maxDistance = streetRange, the gain
    // is 1 at a metre and 0 at streetRange exactly.
    //
    // streetRange IS A RADIUS FROM THE SOURCE, NOT A DISTANCE ALONG THE FLOOR.
    // The source sits streetOffset from the window — two metres beyond the end
    // wall and 1.75 m above eye height — so the sphere always reaches rather
    // less down the corridor than the number reads. At 16 it reaches about
    // 13.9 m back.
    //
    // 16 rather than the 6 this shipped with. At 6 the city stopped 3.7 m from
    // the glass, which made it a detail you had to put your face to; the two
    // layers were never audible together and the apartments never heard the
    // street at all. At 16 they overlap down the middle of the run and the
    // traffic is in all three rooms — and the LANDING is still silent (19.1 m
    // out, past the range), so walking toward the window still reveals the
    // city, which is the whole point of it. Measured on the centreline:
    // 0.73 at the glass, 0.55 four metres back, 0.33 mid-corridor, 0.06 at the
    // bicycle, 0 on the landing; 0.36-0.57 inside the apartments.
    streetVolume: { type: "number", default: 0.85 },
    streetRange: { type: "number", default: 16 },
    // Root-local, relative to the WINDOW'S CENTRE. The default puts it two
    // metres beyond the end wall and above the opening — outside, across the
    // street, rather than in the reveal.
    streetOffset: { type: "vec3", default: { x: 0, y: 1.6, z: -2 } },

    // ---- time ---------------------------------------------------------
    fadeIn: { type: "number", default: 1.5 },
    fadeOut: { type: "number", default: 1.0 },
    // How long the two street tracks overlap at the handover. The city never
    // goes silent between them.
    crossfade: { type: "number", default: 1.5 },
    // What both layers are multiplied by while a spoken memory is playing.
    duckWhileMemory: { type: "number", default: 0.3 },
  },

  init: function () {
    this.built = false; // the audio graph, built on the first arrival
    this.running = false; // is the visitor in the corridor with sound on
    this.duck = 1; // 1, or duckWhileMemory while a memory speaks
    this.street = []; // [{ el, audio, track }]
    this.streetIndex = 0; // which street track is the active one
    this.arrived = false; // has the visitor been in here before this session
    this.handingOver = false; // a crossfade is in flight
    this.corridor = null; // { el, audio }
    this.anchor = null; // THREE.Object3D holding both street emitters

    // A memory being spoken ducks everything else. js/audio.js broadcasts
    // this; its setOnChange slot belongs to the focus views and is not ours
    // to take.
    this.onMemory = (e) => {
      const want = e.detail && e.detail.playing ? this.data.duckWhileMemory : 1;
      if (want === this.duck) return;
      this.duck = want;
      this.applyGains(0.4);
    };
    this.el.sceneEl.addEventListener("zonea-memory", this.onMemory);

    // Leaving the tab is leaving the corridor, as far as sound goes.
    this.onVisibility = () => {
      if (!this.built) return;
      if (document.hidden) this.pauseAll();
      else if (this.running) this.resumeAll();
    };
    document.addEventListener("visibilitychange", this.onVisibility);

    // NOT TICKING until there is something to watch. A-Frame registers a
    // component with a tick() as a scene behaviour, so this hands it straight
    // back; start() and stop() are what add and remove it after that.
    //
    // A-Frame can put it back on its own — its play() wrapper re-adds any
    // component that has a tick — so tick() also returns immediately unless
    // `running`. Belt and braces: the behaviour list is the saving, the guard
    // is what makes the saving safe to rely on.
    this.el.sceneEl.removeBehavior(this);
  },

  // ---------------------------------------------------------------
  // THE GRAPH, built once, on the first arrival — which is inside the
  // teleport's click, which is the user gesture the AudioContext needs.
  // ---------------------------------------------------------------
  build: function () {
    if (this.built) return true;
    const listener = AudioKit && AudioKit.getListener();
    if (!listener) {
      console.warn(
        "corridor-audio: no AudioListener (is #camera in the scene?). The " +
          "corridor will be silent."
      );
      return false;
    }
    this.listener = listener;

    // ONE ELEMENT PER TRACK, streamed. preload "none" means nothing is
    // fetched until this runs — so a visitor who never teleports into the
    // corridor never downloads 5.4 MB of it.
    const media = (src, loop) => {
      const el = new Audio();
      el.src = src;
      el.loop = !!loop;
      el.preload = "auto"; // we are about to want it
      el.crossOrigin = null; // same origin: asking for CORS would only break it
      return el;
    };

    const T = CorridorAudio.TRACKS;

    // --- the flat, on the bicycle ---
    const cEl = media(T.corridor.src, true);
    const cAudio = new THREE.PositionalAudio(listener);
    cAudio.setMediaElementSource(cEl);
    cAudio.setDistanceModel("inverse");
    cAudio.setRefDistance(this.data.corridorRefDistance);
    cAudio.setRolloffFactor(this.data.corridorRolloff);
    cAudio.setMaxDistance(this.data.corridorMaxDistance);
    cAudio.gain.gain.value = 0; // faded up by start()
    this.el.object3D.add(cAudio);
    this.corridor = { el: cEl, audio: cAudio };

    // --- the street, behind the window ---
    // BOTH tracks get their own emitter at the same point, rather than one
    // emitter whose source is swapped. A PositionalAudio has exactly one
    // source and one gain, and a crossfade needs two gains moving in opposite
    // directions at the same time. Two panners at one position is the cheap
    // way to have that.
    this.anchor = new THREE.Object3D();
    this.el.object3D.add(this.anchor);
    T.street.forEach((track) => {
      const el = media(track.src, false);
      const audio = new THREE.PositionalAudio(listener);
      audio.setMediaElementSource(el);
      audio.setDistanceModel("linear");
      audio.setRefDistance(1);
      audio.setRolloffFactor(1);
      audio.setMaxDistance(Math.max(1.5, this.data.streetRange));
      audio.gain.gain.value = 0;
      this.anchor.add(audio);
      const entry = { el: el, audio: audio, track: track };
      // The fallback for the handover: the tick starts the next track a
      // crossfade BEFORE this one ends, but a throttled tab can miss that, and
      // then `ended` is the last word.
      el.addEventListener("ended", () => {
        if (this.running && !this.handingOver) this.advanceStreet();
      });
      this.street.push(entry);
    });

    this.place();
    this.built = true;
    return true;
  },

  // WHERE THE TWO EMITTERS STAND, in the corridor's own frame. They are
  // children of this entity's object3D — the same frame corridor-root builds
  // in — so they ride the root's `offset` and survive its rebuilds, which the
  // corridor GROUP does not (teardown replaces it).
  place: function () {
    const root = this.el.components["corridor-root"];
    if (!root) {
      console.warn("corridor-audio: no corridor-root on this entity");
      return;
    }
    const d = this.data;
    const L = root.L || root.layout();
    const o = d.anchorOffset;

    // --- the flat ---
    let base = null;
    if (d.corridorAnchor === "bike") {
      base = root.furniturePos && root.furniturePos.bike;
      if (!base) {
        console.warn(
          "corridor-audio: corridorAnchor is \"bike\" but there is no bicycle " +
            "(furniture off, or it failed to place). Hanging the corridor " +
            "ambience on the middle of the run instead."
        );
      }
    } else if (d.corridorAnchor === "landing") {
      base = { x: 0, y: 0, z: L.zBack / 2 };
    }
    if (!base) base = { x: 0, y: 0, z: L.zEnd / 2 };
    this.corridor.audio.position.set(base.x + o.x, base.y + o.y, base.z + o.z);

    // --- the street, out beyond the window ---
    const s = d.streetOffset;
    const win = L.win;
    const wx = win ? win.x : 0;
    const wy = win ? win.y0 + win.h / 2 : 1.6;
    if (!win) {
      console.warn(
        "corridor-audio: the end wall has no window (`window: false`), so " +
          "there is nothing for the street to come through. Putting it behind " +
          "the end wall anyway, at mid height."
      );
    }
    this.anchor.position.set(wx + s.x, wy + s.y, L.zEnd + s.z);
  },

  // ---------------------------------------------------------------
  // GAIN. Every emitter's target is its own volume times the master switch
  // times the duck times whether we are running at all — worked out in one
  // place so a fade, a duck and a mute cannot fight each other.
  // ---------------------------------------------------------------
  ramp: function (audio, to, secs) {
    if (!audio) return;
    const g = audio.gain.gain;
    const t = audio.context.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + Math.max(0.01, secs));
  },

  applyGains: function (secs) {
    if (!this.built) return;
    const d = this.data;
    const on = this.running && d.enabled ? this.duck : 0;
    this.ramp(this.corridor.audio, d.corridorVolume * on, secs);
    this.street.forEach((s, i) => {
      // Only the ACTIVE street track is up; the other is silent unless a
      // handover has it on its way up, and advanceStreet owns that.
      if (this.handingOver) return;
      this.ramp(s.audio, i === this.streetIndex ? d.streetVolume * on : 0, secs);
    });
  },

  // ---------------------------------------------------------------
  // ARRIVING AND LEAVING. Called from zone-a-teleport's cut, inside the
  // click — which is what lets the AudioContext resume.
  // ---------------------------------------------------------------
  start: function () {
    if (!this.data.enabled) return;
    AudioKit.resume();
    if (!this.build()) return;
    this.running = true;
    // THE TWO STREETS TAKE TURNS AT THE DOOR, not only at the end of a file.
    // A track runs 1:29 or 2:11, so a visitor who does not stand at the window
    // for that long only ever hears whichever one happens to be up — and
    // without this, that is Đồng Khởi every single time, because a visit
    // resumes where the last one stopped. Advancing on ARRIVAL means the
    // second visit opens on Nguyễn Tri Phương, the third on Đồng Khởi again.
    //
    // It advances the INDEX, not the position: each track still resumes from
    // its own currentTime, so neither of them restarts from the top.
    if (this.arrived && this.street.length > 1) {
      this.streetIndex = (this.streetIndex + 1) % this.street.length;
    }
    this.arrived = true;
    this.playEl(this.corridor.el);
    this.playEl(this.street[this.streetIndex].el);
    this.applyGains(this.data.fadeIn);
    this.el.sceneEl.addBehavior(this); // now there is something to watch
  },

  stop: function () {
    if (!this.built || !this.running) return;
    this.running = false;
    this.applyGains(this.data.fadeOut);
    this.el.sceneEl.removeBehavior(this);
    // Pause only after the fade has actually run, and PAUSE rather than
    // rewind: currentTime is what makes a second visit resume the street
    // where it left off instead of starting the city again from the top.
    clearTimeout(this.pauseTimer);
    this.pauseTimer = setTimeout(
      () => this.pauseAll(),
      Math.max(50, this.data.fadeOut * 1000 + 60)
    );
  },

  pauseAll: function () {
    if (!this.built) return;
    this.corridor.el.pause();
    this.street.forEach((s) => s.el.pause());
  },

  resumeAll: function () {
    if (!this.built || !this.running) return;
    this.playEl(this.corridor.el);
    this.playEl(this.street[this.streetIndex].el);
  },

  // NOT CALLED play(). A-Frame's Component prototype already has play() and
  // pause() as lifecycle hooks, and registerComponent WRAPS them: the wrapper
  // takes no arguments, ignores any you pass, and returns early unless the
  // component is transitioning from paused to playing. So a method called
  // play(el) on a component is never your method — `this.play(someElement)`
  // reaches A-Frame's wrapper, which quietly does nothing. Every source in
  // here stayed paused for exactly that reason, with the gains ramping
  // correctly around silence.
  //
  // The rejection is swallowed the way js/audio.js swallows an unrecorded
  // memory's: a missing or blocked file is silence, not a crash.
  playEl: function (el) {
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
  },

  // ---------------------------------------------------------------
  // THE STREET'S HANDOVER. One track, then the other, then the first — with
  // an overlap, so the city never drops to silence between two recordings of
  // it.
  //
  // Driven from tick rather than from `ended`, because `ended` is by
  // definition too late to overlap anything: the crossfade has to BEGIN a
  // crossfade before the end. `ended` is kept as the backstop for a throttled
  // tab where the tick did not run often enough.
  // ---------------------------------------------------------------
  advanceStreet: function () {
    if (this.handingOver || this.street.length < 2) return;
    this.handingOver = true;
    const d = this.data;
    const from = this.street[this.streetIndex];
    const next = (this.streetIndex + 1) % this.street.length;
    const to = this.street[next];

    try {
      to.el.currentTime = 0;
    } catch (e) {}
    this.playEl(to.el);
    const on = this.running && d.enabled ? this.duck : 0;
    this.ramp(to.audio, d.streetVolume * on, d.crossfade);
    this.ramp(from.audio, 0, d.crossfade);
    this.streetIndex = next;

    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => {
      from.el.pause();
      try {
        from.el.currentTime = 0; // next time round it plays from the top
      } catch (e) {}
      this.handingOver = false;
    }, Math.max(60, d.crossfade * 1000 + 80));
  },

  tick: function () {
    if (!this.running || !this.built || this.handingOver) return;
    const s = this.street[this.streetIndex];
    const el = s.el;
    // duration is NaN until the metadata lands; the manifest's figure stands
    // in until then, so a handover is never missed on a slow first load.
    const dur = isFinite(el.duration) && el.duration > 0
      ? el.duration
      : s.track.duration;
    if (!dur) return;
    if (dur - el.currentTime <= this.data.crossfade) this.advanceStreet();
  },

  // Retuning by hand should not need a reload.
  update: function (oldData) {
    if (!this.built || !Object.keys(oldData).length) return;
    const d = this.data;
    this.corridor.audio.setRefDistance(d.corridorRefDistance);
    this.corridor.audio.setRolloffFactor(d.corridorRolloff);
    this.corridor.audio.setMaxDistance(d.corridorMaxDistance);
    this.street.forEach((s) =>
      s.audio.setMaxDistance(Math.max(1.5, d.streetRange))
    );
    this.place();
    this.applyGains(0.2);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("zonea-memory", this.onMemory);
    document.removeEventListener("visibilitychange", this.onVisibility);
    clearTimeout(this.pauseTimer);
    clearTimeout(this.fadeTimer);
    this.el.sceneEl.removeBehavior(this);
    if (!this.built) return;
    this.pauseAll();
    // Disconnect the graph, and let the elements go. The LISTENER is not
    // touched: it is AudioKit's and the rest of the page is still using it.
    [this.corridor].concat(this.street).forEach((s) => {
      if (!s) return;
      s.audio.disconnect();
      if (s.audio.parent) s.audio.parent.remove(s.audio);
      s.el.pause();
      s.el.removeAttribute("src");
    });
    this.built = false;
  },
});
