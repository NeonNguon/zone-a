#!/usr/bin/env bash
# ============================================================================
# resize-lottery.sh — build downscaled derivatives of the Zone B image pool.
#
# Reads every image in a SOURCE folder (default: web4map/) and writes a
# downscaled derivative of each into a SEPARATE sibling OUTPUT folder
# (default: web4map-512/), at EXACTLY WxH (512x384 = 4:3) by scaling to fill
# then centre-cropping (aspect preserved, never squashed) so tiles display
# undistorted on the wall's 4:3 planes. Derivatives KEEP THE ORIGINAL FILENAME
# exactly (only the folder + pixel size change — the filename carries the
# ticket title used later in focus mode); the full-frame originals stay put.
#
# Emits manifest.json as an ARRAY OF OBJECTS, one per image:
#     { "file": "112233x.jpg", "title": "Ticket 112233" }
# The title is derived from the filename: the leading 6 digits of an
# NNNNNNx.jpg name, prefixed with "Ticket ". A filename that does NOT match
# that pattern is SKIPPED with a warning naming it (no derivative, no manifest
# entry) — it never errors the whole run or emits a garbage title.
#
# Capped at the first CAP (default 100) matching images, natural-sorted.
# The originals in the source folder are NEVER modified.
#
# Re-runnable unchanged: a derivative is regenerated only when missing or older
# than its source, so a repeat run over unchanged inputs is a cheap no-op.
# Nothing about the file list is hardcoded — drop more images in and re-run.
#
# Requirements: bash + ImageMagick 7 (`magick`). On Windows run via git-bash.
#
# Usage:
#   tools/resize-lottery.sh                     # defaults (web4map -> web4map-512)
#   SRC=web4map OUT=web4map-512 W=512 H=384 CAP=100 tools/resize-lottery.sh
# ============================================================================
set -euo pipefail
shopt -s nocasematch   # tolerate .JPG/.JPEG case in the pattern check

# --- Config (override via environment variables) ---------------------------
SRC="${SRC:-web4map}"          # source folder of full-res originals
OUT="${OUT:-web4map-512}"      # sibling output folder for derivatives
W="${W:-512}"                  # derivative box width  (px)
H="${H:-384}"                  # derivative box height (px)  -> 512x384 box (4:3)
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
mapfile -t ALL < <(
  find "$SRC" -maxdepth 1 -type f \
    \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) \
    -printf '%f\n' | sort -V
)

total_found="${#ALL[@]}"
echo "Found $total_found source image(s) in '$SRC/'."

# --- Process up to CAP matching images, preserving aspect ratio ------------
files=()          # derivative filenames (kept identical to the source names)
titles=()         # matching "Ticket NNNNNN" per file
bad=()            # filenames that failed the NNNNNNx.jpg pattern (skipped)
made=0            # newly (re)encoded this run
uptodate=0        # already up-to-date, left as-is
emitted=0
for f in "${ALL[@]}"; do
  if [ "$emitted" -ge "$CAP" ]; then break; fi

  # Title rule: leading 6 digits of an NNNNNNx.jpg name -> "Ticket NNNNNN".
  # Anything else is skipped with a warning (no derivative, no manifest entry).
  if [[ "$f" =~ ^([0-9]{6})x\.jpe?g$ ]]; then
    title="Ticket ${BASH_REMATCH[1]}"
  else
    echo "WARNING: skipping '$f' — does not match NNNNNNx.jpg" >&2
    bad+=("$f")
    continue
  fi

  files+=("$f")
  titles+=("$title")
  emitted=$((emitted + 1))

  src="$SRC/$f"
  dst="$OUT/$f"                       # KEEP the original filename exactly
  if [ -f "$dst" ] && [ "$dst" -nt "$src" ]; then
    uptodate=$((uptodate + 1))
    continue
  fi

  # Derivative is EXACTLY WxH (512x384 = 4:3) so it displays undistorted on the
  # wall's 4:3 tiles. `-resize WxH^` scales to FILL the box preserving aspect
  # (no squash), then `-extent` centre-crops to the exact box: a 3:2 source
  # (600x400) fills then loses a thin strip off the sides — never stretched.
  # The full-frame original is kept in the source folder for focus mode.
  # -auto-orient respects EXIF rotation; -strip drops metadata.
  magick "$src" -auto-orient -strip \
    -resize "${W}x${H}^" -gravity center -extent "${W}x${H}" "$dst"
  made=$((made + 1))
done

# --- Emit manifest.json (array of { file, title } objects) -----------------
{
  echo "["
  for i in "${!files[@]}"; do
    sep=","
    if [ "$i" -eq $((emitted - 1)) ]; then sep=""; fi
    # JSON-escape backslashes and double-quotes (defensive; these names are safe).
    ef="${files[$i]//\\/\\\\}"; ef="${ef//\"/\\\"}"
    et="${titles[$i]//\\/\\\\}"; et="${et//\"/\\\"}"
    printf '  { "file": "%s", "title": "%s" }%s\n' "$ef" "$et" "$sep"
  done
  echo "]"
} > "$MANIFEST"

# --- Report -----------------------------------------------------------------
echo "Output folder : $ROOT/$OUT"
echo "Derivatives   : $emitted in manifest ($made re-encoded, $uptodate up-to-date)"
echo "Manifest      : $ROOT/$MANIFEST"
if [ "${#bad[@]}" -gt 0 ]; then
  echo "Skipped (bad pattern): ${#bad[@]} -> ${bad[*]}"
fi
if [ "$total_found" -lt "$CAP" ]; then
  echo "NOTE: only $total_found source image(s) available (< cap of $CAP); processed what exists."
fi
