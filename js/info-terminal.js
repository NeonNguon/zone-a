// ================================================================
// info-terminal — a per-zone reading station: the same pedestal+screen
// furniture as the teleport terminals (shared TerminalKit), whose screen
// shows the zone TITLE and the opening lines of its wall text, faded out at
// the bottom edge to signal there is more. Clicking it opens the full text
// on a large in-scene focus panel (Step 4).
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
  },

  FONT: '"Helvetica Neue", Helvetica, Arial, sans-serif',

  init: function () {
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

  // Step 4 wires the full-text focus panel here.
  openPanel: function () {},

  remove: function () {
    if (this.rig) {
      this.rig.hitEl.removeEventListener("click", this.onClick);
      this.rig.dispose();
    }
  },
});
