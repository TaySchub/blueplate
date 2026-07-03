#!/usr/bin/env python3
"""
Deckbound balance simulator — deterministic difficulty gauge.

Purpose in the agent system:
  The Designer edits difficulty/economy numbers in data/balance.json. Before a
  change is accepted, THIS script runs headless, plays N games with a scripted
  reference strategy, and reports win-rate + waves survived. That win-rate is
  ground-truth signal about difficulty — better than asking a model "is this
  balanced?".

What it models (and what it doesn't):
  - It reads the SAME data/balance.json the game reads (via balance.data.js), so
    the sim and game can never disagree about tunables: tower stats, enemy
    types, the 10-wave table, and the economy.
  - It simulates the real combat in the game's units — pixels and seconds — on a
    1-D lane: enemies spawn per wave.interval, march at wave.speed * speedMul,
    towers target the frontmost enemy in range and fire every cooldown for
    `damage` (splash hits all within splash px; slow reduces speed). Kills pay
    the enemy's reward; enemies reaching the lane's end cost a life.
  - The MAP (lane length, tower slot positions) is a sim-side abstraction of the
    real fixed map — that geometry lives in main.js, not balance.json. The sim
    is a directional difficulty gauge for a fixed reference strategy, not a
    pixel-perfect replica.
  - The reference strategy builds its board over the early waves, then spends
    spare currency upgrading towers (cheapest upgrade first, up to level 3),
    mirroring how the game actually plays. Tower stats AND upgrade deltas ('up')
    come from balance.json.

Run from the repo root:
  python3 tools/balance_sim.py                 # reads data/balance.json
  python3 tools/balance_sim.py --sims 500      # more sims = tighter estimate
  python3 tools/balance_sim.py --config path/to/other.json
"""

from __future__ import annotations
import argparse
import json
import random
from statistics import median

TARGET_WIN_RATE = (0.45, 0.60)

# --- Sim-side map abstraction (the real fixed map geometry lives in main.js) ---
SIM_TRACK = 1350.0          # lane length in px (approximates the real path)
DT = 1.0 / 30.0             # simulation timestep in seconds
# Six tower slots spread along the lane, mirroring the game's 6 slots.
SLOT_POS = [200.0, 400.0, 600.0, 800.0, 1000.0, 1200.0]

# Reference build strategies (which tower goes in each slot, in build order).
# Only the base-unlocked towers (no sniper, which needs an Essence unlock).
# "reference board" is calibrated so the shipped, balanced config reads ~mid-band
# — it's the gauge the Designer watches. "over-built" shows an over-invested full
# board trivializing the run (TOO EASY), demonstrating the verdict.
STRATEGIES = {
    "reference board":  ["arrow", "cannon", "frost", "arrow"],
    "over-built board": ["arrow", "cannon", "arrow", "frost", "zap", "arrow"],
}


def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = json.load(f)
    cfg.pop("_note", None)
    for key in ("economy", "enemyTypes", "towers", "waves"):
        if key not in cfg:
            raise SystemExit(f"balance config missing '{key}': {path}")
    return cfg


def build_spawn_queue(wave: dict, rng: random.Random) -> list[str]:
    q = []
    for kind, count in wave["comp"]:
        q.extend([kind] * count)
    rng.shuffle(q)
    return q


def simulate_wave(towers: list[dict], wave: dict, cfg: dict, rng: random.Random) -> tuple[int, int]:
    """Play one wave on the lane. Return (leaked, currency_earned)."""
    enemy_types = cfg["enemyTypes"]
    queue = build_spawn_queue(wave, rng)
    enemies: list[dict] = []
    spawn_timer = 0.0
    leaked = 0
    earned = 0
    for t in towers:
        t["cd"] = 0.0

    t_elapsed = 0.0
    max_time = 120.0  # safety bound in seconds
    while (queue or enemies) and t_elapsed < max_time:
        t_elapsed += DT

        # spawn
        spawn_timer -= DT
        if queue and spawn_timer <= 0:
            spawn_timer = wave["interval"]
            kind = queue.pop(0)
            et = enemy_types[kind]
            # small per-enemy hp jitter so runs vary — turns win-rate into a
            # smooth gauge instead of a 0%/100% cliff.
            hp = wave["hp"] * et["hpMul"] * rng.uniform(0.85, 1.15)
            enemies.append({
                "kind": kind, "pos": 0.0, "hp": hp,
                "speed": wave["speed"] * et["speedMul"],
                "reward": et["reward"], "slow_timer": 0.0, "slow_factor": 1.0,
            })

        # towers fire
        for t in towers:
            t["cd"] -= DT
            if t["cd"] > 0:
                continue
            in_range = [e for e in enemies if abs(e["pos"] - t["pos"]) <= t["range"]]
            if not in_range:
                continue
            target = max(in_range, key=lambda e: e["pos"])  # frontmost
            t["cd"] = t["cooldown"]
            if t["behavior"] == "splash":
                for e in enemies:
                    if abs(e["pos"] - target["pos"]) <= t.get("splash", 0):
                        e["hp"] -= t["damage"]
            else:
                target["hp"] -= t["damage"]
                if t["behavior"] == "slow":
                    target["slow_timer"] = t.get("slowDur", 0.0)
                    target["slow_factor"] = min(target["slow_factor"], t.get("slowFactor", 1.0))

        # resolve deaths
        survivors = []
        for e in enemies:
            if e["hp"] <= 0:
                earned += e["reward"]
            else:
                survivors.append(e)
        enemies = survivors

        # move
        still_on = []
        for e in enemies:
            speed = e["speed"]
            if e["slow_timer"] > 0:
                speed *= e["slow_factor"]
                e["slow_timer"] -= DT
                if e["slow_timer"] <= 0:
                    e["slow_factor"] = 1.0
            e["pos"] += speed * DT
            if e["pos"] >= SIM_TRACK:
                leaked += 1
            else:
                still_on.append(e)
        enemies = still_on

    leaked += len(enemies)  # anything left at the time bound counts as leaked
    return leaked, earned


MAX_LEVEL = 3  # matches the game's tower maxLevel


def make_tower(kind: str, pos: float, cfg: dict) -> dict:
    spec = cfg["towers"][kind]
    return {"kind": kind, "pos": pos, "cd": 0.0, "level": 1,
            "range": spec["range"], "damage": spec["damage"],
            "cooldown": spec["cooldown"], "behavior": spec["behavior"],
            "splash": spec.get("splash", 0), "slowDur": spec.get("slowDur", 0.0),
            "slowFactor": spec.get("slowFactor", 1.0), "up": spec.get("up", {})}


def apply_upgrade(t: dict) -> None:
    """Apply one upgrade level's deltas — mirrors main.js tryUpgrade()."""
    up = t["up"]
    t["level"] += 1
    if "damage" in up:
        t["damage"] += up["damage"]
    if "range" in up:
        t["range"] += up["range"]
    if "cooldownMul" in up:
        t["cooldown"] *= up["cooldownMul"]
    if "splash" in up:
        t["splash"] += up["splash"]
    if "slowFactorAdd" in up:
        t["slowFactor"] = max(0.2, t["slowFactor"] + up["slowFactorAdd"])


def buy_upgrades(towers: list[dict], currency: float, upgrade_cost: list) -> float:
    """Spend spare currency upgrading towers, cheapest upgrade first."""
    while True:
        candidates = [t for t in towers if t["level"] < MAX_LEVEL]
        if not candidates:
            break
        t = min(candidates, key=lambda t: upgrade_cost[t["level"]])
        cost = upgrade_cost[t["level"]]
        if currency < cost:
            break
        currency -= cost
        apply_upgrade(t)
    return currency


def play_game(build: list[str], cfg: dict, seed: int) -> tuple[bool, int]:
    """Play a full run with an economy-limited build-only strategy."""
    rng = random.Random(seed)
    econ = cfg["economy"]
    currency = econ["startCurrency"]
    lives = econ["startLives"]
    towers: list[dict] = []
    next_slot = 0

    for wi, wave in enumerate(cfg["waves"]):
        # prep: fill the next slots we can afford, in build order
        while next_slot < len(SLOT_POS) and next_slot < len(build):
            kind = build[next_slot]
            cost = cfg["towers"][kind]["cost"]
            if currency < cost:
                break
            currency -= cost
            towers.append(make_tower(kind, SLOT_POS[next_slot], cfg))
            next_slot += 1
        # spend spare currency upgrading existing towers
        currency = buy_upgrades(towers, currency, econ["upgradeCost"])

        leaked, earned = simulate_wave(towers, wave, cfg, rng)
        currency += earned + econ["earnPerWave"]
        lives -= leaked
        if lives <= 0:
            return False, wi
    return True, len(cfg["waves"])


def evaluate(build: list[str], cfg: dict, sims: int, base_seed: int) -> dict:
    wins = 0
    survived = []
    for i in range(sims):
        won, w = play_game(build, cfg, seed=base_seed + i)
        wins += 1 if won else 0
        survived.append(w)
    return {"win_rate": wins / sims, "median_waves": median(survived), "sims": sims}


def verdict(win_rate: float, band: tuple) -> str:
    lo, hi = band
    if win_rate > hi:
        return "TOO EASY  -> nerf the player's option / buff enemies"
    if win_rate < lo:
        return "TOO HARD  -> buff the player's option / ease enemies"
    return "BALANCED  -> within target band"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sims", type=int, default=400)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--config", default="data/balance.json")
    args = ap.parse_args()
    cfg = load_config(args.config)
    band = tuple(cfg.get("target_win_rate", TARGET_WIN_RATE))

    print(f"Config: {args.config}")
    print(f"Target win-rate band: {band[0]:.0%}-{band[1]:.0%}")
    print(f"Sims per strategy: {args.sims}\n")

    for name, build in STRATEGIES.items():
        r = evaluate(build, cfg, args.sims, args.seed)
        print(f"{name}  [{', '.join(build)}]")
        print(f"  win rate     : {r['win_rate']:.1%}")
        print(f"  median waves : {r['median_waves']}")
        print(f"  verdict      : {verdict(r['win_rate'], band)}\n")


if __name__ == "__main__":
    main()
