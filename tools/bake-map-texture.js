// ================================================================
// bake-map-texture.js — ONE-TIME offline bake of the Zone B floor map.
//
// Reads the "100 locations" data (100locations/locations.json), computes the
// lat/long bounding box of all points (+8% padding per side), fetches CARTO
// Positron (light_all) raster tiles covering it, stitches + crops them exactly
// to the padded bbox in Web Mercator space, stamps the required attribution
// into the bottom-right corner, and writes:
//
//   assets/zone-b-map-saigon.jpg   — the floor texture (JPEG q85)
//   assets/zone-b-map-saigon.json  — sidecar with the EXACT bbox the texture
//                                    covers (Mercator + lat/long), dimensions,
//                                    AND the point list itself. The runtime
//                                    (js/zone-b-map.js) reads ONLY this file:
//                                    texture corners and sphere positions
//                                    share one baked source of truth. (The
//                                    points are embedded because 100locations/
//                                    is a nested git repo the exhibition repo
//                                    cannot track — the sidecar IS the
//                                    committed copy of the data.)
//
// HOW TO RUN (one-time; re-runs are cheap — tiles cache in tools/tile-cache/):
//   cd tools
//   npm install          # pulls sharp (the only dependency)
//   node bake-map-texture.js
//
// Tiles are fetched SEQUENTIALLY with a 150 ms delay and a descriptive
// User-Agent, per CARTO/OSM tile-usage etiquette. tools/tile-cache/ is
// gitignored; only the baked JPEG + sidecar are committed.
// ================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// --- config ------------------------------------------------------------
const LOCATIONS = path.join(__dirname, "..", "100locations", "locations.json");
const OUT_JPG = path.join(__dirname, "..", "assets", "zone-b-map-saigon.jpg");
const OUT_JSON = path.join(__dirname, "..", "assets", "zone-b-map-saigon.json");
const CACHE_DIR = path.join(__dirname, "tile-cache");
const TILE_URL = (z, x, y) =>
  `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
const USER_AGENT =
  "vr-exhibition-map-bake/1.0 (one-time offline bake of a static exhibition texture; hausverbot@gmail.com)";
const PAD_FRAC = 0.08; // bbox padding per side
const TARGET_PX = 4096; // aim for ~this many pixels across the bbox WIDTH
const TILE_PX = 256;
const DELAY_MS = 150;
const JPEG_QUALITY = 85;
const ATTRIBUTION = "© OpenStreetMap contributors © CARTO";

// --- Web Mercator helpers (normalized 0..1 across the world) ------------
// x: 0 at lng -180 -> 1 at +180. y: 0 at the TOP (lat ~85.05) -> 1 at the
// bottom, matching XYZ tile numbering, so tile math falls out directly.
function mercX(lng) {
  return (lng + 180) / 360;
}
function mercY(lat) {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
function invMercLng(x) {
  return x * 360 - 180;
}
function invMercLat(y) {
  const n = Math.PI * (1 - 2 * y);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(z, x, y) {
  const cached = path.join(CACHE_DIR, `${z}-${x}-${y}.png`);
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  const url = TILE_URL(z, x, y);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`tile ${z}/${x}/${y}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cached, buf);
  await sleep(DELAY_MS); // be polite: sequential + spaced (cache hits skip this)
  return buf;
}

async function main() {
  // 1. Points -> padded bbox in lat/long.
  const points = JSON.parse(fs.readFileSync(LOCATIONS, "utf8"));
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  // Pad in MERCATOR space (what the texture is linear in), 8% per side.
  let x0 = mercX(west), x1 = mercX(east);
  let y0 = mercY(north), y1 = mercY(south); // y0 < y1 (y grows downward)
  const padX = (x1 - x0) * PAD_FRAC;
  const padY = (y1 - y0) * PAD_FRAC;
  x0 -= padX; x1 += padX;
  y0 -= padY; y1 += padY;

  // 2. Zoom so the bbox width lands nearest TARGET_PX (world = 256*2^z px).
  const zoom = Math.round(Math.log2(TARGET_PX / (TILE_PX * (x1 - x0))));
  const worldPx = TILE_PX * Math.pow(2, zoom);

  // Snap the crop to whole pixels at this zoom so the sidecar bbox is EXACTLY
  // what the JPEG covers (no sub-pixel drift between texture and points).
  const px0 = Math.floor(x0 * worldPx), px1 = Math.ceil(x1 * worldPx);
  const py0 = Math.floor(y0 * worldPx), py1 = Math.ceil(y1 * worldPx);
  const outW = px1 - px0, outH = py1 - py0;
  x0 = px0 / worldPx; x1 = px1 / worldPx;
  y0 = py0 / worldPx; y1 = py1 / worldPx;

  // 3. Covering tile range.
  const tx0 = Math.floor(px0 / TILE_PX), tx1 = Math.floor((px1 - 1) / TILE_PX);
  const ty0 = Math.floor(py0 / TILE_PX), ty1 = Math.floor((py1 - 1) / TILE_PX);
  const nTiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  console.log(
    `bbox ${west.toFixed(5)}..${east.toFixed(5)} lng, ${south.toFixed(5)}..` +
      `${north.toFixed(5)} lat (+${PAD_FRAC * 100}% pad) -> zoom ${zoom}, ` +
      `${tx1 - tx0 + 1}x${ty1 - ty0 + 1} = ${nTiles} tiles, out ${outW}x${outH} px`
  );

  // 4. Fetch (sequential, cached) + stitch onto one canvas, then crop.
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const composites = [];
  let done = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const buf = await fetchTile(zoom, tx, ty);
      composites.push({
        input: buf,
        left: tx * TILE_PX - px0,
        top: ty * TILE_PX - py0,
      });
      if (++done % 25 === 0) console.log(`  ${done}/${nTiles} tiles`);
    }
  }
  // Stitch onto a canvas already sized to the crop; tiles overhanging the
  // edges are pre-trimmed (sharp rejects composites outside the canvas).
  for (const c of composites) {
    const trimL = Math.max(0, -c.left), trimT = Math.max(0, -c.top);
    const w = Math.min(TILE_PX - trimL, outW - Math.max(0, c.left));
    const h = Math.min(TILE_PX - trimT, outH - Math.max(0, c.top));
    if (trimL || trimT || w < TILE_PX || h < TILE_PX) {
      c.input = await sharp(c.input)
        .extract({ left: trimL, top: trimT, width: w, height: h })
        .png()
        .toBuffer();
      c.left = Math.max(0, c.left);
      c.top = Math.max(0, c.top);
    }
  }
  let img = sharp({
    create: { width: outW, height: outH, channels: 3, background: "#e8e8e6" },
  }).composite(composites);

  // 5. Attribution, baked into the texture itself: small but legible dark
  // gray in the BOTTOM-RIGHT corner (SVG composite; a few px off the edges).
  const fontPx = Math.max(14, Math.round(outW / 160));
  const pad = Math.round(fontPx * 0.5);
  const attrSvg = Buffer.from(
    `<svg width="${outW}" height="${outH}">` +
      `<text x="${outW - pad}" y="${outH - pad}" text-anchor="end" ` +
      `font-family="Arial, Helvetica, sans-serif" font-size="${fontPx}" ` +
      `fill="#4a4a4a">${ATTRIBUTION.replace(/&/g, "&amp;")}</text></svg>`
  );
  img = sharp(await img.png().toBuffer()).composite([
    { input: attrSvg, left: 0, top: 0 },
  ]);

  // 6. Write JPEG + sidecar (the runtime's single source of truth).
  fs.mkdirSync(path.dirname(OUT_JPG), { recursive: true });
  await img.jpeg({ quality: JPEG_QUALITY }).toFile(OUT_JPG);
  const sidecar = {
    source: "CARTO Positron (light_all) raster tiles over OpenStreetMap data",
    attribution: ATTRIBUTION,
    zoom: zoom,
    widthPx: outW,
    heightPx: outH,
    // EXACT texture coverage. mercator: normalized Web Mercator (0..1 across
    // the world; y grows DOWNWARD i.e. north = smaller y — XYZ tile scheme).
    mercator: { x0: x0, y0: y0, x1: x1, y1: y1 },
    lngLat: {
      west: invMercLng(x0),
      east: invMercLng(x1),
      north: invMercLat(y0),
      south: invMercLat(y1),
    },
    // Plane depth = width / aspect (Mercator is conformal: locally uniform
    // scale, so pixel aspect == metric aspect at this small extent).
    aspect: (x1 - x0) / (y1 - y0),
    // The dataset itself ({id, lat, lng} per entry), baked in so the runtime
    // has one committed source for both the extent and the points.
    points: points,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(sidecar, null, 2) + "\n");
  const kb = Math.round(fs.statSync(OUT_JPG).size / 1024);
  console.log(`wrote ${OUT_JPG} (${outW}x${outH}, ${kb} KB) + sidecar`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
