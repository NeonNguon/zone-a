// ================================================================
// bench-sit — visitors can sit on the benches.
//
// Every terrazzo-bench (js/bench.js) attaches this itself (its `sittable`,
// on by default): the park's eight, Zone C's two in front of the film, any
// bench added later. Nothing to tag by hand.
//
// HOW IT FEELS. Point at a bench: a small "click to sit" pill (the guide
// avatar's sign, same face) floats over it. Click: a quick fade to black,
// and you are sitting where you pointed along the seat, facing the way the
// bench faces, eyes at a sitting height. Get up by clicking the bench again
// ("click to stand up") or simply by moving — walk or push the stick more
// than a step, and you are put back on your feet in front of it. Snap-turn
// and looking around keep you seated.
//
// SITTING HEIGHT works in the headset as on desktop: the rig is lowered by
// (eyeHeight - your head's height in the rig) — on desktop the camera's
// 1.6 m, in VR your real head height — so the view lands at eyeHeight
// whether you stand or sit in real life. TeleportRig.go (js/transition.js)
// puts the VISITOR, not the rig origin, on the seat, compensating head yaw and
// where they stand in their playspace.
//
// THE CLAMP. The benches are solid to rig-collision (cut out of the walkable
// floor), so it would push a sitter straight off. Sitting parks it
// (setActive(false)); standing up resyncs and re-enables it. A teleport
// taken while seated (a booth clicked from the bench) is noticed by the jump
// in the camera's position: the seat is let go without moving anyone, and
// the clamp is handed back on only if the visitor landed somewhere walkable
// (the Zone B map, unwalkable, manages its own).
//
// Per bench: one invisible hit box over seat and back (the terminals'
// recipe), one label plane, shown only while pointed at. The fade is ONE
// full-view quad on the camera shared by all benches, drawn only mid-fade.
// ================================================================

// Shared by every bench: who is sitting where, and the fade.
const BenchSit = {
  seated: null, // the bench-sit component currently sat on, or null
  fadeMesh: null,
  fadeMat: null,
  fade: null, // { from, to, t0, dur, done }

  // One full-view quad, on the camera, the transition-glitch way (NDC
  // vertex shader, so it covers each eye in VR). Built on first use.
  ensureFade: function () {
    if (this.fadeMesh) return;
    const camEl = document.getElementById("camera");
    if (!camEl) return;
    this.fadeMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader:
        "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
      fragmentShader:
        "uniform float uA; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uA); }",
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fadeMat);
    this.fadeMesh.frustumCulled = false;
    this.fadeMesh.renderOrder = 10000;
    this.fadeMesh.visible = false;
    camEl.object3D.add(this.fadeMesh);
  },

  // Fade to black (cb at full black), then back. Ignored mid-fade.
  dip: function (cb) {
    this.ensureFade();
    if (!this.fadeMesh || this.fade) return false;
    const now = performance.now();
    this.fade = {
      from: 0, to: 1, t0: now, dur: 180,
      done: () => {
        cb();
        this.fade = { from: 1, to: 0, t0: performance.now(), dur: 260, done: null };
      },
    };
    this.fadeMesh.visible = true;
    return true;
  },

  stepFade: function () {
    const f = this.fade;
    if (!f) return;
    const k = Math.min(1, (performance.now() - f.t0) / f.dur);
    this.fadeMat.uniforms.uA.value = f.from + (f.to - f.from) * k;
    if (k < 1) return;
    this.fade = null;
    if (f.done) f.done();
    else this.fadeMesh.visible = false;
  },
};

AFRAME.registerComponent("bench-sit", {
  schema: {
    eyeHeight: { type: "number", default: 1.2 }, // seated eye height, metres
    standOff: { type: "number", default: 0.75 }, // stand up this far in front
    moveToStand: { type: "number", default: 0.35 }, // metres of movement that stands you up
  },

  init: function () {
    this.bench = this.el.components["terrazzo-bench"];
    const b = this.bench ? this.bench.data : { width: 1.5, depth: 0.45, seatHeight: 0.45, backHeight: 0.45 };

    // Invisible but ray-hittable (opacity 0 + colorWrite off — the terminals'
    // hit box), from the seat to the top of the back, the bench's full width.
    this.hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.hitMat.colorWrite = false;
    const top = b.seatHeight + b.backHeight;
    this.hitGeo = new THREE.BoxGeometry(b.width, top, b.depth + 0.2);
    this.hitEl = document.createElement("a-entity");
    this.hitEl.setAttribute("class", "clickable");
    this.hitEl.setAttribute("position", `0 ${top / 2} 0`);
    this.hitEl.addEventListener(
      "loaded",
      () => this.hitEl.setObject3D("hit", new THREE.Mesh(this.hitGeo, this.hitMat)),
      { once: true }
    );
    this.el.appendChild(this.hitEl);

    // The label: two canvases ("click to sit" / "click to stand up"), one
    // plane, over the middle of the back. Billboarded about Y while shown.
    this.labelTex = {
      sit: this.makeLabel("click to sit"),
      stand: this.makeLabel("click to stand up"),
    };
    this.labelMat = new THREE.MeshBasicMaterial({
      map: this.labelTex.sit,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5 * (96 / 512)), this.labelMat);
    this.label.position.set(0, top + 0.3, 0);
    this.label.renderOrder = 1;
    this.label.visible = false;
    this.el.object3D.add(this.label);

    // Over the back while you are standing; while you SIT on it, the back is
    // behind your head — so "click to stand up" goes low in front of you,
    // where you see it looking down at the seat you are pointing at.
    this.labelHigh = top + 0.3;
    // `hovered` is tracked, not just acted on: the pointer usually stays on
    // the bench through sitting down and getting up, so no new mouseenter
    // comes — showLabel() is called again after each, to swap the wording.
    this.hovered = false;
    this.onEnter = () => {
      this.hovered = true;
      this.showLabel();
    };
    this.onLeave = () => {
      this.hovered = false;
      this.label.visible = false;
    };
    this.onClick = (e) => this.toggle(e);
    this.hitEl.addEventListener("mouseenter", this.onEnter);
    this.hitEl.addEventListener("mouseleave", this.onLeave);
    this.hitEl.addEventListener("click", this.onClick);

    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this.anchor = new THREE.Vector3();
  },

  showLabel: function () {
    if (!this.hovered) return;
    const seatedHere = BenchSit.seated === this;
    this.labelMat.map = this.labelTex[seatedHere ? "stand" : "sit"];
    if (seatedHere) this.label.position.set(this.seatLX || 0, 0.7, 0.85);
    else this.label.position.set(0, this.labelHigh, 0);
    this.label.visible = true;
  },

  makeLabel: function (text) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 96;
    const ctx = c.getContext("2d");
    const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.font = "600 44px " + font;
    const w = Math.min(504, ctx.measureText(text).width + 72);
    const x = (512 - w) / 2;
    const r = 44;
    ctx.fillStyle = "rgba(11, 11, 16, 0.88)";
    ctx.beginPath();
    ctx.moveTo(x + r, 4);
    ctx.arcTo(x + w, 4, x + w, 92, r);
    ctx.arcTo(x + w, 92, x, 92, r);
    ctx.arcTo(x, 92, x, 4, r);
    ctx.arcTo(x, 4, x + w, 4, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#e8eef8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },

  // Every ancestor visible: a hidden bench (in a sub-space that is off) is
  // not a seat — a stray ray can still reach its hit box.
  isShown: function () {
    for (let o = this.el.object3D; o; o = o.parent) if (!o.visible) return false;
    return true;
  },

  toggle: function (e) {
    if (!this.isShown()) return;
    if (BenchSit.seated === this) return this.stand();
    // Sitting on another bench while seated: up from that one first is
    // implied — this simply moves you, and the clamp stays parked.
    const hit = e && e.detail && e.detail.intersection && e.detail.intersection.point;
    this.sit(hit);
  },

  collider: function () {
    const rig = document.getElementById("rig");
    return rig && rig.components && rig.components["rig-collision"];
  },

  // The bench's facing as a world yaw in the camera convention TeleportRig
  // uses (0 faces -z). The sitter faces the bench's local +z, i.e. 180 from
  // the entity's own yaw.
  faceDeg: function () {
    this.el.object3D.getWorldQuaternion(this._q);
    this._e.setFromQuaternion(this._q, "YXZ");
    return THREE.MathUtils.radToDeg(this._e.y) + 180;
  },

  sit: function (hitPoint) {
    const b = this.bench ? this.bench.data : { width: 1.5 };
    // Where along the seat: the pointed-at spot, kept clear of the ends.
    let lx = 0;
    if (hitPoint) {
      this._v.copy(hitPoint);
      this.el.object3D.worldToLocal(this._v);
      const room = Math.max(0, b.width / 2 - 0.3);
      lx = THREE.MathUtils.clamp(this._v.x, -room, room);
    }
    const seat = this.el.object3D.localToWorld(new THREE.Vector3(lx, 0, 0.05));
    const face = this.faceDeg();

    BenchSit.dip(() => {
      const col = this.collider();
      if (col) col.setActive(false); // the bench is solid to it
      const cam = document.getElementById("camera").object3D;
      // Lower the rig so the EYES land at eyeHeight, whatever the head's own
      // height in the rig is (1.6 m on desktop, the real head in VR).
      seat.y = this.data.eyeHeight - cam.position.y;
      TeleportRig.go(seat, face);
      BenchSit.seated = this;
      this.seatLX = lx;
      // Where the visitor's eyes are now: moving away from here stands them up.
      cam.updateMatrixWorld(true);
      cam.getWorldPosition(this.anchor);
      this.label.visible = false;
      this.showLabel(); // still pointing at it: now "click to stand up"
    });
  },

  stand: function () {
    if (BenchSit.seated !== this) return;
    const spot = this.el.object3D.localToWorld(
      new THREE.Vector3(this.seatLX || 0, 0, this.data.standOff)
    );
    spot.y = 0;
    BenchSit.dip(() => {
      const camEl = document.getElementById("camera");
      // Keep the way they are looking: their current world yaw.
      camEl.object3D.getWorldQuaternion(this._q);
      this._e.setFromQuaternion(this._q, "YXZ");
      TeleportRig.go(spot, THREE.MathUtils.radToDeg(this._e.y));
      BenchSit.seated = null;
      const col = this.collider();
      if (col) {
        col.setActive(true);
        col.resync();
      }
      this.label.visible = false;
      this.showLabel(); // still pointing at it: "click to sit" again
    });
  },

  // A teleport while seated (the camera jumped far): let go of the seat
  // without moving anyone, and give the clamp back only if they landed on
  // walkable floor.
  release: function (cam) {
    BenchSit.seated = null;
    const rig = document.getElementById("rig").object3D;
    rig.position.y = 0;
    const col = this.collider();
    if (col && col.isWalkable(cam.x, cam.z)) {
      col.setActive(true);
      col.resync();
    }
  },

  tick: function () {
    // The shared fade steps once a frame, from whichever bench ticks first.
    if (BenchSit.fade && BenchSit.fadeOwner !== this) {
      if (!BenchSit.fadeOwner || !BenchSit.fadeOwner.el.isPlaying) BenchSit.fadeOwner = this;
    }
    if (BenchSit.fadeOwner === this) BenchSit.stepFade();

    if (this.label.visible) {
      // Turn the label to the camera, about Y only.
      const cam = this.el.sceneEl.camera;
      if (cam) {
        cam.getWorldPosition(this._v);
        this.el.object3D.worldToLocal(this._v);
        const p = this.label.position;
        this.label.rotation.set(0, Math.atan2(this._v.x - p.x, this._v.z - p.z), 0);
      }
    }

    if (BenchSit.seated !== this || BenchSit.fade) return;
    const camObj = document.getElementById("camera").object3D;
    camObj.getWorldPosition(this._v);
    const dx = this._v.x - this.anchor.x;
    const dz = this._v.z - this.anchor.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > 9) this.release(this._v); // a teleport, not a step
    else if (d2 > this.data.moveToStand * this.data.moveToStand) this.stand();
  },

  remove: function () {
    if (BenchSit.seated === this) this.release(new THREE.Vector3(0, 0, 0));
    if (BenchSit.fadeOwner === this) BenchSit.fadeOwner = null;
    this.hitEl.removeEventListener("mouseenter", this.onEnter);
    this.hitEl.removeEventListener("mouseleave", this.onLeave);
    this.hitEl.removeEventListener("click", this.onClick);
    if (this.hitEl.parentNode) this.hitEl.parentNode.removeChild(this.hitEl);
    this.el.object3D.remove(this.label);
    this.hitGeo.dispose();
    this.hitMat.dispose();
    this.label.geometry.dispose();
    this.labelMat.dispose();
    this.labelTex.sit.dispose();
    this.labelTex.stand.dispose();
  },
});
