#!/usr/bin/env bash
# ============================================================================
# resize-lottery.sh — build downscaled derivatives of the Zone B image pool.
#
# Reads every image in a SOURCE folder (default: lottery/) and writes a
# downscaled derivative of each into a SEPARATE sibling OUTPUT folder
# (default: lottery-512/), preserving aspect ratio (no squashing). Emits a
# manifest.json listing the derivative filenames, capped at the first N
# (default: 100) in natural (numeric-aware) order.
#
# The originals in the source folder are NEVER modified.
#
# Re-runnable unchanged: safe to run again when final assets land. A derivative
# is regenerated only when it is missing or older than its source, so a repeat
# run over unchanged inputs is a cheap no-op. Nothing about the file list is
# hardcoded — drop more images in and re-run.
#
# Requirements: bash + ImageMagick 7 (`magick`). On Windows run via git-bash.
#
# Usage:
#   tools/resize-lottery.sh                 # defaults
#   SRC=lottery OUT=lottery-512 W=512 H=384 CAP=100 tools/resize-lottery.sh
# ============================================================================
set -euo pipefail

# --- Config (override via environment variables) ---------------------------
SRC="${SRC:-lottery}"          # source folder of full-res originals
OUT="${OUT:-lottery-512}"      # sibling output folder for derivatives
W="${W:-512}"                  # derivative box width  (px)
H="${H:-384}"                  # derivative box height (px)  -> 512x384 = 4:3
CAP="${CAP:-100}"              # max derivatives to emit into the manifest
MANIFEST="${MANIFEST:-$OUT/manifest.json}"

# Resolve paths relative to the repo root (this script lives in tools/).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if ! command -v magick >/dev/null 2>&1; then
  echo "ERROR: ImageMagick 'magick' not found on PATH." >&2
  exit 1
fi
if [ ! -d "$SRC" ]; then
  echo "ERROR: source folder '$SRC' not found (run from repo root)." >&2
  exit 1
fi

mkdir -p "$OUT"

# --- Collect source images (not hardcoded), natural-sorted -----------------
# Case-insensitive over common still formats. `sort -V` gives numeric-aware
# order so "(2)" precedes "(10)" — the wall reads 1..100, not lexicographically.
mapfile -t ALL < <(
  find "$SRC" -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
    -printf '%f\n' | sort -V
)

total_found="${#ALL[@]}"
echo "Found $total_found source image(s) in '$SRC/'."

# --- Process up to CAP, preserving aspect ratio ----------------------------
names=()          # derivative filenames that go into the manifest
made=0            # newly (re)encoded this run
skipped=0         # already up-to-date, left as-is
n=0
for f in "${ALL[@]}"; do
  if [ "$n" -ge "$CAP" ]; then break; fi
  n=$((n + 1))
  src="$SRC/$f"
  dst="$OUT/$f"                       # same basename -> stable 1:1 mapping
  names+=("$f")

  if [ -f "$dst" ] && [ "$dst" -nt "$src" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # -resize WxH (no '!' ) fits INSIDE the box preserving aspect: a 4:3 source
  # becomes 512x384; a slightly-off ratio lands at e.g. 512x383 — never squashed.
  # -auto-orient respects EXIF rotation; -strip drops metadata for smaller files.
  magick "$src" -auto-orient -strip -resize "${W}x${H}" "$dst"
  made=$((made + 1))
done

emitted="${#names[@]}"

# --- Emit manifest.json (array of derivative filenames) --------------------
{
  echo "["
  for i in "${!names[@]}"; do
    sep=","
    if [ "$i" -eq $((emitted - 1)) ]; then sep=""; fi
    # JSON-escape backslashes and double-quotes in filenames.
    esc="${names[$i]//\\/\\\\}"
    esc="${esc//\"/\\\"}"
    printf '  "%s"%s\n' "$esc" "$sep"
  done
  echo "]"
} > "$MANIFEST"

# --- Report -----------------------------------------------------------------
echo "Output folder : $ROOT/$OUT"
echo "Derivatives   : $emitted in manifest ($made re-encoded, $skipped up-to-date)"
echo "Manifest      : $ROOT/$MANIFEST"
if [ "$total_found" -lt "$CAP" ]; then
  echo "NOTE: only $total_found source image(s) available (< cap of $CAP); processed what exists."
fi
