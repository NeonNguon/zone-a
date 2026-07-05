// ================================================================
// Shared transition + teleport machinery (zone-agnostic).
//
// transition-glitch — a brief full-view "signal glitch" that masks a scene
// change (teleport, zone entry). Built REUSABLE: duration / intensity / color /
// style / audio are component properties, so the same component can later
// serve as the zone-entry transition. Attach it to the CAMERA entity; trigger
// it from anywhere via:
//
//   camera.components['transition-glitch'].trigger(onPeak, onDone)
//
// onPeak fires at FULL obscuration (the view is 100% covered) — that is the
// moment to execute the cut (move the rig, flip visibility). The component
// also emits 'glitchpeak' / 'glitchdone' on its entity for event-style use.
//
// Implementation notes:
//  - ONE quad drawn straight in NDC (the vertex shader ignores all matrices,
//    gl_Position = position), so it covers the full view in BOTH desktop and
//    per-eye WebXR rendering with no near-plane or FOV bookkeeping. No DOM,
//    no CSS — everything in-scene, identical on Quest and flat desktop.
//  - Renders on top: depthTest off, renderOrder 9999, frustumCulled off.
//  - ZERO cost when idle: mesh invisible AND the component deregisters itself
//    from the scene's tick behaviours (re-registered only while a transition
//    is in flight; the tick itself also early-returns as a belt-and-braces
//    guard in case a scene pause/play cycle re-adds it).
//  - The fragment shader is a few hash() lookups per pixel (row tearing, RGB
//    block noise, scanlines) — cheap enough for full-view Quest 3 at 72 fps
//    for the ~0.5 s it runs.
//  - Audio: non-positional blip on trigger. `sound` may name a file (wired
//    like the rest of the repo's on-demand audio); when empty, a placeholder
//    noise burst is synthesized with WebAudio — swap in a real asset later by
//    setting the property, no code edits.
// ================================================================

AFRAME.registerComponent("transition-glitch", {
  schema: {
    dur: { type: "number", default: 500 }, // full envelope, ms (0 -> 1 -> 0)
    intensity: { type: "number", default: 1 }, // peak intensity scale
    color: { type: "color", default: "#bfe6ff" }, // tint (data-aesthetic pale blue)
    style: { type: "string", default: "blocks" }, // "blocks" | "scan"
    sound: { type: "string", default: "" }, // audio clip URL; "" = synth blip
  },

  init: function () {
    this.active = false;
    this.t = 0;
    this.peakFired = false;
    this.onPeak = null;
    this.onDone = null;
    this.audioEl = null; // reused <audio> when `sound` names a file
    this.audioCtx = null; // lazy WebAudio context for the synth blip

    // Fullscreen NDC quad: PlaneGeometry(2,2) puts corners at clip-space ±1;
    // the vertex shader passes them through untransformed, so the quad always
    // covers the whole viewport (each eye in VR) wherever it sits in the graph.
    const geo = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uT: { value: 0 }, // seconds since trigger
        uI: { value: 0 }, // intensity envelope 0..1
        uColor: { value: new THREE.Color(this.data.color) },
        uStyle: { value: this.data.style === "scan" ? 1 : 0 },
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = vec4(position.xy, 0.0, 1.0);", // straight NDC
        "}",
      ].join("\n"),
      fragmentShader: [
        "precision mediump float;",
        "varying vec2 vUv;",
        "uniform float uT;",
        "uniform float uI;",
        "uniform vec3 uColor;",
        "uniform float uStyle;",
        "float hash(vec2 p) {",
        "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);",
        "}",
        "void main() {",
        "  float t = floor(uT * 24.0);", // stepped time -> blocky retiming
        "  vec2 uv = vUv;",
        "  float row = floor(uv.y * 28.0);", // horizontal row tearing
        "  uv.x += (hash(vec2(row, t)) - 0.5) * 0.5 * uI;",
        "  vec2 cell = floor(uv * vec2(20.0, 14.0));", // RGB block noise
        "  vec3 blocks = vec3(",
        "    hash(cell + vec2(t, 1.0)),",
        "    hash(cell + vec2(t, 2.0)),",
        "    hash(cell + vec2(t, 3.0)));",
        "  float scan = 0.7 + 0.3 * sin(vUv.y * 640.0 + uT * 50.0);", // scanlines
        "  vec3 col = mix(blocks, vec3(0.9), uStyle * 0.6) * scan * uColor;",
        // Alpha saturates well BEFORE peak intensity, so the view is fully
        // obscured around the whole midpoint — the cut is never visible.
        "  float alpha = smoothstep(0.0, 0.55, uI);",
        "  gl_FragColor = vec4(col, alpha);",
        "}",
      ].join("\n"),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false; // NDC quad has no meaningful bounds
    mesh.renderOrder = 9999; // draw after everything
    mesh.visible = false; // idle: not rendered at all
    this.mesh = mesh;
    this.el.setObject3D("glitch", mesh);

    // Idle = deregistered from the scene's tick loop entirely (zero per-frame
    // cost). A-Frame's play() wrapper re-adds any component with a tick AFTER
    // init (and again on every scene resume), so deregistration can't happen
    // here — the tick itself self-removes on its first idle call instead.
  },

  update: function () {
    if (!this.material) return;
    this.material.uniforms.uColor.value.set(this.data.color);
    this.material.uniforms.uStyle.value = this.data.style === "scan" ? 1 : 0;
  },

  // Start a transition. Returns false (and does nothing) if one is already in
  // flight — callers use this as their re-trigger guard. onPeak runs at full
  // obscuration; onDone when the view has fully resolved again.
  trigger: function (onPeak, onDone) {
    if (this.active) return false;
    this.active = true;
    this.t = 0;
    this.peakFired = false;
    this.onPeak = onPeak || null;
    this.onDone = onDone || null;
    this.mesh.visible = true;
    this.material.uniforms.uI.value = 0;
    this.el.sceneEl.addBehavior(this); // start ticking (only while active)
    this.playBlip();
    return true;
  },

  tick: function (time, dt) {
    if (!this.active) {
      // Not transitioning: deregister so idle frames pay NOTHING. This runs
      // once after init/scene-resume (A-Frame's play() wrapper re-adds every
      // ticking component); trigger() re-registers us for the ~0.5 s burst.
      this.el.sceneEl.removeBehavior(this);
      return;
    }
    this.t += dt;
    const u = Math.min(this.t / Math.max(1, this.data.dur), 1);
    // 0 -> 1 -> 0 envelope, peaking at the midpoint.
    const env = Math.sin(Math.PI * u) * this.data.intensity;
    this.material.uniforms.uI.value = env;
    this.material.uniforms.uT.value = this.t / 1000;

    if (!this.peakFired && u >= 0.5) {
      this.peakFired = true;
      // FULL obscuration: execute the cut now.
      const cb = this.onPeak;
      this.onPeak = null;
      this.el.emit("glitchpeak");
      if (cb) cb();
    }
    if (u >= 1) {
      this.active = false;
      this.mesh.visible = false;
      this.el.sceneEl.removeBehavior(this); // back to zero idle cost
      const cb = this.onDone;
      this.onDone = null;
      this.el.emit("glitchdone");
      if (cb) cb();
    }
  },

  // Non-positional trigger blip. A named file wins; otherwise synthesize a
  // short filtered-noise burst (placeholder until a real clip exists).
  playBlip: function () {
    if (this.data.sound) {
      if (!this.audioEl) this.audioEl = new Audio();
      this.audioEl.src = this.data.sound;
      this.audioEl.currentTime = 0;
      const p = this.audioEl.play();
      if (p && p.catch) p.catch(function () {}); // missing file = silent no-op
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!this.audioCtx) this.audioCtx = new Ctx();
      const ctx = this.audioCtx;
      if (ctx.state === "suspended") ctx.resume();
      const durS = Math.min(0.22, this.data.dur / 1000);
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * durS), ctx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const band = ctx.createBiquadFilter(); // falling sweep = "signal drop"
      band.type = "bandpass";
      band.Q.value = 3;
      band.frequency.setValueAtTime(2400, ctx.currentTime);
      band.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + durS);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durS);
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) {
      /* audio is garnish — never let it break the transition */
    }
  },

  remove: function () {
    this.el.sceneEl.removeBehavior(this);
    this.el.removeObject3D("glitch");
    if (this.material) this.material.dispose();
    if (this.mesh) this.mesh.geometry.dispose();
    this.mesh = null;
    this.material = null;
  },
});

