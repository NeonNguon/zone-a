// ================================================================
// Desktop / web HTML focus overlay controller.
//
// Behaviour is UNCHANGED from the single-file version. The only differences:
//   - it reads captions from the shared ZoneA loader (no own fetch);
//   - it's named window.openDesktopFocus so the click fork can pick it.
// Loaded at the END of <body> because it needs the overlay DOM to exist.
// ================================================================
(function () {
  const overlay = document.getElementById("focus-overlay");
  const row = document.getElementById("focus-row");
  const image = document.getElementById("focus-image");
  const title = document.getElementById("focus-title");
  const meta = document.getElementById("focus-meta");
  const reveal = document.getElementById("focus-reveal");
  const memory = document.getElementById("focus-memory");
  const memoryText = document.getElementById("focus-memory-text");
  const memoryClose = document.getElementById("focus-memory-close");

  function collapseMemory() {
    memory.classList.remove("open");
    row.classList.remove("memory-open");
  }

  window.openDesktopFocus = function (path) {
    const stem = ZoneA.stemFromPath(path);
    const entry = ZoneA.getEntry(stem);

    image.setAttribute("src", path);

    if (entry) {
      // textContent renders the Vietnamese diacritics fine (page is UTF-8).
      title.textContent = entry.title;
      meta.textContent = entry.location + " · " + entry.year;
      memoryText.textContent = entry.memory;
      reveal.style.display = ""; // there is a memory to reveal
    } else {
      // Graceful fallback if the entry (or whole file) is missing.
      title.textContent = stem;
      meta.textContent = "";
      memoryText.textContent = "";
      reveal.style.display = "none";
    }

    collapseMemory(); // always start with memory hidden
    overlay.classList.add("visible"); // CSS fade-in

    // Freeze mouse-look so the scene doesn't swing behind the blur.
    const cam = document.getElementById("camera");
    if (cam) cam.setAttribute("look-controls", "enabled", false);
  };

  function closeFocus() {
    overlay.classList.remove("visible"); // fade-out
    collapseMemory(); // reset for next time
    const cam = document.getElementById("camera");
    if (cam) cam.setAttribute("look-controls", "enabled", true);
  }

  // --- Memory reveal toggle ---------------------------------------
  reveal.addEventListener("click", function () {
    const opening = !memory.classList.contains("open");
    memory.classList.toggle("open", opening);
    row.classList.toggle("memory-open", opening);
  });
  memoryClose.addEventListener("click", collapseMemory);

  // --- Dismiss: only a click on the backdrop itself closes ---------
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeFocus();
  });

  // Esc closes, but only when the overlay is open.
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("visible")) {
      closeFocus();
    }
  });
})();
