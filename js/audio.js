// ================================================================
// Shared focus-view audio — the artist reading each image's memory aloud.
//
// ONE HTMLAudioElement is reused for every clip, so starting a new clip
// inherently stops the previous one: there is never more than one playing.
// Clips are loaded ON DEMAND by filename-stem (the SAME key as captions),
// NOT preloaded in <a-assets>: only ATPIHL1's recording exists so far, and
// preloading the not-yet-recorded files would 404 and could stall a-assets.
// A missing file simply fails to play (the rejection is swallowed) — no crash.
//
// Both focus views (desktop overlay + in-scene VR) drive this same module, so
// play-on-open, stop-on-close, stop-on-switch and replay behave identically
// in and out of the headset.
//
// This file also carries AudioKit — the page's ONE THREE.AudioListener, shared
// by everything that wants spatial sound. See the block above it.
// ================================================================
window.ZoneA = window.ZoneA || {};

// ================================================================
// AudioKit — the page's single AudioListener, and the resume that unlocks it.
//
// THERE MUST ONLY EVER BE ONE. A THREE.AudioListener is the ears: it owns an
// AudioContext and every PositionalAudio in the scene mixes into it. Two of
// them means two AudioContexts, two sets of ears at the same place, and sound
// that pans against itself — and browsers cap how many contexts a page may
// open, so the second one can simply fail. Zone C's cinema built one for the
// film; the corridor's field recordings need the same one, not another.
//
// So the listener lives here, on #camera, for the life of the page. It is
// NEVER removed: a component that tore it down on its own remove() would take
// the ears out from under everything else still playing. Whoever asks first
// creates it; everyone after gets the same object. getListener() also ADOPTS a
// listener already parented to the camera, so it stays correct if something
// attaches one before this is called.
//
// THE RESUME NEEDS A USER GESTURE. An AudioContext created outside one starts
// suspended on Quest and mobile and stays silent however much you play into
// it. So resume() is called from inside the click that brings the visitor
// somewhere with sound: Zone C's play button, and the corridor's teleport cut.
// ================================================================
window.AudioKit = (function () {
  let listener = null;

  return {
    getListener: function () {
      if (listener) return listener;
      if (typeof THREE === "undefined") return null;
      const cam = document.getElementById("camera");
      if (!cam || !cam.object3D) {
        console.warn("AudioKit: no #camera yet; spatial audio will be silent");
        return null;
      }
      // Adopt one that is already there rather than adding a second.
      cam.object3D.children.forEach(function (c) {
        if (!listener && (c.type === "AudioListener" ||
                          c instanceof THREE.AudioListener)) {
          listener = c;
        }
      });
      if (!listener) {
        listener = new THREE.AudioListener();
        cam.object3D.add(listener);
      }
      return listener;
    },

    // Call from inside a user gesture. Safe to call repeatedly.
    resume: function () {
      const l = this.getListener();
      if (l && l.context && l.context.state === "suspended") {
        const p = l.context.resume();
        if (p && p.catch) p.catch(function () {});
      }
      return l;
    },
  };
})();

(function () {
  let el = null; // the single, reused <audio> element
  let currentStem = null; // stem of the clip currently loaded
  let onChange = null; // active view's label updater: fn(isPlaying)

  // "ATPIHL3" -> "ATPIHL/ATPIHL3.mp3": same folder + stem as the image.
  ZoneA.audioPathFromStem = function (stem) {
    return "ATPIHL/" + stem + ".mp3";
  };

  function ensureEl() {
    if (el) return el;
    el = new Audio();
    el.preload = "auto";
    // Any of these can flip play/stop state; reflect it on the active control.
    ["play", "playing", "pause", "ended", "error"].forEach(function (ev) {
      el.addEventListener(ev, notify);
    });
    return el;
  }

  function isPlaying() {
    return !!el && !el.paused && !el.ended;
  }

  // The active view's label updater, plus a BROADCAST for anyone else who
  // needs to know a memory is being spoken.
  //
  // setOnChange is a single slot and the focus views own it — whichever view
  // is open holds it and clears it on close — so a second listener cannot just
  // take it. The corridor's ambience has to duck under a spoken memory, and
  // that is what this event is for: emit it, and anything may listen without
  // touching the slot. Not bubbled: it is a page-level fact, not a DOM one.
  function notify() {
    if (onChange) onChange(isPlaying());
    const scene = document.querySelector("a-scene");
    if (scene) scene.emit("zonea-memory", { playing: isPlaying() }, false);
  }

  // play() rejects if the file is missing/unsupported or autoplay is blocked;
  // swallow it so an unrecorded clip is a silent no-op rather than an error.
  function start() {
    const p = el.play();
    if (p && p.catch) p.catch(function () {});
  }

  ZoneA.audio = {
    // Stop whatever is playing and play this stem's clip from the start.
    // Reusing one element means the previous clip is replaced, never layered.
    playFor: function (stem) {
      ensureEl();
      currentStem = stem;
      el.pause();
      el.src = ZoneA.audioPathFromStem(stem);
      try {
        el.currentTime = 0;
      } catch (e) {}
      start();
    },

    // Stop and rewind — used on focus close and as the control's "stop".
    stop: function () {
      if (!el) return;
      el.pause();
      try {
        el.currentTime = 0;
      } catch (e) {}
      notify();
    },

    // Control action: stop if playing, else replay the current clip from 0.
    toggle: function () {
      if (!el || !currentStem) return;
      if (isPlaying()) {
        this.stop();
      } else {
        try {
          el.currentTime = 0;
        } catch (e) {}
        start();
      }
    },

    isPlaying: isPlaying,

    // The active focus view registers a label updater on open and clears it
    // on close, so only the currently visible control reflects playback state.
    setOnChange: function (fn) {
      onChange = fn;
    },
    clearOnChange: function (fn) {
      if (!fn || onChange === fn) onChange = null;
    },
  };
})();
