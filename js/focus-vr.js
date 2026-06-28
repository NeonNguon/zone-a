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
  // Elements that make up the IMAGE STATE (image, title, year, reveal control).
  // Hidden when the memory replaces the image, shown again on close. Each rec is
  // { el, cls } where cls is the clickable class to restore (null if not click).
  let imageStateEls = [];

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

  // Show/hide the IMAGE STATE as a group. Hiding also strips the clickable
  // class so the laser can't hit (e.g.) the now-invisible reveal control;
  // showing restores it. Callers refresh the raycasters afterwards.
  function setImageStateVisible(on) {
    imageStateEls.forEach(function (rec) {
      rec.el.setAttribute("visible", on);
      if (rec.cls) {
        if (on) rec.el.setAttribute("class", rec.cls);
        else rec.el.removeAttribute("class");
      }
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

    // IMAGE STATE elements are (re)collected fresh on each open.
    imageStateEls = [];

    // The focus image — reuses the same preloaded asset by id.
    const img = document.createElement("a-image");
    img.setAttribute("src", assetId);
    img.setAttribute("width", VR_IMG);
    img.setAttribute("height", VR_IMG);
    img.setAttribute("position", "0 0 0");
    img.setAttribute("class", "clickable"); // intercept so it doesn't close
    focusEl.appendChild(img);
    imageStateEls.push({ el: img, cls: "clickable" });

    // Title (prominent) + year (secondary). Light text on the dark backing.
    // NOTE: location is intentionally OMITTED — the default 3D font can't
    // render its Vietnamese diacritics yet. A "location text will go here"
    // slot is left below for the later font step.
    const titleEl = makeText(title, { width: 2.4, color: "#ffffff" });
    titleEl.setAttribute("position", "0 -1.0 0.02");
    focusEl.appendChild(titleEl);
    imageStateEls.push({ el: titleEl, cls: null });

    const yearEl = makeText(year, { width: 1.6, color: "#b9b9b9" });
    yearEl.setAttribute("position", "0 -1.28 0.02");
    focusEl.appendChild(yearEl);
    imageStateEls.push({ el: yearEl, cls: null });
    // (location text will be added here later, once the diacritic font is in)

    // Reveal-memory control, beside the image on the right. Clicking it enters
    // MEMORY STATE (memory replaces the image in the central panel).
    if (currentEntry && currentEntry.memory) {
      const reveal = document.createElement("a-plane");
      reveal.setAttribute("width", 0.85);
      reveal.setAttribute("height", 0.22);
      reveal.setAttribute("position", `${VR_IMG / 2 + 0.55} 0 0.02`);
      reveal.setAttribute("material", panelMat("#2a2a2a", 0.95));
      reveal.setAttribute("class", "clickable");
      const revealLabel = makeText("reveal memory", {
        width: 1.7,
        color: "#eaeaea",
      });
      revealLabel.setAttribute("position", "0 0 0.01");
      reveal.appendChild(revealLabel);
      reveal.addEventListener("click", showMemory);
      focusEl.appendChild(reveal);
      imageStateEls.push({ el: reveal, cls: "clickable" });
    }

    // Audio control, below the reveal control. Replays / stops the spoken
    // memory. It lives in the IMAGE STATE group, so it hides with the image
    // when the memory is revealed — the audio itself keeps playing across that
    // toggle (it belongs to the focused image, not the state).
    const audioCtrl = document.createElement("a-plane");
    audioCtrl.setAttribute("width", 0.85);
    audioCtrl.setAttribute("height", 0.22);
    audioCtrl.setAttribute("position", `${VR_IMG / 2 + 0.55} -0.3 0.02`);
    audioCtrl.setAttribute("material", panelMat("#2a2a2a", 0.95));
    audioCtrl.setAttribute("class", "clickable");
    const audioLabel = makeText("Stop audio", { width: 1.7, color: "#eaeaea" });
    audioLabel.setAttribute("position", "0 0 0.01");
    audioCtrl.appendChild(audioLabel);
    audioCtrl.addEventListener("click", function () {
      ZoneA.audio.toggle();
    });
    focusEl.appendChild(audioCtrl);
    imageStateEls.push({ el: audioCtrl, cls: "clickable" });

    // Play this image's spoken memory from the start. One reused audio element
    // means switching images (openVRFocus calls closeVRFocus first) stops the
    // previous clip before this one begins — never two at once.
    ZoneA.audio.setOnChange(function (playing) {
      audioLabel.setAttribute("text", "value", playing ? "Stop audio" : "Replay audio");
    });
    ZoneA.audio.playFor(stem);

    sceneEl().appendChild(focusEl);

    // Let the new meshes initialise, then refresh the laser targets.
    requestAnimationFrame(refreshRaycasters);
  };

  // Enter MEMORY STATE: hide the image, title, year and reveal control, and
  // build a single dark card in the SAME central position the image occupied,
  // with the memory text parented INSIDE it. The × control returns to IMAGE
  // STATE. This is a toggle between two states in one place.
  function showMemory() {
    if (memoryEl) return; // already in memory state
    if (!currentEntry || !currentEntry.memory) return;

    setImageStateVisible(false);

    // Centred over the image footprint (image is at "0 0"); a touch in front so
    // it cleanly covers the now-hidden image.
    const panelW = 1.9;
    const panelH = 1.9;
    const pad = 0.14; // inward padding from the panel edges

    // The ONE dark panel. It is also the memory root, so the text and close
    // control live INSIDE it (parented), not at their own world position.
    memoryEl = document.createElement("a-plane");
    memoryEl.setAttribute("width", panelW);
    memoryEl.setAttribute("height", panelH);
    memoryEl.setAttribute("position", "0 0 0.02");
    memoryEl.setAttribute("material", panelMat("#111111", 0.92));
    memoryEl.setAttribute("class", "clickable"); // no-op: don't fall through

    // Memory body text — child of the panel, anchored to its top-left corner
    // and padded inward, wrapped to the panel width so it stays inside the card.
    const mtext = makeText(currentEntry.memory, {
      width: panelW - pad * 2,
      align: "left",
      anchor: "left", // start at the left edge; never spill past it
      baseline: "top", // start at the top; flow downward
      color: "#e6e6e6",
      wrapCount: 32,
    });
    mtext.setAttribute(
      "position",
      `${-panelW / 2 + pad} ${panelH / 2 - 0.3} 0.01`
    );
    memoryEl.appendChild(mtext);

    // Close (×) control, top-right corner of the panel → back to IMAGE STATE.
    const close = document.createElement("a-plane");
    close.setAttribute("width", 0.18);
    close.setAttribute("height", 0.18);
    close.setAttribute(
      "position",
      `${panelW / 2 - 0.16} ${panelH / 2 - 0.16} 0.02`
    );
    close.setAttribute("material", panelMat("#2a2a2a", 1));
    close.setAttribute("class", "clickable");
    const closeLabel = makeText("x", { width: 0.7, color: "#eaeaea" });
    closeLabel.setAttribute("position", "0 0 0.01");
    close.appendChild(closeLabel);
    close.addEventListener("click", hideMemory);
    memoryEl.appendChild(close);

    focusEl.appendChild(memoryEl);
    requestAnimationFrame(refreshRaycasters);
  }

  // Return to IMAGE STATE: remove the memory card and show the image group.
  function hideMemory() {
    if (memoryEl && memoryEl.parentNode) memoryEl.parentNode.removeChild(memoryEl);
    memoryEl = null;
    setImageStateVisible(true);
    refreshRaycasters();
  }

  // Close the whole VR focus view and restore the scene. The memory card (if
  // open) is a child of focusEl and is removed with it; nulling memoryEl and
  // clearing imageStateEls resets to IMAGE STATE for the next open.
  function closeVRFocus() {
    ZoneA.audio.stop(); // never let the clip outlive the focus view
    ZoneA.audio.clearOnChange();
    if (focusEl && focusEl.parentNode) focusEl.parentNode.removeChild(focusEl);
    if (dimEl && dimEl.parentNode) dimEl.parentNode.removeChild(dimEl);
    focusEl = null;
    dimEl = null;
    memoryEl = null;
    imageStateEls = [];
    currentEntry = null;
    refreshRaycasters();
  }

  window.closeVRFocus = closeVRFocus; // exposed for completeness
})();
