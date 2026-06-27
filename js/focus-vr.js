// ================================================================
// VR in-scene focus view (headset only).
//
// Built entirely from A-Frame entities — no HTML/CSS, because that can't
// render inside the headset. openVRFocus() is called by the click fork ONLY
// when sceneEl.is('vr-mode'); the desktop overlay path is never touched.
//
// Key design choices:
//  - The panel is anchored in WORLD space at click time and does NOT follow
//    the head (head-locked panels are nauseating). It appears in front of
//    where you're looking, then stays put.
//  - "Dim and occlude" replaces CSS blur (impossible in 3D): a translucent
//    dark sphere around the head darkens everything beyond it, while the
//    focus image sits closer (inside the sphere) and stays bright. A backing
//    panel lifts the image off the dimmed space.
//  - Clickable no-op surfaces (image + backing panels) intercept the laser,
//    so ONLY pointing into the empty dimmed space and pulling the trigger
//    closes the view.
//  - Entities are BUILT on open and REMOVED on close, so a clickable thing
//    only exists while it should be clickable (no invisible-but-hittable
//    surfaces), and the memory panel naturally resets each time.
// ================================================================
(function () {
  const VR_DISTANCE = 2.2; // metres in front of the camera at click time
  const VR_EYE_Y = 1.6; // fixed eye height for the panel centre
  const VR_IMG = 1.6; // focus image size (square) — bigger than ring images
  const DIM_RADIUS = 4; // dark sphere radius; ring (~3.7m) falls just inside,
  //                       so we lean on the backing panel for separation too

  let focusEl = null; // world-anchored container (image + text + reveal)
  let dimEl = null; // head-centred dark sphere
  let memoryEl = null; // memory panel (built on reveal, removed on collapse)
  let currentEntry = null; // captions entry for the open image

  function sceneEl() {
    return document.querySelector("a-scene");
  }

  // After adding/removing clickable entities, nudge the laser raycasters to
  // rebuild their target lists. (A-Frame usually auto-refreshes on
  // object3dset, but this makes it deterministic.)
  function refreshRaycasters() {
    ["rightHand", "leftHand"].forEach(function (id) {
      const el = document.getElementById(id);
      const rc = el && el.components && el.components.raycaster;
      if (rc) rc.refreshObjects();
    });
  }

  // Small helper to build an a-text entity with sensible defaults.
  function makeText(value, opts) {
    const t = document.createElement("a-entity");
    t.setAttribute(
      "text",
      Object.assign(
        { value: value, align: "center", color: "#ffffff", width: 2 },
        opts || {}
      )
    );
    return t;
  }

  // A flat, unlit, fog-free material string used for all panels.
  function panelMat(color, opacity) {
    return `color: ${color}; opacity: ${opacity}; shader: flat; transparent: true; fog: false`;
  }

  window.openVRFocus = function (stem, assetId) {
    if (focusEl) closeVRFocus(); // never stack two focus views

    currentEntry = ZoneA.getEntry(stem);
    const title = currentEntry ? currentEntry.title : stem;
    const year = currentEntry ? currentEntry.year : "";

    // --- Dim sphere: child of the camera so it stays centred on the head.
    // A sphere is rotationally symmetric, so head rotation doesn't matter;
    // it just darkens everything farther than DIM_RADIUS. side: back renders
    // the inner faces (we're inside it). It's clickable -> empty-space close.
    const cam = document.getElementById("camera");
    dimEl = document.createElement("a-sphere");
    dimEl.setAttribute("radius", DIM_RADIUS);
    dimEl.setAttribute("material", panelMat("#000000", 0.6) + "; side: back");
    dimEl.setAttribute("class", "clickable");
    cam.appendChild(dimEl);
    dimEl.addEventListener("click", closeVRFocus);

    // --- Anchor a world position in front of where the camera looks. ---
    const camObj = cam.object3D;
    const camPos = new THREE.Vector3();
    camObj.getWorldPosition(camPos);
    const camQuat = new THREE.Quaternion();
    camObj.getWorldQuaternion(camQuat);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    fwd.y = 0;
    fwd.normalize();

    const focusPos = camPos.clone().addScaledVector(fwd, VR_DISTANCE);
    focusPos.y = VR_EYE_Y; // fixed comfortable eye height
    // Yaw so the panel's +Z faces back toward the camera (Y axis only).
    const yawDeg = THREE.MathUtils.radToDeg(
      Math.atan2(camPos.x - focusPos.x, camPos.z - focusPos.z)
    );

    // --- Build the world-anchored focus container. ---
    focusEl = document.createElement("a-entity");
    focusEl.setAttribute("position", `${focusPos.x} ${focusPos.y} ${focusPos.z}`);
    focusEl.setAttribute("rotation", `0 ${yawDeg} 0`);

    // Backing panel — lifts the image out of the dimmed space. Clickable
    // no-op so pointing at the panel/text doesn't fall through to the sphere.
    const backing = document.createElement("a-plane");
    backing.setAttribute("width", VR_IMG + 0.5);
    backing.setAttribute("height", VR_IMG + 1.1);
    backing.setAttribute("position", "0 -0.35 -0.05");
    backing.setAttribute("material", panelMat("#111111", 0.92));
    backing.setAttribute("class", "clickable");
    focusEl.appendChild(backing);

    // The focus image — reuses the same preloaded asset by id.
    const img = document.createElement("a-image");
    img.setAttribute("src", assetId);
    img.setAttribute("width", VR_IMG);
    img.setAttribute("height", VR_IMG);
    img.setAttribute("position", "0 0 0");
    img.setAttribute("class", "clickable"); // intercept so it doesn't close
    focusEl.appendChild(img);

    // Title (prominent) + year (secondary). Light text on the dark backing.
    // NOTE: location is intentionally OMITTED — the default 3D font can't
    // render its Vietnamese diacritics yet. A "location text will go here"
    // slot is left below for the later font step.
    const titleEl = makeText(title, { width: 2.4, color: "#ffffff" });
    titleEl.setAttribute("position", "0 -1.0 0.02");
    focusEl.appendChild(titleEl);

    const yearEl = makeText(year, { width: 1.6, color: "#b9b9b9" });
    yearEl.setAttribute("position", "0 -1.28 0.02");
    focusEl.appendChild(yearEl);
    // (location text will be added here later, once the diacritic font is in)

    // Reveal-memory control, beside the image on the right.
    if (currentEntry && currentEntry.memory) {
      const reveal = document.createElement("a-plane");
      reveal.setAttribute("width", 0.6);
      reveal.setAttribute("height", 0.22);
      reveal.setAttribute("position", `${VR_IMG / 2 + 0.45} 0 0.02`);
      reveal.setAttribute("material", panelMat("#2a2a2a", 0.95));
      reveal.setAttribute("class", "clickable");
      const revealLabel = makeText("Memory", { width: 1.4, color: "#eaeaea" });
      revealLabel.setAttribute("position", "0 0 0.01");
      reveal.appendChild(revealLabel);
      reveal.addEventListener("click", toggleMemory);
      focusEl.appendChild(reveal);
    }

    sceneEl().appendChild(focusEl);

    // Let the new meshes initialise, then refresh the laser targets.
    requestAnimationFrame(refreshRaycasters);
  };

  // Memory reveal: build a second panel beside the image (right), not over
  // it. Toggling again (or its × control) removes it.
  function toggleMemory() {
    if (memoryEl) {
      collapseMemory();
      return;
    }
    if (!currentEntry || !currentEntry.memory) return;

    const panelH = VR_IMG + 0.6;
    memoryEl = document.createElement("a-entity");
    memoryEl.setAttribute("position", `${VR_IMG / 2 + 1.35} 0 0`);

    const mback = document.createElement("a-plane");
    mback.setAttribute("width", 1.5);
    mback.setAttribute("height", panelH);
    mback.setAttribute("position", "0 0 -0.02");
    mback.setAttribute("material", panelMat("#111111", 0.92));
    mback.setAttribute("class", "clickable"); // no-op
    memoryEl.appendChild(mback);

    // Close (×) control, top-right of the memory panel.
    const close = document.createElement("a-plane");
    close.setAttribute("width", 0.18);
    close.setAttribute("height", 0.18);
    close.setAttribute("position", `0.62 ${panelH / 2 - 0.18} 0.01`);
    close.setAttribute("material", panelMat("#2a2a2a", 1));
    close.setAttribute("class", "clickable");
    const closeLabel = makeText("x", { width: 0.7, color: "#eaeaea" });
    closeLabel.setAttribute("position", "0 0 0.01");
    close.appendChild(closeLabel);
    close.addEventListener("click", collapseMemory);
    memoryEl.appendChild(close);

    // Memory body text, top-aligned and wrapped.
    const mtext = makeText(currentEntry.memory, {
      width: 1.35,
      align: "left",
      color: "#e6e6e6",
      wrapCount: 30,
      baseline: "top",
    });
    mtext.setAttribute("position", `-0.62 ${panelH / 2 - 0.18} 0.01`);
    memoryEl.appendChild(mtext);

    focusEl.appendChild(memoryEl);
    requestAnimationFrame(refreshRaycasters);
  }

  function collapseMemory() {
    if (memoryEl && memoryEl.parentNode) memoryEl.parentNode.removeChild(memoryEl);
    memoryEl = null;
    refreshRaycasters();
  }

  // Close the whole VR focus view and restore the scene.
  function closeVRFocus() {
    collapseMemory(); // reset memory panel for next time
    if (focusEl && focusEl.parentNode) focusEl.parentNode.removeChild(focusEl);
    if (dimEl && dimEl.parentNode) dimEl.parentNode.removeChild(dimEl);
    focusEl = null;
    dimEl = null;
    currentEntry = null;
    refreshRaycasters();
  }

  window.closeVRFocus = closeVRFocus; // exposed for completeness
})();
