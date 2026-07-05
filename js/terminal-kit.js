// ================================================================
// TerminalKit — the shared pedestal+screen construction every terminal in
// the exhibition uses (the Zone B teleport terminals and the per-zone info
// terminals): dark base plate + slim column, a tilted head at standing
// height (bezel + hover rim + a screen plane textured with a caller-supplied
// CANVAS), one generous invisible hit BOX (the only clickable part, sized
// for the Quest raycaster), and the hover response (rim on + slight head
// pop). Extracted VERBATIM from teleport-terminal so the furniture family
// stays visually identical; components own their screen canvas CONTENT and
// what a click does — the kit owns the furniture.
//
// Usage:
//   this.rig = TerminalKit.build(this.el, {
//     canvas,                  // HTMLCanvasElement for the screen face
//     screenWidth: 0.52, screenHeight: 0.36,
//     screenHeightAboveFloor: 1.15,
//     tilt: -12,               // deg, screen pitch (top away)
//     hitScale: 2.2,           // hit box = screen size × this
//   });
//   this.rig.screenTex.needsUpdate = true;  // after redrawing the canvas
//   this.rig.hitEl                          // clickable a-entity (hover+click)
//   this.rig.dispose();                     // in the component's remove()
// ================================================================
const TerminalKit = {
  build: function (el, opts) {
    const screenW = opts.screenWidth;
    const screenH = opts.screenHeight;
    const screenY = opts.screenHeightAboveFloor;
    const tilt = opts.tilt;
    const hitScale = opts.hitScale;

    // --- stand: base plate + slim column, unlit dark (exhibition furniture).
    const base = document.createElement("a-box");
    base.setAttribute("width", 0.34);
    base.setAttribute("height", 0.02);
    base.setAttribute("depth", 0.26);
    base.setAttribute("position", "0 0.01 0");
    base.setAttribute("material", "color: #14141a; shader: flat");
    el.appendChild(base);

    // Column ENDS below the screen's lowest edge — running it any higher
    // pokes through the (tilted) screen face and reads as a black block in
    // the middle of the picture.
    const standH = Math.max(0.1, screenY - screenH / 2 - 0.04);
    const stand = document.createElement("a-box");
    stand.setAttribute("width", 0.06);
    stand.setAttribute("height", standH);
    stand.setAttribute("depth", 0.06);
    stand.setAttribute("position", `0 ${standH / 2} 0`);
    stand.setAttribute("material", "color: #14141a; shader: flat");
    el.appendChild(stand);

    // --- head: bezel + screen, tilted like a console at standing height.
    // Slightly proud of the column (+z) so no tilt value can intersect it.
    const head = document.createElement("a-entity");
    head.setAttribute("position", `0 ${screenY} 0.02`);
    head.setAttribute("rotation", `${tilt} 0 0`);
    el.appendChild(head);

    const bezel = document.createElement("a-plane");
    bezel.setAttribute("width", screenW + 0.05);
    bezel.setAttribute("height", screenH + 0.05);
    bezel.setAttribute("position", "0 0 -0.006");
    bezel.setAttribute("material", "color: #101014; shader: flat");
    head.appendChild(bezel);

    // Hover frame: a light rim just behind the bezel, hidden until pointed at
    // (the dark-on-light inverse of the wall tiles' black hover frame).
    const rim = document.createElement("a-plane");
    rim.setAttribute("width", screenW + 0.1);
    rim.setAttribute("height", screenH + 0.1);
    rim.setAttribute("position", "0 0 -0.012");
    rim.setAttribute("material", "color: #bfe6ff; shader: flat");
    rim.setAttribute("visible", false);
    head.appendChild(rim);

    // Screen: manual mesh so the CanvasTexture is fully ours (no geometry /
    // texture cache interactions with other planes).
    const screenTex = new THREE.CanvasTexture(opts.canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    const screenEnt = document.createElement("a-entity");
    head.appendChild(screenEnt);
    screenEnt.addEventListener(
      "loaded",
      () => screenEnt.setObject3D("screen", new THREE.Mesh(screenGeo, screenMat)),
      { once: true }
    );

    // --- hit target: one generous INVISIBLE box from the floor to above the
    // screen (opacity 0 + colorWrite off — still ray-hittable), the only
    // clickable part, so pointing anywhere at the terminal works.
    const hitW = screenW * hitScale;
    const hitH = screenY + screenH * hitScale * 0.5;
    const hitGeo = new THREE.BoxGeometry(hitW, hitH, 0.5);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    hitMat.colorWrite = false;
    const hitEl = document.createElement("a-entity");
    hitEl.setAttribute("position", `0 ${hitH / 2} 0`);
    hitEl.setAttribute("class", "clickable");
    hitEl.addEventListener(
      "loaded",
      () => hitEl.setObject3D("hit", new THREE.Mesh(hitGeo, hitMat)),
      { once: true }
    );
    el.appendChild(hitEl);

    // Hover response on the hit target: rim on + slight head pop. The same
    // mouseenter/mouseleave arrive from the desktop cursor and both lasers.
    const onEnter = () => {
      rim.setAttribute("visible", true);
      head.object3D.scale.set(1.05, 1.05, 1.05);
    };
    const onLeave = () => {
      rim.setAttribute("visible", false);
      head.object3D.scale.set(1, 1, 1);
    };
    hitEl.addEventListener("mouseenter", onEnter);
    hitEl.addEventListener("mouseleave", onLeave);

    return {
      head: head,
      rim: rim,
      hitEl: hitEl,
      screenTex: screenTex,
      dispose: function () {
        hitEl.removeEventListener("mouseenter", onEnter);
        hitEl.removeEventListener("mouseleave", onLeave);
        screenGeo.dispose();
        screenMat.dispose();
        screenTex.dispose();
        hitGeo.dispose();
        hitMat.dispose();
      },
    };
  },
};
