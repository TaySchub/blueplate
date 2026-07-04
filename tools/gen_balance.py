#!/usr/bin/env python3
"""Generate balance.data.js from data/balance.json, and cache-bust index.html.

data/balance.json is the single source of truth for difficulty & economy
numbers. The Python balance sim reads it directly, but the browser game cannot
fetch() a local JSON file when index.html is opened via file:// (double-click).
So we mirror the JSON into a tiny JS file the game loads with a <script> tag.

This script also STAMPS index.html's <script> tags with a short content hash
(src/*.js?v=... and balance.data.js?v=...). GitHub Pages serves everything with a
10-minute cache and no way to override it, so without versioned URLs a browser
can keep running old game code after a deploy (or mix a new index.html with a
stale module). The hash changes only when a file's contents change, so every
deploy gets fresh, self-consistent script URLs with zero manual version bumping.

Run this after editing data/balance.json OR any src/*.js file, before committing/deploying:

    python3 tools/gen_balance.py

The generated balance.data.js and the stamped index.html are committed. Never
edit balance.data.js by hand. A CI check can diff a fresh run against the commit
to enforce that both stay in sync.
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "balance.json"
OUT = ROOT / "balance.data.js"
INDEX = ROOT / "index.html"

BANNER = (
    "// AUTO-GENERATED from data/balance.json by tools/gen_balance.py.\n"
    "// Do NOT edit by hand — edit data/balance.json and re-run the generator.\n"
)

# The runtime <script> assets to cache-bust, in load order.
VERSIONED_ASSETS = (
    "balance.data.js",
    "src/data.js", "src/engine.js", "src/audio.js",
    "src/art.js", "src/render.js", "src/main.js",
)


def stamp_index() -> dict:
    """Rewrite index.html's <script src="X"> tags to X?v=<hash of X>."""
    html = INDEX.read_text()
    stamped = {}
    for name in VERSIONED_ASSETS:
        h = hashlib.sha1((ROOT / name).read_bytes()).hexdigest()[:8]
        stamped[name] = h
        # match src="name" or src="name?v=old" (with optional query), keep defer etc.
        html = re.sub(
            rf'src="{re.escape(name)}(?:\?v=[0-9a-f]+)?"',
            f'src="{name}?v={h}"',
            html,
        )
    INDEX.write_text(html)
    return stamped


def main() -> None:
    data = json.loads(SRC.read_text())
    body = json.dumps(data, indent=2)
    OUT.write_text(f"{BANNER}window.BALANCE = {body};\n")
    print(f"Wrote {OUT.relative_to(ROOT)} from {SRC.relative_to(ROOT)}")
    stamped = stamp_index()
    print("Stamped index.html cache-bust: " + ", ".join(f"{k}?v={v}" for k, v in stamped.items()))


if __name__ == "__main__":
    main()
