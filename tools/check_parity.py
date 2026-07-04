#!/usr/bin/env python3
"""Parity check: the Python sim's make_wave() must EXACTLY reproduce the real
engine's makeWave().

Why this exists: balance_sim.py re-implements the wave formula, and the two
languages round differently — Python's round() is banker's rounding
(round(2.5) == 2) while JS Math.round(2.5) == 3 — so the sim and the game can
silently disagree about a wave's hp or composition whenever a value lands on
exactly .5. This check turns that silent divergence into a red CI run.

Usage (CI runs exactly this):
    node tools/sim.mjs --dump-waves /tmp/waves.json
    python3 tools/check_parity.py /tmp/waves.json
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from balance_sim import load_config, make_wave  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: check_parity.py <waves.json from `node tools/sim.mjs --dump-waves`>")
    js_waves = json.loads(pathlib.Path(sys.argv[1]).read_text())
    cfg = load_config(str(ROOT / "data" / "balance.json"))

    mismatches = []
    for n, js in enumerate(js_waves):
        py = make_wave(n, cfg)
        # Normalize: JS comp is [[kind, count], ...]; Python the same via lists.
        py_cmp = {"hp": py["hp"], "speed": py["speed"], "interval": py["interval"],
                  "comp": [list(c) for c in py["comp"]]}
        js_cmp = {"hp": js["hp"], "speed": js["speed"], "interval": js["interval"],
                  "comp": [list(c) for c in js["comp"]]}
        if py_cmp != js_cmp:
            mismatches.append((n, js_cmp, py_cmp))

    if mismatches:
        print(f"PARITY FAILED: {len(mismatches)} wave(s) differ between the game and the Python sim")
        for n, js, py in mismatches[:5]:
            print(f"  wave {n}:")
            print(f"    game   : {js}")
            print(f"    python : {py}")
        print("Likely cause: rounding semantics (JS Math.round vs Python banker's round)"
              " or a formula edit that wasn't mirrored. Fix balance_sim.py to match the game.")
        raise SystemExit(1)
    print(f"PARITY OK: all {len(js_waves)} waves identical between the real engine and balance_sim.py")


if __name__ == "__main__":
    main()
