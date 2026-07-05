// ================================================================
// Zone B — triptych sub-zone: three stacked "Ticket 485496" images past the
// wall's right end, turned 90° to the wall so the stack faces back along the
// wall's axis. Loaded in <head> AFTER zone-b.js: it reuses the wall's hover
// treatment (wall-tile-hover) and derives its image size from the wall's own
// computed tile metrics — a wall-size change propagates here automatically.
//
// The stack is built bottom-up from the floor (the group entity's origin is
// expected to sit at floor level, like the terminals): `bottomHeight` is the
// lowest image's BOTTOM edge above the floor, `stackGap` the vertical gap
// between images. Sources are listed TOP to BOTTOM (alphabetical filename
// order of the Ticket 485496 folder).
//
// TUNABLES (adjust by eye via setAttribute — no code edits):
//   imageScale   — per-image size vs the wall's tile size (default 1.25).
//   bottomHeight — lowest image's bottom edge above the floor (m).
//   stackGap     — gap between images (m). -1 = AUTO: chosen so the stack's
//                  total vertical extent matches the wall's height.
//   (group position/rotation live on the container entity in index.html;
//    srcs/title cover one-off content changes.)
// ================================================================
AFRAME.registerComponent("zone-b-triptych", {
  schema: {
    wall: { type: "selector", default: "#zone-b-wall" },
    // Top -> bottom. Paths are plain (spaces allowed); encoded when used.
    srcs: {
      type: "array",
      default: [
        "Ticket 485496/Ticket485496.jpg",
        "Ticket 485496/Ticket485496_100frames.jpg",
        "Ticket 485496/Ticket485496pieces.jpg",
      ],
    },
    title: { type: "string", default: "Ticket 485496" },
    imageScale: { type: "number", default: 1.25 }, // × the wall's tile size
    bottomHeight: { type: "number", default: 0.5 }, // m above the floor
    stackGap: { type: "number", default: -1 }, // m; -1 = AUTO (match wall height)
  },

  init: function () {
    this.images = [];
    this.wallEl = this.data.wall;
    // The wall computes its tile metrics asynchronously (manifest fetch);
    // build whenever it (re)builds so the sizes track the live wall config.
    this.onWallBuilt = () => this.build();
    if (this.wallEl) {
      this.wallEl.addEventListener("imagewallbuilt", this.onWallBuilt);
    } else {
      console.warn("zone-b-triptych: wall selector matched nothing");
    }
    this.build(); // no-op until the wall metrics exist (component re-init)
  },

  // Re-layout on any live tunable change.
  update: function (oldData) {
    if (Object.keys(oldData).length === 0) return; // first update: init did it
    this.build();
  },

  build: function () {
    const wall =
      this.wallEl &&
      this.wallEl.components &&
      this.wallEl.components["image-wall"];
    if (!wall || !wall.tileW) return; // wall not built yet

    // Clear any previous build (supports live re-layout).
    this.images.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
    this.images = [];

    const d = this.data;
    const imgW = wall.tileW * d.imageScale;
    const imgH = wall.tileH * d.imageScale;
    const n = d.srcs.length;

    // AUTO gap: total extent (n images + n-1 gaps) = the wall's height, so
    // the stack reads as tall as the wall. Floored so a wall/scale change
    // can never push the images into overlap.
    const gap =
      d.stackGap >= 0
        ? d.stackGap
        : Math.max(0.05, (wall.wallHeight - n * imgH) / Math.max(1, n - 1));

    for (let i = 0; i < n; i++) {
      const slot = n - 1 - i; // srcs[0] is the TOP image; slot 0 = bottom
      const y = d.bottomHeight + imgH / 2 + slot * (imgH + gap);
      const img = document.createElement("a-image");
      img.setAttribute("src", encodeURI(d.srcs[i]));
      img.setAttribute("position", `0 ${y} 0`);
      img.setAttribute("width", imgW);
      img.setAttribute("height", imgH); // width/height set separately -> no squash
      img.setAttribute("class", "clickable"); // raycaster-targetable (hover/focus)
      img.setAttribute("wall-tile-hover", ""); // the wall's black frame + pop
      this.el.appendChild(img);
      this.images.push(img);
    }

    const extent = n * imgH + (n - 1) * gap;
    console.log(
      `zone-b-triptych: ${n} image(s) ${imgW.toFixed(2)}×${imgH.toFixed(2)} m, ` +
        `gap ${gap.toFixed(2)} m — extent ${extent.toFixed(2)} m ` +
        `(wall ${wall.wallHeight.toFixed(2)} m), ` +
        `bottom ${d.bottomHeight.toFixed(2)} m, top ${(d.bottomHeight + extent).toFixed(2)} m.`
    );
  },

  remove: function () {
    if (this.wallEl) {
      this.wallEl.removeEventListener("imagewallbuilt", this.onWallBuilt);
    }
    this.images.forEach((el) => el.parentNode && el.parentNode.removeChild(el));
    this.images = [];
  },
});
