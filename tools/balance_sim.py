#!/usr/bin/env python3
"""
Deckbound balance simulator — deterministic verification harness.

Purpose in the agent system:
  The Designer edits tower/enemy/wave numbers in data/balance.json. Before a
  difficulty change is accepted, THIS script runs headless, plays N games with
  scripted strategies, and reports win-rate + waves survived. That win-rate is
  ground-truth signal about difficulty — far better than asking a model
  "is this balanced?".

Design notes:
  - Pure Python, no dependencies, no network. Runs anywhere.
  - Deterministic per seed; aggregated over many seeds for a stable rate.
  - Reads data/balance.json — the SAME file the game reads — so the sim and the
    game can never disagree about the numbers. Falls back to DEFAULT_CONFIG if
    the file is missing (e.g. before the Core issues create it).
  - The tower list here (arrow/cannon/frost) is a simplified stand-in. As real
    cards land in the game, mirror each card's key stats into balance.json so the
    sim models what players actually face.

Run from the repo root:
  python3 tools/balance_sim.py                 # reads data/balance.json
  python3 tools/balance_sim.py --sims 500      # more sims = tighter estimate
  python3 tools/balance_sim.py --config path/to/other.json
"""

from __future__ import annotations
import argparse
import json
import random
from dataclasses import dataclass, field
from statistics import median

# --- Target difficulty band -------------------------------------------------
# A feature is "balanced" if the scripted strategy wins within this win-rate
# band. Too high = trivial; too low = unfair. Tune to your design intent.
TARGET_WIN_RATE = (0.45, 0.60)

# --- Config (stand-in for the game's real config files) ---------------------
DEFAULT_CONFIG = {
    "track_length": 40,          # steps from spawn to base
    "starting_lives": 38,
    "waves": 12,
    "base_enemies_per_wave": 4,  # wave N spawns (base + N) enemies
    "enemy_hp_base": 7,
    "enemy_hp_growth": 1.14,     # hp *= growth each wave
    "enemy_speed": 1.0,          # steps per tick
    "towers": {
        # damage per shot, range (steps), cooldown (ticks between shots)
        "arrow":  {"damage": 9,  "range": 6,  "cooldown": 1},
        "cannon": {"damage": 27, "range": 4,  "cooldown": 3},
        # Frost deals no damage but slows enemies in range. This is the knob
        # the Frost-card feature adds — and the one most likely to unbalance.
        "frost":  {"damage": 0,  "range": 5,  "cooldown": 1, "slow": 0.5},
    },
}


def load_config(path: str = "data/balance.json") -> dict:
    """Read the shared balance file. Fall back to DEFAULT_CONFIG if absent."""
    try:
        with open(path) as f:
            cfg = json.load(f)
        # let the file also carry the target band; strip meta keys
        cfg.pop("_note", None)
        return cfg
    except (FileNotFoundError, json.JSONDecodeError):
        return DEFAULT_CONFIG


@dataclass
class Enemy:
    hp: float
    pos: float = 0.0
    slowed: bool = False


@dataclass
class Tower:
    kind: str
    pos: float
    cooldown_left: int = 0
    spec: dict = field(default_factory=dict)


def build_towers(strategy: list[tuple[str, float]], cfg: dict) -> list[Tower]:
    return [Tower(kind=k, pos=p, spec=cfg["towers"][k]) for k, p in strategy]


def simulate_wave(towers: list[Tower], wave: int, cfg: dict, rng: random.Random) -> int:
    """Return number of enemies that leaked (reached the base)."""
    hp = cfg["enemy_hp_base"] * (cfg["enemy_hp_growth"] ** wave)
    n = cfg["base_enemies_per_wave"] + wave  # waves get bigger
    # small spawn jitter so seeds actually differ
    enemies = [Enemy(hp=hp * rng.uniform(0.9, 1.1)) for _ in range(n)]
    for t in towers:
        t.cooldown_left = 0

    leaked = 0
    ticks = 0
    max_ticks = cfg["track_length"] * 6  # safety bound
    while enemies and ticks < max_ticks:
        ticks += 1
        # reset slow flags each tick; frost towers re-apply
        for e in enemies:
            e.slowed = False

        # towers act
        for t in towers:
            in_range = [e for e in enemies if abs(e.pos - t.pos) <= t.spec["range"]]
            if not in_range:
                continue
            if t.kind == "frost":
                for e in in_range:
                    e.slowed = True
                continue
            if t.cooldown_left > 0:
                t.cooldown_left -= 1
                continue
            # fire at the frontmost enemy in range
            target = max(in_range, key=lambda e: e.pos)
            target.hp -= t.spec["damage"]
            t.cooldown_left = t.spec["cooldown"]

        # remove dead
        enemies = [e for e in enemies if e.hp > 0]

        # move survivors
        base = cfg["track_length"]
        speed = cfg["enemy_speed"]
        still_alive = []
        for e in enemies:
            step = speed * (0.5 if e.slowed else 1.0)
            e.pos += step
            if e.pos >= base:
                leaked += 1
            else:
                still_alive.append(e)
        enemies = still_alive
    # anything left when we hit the tick bound counts as leaked
    return leaked + len(enemies)


def play_game(strategy: list[tuple[str, float]], cfg: dict, seed: int) -> tuple[bool, int]:
    """Return (won, waves_survived)."""
    rng = random.Random(seed)
    towers = build_towers(strategy, cfg)
    lives = cfg["starting_lives"]
    for wave in range(cfg["waves"]):
        leaked = simulate_wave(towers, wave, cfg, rng)
        lives -= leaked
        if lives <= 0:
            return (False, wave)
    return (True, cfg["waves"])


def evaluate(strategy: list[tuple[str, float]], cfg: dict, sims: int, base_seed: int):
    wins = 0
    survived = []
    for i in range(sims):
        won, w = play_game(strategy, cfg, seed=base_seed + i)
        wins += 1 if won else 0
        survived.append(w)
    return {
        "win_rate": wins / sims,
        "median_waves": median(survived),
        "sims": sims,
    }


def verdict(win_rate: float, band: tuple = TARGET_WIN_RATE) -> str:
    lo, hi = band
    if win_rate > hi:
        return "TOO EASY  -> nerf the player's option / buff enemies"
    if win_rate < lo:
        return "TOO HARD  -> buff the player's option / ease enemies"
    return "BALANCED  -> within target band"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--config", default="data/balance.json")
    args = ap.parse_args()
    cfg = load_config(args.config)

    band = tuple(cfg.get("target_win_rate", TARGET_WIN_RATE))

    # Two scripted strategies: this is the exact Frost-card verification loop.
    baseline = [("arrow", 8), ("cannon", 16), ("arrow", 28)]
    with_frost = baseline + [("frost", 20)]

    print(f"Config: {args.config}")
    print(f"Target win-rate band: {band[0]:.0%}-{band[1]:.0%}")
    print(f"Sims per strategy: {args.sims}\n")

    for name, strat in [("baseline (damage only)", baseline),
                        ("with Frost card", with_frost)]:
        r = evaluate(strat, cfg, args.sims, args.seed)
        print(f"{name}")
        print(f"  win rate     : {r['win_rate']:.1%}")
        print(f"  median waves : {r['median_waves']}")
        print(f"  verdict      : {verdict(r['win_rate'], band)}\n")


if __name__ == "__main__":
    main()
