"""Measure a stacked guide-avatar video's matte and write its sidecar JSON.

    python tools/measure-avatar.py avatar/avatar-b-stacked.mp4 [more.mp4 ...]

A stacked avatar video (see js/guide-avatar.js) is colour on top, matte below,
both halves the same size. Every avatar is framed differently — where the soles
are, how much of the frame the person fills, how far off centre they stand —
and the component needs those numbers to stand the figure ON the floor at its
real height. This reads EVERY frame's matte (a person shifts their weight; the
lowest foot over the whole loop is the one that must touch the floor) and
writes, next to the video, <name>.json:

    { "frame": {"width": W, "height": H},   one half, in pixels
      "feet": row, "head": row,             lowest / highest opaque row
      "left": col, "right": col,            outermost opaque columns
      "frames": n }

all as extremes over the loop, at matte > 50%. guide-avatar fetches it
automatically (matte: auto) — so a new avatar is: export the stacked MP4, run
this once, point a guide-avatar at it. Needs ffmpeg on the PATH and numpy.
"""

import json
import os
import re
import subprocess
import sys

import numpy as np


def measure(path):
    # ffmpeg prints the stream size on stderr; no ffprobe needed.
    info = subprocess.run(["ffmpeg", "-hide_banner", "-i", path],
                          capture_output=True, text=True).stderr
    m = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", info)
    if not m:
        raise SystemExit(f"{path}: no video stream found")
    w, full_h = int(m.group(1)), int(m.group(2))
    if full_h % 2:
        raise SystemExit(f"{path}: height {full_h} is odd; not a stacked video")
    h = full_h // 2

    # The matte half only, as 8-bit grey, every frame, straight down a pipe.
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path,
         "-vf", f"crop={w}:{h}:0:{h},format=gray", "-f", "rawvideo", "-"],
        capture_output=True, check=True).stdout
    frames = np.frombuffer(raw, np.uint8).reshape(-1, h, w)

    solid = frames > 127
    rows = np.where(solid.any(axis=(0, 2)))[0]
    cols = np.where(solid.any(axis=(0, 1)))[0]
    if not len(rows):
        raise SystemExit(f"{path}: the matte is empty")
    return {
        "frame": {"width": w, "height": h},
        "feet": int(rows.max()),
        "head": int(rows.min()),
        "left": int(cols.min()),
        "right": int(cols.max()),
        "frames": int(len(frames)),
    }


def main(paths):
    if not paths:
        raise SystemExit(__doc__)
    for path in paths:
        result = measure(path)
        out = os.path.splitext(path)[0] + ".json"
        with open(out, "w", encoding="utf-8", newline="\n") as f:
            json.dump(result, f, indent=2)
            f.write("\n")
        h = result["frame"]["height"]
        print(f"{out}: feet row {result['feet']}, head row {result['head']} "
              f"of {h} (fills {(result['feet'] + 1 - result['head']) / h:.1%}), "
              f"cols {result['left']}-{result['right']}, "
              f"{result['frames']} frames")


if __name__ == "__main__":
    main(sys.argv[1:])
