// ================================================================
// Shared captions loader.
//
// Fetches ATPIHL/captions.json ONCE and exposes a tiny namespace that BOTH
// focus views (the desktop HTML overlay AND the in-scene VR view) read — so
// the data lives in exactly one place and is fetched exactly once.
// ================================================================
window.ZoneA = window.ZoneA || {};

(function () {
  let captions = null;

  // Kick the fetch off immediately on load. `whenReady` is available if any
  // caller ever needs to await it; `getEntry()` is the simple synchronous
  // accessor used at click time (by then the small JSON has long loaded).
  ZoneA.whenReady = fetch("ATPIHL/captions.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json(); // res.json() decodes the body as UTF-8
    })
    .then(function (data) {
      captions = data;
      console.log("Captions loaded:", Object.keys(data).length, "entries");
      return data;
    })
    .catch(function (err) {
      // Log clearly and keep going; the views fall back to the filename stem.
      console.error("Could not load ATPIHL/captions.json:", err);
      return null;
    });

  // Look up one entry by filename-stem, e.g. "ATPIHL3". null if missing.
  ZoneA.getEntry = function (stem) {
    return captions ? captions[stem] : null;
  };

  // "ATPIHL/ATPIHL3.jpg" -> "ATPIHL3": drop folder, strip extension.
  // This stem is exactly the key used in captions.json.
  ZoneA.stemFromPath = function (path) {
    var file = path.split("/").pop();
    return file.replace(/\.[^.]+$/, "");
  };
})();
