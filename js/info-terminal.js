// ================================================================
// info-terminal — a per-zone reading station: the same pedestal+screen
// furniture as the teleport terminals (shared TerminalKit), whose screen
// shows the zone TITLE and the opening lines of its wall text, faded out at
// the bottom edge to signal there is more. Clicking it opens the full text
// on a large in-scene focus panel:
//
//  - Same capture-and-restore grammar as the wall/map focus: the panel
//    springs from the terminal's head to a readable spot in front of the
//    camera (computed once, not head-locked), a camera-child dim sphere
//    darkens everything else, and dismissing flies it back to the terminal.
//    Works identically on desktop and in the headset (all in-scene, no DOM).
//  - One panel at a time (focused guard; the dim occludes the other
//    terminals); clicking the dim = click-outside-to-close, matching the
//    lightbox behaviour, plus a drawn close button and Esc on desktop.
//  - The panel is a 1024×1280 canvas: dark ground, light text, title top,
//    body word-wrapped below. If the text overflows, a scrollbar track +
//    proportional thumb draw on the right edge and two arrow buttons (with
//    enlarged hit planes) appear; scrolling also answers the mouse wheel
//    (desktop) and controller thumbstick Y (Quest), clamped at both ends.
//    The canvas redraws only when the offset changes, at most once per
//    frame; the tick registers only while the panel is open — zero cost
//    idle or closed.
//
// The screen is ONE runtime canvas (no image assets, same approach as the
// contact-cue and terrazzo textures), drawn once at init — static, zero
// runtime cost. Fonts are the CSS system stack ("Helvetica Neue", Helvetica,
// Arial) — canvas text handles the Vietnamese diacritics in Zone B.
//
// Content comes from window.ZoneTexts via `key` (a | b | c), or from the
// `title` / `text` properties directly for one-off use.
//
// TUNABLES: key/title/text (content); screenWidth/screenHeight/
//   screenHeightAboveFloor/tilt/hitScale (furniture, same knobs as the
//   teleport terminals).
// ================================================================
AFRAME.registerComponent("info-terminal", {
  schema: {
    key: { type: "string", default: "" }, // ZoneTexts key: a | b | c
    title: { type: "string", default: "" }, // direct override
    text: { type: "string", default: "" },
    screenWidth: { type: "number", default: 0.52 },
    screenHeight: { type: "number", default: 0.36 },
    screenHeightAboveFloor: { type: "number", default: 1.15 },
    tilt: { type: "number", default: -12 },
    hitScale: { type: "number", default: 2.2 },
    // focus panel
    panelWidth: { type: "number", default: 1.35 }, // m; height = ×1.25 (canvas aspect)
    panelDistance: { type: "number", default: 1.9 }, // m in front of the camera
    bodyFontSize: { type: "number", default: 31 }, // canvas px (legibility knob)
    scrollSpeed: { type: "number", default: 700 }, // canvas px/s at full stick
    dimRadius: { type: "number", default: 4 },
    dimOpacity: { type: "number", default: 0.6 },
    dur: { type: "number", default: 400 }, // fly in/out, ms
  },

  FONT: '"Helvetica Neue", Helvetica, Arial, sans-serif',

  init: function () {
    this.focused = false; // a panel is open
    this.anim = null; // fly tween in flight
    this.panelEl = null; // built lazily on first open, then reused
    this.stickY = 0;

    // Resolve content: explicit props win, else the ZoneTexts entry.
    const entry = (window.ZoneTexts && window.ZoneTexts[this.data.key]) || {};
    this.title = this.data.title || entry.title || "";
    this.text = this.data.text || entry.text || "";
    if (!this.title && !this.text) {
      console.warn("info-terminal: no content (key/title/text all empty)");
    }

    this.rig = TerminalKit.build(this.el, {
      canvas: this.makePreviewCanvas(),
      screenWidth: this.data.screenWidth,
      screenHeight: this.data.screenHeight,
      screenHeightAboveFloor: this.data.screenHeightAboveFloor,
      tilt: this.data.tilt,
      hitScale: this.data.hitScale,
    });

    this.onClick = () => this.openPanel();
    this.rig.hitEl.addEventListener("click", this.onClick);
  },

  // The NEAR screen: title prominently, the first lines of the body small
  // below it, fading to the background over the last rows — "there is more".
  // Same face family as the teleport terminals (dark ground, thin frame).
  makePreviewCanvas: function () {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0b0b10";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title, wrapped if needed (long titles span two lines).
    ctx.fillStyle = "#e8eef8";
    ctx.font = "600 34px " + this.FONT;
    ctx.textBaseline = "alphabetic";
    const titleLines = this.wrapText(ctx, this.title, 512 - 2 * 34);
    let y = 62;
    titleLines.slice(0, 2).forEach((line) => {
      ctx.fillText(line, 34, y);
      y += 42;
    });
    ctx.fillStyle = "#bfe6ff"; // the family's accent rule
    ctx.fillRect(34, y - 24, 90, 3);
    y += 8;

    // Body excerpt, small.
    ctx.fillStyle = "#9fb0c8";
    ctx.font = "17px " + this.FONT;
    const bodyLines = this.wrapText(ctx, this.text, 512 - 2 * 34);
    for (let i = 0; i < bodyLines.length && y < 350; i++) {
      ctx.fillText(bodyLines[i], 34, y);
      y += 25;
    }

    // Fade the bottom edge back to the ground color (more below the fold).
    const fade = ctx.createLinearGradient(0, 250, 0, 352);
    fade.addColorStop(0, "rgba(11, 11, 16, 0)");
    fade.addColorStop(1, "rgba(11, 11, 16, 1)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 250, canvas.width, 110);

    // Thin frame LAST so the fade never covers it (family face).
    ctx.strokeStyle = "#3a4a66";
    ctx.strokeRect(10.5, 10.5, canvas.width - 21, canvas.height - 21);
    return canvas;
  },

  // Greedy word-wrap via measureText (shared by the preview and the panel).
  wrapText: function (ctx, text, maxWidth) {
    const words = (text || "").split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const probe = line ? line + " " + word : word;
      if (ctx.measureText(probe).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    if (line) lines.push(line);
    return lines;
  },

  // ================= focus panel =================
  // Canvas layout constants (1024×1280; larger knobs are schema props).
  PANEL_W: 1024,
  PANEL_H: 1280,
  MARGIN: 64,
  BAR_X: 980, // scrollbar/button column centre (canvas px)

  openPanel: function () {
    if (this.focused || this.anim) return; // one at a time; no re-trigger
    this.focused = true;
    if (!this.panelEl) this.buildPanel();

    // Layout is (re)computed lazily once; scroll position persists across
    // opens so a reader can resume.
    this.scrollDirty = true;
    this.stickY = 0;

    // Anchor a spot panelDistance in front of the camera at eye height,
    // facing the camera — computed once, like wall-focus (not head-locked).
    const cam = document.getElementById("camera").object3D;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camQuat = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
    fwd.y = 0;
    fwd.normalize();
    const focusPos = camPos.clone().addScaledVector(fwd, this.data.panelDistance);
    focusPos.y = camPos.y;
    const dir = camPos.clone().sub(focusPos).normalize();
    const faceQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir
    );

    // Capture-and-restore: spawn AT the terminal's head (screen-sized) and
    // fly to the focus spot; dismissing flies it back to this exact home.
    const headPos = this.rig.head.object3D.getWorldPosition(new THREE.Vector3());
    const headQuat = this.rig.head.object3D.getWorldQuaternion(new THREE.Quaternion());
    const startScale = this.data.screenWidth / this.data.panelWidth;
    this.home = {
      pos: headPos,
      quat: headQuat,
      scale: new THREE.Vector3(startScale, startScale, startScale),
    };

    const obj = this.panelEl.object3D;
    obj.position.copy(this.home.pos);
    obj.quaternion.copy(this.home.quat);
    obj.scale.copy(this.home.scale);
    this.panelEl.object3D.visible = true;
    this.panelEl.setAttribute("visible", true);

    this.buildDim();
    this.attachInputs();
    this.startAnim(obj, focusPos, faceQuat, new THREE.Vector3(1, 1, 1), null);
    this.el.sceneEl.addBehavior(this); // tick runs only while open
  },

  closePanel: function () {
    if (!this.focused || this.anim) return;
    this.teardownDim(); // un-dim immediately; the panel flies home
    this.detachInputs();
    const obj = this.panelEl.object3D;
    this.startAnim(obj, this.home.pos, this.home.quat, this.home.scale, () => {
      this.panelEl.setAttribute("visible", false);
      this.panelEl.object3D.visible = false;
      this.focused = false;
      this.refreshRaycasters();
    });
  },

  // --- panel construction (once, lazily; reused across opens) -------------
  buildPanel: function () {
    const d = this.data;
    const W = this.PANEL_W, H = this.PANEL_H;
    this.canvas2 = document.createElement("canvas");
    this.canvas2.width = W;
    this.canvas2.height = H;
    this.layoutPanelText();
    this.scrollOffset = 0;

    const panelH = d.panelWidth * (H / W);
    this.panelTex = new THREE.CanvasTexture(this.canvas2);
    this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panelGeo = new THREE.PlaneGeometry(d.panelWidth, panelH);
    this.panelMat = new THREE.MeshBasicMaterial({ map: this.panelTex });

    const panel = document.createElement("a-entity");
    panel.setAttribute("visible", false);
    panel.setAttribute("class", "clickable"); // body clicks land HERE (no-op),
    //                                           not on the dim behind it
    panel.addEventListener(
      "loaded",
      () => panel.setObject3D("panel", new THREE.Mesh(this.panelGeo, this.panelMat)),
      { once: true }
    );
    this.el.sceneEl.appendChild(panel);
    this.panelEl = panel;

    // Invisible enlarged hit planes over the drawn buttons (canvas px ->
    // panel-local metres). Children of the panel: they fly and scale with it.
    this.hitPlanes = [];
    this.closeHit = this.buttonHit(panel, this.BAR_X, 64, () => this.closePanel());
    if (this.maxOffset > 0) {
      this.upHit = this.buttonHit(panel, this.BAR_X, this.bodyTop + 26, () =>
        this.scrollBy(-this.bodyViewH * 0.6)
      );
      this.downHit = this.buttonHit(panel, this.BAR_X, H - 50, () =>
        this.scrollBy(this.bodyViewH * 0.6)
      );
    }
    this.redrawPanel();
  },

  // One invisible 0.17 m hit plane centred on a canvas-space point.
  buttonHit: function (panel, cx, cy, onClick) {
    const d = this.data;
    const W = this.PANEL_W, H = this.PANEL_H;
    const panelH = d.panelWidth * (H / W);
    const hit = document.createElement("a-plane");
    hit.setAttribute("width", 0.17);
    hit.setAttribute("height", 0.17);
    hit.setAttribute(
      "position",
      `${(cx / W - 0.5) * d.panelWidth} ${(0.5 - cy / H) * panelH} 0.01`
    );
    hit.setAttribute("material", "opacity: 0; transparent: true; depthWrite: false");
    hit.setAttribute("class", "clickable");
    hit.addEventListener("click", onClick);
    panel.appendChild(hit);
    this.hitPlanes.push(hit);
    return hit;
  },

  // --- text layout: title lines + wrapped body lines, scroll extents ------
  layoutPanelText: function () {
    const ctx = this.canvas2.getContext("2d");
    const W = this.PANEL_W, H = this.PANEL_H, M = this.MARGIN;
    const textW = W - 2 * M - 56; // room for the scrollbar column

    ctx.font = "600 52px " + this.FONT;
    this.titleLines = this.wrapText(ctx, this.title, textW);
    this.bodyTop = 96 + this.titleLines.length * 62 + 46;

    ctx.font = this.data.bodyFontSize + "px " + this.FONT;
    this.bodyLines = this.wrapText(ctx, this.text, textW);
    this.lineH = Math.round(this.data.bodyFontSize * 1.5);
    this.bodyViewH = H - this.bodyTop - M;
    this.maxOffset = Math.max(0, this.bodyLines.length * this.lineH - this.bodyViewH);
  },

  scrollBy: function (px) {
    this.scrollOffset = Math.max(0, Math.min(this.maxOffset, this.scrollOffset + px));
    this.scrollDirty = true; // consumed by the tick, one redraw per frame max
  },

  // Full repaint (only ever runs when something changed, ≤ once per frame).
  redrawPanel: function () {
    const ctx = this.canvas2.getContext("2d");
    const W = this.PANEL_W, H = this.PANEL_H, M = this.MARGIN;
    ctx.fillStyle = "#10131a";
    ctx.fillRect(0, 0, W, H);

    // Title + accent rule (fixed, never scrolls).
    ctx.fillStyle = "#eef2f8";
    ctx.font = "600 52px " + this.FONT;
    let y = 96;
    this.titleLines.forEach((line) => {
      ctx.fillText(line, M, y);
      y += 62;
    });
    ctx.fillStyle = "#bfe6ff";
    ctx.fillRect(M, y - 30, 110, 4);

    // Body, clipped to its viewport, shifted by the scroll offset.
    ctx.save();
    ctx.beginPath();
    ctx.rect(M, this.bodyTop - this.lineH, W - 2 * M - 40, this.bodyViewH + this.lineH);
    ctx.clip();
    ctx.fillStyle = "#c9d2de";
    ctx.font = this.data.bodyFontSize + "px " + this.FONT;
    const first = Math.floor(this.scrollOffset / this.lineH);
    const last = Math.min(
      this.bodyLines.length - 1,
      Math.ceil((this.scrollOffset + this.bodyViewH) / this.lineH)
    );
    for (let i = first; i <= last; i++) {
      ctx.fillText(
        this.bodyLines[i],
        M,
        this.bodyTop + (i + 1) * this.lineH - this.scrollOffset - (this.lineH - this.data.bodyFontSize)
      );
    }
    ctx.restore();

    // Close button (always): ring + X, top-right.
    const bx = this.BAR_X;
    ctx.strokeStyle = "#9fb0c8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bx, 64, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - 9, 55); ctx.lineTo(bx + 9, 73);
    ctx.moveTo(bx + 9, 55); ctx.lineTo(bx - 9, 73);
    ctx.stroke();

    // Scrollbar + arrows only when there is overflow.
    if (this.maxOffset > 0) {
      const trackTop = this.bodyTop + 56;
      const trackBot = H - 84;
      const trackH = trackBot - trackTop;
      ctx.fillStyle = "#232a38";
      ctx.fillRect(bx - 5, trackTop, 10, trackH);
      const frac = this.bodyViewH / (this.bodyLines.length * this.lineH);
      const thumbH = Math.max(40, trackH * frac);
      const thumbY = trackTop + (this.scrollOffset / this.maxOffset) * (trackH - thumbH);
      ctx.fillStyle = "#8fa2c0";
      ctx.fillRect(bx - 5, thumbY, 10, thumbH);

      // Up / down triangles at the track's ends.
      ctx.fillStyle = "#9fb0c8";
      const tri = (cy, dir) => {
        ctx.beginPath();
        ctx.moveTo(bx, cy - 12 * dir);
        ctx.lineTo(bx - 13, cy + 8 * dir);
        ctx.lineTo(bx + 13, cy + 8 * dir);
        ctx.closePath();
        ctx.fill();
      };
      tri(this.bodyTop + 26, 1); // up
      tri(H - 50, -1); // down
    }

    // Thin family frame last.
    ctx.strokeStyle = "#3a4a66";
    ctx.lineWidth = 1;
    ctx.strokeRect(14.5, 14.5, W - 29, H - 29);
    this.panelTex.needsUpdate = true;
  },

  // --- inputs while open ---------------------------------------------------
  attachInputs: function () {
    this.onWheel = (e) => this.scrollBy(e.deltaY * 0.6);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    this.onKey = (e) => {
      if (e.key === "Escape") this.closePanel();
    };
    window.addEventListener("keydown", this.onKey);
    this.onStick = (e) => {
      const y = (e.detail && e.detail.y) || 0;
      this.stickY = Math.abs(y) > 0.15 ? y : 0; // deadzone; consumed in tick
    };
    this.hands = ["rightHand", "leftHand"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    this.hands.forEach((h) => h.addEventListener("thumbstickmoved", this.onStick));
  },

  detachInputs: function () {
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    (this.hands || []).forEach((h) =>
      h.removeEventListener("thumbstickmoved", this.onStick)
    );
    this.hands = [];
    this.stickY = 0;
  },

  // --- dim sphere: same construction as the wall/map focus ---------------
  buildDim: function () {
    const s = document.createElement("a-sphere");
    s.setAttribute("radius", this.data.dimRadius);
    s.setAttribute(
      "material",
      `color: #000000; opacity: ${this.data.dimOpacity}; shader: flat; transparent: true; fog: false; side: back`
    );
    s.setAttribute("class", "clickable"); // click outside -> close
    document.getElementById("camera").appendChild(s);
    this.onDimClick = () => this.closePanel();
    s.addEventListener("click", this.onDimClick);
    this.dimEl = s;
    requestAnimationFrame(() => this.refreshRaycasters());
  },

  teardownDim: function () {
    if (this.dimEl) {
      this.dimEl.removeEventListener("click", this.onDimClick);
      if (this.dimEl.parentNode) this.dimEl.parentNode.removeChild(this.dimEl);
      this.dimEl = null;
    }
  },

  refreshRaycasters: function () {
    ["rightHand", "leftHand"].forEach(function (id) {
      const el = document.getElementById(id);
      const rc = el && el.components && el.components.raycaster;
      if (rc) rc.refreshObjects();
    });
  },

  // --- fly tween (the wall/map focus easing) -------------------------------
  startAnim: function (obj, toPos, toQuat, toScale, onComplete) {
    this.anim = {
      obj: obj,
      fromPos: obj.position.clone(),
      toPos: toPos.clone(),
      fromQuat: obj.quaternion.clone(),
      toQuat: toQuat.clone(),
      fromScale: obj.scale.clone(),
      toScale: toScale.clone(),
      t: 0,
      dur: Math.max(0.001, this.data.dur / 1000),
      onComplete: onComplete,
    };
  },

  // Registered only while the panel is open (addBehavior in openPanel);
  // self-deregisters when there is nothing left to do.
  tick: function (time, dt) {
    const a = this.anim;
    if (a) {
      a.t += dt / 1000;
      let u = Math.min(a.t / a.dur, 1);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      a.obj.position.lerpVectors(a.fromPos, a.toPos, e);
      a.obj.quaternion.copy(a.fromQuat).slerp(a.toQuat, e);
      a.obj.scale.lerpVectors(a.fromScale, a.toScale, e);
      if (u >= 1) {
        const done = a.onComplete;
        this.anim = null;
        if (done) done();
      }
    }
    if (this.focused) {
      // Held thumbstick = continuous scroll (pull back -> read on).
      if (this.stickY) this.scrollBy(this.stickY * this.data.scrollSpeed * (dt / 1000));
      if (this.scrollDirty) {
        this.scrollDirty = false;
        this.redrawPanel(); // ≤ one repaint per frame
      }
      return;
    }
    if (!this.anim) this.el.sceneEl.removeBehavior(this); // closed: go idle
  },

  remove: function () {
    this.detachInputs();
    this.teardownDim();
    if (this.panelEl && this.panelEl.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }
    if (this.panelGeo) this.panelGeo.dispose();
    if (this.panelMat) this.panelMat.dispose();
    if (this.panelTex) this.panelTex.dispose();
    this.el.sceneEl.removeBehavior(this);
    if (this.rig) {
      this.rig.hitEl.removeEventListener("click", this.onClick);
      this.rig.dispose();
    }
  },
});
