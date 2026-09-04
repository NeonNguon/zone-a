// ================================================================
// exhibition-title — the floating in-scene title card: the same three lines
// as the DOM loading splash (main title / subtitle / byline), stacked and
// centred ~3.5 m in front of spawn at eye height, facing spawn. WORLD-FIXED
// (not camera-locked): it hangs in the space and you can walk past it.
//
// Lifecycle (one-shot per session):
//  - Becomes active when the scene fires `loaded` — the same moment the DOM
//    splash starts its fade, so the two hand over seamlessly.
//  - Arms a dissolve timer (holdDuration). After a short gracePeriod,
//    MOVEMENT — and only movement — starts the dissolve early: WASD/arrow
//    keydown, joystick axis input, or the camera's world position drifting
//    past moveThreshold HORIZONTALLY (covers stick locomotion and physical
//    walking; y is ignored so head height/sway doesn't count). Clicks,
//    touches and controller triggers deliberately do NOT dissolve it, and
//    the walking baseline re-captures on enter-vr/exit-vr — the headset
//    pose replacing the desktop camera position is a reference switch, not
//    a step.
//  - Dissolve: opacity 1 -> 0 on all three lines over fadeDuration, then the
//    root goes visible:false, every listener is removed, and the tick
//    self-deregisters from the scene loop (A-Frame's play() wrapper re-adds
//    ticking components on scene resume, so the tick also stays inert-guarded)
//    — zero per-frame cost once the title is gone.
//
// TUNABLES (same pattern as the zone roots — adjust live, no code edits):
//   holdDuration (s)  — time until the title dissolves on its own.
//   fadeDuration (s)  — dissolve length.
//   gracePeriod (s)   — input is ignored this long after activation.
//   moveThreshold (m) — camera world-position delta that counts as walking.
//   offset (vec3)     — the card's world position.
//   textScale         — uniform scale of the whole card.
//   backingOpacity    — the dark card behind the text (0 disables): white
//                       text needs it to separate from light presets like
//                       void, and it carries the splash's near-black look
//                       into the scene. Fades out with the text.
// ================================================================
AFRAME.registerComponent("exhibition-title", {
  schema: {
    holdDuration: { type: "number", default: 30 },
    fadeDuration: { type: "number", default: 2.5 },
    gracePeriod: { type: "number", default: 1 },
    moveThreshold: { type: "number", default: 0.15 },
    offset: { type: "vec3", default: { x: 0, y: 1.7, z: -3.5 } },
    textScale: { type: "number", default: 1 },
    backingOpacity: { type: "number", default: 0.72 },
  },

  // The three lines, top to bottom. width/wrapCount pin the layout: the main
  // title breaks to exactly two lines, the subtitle to two, the byline to one.
  LINES: [
    {
      value: "New Topographies of Memory and Chance",
      color: "#ffffff",
      width: 3.4,
      wrapCount: 26,
      y: 0.45,
    },
    {
      value:
        "Expanded Photography, Algorithms, and Transnational Belonging in Ho Chi Minh City",
      color: "#d9d9d9",
      width: 3.0,
      wrapCount: 48,
      y: -0.05,
    },
    {
      value: "a virtual exhibition by Christian Berg",
      color: "#a9a9a9",
      width: 2.0,
      wrapCount: 50,
      y: -0.38,
    },
  ],

  init: function () {
    // phase: 0 idle (scene still loading) -> 1 armed -> 2 dissolving -> 3 done
    this.phase = 0;
    this.elapsed = 0; // ms since activation (accumulated in tick)
    this.fadeElapsed = 0; // ms since the dissolve started
    this.pendingInput = false; // set by handlers, consumed by tick
    this.startPos = new THREE.Vector3(); // camera world pos at activation
    this.worldPos = new THREE.Vector3(); // scratch
    this.cameraEl = document.getElementById("camera");

    // Backing card: near-black like the DOM splash, just behind the text —
    // the separation that keeps white text legible on light presets (void's
    // #eeeeee background) and against the Zone A room behind it.
    this.backing = document.createElement("a-plane");
    this.backing.setAttribute("width", 4.0);
    this.backing.setAttribute("height", 1.5);
    this.backing.setAttribute("position", "0 0.05 -0.02");
    this.backing.setAttribute(
      "material",
      `color: #0a0a0a; shader: flat; transparent: true; ` +
        `opacity: ${this.data.backingOpacity}; fog: false; depthWrite: false`
    );
    this.el.appendChild(this.backing);
    // Explicit layering: the card and the text are transparent objects almost
    // coplanar with each other and near other transparent-tagged scene objects
    // behind them — distance sorting alone draws them in the wrong order
    // (scene over card, text hollow). renderOrder pins it: scene (default 0)
    // -> card (1) -> text (2).
    this.backing.addEventListener(
      "loaded",
      () => {
        const m = this.backing.getObject3D("mesh");
        if (m) m.renderOrder = 1;
      },
      { once: true }
    );

    // Three stacked a-text children (default Roboto MSDF font, unlit).
    this.texts = this.LINES.map((line) => {
      const t = document.createElement("a-text");
      t.setAttribute("value", line.value);
      t.setAttribute("color", line.color);
      t.setAttribute("align", "center");
      t.setAttribute("anchor", "center");
      t.setAttribute("baseline", "center");
      t.setAttribute("width", line.width);
      t.setAttribute("wrap-count", line.wrapCount);
      t.setAttribute("position", `0 ${line.y} 0.01`);
      // NOTE: leave the text component's `negate` at its default (true).
      // Software WebGL (headless Chrome/SwiftShader) renders this MSDF text
      // with hollow/boxy artifacts EITHER way — that is a renderer artifact,
      // not a font problem; on real GPUs the default renders solid glyphs
      // and negate:false draws white atlas-background boxes instead.
      this.el.appendChild(t);
      // The text mesh exists only once the MSDF font has loaded.
      t.addEventListener("textfontset", () => {
        const o = t.getObject3D("text");
        if (o) o.renderOrder = 2;
      });
      return t;
    });

    // Every dissolve trigger routes through ONE handler that raises a flag
    // for the tick to consume. The grace period is judged HERE, at event
    // time, on the wall clock: a long frame right after load must not let an
    // in-grace input survive until a tick that lands past the boundary.
    this.onInput = () => {
      if (performance.now() - this.wallStart < this.data.gracePeriod * 1000) return;
      this.pendingInput = true;
    };
    this.onKey = (e) => {
      if (/^([wasdWASD]|Arrow(Up|Down|Left|Right))$/.test(e.key)) this.onInput();
    };
    this.onStick = (e) => {
      const x = (e.detail && e.detail.x) || 0;
      const y = (e.detail && e.detail.y) || 0;
      if (Math.abs(x) > 0.2 || Math.abs(y) > 0.2) this.onInput();
    };
    // Entering/leaving VR swaps the camera between the desktop position and
    // the real headset pose — a reference-frame jump, not walking. The first
    // real pose lands a few frames AFTER the enter-vr event, so instead of a
    // one-shot re-anchor, the tick keeps re-anchoring the movement baseline
    // for a short window around the transition.
    this.rebaselineUntil = 0;
    this.onXRChange = () => {
      this.rebaselineUntil = performance.now() + 600;
    };

    // Activate in sync with the splash fade (both key off scene `loaded`).
    this.activate = this.activate.bind(this);
    if (this.el.sceneEl.hasLoaded) this.activate();
    else this.el.sceneEl.addEventListener("loaded", this.activate, { once: true });
  },

  update: function () {
    const d = this.data;
    this.el.setAttribute("position", d.offset);
    this.el.setAttribute("scale", `${d.textScale} ${d.textScale} ${d.textScale}`);
    // Live backing tune — but never fight the dissolve's own fade.
    if (this.backing && this.phase < 2) {
      this.backing.setAttribute("material", "opacity", d.backingOpacity);
    }
  },

  activate: function () {
    if (this.phase !== 0) return;
    this.phase = 1;
    this.elapsed = 0;
    this.wallStart = performance.now(); // grace-period reference (event time)
    if (this.cameraEl) {
      this.cameraEl.object3D.getWorldPosition(this.startPos);
    }
    // Movement inputs only (attached just for the title's short life):
    // keys + joysticks here, walking via the tick's drift check. No click /
    // touch / trigger listeners — pointing and grabbing must not dismiss it.
    window.addEventListener("keydown", this.onKey);
    this.hands = ["rightHand", "leftHand"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    this.hands.forEach((h) => {
      h.addEventListener("thumbstickmoved", this.onStick);
    });
    this.el.sceneEl.addEventListener("enter-vr", this.onXRChange);
    this.el.sceneEl.addEventListener("exit-vr", this.onXRChange);
  },

  tick: function (time, dt) {
    if (this.phase === 0) return; // scene still loading
    if (this.phase === 3) {
      // Done: deregister so hidden-title frames pay NOTHING (a scene
      // pause/play re-adds ticking components, hence re-remove here).
      this.el.sceneEl.removeBehavior(this);
      return;
    }

    if (this.phase === 1) {
      this.elapsed += dt;
      const pastGrace = this.elapsed >= this.data.gracePeriod * 1000;
      // The flag is only ever raised past the grace period (checked at event
      // time in onInput), so it can be consumed as-is.
      const input = this.pendingInput;
      this.pendingInput = false;
      // Camera world-position drift = stick locomotion or physical walking.
      // HORIZONTAL only: standing head sway / height change must not count.
      // Inside the post-XR-transition window the baseline follows the camera
      // (the headset pose replacing the desktop position is not a step).
      let moved = false;
      if (this.cameraEl) {
        this.cameraEl.object3D.getWorldPosition(this.worldPos);
        if (performance.now() < this.rebaselineUntil) {
          this.startPos.copy(this.worldPos);
        } else if (pastGrace) {
          const dx = this.worldPos.x - this.startPos.x;
          const dz = this.worldPos.z - this.startPos.z;
          moved =
            dx * dx + dz * dz > this.data.moveThreshold * this.data.moveThreshold;
        }
      }
      if (
        this.elapsed >= this.data.holdDuration * 1000 ||
        input ||
        (pastGrace && moved)
      ) {
        this.phase = 2;
        this.fadeElapsed = 0;
        this.removeListeners(); // input has done its job
      }
      return;
    }

    // phase 2: dissolve (backing fades in step with the text).
    this.fadeElapsed += dt;
    const u = Math.min(this.fadeElapsed / (this.data.fadeDuration * 1000), 1);
    const opacity = 1 - u;
    this.texts.forEach((t) => t.setAttribute("text", "opacity", opacity));
    this.backing.setAttribute(
      "material",
      "opacity",
      this.data.backingOpacity * opacity
    );
    if (u >= 1) {
      this.el.object3D.visible = false;
      this.phase = 3; // next tick self-deregisters
    }
  },

  removeListeners: function () {
    window.removeEventListener("keydown", this.onKey);
    (this.hands || []).forEach((h) => {
      h.removeEventListener("thumbstickmoved", this.onStick);
    });
    this.hands = [];
    this.el.sceneEl.removeEventListener("enter-vr", this.onXRChange);
    this.el.sceneEl.removeEventListener("exit-vr", this.onXRChange);
  },

  remove: function () {
    this.el.sceneEl.removeEventListener("loaded", this.activate);
    this.removeListeners();
    this.el.sceneEl.removeBehavior(this);
  },
});
