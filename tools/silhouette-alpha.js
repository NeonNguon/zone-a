// ================================================================
// silhouette-alpha.js — ONE-TIME offline conversion of the new Saigon
// pictures into skyline-pipeline silhouettes.
//
// WHY THIS EXISTS. The skyline pipeline does not accept an ordinary picture.
// Two stages downstream both assume a very specific file:
//
//   1. CorridorTextures.silhouette (js/zone-a-corridor.js) draws the PNG into
//      a canvas and then fills WHITE through `source-in` — it paints through
//      the picture's own ALPHA. A picture with no alpha channel is one opaque
//      rectangle, so source-in fills the whole rectangle white and the panel
//      becomes a white slab. The shape has to live in the alpha channel; the
//      colour channels are never read. (They are read once, wrongly, if the
//      texture is ever used as an `alphaMap` — three samples the GREEN channel
//      — which is why the existing files are greyscale-plus-alpha with green
//      pinned at 0, and why these are written the same way.)
//
//   2. SkylineKit / the `skyline` + `cityroom` presets (js/environment.js) and
//      the Zone B park ring (js/zone-b-park.js) all crop the bottom
//      SKYLINE_CROP = 0.25 of the image off via a texture window
//      (offset 0 0.25, repeat 1 0.75) and shorten the plane by the same
//      fraction. That bottom quarter is the "foreground band": it is never
//      seen head-on, but the plane runs its UVs BELOW v = 0 to make a skirt
//      under the city, and ClampToEdgeWrapping repeats the image's bottom row
//      into it. So the bottom row must be SOLID, or the skirt shows sky.
//
// Which gives the one layout rule this script exists to enforce:
//
//        row 0 ┌─────────────────────────┐
//              │   transparent sky       │
//              │   ▄▄  silhouette  ▄▄▄   │  ← subject, black, soft-edged alpha
//      row 612 ├─────────────────────────┤  ← the GROUND LINE, at exactly
//              │   solid opaque black    │    75% of 816 = 1 - SKYLINE_CROP
//      row 815 └─────────────────────────┘  ← the foreground band + skirt
//
//   The subject's ground line lands exactly on the crop seam, so what the
//   panel shows is the city standing on the floor line, and what the skirt
//   repeats is solid black. assets/saigon1-4.png already follow this
//   (measured: opaque pixels are pure luma 0, coverage reaches 1.0 below the
//   seam); these outputs follow it exactly rather than approximately.
//
// WHAT THE INPUTS ARE. Thirty-one pictures dropped into assets/ in two batches
// — all plain RGB, NO alpha, 1456x816, black silhouettes over white/grey.
// Several carry a mirror reflection under the subject, a good many sit over a
// flat dark river. They sort into four kinds, which is what `category` names:
//
//   city   5   plain skylines
//   bridge 2   cable-stayed bridges
//   boat   7   several hulls together, usually with a city behind them
//   solo  14   ONE boat and open water, nothing behind it
//
// The solo series is the second batch and is kept apart on purpose: a single
// hull still reads as a boat on a park-ring panel at 40-60 m, where a harbour
// full of overlapping masts collapses into noise. Same pipeline, different
// thing to place.
//
// Three pairs are byte-identical ("0_1 (3)" = "0_1", "0_3 (2)" = "0_3",
// "boat (13)" = "boat (11)"), so twenty-eight of the thirty-one convert and the
// duplicates are recorded in the manifest instead — see SKIPPED_DUPLICATES.
//
// THE THREE THINGS THIS DOES TO EACH ONE:
//
//   THRESHOLD, WITH A RAMP. Alpha comes from luma through a soft step, not a
//   hard cut: full inside THRESHOLD - RAMP, zero outside THRESHOLD + RAMP,
//   smoothstepped between. The sources are anti-aliased, so a tonal ramp of a
//   few luma units lands as a 1-2 px spatial ramp on a building edge — which
//   is what we want, because the panels are minified hard at 40-60 m and a
//   hard alpha cut sparkles. A tonal ramp is also the only way the bridge
//   CABLES survive: they are thin light-grey anti-aliased lines that a hard
//   threshold either erases or turns into dashes, and a spatial blur would
//   fade them out. Colour is thrown away entirely — every kept pixel is
//   luma 0, exactly like saigon1-4.
//
//   FIND THE WATERLINE. Everything below the subject's ground line is either a
//   mirror reflection or flat dark river, and both are junk here: a reflection
//   read as silhouette hangs a second upside-down city under the panel, and
//   flat river reads as a black slab. autoCutRow() guesses it by the shape the
//   brief describes — walk down from the subject's densest band and take the
//   first place coverage DROPS away — but that only works when the water is
//   lighter than the subject. Over a dark river (the bridges, "0_1 (1)")
//   coverage RISES instead and never drops, so the guess runs off the bottom
//   of the picture. Hence CUT_ROW overrides, read off the pictures by eye; the
//   guess is still computed and recorded next to the applied value in the
//   manifest so the two can be compared.
//
//   RE-COMPOSE. The masked subject is SHIFTED so its cut row lands on row 612
//   and the band below is filled solid — shift and pad only, never a stretch,
//   so no building is squashed. Shifting up clips the top of the frame, which
//   is sky for every one of these (checked against the subject's real top row;
//   if one ever did not fit, fitScale uniformly scales it down rather than
//   distorting it, and says so).
//
// PLUS, FOR THE `boat` SCENES: a boats-only cut. Most of them have their
// background city in HAZE — much lighter than the hulls — so the threshold has
// already dropped it and the boats come out alone. Some do not: where the
// skyline is the same black as the boats and the far bank welds them together,
// no threshold can separate them. That is what the connected-component span
// test detects (one component wider than MIXED_SPAN of the frame = fused), and
// those are reported as MIXED and skipped rather than mangled. The `solo`
// series never asks for one — there is no city in the frame to remove.
//
// HOW TO RUN:
//   cd tools
//   npm install                  # sharp, already vendored here
//   node silhouette-alpha.js     # add --quiet to drop the per-file log
//
// WRITES (originals in assets/ are never touched):
//   assets/skyline/city-01..05.png, bridge-01..02.png, boat-01..07.png
//   assets/skyline/solo-01..14.png     (one boat each)
//   assets/skyline/boat-NN-boats.png   (boats-only, where separable)
//   assets/skyline/manifest.json       (source, threshold, cutRow, category)
//   assets/skyline/contact-sheet.png   (every output on white, labelled)
// ================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// --- the layout contract (must track js/environment.js) -----------------
const OUT_W = 1456;
const OUT_H = 816;
const SKYLINE_CROP = 0.25; // keep in step with SKYLINE_CROP in js/environment.js
const GROUND_ROW = Math.round(OUT_H * (1 - SKYLINE_CROP)); // 612

// --- thresholding -------------------------------------------------------
const THRESHOLD = 110; // luma midpoint of the alpha step (per-file overridable)
const RAMP = 14; // luma half-width of the soft edge; ~1-2 px on these sources

// --- boats-only separation ---------------------------------------------
const MIN_BLOB = 220; // px; smaller components are speckle, dropped
const MIXED_SPAN = 0.85; // a component wider than this fraction of the frame has
//                          fused the background city into the boats -> MIXED

// HOW MUCH SMALLER THE SOLO BOATS ARE WRITTEN, as a divisor of 1456x816.
//
// Every picture is lifted into a canvas at its OWN pixel size at runtime, so
// the resolution written here is the texture bill: 4.5 MB each at full size,
// and the boat band wants a dozen of them.
//
// A city panel earns that size — the near band is 173 m wide seen from 130 m,
// about 67 degrees, which is roughly 1350 px across a Quest 3's view, so 1456
// is matched to it almost exactly. A BOAT panel is 14.7 m at 100 m for the
// tallest in the pool and 3.5 m for the smallest: 8.4 and 2.0 degrees, or about
// 168 and 40 px. Full size is nine times more texture than the picture can ever
// put on screen.
//
// 4 keeps a comfortable margin — 364x204, still twice the widest a boat renders
// at, and more than the ~280 px it reaches if you stand at the lawn's edge — and
// takes fourteen boats from 63.5 MB of canvas down to 4.0 MB. It also divides
// 816 exactly, so the ground line stays on a whole row (204 x 0.75 = 153) and
// the aspect is unchanged, which is what the panel geometry depends on.
//
// The boat-NN harbour scenes are NOT shrunk: they are framed for a wide panel,
// and if they are ever used they would be used at skyline width.
const SOLO_DIV = 4;

const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "assets");
const OUT_DIR = path.join(ROOT, "assets", "skyline");

// ----------------------------------------------------------------------
// THE JOB LIST.
//
// `cutRow` is the waterline: the last row that is still the real subject. Each
// one here was read off a gridded overlay of the source's lower half; leave it
// out and autoCutRow() guesses instead. `category` drives the output name and
// nothing else. `boats: true` also asks for a boats-only variant.
// ----------------------------------------------------------------------
const JOBS = [
  // --- plain skylines ---------------------------------------------------
  // Cleanest of the lot: coverage is a flat 1.00 down to 533 and 0.00 at 535,
  // no reflection at all, so the band simply stops. 534 is the last solid row.
  { src: "saigon (5).png", category: "city", cutRow: 534, fillHoles: true },
  // The reflection is welded straight onto the city, and both are solid black,
  // so coverage alone cannot see the join — it reads 1.00 from 576 to the frame
  // edge. Row MEAN LUMA can: it sits at ~10 through the city bases, lifts to
  // 95 at 564-566 (the bright water seam) and drops back to ~3 below, which is
  // the reflection. 563 is the last row above that seam.
  { src: "saigon (4).png", category: "city", cutRow: 563, fillHoles: true },
  // Gradient sky, long mirror reflection over water; the bridge at the left
  // edge is part of the skyline here, not the subject. Coverage holds ~0.9
  // through 602 and only then breaks up into ripples.
  // The cable-stayed bridge at its left edge comes out: three pylons and their
  // fans across x 0-290, cut at the deck line so the far bank underneath stays.
  {
    src: "saigon (6).png", category: "city", cutRow: 600, fillHoles: true,
    erase: [{ x0: 0, x1: 298, y0: 0, y1: 555 }],
    eraseWhy: "the cable-stayed bridge at the left edge",
  },
  // Dark blue-grey city over a solid foreground band, white below it: 1.00
  // through 657, 0.00 at 659.
  { src: "saigon (7).png", category: "city", cutRow: 658, fillHoles: true },
  // Textbook mirror reflection — the inverted city hangs below a ragged join,
  // so coverage tails off gradually rather than stepping.
  { src: "0_1.png", category: "city", cutRow: 558, fillHoles: true },

  // --- cable-stayed bridges ---------------------------------------------
  // Flat dark river below the land strip: coverage RISES into the water and
  // never drops, so the guess runs off the bottom. Mean luma separates them
  // outright — the land strip is pure black (~1) to row 719, the water is grey
  // (~30-51) from 722 down.
  //
  // BOTH BRIDGES ARE SHRUNK TO FIT (maxSpire). They are framed far tighter than
  // any city picture — measured 0.926 and 1.000 of the cropped height against
  // the cities' 0.53-0.72 — so dropped straight onto a skyline panel of the
  // same width they stand nearly twice as tall as a skyline whose real towers
  // are three times their height. bridge-02 was also losing the tips of its
  // topmost cables off the top of the frame. 0.62 puts them in the middle of
  // the city pool's range, which is where a bridge belongs against a skyline.
  { src: "saigon (8).png", category: "bridge", cutRow: 719, maxSpire: 0.62, extendSides: 150 },
  // Same shape, softer join: luma bottoms out at ~47 through 746 and lifts from
  // 748 as the water catches the light. Piers enter the water right there.
  { src: "0_1 (2).png", category: "bridge", cutRow: 747, maxSpire: 0.62, extendSides: 150 },

  // --- river boats ------------------------------------------------------
  // Hazy: the distant city at the right is far lighter than the boats, so the
  // threshold drops it on its own and boats-only comes out near-identical.
  { src: "saigon (1).png", category: "boat", cutRow: 458, boats: true },
  // The hard one: black skyline behind the boats at the same value, fused
  // through the far bank. Coverage steps 1.00 -> 0.75 at 599, so the hulls end
  // at 598; everything below is reflection. Expected to report MIXED.
  { src: "saigon (2).png", category: "boat", cutRow: 598, boats: true },
  // Background city and trees sit in mid-grey haze, below the threshold. The
  // water here is choppy, not mirror-flat, so coverage never gives a clean
  // step — 660 is read off the big boat's hull.
  { src: "saigon (3).png", category: "boat", cutRow: 660, boats: true },
  // Faint tree line behind, flat dark river below the hulls. Low coverage at
  // the ground line is CORRECT here: boats do not span the frame the way a
  // skyline does.
  { src: "0_1 (1).png", category: "boat", cutRow: 542, boats: true },

  // --- more boat scenes, second batch -----------------------------------
  // Same treatment, and they keep the `boat` series going because they are the
  // same kind of picture: several hulls with a city behind them.
  //
  // WHY EVERY ONE OF THESE IS A MANUAL CUT TOO. On a boat the waterline is not
  // a step in coverage the way a skyline's is. A hull is a small dark island in
  // a frame full of rippled water that is ALSO dark, so coverage wanders
  // between 0.3 and 0.9 for two hundred rows and the "first drop" rule fires on
  // a ripple. Three of them (boat 1, boat 10) sit over water dark enough that
  // coverage RISES at the waterline instead, which is the same failure the
  // bridges have. All of these were read off a gridded overlay and then checked
  // against the row numbers.
  //
  // AND WHY THEY ARE BIASED A FEW ROWS HIGH. The error is not symmetric. Cut a
  // little high and the last rows of hull are replaced by the solid band, which
  // is the same black — the hull simply merges into it and nothing shows. Cut a
  // little low and a sliver of reflection is left stranded above the band,
  // where it reads as speckle. So where the water is noisy, round toward the
  // boat.
  { src: "boat (1).png", category: "boat", cutRow: 612, boats: true },
  { src: "boat (14).png", category: "boat", cutRow: 554, boats: true },
  { src: "boat (15).png", category: "boat", cutRow: 573, boats: true },

  // --- SOLO: one boat, nothing behind it --------------------------------
  // A separate series because they are a different thing to place, not just
  // more of the same. A park-ring panel showing one hull reads at 40-60 m; a
  // harbour full of overlapping masts turns to noise at that distance, which is
  // the whole reason these were shot. No boats-only variant is emitted for them
  // — there is no city in the frame to take out, and what little far shore
  // there is (a tree line on "boat (11)", a horizon on "0_3") sits in haze well
  // above the threshold and drops on its own.
  { src: "boat (2).png", category: "solo", outDiv: SOLO_DIV, cutRow: 578 },
  { src: "boat (3).png", category: "solo", outDiv: SOLO_DIV, cutRow: 526 },
  { src: "boat (4).png", category: "solo", outDiv: SOLO_DIV, cutRow: 524 },
  { src: "boat (5).png", category: "solo", outDiv: SOLO_DIV, cutRow: 598 },
  { src: "boat (6).png", category: "solo", outDiv: SOLO_DIV, cutRow: 592 },
  { src: "boat (7).png", category: "solo", outDiv: SOLO_DIV, cutRow: 522 },
  { src: "boat (8).png", category: "solo", outDiv: SOLO_DIV, cutRow: 520 },
  { src: "boat (9).png", category: "solo", outDiv: SOLO_DIV, cutRow: 592 },
  // Dark river: coverage JUMPS 0.45 -> 0.82 at 594 as the water starts, the
  // one place in this batch where the boundary is unmistakable in the numbers.
  { src: "boat (10).png", category: "solo", outDiv: SOLO_DIV, cutRow: 593 },
  { src: "boat (11).png", category: "solo", outDiv: SOLO_DIV, cutRow: 658 },
  { src: "boat (12).png", category: "solo", outDiv: SOLO_DIV, cutRow: 600 },
  { src: "0_2.png", category: "solo", outDiv: SOLO_DIV, cutRow: 594 },
  { src: "0_3.png", category: "solo", outDiv: SOLO_DIV, cutRow: 646 },
  { src: "0_3 (1).png", category: "solo", outDiv: SOLO_DIV, cutRow: 594 },
];

// `0_1 (3).png` is byte-identical to `0_1.png` (md5 8f36437f...), so it is
// deliberately absent from JOBS — converting it would just duplicate city-05.
// The four originals the park's skyline has always used. Not converted (they
// already are what this script produces) — only MEASURED, so the scene has their
// subject heights on the same scale as the new pictures'.
const LEGACY_SRCS = ["saigon1.png", "saigon2.png", "saigon3.png", "saigon4.png"];

const SKIPPED_DUPLICATES = [
  { src: "0_1 (3).png", sameAs: "0_1.png" },
  { src: "0_3 (2).png", sameAs: "0_3.png" },
  { src: "boat (13).png", sameAs: "boat (11).png" },
];

// ======================================================================
// PIXELS
// ======================================================================

// Rec. 709 luma, one byte per pixel, alpha forced away. `ensureAlpha` keeps the
// channel count at 4 whatever the source was, so the stride is always known.
async function loadLuma(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const luma = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += ch) {
    luma[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
  }
  return { luma, w, h };
}

// Luma -> alpha through a smoothstep. Below `t - ramp` fully opaque, above
// `t + ramp` fully clear, Hermite in between. Returns 0..255 per pixel.
function buildMask(luma, t, ramp) {
  const a = new Uint8Array(luma.length);
  const lo = t - ramp;
  const span = 2 * ramp;
  for (let p = 0; p < luma.length; p++) {
    const x = (luma[p] - lo) / span; // 0 at fully dark edge, 1 at fully light
    if (x <= 0) a[p] = 255;
    else if (x >= 1) a[p] = 0;
    else a[p] = Math.round(255 * (1 - x * x * (3 - 2 * x)));
  }
  return a;
}

// Fraction of each row that is opaque enough to count as subject.
function rowCoverage(mask, w, h) {
  const cov = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) if (mask[base + x] > 127) n++;
    cov[y] = n / w;
  }
  return cov;
}

// First row from the top carrying any subject at all — used to prove the
// subject still fits once it has been shifted up onto the ground line.
function firstCoveredRow(cov, minCov) {
  for (let y = 0; y < cov.length; y++) if (cov[y] >= minCov) return y;
  return 0;
}

// ======================================================================
// HOW TALL THE SUBJECT IS, in the only units the scene cares about: a fraction
// of the CROPPED height. The panels crop the bottom SKYLINE_CROP away, so what
// a panel actually shows is rows 0..GROUND_ROW-1 — GROUND_ROW rows — and a
// subject whose top row is `topRow` fills (GROUND_ROW - topRow) / GROUND_ROW of
// that. This is the number the Zone B park's top-trim is set against: a band
// trimming `t` off the top keeps (1 - t) of the cropped height, so anything
// with `spire` above that gets its top cut off. Reported here so the scene can
// check it instead of someone noticing a decapitated spire in the headset.
//
// `roof` is the same measure at the height where a fifth of the columns are
// still subject — the "rooftop line" the park's existing note quotes — which
// says how much of the panel is massed city rather than lone spires.
// ======================================================================
function measureSubject(alpha) {
  const cols = (y) => {
    let n = 0;
    for (let x = 0; x < OUT_W; x++) if (alpha[y * OUT_W + x] > 127) n++;
    return n / OUT_W;
  };
  let topRow = GROUND_ROW;
  let roofRow = GROUND_ROW;
  for (let y = 0; y < GROUND_ROW; y++) {
    const c = cols(y);
    if (c > 0 && topRow === GROUND_ROW) topRow = y;
    if (c >= 0.2) { roofRow = y; break; }
  }
  return {
    topRow: topRow,
    roofRow: roofRow,
    spire: +((GROUND_ROW - topRow) / GROUND_ROW).toFixed(3),
    roof: +((GROUND_ROW - roofRow) / GROUND_ROW).toFixed(3),
  };
}

// The four originals are not produced here, but the scene needs their numbers on
// the same scale to compare against — they are the reference the park's top-trim
// was chosen from. Measured straight off their existing alpha.
async function measureLegacy(files) {
  const out = [];
  for (const f of files) {
    const p = path.join(SRC_DIR, f);
    if (!fs.existsSync(p)) continue;
    const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const a = new Uint8Array(info.width * info.height);
    for (let i = 0; i < a.length; i++) a[i] = data[i * info.channels + 3];
    out.push(Object.assign({ name: f, source: "assets/" + f }, measureSubject(a)));
  }
  return out;
}

// ======================================================================
// THE WATERLINE GUESS
//
// The brief's shape: coverage climbs into the subject's solid base, then DROPS
// where the subject stops, then rises again into the reflection. So: find the
// densest band in the plausible lower region, walk down from it, and cut at the
// first row that has fallen away from that density.
//
// It only works when the water is LIGHTER than the subject. Over a flat dark
// river coverage rises into the water and never drops, and the walk falls off
// the bottom of the picture — detected here and reported as `ranOff`, which is
// why the dark-water sources carry explicit overrides.
// ======================================================================
function autoCutRow(cov, h) {
  const from = Math.floor(h * 0.3);
  const to = Math.floor(h * 0.98);
  let peak = 0;
  for (let y = from; y <= to; y++) if (cov[y] > peak) peak = cov[y];
  if (peak <= 0) return { row: GROUND_ROW, peak: 0, ranOff: true };

  let yPeak = from;
  for (let y = from; y <= to; y++) {
    if (cov[y] >= 0.9 * peak) {
      yPeak = y;
      break;
    }
  }
  const fall = 0.55 * peak;
  for (let y = yPeak; y <= to; y++) {
    if (cov[y] < fall) return { row: y, peak, yPeak, ranOff: false };
  }
  // Never dropped: dark water, or the subject simply runs to the frame edge.
  return { row: to, peak, yPeak, ranOff: true };
}

// ======================================================================
// RE-COMPOSITION
//
// Copy rows 0..cutRow of the mask into a fresh 1456x816 canvas so that
// `cutRow` lands on GROUND_ROW, then fill GROUND_ROW..bottom solid. Rows that
// fall off the top are sky. Nothing is ever resampled vertically unless
// `fitScale` says the subject genuinely does not fit, which on these eleven it
// never does.
// ======================================================================
function compose(mask, w, h, cutRow, subjectTop, forceScale) {
  const need = cutRow - subjectTop; // rows of real subject to preserve
  const room = GROUND_ROW; // rows available above the ground line
  let scale = 1;
  if (need > room) scale = room / need; // uniform, last resort; logged
  // A deliberate shrink, to bring a tightly-framed picture down to the same
  // apparent scale as the rest of its pool. Uniform, so nothing distorts.
  if (forceScale && forceScale < scale) scale = forceScale;

  const out = new Uint8Array(OUT_W * OUT_H); // 0 = transparent

  if (scale === 1) {
    const dy = GROUND_ROW - cutRow;
    const y0 = Math.max(0, -dy); // first source row that still lands on canvas
    for (let y = y0; y <= cutRow; y++) {
      out.set(mask.subarray(y * w, y * w + w), (y + dy) * OUT_W);
    }
  } else {
    // Uniform box-ish resample about the ground line, both axes by `scale`, so
    // the subject shrinks without distorting. Horizontally centred.
    const sw = Math.round(w * scale);
    const xOff = Math.round((OUT_W - sw) / 2);
    for (let dyOut = 0; dyOut < GROUND_ROW; dyOut++) {
      const destY = GROUND_ROW - 1 - dyOut;
      const srcY = Math.round(cutRow - 1 - dyOut / scale);
      if (srcY < 0) break;
      const sBase = srcY * w;
      const dBase = destY * OUT_W;
      for (let x = 0; x < sw; x++) {
        const sx = Math.min(w - 1, Math.round(x / scale));
        out[dBase + xOff + x] = mask[sBase + sx];
      }
    }
  }

  // The foreground band: solid, opaque, edge to edge. This is what the texture
  // window crops away and what ClampToEdgeWrapping repeats into the skirt.
  out.fill(255, GROUND_ROW * OUT_W);
  return { alpha: out, scale };
}

// ======================================================================
// CLOSE THE HOLES INSIDE THE SILHOUETTE.
//
// These pictures are drawings, not photographs, and several draw a building's
// windows, floor slabs and scaffolding as WHITE LINES inside its outline. As a
// picture that is fine. As a silhouette it is not: the panel is a hole-punched
// mask, so every one of those lines lets the sky through, and on a hazy skyline
// 130 m away they read as bright flecks scattered over the towers — pale where
// the city should be solid. city-02 is 14% holes by area, which is what that
// looks like.
//
// A PER-COLUMN FILL WOULD BE WRONG, and is the obvious thing to reach for:
// filling each column from its topmost ink down to the ground line also fills
// the real sky between two towers of different heights, which is most of what
// gives a skyline its shape. The distinction that matters is whether a gap
// reaches the SKY. So this floods inward from the top and side edges through
// everything transparent, and fills only what it cannot reach — the enclosed
// pockets, which are exactly the drawn detail. Sky between buildings connects
// to the top of the frame and is left alone.
//
// Not for the bridges (82% of a cable-stayed bridge's bounding area is the air
// under its deck and between its cables, all of it enclosed by the deck and the
// towers) and not for the boats (the gap under a canopy is real). Cities only.
// ======================================================================
function fillHoles(alpha) {
  const seen = new Uint8Array(OUT_W * GROUND_ROW);
  const stack = new Int32Array(OUT_W * GROUND_ROW);
  let sp = 0;
  const push = (x, y) => {
    const i = y * OUT_W + x;
    if (!seen[i] && alpha[i] < 128) {
      seen[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < OUT_W; x++) push(x, 0); // the sky
  for (let y = 0; y < GROUND_ROW; y++) {
    push(0, y); // and the two edges, where a panel meets its neighbour
    push(OUT_W - 1, y);
  }
  while (sp > 0) {
    const q = stack[--sp];
    const x = q % OUT_W;
    const y = (q / OUT_W) | 0;
    if (x > 0) push(x - 1, y);
    if (x < OUT_W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < GROUND_ROW - 1) push(x, y + 1);
  }
  let filled = 0;
  for (let i = 0; i < OUT_W * GROUND_ROW; i++) {
    if (alpha[i] < 128 && !seen[i]) {
      alpha[i] = 255;
      filled++;
    }
  }
  return filled;
}

// ======================================================================
// RUB SOMETHING OUT OF A PICTURE.
//
// One job needs it. "saigon (6)" is a fine Saigon skyline that happens to have
// a cable-stayed bridge built into its left edge — three pylons and their cable
// fans, occupying the first fifth of the frame. The bridge BAND is switched off
// because a bridge on a 60-degree panel always ends in mid-air, and this one
// was doing exactly that inside a city picture, so it had to come out too.
//
// It is erased ABOVE THE DECK ONLY. Everything below row ~555 there is the far
// bank, already a solid mass and continuous with the city to its right, so
// cutting the pylons off at the deck line leaves a low flat shoreline rather
// than a hole punched down to the ground line. Rectangles are in output pixels,
// and this runs LAST — after fillHoles, which would otherwise see the new
// transparent region as an enclosed pocket and fill it straight back in.
// ======================================================================
function eraseRects(alpha, rects) {
  let n = 0;
  (rects || []).forEach((r) => {
    const x0 = Math.max(0, r.x0 | 0);
    const x1 = Math.min(OUT_W, r.x1 | 0);
    const y0 = Math.max(0, r.y0 | 0);
    const y1 = Math.min(OUT_H, r.y1 | 0);
    for (let y = y0; y < y1; y++) {
      const base = y * OUT_W;
      for (let x = x0; x < x1; x++) {
        if (alpha[base + x]) n++;
        alpha[base + x] = 0;
      }
    }
  });
  return n;
}

// ======================================================================
// EXTEND THE VIADUCT OUT TO BOTH EDGES.
//
// For the bridges, and because of what maxSpire does to them. That shrink is
// UNIFORM — it has to be, or the towers distort — so bringing a bridge down to
// the cities' apparent height also makes it narrower: at scale 0.67 the picture
// fills the middle two thirds of the frame and leaves a transparent margin of
// some 240 px at each side. On a panel that margin is a hole, and since the two
// bridges stand on ADJACENT panels what you see is a bridge in segments with
// the river showing through between them.
//
// Fading those edges out was worse, not better: a bridge deck is one continuous
// horizontal line and the eye reads a break in it as a break, however soft. So
// the deck is CARRIED OUT to the edge instead.
//
// HOW: take a strip of the picture just inside where its content ends — for
// these two that is the approach viaduct, a deck on regular piers — and repeat
// it outward, MIRRORED. Mirroring rather than tiling is what makes it seamless:
// a plain repeat jumps back to the start of the strip every `strip` pixels and
// leaves a visible vertical seam each time, while a reflected repeat always
// continues the column it just drew. The result is an approach that runs off
// the frame the way a real one does, and two neighbouring panels whose decks
// meet instead of stopping.
//
// Rows below the ground line are left alone: they are already solid.
// ======================================================================
function extendSides(alpha, strip) {
  if (!strip) return alpha;
  // Where the picture's content actually starts and ends, above the ground line.
  let x0 = OUT_W;
  let x1 = -1;
  for (let y = 0; y < GROUND_ROW; y++) {
    const base = y * OUT_W;
    for (let x = 0; x < OUT_W; x++) {
      if (alpha[base + x] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }
  if (x1 < 0) return alpha; // nothing above the ground line
  const S = Math.max(2, Math.min(strip, x1 - x0 + 1));
  // Reflected index: 0..S-1 then back down, so every join continues the last
  // column drawn rather than snapping back to the strip's start.
  const mirror = (d) => {
    const m = d % (2 * S);
    return m < S ? m : 2 * S - 1 - m;
  };
  for (let y = 0; y < GROUND_ROW; y++) {
    const base = y * OUT_W;
    for (let x = 0; x < x0; x++) {
      alpha[base + x] = alpha[base + x0 + mirror(x0 - x - 1)];
    }
    for (let x = x1 + 1; x < OUT_W; x++) {
      alpha[base + x] = alpha[base + x1 - mirror(x - x1 - 1)];
    }
  }
  return alpha;
}

// ======================================================================
// BOATS-ONLY
//
// Label 4-connected components of the mask and keep the ones that read as
// boats. A background skyline that survived the threshold is not separable
// from the boats when the far bank has welded them into a single component —
// so any component spanning more than MIXED_SPAN of the frame width means the
// two are fused, and the caller is told MIXED instead of being handed a
// butchered picture.
// ======================================================================
function components(mask, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const out = [];
  for (let p = 0; p < w * h; p++) {
    if (mask[p] <= 127 || label[p] !== -1) continue;
    const id = out.length;
    let sp = 0;
    stack[sp++] = p;
    label[p] = id;
    let n = 0,
      x0 = w,
      x1 = 0,
      y0 = h,
      y1 = 0;
    while (sp > 0) {
      const q = stack[--sp];
      const qx = q % w,
        qy = (q / w) | 0;
      n++;
      if (qx < x0) x0 = qx;
      if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy;
      if (qy > y1) y1 = qy;
      if (qx > 0 && mask[q - 1] > 127 && label[q - 1] === -1) {
        label[q - 1] = id;
        stack[sp++] = q - 1;
      }
      if (qx < w - 1 && mask[q + 1] > 127 && label[q + 1] === -1) {
        label[q + 1] = id;
        stack[sp++] = q + 1;
      }
      if (qy > 0 && mask[q - w] > 127 && label[q - w] === -1) {
        label[q - w] = id;
        stack[sp++] = q - w;
      }
      if (qy < h - 1 && mask[q + w] > 127 && label[q + w] === -1) {
        label[q + w] = id;
        stack[sp++] = q + w;
      }
    }
    out.push({ id, n, x0, x1, y0, y1, spanFrac: (x1 - x0 + 1) / w });
  }
  return { label, comps: out };
}

// Returns { mask, mixed, kept, dropped, widest } — `mask` is null when mixed.
//
// LABEL ONLY WHAT SURVIVES THE CUT. The river below `cutRow` is darker than the
// threshold in three of these four, so labelling the whole frame welds every
// boat to every other boat through the water and reports a single component
// spanning 100% of the width — a MIXED verdict that is an artefact of the
// water, not of the city. Rows below the cut are discarded by compose() anyway,
// so they are zeroed here first and the components are the ones that matter.
function boatsOnlyMask(fullMask, w, h, cutRow) {
  const mask = new Uint8Array(w * h);
  mask.set(fullMask.subarray(0, (cutRow + 1) * w));

  const { label, comps } = components(mask, w, h);
  const big = comps.filter((c) => c.n >= MIN_BLOB);
  const widest = big.reduce((m, c) => Math.max(m, c.spanFrac), 0);
  if (widest > MIXED_SPAN) {
    const c = big.find((x) => x.spanFrac === widest);
    return { mask: null, mixed: true, widest, widestPx: c ? c.n : 0 };
  }
  // Not fused: the threshold already dropped the hazy background, so what is
  // left is boats plus speckle. Keep components that actually reach the water
  // (a boat sits ON the waterline) and are not hairline noise.
  const nearWater = Math.round(h * 0.06);
  const keep = new Set();
  let dropped = 0;
  for (const c of comps) {
    if (c.n >= MIN_BLOB && c.y1 >= cutRow - nearWater) keep.add(c.id);
    else dropped++;
  }
  const out = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (keep.has(label[p])) out[p] = mask[p];
  return { mask: out, mixed: false, kept: keep.size, dropped, widest };
}

// ======================================================================
// OUTPUT
// ======================================================================

// Write greyscale-plus-alpha PNG: every kept pixel pure black, shape in alpha.
// Built as RGBA and collapsed with toColourspace("b-w") because sharp's raw
// input does not take a 2-channel grey+alpha buffer directly; the result is a
// real LA PNG (colour type 4), matching assets/saigon1-4.png.
async function writeLA(alpha, file, div) {
  const d = div && div > 1 ? div : 1;
  const w = OUT_W / d;
  const h = OUT_H / d;
  let a = alpha;
  if (d > 1) {
    // Resize the ALPHA ALONE, as a one-channel image, and rebuild the RGBA
    // afterwards. Handing sharp the RGBA would make it premultiply for the
    // resample and unpremultiply after, which divides by an alpha that is zero
    // across most of this picture — the shape survives that, but there is no
    // reason to round-trip through it when the colour channels are all zero
    // anyway and the alpha is the entire content.
    a = await sharp(Buffer.from(alpha.buffer, alpha.byteOffset, alpha.length), {
      raw: { width: OUT_W, height: OUT_H, channels: 1 },
    })
      .resize(w, h, { kernel: "lanczos3" })
      // Back to ONE channel explicitly: sharp promotes a raw single-channel
      // input to 3-channel sRGB inside the pipeline, and without this the raw
      // buffer comes back interleaved RGB — which is read as a third of the
      // picture, and writes an empty file.
      .toColourspace("b-w")
      .raw()
      .toBuffer();
  }
  // RE-ASSERT THE BAND. A lanczos kernel has negative lobes, and the ground
  // line is the hardest edge in the picture — fully transparent one row, fully
  // opaque the next — so the resample rings across it and leaves the first rows
  // of the foreground band at about 216 instead of 255. Measured, before this.
  // The band is solid BY DEFINITION (it is what the panel's skirt repeats, and
  // a skirt at 85% alpha shows sky through the bottom of the city), so it is
  // written back rather than trusted to survive a filter.
  const ground = Math.round(h * (1 - SKYLINE_CROP));
  for (let p = ground * w; p < w * h; p++) a[p] = 255;

  const rgba = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = a[p]; // RGB stay 0
  await toFileRetrying(
    sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .toColourspace("b-w")
      .png({ compressionLevel: 9 }),
    file
  );
}

// Writing into assets/ intermittently fails on this machine with "unable to
// open for write / The device does not recognize the command" — a Windows
// sharing error, not a bad buffer: an indexer or a picture viewer has the file
// open for the moment it takes to replace it. It clears immediately, so back
// off briefly and try again rather than losing a whole batch to one locked file.
async function toFileRetrying(pipeline, file, tries = 5) {
  for (let i = 1; ; i++) {
    try {
      return await pipeline.toFile(file);
    } catch (e) {
      if (i >= tries) throw e;
      console.warn(`  . ${path.basename(file)} locked, retry ${i}/${tries - 1}`);
      await new Promise((r) => setTimeout(r, 200 * i));
    }
  }
}

// Every output on white, labelled, so the batch can be judged in one look. A
// red rule is drawn across each thumbnail at the ground line: if the picture is
// right, every subject stands ON that rule and solid black runs below it.
async function contactSheet(entries, file) {
  const TW = 420;
  const TH = Math.round((TW * OUT_H) / OUT_W);
  const COLS = 3;
  const PAD = 18;
  const LAB = 34;
  const rows = Math.ceil(entries.length / COLS);
  const W = COLS * TW + (COLS + 1) * PAD;
  const H = rows * (TH + LAB + PAD) + PAD + 40;

  const comps = [
    {
      input: Buffer.from(
        `<svg width="${W}" height="30"><text x="0" y="22" font-family="monospace" font-size="19" fill="#111">` +
          `assets/skyline/ — ${entries.length} outputs — red rule = ground line, row ${GROUND_ROW} of ${OUT_H} (1 - SKYLINE_CROP)</text></svg>`
      ),
      left: PAD,
      top: 10,
    },
  ];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const cx = i % COLS;
    const cy = (i / COLS) | 0;
    const x = PAD + cx * (TW + PAD);
    const y = 50 + PAD + cy * (TH + LAB + PAD);
    // Flatten onto white: these are black-on-transparent, so white is the only
    // background that shows the silhouette the way the panels will read it.
    const thumb = await sharp(e.file)
      .resize(TW, TH, { fit: "fill" })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    comps.push({ input: thumb, left: x, top: y });
    const rule = Math.round((GROUND_ROW / OUT_H) * TH);
    comps.push({
      input: Buffer.from(
        `<svg width="${TW}" height="${TH}">` +
          `<rect x="0" y="0" width="${TW - 1}" height="${TH - 1}" fill="none" stroke="#999" stroke-width="1"/>` +
          `<line x1="0" y1="${rule}" x2="${TW}" y2="${rule}" stroke="#e00000" stroke-width="1" stroke-opacity="0.8"/></svg>`
      ),
      left: x,
      top: y,
    });
    const sub = `${e.source}  t=${e.threshold}  cut=${e.cutRow} (${e.cutRowSource})`;
    comps.push({
      input: Buffer.from(
        `<svg width="${TW}" height="${LAB}">` +
          `<text x="0" y="15" font-family="monospace" font-size="15" fill="#000">${e.name}</text>` +
          `<text x="0" y="30" font-family="monospace" font-size="12" fill="#666">${esc(sub)}</text></svg>`
      ),
      left: x,
      top: y + TH + 2,
    });
  }
  await toFileRetrying(
    sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite(comps)
      .png(),
    file
  );
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ======================================================================
// MAIN
// ======================================================================
(async () => {
  const quiet = process.argv.includes("--quiet");
  const log = (...a) => {
    if (!quiet) console.log(...a);
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const counters = {}; // one running number per category, in JOBS order
  const entries = [];
  const manual = [];
  const mixed = [];

  for (const job of JOBS) {
    const srcPath = path.join(SRC_DIR, job.src);
    const { luma, w, h } = await loadLuma(srcPath);
    if (w !== OUT_W || h !== OUT_H) {
      console.warn(`  ! ${job.src} is ${w}x${h}, expected ${OUT_W}x${OUT_H} — shifting anyway`);
    }
    const threshold = job.threshold != null ? job.threshold : THRESHOLD;
    const ramp = job.ramp != null ? job.ramp : RAMP;
    const mask = buildMask(luma, threshold, ramp);
    const cov = rowCoverage(mask, w, h);

    const guess = autoCutRow(cov, h);
    const cutRow = job.cutRow != null ? job.cutRow : guess.row;
    const cutRowSource = job.cutRow != null ? "manual" : "auto";
    if (cutRowSource === "manual") {
      manual.push({ src: job.src, cutRow, guess: guess.row, ranOff: guess.ranOff });
    }

    const subjectTop = firstCoveredRow(cov, 0.004);

    // SANITY: the cut row IS the ground line, so it has to still be standing on
    // subject. A cut set even a few rows too low lands in the blank gap under a
    // clean silhouette, and the city then floats above the foreground band with
    // a hairline of nothing between — which is exactly what a first pass here
    // did to city-01 and city-04 (coverage 0.000 at the ground line) and what
    // the contact sheet alone was too small to show. Boats legitimately cover
    // very little of that row, so this only fires on genuinely empty.
    const cutCov = cov[Math.min(h - 1, cutRow)];
    if (cutCov < 0.002) {
      console.warn(
        `  ! ${job.src}: cutRow ${cutRow} has ${(cutCov * 100).toFixed(2)}% coverage — it is BELOW ` +
          `the subject, so the ground line would be empty. Raise it (auto guessed ${guess.row}).`
      );
    }

    // COMPOSE, THEN FIT THE HEIGHT IF THE JOB ASKS FOR ONE.
    //
    // `maxSpire` caps how tall the subject may stand in the finished picture, as
    // a fraction of the cropped height — the same measure the scene sizes its
    // bands by. It exists for the two bridges: both are framed far tighter than
    // any of the city pictures (measured 0.926 and 1.000 against the cities'
    // 0.53-0.72), so on a panel of the same width they would tower over a
    // skyline whose real buildings are three times their height. bridge-02 was
    // worse than merely out of scale — its topmost cables ran off the top of
    // the frame and were being cut.
    //
    // IT ITERATES rather than solving for the scale directly, because the two
    // measures of "the top" disagree. `subjectTop` is the first row with 0.4% of
    // columns covered, which is what the layout needs; a bridge's cables are a
    // few pixels wide and reach far above it, and it is those that get clipped.
    // Composing, measuring the real top, and rescaling by the ratio converges in
    // one pass and needs no special case for thin detail.
    let { alpha, scale } = compose(mask, w, h, cutRow, subjectTop);
    let metrics = measureSubject(alpha);
    if (job.maxSpire && metrics.spire > job.maxSpire) {
      const before = metrics.spire;
      ({ alpha, scale } = compose(
        mask, w, h, cutRow, subjectTop, (job.maxSpire / metrics.spire) * scale
      ));
      metrics = measureSubject(alpha);
      log(`      fitted: spire ${before} -> ${metrics.spire} (cap ${job.maxSpire}), scale ${scale.toFixed(3)}`);
    }

    if (job.fillHoles) {
      const n = fillHoles(alpha);
      if (n) log(`      filled ${n} px of enclosed holes (drawn window detail)`);
      metrics = measureSubject(alpha);
    }
    if (job.extendSides) {
      alpha = extendSides(alpha, job.extendSides);
      metrics = measureSubject(alpha);
    }

    if (job.erase) {
      const n = eraseRects(alpha, job.erase);
      log(`      erased ${n} px (${job.eraseWhy || "masked out"})`);
      metrics = measureSubject(alpha);
    }

    const n = (counters[job.category] = (counters[job.category] || 0) + 1);
    const name = `${job.category}-${String(n).padStart(2, "0")}.png`;
    const outPath = path.join(OUT_DIR, name);
    await writeLA(alpha, outPath, job.outDiv);

    const entry = {
      name,
      file: outPath,
      source: `assets/${job.src}`,
      category: job.category,
      threshold,
      ramp,
      extendSides: job.extendSides || 0,
      fillHoles: !!job.fillHoles,
      erased: job.erase || null,
      cutRow,
      cutRowSource,
      cutRowAuto: guess.row,
      autoRanOff: guess.ranOff,
      subjectTop,
      shift: GROUND_ROW - cutRow,
      groundRow: GROUND_ROW,
      fitScale: Number(scale.toFixed(4)),
      width: OUT_W / (job.outDiv || 1),
      height: OUT_H / (job.outDiv || 1),
      format: "LA (grey + alpha), black on transparent",
      // Subject height as a fraction of the CROPPED height — what the scene
      // checks its top-trim against. See measureSubject.
      spire: metrics.spire,
      roof: metrics.roof,
    };
    entries.push(entry);
    log(
      `  ${name.padEnd(13)} <- ${job.src.padEnd(16)} t=${threshold} cut=${cutRow} (${cutRowSource}` +
        `${cutRowSource === "manual" ? `, auto guessed ${guess.row}${guess.ranOff ? " — ran off" : ""}` : ""})` +
        ` top=${subjectTop} shift=${entry.shift}${scale < 1 ? ` scale=${entry.fitScale}` : ""}`
    );

    // --- boats-only variant ------------------------------------------
    if (job.boats) {
      const res = boatsOnlyMask(mask, w, h, cutRow);
      if (res.mixed) {
        mixed.push({ src: job.src, name, widest: res.widest });
        entry.boatsOnly = {
          emitted: false,
          reason: `MIXED — one component spans ${(res.widest * 100).toFixed(1)}% of the frame width ` +
            `(> ${MIXED_SPAN * 100}%), so the background city is fused to the boats and cannot be cut away`,
        };
        log(
          `      boats-only: MIXED, skipped — widest component spans ${(res.widest * 100).toFixed(1)}% of the width`
        );
      } else {
        const c2 = compose(res.mask, w, h, cutRow, subjectTop);
        const bName = name.replace(/\.png$/, "-boats.png");
        const bPath = path.join(OUT_DIR, bName);
        await writeLA(c2.alpha, bPath, job.outDiv);
        entry.boatsOnly = {
          emitted: true,
          name: bName,
          keptComponents: res.kept,
          droppedComponents: res.dropped,
          widestSpanFrac: Number(res.widest.toFixed(4)),
        };
        const bm = measureSubject(c2.alpha);
        entries.push({
          ...entry,
          name: bName,
          file: bPath,
          category: job.category + "-only",
          boatsOnly: undefined,
          spire: bm.spire,
          roof: bm.roof,
        });
        log(
          `      boats-only: ${bName} — kept ${res.kept} components, dropped ${res.dropped} ` +
            `(widest span ${(res.widest * 100).toFixed(1)}%)`
        );
      }
    }
  }

  // --- manifest ------------------------------------------------------
  const legacy = await measureLegacy(LEGACY_SRCS);
  const manifest = {
    generatedBy: "tools/silhouette-alpha.js",
    generatedAt: new Date().toISOString(),
    layout: {
      width: OUT_W,
      height: OUT_H,
      skylineCrop: SKYLINE_CROP,
      groundRow: GROUND_ROW,
      note:
        "Black-on-transparent LA PNGs. The subject's ground line sits on `groundRow` " +
        "(= height * (1 - skylineCrop)); everything below it is a solid opaque black " +
        "foreground band, which SkylineKit crops off and the panel's skirt repeats.",
    },
    defaults: { threshold: THRESHOLD, ramp: RAMP, minBlob: MIN_BLOB, mixedSpan: MIXED_SPAN },
    skippedDuplicates: SKIPPED_DUPLICATES,
    // The four originals, on the same scale, as the reference the scene's
    // top-trim was chosen against.
    legacy: legacy,
    outputs: entries.map((e) => {
      const { file, ...rest } = e;
      return rest;
    }),
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  await contactSheet(entries, path.join(OUT_DIR, "contact-sheet.png"));

  // --- the report the brief asks for ---------------------------------
  console.log(`\n${entries.length} files written to assets/skyline/`);
  console.log(`\nMANUAL cutRow (${manual.length} of ${JOBS.length}):`);
  for (const m of manual) {
    console.log(
      `  ${m.src.padEnd(16)} picked ${String(m.cutRow).padEnd(4)} ` +
        `(auto guessed ${m.guess}${m.ranOff ? ", ran off the bottom — dark water" : ""})`
    );
  }
  console.log(`\nBoats-only MIXED (city not separable), ${mixed.length}:`);
  if (!mixed.length) console.log("  none");
  for (const m of mixed) {
    console.log(`  ${m.src} (${m.name}) — widest component spans ${(m.widest * 100).toFixed(1)}% of the width`);
  }
  // The scene cannot fetch this manifest at build time, so it carries a copy
  // of these two numbers per picture. Printed ready to paste into
  // js/environment.js's SKYLINE_METRICS so the two can never drift silently.
  console.log("\nSKYLINE_METRICS (paste into js/environment.js):");
  const row = (src, m) =>
    `  "${src}": { spire: ${m.spire.toFixed(3)}, roof: ${m.roof.toFixed(3)} },`;
  legacy.forEach((m) => console.log(row(m.source, m)));
  entries.forEach((e) => console.log(row("assets/skyline/" + e.name, e)));

  console.log("\ncontact sheet: assets/skyline/contact-sheet.png");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
