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
// ================================================================
window.ZoneA = window.ZoneA || {};

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

  function notify() {
    if (onChange) onChange(isPlaying());
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
