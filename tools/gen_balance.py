#!/usr/bin/env python3
"""Generate balance.data.js from data/balance.json.

data/balance.json is the single source of truth for difficulty & economy
numbers. The Python balance sim reads it directly, but the browser game cannot
fetch() a local JSON file when index.html is opened via file:// (double-click).
So we mirror the JSON into a tiny JS file the game loads with a <script> tag.

Run this after editing data/balance.json:

    python3 tools/gen_balance.py

The generated balance.data.js is committed and MUST stay in sync with the JSON.
Never edit balance.data.js by hand. A CI check can diff a fresh regeneration
against the committed file to enforce this.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "balance.json"
OUT = ROOT / "balance.data.js"

BANNER = (
    "// AUTO-GENERATED from data/balance.json by tools/gen_balance.py.\n"
    "// Do NOT edit by hand — edit data/balance.json and re-run the generator.\n"
)


def main() -> None:
    data = json.loads(SRC.read_text())
    body = json.dumps(data, indent=2)
    OUT.write_text(f"{BANNER}window.BALANCE = {body};\n")
    print(f"Wrote {OUT.relative_to(ROOT)} from {SRC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
